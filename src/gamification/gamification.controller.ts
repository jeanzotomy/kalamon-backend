import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('gamification')
@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  // Route fixe avant route paramétrée (ordre Fastify).
  @Get('leaderboard')
  leaderboard(@CurrentUser() user: AuthUser) {
    return this.gamification.leaderboard(user.organizationId);
  }

  @Get(':eleveId')
  status(@Param('eleveId') eleveId: string, @CurrentUser() user: AuthUser) {
    return this.gamification.status(user.organizationId, eleveId);
  }
}
