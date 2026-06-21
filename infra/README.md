# Kalamon Backend — Infrastructure Azure

Infrastructure Bicep pour déployer Kalamon Backend sur Azure Container Apps.

## Architecture

```
Subscription: dev-test (179b73a2-60ab-4fd1-a025-755c2409d140)
└── Resource Group: kalamon-prod (canadacentral)
    ├── log-kalamon          — Log Analytics Workspace (PerGB2018, 30j)
    ├── acrkalamon           — Container Registry (Basic, admin enabled)
    ├── psql-kalamon         — PostgreSQL Flexible Server 16 (Standard_B1ms)
    │   ├── database: kalamon
    │   ├── extension: VECTOR (pgvector allowlistée)
    │   └── firewall: AllowAllAzureServices (0.0.0.0→0.0.0.0)
    ├── cae-kalamon          — Container Apps Environment
    └── ca-kalamon-api       — Container App
        ├── ingress: externe HTTPS, port 3000
        ├── minReplicas: 1, maxReplicas: 3
        └── probes: liveness + readiness + startup sur GET /health
```

## Coût estimé (MVP)

| Ressource | SKU | Coût/mois approx. |
|---|---|---|
| Container App (1 replica min) | 0.5 vCPU / 1 GB | ~15 $ |
| PostgreSQL Flexible | Standard_B1ms | ~25 $ |
| Container Registry | Basic | ~5 $ |
| Log Analytics | PerGB2018 (30j) | ~2 $ |
| **Total** | | **~47 $/mois** |

Pour scaler : passer pgSku en `Standard_B2s` ou `Standard_D2s_v3`.

## Prérequis

- Azure CLI >= 2.20 avec Bicep intégré : `az bicep install`
- Connecté à la subscription `dev-test` : `az account set --subscription 179b73a2-60ab-4fd1-a025-755c2409d140`
- Droits minimum : Contributor sur la subscription (pour créer le RG)

## Déploiement

### Étape 1 — Préparer les secrets

```bash
# Créer/collecter tous les secrets avant de déployer
export PG_ADMIN_PASSWORD="$(openssl rand -base64 24)"
export JWT_SECRET="$(openssl rand -base64 48)"
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export CINETPAY_API_KEY="..."
export CINETPAY_SITE_ID="..."
export CINETPAY_SECRET_KEY="..."
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export CORS_ORIGINS="https://app.kalamon.example"
export PAYMENT_NOTIFY_URL="https://api.kalamon.example/payments/webhook"
export R2_PUBLIC_BASE="https://pub-<hash>.r2.dev"
```

### Étape 2 — Déployer l'infrastructure (build inclus)

```bash
chmod +x infra/deploy-infra.sh
./infra/deploy-infra.sh
```

Ce script fait tout, en gérant l'amorçage ACR/image en **2 passes** :

1. Valide le Bicep
2. **Passe 1** — crée le RG `kalamon-prod` + l'infra de base (Log Analytics, ACR, PostgreSQL, environnement ACA) **sans** la Container App
3. **Build** l'image `kalamon-backend:$TAG` directement dans l'ACR via `az acr build` (pas de Docker local requis)
4. **Passe 2** — crée la Container App `ca-kalamon-api`, l'image existant désormais dans l'ACR
5. Affiche le FQDN de la Container App et le FQDN PostgreSQL

> **Pourquoi 2 passes ?** L'ACR et la Container App sont décrits dans le même template.
> Au tout premier déploiement, l'image n'existe pas encore dans l'ACR : créer la
> Container App à ce moment provoque un `ImagePullBackOff`. Le flag Bicep
> `deployContainerApp` (false en passe 1, true en passe 2) résout l'amorçage.
> Aux déploiements suivants l'ACR existe déjà — le script reste idempotent.

### Mises à jour de code ultérieures

Une fois l'infra en place, le pipeline CI/CD (`.github/workflows/deploy.yml`) ou la
commande manuelle suffisent — pas besoin de re-rouler tout le script :

```bash
# IMPORTANT : tag unique, jamais :latest (sinon pas de nouvelle révision ACA)
TAG=$(git rev-parse --short HEAD)
az acr build --registry acrkalamon --image kalamon-backend:$TAG --file Dockerfile .
az containerapp update \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --image acrkalamon.azurecr.io/kalamon-backend:$TAG
```

### Étape 3 — Activer pgvector (post-déploiement, une seule fois)

La configuration `azure.extensions = VECTOR` dans le Bicep allowliste l'extension côté serveur.
Il faut ensuite l'activer dans la base de données :

```bash
# Connexion psql via Cloud Shell ou depuis votre machine
PSQL_FQDN=$(az postgres flexible-server show \
  --name psql-kalamon \
  --resource-group kalamon-prod \
  --query fullyQualifiedDomainName -o tsv)

psql "postgresql://kalamonadmin:${PG_ADMIN_PASSWORD}@${PSQL_FQDN}:5432/kalamon?sslmode=require"
```

Dans psql :

```sql
-- Étape 1 : Activer l'extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Vérification
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

### Étape 4 — Créer les index HNSW (post-peuplement)

Ces index doivent être créés APRÈS que la table `curriculum_chunks` contient des données
(HNSW sur table vide est inutile — l'index ne se construit pas correctement).

```sql
-- Index HNSW curriculum_chunks (similarité cosinus, embeddings 1536 dims)
-- CONCURRENTLY = pas de verrou de table, safe sur traffic live
-- Durée : 1-5 min selon volume
CREATE INDEX CONCURRENTLY IF NOT EXISTS "curriculum_chunks_embedding_hnsw_idx"
  ON "curriculum_chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index HNSW semantic_cache
CREATE INDEX CONCURRENTLY IF NOT EXISTS "semantic_cache_embedding_hnsw_idx"
  ON "semantic_cache"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Vérification
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE '%hnsw%';
```

## Vérification du déploiement

```bash
# Logs en temps réel
az containerapp logs show \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --follow

# Health check
FQDN=$(az containerapp show \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --query "properties.configuration.ingress.fqdn" -o tsv)

curl https://$FQDN/health

# Voir les révisions
az containerapp revision list \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --output table

# Exec dans le container (debug)
az containerapp exec \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --command /bin/sh
```

## Rollback

```bash
# Lister les révisions disponibles
az containerapp revision list \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --output table

# Activer une révision précédente
az containerapp revision activate \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --revision <nom-de-la-revision>

# Basculer le trafic vers cette révision
az containerapp ingress traffic set \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --revision-weight <nom-de-la-revision>=100
```

## Mise à jour des variables d'environnement

Les variables non-sensibles peuvent être mises à jour directement sur le container app.
Pour les secrets, re-déployer via Bicep est recommandé.

```bash
# Mise à jour d'une variable non-sensible
az containerapp update \
  --name ca-kalamon-api \
  --resource-group kalamon-prod \
  --set-env-vars "CORS_ORIGINS=https://app.kalamon.example,https://admin.kalamon.example"

# ATTENTION : --set-env-vars REMPLACE toutes les env vars si utilisé avec la REST API PATCH.
# Toujours utiliser az containerapp update (pas az rest) pour éviter la perte de config.
```

## Variables d'environnement en production

| Variable | Source | Description |
|---|---|---|
| `DATABASE_URL` | Secret ACA | URL PostgreSQL construite par Bicep |
| `JWT_SECRET` | Secret ACA | Clé JWT (min 32 chars) |
| `ANTHROPIC_API_KEY` | Secret ACA | Clé API Anthropic |
| `OPENAI_API_KEY` | Secret ACA | Clé API OpenAI (embeddings) |
| `CINETPAY_API_KEY` | Secret ACA | Clé API CinetPay |
| `CINETPAY_SITE_ID` | Secret ACA | Site ID CinetPay |
| `CINETPAY_SECRET_KEY` | Secret ACA | Clé secrète CinetPay |
| `R2_ACCESS_KEY_ID` | Secret ACA | Cloudflare R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | Secret ACA | Cloudflare R2 Secret |
| `NODE_ENV` | Env var | `production` |
| `PORT` | Env var | `3000` |
| `CORS_ORIGINS` | Env var | Origines CORS (virgule-séparées) |
| `LLM_PROVIDER` | Env var | `anthropic` |
| `PAYMENT_NOTIFY_URL` | Env var | URL webhook CinetPay |
| `R2_ACCOUNT_ID` | Env var | Cloudflare Account ID |

## Fichiers Bicep

| Fichier | Rôle |
|---|---|
| `main.bicep` | Point d'entrée — scope subscription, crée le RG, appelle resources.bicep |
| `resources.bicep` | Toutes les ressources Azure dans le RG — scope resourceGroup |
| `main.bicepparam` | Fichier de paramètres exemple (jamais de vrais secrets) |
| `deploy-infra.sh` | Script one-shot de déploiement (lit les secrets via env vars) |
