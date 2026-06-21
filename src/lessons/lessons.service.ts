import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { env } from '../config/env';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  // Marque une leçon terminée pour un élève et attribue des points.
  async complete(organizationId: string, lessonId: string, eleveId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, organizationId, deletedAt: null },
      select: { matiere: true },
    });
    if (!lesson) throw new NotFoundException('Cours introuvable');

    const eleve = await this.prisma.eleve.findFirst({
      where: { id: eleveId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!eleve) throw new ForbiddenException('Élève hors de votre organisation');

    await this.gamification.awardForLesson(eleveId, lesson.matiere);
    return { ok: true, points: env.POINTS_PER_LESSON };
  }

  // Liste des cours, filtrable par niveau et matière (ex: "Initiation à l'IA").
  async list(organizationId: string, niveau?: string, matiere?: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(niveau ? { niveau } : {}),
        ...(matiere ? { matiere } : {}),
      },
      select: { id: true, matiere: true, niveau: true, titre: true, contenu: true },
      orderBy: [{ matiere: 'asc' }, { titre: 'asc' }],
    });
    // resume = extrait court (la liste reste légère ; détail via GET /lessons/:id)
    return lessons.map((l) => ({
      id: l.id,
      matiere: l.matiere,
      niveau: l.niveau,
      titre: l.titre,
      resume: l.contenu.slice(0, 160) + (l.contenu.length > 160 ? '…' : ''),
    }));
  }

  // Matières distinctes disponibles (pour afficher des catégories, ex. "Initiation à l'IA").
  async matieres(organizationId: string, niveau?: string) {
    const rows = await this.prisma.lesson.findMany({
      where: { organizationId, deletedAt: null, ...(niveau ? { niveau } : {}) },
      select: { matiere: true },
      distinct: ['matiere'],
      orderBy: { matiere: 'asc' },
    });
    return rows.map((r) => r.matiere);
  }

  async detail(organizationId: string, id: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, matiere: true, niveau: true, titre: true, contenu: true },
    });
    if (!lesson) throw new NotFoundException('Cours introuvable');
    return lesson;
  }
}
