# ============================================================
# KALAMON BACKEND — Dockerfile multi-stage
# Le MÊME conteneur tourne en dev (Replit), test et prod (Azure ACA).
# → la "migration Azure" = pointer ACA sur cette image. Pas de réécriture.
# ============================================================

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app
# openssl requis par Prisma sur Alpine
RUN apk add --no-cache openssl
COPY package*.json ./
# npm ci SANS --ignore-scripts (Prisma a besoin de son postinstall)
RUN npm ci
COPY prisma ./prisma
# génération du client Prisma (chemin direct = robuste sur Alpine)
RUN node node_modules/prisma/build/index.js generate
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY startup.sh ./startup.sh
RUN chmod +x ./startup.sh
EXPOSE 3000
# startup.sh applique les migrations PUIS démarre l'app
CMD ["./startup.sh"]
