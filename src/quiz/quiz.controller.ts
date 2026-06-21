import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const AttemptSchema = z.object({
  eleveId: z.string().uuid(),
  answers: z.array(z.number().int().min(0)).min(1),
});

@ApiTags('quiz')
@UseGuards(JwtAuthGuard)
@Controller('quiz')
export class QuizController {
  constructor(private readonly quiz: QuizService) {}

  // Routes fixes avant routes paramétrées (ordre Fastify).
  @Get()
  parNiveau(@Query('niveau') niveau: string, @CurrentUser() user: AuthUser) {
    return this.quiz.parNiveau(user.organizationId, niveau);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quiz.detail(user.organizationId, id);
  }

  // Soumission d'un quiz : scoring serveur uniquement (bonneRep jamais exposé au client).
  @Post(':id/attempt')
  attempt(
    @Param('id') quizId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const { eleveId, answers } = AttemptSchema.parse(body);
    return this.quiz.attempt(user.organizationId, quizId, eleveId, answers);
  }
}
