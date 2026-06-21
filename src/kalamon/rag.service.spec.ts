/**
 * Tests unitaires — RagService
 *
 * Chemin d'une question :
 *   1) enforceDailyBudget — ForbiddenException si quota atteint
 *   2) demandeIndice=true → HintService.generateHint (sans generateGrounded direct)
 *   3) searchCache hit  → source CACHE, BKT update, appendTrace fire-and-forget
 *   4) searchCache miss → RAG_LIVE : generateGrounded + storeCache + audit + BKT
 *   5) skillCode fourni → bktUpdate dans la réponse
 */

// Variables d'environnement minimales
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_SECRET = 'test-secret-min-16-chars';

// Mock du module env AVANT tout import qui l'utilise
jest.mock('../config/env', () => ({
  env: {
    AI_DAILY_BUDGET_PER_STUDENT: 120,
    SEMANTIC_CACHE_THRESHOLD: 0.92,
    LLM_PROVIDER: 'anthropic',
    LLM_MODEL: 'claude-haiku-4-5',
    EMBEDDING_DIM: 1536,
  },
  loadEnv: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from './ai-provider.service';
import { BktService } from '../bkt/bkt.service';
import { MemoryService } from '../memory/memory.service';
import { HintService } from '../hint/hint.service';
import { Eleve, SkillMastery } from '@prisma/client';

// ── Builders ─────────────────────────────────────────────────────────────────

function buildEleve(overrides: Partial<Eleve> = {}): Eleve {
  return {
    id: 'eleve-1',
    organizationId: 'org-1',
    nom: 'Diallo',
    prenom: 'Mamadou',
    niveau: '6ème',
    email: 'mamadou@test.com',
    passwordHash: 'hash',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Eleve;
}

function buildSkillMastery(overrides: Partial<SkillMastery> = {}): SkillMastery {
  return {
    id: 'sm-1',
    organizationId: 'org-1',
    eleveId: 'eleve-1',
    skill: 'math:fractions',
    matiere: 'math',
    probMastery: 0.55,
    probTransit: 0.3,
    probSlip: 0.1,
    probGuess: 0.2,
    attempts: 3,
    correctCount: 2,
    lastPracticed: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as SkillMastery;
}

// Vecteur d'embedding stub (1536 zéros)
const STUB_VEC = new Array(1536).fill(0);

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RagService', () => {
  let service: RagService;

  // Mocks des dépendances
  const prismaMock = {
    eleve: { findFirst: jest.fn() },
    aiInteraction: { count: jest.fn(), create: jest.fn() },
    semanticCacheEntry: { update: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const aiMock = {
    embed: jest.fn(),
    generateGrounded: jest.fn(),
    estimateCost: jest.fn(),
  };

  const bktMock = {
    getOrCreate: jest.fn(),
    update: jest.fn(),
  };

  const memoryMock = {
    getContextForRag: jest.fn(),
    appendTrace: jest.fn(),
  };

  const hintMock = {
    generateHint: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults communs
    prismaMock.eleve.findFirst.mockResolvedValue(buildEleve());
    prismaMock.aiInteraction.count.mockResolvedValue(0); // budget OK
    prismaMock.aiInteraction.create.mockResolvedValue({});
    prismaMock.semanticCacheEntry.update.mockResolvedValue({});
    prismaMock.semanticCacheEntry.create.mockResolvedValue({ id: 'cache-1' });
    prismaMock.$queryRaw.mockResolvedValue([]); // cache miss par défaut + chunks vides
    prismaMock.$executeRaw.mockResolvedValue(1);

    aiMock.embed.mockResolvedValue(STUB_VEC);
    aiMock.generateGrounded.mockResolvedValue({
      text: 'Réponse RAG ancrée.',
      inputTokens: 200,
      outputTokens: 80,
      model: 'claude-haiku-4-5',
    });
    aiMock.estimateCost.mockReturnValue(0.0005);

    memoryMock.getContextForRag.mockResolvedValue('');
    // appendTrace fire-and-forget : on résout pour éviter les logs d'erreur
    memoryMock.appendTrace.mockResolvedValue(undefined);

    bktMock.getOrCreate.mockResolvedValue(buildSkillMastery());
    bktMock.update.mockResolvedValue(buildSkillMastery({ probMastery: 0.65 }));

    hintMock.generateHint.mockResolvedValue('Voici un indice : pense aux numérateur et dénominateur.');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiProviderService, useValue: aiMock },
        { provide: BktService, useValue: bktMock },
        { provide: MemoryService, useValue: memoryMock },
        { provide: HintService, useValue: hintMock },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  // ── Flux HINT ──────────────────────────────────────────────────────────────

  describe('chat() — flux HINT', () => {
    it('chat_WhenDemandeIndice_CallsHintServiceAndSearchChunks', async () => {
      // searchChunks ($queryRaw) appelé une seule fois pour le contexte curriculum
      prismaMock.$queryRaw.mockResolvedValue([
        { id: 'chunk-1', contenu: 'Leçon sur les fractions.' },
      ]);

      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Comment résoudre 1/2 + 1/3 ?',
        demandeIndice: true,
        niveauIndice: 1,
      });

      // HintService doit être appelé
      expect(hintMock.generateHint).toHaveBeenCalledTimes(1);
      expect(hintMock.generateHint).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'Comment résoudre 1/2 + 1/3 ?',
          niveauIndice: 1,
        }),
      );

      // searchChunks ($queryRaw) appelé pour le contexte curriculum
      expect(prismaMock.$queryRaw).toHaveBeenCalled();

      // generateGrounded du RagService (pas de génération directe via RAG)
      expect(aiMock.generateGrounded).not.toHaveBeenCalled();

      // Source retournée = HINT
      expect(result.source).toBe('HINT');
      expect(result.reponse).toBe('Voici un indice : pense aux numérateur et dénominateur.');
    });

    it('chat_WhenDemandeIndice_AppendTraceCalledFireAndForget', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);

      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Aide-moi !',
        demandeIndice: true,
        niveauIndice: 2,
      });

      // appendTrace doit avoir été appelé (fire-and-forget, pas de await côté test)
      expect(memoryMock.appendTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          eleveId: 'eleve-1',
          difficulty: 'LOW',
        }),
      );
    });
  });

  // ── Flux CACHE ─────────────────────────────────────────────────────────────

  describe('chat() — flux CACHE', () => {
    beforeEach(() => {
      // Premier appel $queryRaw = cache HIT (similarity >= 0.92)
      // Le service sélectionne : id, reponse, sourceChunkIds, similarity
      prismaMock.$queryRaw.mockResolvedValueOnce([
        {
          id: 'cache-entry-1',
          reponse: 'Réponse depuis le cache.',
          sourceChunkIds: ['chunk-1'],
          similarity: 0.95,
        },
      ]);
    });

    it('chat_WhenCacheHit_ReturnsCAchESource', async () => {
      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Qu\'est-ce qu\'une fraction ?',
        demandeIndice: false,
      });

      expect(result.source).toBe('CACHE');
      expect(result.reponse).toBe('Réponse depuis le cache.');
    });

    it('chat_WhenCacheHit_DoesNotCallGenerateGrounded', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Qu\'est-ce qu\'une fraction ?',
        demandeIndice: false,
      });

      // Aucun appel LLM live
      expect(aiMock.generateGrounded).not.toHaveBeenCalled();
    });

    it('chat_WhenCacheHit_CallsAuditAndIncrementsCacheHits', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Qu\'est-ce qu\'une fraction ?',
        demandeIndice: false,
      });

      // audit = aiInteraction.create
      expect(prismaMock.aiInteraction.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.aiInteraction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'CACHE' }),
        }),
      );

      // Incrément hits sur l'entrée cache
      expect(prismaMock.semanticCacheEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cache-entry-1' },
          data: { hits: { increment: 1 } },
        }),
      );
    });

    it('chat_WhenCacheHit_UpdatesBktAndCallsAppendTrace', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Qu\'est-ce qu\'une fraction ?',
        demandeIndice: false,
        skillCode: 'math:fractions',
      });

      // BKT doit être mis à jour
      expect(bktMock.getOrCreate).toHaveBeenCalledTimes(1);
      expect(bktMock.update).toHaveBeenCalledTimes(1);

      // appendTrace doit être appelé (fire-and-forget)
      expect(memoryMock.appendTrace).toHaveBeenCalled();
    });
  });

  // ── Flux RAG_LIVE ──────────────────────────────────────────────────────────

  describe('chat() — flux RAG_LIVE', () => {
    beforeEach(() => {
      // $queryRaw : cache miss (liste vide) puis chunks curriculum
      prismaMock.$queryRaw
        .mockResolvedValueOnce([]) // searchCache → aucun hit
        .mockResolvedValueOnce([  // searchChunks → 2 chunks
          { id: 'chunk-1', contenu: 'Leçon fractions partie 1.' },
          { id: 'chunk-2', contenu: 'Leçon fractions partie 2.' },
        ]);
    });

    it('chat_WhenCacheMiss_ReturnsRAG_LIVESource', async () => {
      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
      });

      expect(result.source).toBe('RAG_LIVE');
      expect(result.reponse).toBe('Réponse RAG ancrée.');
    });

    it('chat_WhenCacheMiss_CallsGenerateGroundedOnce', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
      });

      expect(aiMock.generateGrounded).toHaveBeenCalledTimes(1);
    });

    it('chat_WhenCacheMiss_StoresCacheAndAudits', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
      });

      // storeCache : create + $executeRaw pour l'embedding
      expect(prismaMock.semanticCacheEntry.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);

      // audit : aiInteraction.create avec source RAG_LIVE
      expect(prismaMock.aiInteraction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'RAG_LIVE' }),
        }),
      );
    });

    it('chat_WhenCacheMiss_UpdatesBktAndAppendsTrace', async () => {
      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
        skillCode: 'math:fractions',
      });

      expect(bktMock.getOrCreate).toHaveBeenCalledTimes(1);
      expect(bktMock.update).toHaveBeenCalledTimes(1);
      expect(memoryMock.appendTrace).toHaveBeenCalled();
    });

    it('chat_WhenCacheMissWithMemoryContext_InjectsMemoryIntoChunks', async () => {
      memoryMock.getContextForRag.mockResolvedValue('Profil : élève avancé en math.');

      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
      });

      // generateGrounded doit recevoir le contexte mémoire en tête des chunks
      const call = aiMock.generateGrounded.mock.calls[0];
      const contextChunks: string[] = call[1];
      expect(contextChunks[0]).toContain('[Mémoire élève]');
      expect(contextChunks[0]).toContain('Profil : élève avancé en math.');
    });
  });

  // ── Budget quotidien ───────────────────────────────────────────────────────

  describe('enforceDailyBudget()', () => {
    it('chat_WhenDailyBudgetExceeded_ThrowsForbiddenException', async () => {
      // Simuler que le quota est atteint (120 interactions RAG_LIVE aujourd'hui)
      prismaMock.aiInteraction.count.mockResolvedValue(120);

      await expect(
        service.chat('org-1', {
          eleveId: 'eleve-1',
          question: 'Nouvelle question.',
          demandeIndice: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('chat_WhenBudgetAt119_Proceeds', async () => {
      prismaMock.aiInteraction.count.mockResolvedValue(119);
      prismaMock.$queryRaw.mockResolvedValue([]); // cache miss

      // Ne doit pas lever d'exception pour count=119 (< 120)
      await expect(
        service.chat('org-1', {
          eleveId: 'eleve-1',
          question: 'Question encore autorisée.',
          demandeIndice: false,
        }),
      ).resolves.toBeDefined();
    });
  });

  // ── bktUpdate dans la réponse ──────────────────────────────────────────────

  describe('chat() — bktUpdate dans la réponse', () => {
    it('chat_WhenSkillCodeProvided_ResultContainsBktUpdate', async () => {
      // Cache miss pour passer par RAG_LIVE avec skillCode
      prismaMock.$queryRaw
        .mockResolvedValueOnce([]) // cache miss
        .mockResolvedValueOnce([]); // chunks vides

      bktMock.update.mockResolvedValue(
        buildSkillMastery({ probMastery: 0.65, skill: 'math:fractions' }),
      );

      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Explique les fractions.',
        demandeIndice: false,
        skillCode: 'math:fractions',
      });

      expect(result.bktUpdate).toBeDefined();
      expect(result.bktUpdate!.skill).toBe('math:fractions');
      expect(result.bktUpdate!.probMastery).toBeCloseTo(0.65, 2);
    });

    it('chat_WhenNoSkillCode_ResultHasNoBktUpdate', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([]) // cache miss
        .mockResolvedValueOnce([]); // chunks vides

      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Question sans skillCode.',
        demandeIndice: false,
        // skillCode absent
      });

      expect(result.bktUpdate).toBeUndefined();
      expect(bktMock.getOrCreate).not.toHaveBeenCalled();
    });

    it('chat_WhenProbMasteryAbove0_9_BktUpdateMasteredIsTrue', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      bktMock.update.mockResolvedValue(
        buildSkillMastery({ probMastery: 0.95, skill: 'math:fractions' }),
      );

      const result = await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Question de maîtrise.',
        demandeIndice: false,
        skillCode: 'math:fractions',
      });

      expect(result.bktUpdate!.mastered).toBe(true);
    });

    it('chat_WhenSkillCodeProvided_BktGetOrCreateReceivesCorrectArgs', async () => {
      prismaMock.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.chat('org-1', {
        eleveId: 'eleve-1',
        question: 'Question sur les fractions.',
        demandeIndice: false,
        skillCode: 'math:fractions',
      });

      expect(bktMock.getOrCreate).toHaveBeenCalledWith(
        'org-1',
        'eleve-1',
        'math:fractions',
        'math', // matiere déduite du skillCode
      );
    });
  });

  // ── Garde multi-tenant ─────────────────────────────────────────────────────

  describe('chat() — garde organisation', () => {
    it('chat_WhenEleveNotInOrganization_ThrowsForbiddenException', async () => {
      prismaMock.eleve.findFirst.mockResolvedValue(null);

      await expect(
        service.chat('org-autre', {
          eleveId: 'eleve-1',
          question: 'Question.',
          demandeIndice: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
