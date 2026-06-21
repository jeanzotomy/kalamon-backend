# Kalamon — Backend

Tuteur IA éducatif. **NestJS + Fastify + Prisma + PostgreSQL + pgvector.**
Conçu pour le parcours **Lovable (UI) → GitHub → Replit (dev) → Azure ACA (prod)**,
avec les 5 garde-fous de viabilité intégrés dès le départ.

## Les 5 garde-fous (déjà câblés)

1. **PostgreSQL + pgvector partout** — `DATABASE_URL` unique (Supabase en dev, Azure PG en prod). Pas de Cosmos. « Migration » = changer une chaîne de connexion.
2. **RAG + cache, jamais de chat ouvert** — `/kalamon/chat` passe par `RagService` (cache sémantique → RAG ancré). ~30 % seulement des questions touchent le LLM.
3. **Dockerfile dès le jour 1** — le même conteneur tourne en dev et en prod. Migration Azure = pointer ACA sur l'image.
4. **Un seul auth : JWT httpOnly cookie** — `JwtAuthGuard` lit le cookie, jamais localStorage. `organizationId` vient du token (isolation multi-tenant).
5. **Zéro hardcode + conformité** — tout en env (validé par Zod au démarrage) ; journal d'audit IA (`ai_interactions`) pour l'AI Act ; budget tokens / élève / jour.

## Démarrer en local (ou Replit)

```bash
cp .env.example .env          # remplir DATABASE_URL, JWT_SECRET, clés IA
npm install
npm run prisma:generate
npm run prisma:deploy         # applique les migrations
npm run prisma:seed           # école pilote + leçon + quiz (optionnel)
npm run start:dev             # API sur http://localhost:3000 — docs: /docs
```

### pgvector : activer l'extension + index HNSW

Prisma crée les colonnes `vector` mais **pas** l'extension ni l'index HNSW.
Après la 1re migration, lancer une fois (psql / Supabase SQL editor) :

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON curriculum_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_cache_embedding
  ON semantic_cache USING hnsw (embedding vector_cosine_ops);
```

> Sur Supabase, `vector` est disponible nativement (Database → Extensions → activer `vector`).

## Endpoints (MVP)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/register` | Inscription (pose cookie httpOnly) |
| POST | `/auth/login` | Connexion |
| POST | `/auth/logout` | Déconnexion |
| GET | `/eleve/:id/dashboard` | Tableau de bord élève |
| GET | `/parent/dashboard` | Tableau de bord parent |
| POST | `/parent/rapport-hebdo` | Rapport WhatsApp/SMS (stub) |
| POST | `/kalamon/chat` | **Tuteur IA (RAG ancré + cache)** |
| GET | `/quiz?niveau=CM2` | Quiz par niveau |
| GET | `/quiz/:id` | Détail quiz |

Toutes les routes sauf `/auth/*` exigent le cookie JWT.

## À brancher (TODO marqués dans le code)

- `ai-provider.service.ts` : appels réels embeddings + LLM (Anthropic **ou** Azure OpenAI selon env).
- `parent.service.ts` : passerelle WhatsApp Business API / SMS.
- Pipeline d'**ingestion curriculum** (chunking + embeddings + pré-génération batch) — voir cahier des charges v2 §3 et doc Architecture.

## Déploiement Azure (sans réécriture)

```bash
docker build -t kalamon-backend .
# push vers ton registre (ACR), puis créer/mettre à jour l'app ACA
# en pointant sur l'image. DATABASE_URL = Azure Database for PostgreSQL.
```

Le `startup.sh` applique `prisma migrate deploy` puis démarre l'API — même comportement en dev et en prod.

## Paiement mobile money (CinetPay)

Contrairement au paiement natif de Lovable (Stripe/Paddle, **indisponible pour encaisser
en Guinée**), CinetPay couvre la Guinée (GNF) et l'Afrique de l'Ouest (Orange Money, MTN,
Moov, Wave) via une seule API.

**Faut-il un compte ?** Oui — un **compte marchand CinetPay** (gratuit à l'ouverture).
L'argent encaissé arrive dans ton **portefeuille CinetPay**, puis tu le **retires** vers
mobile money ou compte bancaire depuis la console CinetPay.

**Flux :**
1. L'app appelle `POST /payments/checkout` → le backend fixe le prix (côté serveur),
   crée un `Payment` PENDING et renvoie une **`redirectUrl`** (page de paiement CinetPay).
2. L'utilisateur paie (Orange Money / MTN…) sur cette page.
3. CinetPay appelle notre **webhook** `POST /payments/webhook/cinetpay`.
   Le statut n'est **jamais** déduit du body : on **revérifie serveur-à-serveur**
   via l'API CinetPay (`/v2/payment/check`) avant de marquer `SUCCESS`.
4. Sur succès, `grantEntitlement()` débloque l'accès *(stub à implémenter)*.
5. L'app peut aussi sonder `GET /payments/:orderId/status`.

**Endpoints :**

| Méthode | Route | Auth |
|---|---|---|
| POST | `/payments/checkout` | JWT |
| GET | `/payments/:orderId/status` | JWT |
| POST | `/payments/webhook/cinetpay` | **public** (vérif serveur-à-serveur) |
| GET | `/subscriptions/status?eleveId=` | JWT — `{ plan, active, expiresAt }` |

**Abonnement (premium mensuel).** Sur paiement confirmé, `grantEntitlement()` appelle
`SubscriptionsService.grantOrExtend()` : crée l'abonnement `premium` ou **prolonge d'un
mois** à partir de l'expiration restante. L'accès est « actif » si `status=ACTIVE` ET
`expiresAt > maintenant` (calcul dynamique — pas besoin de cron pour expirer).
Pour protéger une fonctionnalité premium ailleurs (ex. aide aux devoirs) :
`await subscriptionsService.isPremiumActive(organizationId, eleveId)`.

**Garde-fous intégrés :** prix résolu côté serveur (jamais par le client), `orderId`
unique (idempotence), `GNF` exponent 0 (pas de ×100), `AbortSignal.timeout(10s)` sur les
appels provider, statut confirmé uniquement après revérification API.

**Multi-pays (panafricain).** `country` (ISO alpha-2) est collecté à l'inscription
(`/auth/register`) et stocké sur `User` + `Eleve`. La **devise du paiement est dérivée
du pays du payeur** (`currencyForCountry` : GN→GNF, UEMOA→XOF, CEMAC→XAF ; repli
`PAYMENT_CURRENCY`), et le **prix est défini par devise** (`PRICE_PREMIUM_MONTHLY_GNF/XOF/XAF`).
Le `country` de l'élève pilote le programme localisé (histoire/géo) côté UI.

**Variables d'env :** voir `.env.example` (`CINETPAY_*`, `PAYMENT_*`, `PRICE_PREMIUM_MONTHLY_{GNF,XOF,XAF}`).
`PAYMENT_NOTIFY_URL` doit être l'URL **publique** de ce backend.

**À faire :**
- Générer la migration (modèles `Payment` + `Subscription`) : `npx prisma migrate dev --name add_payments_subscriptions`.
- Ouvrir un compte marchand CinetPay et renseigner les clés.
- Brancher `isPremiumActive()` sur les fonctionnalités à réserver au premium.

## Note build / seed (anti-régression)

`tsconfig.build.json` **exclut `prisma/`** volontairement : sinon `prisma/seed.ts`
remonte le `rootDir` et `main.js` atterrit dans `dist/src/` au lieu de `dist/`.
Ici le seed tourne via **ts-node** (dev), pas depuis `dist/`. Ne pas confondre avec
le cas educa-guinée (seed lancé depuis `dist/seed.js`). Si un jour le seed doit
tourner en prod, le compiler **séparément**, pas en réintégrant `prisma/` au build.

## Connexion depuis l'UI Lovable

L'UI appelle l'API en `fetch(..., { credentials: 'include' })` pour envoyer le cookie.
Mettre l'origine du front dans `CORS_ORIGINS`.
