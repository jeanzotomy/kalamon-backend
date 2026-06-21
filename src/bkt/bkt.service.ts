import { Injectable } from '@nestjs/common';
import { SkillMastery } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bayesian Knowledge Tracing (BKT) — OATutor/Berkeley pattern.
 *
 * 4 paramètres par compétence × élève :
 *   probMastery : P(Know)  — estimation courante de maîtrise
 *   probTransit : P(T)     — proba d'apprendre à chaque réponse
 *   probSlip    : P(S)     — proba d'erreur malgré la maîtrise
 *   probGuess   : P(G)     — proba de bonne réponse par hasard
 *
 * Formule de mise à jour (Corbett & Anderson 1994) :
 *
 *   Si correct :
 *     P(Know | correct) = P(Know) × (1-P(S)) / [ P(Know)×(1-P(S)) + (1-P(Know))×P(G) ]
 *
 *   Si incorrect :
 *     P(Know | incorrect) = P(Know) × P(S) / [ P(Know)×P(S) + (1-P(Know))×(1-P(G)) ]
 *
 *   Transit (toujours appliqué après la mise à jour bayésienne) :
 *     P(Know_new) = P(Know_updated) + (1 - P(Know_updated)) × P(T)
 */
@Injectable()
export class BktService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retourne l'entrée SkillMastery existante ou la crée avec les valeurs BKT par défaut.
   * Isolation multi-tenant : organizationId obligatoire.
   */
  async getOrCreate(
    organizationId: string,
    eleveId: string,
    skill: string,
    matiere: string,
  ): Promise<SkillMastery> {
    return this.prisma.skillMastery.upsert({
      where: { eleveId_skill: { eleveId, skill } },
      update: {},
      create: {
        organizationId,
        eleveId,
        skill,
        matiere,
        // Valeurs par défaut BKT conservatrices — correspondent aux defaults du schéma
        probMastery: 0.1,
        probTransit: 0.3,
        probSlip: 0.1,
        probGuess: 0.2,
        attempts: 0,
        correctCount: 0,
      },
    });
  }

  /**
   * Applique la formule BKT après une réponse de l'élève.
   * Retourne l'état mis à jour (probMastery, attempts, correctCount).
   */
  async update(
    skillMasteryId: string,
    isCorrect: boolean,
  ): Promise<SkillMastery> {
    const entry = await this.prisma.skillMastery.findUniqueOrThrow({
      where: { id: skillMasteryId },
    });

    const { probMastery, probTransit, probSlip, probGuess } = entry;

    // Étape 1 : mise à jour bayésienne
    let pKnowUpdated: number;
    if (isCorrect) {
      const numerator = probMastery * (1 - probSlip);
      const denominator = numerator + (1 - probMastery) * probGuess;
      pKnowUpdated = denominator > 0 ? numerator / denominator : probMastery;
    } else {
      const numerator = probMastery * probSlip;
      const denominator = numerator + (1 - probMastery) * (1 - probGuess);
      pKnowUpdated = denominator > 0 ? numerator / denominator : probMastery;
    }

    // Étape 2 : application du transit (toujours)
    const pKnowNew = pKnowUpdated + (1 - pKnowUpdated) * probTransit;

    // Borne dans [0, 1] pour éviter les dérives numériques
    const probMasteryNew = Math.min(1, Math.max(0, pKnowNew));

    return this.prisma.skillMastery.update({
      where: { id: skillMasteryId },
      data: {
        probMastery: probMasteryNew,
        attempts: { increment: 1 },
        correctCount: isCorrect ? { increment: 1 } : undefined,
        lastPracticed: new Date(),
      },
    });
  }

  /**
   * Retourne la probabilité de maîtrise courante pour un élève + skill.
   * Retourne null si aucune trace BKT n'existe encore.
   */
  async getMastery(eleveId: string, skill: string): Promise<number | null> {
    const entry = await this.prisma.skillMastery.findUnique({
      where: { eleveId_skill: { eleveId, skill } },
      select: { probMastery: true },
    });
    return entry?.probMastery ?? null;
  }

  /**
   * Retourne true si la maîtrise dépasse le seuil (défaut 0.9).
   * Retourne false si aucune trace BKT (pas encore pratiqué = non maîtrisé).
   */
  async isMastered(
    eleveId: string,
    skill: string,
    threshold = 0.9,
  ): Promise<boolean> {
    const mastery = await this.getMastery(eleveId, skill);
    if (mastery === null) return false;
    return mastery >= threshold;
  }
}
