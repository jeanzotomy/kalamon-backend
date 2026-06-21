// ⚠️ GNF / XOF / XAF n'ont PAS de centimes (ISO 4217 exponent = 0).
// EUR/USD = 2. Ne jamais multiplier un montant GNF par 100.
const CURRENCY_EXPONENT: Record<string, number> = {
  GNF: 0,
  XOF: 0,
  XAF: 0,
  EUR: 2,
  USD: 2,
};

export function toSmallestUnit(amount: number, currency: string): number {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return Math.round(amount * 10 ** exp);
}

export function fromSmallestUnit(amount: number, currency: string): number {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return amount / 10 ** exp;
}

// Pays (ISO 3166-1 alpha-2) -> devise mobile money.
// Zone franc CFA Ouest = XOF, Afrique centrale = XAF, Guinée = GNF.
const COUNTRY_CURRENCY: Record<string, 'GNF' | 'XOF' | 'XAF'> = {
  GN: 'GNF',
  // UEMOA / XOF (Afrique de l'Ouest francophone)
  SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', TG: 'XOF', BJ: 'XOF', NE: 'XOF', GW: 'XOF',
  // CEMAC / XAF (Afrique centrale)
  CM: 'XAF', CF: 'XAF', TD: 'XAF', CG: 'XAF', GA: 'XAF', GQ: 'XAF',
};

export function currencyForCountry(iso: string | undefined, fallback: 'GNF' | 'XOF' | 'XAF'): 'GNF' | 'XOF' | 'XAF' {
  if (!iso) return fallback;
  return COUNTRY_CURRENCY[iso.toUpperCase()] ?? fallback;
}
