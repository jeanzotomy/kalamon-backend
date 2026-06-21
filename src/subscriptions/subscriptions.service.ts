import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionStatus {
  plan: string;
  active: boolean;
  expiresAt: Date | null;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Mappe un motif de paiement vers un plan d'abonnement. */
  planForPurpose(purpose: string): string | null {
    const map: Record<string, string> = { premium_monthly: 'premium' };
    return map[purpose] ?? null;
  }

  private addMonths(from: Date, months: number): Date {
    const d = new Date(from);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  /**
   * Crée ou prolonge un abonnement. Si un abonnement existe déjà, on prolonge
   * à partir de la date d'expiration restante (si encore valide) ou de maintenant.
   */
  async grantOrExtend(params: {
    organizationId: string;
    eleveId: string | null;
    plan: string;
    months?: number;
    lastPaymentId?: string;
  }): Promise<void> {
    const { organizationId, eleveId, plan, months = 1, lastPaymentId } = params;
    const now = new Date();

    const existing = await this.prisma.subscription.findFirst({
      where: { organizationId, eleveId: eleveId ?? null, plan, status: 'ACTIVE' },
      orderBy: { expiresAt: 'desc' },
    });

    const base = existing && existing.expiresAt > now ? existing.expiresAt : now;
    const expiresAt = this.addMonths(base, months);

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data: { expiresAt, status: 'ACTIVE', lastPaymentId },
      });
    } else {
      await this.prisma.subscription.create({
        data: { organizationId, eleveId: eleveId ?? null, plan, startedAt: now, expiresAt, lastPaymentId },
      });
    }
    this.logger.log(`Abonnement ${plan} accordé/prolongé jusqu'au ${expiresAt.toISOString()} (eleve=${eleveId ?? 'org'}).`);
  }

  /** Statut effectif : actif si ACTIVE et non expiré (calcul dynamique). */
  async getStatus(
    organizationId: string,
    eleveId: string | null,
    plan = 'premium',
  ): Promise<SubscriptionStatus> {
    const sub = await this.prisma.subscription.findFirst({
      where: { organizationId, eleveId: eleveId ?? null, plan, status: 'ACTIVE' },
      orderBy: { expiresAt: 'desc' },
    });
    const active = !!sub && sub.expiresAt > new Date();
    return { plan, active, expiresAt: sub?.expiresAt ?? null };
  }

  /** Helper réutilisable pour protéger une fonctionnalité premium. */
  async isPremiumActive(organizationId: string, eleveId: string | null): Promise<boolean> {
    return (await this.getStatus(organizationId, eleveId, 'premium')).active;
  }
}
