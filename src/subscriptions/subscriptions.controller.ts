import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('subscriptions')
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  // Statut d'abonnement premium pour un élève (ou l'organisation si eleveId absent).
  @Get('status')
  status(@Query('eleveId') eleveId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.subs.getStatus(user.organizationId, eleveId ?? null, 'premium');
  }
}
