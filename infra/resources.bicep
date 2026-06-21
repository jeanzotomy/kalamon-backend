targetScope = 'resourceGroup'

// ============================================================
// Kalamon — Ressources Azure dans le resource group kalamon-prod
// Appelé depuis main.bicep
// ============================================================

// ── Paramètres transmis depuis main.bicep ─────────────────────────────────────

param location string
param environment string
param project string
param team string
param imageTag string
param deployContainerApp bool = true

@secure()
param pgAdminPassword string

param pgSku string
param pgSkuTier string

@secure()
param jwtSecret string

@secure()
param anthropicApiKey string

@secure()
param openAiApiKey string

@secure()
param cinetpayApiKey string

@secure()
param cinetpaySiteId string

@secure()
param cinetpaySecretKey string

@secure()
param r2AccessKeyId string

@secure()
param r2SecretAccessKey string

param llmProvider string
param llmModel string
param embeddingProvider string
param embeddingModel string
param embeddingDim int
param aiDailyBudgetPerStudent int
param semanticCacheThreshold string
param paymentProvider string
param paymentCurrency string
param paymentNotifyUrl string
param paymentReturnUrl string
param pricePremiumMonthlyGnf int
param pricePremiumMonthlyXof int
param pricePremiumMonthlyXaf int
param r2AccountId string
param r2Bucket string
param r2PublicBase string
param pointsPerLesson int
param pointsPerQuizCorrect int
param corsOrigins string

// ── Noms des ressources (conventions kalamon) ────────────────────────────────

var acrName = 'acrkalamon'
var psqlName = 'psql-kalamon'
var psqlAdminLogin = 'kalamonadmin'
var psqlDbName = 'kalamon'
var logWorkspaceName = 'log-kalamon'
var caeEnvironmentName = 'cae-kalamon'
var containerAppName = 'ca-kalamon-api'
var acrLoginServer = '${acrName}.azurecr.io'
var containerImage = '${acrLoginServer}/kalamon-backend:${imageTag}'

var commonTags = {
  environment: environment
  project: project
  team: team
  managedBy: 'bicep'
}

// ── Log Analytics Workspace ───────────────────────────────────────────────────

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logWorkspaceName
  location: location
  tags: commonTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ── Azure Container Registry ──────────────────────────────────────────────────
// adminUserEnabled = true nécessaire : ACA pull avec username/password via secret
// (pas de Managed Identity cross-subscription sur ce tier)

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: commonTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
    policies: {
      retentionPolicy: {
        days: 30
        status: 'enabled'
      }
    }
  }
}

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────

resource psqlServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: psqlName
  location: location
  tags: commonTags
  sku: {
    name: pgSku
    tier: pgSkuTier
  }
  properties: {
    administratorLogin: psqlAdminLogin
    administratorLoginPassword: pgAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

// Child resource : allowlister l'extension pgvector
// OBLIGATOIRE — sans cela CREATE EXTENSION vector; échoue avec "extension not allowed"
resource psqlExtensionConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: psqlServer
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// Firewall : autoriser tous les services Azure (0.0.0.0 → 0.0.0.0 = Azure internal)
resource psqlFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: psqlServer
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Database kalamon
resource psqlDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: psqlServer
  name: psqlDbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ── Container Apps Environment ────────────────────────────────────────────────

resource caeEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: caeEnvironmentName
  location: location
  tags: commonTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

// ── DATABASE_URL construite depuis FQDN PostgreSQL ────────────────────────────
// Format : postgresql://user:pass@fqdn:5432/dbname?sslmode=require&schema=public

var psqlFqdn = psqlServer.properties.fullyQualifiedDomainName
var databaseUrl = 'postgresql://${psqlAdminLogin}:${pgAdminPassword}@${psqlFqdn}:5432/${psqlDbName}?sslmode=require&schema=public'

// ── Container App : ca-kalamon-api ────────────────────────────────────────────

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = if (deployContainerApp) {
  name: containerAppName
  location: location
  tags: commonTags
  properties: {
    managedEnvironmentId: caeEnvironment.id
    configuration: {
      // Secrets ACA — référencés dans env vars via secretRef
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'anthropic-api-key'
          value: anthropicApiKey
        }
        {
          name: 'openai-api-key'
          value: openAiApiKey
        }
        {
          name: 'cinetpay-api-key'
          value: cinetpayApiKey
        }
        {
          name: 'cinetpay-site-id'
          value: cinetpaySiteId
        }
        {
          name: 'cinetpay-secret-key'
          value: cinetpaySecretKey
        }
        {
          name: 'r2-access-key-id'
          value: r2AccessKeyId
        }
        {
          name: 'r2-secret-access-key'
          value: r2SecretAccessKey
        }
      ]
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        // HTTPS géré automatiquement par ACA — certificat managé gratuit
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'kalamon-api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          // ── Variables d'environnement ──────────────────────────────────────
          env: [
            // Valeurs non-sensibles : en clair
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'CORS_ORIGINS', value: corsOrigins }
            { name: 'LLM_PROVIDER', value: llmProvider }
            { name: 'LLM_MODEL', value: llmModel }
            { name: 'EMBEDDING_PROVIDER', value: embeddingProvider }
            { name: 'EMBEDDING_MODEL', value: embeddingModel }
            { name: 'EMBEDDING_DIM', value: string(embeddingDim) }
            { name: 'AI_DAILY_BUDGET_PER_STUDENT', value: string(aiDailyBudgetPerStudent) }
            { name: 'SEMANTIC_CACHE_THRESHOLD', value: semanticCacheThreshold }
            { name: 'PAYMENT_PROVIDER', value: paymentProvider }
            { name: 'PAYMENT_CURRENCY', value: paymentCurrency }
            { name: 'PAYMENT_NOTIFY_URL', value: paymentNotifyUrl }
            { name: 'PAYMENT_RETURN_URL', value: paymentReturnUrl }
            { name: 'PRICE_PREMIUM_MONTHLY_GNF', value: string(pricePremiumMonthlyGnf) }
            { name: 'PRICE_PREMIUM_MONTHLY_XOF', value: string(pricePremiumMonthlyXof) }
            { name: 'PRICE_PREMIUM_MONTHLY_XAF', value: string(pricePremiumMonthlyXaf) }
            { name: 'R2_ACCOUNT_ID', value: r2AccountId }
            { name: 'R2_BUCKET', value: r2Bucket }
            { name: 'R2_PUBLIC_BASE', value: r2PublicBase }
            { name: 'POINTS_PER_LESSON', value: string(pointsPerLesson) }
            { name: 'POINTS_PER_QUIZ_CORRECT', value: string(pointsPerQuizCorrect) }
            { name: 'COOKIE_SECURE', value: 'true' }
            { name: 'COOKIE_NAME', value: 'kalamon_token' }
            { name: 'JWT_EXPIRES_IN', value: '7d' }
            // Valeurs sensibles : via secretRef ACA
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'CINETPAY_API_KEY', secretRef: 'cinetpay-api-key' }
            { name: 'CINETPAY_SITE_ID', secretRef: 'cinetpay-site-id' }
            { name: 'CINETPAY_SECRET_KEY', secretRef: 'cinetpay-secret-key' }
            { name: 'R2_ACCESS_KEY_ID', secretRef: 'r2-access-key-id' }
            { name: 'R2_SECRET_ACCESS_KEY', secretRef: 'r2-secret-access-key' }
          ]
          // ── Probes liveness + readiness sur GET /health ───────────────────
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
              timeoutSeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 10
              failureThreshold: 3
              timeoutSeconds: 5
            }
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              // NestJS + Prisma migrate deploy peut prendre 60s au démarrage
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 12
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        // minReplicas: 1 OBLIGATOIRE — cold start NestJS > 15s = timeout proxy
        // Si minReplicas=0 et le container est froid, la première requête échoue
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    psqlFirewallAllowAzure
    psqlExtensionConfig
  ]
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output containerAppFqdn string = deployContainerApp ? containerApp.properties.configuration.ingress.fqdn : ''
output acrLoginServer string = acr.properties.loginServer
output postgresqlFqdn string = psqlServer.properties.fullyQualifiedDomainName
output logWorkspaceId string = logWorkspace.id
output caeEnvironmentId string = caeEnvironment.id
