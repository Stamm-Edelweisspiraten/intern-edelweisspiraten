FROM node:22 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# --omit=optional wird bewusst NICHT gesetzt: @node-rs/argon2 liefert seine
# vorkompilierten Binaries als optionale Abhaengigkeit aus.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build

# Migrationen werden zur Laufzeit gebraucht: der Startbefehl wendet
# ausstehende Migrationen an, bevor der Server hochkommt. Ohne diesen Schritt
# liefe die Anwendung gegen ein veraltetes Schema.
#
# migrate.ts kommt ohne tsx aus -- es hat keine relativen Projektimporte, und
# Node kann die Typangaben selbst entfernen.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.ts ./scripts/migrate.ts

# Nicht als root ausfuehren.
USER node

EXPOSE 3000

# Erst migrieren, dann starten. Schlaegt die Migration fehl, startet der
# Server gar nicht erst -- besser als ein Betrieb auf halbem Schema.
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.ts && node build"]
