import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const CompleteSchema = z.object({ eleveId: z.string().uuid() });

@ApiTags('lessons')
@UseGuards(JwtAuthGuard)
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  // Routes fixes avant la route paramétrée (ordre Fastify).
  @Get('matieres')
  matieres(@Query('niveau') niveau: string | undefined, @CurrentUser() user: AuthUser) {
    return this.lessons.matieres(user.organizationId, niveau);
  }

  @Get()
  list(
    @Query('niveau') niveau: string | undefined,
    @Query('matiere') matiere: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessons.list(user.organizationId, niveau, matiere);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessons.detail(user.organizationId, id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const { eleveId } = CompleteSchema.parse(body);
    return this.lessons.complete(user.organizationId, id, eleveId);
  }
}
