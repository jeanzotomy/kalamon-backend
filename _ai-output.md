## AI Engineer — Handoff (dernière tâche : P0-A BKT + Complexité adaptative, 2026-06-21)

### Pipeline RAG modifié (P0-A)
- BKT (Bayesian Knowledge Tracing) intégré dans le pipeline `chat()` de `RagService`
- Complexité adaptative 4 niveaux (SIMPLE/COLLEGE/LYCEE/TECHNIQUE) détectée depuis `eleve.niveau`
- `BktService.update()` appelé après CACHE et RAG_LIVE si `input.skillCode` fourni
- `ChatResult` enrichi : champs `complexite` et `bktUpdate` ajoutés
- `AiProviderService.generateGrounded()` : paramètre optionnel `complexiteHint` ajouté (rétrocompatible)

### Fichiers créés (P0-A)
- `src/bkt/bkt.service.ts`
- `src/bkt/bkt.module.ts`

### Fichiers modifiés (P0-A)
- `src/kalamon/rag.service.ts`
- `src/kalamon/kalamon.module.ts`
- `src/kalamon/ai-provider.service.ts`

### Commande obligatoire si build échoue
```bash
npx prisma generate && npx tsc --noEmit
```

---

### Tâche P0-B : Mémoire élève 3 couches (DeepTutor L1/L2/L3)

- Pipeline mémoire créé : MemoryService avec appendTrace (L1) → refreshSurface fire-and-forget (L2) → refreshProfile fire-and-forget (L3)
- Injection de contexte mémoire dans RAG via getContextForRag (budget 50 tokens profil L3)
- Lecture dashboard via getProfile (profil + surfaces + 20 dernières traces)

### Modèles LLM utilisés

- AiProviderService.generateGrounded (abstraction existante) — modèle configuré via env LLM_MODEL (défaut : claude-haiku-4-5)
- 0 nouvel appel LLM direct — tout passe par AiProviderService

### Variables env ajoutées

Aucune. Le service réutilise LLM_PROVIDER, LLM_MODEL et ANTHROPIC_API_KEY déjà déclarés dans src/config/env.ts.

### Index pgvector créés/modifiés

Aucun. Les modèles L1/L2/L3 utilisent des index PostgreSQL classiques (@@index dans le schéma Prisma, déjà définis).

### Coût tokens estimé

| Opération | Input estimé | Output estimé | Coût haiku ($/1k requêtes) |
|---|---|---|---|
| refreshSurface (L2) | ~400 tokens | ~120 tokens | ~$0.0006 |
| refreshProfile (L3, 2 appels) | ~1 100 tokens | ~400 tokens | ~$0.0023 |
| getContextForRag | 0 (lecture DB) | 0 | $0 |
| appendTrace | 0 (écriture DB) | 0 | $0 |

refreshProfile se déclenche 1x toutes les 10 traces. Pour un élève actif (100 questions/mois) : ~10 refreshProfile × $0.0023 = $0.023/mois/élève.

### Fichiers créés

- `src/memory/memory.service.ts` — MemoryService (L1/L2/L3)
- `src/memory/memory.module.ts` — MemoryModule

### Fichiers modifiés

- `src/kalamon/kalamon.module.ts` — ajout `exports: [AiProviderService]`
- `src/app.module.ts` — import MemoryModule

### Action requise avant déploiement

Le client Prisma doit être regénéré en prod (migration déjà faite si schema P0-B inclus) :

```bash
npx prisma migrate deploy   # si migration pas encore appliquée
npx prisma generate         # toujours après schema change
```

### Métriques cibles

- Latence appendTrace : < 5ms (écriture DB seule, L2/L3 en background)
- Latence getContextForRag : < 15ms (2 SELECT parallèles)
- refreshSurface : < 3s (1 appel LLM haiku)
- refreshProfile : < 5s (4 appels LLM parallèles haiku)
