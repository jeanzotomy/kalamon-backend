import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, Concept } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MASTERY_THRESHOLD = 0.9;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

@Injectable()
export class ConceptService {
  private readonly logger = new Logger(ConceptService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------- Création ----------

  async createConcept(
    organizationId: string,
    dto: {
      matiere: string;
      niveau: string;
      code: string;
      label: string;
      description?: string;
    },
  ): Promise<Concept> {
    try {
      return await this.prisma.concept.create({
        data: {
          organizationId,
          matiere: dto.matiere,
          niveau: dto.niveau,
          code: dto.code,
          label: dto.label,
          description: dto.description ?? null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `Le concept "${dto.code}" existe déjà pour la matière "${dto.matiere}".`,
        );
      }
      throw e;
    }
  }

  // ---------- Arête prérequis ----------

  async addPrerequisite(
    organizationId: string,
    matiere: string,
    conceptCode: string,
    prerequisiteCode: string,
  ): Promise<void> {
    const [concept, prerequisite] = await Promise.all([
      this.findConceptByCode(organizationId, matiere, conceptCode),
      this.findConceptByCode(organizationId, matiere, prerequisiteCode),
    ]);

    try {
      await this.prisma.conceptPrerequisite.create({
        data: {
          conceptId: concept.id,
          prerequisiteId: prerequisite.id,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // Arête déjà existante — idempotent, pas une erreur
        this.logger.log({
          msg: 'Prerequisite edge already exists — skipping',
          conceptCode,
          prerequisiteCode,
        });
        return;
      }
      throw e;
    }
  }

  // ---------- BFS prérequis non maîtrisés ----------

  /**
   * Retourne tous les prérequis non maîtrisés pour un élève avant d'aborder
   * un concept cible. BFS depuis le concept cible, remonte le graphe jusqu'à
   * trouver des concepts dont probMastery < 0.9 (ou absents de SkillMastery).
   */
  async getUnmasteredPrerequisites(
    organizationId: string,
    eleveId: string,
    matiere: string,
    conceptCode: string,
  ): Promise<Concept[]> {
    // 1. Trouver le concept cible
    const target = await this.findConceptByCode(
      organizationId,
      matiere,
      conceptCode,
    );

    // 2. Charger TOUTES les arêtes prérequis pour cette org/matière en une seule requête
    //    + tous les concepts de la matière pour reconstituer les nœuds
    const [allEdges, allConcepts, masteries] = await Promise.all([
      this.prisma.conceptPrerequisite.findMany({
        where: {
          concept: { organizationId, matiere },
        },
        select: { conceptId: true, prerequisiteId: true },
      }),
      this.prisma.concept.findMany({
        where: { organizationId, matiere },
      }),
      this.prisma.skillMastery.findMany({
        where: { organizationId, eleveId, matiere },
        select: { skill: true, probMastery: true },
      }),
    ]);

    // 3. Construire la map conceptId → prerequisiteIds et la map id → Concept
    const prereqMap = new Map<string, string[]>();
    for (const edge of allEdges) {
      if (!prereqMap.has(edge.conceptId)) {
        prereqMap.set(edge.conceptId, []);
      }
      prereqMap.get(edge.conceptId)!.push(edge.prerequisiteId);
    }

    const conceptById = new Map<string, Concept>(
      allConcepts.map((c) => [c.id, c]),
    );

    // 4. Construire la map skill → probMastery
    //    Convention : le skill d'un concept = "<matiere>:<code>"
    const masteryMap = new Map<string, number>();
    for (const m of masteries) {
      masteryMap.set(m.skill, m.probMastery);
    }

    // 5. BFS depuis le concept cible, remonte les arêtes
    const visited = new Set<string>();
    const queue: string[] = [target.id];
    const unmastered: Concept[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const prereqIds = prereqMap.get(currentId) ?? [];
      for (const prereqId of prereqIds) {
        if (visited.has(prereqId)) continue;

        const prereqConcept = conceptById.get(prereqId);
        if (!prereqConcept) continue;

        const skillKey = `${prereqConcept.matiere}:${prereqConcept.code}`;
        const prob = masteryMap.get(skillKey) ?? 0;

        if (prob < MASTERY_THRESHOLD) {
          unmastered.push(prereqConcept);
        }

        // Continuer à remonter même si ce nœud est maîtrisé
        // (ses prérequis pourraient ne pas l'être)
        queue.push(prereqId);
      }
    }

    return unmastered;
  }

  // ---------- Recommandation prochain concept ----------

  /**
   * Recommande le prochain concept à apprendre :
   * celui dont TOUS les prérequis directs sont maîtrisés (probMastery >= 0.9)
   * et qui n'est pas encore maîtrisé lui-même.
   */
  async getNextConcept(
    organizationId: string,
    eleveId: string,
    matiere: string,
    niveau: string,
  ): Promise<Concept | null> {
    const [concepts, allEdges, masteries] = await Promise.all([
      this.prisma.concept.findMany({
        where: { organizationId, matiere, niveau },
      }),
      this.prisma.conceptPrerequisite.findMany({
        where: { concept: { organizationId, matiere, niveau } },
        select: { conceptId: true, prerequisiteId: true },
      }),
      this.prisma.skillMastery.findMany({
        where: { organizationId, eleveId, matiere },
        select: { skill: true, probMastery: true },
      }),
    ]);

    const masteryMap = new Map<string, number>();
    for (const m of masteries) {
      masteryMap.set(m.skill, m.probMastery);
    }

    // Map conceptId → liste des prerequisiteIds
    const prereqMap = new Map<string, string[]>();
    for (const edge of allEdges) {
      if (!prereqMap.has(edge.conceptId)) {
        prereqMap.set(edge.conceptId, []);
      }
      prereqMap.get(edge.conceptId)!.push(edge.prerequisiteId);
    }

    // Map conceptId → concept (pour résoudre les prérequis)
    const conceptById = new Map<string, Concept>(
      concepts.map((c) => [c.id, c]),
    );

    for (const concept of concepts) {
      const skillKey = `${concept.matiere}:${concept.code}`;
      const isMastered = (masteryMap.get(skillKey) ?? 0) >= MASTERY_THRESHOLD;
      if (isMastered) continue; // Déjà maîtrisé — ignorer

      const prereqIds = prereqMap.get(concept.id) ?? [];
      const allPrereqsMastered = prereqIds.every((prereqId) => {
        const prereq = conceptById.get(prereqId);
        if (!prereq) return true; // Prérequis inconnu → considéré OK
        const prereqSkill = `${prereq.matiere}:${prereq.code}`;
        return (masteryMap.get(prereqSkill) ?? 0) >= MASTERY_THRESHOLD;
      });

      if (allPrereqsMastered) {
        return concept;
      }
    }

    return null;
  }

  // ---------- Liste ----------

  async findAll(
    organizationId: string,
    matiere: string,
    niveau?: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<{
    items: Concept[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const clampedLimit = Math.min(limit, MAX_PAGE_SIZE);
    const where: Prisma.ConceptWhereInput = {
      organizationId,
      matiere,
      ...(niveau ? { niveau } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.concept.findMany({
        where,
        orderBy: [{ niveau: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * clampedLimit,
        take: clampedLimit,
      }),
      this.prisma.concept.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit: clampedLimit,
      totalPages: Math.ceil(total / clampedLimit),
    };
  }

  // ---------- Privé ----------

  private async findConceptByCode(
    organizationId: string,
    matiere: string,
    code: string,
  ): Promise<Concept> {
    const concept = await this.prisma.concept.findFirst({
      where: { organizationId, matiere, code },
    });
    if (!concept) {
      throw new NotFoundException(
        `Concept "${code}" introuvable pour la matière "${matiere}".`,
      );
    }
    return concept;
  }
}
