import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CinetPayProvider } from './providers/cinetpay.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CheckoutInput } from './dto/checkout.dto';
import { toSmallestUnit, currencyForCountry } from './currency.util';
import { MobileMoneyProvider, PaymentStatus, SupportedCurrency } from './mobile-money.interface';
import { env } from '../config/env';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<string, MobileMoneyProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cinetpay: CinetPayProvider,
    private readonly subscriptions: SubscriptionsService,
  ) {
    this.providers = new Map([[cinetpay.name, cinetpay]]);
  }

  /** Prix résolu côté serveur (jamais depuis le client), selon la devise du pays. */
  private priceFor(purpose: string, currency: SupportedCurrency): number {
    const byCurrency: Record<string, Record<SupportedCurrency, number>> = {
      premium_monthly: {
        GNF: env.PRICE_PREMIUM_MONTHLY_GNF,
        XOF: env.PRICE_PREMIUM_MONTHLY_XOF,
        XAF: env.PRICE_PREMIUM_MONTHLY_XAF,
      },
    };
    const major = byCurrency[purpose]?.[currency];
    if (major == null) throw new BadRequestException(`Motif de paiement inconnu: ${purpose}`);
    return toSmallestUnit(major, currency);
  }

  private requireUrls(): { notifyUrl: string; returnUrl: string } {
    if (!env.PAYMENT_NOTIFY_URL || !env.PAYMENT_RETURN_URL) {
      throw new BadRequestException('PAYMENT_NOTIFY_URL / PAYMENT_RETURN_URL non configurés');
    }
    return { notifyUrl: env.PAYMENT_NOTIFY_URL, returnUrl: env.PAYMENT_RETURN_URL };
  }

  async createCheckout(organizationId: string, userId: string, dto: CheckoutInput) {
    const provider = this.providers.get(env.PAYMENT_PROVIDER);
    if (!provider) throw new BadRequestException(`Provider ${env.PAYMENT_PROVIDER} indisponible`);

    if (dto.eleveId) {
      const eleve = await this.prisma.eleve.findFirst({
        where: { id: dto.eleveId, organizationId, deletedAt: null },
      });
      if (!eleve) throw new NotFoundException('Élève introuvable dans votre organisation');
    }

    // Devise dérivée du PAYS du payeur (mobile money opère dans son pays).
    const payer = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { country: true },
    });
    const currency = currencyForCountry(payer?.country, env.PAYMENT_CURRENCY);

    const amount = this.priceFor(dto.purpose, currency);
    const orderId = `kal_${randomUUID()}`;
    const { notifyUrl, returnUrl } = this.requireUrls();

    const result = await provider.initiate({
      amount,
      currency,
      phone: dto.phone,
      description: `Kalamon — ${dto.purpose}`,
      orderId,
      notifyUrl: `${notifyUrl}/${provider.name}`,
      returnUrl,
    });

    await this.prisma.payment.create({
      data: {
        organizationId,
        userId,
        eleveId: dto.eleveId,
        orderId,
        transactionId: result.transactionId,
        provider: provider.name,
        purpose: dto.purpose,
        amount,
        currency,
        phone: dto.phone,
        status: result.status,
        redirectUrl: result.redirectUrl,
      },
    });

    return { orderId, redirectUrl: result.redirectUrl, amount, currency };
  }

  /**
   * Vérifie la signature HMAC du webhook. Retourne `true` si :
   * - le provider ne gère pas HMAC (pas de méthode `verifyHmac`), ou
   * - CINETPAY_SECRET_KEY absent (mode dev sans secret configuré), ou
   * - la signature correspond au body re-sérialisé en JSON.
   * Retourne `false` uniquement si un secret est configuré et la signature est fausse/absente.
   */
  verifyWebhookSignature(
    providerName: string,
    body: Record<string, unknown>,
    signature: string | undefined,
  ): boolean {
    const provider = this.providers.get(providerName);
    if (!provider || !('verifyHmac' in provider)) return true;
    const p = provider as { verifyHmac: (raw: string, sig: string) => boolean };
    if (!signature) {
      // Si CINETPAY_SECRET_KEY absent, on laisse passer (pas de secret configuré).
      return !env.CINETPAY_SECRET_KEY;
    }
    return p.verifyHmac(JSON.stringify(body), signature);
  }

  /**
   * Webhook (notify). Le statut N'EST JAMAIS déduit du body : on revérifie
   * toujours serveur-à-serveur via l'API du provider (anti-fraude).
   */
  async handleNotify(providerName: string, body: Record<string, unknown>): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    const orderId =
      (body.cpm_trans_id as string) || (body.transaction_id as string) || '';
    if (!orderId) return;

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment || payment.status === 'SUCCESS') return; // idempotent

    const status = await provider.verify(orderId);
    if (status === 'PENDING') return;

    await this.applyStatus(orderId, status, body);
  }

  private async applyStatus(orderId: string, status: PaymentStatus, raw?: unknown): Promise<void> {
    const updated = await this.prisma.payment.update({
      where: { orderId },
      data: {
        status,
        completedAt: status === 'SUCCESS' ? new Date() : null,
        ...(raw ? { metadata: raw as Prisma.InputJsonValue } : {}),
      },
    });

    if (status === 'SUCCESS') {
      await this.grantEntitlement(updated.organizationId, updated.eleveId, updated.purpose, updated.id);
      this.logger.log(`Paiement ${orderId} confirmé (${updated.amount} ${updated.currency}).`);
    }
  }

  /**
   * Déblocage de l'accès après paiement confirmé : crée ou prolonge
   * l'abonnement correspondant au motif (premium_monthly → +1 mois).
   * Idempotent : ne s'exécute que sur la 1re confirmation (handleNotify/getStatus
   * ignorent les paiements déjà SUCCESS).
   */
  private async grantEntitlement(
    organizationId: string,
    eleveId: string | null,
    purpose: string,
    paymentId: string,
  ): Promise<void> {
    const plan = this.subscriptions.planForPurpose(purpose);
    if (!plan) return; // motif sans abonnement (paiement unique)
    await this.subscriptions.grantOrExtend({
      organizationId,
      eleveId,
      plan,
      months: 1, // premium_monthly
      lastPaymentId: paymentId,
    });
  }

  async getStatus(organizationId: string, orderId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { orderId, organizationId } });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    // Si encore en attente, on tente une revérification active (utile si le
    // webhook n'est pas encore arrivé).
    if (payment.status === 'PENDING') {
      const provider = this.providers.get(payment.provider);
      if (provider) {
        const status = await provider.verify(orderId);
        if (status !== 'PENDING') {
          await this.applyStatus(orderId, status);
          return { orderId, status };
        }
      }
    }
    return { orderId, status: payment.status as PaymentStatus };
  }
}
