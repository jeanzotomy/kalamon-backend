# Changelog

All notable changes to Kalamon Backend are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com).

## [0.1.0] — 2026-06-21

### Added
- Initial NestJS 10 + Fastify backend skeleton
- JWT httpOnly cookie authentication (register, login, logout)
- Multi-tenant architecture (organizationId isolation)
- RAG pipeline anchored to official curriculum (pgvector semantic cache)
- Adaptive complexity tiers: SIMPLE / COLLEGE / LYCEE / TECHNIQUE
- Bayesian Knowledge Tracing (BKT) — 4-parameter model per skill
- 3-layer student memory: L1 raw traces · L2 surface summaries · L3 cross-session profile
- Progressive hints (3 levels: vague → guided → partial solution)
- Knowledge Graph prerequisites (LOOM BFS pattern)
- PDF curriculum ingestion (adaptive chunking 80–450 words)
- Voice WebSocket gateway stub (ready for Pipecat v1.0)
- Mobile money payments: CinetPay (GNF · XOF · XAF)
- Freemium / premium monthly subscription
- Gamification: badges, points, quiz attempts
- Cloudflare R2 media storage (S3-compatible)
- AI Act compliance: full audit trail (ai_interactions table)
- Daily AI budget per student (anti-cost-drift)
- Docker multi-stage build (node:24-alpine, same image dev/prod)
- Automatic Prisma migrations on startup (startup.sh)
- 38 unit tests (BKT formula, memory L1–L3, RAG pipeline flows)
- Swagger docs at /docs
- Health endpoint at /health
