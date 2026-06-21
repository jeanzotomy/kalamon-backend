-- P0 : Bayesian Knowledge Tracing
CREATE TABLE "skill_mastery" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eleveId"        TEXT NOT NULL,
    "skill"          TEXT NOT NULL,
    "matiere"        TEXT NOT NULL,
    "probMastery"    DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "probTransit"    DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "probSlip"       DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "probGuess"      DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "correctCount"   INTEGER NOT NULL DEFAULT 0,
    "lastPracticed"  TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_mastery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skill_mastery_eleveId_skill_key" ON "skill_mastery"("eleveId", "skill");
CREATE INDEX "skill_mastery_organizationId_eleveId_idx" ON "skill_mastery"("organizationId", "eleveId");

-- P0 : Mémoire L1 — traces brutes
CREATE TABLE "memory_traces" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eleveId"        TEXT NOT NULL,
    "surface"        TEXT NOT NULL,
    "question"       TEXT NOT NULL,
    "reponse"        TEXT NOT NULL,
    "skillCode"      TEXT,
    "mastered"       BOOLEAN NOT NULL DEFAULT false,
    "difficulty"     TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memory_traces_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "memory_traces_eleveId_surface_idx" ON "memory_traces"("eleveId", "surface");
CREATE INDEX "memory_traces_organizationId_eleveId_idx" ON "memory_traces"("organizationId", "eleveId");

-- P0 : Mémoire L2 — résumés par surface
CREATE TABLE "memory_surfaces" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eleveId"        TEXT NOT NULL,
    "surface"        TEXT NOT NULL,
    "summary"        TEXT NOT NULL,
    "traceCount"     INTEGER NOT NULL DEFAULT 0,
    "lastUpdated"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memory_surfaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "memory_surfaces_eleveId_surface_key" ON "memory_surfaces"("eleveId", "surface");
CREATE INDEX "memory_surfaces_organizationId_eleveId_idx" ON "memory_surfaces"("organizationId", "eleveId");

-- P0 : Mémoire L3 — profil synthétique
CREATE TABLE "student_profiles" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "eleveId"         TEXT NOT NULL,
    "profileMd"       TEXT NOT NULL,
    "recentMd"        TEXT NOT NULL,
    "strengthsMd"     TEXT NOT NULL,
    "weaknessesMd"    TEXT NOT NULL,
    "lastSynthesis"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "student_profiles_eleveId_key" ON "student_profiles"("eleveId");
CREATE INDEX "student_profiles_organizationId_idx" ON "student_profiles"("organizationId");

-- P1 : Knowledge Graph — nœuds concepts
CREATE TABLE "concepts" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "matiere"        TEXT NOT NULL,
    "niveau"         TEXT NOT NULL,
    "code"           TEXT NOT NULL,
    "label"          TEXT NOT NULL,
    "description"    TEXT,
    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "concepts_organizationId_matiere_code_key" ON "concepts"("organizationId", "matiere", "code");
CREATE INDEX "concepts_organizationId_matiere_niveau_idx" ON "concepts"("organizationId", "matiere", "niveau");

-- P1 : Knowledge Graph — arêtes prérequis
CREATE TABLE "concept_prerequisites" (
    "id"             TEXT NOT NULL,
    "conceptId"      TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    CONSTRAINT "concept_prerequisites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "concept_prerequisites_conceptId_prerequisiteId_key" ON "concept_prerequisites"("conceptId", "prerequisiteId");
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_conceptId_fkey"
    FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "concept_prerequisites" ADD CONSTRAINT "concept_prerequisites_prerequisiteId_fkey"
    FOREIGN KEY ("prerequisiteId") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- P1 : Jobs d'ingestion PDF
CREATE TABLE "ingestion_jobs" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName"       TEXT NOT NULL,
    "fileUrl"        TEXT NOT NULL,
    "niveau"         TEXT NOT NULL,
    "matiere"        TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "chunksCreated"  INTEGER NOT NULL DEFAULT 0,
    "error"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ingestion_jobs_organizationId_status_idx" ON "ingestion_jobs"("organizationId", "status");

-- Index HNSW pour les embeddings curriculum (si pas déjà présent)
-- CREATE INDEX CONCURRENTLY "curriculum_chunks_embedding_idx"
--   ON "curriculum_chunks" USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
