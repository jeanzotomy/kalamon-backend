import { z } from 'zod';

// Zod = source de vérité de la validation. Validation explicite dans le controller.
export const RegisterSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  fullName: z.string().min(2),
  role: z.enum(['ELEVE', 'PARENT', 'ENSEIGNANT', 'DIRECTEUR', 'ADMIN']),
  phone: z.string().optional(),
  niveau: z.string().optional(), // requis si role = ELEVE
  // Pays ISO 3166-1 alpha-2 (détecté à l'inscription, app panafricaine)
  country: z.string().length(2).optional(),
});

export const LoginSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
