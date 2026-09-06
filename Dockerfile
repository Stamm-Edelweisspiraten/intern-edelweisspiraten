FROM node:22 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production

# Obergrenze des Anfragekoerpers.
#
# adapter-node begrenzt ohne diese Variable auf 512K. Die Oberflaeche
# verspricht dagegen 10 MB je Datei (MAX_FILE_BYTES in fileStore.ts), und
# jeder groessere Upload scheiterte in Produktion mit 413, bevor
# Anwendungscode ueberhaupt lief. 12M laesst Raum fuer den Mehraufwand der
# multipart-Kodierung und die uebrigen Formularfelder.
ENV BODY_SIZE_LIMIT=12M

# Oeffentliche Adresse der Anwendung.
#
# adapter-node prueft bei jedem Formular-POST, ob die Origin-Kopfzeile
# zur Adresse passt (CSRF). Ohne ORIGIN raet es aus den Kopfzeilen der
# Anfrage -- hinter einem Reverse Proxy mit HTTPS liegt es damit falsch
# und weist JEDEN POST mit 403 ab, die Anmeldung eingeschlossen.
#
# Muss mit PUBLIC_APP_URL uebereinstimmen und beim Betrieb gesetzt
# werden; der Wert hier ist nur die Vorgabe fuer einen lokalen Lauf.
ENV ORIGIN=http://localhost:3000

COPY package*.json ./
# --omit=optional wird bewusst NICHT gesetzt: @node-rs/argon2 liefert seine
# vorkompilierten Binaries als optionale Abhaengigkeit aus.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build

# Migrationen werden zur Laufzeit gebraucht: der Startbefehl wendet
# ausstehende Migrationen an, bevor der Server hochkommt. Ohne diesen Schritt
# liefe die Anwendung gegen ein veraltetes Schema.
#
# migrate.ts laeuft unter `node --experimental-strip-types`, also ohne tsx --
# Node entfernt die Typangaben selbst. Es hat aber SEHR WOHL einen relativen
# Projektimport: die Aufloesung der Verbindung liegt in
# src/lib/server/db/url.ts, damit Anwendung und Migration dieselbe Reihenfolge
# benutzen (DATABASE_URL, dann DB_*, dann die Datei aus /setup).
#
# Diese Datei MUSS deshalb mit ins Image. Ohne sie bricht `migrate.ts` mit
# ERR_MODULE_NOT_FOUND ab -- und weil der Startbefehl mit && verkettet ist,
# startet der Server dann gar nicht erst. Der Fehler faellt ausschliesslich im
# Container auf, nie bei `npm run db:migrate`.
#
# url.ts importiert nur `node:fs` und `node:path`; eine einzelne Datei genuegt.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=builder /app/src/lib/server/db/url.ts ./src/lib/server/db/url.ts

# Nicht als root ausfuehren.
USER node

EXPOSE 3000

# Erst migrieren, dann starten. Schlaegt die Migration fehl, startet der
# Server gar nicht erst -- besser als ein Betrieb auf halbem Schema.
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.ts && node build"]
