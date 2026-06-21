import { z } from 'zod';

// Validation des variables d'environnement au démarrage.
// Si une variable critique manque, l'app refuse de démarrer (fail fast).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET doit faire au moins 16 caractères'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('kalamon_token'),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  LLM_PROVIDER: z.enum(['anthropic', 'azure-openai']).default('anthropic'),
  LLM_MODEL: z.string().default('claude-haiku-4-5'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),

  EMBEDDING_PROVIDER: z.enum(['openai', 'azure-openai']).default('openai'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIM: z.coerce.number().default(1536),
  OPENAI_API_KEY: z.string().optional(),

  AI_DAILY_BUDGET_PER_STUDENT: z.coerce.number().default(120),
  SEMANTIC_CACHE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),

  // --- Paiement mobile money ---
  PAYMENT_PROVIDER: z.enum(['cinetpay']).default('cinetpay'),
  PAYMENT_CURRENCY: z.enum(['GNF', 'XOF', 'XAF']).default('GNF'),
  // URL publique de notre webhook (notify) + URL de retour navigateur
  PAYMENT_NOTIFY_URL: z.string().url().optional(),
  PAYMENT_RETURN_URL: z.string().url().optional(),
  // CinetPay
  CINETPAY_API_KEY: z.string().optional(),
  CINETPAY_SITE_ID: z.string().optional(),
  CINETPAY_SECRET_KEY: z.string().optional(), // pour vérif HMAC du webhook (optionnel)
  // Tarifs premium mensuel PAR DEVISE (unité majeure ; jamais fixés par le client).
  // La devise est dérivée du pays de l'utilisateur (voir currencyForCountry).
  PRICE_PREMIUM_MONTHLY_GNF: z.coerce.number().default(20000), // ~2 USD
  PRICE_PREMIUM_MONTHLY_XOF: z.coerce.number().default(1000), // ~1,7 USD
  PRICE_PREMIUM_MONTHLY_XAF: z.coerce.number().default(1000), // ~1,7 USD

  // --- Stockage médias : Cloudflare R2 (S3-compatible, egress gratuit) ---
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('kalamon'),
  // base publique du bucket (custom domain R2 ou r2.dev) pour servir les fichiers
  R2_PUBLIC_BASE: z.string().optional(),

  // Points de gamification (constantes nommées, pas de valeur magique)
  POINTS_PER_LESSON: z.coerce.number().default(10),
  POINTS_PER_QUIZ_CORRECT: z.coerce.number().default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Variables d\'environnement invalides:', parsed.error.flatten().fieldErrors);
    throw new Error('Configuration invalide — voir .env.example');
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
