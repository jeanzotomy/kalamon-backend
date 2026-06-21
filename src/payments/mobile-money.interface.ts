export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
export type SupportedCurrency = 'GNF' | 'XOF' | 'XAF';

export interface InitiateParams {
  amount: number; // dans la plus petite unité (GNF = valeur réelle)
  currency: SupportedCurrency;
  phone?: string; // E.164 +224...
  description: string;
  orderId: string; // notre référence idempotente
  notifyUrl: string; // webhook serveur-à-serveur
  returnUrl: string; // redirection navigateur après paiement
}

export interface InitiateResult {
  transactionId: string;
  status: PaymentStatus;
  redirectUrl?: string;
}

export interface MobileMoneyProvider {
  readonly name: string;
  initiate(params: InitiateParams): Promise<InitiateResult>;
  verify(orderId: string): Promise<PaymentStatus>;
}
