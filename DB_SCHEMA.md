# Kalamon — Schéma de base de données

> Document généré le 2026-06-21. Source de vérité : `prisma/schema.prisma` + migration `20260621000000_p0_p1_p2_bkt_memory_knowledge_graph`.

---

## Vue d'ensemble

| Attribut | Valeur |
|---|---|
| Moteur | PostgreSQL 16+ (compatible 17) |
| Extension vectorielle | `pgvector` — colonnes `vector(1536)` dans `curriculum_chunks` et `semantic_cache` |
| Architecture | Multi-tenant — isolation par `organizationId` sur chaque table enfant |
| Soft-delete | `deletedAt` présent sur : `organizations`, `users`, `eleves`, `lessons`, `quizzes` |
| PK | UUID v4 généré côté application (`gen_random_uuid()` ou Prisma `uuid()`) |
| Timestamps | `TIMESTAMP(3)` dans la migration initiale ; recommandé `TIMESTAMPTZ(6)` pour les prochaines migrations |
| Montants | `INTEGER` (unité monétaire de base — GNF sans décimales) |
| Paramètres BKT | `DOUBLE PRECISION` (probabilités 0–1) |
| Nombre de tables | 24 |

### Règles d'isolement

Toutes les requêtes applicatives doivent satisfaire **les deux conditions simultanément** :

```sql
WHERE organization_id = $1
  AND deleted_at IS NULL   -- pour les tables avec soft-delete
```

Le filtre `organization_id` seul ne suffit pas — un élève supprimé (soft-delete) resterait visible.

---

## Tables (24 tables)

---

### 1. organizations

**Description :** Racine du modèle multi-tenant. Chaque organisation est une école ou un réseau scolaire. Toutes les autres tables référencent `organizations.id` via `organizationId`.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `name` | `TEXT` | NON | — | Nom de l'organisation |
| `country` | `TEXT` | NON | `'GN'` | ISO 3166-1 alpha-2 du pays (Guinée par défaut) |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `deletedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Soft-delete — NULL = actif |

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `organizations_pkey` | `id` | B-tree (PK) | Accès par clé primaire |

**Relations (parents de) :** `users`, `eleves`, `lessons`, `quizzes`, `payments`, `subscriptions`

---

### 2. users

**Description :** Comptes authentifiés de la plateforme. Couvre tous les rôles : élève, parent, enseignant, directeur, admin. Un utilisateur est toujours rattaché à une organisation. Un élève possède exactement un profil `Eleve` lié.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `email` | `TEXT` | NON | — | Adresse email (unique par organisation) |
| `passwordHash` | `TEXT` | NON | — | Hash bcrypt/argon2 du mot de passe — jamais en clair |
| `fullName` | `TEXT` | NON | — | Nom complet |
| `role` | `TEXT` (enum `Role`) | NON | — | `ELEVE` \| `PARENT` \| `ENSEIGNANT` \| `DIRECTEUR` \| `ADMIN` |
| `phone` | `TEXT` | OUI | `NULL` | Téléphone E.164 (+224...) — canal WhatsApp/SMS parent |
| `country` | `TEXT` | NON | `'GN'` | ISO 3166-1 alpha-2 — détecté à l'inscription |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `deletedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Soft-delete |

**Contraintes :**
- PK : `id`
- UNIQUE : `(organizationId, email)` — deux organisations peuvent avoir le même email
- FK : `organizationId` → `organizations(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `users_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `users_organizationId_email_key` | `(organizationId, email)` | B-tree UNIQUE | Contrainte d'unicité email par org |
| `users_organizationId_idx` | `organizationId` | B-tree | Filtrage multi-tenant |

**Enum `Role` :**

| Valeur | Usage |
|---|---|
| `ELEVE` | Élève — accède au tuteur IA et aux quizzes |
| `PARENT` | Parent — reçoit les rapports de progression, effectue les paiements |
| `ENSEIGNANT` | Professeur — gère le contenu pédagogique |
| `DIRECTEUR` | Directeur d'établissement — accès rapports globaux |
| `ADMIN` | Administrateur Kalamon — accès plateforme complète |

---

### 3. eleves

**Description :** Profil pédagogique d'un élève. Étend `users` avec les données scolaires (niveau, pays). Un élève est lié à un unique `User` via `userId`. Pivot central de la progression, des interactions IA et des liens parentaux.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `userId` | `TEXT` (UUID) | NON | — | FK UNIQUE → `users.id` (1:1) |
| `niveau` | `TEXT` | NON | — | Niveau scolaire ex : `CM2`, `6e`, `Terminale` |
| `country` | `TEXT` | NON | `'GN'` | Pays — pilote le programme localisé (histoire/géo) |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `deletedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Soft-delete |

**Contraintes :**
- PK : `id`
- UNIQUE : `userId` (relation 1:1 avec `users`)
- FK : `organizationId` → `organizations(id)`
- FK : `userId` → `users(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `eleves_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `eleves_userId_key` | `userId` | B-tree UNIQUE | Contrainte 1:1 User↔Eleve |
| `eleves_organizationId_idx` | `organizationId` | B-tree | Filtrage multi-tenant |

---

### 4. parent_eleve

**Description :** Table de jonction Many-to-Many entre parents (`users` avec `role=PARENT`) et élèves. Un parent peut suivre plusieurs élèves ; un élève peut avoir plusieurs parents/tuteurs.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `parentId` | `TEXT` (UUID) | NON | — | FK → `users.id` (doit avoir `role=PARENT`) |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |

**Contraintes :**
- PK : `id`
- UNIQUE : `(parentId, eleveId)` — un lien ne peut exister qu'une fois
- FK : `parentId` → `users(id)`
- FK : `eleveId` → `eleves(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `parent_eleve_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `parent_eleve_parentId_eleveId_key` | `(parentId, eleveId)` | B-tree UNIQUE | Contrainte de doublon |

---

### 5. lessons

**Description :** Leçon pédagogique. Contient le texte source (`contenu`) qui est découpé en chunks vectorisés pour le RAG. Appartient à une organisation, ciblée par niveau et matière.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `matiere` | `TEXT` | NON | — | Matière ex : `Mathématiques`, `Français`, `Histoire` |
| `niveau` | `TEXT` | NON | — | Niveau scolaire ciblé |
| `titre` | `TEXT` | NON | — | Titre de la leçon |
| `contenu` | `TEXT` (long) | NON | — | Contenu pédagogique complet (source du chunking RAG) |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `deletedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Soft-delete |

**Contraintes :**
- PK : `id`
- FK : `organizationId` → `organizations(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `lessons_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `lessons_organizationId_niveau_matiere_idx` | `(organizationId, niveau, matiere)` | B-tree | Recherche de leçons par niveau+matière (usage fréquent) |

---

### 6. curriculum_chunks

**Description :** Fragments de leçon vectorisés pour le RAG. Chaque chunk contient ~500 tokens de la leçon parente. La colonne `embedding` stocke le vecteur sémantique (1536 dimensions, modèle `text-embedding-3-small` par défaut). L'index HNSW doit être créé séparément après peuplement initial (voir section "Scripts post-déploiement").

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `lessonId` | `TEXT` (UUID) | NON | — | FK → `lessons.id` |
| `contenu` | `TEXT` (long) | NON | — | Texte du fragment (500 tokens max) |
| `embedding` | `vector(1536)` | OUI | `NULL` | Vecteur sémantique pgvector — NULL pendant l'ingestion |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |

**Contraintes :**
- PK : `id`
- FK : `lessonId` → `lessons(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `curriculum_chunks_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `curriculum_chunks_lessonId_idx` | `lessonId` | B-tree | Récupération des chunks d'une leçon |
| `curriculum_chunks_embedding_idx` | `embedding` | **HNSW** (`vector_cosine_ops`) | Recherche de similarité sémantique pour le RAG — à créer CONCURRENTLY post-peuplement |

**Note architecturale :** La colonne `embedding` n'inclut pas `organizationId` directement — la jointure sur `lessons` (qui contient `organizationId`) est obligatoire pour toute recherche multi-tenant. Voir "Règles d'intégrité > Multi-tenant".

---

### 7. semantic_cache

**Description :** Cache sémantique des réponses IA. Quand une question élève est sémantiquement proche d'une question déjà répondue (similarité cosinus > seuil), la réponse pré-calculée est servie sans appel LLM (coût ~0). Le champ `hits` comptabilise les économies. Les `sourceChunkIds` assurent la traçabilité AI Act.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `niveau` | `TEXT` | NON | — | Niveau scolaire — réduit le périmètre de comparaison |
| `question` | `TEXT` (long) | NON | — | Question originale ayant généré cette entrée |
| `reponse` | `TEXT` (long) | NON | — | Réponse IA pré-calculée |
| `sourceChunkIds` | `TEXT[]` | NON | `'{}'` | IDs des chunks sources (conformité AI Act traçabilité) |
| `embedding` | `vector(1536)` | OUI | `NULL` | Vecteur de la question pour comparaison ANN |
| `hits` | `INTEGER` | NON | `0` | Nombre de fois que cette entrée a été servie depuis le cache |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `semantic_cache_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `semantic_cache_organizationId_niveau_idx` | `(organizationId, niveau)` | B-tree | Filtrage avant recherche vectorielle (réduit le scan) |
| `semantic_cache_embedding_idx` | `embedding` | **HNSW** (`vector_cosine_ops`) | Recherche de similarité — à créer CONCURRENTLY post-peuplement |

---

### 8. quizzes

**Description :** Quiz pédagogique. Peut être rattaché à une leçon (`lessonId` optionnel) ou indépendant. Contient les `questions` comme enfants. Supporte le soft-delete.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `lessonId` | `TEXT` (UUID) | OUI | `NULL` | FK optionnel → `lessons.id` |
| `niveau` | `TEXT` | NON | — | Niveau scolaire ciblé |
| `titre` | `TEXT` | NON | — | Titre du quiz |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `deletedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Soft-delete |

**Contraintes :**
- PK : `id`
- FK : `organizationId` → `organizations(id)`
- FK : `lessonId` → `lessons(id)` (nullable, `SetNull` implicite si leçon supprimée)

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `quizzes_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `quizzes_organizationId_niveau_idx` | `(organizationId, niveau)` | B-tree | Listage des quizzes par niveau pour un tenant |

---

### 9. questions

**Description :** Question QCM appartenant à un quiz. Les options sont stockées en tableau de texte (`options STRING[]`). `bonneRep` est l'index (0-based) de la bonne réponse dans ce tableau. `explication` est affichée après la réponse pour l'apprentissage.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `quizId` | `TEXT` (UUID) | NON | — | FK → `quizzes.id` |
| `enonce` | `TEXT` (long) | NON | — | Énoncé de la question |
| `options` | `TEXT[]` | NON | — | Liste des choix de réponse (tableau PostgreSQL) |
| `bonneRep` | `INTEGER` | NON | — | Index (0-based) de la bonne réponse dans `options` |
| `explication` | `TEXT` (long) | NON | — | Explication pédagogique affichée après réponse |

**Contraintes :**
- PK : `id`
- FK : `quizId` → `quizzes(id)` (Cascade si quiz supprimé)

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `questions_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `questions_quizId_idx` | `quizId` | B-tree | Récupération de toutes les questions d'un quiz |

---

### 10. progress

**Description :** Résumé de la progression d'un élève par matière. Une ligne par couple `(eleveId, matiere)`. `score` est le dernier score obtenu ; `points` est le total cumulé de points de gamification. Mise à jour à chaque `QuizAttempt`.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `matiere` | `TEXT` | NON | — | Matière concernée |
| `score` | `INTEGER` | NON | `0` | Dernier score (nombre de bonnes réponses) |
| `points` | `INTEGER` | NON | `0` | Points gamification cumulés |
| `updatedAt` | `TIMESTAMP(3)` | NON | — | Auto-mis à jour (`@updatedAt`) |

**Contraintes :**
- PK : `id`
- UNIQUE : `(eleveId, matiere)` — un seul enregistrement de progression par élève/matière

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `progress_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `progress_eleveId_matiere_key` | `(eleveId, matiere)` | B-tree UNIQUE | Contrainte 1 ligne/matière + accès direct |

---

### 11. quiz_attempts

**Description :** Historique des tentatives de quiz par élève. Enregistrement append-only : chaque passage de quiz crée une nouvelle ligne. Alimente les mises à jour de `progress` et les algorithmes BKT (`skill_mastery`).

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `quizId` | `TEXT` (UUID) | NON | — | FK → `quizzes.id` |
| `score` | `INTEGER` | NON | — | Nombre de bonnes réponses |
| `total` | `INTEGER` | NON | — | Nombre total de questions |
| `points` | `INTEGER` | NON | `0` | Points de gamification attribués pour cette tentative |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de la tentative |

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `quiz_attempts_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `quiz_attempts_organizationId_eleveId_idx` | `(organizationId, eleveId)` | B-tree | Historique des tentatives d'un élève dans une organisation |

---

### 12. badges

**Description :** Catalogue global des badges de gamification. Non lié à une organisation — les badges sont partagés entre tous les tenants. Le `code` est la clé métier stable (ex : `champion_lecture`).

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `code` | `TEXT` | NON | — | Identifiant technique unique (stable, utilisé dans le code) |
| `nom` | `TEXT` | NON | — | Nom affiché |
| `description` | `TEXT` | NON | — | Description du critère d'obtention |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |

**Contraintes :**
- PK : `id`
- UNIQUE : `code`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `badges_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `badges_code_key` | `code` | B-tree UNIQUE | Lookup par code métier |

---

### 13. eleve_badges

**Description :** Attribution de badges aux élèves. Table de jonction entre `eleves` et `badges`. Un élève ne peut obtenir un badge qu'une seule fois (contrainte UNIQUE).

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `badgeId` | `TEXT` (UUID) | NON | — | FK → `badges.id` |
| `obtainedAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Date d'obtention |

**Contraintes :**
- PK : `id`
- UNIQUE : `(eleveId, badgeId)` — un badge ne peut être attribué qu'une fois par élève
- FK : `eleveId` → `eleves(id)`
- FK : `badgeId` → `badges(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `eleve_badges_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `eleve_badges_eleveId_badgeId_key` | `(eleveId, badgeId)` | B-tree UNIQUE | Contrainte d'unicité |
| `eleve_badges_eleveId_idx` | `eleveId` | B-tree | Récupération de tous les badges d'un élève |

---

### 14. notifications

**Description :** Notifications in-app envoyées aux utilisateurs. Le champ `lu` permet de distinguer les notifications lues des non lues. Types prévus : `info`, `progres`, `difficulte`, `rappel`.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `userId` | `TEXT` (UUID) | NON | — | Destinataire (FK → `users.id` non déclaré en Prisma — voir note) |
| `type` | `TEXT` | NON | `'info'` | Type : `info` \| `progres` \| `difficulte` \| `rappel` |
| `titre` | `TEXT` | NON | — | Titre de la notification |
| `message` | `TEXT` | NON | — | Corps du message |
| `lu` | `BOOLEAN` | NON | `false` | Statut de lecture |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |

**Note :** `userId` n'a pas de FK Prisma déclarée sur `users` dans le schéma actuel. Contrainte à ajouter lors d'une prochaine migration si l'intégrité référentielle est requise.

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `notifications_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `notifications_organizationId_userId_lu_idx` | `(organizationId, userId, lu)` | B-tree | Récupération des notifications non lues d'un utilisateur (`lu = false`) |

---

### 15. payments

**Description :** Transactions de paiement via mobile money (CinetPay, MTN MoMo, Orange Money, Wave…). `orderId` est la référence idempotente côté Kalamon. `transactionId` est l'identifiant retourné par le provider après confirmation. Les montants sont en unité monétaire de base (GNF = valeur réelle, pas de décimales).

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `userId` | `TEXT` (UUID) | OUI | `NULL` | Payeur (parent) — optionnel |
| `eleveId` | `TEXT` (UUID) | OUI | `NULL` | Élève bénéficiaire — optionnel |
| `orderId` | `TEXT` | NON | — | Référence idempotente Kalamon (UNIQUE) |
| `transactionId` | `TEXT` | OUI | `NULL` | ID renvoyé par le provider |
| `provider` | `TEXT` | NON | `'cinetpay'` | Fournisseur : `cinetpay`, `mtn`, `orange`, `wave` |
| `purpose` | `TEXT` | NON | `'premium_monthly'` | Motif : `premium_monthly`, `premium_annual`, `content`… |
| `amount` | `INTEGER` | NON | — | Montant en unité monétaire de base (GNF sans décimales) |
| `currency` | `TEXT` | NON | `'GNF'` | ISO 4217 : `GNF`, `XOF`, `XAF` |
| `phone` | `TEXT` | OUI | `NULL` | Numéro E.164 du payeur mobile money |
| `status` | `TEXT` | NON | `'PENDING'` | `PENDING` \| `SUCCESS` \| `FAILED` \| `EXPIRED` \| `CANCELLED` |
| `redirectUrl` | `TEXT` | OUI | `NULL` | URL hébergée par le provider pour le paiement |
| `metadata` | `JSONB` | OUI | `NULL` | Payload brut du provider (webhook, callback) |
| `completedAt` | `TIMESTAMP(3)` | OUI | `NULL` | Horodatage de confirmation ou d'échec |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `updatedAt` | `TIMESTAMP(3)` | NON | — | Auto-mis à jour |

**Contraintes :**
- PK : `id`
- UNIQUE : `orderId` — garantit l'idempotence des paiements
- FK : `organizationId` → `organizations(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `payments_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `payments_orderId_key` | `orderId` | B-tree UNIQUE | Idempotence + lookup par référence Kalamon |
| `payments_organizationId_status_idx` | `(organizationId, status)` | B-tree | Paiements en attente par organisation (tableau de bord) |
| `payments_transactionId_idx` | `transactionId` | B-tree | Lookup par ID provider (webhook entrant) |

---

### 16. subscriptions

**Description :** Abonnements premium des élèves ou organisations. Un abonnement est "actif" si `status = 'ACTIVE'` ET `expiresAt > NOW()`. L'accès aux fonctionnalités premium est conditionné à cette vérification dynamique.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | FK → `organizations.id` |
| `eleveId` | `TEXT` (UUID) | OUI | `NULL` | Bénéficiaire élève — NULL = portée organisation entière |
| `plan` | `TEXT` | NON | `'premium'` | Plan souscrit : `premium`, `premium_annual` |
| `status` | `TEXT` | NON | `'ACTIVE'` | `ACTIVE` \| `CANCELLED` |
| `startedAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Date de début |
| `expiresAt` | `TIMESTAMP(3)` | NON | — | Date d'expiration — vérification dynamique requise |
| `lastPaymentId` | `TEXT` (UUID) | OUI | `NULL` | Référence au dernier paiement associé |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `updatedAt` | `TIMESTAMP(3)` | NON | — | Auto-mis à jour |

**Contraintes :**
- PK : `id`
- FK : `organizationId` → `organizations(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `subscriptions_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `subscriptions_organizationId_eleveId_plan_idx` | `(organizationId, eleveId, plan)` | B-tree | Vérification d'accès premium d'un élève |

---

### 17. ai_interactions

**Description :** Journal d'audit complet de toutes les interactions avec le tuteur IA. Obligatoire en application du Règlement IA (AI Act) pour les systèmes à haut risque (tuteur éducatif). Append-only — jamais de UPDATE ou DELETE. Enregistre la question, la réponse, les sources RAG utilisées, le modèle, les tokens consommés et le coût.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `question` | `TEXT` (long) | NON | — | Question posée par l'élève |
| `reponse` | `TEXT` (long) | NON | — | Réponse générée par le tuteur IA |
| `source` | `TEXT` | NON | — | Origine de la réponse : `CACHE` \| `PRECALCUL` \| `RAG_LIVE` |
| `sourceChunkIds` | `TEXT[]` | NON | `'{}'` | IDs des chunks curriculum utilisés (traçabilité) |
| `modelUsed` | `TEXT` | OUI | `NULL` | Modèle LLM invoqué ex : `claude-sonnet-4-5` |
| `inputTokens` | `INTEGER` | NON | `0` | Tokens en entrée |
| `outputTokens` | `INTEGER` | NON | `0` | Tokens en sortie |
| `costUsd` | `DOUBLE PRECISION` | NON | `0` | Coût estimé en USD |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de l'interaction |

**Contraintes :**
- PK : `id`
- FK : `eleveId` → `eleves(id)`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `ai_interactions_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `ai_interactions_organizationId_createdAt_idx` | `(organizationId, createdAt)` | B-tree | Rapports d'usage et audit par organisation sur période |
| `ai_interactions_eleveId_createdAt_idx` | `(eleveId, createdAt)` | B-tree | Historique chronologique des interactions d'un élève |

---

### 18. skill_mastery

**Description :** Paramètres Bayesian Knowledge Tracing (BKT) par élève et par compétence. Implémente le modèle OATutor/Berkeley à 4 paramètres. `probMastery` est la probabilité courante que l'élève maîtrise la compétence — mise à jour après chaque réponse via la formule de Bayes. Sert à l'adaptation du contenu et à la détection des lacunes.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `skill` | `TEXT` | NON | — | Code de compétence ex : `math:fractions`, `francais:conjugaison_passe` |
| `matiere` | `TEXT` | NON | — | Matière parente de la compétence |
| `probMastery` | `DOUBLE PRECISION` | NON | `0.1` | P(Know) — probabilité de maîtrise courante [0–1] |
| `probTransit` | `DOUBLE PRECISION` | NON | `0.3` | P(T) — probabilité d'apprentissage à chaque réponse [0–1] |
| `probSlip` | `DOUBLE PRECISION` | NON | `0.1` | P(S) — probabilité d'erreur malgré la maîtrise [0–1] |
| `probGuess` | `DOUBLE PRECISION` | NON | `0.2` | P(G) — probabilité de bonne réponse par hasard [0–1] |
| `attempts` | `INTEGER` | NON | `0` | Nombre total de tentatives sur cette compétence |
| `correctCount` | `INTEGER` | NON | `0` | Nombre de réponses correctes |
| `lastPracticed` | `TIMESTAMP(3)` | OUI | `NULL` | Dernière pratique — pour la planification spaced repetition |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de création |
| `updatedAt` | `TIMESTAMP(3)` | NON | — | Auto-mis à jour |

**Contraintes :**
- PK : `id`
- UNIQUE : `(eleveId, skill)` — un seul enregistrement BKT par élève et compétence

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `skill_mastery_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `skill_mastery_eleveId_skill_key` | `(eleveId, skill)` | B-tree UNIQUE | Accès direct + contrainte d'unicité |
| `skill_mastery_organizationId_eleveId_idx` | `(organizationId, eleveId)` | B-tree | Tableau de maîtrise complet d'un élève |

---

### 19. memory_traces

**Description :** Mémoire L1 — traces brutes par session (append-only). Chaque question posée par l'élève en session tuteur crée une trace. Ces traces alimentent la synthèse L2 (`memory_surfaces`) et L3 (`student_profiles`). Ne jamais supprimer ces traces — elles constituent l'historique pédagogique.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `surface` | `TEXT` | NON | — | Domaine de compétence ex : `math:fractions`, `francais:lecture` |
| `question` | `TEXT` (long) | NON | — | Question posée |
| `reponse` | `TEXT` (long) | NON | — | Réponse de l'élève ou du tuteur |
| `skillCode` | `TEXT` | OUI | `NULL` | Lien optionnel vers `skill_mastery.skill` pour mise à jour BKT |
| `mastered` | `BOOLEAN` | NON | `false` | L'élève a-t-il démontré la maîtrise dans cette trace ? |
| `difficulty` | `TEXT` | NON | `'MEDIUM'` | Niveau de difficulté : `LOW` \| `MEDIUM` \| `HIGH` |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de la trace |

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `memory_traces_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `memory_traces_eleveId_surface_idx` | `(eleveId, surface)` | B-tree | Récupération des traces d'un élève sur une surface (synthèse L2) |
| `memory_traces_organizationId_eleveId_idx` | `(organizationId, eleveId)` | B-tree | Export complet des traces d'un élève (RGPD Art. 20) |

---

### 20. memory_surfaces

**Description :** Mémoire L2 — résumé par matière/surface. Généré périodiquement (ex : après 10 nouvelles traces) par le job de synthèse. Contient un résumé LLM de la progression sur chaque surface. `traceCount` permet de déclencher une re-synthèse au seuil voulu.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | — | FK → `eleves.id` |
| `surface` | `TEXT` | NON | — | Domaine de compétence identique à `memory_traces.surface` |
| `summary` | `TEXT` (long) | NON | — | Résumé LLM de la progression sur cette surface |
| `traceCount` | `INTEGER` | NON | `0` | Nombre de traces intégrées dans ce résumé |
| `lastUpdated` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Dernière mise à jour du résumé |

**Contraintes :**
- PK : `id`
- UNIQUE : `(eleveId, surface)` — un résumé par élève et surface

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `memory_surfaces_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `memory_surfaces_eleveId_surface_key` | `(eleveId, surface)` | B-tree UNIQUE | Accès direct + contrainte d'unicité |
| `memory_surfaces_organizationId_eleveId_idx` | `(organizationId, eleveId)` | B-tree | Récupération de tous les résumés d'un élève |

---

### 21. student_profiles

**Description :** Mémoire L3 — profil synthétique cross-sessions. Généré hebdomadairement par un job de synthèse globale. Contient 4 sections en Markdown : profil global, activité récente (7 jours), forces, faiblesses. Injecté dans le contexte système du tuteur IA pour personnaliser les réponses.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `eleveId` | `TEXT` (UUID) | NON | UNIQUE | FK → `eleves.id` (1:1) |
| `profileMd` | `TEXT` (long) | NON | — | Profil global (synthèse complète) en Markdown |
| `recentMd` | `TEXT` (long) | NON | — | Activité des 7 derniers jours |
| `strengthsMd` | `TEXT` (long) | NON | — | Compétences maîtrisées |
| `weaknessesMd` | `TEXT` (long) | NON | — | Lacunes identifiées |
| `lastSynthesis` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Date de la dernière synthèse |

**Contraintes :**
- PK : `id`
- UNIQUE : `eleveId` — exactement un profil L3 par élève

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `student_profiles_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `student_profiles_eleveId_key` | `eleveId` | B-tree UNIQUE | Accès direct par élève + contrainte 1:1 |
| `student_profiles_organizationId_idx` | `organizationId` | B-tree | Listage des profils d'une organisation |

---

### 22. concepts

**Description :** Nœuds du graphe de connaissances (Knowledge Graph, pattern LOOM). Chaque concept est une compétence ou notion du programme scolaire. Les relations entre concepts (prérequis) sont gérées dans `concept_prerequisites`. Permet de détecter qu'un élève a une lacune sur un prérequis non encore travaillé.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `matiere` | `TEXT` | NON | — | Matière ex : `Mathématiques`, `Français` |
| `niveau` | `TEXT` | NON | — | Niveau scolaire ciblé |
| `code` | `TEXT` | NON | — | Identifiant technique stable ex : `fractions`, `tables_multiplication` |
| `label` | `TEXT` | NON | — | Nom affiché ex : `Fractions simples` |
| `description` | `TEXT` (long) | OUI | `NULL` | Description pédagogique optionnelle |

**Contraintes :**
- PK : `id`
- UNIQUE : `(organizationId, matiere, code)` — un code de concept est unique par matière dans une organisation

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `concepts_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `concepts_organizationId_matiere_code_key` | `(organizationId, matiere, code)` | B-tree UNIQUE | Contrainte + lookup par code métier |
| `concepts_organizationId_matiere_niveau_idx` | `(organizationId, matiere, niveau)` | B-tree | Récupération du graphe d'une matière/niveau |

---

### 23. concept_prerequisites

**Description :** Arêtes du graphe de connaissances. Représente la relation "X nécessite Y comme prérequis". `conceptId` est le concept qui dépend de `prerequisiteId`. Structure DAG (graphe acyclique dirigé) — l'application doit garantir l'absence de cycles lors de l'insertion.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `conceptId` | `TEXT` (UUID) | NON | — | FK → `concepts.id` — le concept qui a besoin du prérequis |
| `prerequisiteId` | `TEXT` (UUID) | NON | — | FK → `concepts.id` — le prérequis à maîtriser d'abord |

**Contraintes :**
- PK : `id`
- UNIQUE : `(conceptId, prerequisiteId)` — une arête unique entre deux nœuds
- FK : `conceptId` → `concepts(id)` ON DELETE RESTRICT ON UPDATE CASCADE
- FK : `prerequisiteId` → `concepts(id)` ON DELETE RESTRICT ON UPDATE CASCADE

**Note :** `RESTRICT` sur les deux FK — impossible de supprimer un concept utilisé comme prérequis ou qui a des prérequis. Supprimer d'abord les arêtes.

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `concept_prerequisites_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `concept_prerequisites_conceptId_prerequisiteId_key` | `(conceptId, prerequisiteId)` | B-tree UNIQUE | Contrainte + navigation DAG |

---

### 24. ingestion_jobs

**Description :** Jobs d'ingestion de documents pédagogiques (PDF, DOCX). Cycle de vie : `PENDING` → `PROCESSING` → `DONE` ou `FAILED`. À l'état `DONE`, les chunks vectorisés ont été créés dans `curriculum_chunks` et leur nombre est consigné dans `chunksCreated`. En cas d'échec, `error` contient le message d'erreur.

**Colonnes :**

| Colonne | Type SQL | Nullable | Défaut | Description |
|---|---|---|---|---|
| `id` | `TEXT` (UUID v4) | NON | `uuid()` | Clé primaire |
| `organizationId` | `TEXT` (UUID) | NON | — | Isolation multi-tenant |
| `fileName` | `TEXT` | NON | — | Nom du fichier source |
| `fileUrl` | `TEXT` | NON | — | URL de téléchargement (blob storage) |
| `niveau` | `TEXT` | NON | — | Niveau scolaire ciblé pour les chunks générés |
| `matiere` | `TEXT` | NON | — | Matière ciblée pour les chunks générés |
| `status` | `TEXT` | NON | `'PENDING'` | `PENDING` \| `PROCESSING` \| `DONE` \| `FAILED` |
| `chunksCreated` | `INTEGER` | NON | `0` | Nombre de chunks créés à l'issue du job |
| `error` | `TEXT` | OUI | `NULL` | Message d'erreur si `status = 'FAILED'` |
| `createdAt` | `TIMESTAMP(3)` | NON | `CURRENT_TIMESTAMP` | Horodatage de soumission du job |
| `updatedAt` | `TIMESTAMP(3)` | NON | — | Auto-mis à jour |

**Contraintes :**
- PK : `id`

**Index :**

| Index | Colonnes | Type | Objectif |
|---|---|---|---|
| `ingestion_jobs_pkey` | `id` | B-tree (PK) | Accès par clé primaire |
| `ingestion_jobs_organizationId_status_idx` | `(organizationId, status)` | B-tree | Récupération des jobs en attente ou en cours par organisation |

---

## Relations — diagramme ER (Mermaid)

```mermaid
erDiagram
    organizations ||--o{ users : "a"
    organizations ||--o{ eleves : "inscrit"
    organizations ||--o{ lessons : "possede"
    organizations ||--o{ quizzes : "possede"
    organizations ||--o{ payments : "facture"
    organizations ||--o{ subscriptions : "souscrit"

    users ||--o| eleves : "profil 1-1"
    users ||--o{ parent_eleve : "est parent de"

    eleves ||--o{ parent_eleve : "a comme parents"
    eleves ||--o{ progress : "progression par matiere"
    eleves ||--o{ quiz_attempts : "tentatives"
    eleves ||--o{ eleve_badges : "badges obtenus"
    eleves ||--o{ ai_interactions : "interactions IA"
    eleves ||--o{ skill_mastery : "maitrise BKT"
    eleves ||--o{ memory_traces : "traces L1"
    eleves ||--o{ memory_surfaces : "resumes L2"
    eleves ||--|| student_profiles : "profil L3"

    lessons ||--o{ curriculum_chunks : "chunke en"
    lessons ||--o{ quizzes : "associe a"

    quizzes ||--o{ questions : "contient"

    badges ||--o{ eleve_badges : "attribue a"

    concepts ||--o{ concept_prerequisites : "depend de"
    concepts ||--o{ concept_prerequisites : "est prerequis de"
```

### Relations structurantes

| Relation | Type | Note |
|---|---|---|
| `organizations` → `users` | 1:N | Via `organizationId` |
| `users` → `eleves` | 1:1 | Via `userId UNIQUE` |
| `users` ↔ `eleves` | N:M | Via `parent_eleve` |
| `lessons` → `curriculum_chunks` | 1:N | Les chunks héritent de `organizationId` via jointure |
| `eleves` → `student_profiles` | 1:1 | Via `eleveId UNIQUE` |
| `eleves` → `skill_mastery` | 1:N | UNIQUE `(eleveId, skill)` |
| `concepts` ↔ `concepts` | N:M (DAG) | Via `concept_prerequisites` — self-referentiel |

---

## Règles d'intégrité

### Soft-delete

Les tables suivantes implémentent le soft-delete via `deletedAt` :

| Table | Champ | Comportement |
|---|---|---|
| `organizations` | `deletedAt` | Filtre global sur toutes les entités enfant |
| `users` | `deletedAt` | L'utilisateur reste en base pour l'historique |
| `eleves` | `deletedAt` | Préserve `progress`, `ai_interactions`, `skill_mastery` |
| `lessons` | `deletedAt` | Les chunks restent (réutilisables après restauration) |
| `quizzes` | `deletedAt` | Les `questions` restent — `quiz_attempts` historisées |

**Tables sans soft-delete (toujours présentes) :**
`parent_eleve`, `curriculum_chunks`, `semantic_cache`, `questions`, `progress`, `quiz_attempts`, `badges`, `eleve_badges`, `notifications`, `payments`, `subscriptions`, `ai_interactions`, `skill_mastery`, `memory_traces`, `memory_surfaces`, `student_profiles`, `concepts`, `concept_prerequisites`, `ingestion_jobs`

**Middleware Prisma — SOFT_DELETE_MODELS :**

```typescript
const SOFT_DELETE_MODELS = new Set([
  'Organization',
  'User',
  'Eleve',
  'Lesson',
  'Quiz',
]);
```

### Multi-tenant isolation

La règle absolue pour toute requête Prisma dans Kalamon :

```typescript
// TOUJOURS les deux conditions simultanément
const result = await prisma.eleve.findFirst({
  where: {
    id: eleveId,
    organizationId,   // isolation tenant
    deletedAt: null,  // soft-delete
  },
});
if (!result) throw new NotFoundException();
```

**Cas particulier `curriculum_chunks` :** pas de `organizationId` direct — la jointure sur `lessons` est obligatoire :

```sql
SELECT cc.*
FROM curriculum_chunks cc
JOIN lessons l ON l.id = cc.lesson_id
WHERE l.organization_id = $1
  AND l.deleted_at IS NULL
ORDER BY cc.embedding <=> $2::vector
LIMIT 5;
```

**Cas particulier `badges` :** table globale (catalogue partagé) — pas de `organizationId`. L'isolation se fait via `eleve_badges` → `eleves` → `organizationId`.

### Champs obligatoires sur chaque entité

| Catégorie | Champ | Tables concernées |
|---|---|---|
| Identifiant | `id` (UUID v4) | Toutes |
| Tenant | `organizationId` | Toutes sauf `badges`, `concept_prerequisites`, `curriculum_chunks`, `questions`, `parent_eleve`, `progress`, `eleve_badges` |
| Création | `createdAt` | Toutes |
| Soft-delete | `deletedAt` | `organizations`, `users`, `eleves`, `lessons`, `quizzes` |

---

## Index vectoriels (pgvector)

### Architecture

- Extension : `pgvector` — doit être activée avant toute migration
- Dimensions : `1536` (modèle `text-embedding-3-small` d'OpenAI, compatible `text-embedding-ada-002`)
- Métrique : cosinus (`vector_cosine_ops`) — adaptée aux embeddings de texte normalisés
- Algorithme : **HNSW** (Hierarchical Navigable Small World) — recommandé en production sur pgvector 0.5+

### Pourquoi HNSW plutôt qu'IVFFlat

| Critère | HNSW | IVFFlat |
|---|---|---|
| Performance requête | Plus rapide | Plus lent |
| Construction | Possible sur table vide | Doit être construit après insertion |
| Mémoire | Plus élevée | Plus basse |
| Paramétrage | `m`, `ef_construction` | `lists` |
| Production | **Recommandé** | Déconseillé (table vide = index inutile) |

### Paramètres HNSW recommandés pour Kalamon

| Paramètre | Valeur | Signification |
|---|---|---|
| `m` | `16` | Connexions par nœud — équilibre vitesse/précision |
| `ef_construction` | `64` | Qualité de construction — augmenter à 128 pour meilleure précision |
| `ef_search` (runtime) | `40` | À ajuster : `SET hnsw.ef_search = 40;` avant requête |

---

## Scripts post-déploiement (à exécuter une fois)

Ces scripts doivent être exécutés **après** les migrations Prisma standard, dans l'ordre indiqué.

### Étape 1 — Activation de pgvector

```sql
-- Activer l'extension pgvector (nécessite superuser ou rds_superuser sur RDS/Azure)
CREATE EXTENSION IF NOT EXISTS vector;

-- Vérification
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
-- Doit retourner : vector | 0.7.x (ou supérieur)
```

### Étape 2 — Index HNSW sur curriculum_chunks

```sql
-- CONCURRENTLY : pas de verrou de table, safe sur traffic live
-- Ne peut PAS être exécuté dans une transaction
-- Durée estimée : 1–5 minutes selon le volume de chunks

CREATE INDEX CONCURRENTLY IF NOT EXISTS "curriculum_chunks_embedding_hnsw_idx"
  ON "curriculum_chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Vérification
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'curriculum_chunks'
  AND indexname = 'curriculum_chunks_embedding_hnsw_idx';
```

### Étape 3 — Index HNSW sur semantic_cache

```sql
-- Même approche pour le cache sémantique

CREATE INDEX CONCURRENTLY IF NOT EXISTS "semantic_cache_embedding_hnsw_idx"
  ON "semantic_cache"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Vérification
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'semantic_cache'
  AND indexname = 'semantic_cache_embedding_hnsw_idx';
```

### Étape 4 — Configuration de la recherche (à placer dans chaque requête RAG)

```sql
-- Augmenter ef_search pour meilleure précision (au détriment de la vitesse)
-- À définir en début de session ou de transaction
SET hnsw.ef_search = 40;

-- Exemple de requête RAG complète avec isolation multi-tenant
SELECT cc.id, cc.contenu,
       1 - (cc.embedding <=> $2::vector) AS similarity
FROM curriculum_chunks cc
JOIN lessons l ON l.id = cc.lesson_id
WHERE l.organization_id = $1
  AND l.deleted_at IS NULL
  AND cc.embedding IS NOT NULL
ORDER BY cc.embedding <=> $2::vector
LIMIT 5;
-- $1 = organizationId (TEXT/UUID)
-- $2 = vecteur de la question (float[] sérialisé)
```

### Étape 5 — Vérification globale post-déploiement

```sql
-- Lister toutes les extensions actives
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- Lister tous les index (dont HNSW)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Compter les tables créées
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
-- Doit retourner 24

-- Vérifier que les colonnes vector existent
SELECT table_name, column_name, udt_name
FROM information_schema.columns
WHERE udt_name = 'vector'
ORDER BY table_name;
-- Doit lister : curriculum_chunks.embedding, semantic_cache.embedding
```

---

## Variables d'environnement requises

| Variable | Exemple | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/kalamon?sslmode=require` | URL de connexion PostgreSQL |
| `EMBEDDING_DIM` | `1536` | Dimensions des vecteurs — doit correspondre au modèle utilisé |
| `OPENAI_API_KEY` | `sk-...` | Clé API OpenAI pour `text-embedding-3-small` |

---

## Notes de déploiement par environnement

### Supabase (développement)

```bash
# pgvector est activé par défaut sur Supabase
# Exécuter uniquement les étapes 2, 3, 4, 5
```

### Azure Database for PostgreSQL Flexible Server (production)

```bash
# pgvector disponible en extension autorisée depuis PG 14
# Nécessite d'abord :
# az postgres flexible-server parameter set \
#   --resource-group <rg> --server-name <name> \
#   --name azure.extensions --value vector

# Puis exécuter les étapes 1–5
```

### Neon (alternative cloud)

```bash
# pgvector activé par défaut
# Exécuter uniquement les étapes 2, 3, 4, 5
```
