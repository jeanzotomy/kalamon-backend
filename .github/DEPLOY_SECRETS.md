# Guide de configuration des secrets GitHub Actions — Kalamon Backend

Chemin : **GitHub > Settings > Secrets and variables > Actions**

---

## Variable DEPLOY_TARGET (obligatoire)

Définit le cloud cible pour les déploiements automatiques (push vers main/master).

**Aller dans : Settings > Secrets and variables > Actions > Variables**

| Variable | Valeur | Description |
|---|---|---|
| `DEPLOY_TARGET` | `railway` | Déploiement Railway (défaut) |
| `DEPLOY_TARGET` | `azure-aca` | Déploiement Azure Container Apps |
| `DEPLOY_TARGET` | `render` | Déploiement Render |
| `DEPLOY_TARGET` | `fly` | Déploiement Fly.io |
| `DEPLOY_TARGET` | `ghcr-only` | Push GHCR sans déploiement cloud |

---

## Secrets communs (tous les clouds)

| Secret | Description | Comment l'obtenir |
|---|---|---|
| `GITHUB_TOKEN` | Token GitHub automatique | Fourni automatiquement — aucune action requise |

---

## Railway

**Aller dans : Settings > Secrets and variables > Actions > Secrets**

| Secret | Description | Comment l'obtenir |
|---|---|---|
| `RAILWAY_TOKEN` | Token d'authentification Railway | Railway Dashboard > Account Settings > Tokens > New Token |

**Configuration Railway requise :**
1. Créer un projet Railway et un service nommé `kalamon-api`
2. Connecter le repo GitHub dans les settings du service (pour auto-deploy)
3. Ajouter les variables d'environnement dans Railway : `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`
4. Le token ci-dessus est utilisé pour déclencher le déploiement via CLI (`railway up`)

---

## Azure Container Apps

**Secrets :**

| Secret | Description | Comment l'obtenir |
|---|---|---|
| `AZURE_CREDENTIALS` | JSON Service Principal Azure | Voir commande az cli ci-dessous |

**Variables (Settings > Variables) :**

| Variable | Exemple | Description |
|---|---|---|
| `ACR_NAME` | `acrkalamon` | Nom du Azure Container Registry (sans `.azurecr.io`) |
| `ACA_APP_NAME` | `ca-kalamon-api` | Nom de la Container App |
| `ACA_RG` | `kalamon-prod` | Nom du Resource Group |

**Créer le Service Principal Azure :**

```bash
# Remplacer <subscription-id> et <resource-group> par vos valeurs
az ad sp create-for-rbac \
  --name "github-kalamon-deploy" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group> \
  --sdk-auth
```

Copier le JSON complet dans le secret `AZURE_CREDENTIALS`. Format :
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "...",
  "tenantId": "..."
}
```

**Permissions ACR requises :**
```bash
# Donner accès AcrPush au Service Principal
az role assignment create \
  --assignee <clientId-du-sp> \
  --role AcrPush \
  --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.ContainerRegistry/registries/<acr-name>
```

---

## Render

| Secret | Description | Comment l'obtenir |
|---|---|---|
| `RENDER_DEPLOY_HOOK` | URL complète du deploy hook | Render Dashboard > Service > Settings > Deploy Hook |

**Format du deploy hook :**
```
https://api.render.com/deploy/srv-XXXXXXXXXXXXXXXX?key=YYYYYYYYYYYYYYYY
```

**Configuration Render requise :**
1. Créer un service Web sur Render, sélectionner "Deploy from a Docker image"
2. Configurer les variables d'environnement dans Render (DATABASE_URL, JWT_SECRET, etc.)
3. Récupérer le deploy hook URL dans Settings > Deploy Hook
4. Coller l'URL dans le secret `RENDER_DEPLOY_HOOK`

---

## Fly.io

| Secret | Description | Comment l'obtenir |
|---|---|---|
| `FLY_API_TOKEN` | Token API Fly.io | `flyctl auth token` (après `flyctl auth login`) |

**Configuration Fly.io requise :**

1. Installer flyctl : `curl -L https://fly.io/install.sh | sh`
2. Se connecter : `flyctl auth login`
3. Créer l'app (une seule fois) :
   ```bash
   flyctl launch --name kalamon-api --no-deploy
   ```
4. Configurer les secrets Fly :
   ```bash
   flyctl secrets set DATABASE_URL="postgresql://..." JWT_SECRET="..."
   ```
5. Récupérer le token : `flyctl auth token`
6. Coller le token dans le secret GitHub `FLY_API_TOKEN`

**fly.toml minimal requis** (à la racine du repo si Fly.io est utilisé) :
```toml
app = "kalamon-api"
primary_region = "cdg"  # Paris — ou yyz (Toronto), ams (Amsterdam)

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

---

## Variables d'environnement applicatives (prod)

Ces variables doivent être configurées dans la plateforme cloud choisie, PAS dans GitHub :

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL avec pgvector | `postgresql://user:pass@host:5432/kalamon` |
| `JWT_SECRET` | Secret JWT (min 32 chars) | Générer avec `openssl rand -base64 32` |
| `NODE_ENV` | Environnement | `production` |
| `PORT` | Port d'écoute (souvent fixé par la plateforme) | `3000` |

> Ces variables ne doivent JAMAIS apparaitre dans les secrets GitHub Actions.
> Elles sont injectées directement par la plateforme cloud au démarrage du container.

---

## Vérification post-configuration

Après avoir configuré les secrets, déclencher un déploiement manuel :

```
GitHub > Actions > Deploy > Run workflow > Choisir le cloud cible
```

Vérifier que le workflow se termine avec le statut "success" (case verte).
