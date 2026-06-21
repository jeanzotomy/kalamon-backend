// Seed minimal : une école, un directeur, une leçon, un quiz.
// NE JAMAIS exclure ce fichier de tsconfig.build (sinon base vide en prod).
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AI_COURSES } from './content/ai-courses';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'École pilote Conakry',
      country: 'GN',
    },
  });

  const passwordHash = await argon2.hash('Kalamon2026!');

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'directeur@kalamon.gn' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'directeur@kalamon.gn',
      passwordHash,
      fullName: 'Directeur Pilote',
      role: Role.DIRECTEUR,
    },
  });

  const lesson = await prisma.lesson.create({
    data: {
      organizationId: org.id,
      matiere: 'Mathématiques',
      niveau: 'CM2',
      titre: 'Les fractions',
      contenu:
        "Une fraction représente une partie d'un tout. Le numérateur (en haut) indique combien de parts on prend, le dénominateur (en bas) en combien de parts le tout est divisé.",
    },
  });

  await prisma.quiz.create({
    data: {
      organizationId: org.id,
      lessonId: lesson.id,
      niveau: 'CM2',
      titre: 'Quiz — Les fractions',
      questions: {
        create: [
          {
            enonce: 'Dans la fraction 3/4, quel est le numérateur ?',
            options: ['3', '4', '7', '1'],
            bonneRep: 0,
            explication: 'Le numérateur est le nombre du haut : 3.',
          },
        ],
      },
    },
  });

  // ---------- Cours d'initiation à l'IA (gradués par niveau) ----------
  let aiCreated = 0;
  for (const course of AI_COURSES) {
    const exists = await prisma.lesson.findFirst({
      where: {
        organizationId: org.id,
        matiere: course.matiere,
        niveau: course.niveau,
        titre: course.titre,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (exists) continue; // idempotent

    const aiLesson = await prisma.lesson.create({
      data: {
        organizationId: org.id,
        matiere: course.matiere,
        niveau: course.niveau,
        titre: course.titre,
        contenu: course.contenu,
      },
    });

    await prisma.quiz.create({
      data: {
        organizationId: org.id,
        lessonId: aiLesson.id,
        niveau: course.niveau,
        titre: course.quiz.titre,
        questions: {
          create: course.quiz.questions.map((q) => ({
            enonce: q.enonce,
            options: q.options,
            bonneRep: q.bonneRep,
            explication: q.explication,
          })),
        },
      },
    });
    aiCreated++;
  }

  console.log(`Seed terminé : organisation, directeur, leçon, quiz + ${aiCreated} cours IA.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
