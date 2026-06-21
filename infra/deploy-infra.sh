#!/usr/bin/env bash
# ============================================================
# Kalamon Backend — Script de déploiement infrastructure Azure
# ============================================================
#
# PRÉREQUIS :
#   1. Azure CLI installé : https://learn.microsoft.com/cli/azure/install-azure-cli
#   2. Connecté à la bonne subscription :
#        az login
#        az account set --subscription "179b73a2-60ab-4fd1-a025-755c2409d140"
#   3. Bicep CLI installé (inclus dans az CLI ≥ 2.20) :
#        az bicep install
#   4. Variables d'environnement OBLIGATOIRES (voir section ci-dessous)
#
# VARIABLES D'ENVIRONNEMENT À DÉFINIR AVANT D'EXÉCUTER :
#
#   export PG_ADMIN_PASSWORD="<mot-de-passe-fort-24-chars-minimum>"
#   export JWT_SECRET="<clé-aléatoire-min-32-chars>"
#   export ANTHROPIC_API_KEY="sk-ant-..."
#   export OPENAI_API_KEY="sk-..."
#   export CINETPAY_API_KEY="<api-key-cinetpay>"
#   export CINETPAY_SITE_ID="<site-id-cinetpay>"
#   export CINETPAY_SECRET_KEY="<secret-cinetpay>"
#   export R2_ACCOUNT_ID="<cloudflare-account-id>"
#   export R2_ACCESS_KEY_ID="<r2-access-key>"
#   export R2_SECRET_ACCESS_KEY="<r2-secret>"
#
# OPTIONNEL (valeurs par défaut dans main.bicep si omis) :
#
#   export LOCATION="canadacentral"
#   export RG_NAME="kalamon-prod"
#   export IMAGE_TAG="latest"
#   export CORS_ORIGINS="https://app.kalamon.example"
#   export PAYMENT_NOTIFY_URL="https://api.kalamon.example/payments/webhook"
#   export PAYMENT_RETURN_URL="https://app.kalamon.example/paiement/retour"
#   export R2_BUCKET="kalamon"
#   export R2_PUBLIC_BASE="https://pub-<hash>.r2.dev"
#
# USAGE :
#   chmod +x infra/deploy-infra.sh
#   ./infra/deploy-infra.sh
#
# ROLLBACK :
#   Voir infra/README.md section "Rollback"
# ============================================================

set -euo pipefail

# ── Couleurs pour lisibilité ──────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Variables avec valeurs par défaut ─────────────────────────────────────────

LOCATION="${LOCATION:-canadacentral}"
RG_NAME="${RG_NAME:-kalamon-prod}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID:-179b73a2-60ab-4fd1-a025-755c2409d140}"
# Tag unique : commit SHA si disponible, sinon timestamp
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
CORS_ORIGINS="${CORS_ORIGINS:-https://app.kalamon.example}"
PAYMENT_NOTIFY_URL="${PAYMENT_NOTIFY_URL:-}"
PAYMENT_RETURN_URL="${PAYMENT_RETURN_URL:-https://app.kalamon.example/paiement/retour}"
R2_BUCKET="${R2_BUCKET:-kalamon}"
R2_PUBLIC_BASE="${R2_PUBLIC_BASE:-}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BICEP_MAIN="${SCRIPT_DIR}/main.bicep"

# ── Vérification des variables obligatoires ───────────────────────────────────

log "Vérification des prérequis..."

MISSING_VARS=()

for VAR in \
  PG_ADMIN_PASSWORD \
  JWT_SECRET \
  ANTHROPIC_API_KEY \
  OPENAI_API_KEY \
  CINETPAY_API_KEY \
  CINETPAY_SITE_ID \
  CINETPAY_SECRET_KEY \
  R2_ACCOUNT_ID \
  R2_ACCESS_KEY_ID \
  R2_SECRET_ACCESS_KEY; do
  if [[ -z "${!VAR:-}" ]]; then
    MISSING_VARS+=("$VAR")
  fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  err "Variables d'environnement manquantes : ${MISSING_VARS[*]}\n  Voir les commentaires en tête de ce script."
fi

# ── Vérification az CLI et connexion ─────────────────────────────────────────

if ! command -v az &> /dev/null; then
  err "Azure CLI non installé. Voir https://learn.microsoft.com/cli/azure/install-azure-cli"
fi

CURRENT_ACCOUNT=$(az account show --query id -o tsv 2>/dev/null || echo "")
if [[ -z "$CURRENT_ACCOUNT" ]]; then
  err "Non connecté à Azure. Exécuter : az login"
fi

if [[ "$CURRENT_ACCOUNT" != "$SUBSCRIPTION_ID" ]]; then
  warn "Subscription courante : $CURRENT_ACCOUNT"
  warn "Subscription cible   : $SUBSCRIPTION_ID"
  log "Basculement vers la subscription cible..."
  az account set --subscription "$SUBSCRIPTION_ID"
fi

log "Subscription active : $(az account show --query name -o tsv)"

# ── Validation Bicep ─────────────────────────────────────────────────────────

log "Validation du template Bicep..."
az bicep build --file "$BICEP_MAIN" --stdout > /dev/null && log "Bicep valide." || err "Erreur Bicep — vérifier la syntaxe."

# ── Déploiement (2 passes pour éviter ImagePullBackOff au bootstrap) ──────────
#
#   L'ACR est créé par le même template Bicep que la Container App. Au tout
#   premier déploiement, l'image kalamon-backend:TAG n'existe pas encore dans
#   l'ACR — créer la Container App à ce moment provoque un ImagePullBackOff.
#
#   Solution : passe 1 sans la Container App, on build l'image dans l'ACR,
#   puis passe 2 qui crée la Container App avec l'image désormais présente.
#   Aux déploiements suivants, l'ACR existe déjà : le script reste idempotent.

DEPLOYMENT_PREFIX="kalamon-infra-$(date +%Y%m%d%H%M%S)"

# Fonction de déploiement paramétrée par deployContainerApp (true|false)
deploy_infra() {
  local deploy_ca="$1"
  local suffix="$2"
  az deployment sub create \
    --name "${DEPLOYMENT_PREFIX}-${suffix}" \
    --location "$LOCATION" \
    --template-file "$BICEP_MAIN" \
    --parameters \
      location="$LOCATION" \
      rgName="$RG_NAME" \
      imageTag="$IMAGE_TAG" \
      deployContainerApp="$deploy_ca" \
      pgAdminPassword="$PG_ADMIN_PASSWORD" \
      jwtSecret="$JWT_SECRET" \
      anthropicApiKey="$ANTHROPIC_API_KEY" \
      openAiApiKey="$OPENAI_API_KEY" \
      cinetpayApiKey="$CINETPAY_API_KEY" \
      cinetpaySiteId="$CINETPAY_SITE_ID" \
      cinetpaySecretKey="$CINETPAY_SECRET_KEY" \
      r2AccountId="$R2_ACCOUNT_ID" \
      r2AccessKeyId="$R2_ACCESS_KEY_ID" \
      r2SecretAccessKey="$R2_SECRET_ACCESS_KEY" \
      corsOrigins="$CORS_ORIGINS" \
      paymentNotifyUrl="${PAYMENT_NOTIFY_URL:-https://placeholder.example/webhook}" \
      paymentReturnUrl="$PAYMENT_RETURN_URL" \
      r2Bucket="$R2_BUCKET" \
      r2PublicBase="${R2_PUBLIC_BASE:-https://placeholder.r2.dev}" \
    --output json > /dev/null
}

log "  Location  : ${LOCATION}"
log "  RG cible  : ${RG_NAME}"
log "  Image tag : ${IMAGE_TAG}"
warn "Ressources Azure créées / mises à jour :"
warn "  - Resource Group     : ${RG_NAME}"
warn "  - Log Analytics      : log-kalamon"
warn "  - Container Registry : acrkalamon (SKU Basic)"
warn "  - PostgreSQL Flex.   : psql-kalamon (${LOCATION}, PG 16)"
warn "  - Container Apps Env : cae-kalamon"
warn "  - Container App      : ca-kalamon-api"
warn ""

# ── Passe 1 : infra sans Container App ────────────────────────────────────────
log "Passe 1/2 — infra de base (ACR, PostgreSQL, environnement)..."
deploy_infra false "infra"
log "Passe 1 terminée."

# ── Build de l'image dans l'ACR (sans Docker local) ───────────────────────────
log "Build de l'image dans l'ACR (az acr build)..."
az acr build \
  --registry acrkalamon \
  --image "kalamon-backend:${IMAGE_TAG}" \
  --file "${SCRIPT_DIR}/../Dockerfile" \
  "${SCRIPT_DIR}/.." > /dev/null
log "Image kalamon-backend:${IMAGE_TAG} publiée dans l'ACR."

# ── Passe 2 : Container App (l'image existe désormais) ─────────────────────────
log "Passe 2/2 — Container App ca-kalamon-api..."
deploy_infra true "app"
log "Déploiement infrastructure terminé."

# ── Récupération des outputs (depuis la passe 2) ──────────────────────────────

log "Récupération des informations de déploiement..."

DEPLOYMENT_NAME="${DEPLOYMENT_PREFIX}-app"

ACR_LOGIN_SERVER=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.acrLoginServer.value" \
  -o tsv 2>/dev/null || echo "acrkalamon.azurecr.io")

CONTAINER_APP_FQDN=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.containerAppFqdn.value" \
  -o tsv 2>/dev/null || echo "<récupérer via portail Azure>")

PSQL_FQDN=$(az deployment sub show \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.postgresqlFqdn.value" \
  -o tsv 2>/dev/null || echo "psql-kalamon.postgres.database.azure.com")

echo ""
log "============================================================"
log " Déploiement réussi — Kalamon Backend"
log "============================================================"
echo ""
echo "  ACR Login Server  : ${ACR_LOGIN_SERVER}"
echo "  API URL           : https://${CONTAINER_APP_FQDN}"
echo "  PostgreSQL FQDN   : ${PSQL_FQDN}"
echo ""

# ── Prochaines étapes ─────────────────────────────────────────────────────────

echo ""
log "PROCHAINES ÉTAPES :"
echo ""
echo "1. [REQUIS] Activer pgvector et créer les index HNSW (voir infra/README.md) :"
echo "   psql \"postgresql://kalamonadmin:\${PG_ADMIN_PASSWORD}@${PSQL_FQDN}:5432/kalamon?sslmode=require\""
echo "   > CREATE EXTENSION IF NOT EXISTS vector;"
echo "   > (index HNSW sur curriculum_chunks et semantic_cache — voir README.md)"
echo "   Les migrations Prisma tournent automatiquement au démarrage (startup.sh)."
echo ""
echo "2. Vérifier la santé du container :"
echo "   az containerapp logs show --name ca-kalamon-api --resource-group ${RG_NAME} --follow"
echo "   curl https://${CONTAINER_APP_FQDN}/health"
echo ""
echo "3. Mettre à jour paymentNotifyUrl avec le FQDN réel (param du prochain déploiement) :"
echo "   https://${CONTAINER_APP_FQDN}/payments/webhook"
echo ""
echo "POUR LES MISES À JOUR DE CODE FUTURES (CI/CD ou manuel) :"
echo "   # Tag unique obligatoire — :latest ne déclenche pas de nouvelle révision ACA"
echo "   TAG=\$(git rev-parse --short HEAD)"
echo "   az acr build --registry acrkalamon --image kalamon-backend:\$TAG --file Dockerfile ."
echo "   az containerapp update --name ca-kalamon-api --resource-group ${RG_NAME} \\"
echo "     --image ${ACR_LOGIN_SERVER}/kalamon-backend:\$TAG"
echo ""
log "============================================================"
