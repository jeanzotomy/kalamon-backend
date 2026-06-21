#!/bin/sh
set -e

echo "[startup] Application des migrations Prisma..."
node node_modules/prisma/build/index.js migrate deploy

# Seed idempotent uniquement si demandé (RUN_SEED=true).
# Le seed (données pilote dev) tourne via ts-node — présent uniquement si
# devDependencies installées. En prod, laisser RUN_SEED non défini.
if [ "$RUN_SEED" = "true" ]; then
  echo "[startup] Seed de la base..."
  npx ts-node prisma/seed.ts || echo "[startup] seed ignoré (ts-node absent en prod)"
fi

echo "[startup] Démarrage de l'API Kalamon..."
node dist/main.js
