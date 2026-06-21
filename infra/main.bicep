targetScope = 'subscription'

// ============================================================
// Kalamon Backend — Infrastructure Azure Container Apps
// Subscription : dev-test (179b73a2-60ab-4fd1-a025-755c2409d140)
// Region       : canadacentral (par défaut)
// ============================================================

@description('Région Azure cible')
param location string = 'canadacentral'

@description('Nom du resource group à créer')
param rgName string = 'kalamon-prod'

@description('Tag environnement')
param environment string = 'production'

@description('Tag projet')
param project string = 'kalamon'

@description('Tag d\'équipe')
param team string = 'kalamon-backend'

// ── Secrets applicatifs (tous @secure — jamais en clair) ─────────────────────

@secure()
@description('Mot de passe administrateur PostgreSQL Flexible Server')
param pgAdminPassword string

@secure()
@description('Clé secrète JWT (minimum 32 caractères)')
param jwtSecret string

@secure()
@description('Clé API Anthropic')
param anthropicApiKey string

@secure()
@description('Clé API OpenAI (embeddings)')
param openAiApiKey string

@secure()
@description('Clé API CinetPay')
param cinetpayApiKey string

@secure()
@description('Site ID CinetPay')
param cinetpaySiteId string

@secure()
@description('Clé secrète CinetPay')
param cinetpaySecretKey string

@secure()
@description('Cloudflare R2 Access Key ID')
param r2AccessKeyId string

@secure()
@description('Cloudflare R2 Secret Access Key')
param r2SecretAccessKey string

// ── Paramètres non-secrets ────────────────────────────────────────────────────

@description('Tag image Docker à déployer')
param imageTag string = 'latest'

@description('Déployer la Container App. Mettre à false au 1er passage (avant que l\'image existe dans l\'ACR), puis à true après le build. Évite ImagePullBackOff au bootstrap.')
param deployContainerApp bool = true

@description('SKU PostgreSQL Flexible Server (Standard_B1ms = burstable MVP)')
@allowed(['Standard_B1ms', 'Standard_B2s', 'Standard_D2s_v3'])
param pgSku string = 'Standard_B1ms'

@description('Tier PostgreSQL correspondant au SKU')
@allowed(['Burstable', 'GeneralPurpose'])
param pgSkuTier string = 'Burstable'

@description('LLM provider (anthropic | azure-openai)')
param llmProvider string = 'anthropic'

@description('Modèle LLM à utiliser')
param llmModel string = 'claude-haiku-4-5'

@description('Provider d\'embeddings (openai | azure-openai)')
param embeddingProvider string = 'openai'

@description('Modèle d\'embeddings')
param embeddingModel string = 'text-embedding-3-small'

@description('Dimensions du vecteur embedding')
param embeddingDim int = 1536

@description('Budget IA journalier par élève (unité = tokens)')
param aiDailyBudgetPerStudent int = 120

@description('Seuil de similarité cache sémantique (0-1)')
param semanticCacheThreshold string = '0.92'

@description('Provider de paiement')
param paymentProvider string = 'cinetpay'

@description('Devise de paiement par défaut')
param paymentCurrency string = 'GNF'

@description('URL publique webhook paiement (callback CinetPay)')
param paymentNotifyUrl string

@description('URL de retour paiement (page frontend)')
param paymentReturnUrl string

@description('Prix premium mensuel GNF')
param pricePremiumMonthlyGnf int = 20000

@description('Prix premium mensuel XOF')
param pricePremiumMonthlyXof int = 1000

@description('Prix premium mensuel XAF')
param pricePremiumMonthlyXaf int = 1000

@description('Cloudflare R2 Account ID')
param r2AccountId string

@description('Nom du bucket R2')
param r2Bucket string = 'kalamon'

@description('URL publique du bucket R2 (custom domain ou r2.dev)')
param r2PublicBase string

@description('Points attribués par leçon complétée')
param pointsPerLesson int = 10

@description('Points attribués par bonne réponse quiz')
param pointsPerQuizCorrect int = 5

@description('Origines CORS autorisées (virgule-séparées)')
param corsOrigins string

// ── Resource Group ────────────────────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: rgName
  location: location
  tags: {
    environment: environment
    project: project
    team: team
    managedBy: 'bicep'
  }
}

// ── Module principal (toutes les ressources dans le RG) ──────────────────────

module resources 'resources.bicep' = {
  name: 'kalamon-resources'
  scope: rg
  params: {
    location: location
    environment: environment
    project: project
    team: team
    imageTag: imageTag
    deployContainerApp: deployContainerApp
    pgAdminPassword: pgAdminPassword
    pgSku: pgSku
    pgSkuTier: pgSkuTier
    jwtSecret: jwtSecret
    anthropicApiKey: anthropicApiKey
    openAiApiKey: openAiApiKey
    cinetpayApiKey: cinetpayApiKey
    cinetpaySiteId: cinetpaySiteId
    cinetpaySecretKey: cinetpaySecretKey
    r2AccessKeyId: r2AccessKeyId
    r2SecretAccessKey: r2SecretAccessKey
    llmProvider: llmProvider
    llmModel: llmModel
    embeddingProvider: embeddingProvider
    embeddingModel: embeddingModel
    embeddingDim: embeddingDim
    aiDailyBudgetPerStudent: aiDailyBudgetPerStudent
    semanticCacheThreshold: semanticCacheThreshold
    paymentProvider: paymentProvider
    paymentCurrency: paymentCurrency
    paymentNotifyUrl: paymentNotifyUrl
    paymentReturnUrl: paymentReturnUrl
    pricePremiumMonthlyGnf: pricePremiumMonthlyGnf
    pricePremiumMonthlyXof: pricePremiumMonthlyXof
    pricePremiumMonthlyXaf: pricePremiumMonthlyXaf
    r2AccountId: r2AccountId
    r2Bucket: r2Bucket
    r2PublicBase: r2PublicBase
    pointsPerLesson: pointsPerLesson
    pointsPerQuizCorrect: pointsPerQuizCorrect
    corsOrigins: corsOrigins
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output resourceGroupName string = rg.name
output containerAppFqdn string = resources.outputs.containerAppFqdn
output acrLoginServer string = resources.outputs.acrLoginServer
output postgresqlFqdn string = resources.outputs.postgresqlFqdn
output containerAppDeployed bool = deployContainerApp
