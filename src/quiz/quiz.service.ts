import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { env } from '../config/env';

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  // Enregistre une tentative : calcule le score côté serveur, attribue les points.
  async attempt(organizationId: string, quizId: string, eleveId: string, answers: number[]) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, organizationId, deletedAt: null },
      include: {
        questions: { select: { bonneRep: true }, orderBy: { id: 'asc' } },
        lesson: { select: { matiere: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz introuvable');

    const eleve = await this.prisma.eleve.findFirst({
      where: { id: eleveId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!eleve) throw new ForbiddenException('Élève hors de votre organisation');

    const total = quiz.questions.length;
    const correct = quiz.questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.bonneRep ? 1 : 0),
      0,
    );
    const points = correct * env.POINTS_PER_QUIZ_CORRECT;
    const matiere = quiz.lesson?.matiere ?? 'Quiz';

    await this.prisma.quizAttempt.create({
      data: { organizationId, eleveId, quizId, score: correct, total, points },
    });
    await this.gamification.awardForQuiz(eleveId, matiere, correct, total);

    return { score: correct, total, points };
  }

  async parNiveau(organizationId: string, niveau: string) {
    return this.prisma.quiz.findMany({
      where: { organizationId, niveau, deletedAt: null },
      select: { id: true, titre: true, niveau: true },
    });
  }

  async detail(organizationId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, organizationId, deletedAt: null },
      include: {
        questions: {
          // bonneRep exclu : ne doit jamais quitter le serveur (scoring côté serveur uniquement).
          select: { id: true, enonce: true, options: true },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz introuvable');
    return quiz;
  }
}
