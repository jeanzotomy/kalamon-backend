/**
 * Tests unitaires — MemoryService
 *
 * Couche mémoire L1/L2/L3 :
 *   L1 : appendTrace()     → écriture brute + fire-and-forget vers L2
 *   L2 : refreshSurface()  → résumé LLM par surface (ne se déclenche qu'à partir de 3 traces)
 *   L3 : refreshProfile()  → profil synthétique cross-sessions
 */

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_SECRET = 'test-secret-min-16-chars';

import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from '../kalamon/ai-provider.service';
import { MemoryTrace, MemorySurface, StudentProfile } from '@prisma/client';

// ── Builders ─────────────────────────────────────────────────────────────────

function buildTrace(overrides: Partial<MemoryTrace> = {}): MemoryTrace {
  return {
    id: 'trace-1',
    organizationId: 'org-1',
    eleveId: 'eleve-1',
    surface: 'math:6ème',
    question: 'Qu\'est-ce qu\'une fraction ?',
    reponse: 'Une fraction est un rapport de deux entiers.',
    skillCode: 'math:fractions',
    mastered: false,
    difficulty: 'MEDIUM',
    createdAt: new Date(),
    ...overrides,
  } as unknown as MemoryTrace;
}

function buildSurface(overrides: Partial<MemorySurface> = {}): MemorySurface {
  return {
    id: 'surface-1',
    organizationId: 'org-1',
    eleveId: 'eleve-1',
    surface: 'math:6ème',
    summary: 'Bonne progression sur les fractions.',
    traceCount: 5,
    lastUpdated: new Date(),
    ...overrides,
  } as unknown as MemorySurface;
}

function buildProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: 'profile-1',
    organizationId: 'org-1',
    eleveId: 'eleve-1',
    profileMd: 'Élève curieux, bonne progression globale.',
    strengthsMd: 'Fractions, équations simples.',
    weaknessesMd: 'Géométrie, problèmes complexes.',
    recentMd: 'Travail régulier cette semaine.',
    lastSynthesis: new Date(),
    ...overrides,
  } as unknown as StudentProfile;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MemoryService', () => {
  let service: MemoryService;

  const prismaMock = {
    memoryTrace: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    memorySurface: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    studentProfile: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const aiMock = {
    generateGrounded: jest.fn(),
    embed: jest.fn(),
    estimateCost: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults : create OK, AI renvoie un texte stub
    prismaMock.memoryTrace.create.mockResolvedValue(buildTrace());
    aiMock.generateGrounded.mockResolvedValue({
      text: 'Résumé LLM stub.',
      inputTokens: 100,
      outputTokens: 50,
      model: 'stub',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiProviderService, useValue: aiMock },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  // ── appendTrace() ──────────────────────────────────────────────────────────

  describe('appendTrace()', () => {
    it('appendTrace_WhenRefreshSurfaceRejects_DoesNotThrow', async () => {
      // L'appendTrace ne doit pas propager les erreurs fire-and-forget
      prismaMock.memoryTrace.create.mockResolvedValue(buildTrace());
      // refreshSurface sera appelé en fire-and-forget — simuler 0 trace pour court-circuiter
      prismaMock.memoryTrace.findMany.mockResolvedValue([]);

      // Même si refreshSurface rejette, appendTrace ne doit pas lever d'exception
      // On surcharge findMany pour rejeter après le create
      prismaMock.memoryTrace.findMany.mockRejectedValue(new Error('DB temporairement indisponible'));

      await expect(
        service.appendTrace({
          organizationId: 'org-1',
          eleveId: 'eleve-1',
          surface: 'math:6ème',
          question: 'Qu\'est-ce qu\'une fraction ?',
          reponse: 'Un rapport de deux entiers.',
        }),
      ).resolves.toBeUndefined();

      // La trace L1 doit quand même avoir été créée
      expect(prismaMock.memoryTrace.create).toHaveBeenCalledTimes(1);
    });

    it('appendTrace_WritesTraceWithCorrectFields', async () => {
      prismaMock.memoryTrace.findMany.mockResolvedValue([]);

      await service.appendTrace({
        organizationId: 'org-1',
        eleveId: 'eleve-1',
        surface: 'math:fractions',
        question: 'Qu\'est-ce que 1/2 ?',
        reponse: 'C\'est la moitié.',
        skillCode: 'math:fractions',
        mastered: true,
        difficulty: 'LOW',
      });

      expect(prismaMock.memoryTrace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          eleveId: 'eleve-1',
          surface: 'math:fractions',
          skillCode: 'math:fractions',
          mastered: true,
          difficulty: 'LOW',
        }),
      });
    });
  });

  // ── refreshSurface() ───────────────────────────────────────────────────────

  describe('refreshSurface()', () => {
    it('refreshSurface_WhenLessThan3Traces_DoesNotCallAi', async () => {
      // Seulement 2 traces — pas assez pour un résumé significatif
      prismaMock.memoryTrace.findMany.mockResolvedValue([
        buildTrace({ id: 'trace-1' }),
        buildTrace({ id: 'trace-2' }),
      ]);

      await service.refreshSurface('eleve-1', 'math:6ème', 'org-1');

      expect(aiMock.generateGrounded).not.toHaveBeenCalled();
      expect(prismaMock.memorySurface.upsert).not.toHaveBeenCalled();
    });

    it('refreshSurface_WhenAtLeast3Traces_UpsertsMemorySurface', async () => {
      // 3 traces — seuil atteint, résumé déclenché
      const traces = [
        buildTrace({ id: 'trace-1' }),
        buildTrace({ id: 'trace-2' }),
        buildTrace({ id: 'trace-3' }),
      ];
      prismaMock.memoryTrace.findMany.mockResolvedValue(traces);
      prismaMock.memoryTrace.count.mockResolvedValue(3);
      prismaMock.memorySurface.upsert.mockResolvedValue(buildSurface());

      await service.refreshSurface('eleve-1', 'math:6ème', 'org-1');

      expect(aiMock.generateGrounded).toHaveBeenCalledTimes(1);
      expect(prismaMock.memorySurface.upsert).toHaveBeenCalledTimes(1);

      const upsertCall = prismaMock.memorySurface.upsert.mock.calls[0][0];
      expect(upsertCall.create).toMatchObject({
        organizationId: 'org-1',
        eleveId: 'eleve-1',
        surface: 'math:6ème',
        summary: 'Résumé LLM stub.',
        traceCount: 3,
      });
    });

    it('refreshSurface_WhenExactly3Traces_UsesBothCreateAndUpdateFields', async () => {
      prismaMock.memoryTrace.findMany.mockResolvedValue([
        buildTrace({ id: 'trace-1' }),
        buildTrace({ id: 'trace-2' }),
        buildTrace({ id: 'trace-3' }),
      ]);
      prismaMock.memoryTrace.count.mockResolvedValue(3);
      prismaMock.memorySurface.upsert.mockResolvedValue(buildSurface());

      await service.refreshSurface('eleve-1', 'math:6ème', 'org-1');

      const upsertCall = prismaMock.memorySurface.upsert.mock.calls[0][0];
      // update doit contenir les mêmes champs
      expect(upsertCall.update).toMatchObject({
        summary: 'Résumé LLM stub.',
        traceCount: 3,
      });
      // where sur la clé composite
      expect(upsertCall.where).toEqual({
        eleveId_surface: { eleveId: 'eleve-1', surface: 'math:6ème' },
      });
    });
  });

  // ── getContextForRag() ─────────────────────────────────────────────────────

  describe('getContextForRag()', () => {
    it('getContextForRag_WhenNoProfileNorSurface_ReturnsEmptyString', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(null);
      prismaMock.memorySurface.findUnique.mockResolvedValue(null);

      const result = await service.getContextForRag('eleve-1', 'math:6ème');

      expect(result).toBe('');
    });

    it('getContextForRag_WhenProfileL3Exists_ReturnsNonEmptyString', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(buildProfile());
      prismaMock.memorySurface.findUnique.mockResolvedValue(null);

      const result = await service.getContextForRag('eleve-1', 'math:6ème');

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Profil élève');
    });

    it('getContextForRag_WhenSurfaceL2Exists_IncludesSurface', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(null);
      prismaMock.memorySurface.findUnique.mockResolvedValue(buildSurface());

      const result = await service.getContextForRag('eleve-1', 'math:6ème');

      expect(result).toBeTruthy();
      expect(result).toContain('math:6ème');
    });

    it('getContextForRag_WhenBothProfileAndSurfaceExist_CombinesBothContexts', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(buildProfile());
      prismaMock.memorySurface.findUnique.mockResolvedValue(buildSurface());

      const result = await service.getContextForRag('eleve-1', 'math:6ème');

      expect(result).toContain('Profil élève');
      expect(result).toContain('math:6ème');
    });
  });
});
