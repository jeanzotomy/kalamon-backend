import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParentService } from './parent.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('parent')
@UseGuards(JwtAuthGuard)
@Controller('parent')
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.parent.dashboard(user.organizationId, user.userId);
  }

  @Post('rapport-hebdo')
  rapport(@CurrentUser() user: AuthUser) {
    return this.parent.envoyerRapportHebdo(user.organizationId, user.userId);
  }
}
