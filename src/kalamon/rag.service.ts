import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from './ai-provider.service';
import { ChatInput, ChatResult, ComplexityLevel } from './dto/chat.dto';
import { env } from '../config/env';
import { BktService } from '../bkt/bkt.service';
import { MemoryService } from '../memory/memory.service';
import { HintService } from '../hint/hint.service';

/**
 * Orchestration RAG ancrée + cache sémantique + budget + audit + BKT.
 *
 * Chemin d'une question :
 *   1) budget journalier OK ?  (anti-dérive de coût)
 *   2) cache sémantique (pgvector) ? -> HIT = coût ~0  (source CACHE)
 *   3) sinon RAG_LIVE : recherche chunks (pgvector) -> génération ancrée
 *   4) journal d'audit (AI Act) + alimentation du cache
 *   5) mise à jour BKT si skillCode fourni
 *
 * pgvector : la similarité se fait en SQL brut (<=> = distance cosinus).
 *            similarité = 1 - distance. Voir README pour l'index HNSW.
 */

/** Prompts de complexité injectés dans le system prompt selon le niveau de l'élève. */
const COMPLEXITE_PROMPTS: Record<ComplexityLevel, string> = {
  SIMPLE:
    "Explique comme à un enfant de primaire : mots simples, courtes phrases, exemples concrets du quotidien en Guinée.",
  COLLEGE:
    "Réponds au niveau collège : explications structurées, vocabulaire scolaire accessible, exemples locaux pertinents.",
  LYCEE:
    "Niveau lycée : réponses détaillées, terminologie précise, démarche de résolution de problème complète.",
  TECHNIQUE:
    "Niveau technique/professionnel : rigueur académique, notation standard, raisonnement scientifique complet.",
};

/**
 * Détecte le niveau de complexité adapté selon la classe de l'élève.
 * Utilisé uniquement si `input.complexite` n'est pas fourni explicitement.
 */
function detectComplexite(niveau: string): ComplexityLevel {
  if (['CP', 'CE1', 'CE2', 'CM1', 'CM2'].includes(niveau)) return 'SIMPLE';
  if (['6ème', '5ème', '4ème', '3ème', '6e', '5e', '4e', '3e'].some((n) => niveau.includes(n)))
    return 'COLLEGE';
  if (['2nde', '1ère', 'Terminale', '2nd', '1ere', 'Tle'].some((n) => niveau.includes(n)))
    return 'LYCEE';
  return 'TECHNIQUE';
}

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
    private readonly bktService: BktService,
    private readonly memoryService: MemoryService,
    private readonly hintService: HintService,
  ) {}

  async chat(organizationId: string, input: ChatInput): Promise<ChatResult> {
    const eleve = await this.prisma.eleve.findFirst({
      where: { id: input.eleveId, organizationId, deletedAt: null },
    });
    if (!eleve) throw new ForbiddenException('Élève hors de votre organisation');

    await this.enforceDailyBudget(organizationId, eleve.id);

    // Matière déduite du skillCode ("math:fractions" → "math") ou "general"
    const matiere = input.skillCode?.split(':')[0] ?? 'general';
    const surface = input.skillCode ?? `${matiere}:${eleve.niveau}`;

    // Sélection de la complexité : explicite > détectée depuis le niveau
    const complexite: ComplexityLevel =
      input.complexite ?? detectComplexite(eleve.niveau);
    const complexiteHint = COMPLEXITE_PROMPTS[complexite];

    // (1b) Contexte mémoire L2/L3 — injecté dans le prompt, fire-and-forget si erreur
    const memoryContext = await this.memoryService
      .getContextForRag(eleve.id, surface)
      .catch(() => '');

    const qVec = await this.ai.embed(input.question);
    const vecLiteral = this.toVector(qVec);

    // (Hint) : si l'élève demande un indice, générer sans passer par le pipeline RAG complet
    if (input.demandeIndice) {
      const niveauIndice = (input.niveauIndice ?? 1) as 1 | 2 | 3;
      const chunks = await this.searchChunks(organizationId, eleve.niveau, vecLiteral);
      const curriculumContext = chunks.map((c) => c.contenu).join('\n\n');
      const hint = await this.hintService.generateHint({
        question: input.question,
        matiere,
        curriculumContext,
        niveauIndice,
        eleveNiveau: eleve.niveau,
      });
      // Trace L1 (non bloquant)
      this.memoryService
        .appendTrace({ organizationId, eleveId: eleve.id, surface, question: input.question, reponse: hint, skillCode: input.skillCode, difficulty: 'LOW' })
        .catch(() => undefined);
      return { reponse: hint, source: 'HINT', sourceChunkIds: chunks.map((c) => c.id), complexite };
    }

    // (2) Cache sémantique
    const cached = await this.searchCache(organizationId, eleve.niveau, vecLiteral);
    if (cached) {
      await this.prisma.semanticCacheEntry.update({
        where: { id: cached.id },
        data: { hits: { increment: 1 } },
      });
      await this.audit(organizationId, eleve.id, input.question, cached.reponse, 'CACHE', cached.sourceChunkIds, null, 0, 0, 0);

      const bktUpdate = await this.maybeUpdateBkt(organizationId, eleve.id, input.skillCode, matiere, true);

      // Trace L1 (non bloquant)
      this.memoryService
        .appendTrace({ organizationId, eleveId: eleve.id, surface, question: input.question, reponse: cached.reponse, skillCode: input.skillCode, mastered: (bktUpdate?.probMastery ?? 0) >= 0.9, difficulty: 'LOW' })
        .catch(() => undefined);

      return { reponse: cached.reponse, source: 'CACHE', sourceChunkIds: cached.sourceChunkIds, complexite, bktUpdate };
    }

    // (3) RAG_LIVE : chunks curriculum + contexte mémoire injecté
    const chunks = await this.searchChunks(organizationId, eleve.niveau, vecLiteral);
    const contextChunks = chunks.map((c) => c.contenu);
    // Injecter le résumé mémoire en tête du contexte si disponible
    if (memoryContext) contextChunks.unshift(`[Mémoire élève]\n${memoryContext}`);

    const gen = await this.ai.generateGrounded(input.question, contextChunks, complexiteHint);
    const cost = this.ai.estimateCost(gen.inputTokens, gen.outputTokens);
    const sourceChunkIds = chunks.map((c) => c.id);

    // (4) audit + cache
    await this.audit(organizationId, eleve.id, input.question, gen.text, 'RAG_LIVE', sourceChunkIds, gen.model, gen.inputTokens, gen.outputTokens, cost);
    await this.storeCache(organizationId, eleve.niveau, input.question, gen.text, sourceChunkIds, vecLiteral);

    const bktUpdate = await this.maybeUpdateBkt(organizationId, eleve.id, input.skillCode, matiere, true);

    // Trace L1 + refresh L2 (non bloquants)
    this.memoryService
      .appendTrace({ organizationId, eleveId: eleve.id, surface, question: input.question, reponse: gen.text, skillCode: input.skillCode, mastered: (bktUpdate?.probMastery ?? 0) >= 0.9, difficulty: 'MEDIUM' })
      .catch(() => undefined);

    return { reponse: gen.text, source: 'RAG_LIVE', sourceChunkIds, complexite, bktUpdate };
  }

  /**
   * Met à jour le BKT si un skillCode est fourni.
   * Retourne le résumé d'état BKT ou undefined si pas de skillCode.
   */
  private async maybeUpdateBkt(
    organizationId: string,
    eleveId: string,
    skillCode: string | undefined,
    matiere: string,
    isCorrect: boolean,
  ): Promise<ChatResult['bktUpdate']> {
    if (!skillCode) return undefined;

    const entry = await this.bktService.getOrCreate(
      organizationId,
      eleveId,
      skillCode,
      matiere,
    );
    const updated = await this.bktService.update(entry.id, isCorrect);

    return {
      skill: skillCode,
      probMastery: updated.probMastery,
      mastered: updated.probMastery >= 0.9,
    };
  }

  // --- budget tokens : plafond d'appels live / élève / jour ---
  private async enforceDailyBudget(organizationId: string, eleveId: string): Promise<void> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const count = await this.prisma.aiInteraction.count({
      where: { organizationId, eleveId, source: 'RAG_LIVE', createdAt: { gte: since } },
    });
    if (count >= env.AI_DAILY_BUDGET_PER_STUDENT) {
      throw new ForbiddenException('Budget IA quotidien atteint — réessaie demain.');
    }
  }

  // --- recherche cache sémantique (cosine via pgvector) ---
  private async searchCache(
    organizationId: string,
    niveau: string,
    vec: string,
  ): Promise<{ id: string; reponse: string; sourceChunkIds: string[] } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; reponse: string; sourceChunkIds: string[]; similarity: number }>
    >(Prisma.sql`
      SELECT id, reponse, "sourceChunkIds", 1 - (embedding <=> ${vec}::vector) AS similarity
      FROM semantic_cache
      WHERE "organizationId" = ${organizationId} AND niveau = ${niveau} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT 1`);
    const top = rows[0];
    if (top && top.similarity >= env.SEMANTIC_CACHE_THRESHOLD) {
      return { id: top.id, reponse: top.reponse, sourceChunkIds: top.sourceChunkIds };
    }
    return null;
  }

  // --- recherche des chunks de curriculum les plus proches ---
  private async searchChunks(
    organizationId: string,
    niveau: string,
    vec: string,
  ): Promise<Array<{ id: string; contenu: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string; contenu: string }>>(Prisma.sql`
      SELECT cc.id, cc.contenu
      FROM curriculum_chunks cc
      JOIN lessons l ON l.id = cc."lessonId"
      WHERE l."organizationId" = ${organizationId} AND l.niveau = ${niveau} AND cc.embedding IS NOT NULL
      ORDER BY cc.embedding <=> ${vec}::vector
      LIMIT 4`);
  }

  private async storeCache(
    organizationId: string,
    niveau: string,
    question: string,
    reponse: string,
    sourceChunkIds: string[],
    vec: string,
  ): Promise<void> {
    const id = await this.prisma.semanticCacheEntry
      .create({
        data: { organizationId, niveau, question, reponse, sourceChunkIds },
        select: { id: true },
      })
      .then((r) => r.id);
    // embedding posé en SQL brut (type vector non géré nativement par Prisma)
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE semantic_cache SET embedding = ${vec}::vector WHERE id = ${id}`,
    );
  }

  private async audit(
    organizationId: string,
    eleveId: string,
    question: string,
    reponse: string,
    source: string,
    sourceChunkIds: string[],
    modelUsed: string | null,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
  ): Promise<void> {
    await this.prisma.aiInteraction.create({
      data: {
        organizationId,
        eleveId,
        question,
        reponse,
        source,
        sourceChunkIds,
        modelUsed,
        inputTokens,
        outputTokens,
        costUsd,
      },
    });
  }

  // sérialise un vecteur JS en littéral pgvector: "[0.1,0.2,...]"
  private toVector(vec: number[]): string {
    return `[${vec.join(',')}]`;
  }
}
