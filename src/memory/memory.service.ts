import { Injectable, Logger } from '@nestjs/common';
import { MemoryTrace, MemorySurface, StudentProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from '../kalamon/ai-provider.service';

// Nombre de tokens estimé pour une string française.
// Approximation : 1 token ≈ 3,8 caractères (français plus dense que l'anglais).
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

// Troncature à N tokens (en coupant sur les espaces pour éviter les mots coupés).
function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const maxChars = Math.floor(maxTokens * 3.8);
  return text.slice(0, maxChars).replace(/\s\S*$/, '') + '…';
}

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
  ) {}

  // ---------------------------------------------------------------------------
  // L1 — Append trace brute (appelé après chaque réponse RAG)
  // ---------------------------------------------------------------------------

  async appendTrace(params: {
    organizationId: string;
    eleveId: string;
    surface: string;
    question: string;
    reponse: string;
    skillCode?: string;
    mastered?: boolean;
    difficulty?: 'LOW' | 'MEDIUM' | 'HIGH';
  }): Promise<void> {
    await this.prisma.memoryTrace.create({
      data: {
        organizationId: params.organizationId,
        eleveId: params.eleveId,
        surface: params.surface,
        question: params.question,
        reponse: params.reponse,
        skillCode: params.skillCode ?? null,
        mastered: params.mastered ?? false,
        difficulty: params.difficulty ?? 'MEDIUM',
      },
    });

    // Déclencher la mise à jour L2 en fire-and-forget :
    // la réponse RAG ne doit pas attendre la génération du résumé.
    this.refreshSurface(params.eleveId, params.surface, params.organizationId).catch(
      (err: unknown) => this.logger.error('Memory L2 refresh error', err),
    );
  }

  // ---------------------------------------------------------------------------
  // L2 — Résumé LLM par surface (fire-and-forget depuis appendTrace)
  // ---------------------------------------------------------------------------

  async refreshSurface(
    eleveId: string,
    surface: string,
    organizationId: string,
  ): Promise<void> {
    // Récupérer les 20 dernières traces pour cet élève sur cette surface.
    const traces = await this.prisma.memoryTrace.findMany({
      where: { eleveId, surface, organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Pas assez de données : au moins 3 traces pour un résumé significatif.
    if (traces.length < 3) return;

    // Construire le contexte pour le LLM.
    // Budget : 20 traces × ~120 chars ≈ 630 tokens max — large dans le budget haiku.
    const traceSummary = traces
      .slice()
      .reverse() // ordre chronologique pour le LLM
      .map(
        (t, i) =>
          `[${i + 1}] Q: ${truncateToTokens(t.question, 60)} | R: ${truncateToTokens(t.reponse, 80)} | maîtrisé: ${t.mastered ? 'oui' : 'non'} | difficulté: ${t.difficulty}`,
      )
      .join('\n');

    const systemPrompt =
      'Tu es un assistant pédagogique. ' +
      `Résume en 3-4 phrases la progression de cet élève sur [${surface}] : ` +
      'points maîtrisés, difficultés récurrentes, et recommandation pédagogique. ' +
      'Sois concis et actionnable. Réponds en français.';

    const result = await this.ai.generateGrounded(traceSummary, [systemPrompt]);

    const newTraceCount = await this.prisma.memoryTrace.count({
      where: { eleveId, surface, organizationId },
    });

    await this.prisma.memorySurface.upsert({
      where: { eleveId_surface: { eleveId, surface } },
      create: {
        organizationId,
        eleveId,
        surface,
        summary: result.text,
        traceCount: newTraceCount,
        lastUpdated: new Date(),
      },
      update: {
        summary: result.text,
        traceCount: newTraceCount,
        lastUpdated: new Date(),
      },
    });

    // Toutes les 10 nouvelles traces : déclencher la synthèse L3 en fire-and-forget.
    if (newTraceCount % 10 === 0) {
      this.refreshProfile(eleveId, organizationId).catch(
        (err: unknown) => this.logger.error('Memory L3 refresh error', err),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // L3 — Profil synthétique cross-sessions (coûteux — 1x/semaine ou sur demande)
  // ---------------------------------------------------------------------------

  async refreshProfile(eleveId: string, organizationId: string): Promise<void> {
    // Récupérer tous les résumés L2 de l'élève + les 5 dernières traces.
    const [surfaces, recentTraces] = await Promise.all([
      this.prisma.memorySurface.findMany({
        where: { eleveId, organizationId },
        orderBy: { lastUpdated: 'desc' },
      }),
      this.prisma.memoryTrace.findMany({
        where: { eleveId, organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    if (surfaces.length === 0) return;

    // Construire le contexte partagé (utilisé dans les 2 appels LLM).
    const surfacesContext = surfaces
      .map((s) => `Matière [${s.surface}] (${s.traceCount} questions) :\n${s.summary}`)
      .join('\n\n');

    const recentContext = recentTraces
      .map(
        (t) =>
          `- [${t.surface}] ${truncateToTokens(t.question, 40)} → maîtrisé: ${t.mastered ? 'oui' : 'non'}`,
      )
      .join('\n');

    // Appel LLM 1 : profil global + forces.
    // Budget estimé : ~500 tokens input, ~200 tokens output (haiku).
    const call1Context = `RÉSUMÉS PAR MATIÈRE :\n${surfacesContext}`;

    const [profileResult, strengthsResult] = await Promise.all([
      this.ai.generateGrounded(
        'Décris en 100 mots maximum le profil global de cet élève : niveau général, style d\'apprentissage observé, et axes de progression prioritaires.',
        [call1Context],
      ),
      this.ai.generateGrounded(
        'Liste en 50 mots maximum les compétences clairement maîtrisées par cet élève (ce qu\'il sait bien faire).',
        [call1Context],
      ),
    ]);

    // Appel LLM 2 : faiblesses + activité récente.
    // Budget estimé : ~300 tokens input, ~150 tokens output (haiku).
    const call2Context = `RÉSUMÉS PAR MATIÈRE :\n${surfacesContext}\n\nACTIVITÉ RÉCENTE :\n${recentContext}`;

    const [weaknessesResult, recentResult] = await Promise.all([
      this.ai.generateGrounded(
        'Liste en 50 mots maximum les lacunes récurrentes ou compétences non maîtrisées de cet élève (ce sur quoi il doit travailler).',
        [call2Context],
      ),
      this.ai.generateGrounded(
        'Décris en 50 mots maximum l\'activité de cet élève sur les 7 derniers jours : sujets abordés, constance, progression visible.',
        [call2Context],
      ),
    ]);

    await this.prisma.studentProfile.upsert({
      where: { eleveId },
      create: {
        organizationId,
        eleveId,
        profileMd: profileResult.text,
        strengthsMd: strengthsResult.text,
        weaknessesMd: weaknessesResult.text,
        recentMd: recentResult.text,
        lastSynthesis: new Date(),
      },
      update: {
        profileMd: profileResult.text,
        strengthsMd: strengthsResult.text,
        weaknessesMd: weaknessesResult.text,
        recentMd: recentResult.text,
        lastSynthesis: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Lecture pour injection dans le contexte RAG (chemin critique — pas de LLM)
  // ---------------------------------------------------------------------------

  async getContextForRag(eleveId: string, surface: string): Promise<string> {
    // Lecture parallèle L3 (profil) + L2 (surface).
    const [profile, surfaceSummary] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { eleveId } }),
      this.prisma.memorySurface.findUnique({
        where: { eleveId_surface: { eleveId, surface } },
      }),
    ]);

    if (!profile && !surfaceSummary) return '';

    const parts: string[] = [];

    if (profile) {
      // Tronquer le profil à 50 tokens pour ne pas saturer le context window RAG.
      parts.push(`Profil élève : ${truncateToTokens(profile.profileMd, 50)}`);
    }

    if (surfaceSummary) {
      parts.push(`Sur ${surface} : ${surfaceSummary.summary}`);
    }

    return parts.join('. ');
  }

  // ---------------------------------------------------------------------------
  // Lecture complète pour dashboard
  // ---------------------------------------------------------------------------

  async getProfile(eleveId: string): Promise<{
    profile: StudentProfile | null;
    surfaces: MemorySurface[];
    recentTraces: MemoryTrace[];
  }> {
    const [profile, surfaces, recentTraces] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { eleveId } }),
      this.prisma.memorySurface.findMany({
        where: { eleveId },
        orderBy: { lastUpdated: 'desc' },
      }),
      this.prisma.memoryTrace.findMany({
        where: { eleveId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { profile, surfaces, recentTraces };
  }
}
