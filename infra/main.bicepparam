// ============================================================
// Kalamon Backend — Fichier de paramètres Bicep
// USAGE : az deployment sub create --parameters @infra/main.bicepparam
//
// NE PAS committer ce fichier avec de vraies valeurs.
// Les secrets (<secret:...>) doivent être fournis via :
//   - Variables d'environnement dans le script deploy-infra.sh
//   - Azure Key Vault (getSecret) pour les pipelines CI/CD
//   - az deployment sub create --parameters pgAdminPassword=$PG_ADMIN_PASSWORD
// ============================================================

using './main.bicep'

// ── Infrastructure ────────────────────────────────────────────────────────────

param location = 'canadacentral'
param rgName   = 'kalamon-prod'
param imageTag = 'latest'  // Remplacer par un tag timestamp en update : '20260621120000'

param environment = 'production'
param project     = 'kalamon'
param team        = 'kalamon-backend'

// ── Base de données ───────────────────────────────────────────────────────────

// SKU options (du moins cher au plus cher) :
//   Standard_B1ms  (Burstable, 1 vCore, 2GB RAM)  — ~25$/mois
//   Standard_B2s   (Burstable, 2 vCore, 4GB RAM)  — ~50$/mois
//   Standard_D2s_v3 (GP, 2 vCore, 8GB RAM)        — ~130$/mois
param pgSku     = 'Standard_B1ms'
param pgSkuTier = 'Burstable'

// IMPORTANT : Ne jamais mettre le vrai mot de passe ici.
// Passer via : az deployment sub create --parameters pgAdminPassword=$PG_ADMIN_PASSWORD
param pgAdminPassword = '<secret:pg-admin-password>'

// ── JWT ───────────────────────────────────────────────────────────────────────

// Minimum 32 caractères. Générer : openssl rand -base64 48
param jwtSecret = '<secret:jwt-secret>'

// ── IA — LLM + Embeddings ─────────────────────────────────────────────────────

param anthropicApiKey = '<secret:anthropic-api-key>'
param openAiApiKey    = '<secret:openai-api-key>'
param llmProvider     = 'anthropic'
param llmModel        = 'claude-haiku-4-5'
param embeddingProvider = 'openai'
param embeddingModel    = 'text-embedding-3-small'
param embeddingDim      = 1536

// ── Garde-fous coût IA ───────────────────────────────────────────────────────

param aiDailyBudgetPerStudent  = 120
param semanticCacheThreshold   = '0.92'

// ── Paiement CinetPay ─────────────────────────────────────────────────────────

param cinetpayApiKey    = '<secret:cinetpay-api-key>'
param cinetpaySiteId    = '<secret:cinetpay-site-id>'
param cinetpaySecretKey = '<secret:cinetpay-secret-key>'
param paymentProvider   = 'cinetpay'
param paymentCurrency   = 'GNF'

// URLs publiques du backend déployé — mettre à jour après premier déploiement
// Le FQDN ACA est visible dans le portail ou via : az containerapp show --name ca-kalamon-api ...
param paymentNotifyUrl = 'https://ca-kalamon-api.<env>.canadacentral.azurecontainerapps.io/payments/webhook'
param paymentReturnUrl = 'https://app.kalamon.example/paiement/retour'

// Tarifs premium (unités monétaires de base)
param pricePremiumMonthlyGnf = 20000
param pricePremiumMonthlyXof = 1000
param pricePremiumMonthlyXaf = 1000

// ── Cloudflare R2 ─────────────────────────────────────────────────────────────

param r2AccountId      = '<r2-account-id>'
param r2AccessKeyId    = '<secret:r2-access-key-id>'
param r2SecretAccessKey = '<secret:r2-secret-access-key>'
param r2Bucket         = 'kalamon'
param r2PublicBase     = 'https://pub-<r2-hash>.r2.dev'  // ou custom domain

// ── Gamification ─────────────────────────────────────────────────────────────

param pointsPerLesson      = 10
param pointsPerQuizCorrect = 5

// ── CORS ─────────────────────────────────────────────────────────────────────

// Origines autorisées — séparer par virgule, sans espace
// Ex : 'https://app.kalamon.example,https://admin.kalamon.example'
param corsOrigins = 'https://app.kalamon.example'
