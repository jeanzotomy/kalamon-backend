import { z } from 'zod';

// Le client choisit un MOTIF, pas un montant : le prix est résolu côté serveur.
export const CheckoutSchema = z.object({
  purpose: z.enum(['premium_monthly']).default('premium_monthly'),
  eleveId: z.string().uuid().optional(),
  phone: z.string().min(8).max(20).optional(), // E.164 +224...
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;
