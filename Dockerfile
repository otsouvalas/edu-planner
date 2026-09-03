# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build: full (dev) install, generate the Prisma client, build the
# client (Vite -> client/dist) and the server (tsc -> server/dist).
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

RUN apk add --no-cache openssl
WORKDIR /app

# Lockfile-only install layer, so dependency installs are cached across
# source-only changes.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .

# `prisma generate` validates the datasource, so DATABASE_URL must be set even
# though nothing connects at build time.
ENV DATABASE_URL="file:/app/data/prod.db"
RUN npx prisma generate --schema server/prisma/schema.prisma
RUN npm run build -w client && npm run build -w server

# ---------------------------------------------------------------------------
# Stage 2 — runtime: production deps only, compiled output only. No TypeScript
# sources, no dev dependencies, no database file.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL="file:/app/data/prod.db"

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Schema + migrations are needed at runtime for `prisma migrate deploy`.
COPY server/prisma server/prisma
RUN npx prisma generate --schema server/prisma/schema.prisma

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# The SQLite database lives here and is expected to be a mounted volume.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
