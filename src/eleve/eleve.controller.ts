import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EleveService } from './eleve.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('eleve')
@UseGuards(JwtAuthGuard)
@Controller('eleve')
export class EleveController {
  constructor(private readonly eleve: EleveService) {}

  @Get(':id/dashboard')
  dashboard(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // orgId vient du token, jamais du client (isolation multi-tenant)
    return this.eleve.dashboard(user.organizationId, id);
  }
}
