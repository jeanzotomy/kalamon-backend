import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ajoute des points sur la progression (eleve, matière). */
  private async addPoints(eleveId: string, matiere: string, points: number, score?: number): Promise<void> {
    await this.prisma.progress.upsert({
      where: { eleveId_matiere: { eleveId, matiere } },
      create: { eleveId, matiere, points, score: score ?? 0 },
      update: {
        points: { increment: points },
        ...(score != null ? { score } : {}),
      },
    });
  }

  awardForLesson(eleveId: string, matiere: string): Promise<void> {
    return this.addPoints(eleveId, matiere, env.POINTS_PER_LESSON);
  }

  awardForQuiz(eleveId: string, matiere: string, correct: number, total: number): Promise<void> {
    const points = correct * env.POINTS_PER_QUIZ_CORRECT;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return this.addPoints(eleveId, matiere, points, score);
  }

  /** Statut gamification d'un élève : total points + badges. */
  async status(organizationId: string, eleveId: string) {
    const eleve = await this.prisma.eleve.findFirst({
      where: { id: eleveId, organizationId, deletedAt: null },
      include: { progress: true },
    });
    const points = eleve?.progress.reduce((a, p) => a + p.points, 0) ?? 0;

    const badges = await this.prisma.eleveBadge.findMany({
      where: { eleveId },
      include: { badge: { select: { code: true, nom: true, description: true } } },
      orderBy: { obtainedAt: 'desc' },
    });

    return {
      points,
      badges: badges.map((b) => ({ code: b.badge.code, nom: b.badge.nom, description: b.badge.description })),
    };
  }

  /** Classement des élèves de l'organisation par points (top N). */
  async leaderboard(organizationId: string, limit = 20) {
    const rows = await this.prisma.progress.groupBy({
      by: ['eleveId'],
      where: { eleve: { organizationId, deletedAt: null } },
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: limit,
    });
    const eleves = await this.prisma.eleve.findMany({
      where: { id: { in: rows.map((r) => r.eleveId) } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    const nameById = new Map(eleves.map((e) => [e.id, e.user.fullName]));
    return rows.map((r, i) => ({
      rang: i + 1,
      eleveId: r.eleveId,
      nom: nameById.get(r.eleveId) ?? 'Élève',
      points: r._sum.points ?? 0,
    }));
  }
}
