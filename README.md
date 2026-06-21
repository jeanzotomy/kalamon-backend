# Kalamon Backend — Tuteur IA Educatif

[![CI](https://github.com/jeanzotomy/kalamon-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/jeanzotomy/kalamon-backend/actions)
[![Node](https://img.shields.io/badge/node-24--alpine-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Tuteur IA ancre sur le curriculum officiel pour l'Afrique francophone.
NestJS 10 · Fastify · Prisma · PostgreSQL + pgvector · Docker-ready.

---

## Architecture

RAG ancre (jamais de chat ouvert) + cache semantique pgvector + BKT + memoire 3 couches.

---

## Fonctionnalites

### P0 — Fondations pedagogiques

- **RAG ancre curriculum** — `/kalamon/chat` passe par `RagService` uniquement. Environ 30 % des questions touchent le LLM ; le reste est resolu par le cache semantique.
- **Cache semantique pgvector** — recherche par similarite cosine (operateur `<=>`), seuil configurable (`SEMANTIC_CACHE_THRESHOLD`), index HNSW. Chaque hit = cout IA nul.
- **Complexite adaptative 4 niveaux** — `SIMPLE / COLLEGE / LYCEE / TECHNIQUE`. Auto-detectee depuis `eleve.niveau` (CP→CM2, 6e→3e, lycee, technique). Surcharge possible par le client.
- **Bayesian Knowledge Tracing (BKT)** — 4 parametres par competence × eleve (`probMastery`, `probTransit`, `probSlip`, `probGuess`). Formule Corbett & Anderson 1994. Maîtrise declaree a `probMastery >= 0.9`.
- **Memoire eleve 3 couches** (DeepTutor pattern) : L1 traces brutes par interaction · L2 resumes par matiere (refresh automatique) · L3 profil cross-sessions injecte dans le prompt RAG.
- **Budget IA par eleve/jour** — compteur sur `ai_interactions` (source `RAG_LIVE`). Seuil configurable (`AI_DAILY_BUDGET_PER_STUDENT`). 403 si depasse.

### P1 — Differenciation pedagogique

- **Hints progressifs 3 niveaux** — `demandeIndice=true` + `niveauIndice` (1=vague, 2=guide, 3=solution partielle). Passe par `HintService`, court-circuite le pipeline RAG complet.
- **Knowledge Graph prerequis** (LOOM pattern) — BFS sur `ConceptEdge` pour lister les prerequis non maitrises avant un concept cible. Recommandation du prochain concept optimal.
- **Ingestion PDF curriculum** — `PdfIngestionService` : pdf-parse, chunking adaptatif 80-450 mots, generation d'embeddings, stockage dans `curriculum_chunks`. Suivi par job asynchrone.

### P2 — Voice (stub)

- **Gateway WebSocket `/voice`** — evenements `session_start` et `audio_chunk`. Stub Pipecat v1.0. Pipeline cible : STT (Whisper) → RAG → TTS (ElevenLabs/Coqui), latence objectif 800-950 ms. Deployable sur sidecar dedie.

### Multi-tenant et Securite

- JWT httpOnly cookie (`kalamon_token`) — jamais localStorage. Token retourne aussi dans le body pour les clients mobiles (SecureStore).
- `organizationId` sur toutes les tables, isole via `findFirst({ where: { id, organizationId } })` dans chaque service.
- Soft-delete (`deletedAt`) sur les entites metier.
- Journal d'audit IA (`ai_interactions`) : question, reponse, source, modele, tokens, cout USD — conformite AI Act EU.

### Paiement

- **CinetPay** (GNF, XOF, XAF) — Orange Money, MTN MoMo, Wave, Moov.
- Prix determines cote serveur uniquement (jamais par le client).
- `orderId` unique — idempotence webhook.
- Confirmation serveur-a-serveur via API CinetPay (`/v2/payment/check`) avant mise a jour du statut.
- Devise derivee du pays de l'eleve (`GN→GNF`, UEMOA→XOF, CEMAC→XAF).
- Abonnement freemium/premium mensuel : `grantOrExtend()` cree ou prolonge d'un mois. Expiration calculee dynamiquement, pas de cron.

### Infrastructure

- Docker multi-stage (`node:24-alpine`) — meme image dev/prod/Replit.
- `startup.sh` : `prisma migrate deploy` puis demarrage. Migrations automatiques a chaque deploy.
- Cloudflare R2 (stockage medias, S3-compatible, egress gratuit) via `StorageModule`.
- Swagger a `/docs`.

---

## Stack technique

| Composant | Version |
|---|---|
| Node.js | 24 (LTS) |
| NestJS | 10 |
| Fastify | 4 |
| Prisma | 5 |
| PostgreSQL | 16+ |
| pgvector | 0.7+ |
| TypeScript | 5 |

---

## Demarrage rapide (local)

### Avec Make

```bash
# Prerequis : Docker Desktop
git clone https://github.com/jeanzotomy/kalamon-backend.git
cd kalamon-backend
cp .env.example .env        # editer DATABASE_URL, JWT_SECRET, cle IA
make docker-up              # PostgreSQL + pgvector sur :5432
make pgvector-init          # activer l'extension + index HNSW (une seule fois)
make migrate                # appliquer les migrations
make seed                   # donnees pilote (optionnel)
make dev                    # API sur :3000 — docs : http://localhost:3000/docs
```

### Sans Make

```bash
docker compose up -d db
cp .env.example .env
npm install
npx prisma migrate deploy
npm run start:dev
```

L'interface Swagger est disponible a `http://localhost:3000/docs`.

L'UI appelle l'API avec `fetch(..., { credentials: 'include' })` pour envoyer le cookie.
Ajouter l'origine du front dans `CORS_ORIGINS`.

---

## Endpoints API

### Auth

| Methode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Inscription — pose le cookie httpOnly, retourne aussi `{ userId, token }` pour mobile |
| POST | `/auth/login` | Public | Connexion |
| GET | `/auth/me` | JWT | Restauration de session (mobile au demarrage, web au refresh) |
| POST | `/auth/logout` | Public | Efface le cookie |

### Eleve

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/eleve/:id/dashboard` | JWT | Tableau de bord eleve (progres, BKT, lecons recentes) |

### Parent

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/parent/dashboard` | JWT | Tableau de bord parent (resume enfants) |
| POST | `/parent/rapport-hebdo` | JWT | Rapport hebdomadaire WhatsApp/SMS (stub) |

### Chat / RAG

| Methode | Route | Auth | Description |
|---|---|---|---|
| POST | `/kalamon/chat` | JWT | Tuteur IA — RAG ancre + cache semantique. Accepte `demandeIndice`, `niveauIndice`, `skillCode`, `complexite` |

### Quiz

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/quiz?niveau=CM2` | JWT | Quiz par niveau |
| GET | `/quiz/:id` | JWT | Detail d'un quiz |
| POST | `/quiz/:id/attempt` | JWT | Soumission — scoring serveur (bonnes reponses jamais exposees au client) |

### Lecons

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/lessons` | JWT | Liste des lecons (`?niveau=&matiere=`) |
| GET | `/lessons/matieres` | JWT | Matieres disponibles (`?niveau=`) |
| GET | `/lessons/:id` | JWT | Detail d'une lecon avec chunks |
| POST | `/lessons/:id/complete` | JWT | Marquer une lecon comme completee par un eleve |

### BKT / Concepts (Knowledge Graph)

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/concepts` | JWT | Liste des concepts (`?matiere=&niveau=&page=&limit=`) |
| POST | `/concepts` | JWT | Creer un concept (`x-organization-id` requis) |
| POST | `/concepts/prereq` | JWT | Ajouter un arc prerequis entre deux concepts |
| GET | `/concepts/next` | JWT | Prochain concept optimal pour un eleve (`?eleveId=&matiere=&niveau=`) |
| GET | `/concepts/unmastered` | JWT | Prerequis non maitrises avant un concept (`?eleveId=&matiere=&conceptCode=`) |

### Ingestion curriculum

| Methode | Route | Auth | Description |
|---|---|---|---|
| POST | `/ingestion` | JWT | Demarrer l'ingestion d'un PDF (chunking + embeddings) |
| GET | `/ingestion` | JWT | Lister les jobs d'ingestion de l'organisation |
| GET | `/ingestion/:jobId` | JWT | Statut d'un job |

### Paiement

| Methode | Route | Auth | Description |
|---|---|---|---|
| POST | `/payments/checkout` | JWT | Creer un paiement — retourne `redirectUrl` CinetPay |
| GET | `/payments/:orderId/status` | JWT | Statut d'un paiement |
| POST | `/payments/webhook/:provider` | Public | Notification webhook provider (verification signature HMAC + re-verification API) |

### Abonnement

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/subscriptions/status?eleveId=` | JWT | Statut abonnement (`{ plan, active, expiresAt }`) |

### Gamification

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/gamification/leaderboard` | JWT | Classement de l'organisation |
| GET | `/gamification/:eleveId` | JWT | Points, badges et niveau d'un eleve |

### Voice (P2 stub)

| Protocole | Namespace | Evenements | Description |
|---|---|---|---|
| WebSocket | `/voice` | `session_start`, `audio_chunk` | Gateway Pipecat v1.0 (stub — pipeline STT→RAG→TTS a connecter) |

### Health

| Methode | Route | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Liveness probe — verifie DB, retourne version et timestamp |

---

## Variables d'environnement

| Groupe | Variable | Exemple / Description |
|---|---|---|
| **Serveur** | `NODE_ENV` | `production` |
| | `PORT` | `3000` |
| | `CORS_ORIGINS` | `https://app.kalamon.example,https://lovable.dev/...` |
| **Base de donnees** | `DATABASE_URL` | `postgresql://user:pass@host:5432/kalamon?schema=public` |
| **Auth** | `JWT_SECRET` | Min 32 caracteres |
| | `JWT_EXPIRES_IN` | `7d` |
| | `COOKIE_NAME` | `kalamon_token` |
| | `COOKIE_SECURE` | `true` en prod (HTTPS) |
| **IA LLM** | `LLM_PROVIDER` | `anthropic` ou `azure-openai` |
| | `LLM_MODEL` | `claude-haiku-4-5` |
| | `ANTHROPIC_API_KEY` | Cle Anthropic |
| | `AZURE_OPENAI_ENDPOINT` | Si `LLM_PROVIDER=azure-openai` |
| | `AZURE_OPENAI_API_KEY` | Si `LLM_PROVIDER=azure-openai` |
| | `AZURE_OPENAI_DEPLOYMENT` | Si `LLM_PROVIDER=azure-openai` |
| **Embeddings** | `EMBEDDING_PROVIDER` | `openai` ou `azure-openai` |
| | `EMBEDDING_MODEL` | `text-embedding-3-small` |
| | `EMBEDDING_DIM` | `1536` |
| | `OPENAI_API_KEY` | Cle OpenAI |
| **Budget IA** | `AI_DAILY_BUDGET_PER_STUDENT` | `120` (appels RAG_LIVE / eleve / jour) |
| | `SEMANTIC_CACHE_THRESHOLD` | `0.92` (seuil similarite cosine pour cache hit) |
| **Paiement** | `PAYMENT_PROVIDER` | `cinetpay` |
| | `PAYMENT_CURRENCY` | `GNF` (devise de repli si pays inconnu) |
| | `PAYMENT_NOTIFY_URL` | URL publique du backend + `/payments/webhook` |
| | `PAYMENT_RETURN_URL` | Page de retour apres paiement dans l'app |
| | `CINETPAY_API_KEY` | Console CinetPay |
| | `CINETPAY_SITE_ID` | Console CinetPay |
| | `CINETPAY_SECRET_KEY` | Signature HMAC webhook |
| | `PRICE_PREMIUM_MONTHLY_GNF` | `20000` |
| | `PRICE_PREMIUM_MONTHLY_XOF` | `1000` |
| | `PRICE_PREMIUM_MONTHLY_XAF` | `1000` |
| **Stockage R2** | `R2_ACCOUNT_ID` | Cloudflare Account ID |
| | `R2_ACCESS_KEY_ID` | Cle acces R2 |
| | `R2_SECRET_ACCESS_KEY` | Secret R2 |
| | `R2_BUCKET_NAME` | Nom du bucket |
| | `R2_PUBLIC_URL` | URL publique du bucket |
| **Gamification** | `XP_PER_LESSON` | Points XP par lecon completee |
| | `XP_PER_QUIZ_CORRECT` | Points XP par bonne reponse quiz |

Toutes les variables sont validees au demarrage par Zod (`src/config/env.ts`). Le serveur refuse de demarrer si une variable obligatoire est absente.

---

## Deploiement multi-cloud

### Railway (le plus simple)

```bash
railway login
railway init
railway up
```

Variables a configurer dans le Dashboard Railway : `DATABASE_URL` (addon PostgreSQL Railway), plus toutes les variables du `.env.example`. L'addon PostgreSQL de Railway supporte pgvector — activer l'extension manuellement apres la premiere migration (voir section SQL ci-dessous).

### Azure Container Apps

```bash
# Build et push vers Azure Container Registry
az acr build --registry <MON_ACR> --image kalamon-backend:latest .

# Creer l'application
az containerapp create \
  --name kalamon-api \
  --resource-group <MON_RG> \
  --environment <MON_ENV> \
  --image <MON_ACR>.azurecr.io/kalamon-backend:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --env-vars DATABASE_URL=secretref:db-url JWT_SECRET=secretref:jwt-secret ...
```

Base de donnees : Azure Database for PostgreSQL Flexible Server avec l'extension `pgvector` disponible nativement (activer dans le portail Azure → Extensions).

### Render

1. New Web Service → Docker → connecter le repo GitHub.
2. Configurer toutes les variables d'env dans le Dashboard Render.
3. Ajouter un addon PostgreSQL Render — activer pgvector apres la premiere migration.

### Fly.io

```bash
fly launch
fly secrets set DATABASE_URL="postgresql://..." JWT_SECRET="..."
fly deploy
```

### Supabase (pour la base de donnees uniquement)

PostgreSQL + pgvector natif disponible. L'extension `vector` est pre-installee.

```
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
```

Activer l'extension dans Supabase Dashboard → Database → Extensions → chercher `vector` → Enable.

---

## Scripts post-deploiement (obligatoires)

A executer **une seule fois** sur la base de donnees en production apres la premiere migration Prisma. Sans ces index, le cache semantique et la recherche de chunks seront lents (scan sequentiel).

```sql
-- Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Index HNSW sur les embeddings de chunks curriculum
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding
  ON curriculum_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index HNSW sur le cache semantique
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cache_embedding
  ON semantic_cache USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Sur Supabase : executer dans Database → SQL Editor.
Sur Railway / Render : ouvrir une console psql sur l'addon PostgreSQL.
Sur Azure : utiliser le Query Editor du portail ou `psql` depuis Cloud Shell.

---

## Pipeline RAG — schema d'une requete

```
POST /kalamon/chat
  │
  ├─ [demandeIndice=true]   ──→ HintService(niveauIndice 1/2/3)
  │                                 └─ searchChunks() + generateHint()
  │                                       └─ HINT (trace L1 non bloquant)
  │
  ├─ enforceDailyBudget()
  │     └─ [count RAG_LIVE >= seuil]  ──→ 403 ForbiddenException
  │
  ├─ ai.embed(question)
  │
  ├─ searchCache(vec)
  │     └─ [similarite >= SEMANTIC_CACHE_THRESHOLD]
  │           └─ CACHE (cout IA ~$0.00)
  │                 ├─ audit() source=CACHE
  │                 ├─ maybeUpdateBkt()
  │                 └─ appendTrace L1 (non bloquant)
  │
  └─ searchChunks(vec) [top 4 par cosine]
        + memoryService.getContextForRag() [L2/L3]
        + ai.generateGrounded()               [RAG_LIVE]
              └─ audit() source=RAG_LIVE
              └─ storeCache() + embedding SQL brut
              └─ maybeUpdateBkt()
              └─ appendTrace L1 + refresh L2 (non bloquant)
```

---

## Cout estime

| Indicateur | Valeur |
|---|---|
| Cout par eleve actif (100 questions/mois) | ~$0.40/mois |
| Objectif taux de cache hit | ~70 % |
| Cout d'un cache hit | ~$0.00 |
| Cout d'un appel RAG_LIVE (claude-haiku-4-5) | ~$0.0013/question |

Le budget quotidien par eleve (`AI_DAILY_BUDGET_PER_STUDENT`) plafonne les derives de cout sans bloquer l'experience pedagogique (questions frequentes repondues par le cache).

---

## Note build / seed

`tsconfig.build.json` exclut `prisma/` volontairement : si `prisma/seed.ts` est inclus, le `rootDir` remonte et `main.js` atterrit dans `dist/src/` au lieu de `dist/`. Le seed tourne via `ts-node` en dev. Pour l'executer en prod, le compiler separement — ne pas reintegrer `prisma/` au build principal.

---

## Connexion depuis l'UI Lovable / React Native

**Web (Lovable)** : toutes les requetes avec `credentials: 'include'` pour transmettre le cookie httpOnly.

```typescript
fetch('/kalamon/chat', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ eleveId, question, skillCode: 'math:fractions' }),
});
```

**Mobile (React Native / Expo)** : utiliser le `token` retourne dans le body de `/auth/login` et `/auth/register`. Stocker dans `expo-secure-store`. Envoyer en header `Authorization: Bearer <token>`.

---

## Licence

MIT — jean@zdesigns.ca
