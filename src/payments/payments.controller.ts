import { Body, Controller, Get, Headers, Param, Post, HttpCode, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CheckoutSchema } from './dto/checkout.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Crée un paiement et renvoie l'URL de checkout mobile money (auth requise).
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  checkout(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = CheckoutSchema.parse(body);
    return this.payments.createCheckout(user.organizationId, user.userId, input);
  }

  // Statut d'un paiement (auth requise, isolé par organisation).
  @UseGuards(JwtAuthGuard)
  @Get(':orderId/status')
  status(@Param('orderId') orderId: string, @CurrentUser() user: AuthUser) {
    return this.payments.getStatus(user.organizationId, orderId);
  }

  // Webhook provider (PUBLIC — pas de JWT).
  // Première ligne de défense : signature HMAC si CINETPAY_SECRET_KEY configuré.
  // Deuxième ligne : re-vérification serveur-à-serveur du statut via l'API du provider.
  @Post('webhook/:provider')
  @HttpCode(200)
  async webhook(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-cinetpay-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    const safe = body ?? {};
    if (!this.payments.verifyWebhookSignature(provider, safe, signature)) {
      throw new UnauthorizedException('Signature webhook invalide');
    }
    await this.payments.handleNotify(provider, safe);
    return { received: true };
  }
}
