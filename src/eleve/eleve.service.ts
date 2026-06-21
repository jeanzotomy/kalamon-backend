import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EleveService {
  constructor(private readonly prisma: PrismaService) {}

  // Tableau de bord élève : progression + leçons du jour (isolé par orgId).
  async dashboard(organizationId: string, eleveId: string) {
    const eleve = await this.prisma.eleve.findFirst({
      where: { id: eleveId, organizationId, deletedAt: null },
      include: { user: { select: { fullName: true } }, progress: true },
    });
    if (!eleve) throw new NotFoundException('Élève introuvable');

    // country pilote le programme localisé (histoire/géo du pays) côté UI

    const lessons = await this.prisma.lesson.findMany({
      where: { organizationId, niveau: eleve.niveau, deletedAt: null },
      select: { id: true, matiere: true, titre: true },
      take: 5,
    });

    const points = eleve.progress.reduce((acc, p) => acc + p.points, 0);
    return {
      eleve: { id: eleve.id, nom: eleve.user.fullName, niveau: eleve.niveau, country: eleve.country, points },
      progression: eleve.progress,
      lessonsDuJour: lessons,
    };
  }
}
