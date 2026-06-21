import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EleveModule } from './eleve/eleve.module';
import { ParentModule } from './parent/parent.module';
import { KalamonModule } from './kalamon/kalamon.module';
import { QuizModule } from './quiz/quiz.module';
import { LessonsModule } from './lessons/lessons.module';
import { PaymentsModule } from './payments/payments.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { GamificationModule } from './gamification/gamification.module';
import { StorageModule } from './storage/storage.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { VoiceModule } from './voice/voice.module';
import { MemoryModule } from './memory/memory.module';
import { ConceptModule } from './concept/concept.module';
import { HintModule } from './hint/hint.module';
import { env } from './config/env';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_EXPIRES_IN },
    }),
    StorageModule,
    IngestionModule,
    VoiceModule,
    GamificationModule,
    AuthModule,
    EleveModule,
    ParentModule,
    KalamonModule,
    MemoryModule,
    ConceptModule,
    HintModule,
    QuizModule,
    LessonsModule,
    PaymentsModule,
    SubscriptionsModule,
  ],
})
export class AppModule {}
