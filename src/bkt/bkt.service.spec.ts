/**
 * Tests unitaires — BktService
 *
 * Formule BKT (Corbett & Anderson 1994) :
 *   Correct   : P(K|correct)   = P(K)*(1-P(S)) / [P(K)*(1-P(S)) + (1-P(K))*P(G)]
 *   Incorrect : P(K|incorrect) = P(K)*P(S)     / [P(K)*P(S)     + (1-P(K))*(1-P(G))]
 *   Transit   : P(K_new)       = P(K_updated)  + (1-P(K_updated))*P(T)
 */

// Variables d'environnement minimales pour que env.ts valide au démarrage
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_SECRET = 'test-secret-min-16-chars';

import { Test, TestingModule } from '@nestjs/testing';
import { BktService } from './bkt.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillMastery } from '@prisma/client';

// Valeurs par défaut BKT conservatrices (identiques aux defaults du schéma Prisma)
const BKT_DEFAULTS = {
  probMastery: 0.1,
  probTransit: 0.3,
  probSlip: 0.1,
  probGuess: 0.2,
};

function buildSkillMastery(overrides: Partial<SkillMastery> = {}): SkillMastery {
  return {
    id: 'sm-1',
    organizationId: 'org-1',
    eleveId: 'eleve-1',
    skill: 'math:fractions',
    matiere: 'math',
    probMastery: BKT_DEFAULTS.probMastery,
    probTransit: BKT_DEFAULTS.probTransit,
    probSlip: BKT_DEFAULTS.probSlip,
    probGuess: BKT_DEFAULTS.probGuess,
    attempts: 0,
    correctCount: 0,
    lastPracticed: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as SkillMastery;
}

describe('BktService', () => {
  let service: BktService;

  // Mock Prisma : uniquement les méthodes réellement utilisées
  const prismaMock = {
    skillMastery: {
      upsert: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BktService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<BktService>(BktService);
  });

  // ── update() ────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('update_WhenCorrect_IncreasesProbMastery', async () => {
      // Valeurs BKT initiales : p=0.1, slip=0.1, guess=0.2, transit=0.3
      // Étape 1 correct : 0.1*(1-0.1) / [0.1*(1-0.1) + 0.9*0.2] = 0.09 / 0.27 = 0.3333
      // Étape 2 transit : 0.3333 + (1-0.3333)*0.3 ≈ 0.5333
      const entry = buildSkillMastery();
      prismaMock.skillMastery.findUniqueOrThrow.mockResolvedValue(entry);

      let capturedData: Record<string, unknown> | null = null;
      prismaMock.skillMastery.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          capturedData = data;
          return Promise.resolve({ ...entry, ...data, probMastery: data.probMastery as number });
        },
      );

      const result = await service.update('sm-1', true);

      expect(result.probMastery).toBeGreaterThan(entry.probMastery);
      expect(Math.abs(result.probMastery - 0.533)).toBeLessThan(0.001);
      expect(capturedData).not.toBeNull();
      expect(prismaMock.skillMastery.update).toHaveBeenCalledTimes(1);
    });

    it('update_WhenIncorrect_ProbMasteryRemainsLow', async () => {
      // Étape 1 incorrect : 0.1*0.1 / [0.1*0.1 + 0.9*(1-0.2)] = 0.01 / 0.73 ≈ 0.0137
      // Étape 2 transit : 0.0137 + (1-0.0137)*0.3 ≈ 0.310
      const entry = buildSkillMastery();
      prismaMock.skillMastery.findUniqueOrThrow.mockResolvedValue(entry);

      prismaMock.skillMastery.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...entry, probMastery: data.probMastery as number }),
      );

      const result = await service.update('sm-1', false);

      expect(result.probMastery).toBeLessThan(0.35);
      // Valeur précise attendue ≈ 0.310
      expect(Math.abs(result.probMastery - 0.310)).toBeLessThan(0.005);
    });

    it('update_WhenCorrect_IncrementsAttemptsAndCorrectCount', async () => {
      const entry = buildSkillMastery({ attempts: 2, correctCount: 1 });
      prismaMock.skillMastery.findUniqueOrThrow.mockResolvedValue(entry);

      let capturedData: Record<string, unknown> | null = null;
      prismaMock.skillMastery.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          capturedData = data;
          return Promise.resolve({ ...entry, ...data });
        },
      );

      await service.update('sm-1', true);

      // Le service passe { increment: 1 } pour attempts et correctCount
      expect(capturedData).toMatchObject({
        attempts: { increment: 1 },
        correctCount: { increment: 1 },
      });
    });

    it('update_WhenIncorrect_IncrementsAttemptsButNotCorrectCount', async () => {
      const entry = buildSkillMastery();
      prismaMock.skillMastery.findUniqueOrThrow.mockResolvedValue(entry);

      let capturedData: Record<string, unknown> | null = null;
      prismaMock.skillMastery.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          capturedData = data;
          return Promise.resolve({ ...entry, ...data });
        },
      );

      await service.update('sm-1', false);

      expect(capturedData).toMatchObject({ attempts: { increment: 1 } });
      // correctCount doit être undefined (pas d'incrément)
      expect((capturedData as unknown as Record<string, unknown>).correctCount).toBeUndefined();
    });
  });

  // ── isMastered() ─────────────────────────────────────────────────────────────

  describe('isMastered()', () => {
    it('isMastered_WhenProbMastery0_5_ReturnsFalse', async () => {
      prismaMock.skillMastery.findUnique.mockResolvedValue(
        buildSkillMastery({ probMastery: 0.5 }),
      );

      const result = await service.isMastered('eleve-1', 'math:fractions');

      expect(result).toBe(false);
    });

    it('isMastered_WhenProbMastery0_95_ReturnsTrue', async () => {
      prismaMock.skillMastery.findUnique.mockResolvedValue(
        buildSkillMastery({ probMastery: 0.95 }),
      );

      const result = await service.isMastered('eleve-1', 'math:fractions');

      expect(result).toBe(true);
    });

    it('isMastered_WhenNoTraceExists_ReturnsFalse', async () => {
      prismaMock.skillMastery.findUnique.mockResolvedValue(null);

      const result = await service.isMastered('eleve-1', 'math:fractions');

      expect(result).toBe(false);
    });

    it('isMastered_WhenProbMasteryEqualsThreshold_ReturnsTrue', async () => {
      prismaMock.skillMastery.findUnique.mockResolvedValue(
        buildSkillMastery({ probMastery: 0.9 }),
      );

      const result = await service.isMastered('eleve-1', 'math:fractions', 0.9);

      expect(result).toBe(true);
    });
  });

  // ── getOrCreate() ─────────────────────────────────────────────────────────────

  describe('getOrCreate()', () => {
    it('getOrCreate_WhenEntryExists_ReturnsExistingEntry', async () => {
      const existing = buildSkillMastery({ probMastery: 0.75 });
      prismaMock.skillMastery.upsert.mockResolvedValue(existing);

      const result = await service.getOrCreate('org-1', 'eleve-1', 'math:fractions', 'math');

      expect(result).toEqual(existing);
      expect(prismaMock.skillMastery.upsert).toHaveBeenCalledTimes(1);
    });

    it('getOrCreate_WhenEntryAbsent_CreatesWithBktDefaults', async () => {
      const created = buildSkillMastery();
      prismaMock.skillMastery.upsert.mockResolvedValue(created);

      const result = await service.getOrCreate('org-1', 'eleve-1', 'math:fractions', 'math');

      const upsertCall = prismaMock.skillMastery.upsert.mock.calls[0][0];
      expect(upsertCall.create).toMatchObject({
        probMastery: 0.1,
        probTransit: 0.3,
        probSlip: 0.1,
        probGuess: 0.2,
        attempts: 0,
        correctCount: 0,
      });
      expect(result.probMastery).toBe(0.1);
    });

    it('getOrCreate_WhenEntryExists_UpdateIsEmpty', async () => {
      prismaMock.skillMastery.upsert.mockResolvedValue(buildSkillMastery());

      await service.getOrCreate('org-1', 'eleve-1', 'math:fractions', 'math');

      const upsertCall = prismaMock.skillMastery.upsert.mock.calls[0][0];
      // update:{} = pas de modification si entrée déjà présente
      expect(upsertCall.update).toEqual({});
    });
  });
});
