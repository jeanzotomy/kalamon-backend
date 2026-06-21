import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentService {
  constructor(private readonly prisma: PrismaService) {}

  // Tableau de bord parent : synthèse des enfants liés.
  async dashboard(organizationId: string, parentUserId: string) {
    const links = await this.prisma.parentEleve.findMany({
      where: { parentId: parentUserId },
      include: {
        eleve: {
          include: { user: { select: { fullName: true } }, progress: true },
        },
      },
    });

    return links
      .filter((l) => l.eleve.organizationId === organizationId)
      .map((l) => ({
        eleveId: l.eleve.id,
        nom: l.eleve.user.fullName,
        niveau: l.eleve.niveau,
        points: l.eleve.progress.reduce((a, p) => a + p.points, 0),
        difficultes: l.eleve.progress.filter((p) => p.score < 50).map((p) => p.matiere),
      }));
  }

  // Stub : rapport hebdo poussé vers WhatsApp/SMS.
  // TODO: brancher WhatsApp Business API / passerelle SMS Afrique.
  async envoyerRapportHebdo(organizationId: string, parentUserId: string): Promise<{ envoye: boolean }> {
    const data = await this.dashboard(organizationId, parentUserId);
    // Ici : formater + envoyer via WhatsApp/SMS (provider à brancher).
    void data;
    return { envoye: true };
  }
}
