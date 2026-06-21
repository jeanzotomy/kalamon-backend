.PHONY: dev build test lint migrate seed docker-up docker-down docker-logs db-shell pgvector-init help

# ── Dev local ────────────────────────────────────────────────────────────────

dev: ## Lancer le serveur NestJS en mode watch
	npm run start:dev

build: ## Compiler le projet TypeScript
	npm run build

test: ## Lancer les tests Jest
	npm test

lint: ## Linter + auto-fix (ESLint)
	npm run lint

# ── Prisma ────────────────────────────────────────────────────────────────────

migrate: ## Appliquer les migrations Prisma en prod (migrate deploy)
	npx prisma migrate deploy

seed: ## Executer le seed Prisma (ts-node prisma/seed.ts)
	npx ts-node prisma/seed.ts

# ── Docker ────────────────────────────────────────────────────────────────────

docker-up: ## Demarrer tous les services en arriere-plan
	docker compose up -d

docker-down: ## Arreter et supprimer les conteneurs (volumes preserves)
	docker compose down

docker-logs: ## Suivre les logs du conteneur api
	docker compose logs -f api

db-shell: ## Ouvrir un shell psql dans le conteneur db
	docker compose exec db psql -U kalamon kalamon

# ── pgvector ──────────────────────────────────────────────────────────────────

pgvector-init: ## Activer l'extension pgvector (a faire une seule fois)
	docker compose exec db psql -U kalamon kalamon \
		-c "CREATE EXTENSION IF NOT EXISTS vector;" \
		-c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"

# ── Aide ──────────────────────────────────────────────────────────────────────

help: ## Afficher toutes les commandes disponibles
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
