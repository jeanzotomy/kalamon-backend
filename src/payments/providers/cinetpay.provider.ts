import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import {
  MobileMoneyProvider,
  InitiateParams,
  InitiateResult,
  PaymentStatus,
} from '../mobile-money.interface';

/**
 * CinetPay — agrégateur mobile money multi-pays (Guinée GNF, XOF, XAF).
 * Couvre Orange Money, MTN, Moov, Wave via une seule API.
 * Docs: https://docs.cinetpay.com
 */
@Injectable()
export class CinetPayProvider implements MobileMoneyProvider {
  readonly name = 'cinetpay';
  private readonly logger = new Logger(CinetPayProvider.name);
  private readonly baseUrl = 'https://api-checkout.cinetpay.com/v2';

  private get apiKey(): string {
    if (!env.CINETPAY_API_KEY || !env.CINETPAY_SITE_ID) {
      throw new ServiceUnavailableException('CinetPay non configuré (CINETPAY_API_KEY / CINETPAY_SITE_ID)');
    }
    return env.CINETPAY_API_KEY;
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const payload = {
      apikey: this.apiKey,
      site_id: env.CINETPAY_SITE_ID,
      transaction_id: params.orderId,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      notify_url: params.notifyUrl,
      return_url: params.returnUrl,
      channels: 'MOBILE_MONEY',
      ...(params.phone ? { customer_phone_number: params.phone } : {}),
      metadata: JSON.stringify({ orderId: params.orderId }),
    };

    const data = await this.post('/payment', payload);
    // CinetPay renvoie code "201" en succès d'initialisation
    if (data.code !== '201' || !data.data?.payment_url) {
      this.logger.error(`Initiation CinetPay échouée: ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException(`CinetPay: ${data.message ?? 'initiation refusée'}`);
    }

    return {
      transactionId: params.orderId,
      status: 'PENDING',
      redirectUrl: data.data.payment_url,
    };
  }

  async verify(orderId: string): Promise<PaymentStatus> {
    const data = await this.post('/payment/check', {
      apikey: this.apiKey,
      site_id: env.CINETPAY_SITE_ID,
      transaction_id: orderId,
    });

    const map: Record<string, PaymentStatus> = {
      ACCEPTED: 'SUCCESS',
      REFUSED: 'FAILED',
      CANCELLED: 'CANCELLED',
      PENDING: 'PENDING',
    };
    return map[data.data?.status] ?? 'PENDING';
  }

  /** Vérif HMAC optionnelle du webhook (si CINETPAY_SECRET_KEY fourni). */
  verifyHmac(rawBody: string, receivedHex: string): boolean {
    if (!env.CINETPAY_SECRET_KEY) return false;
    const expected = createHmac('sha256', env.CINETPAY_SECRET_KEY).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(receivedHex));
    } catch {
      return false;
    }
  }

  private async post(path: string, body: unknown): Promise<any> {
    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000), // anti-blocage si provider down
      });
    } catch (e) {
      throw new ServiceUnavailableException(`CinetPay injoignable: ${(e as Error).message}`);
    }
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException(`Réponse CinetPay invalide (${resp.status})`);
    }
  }
}
