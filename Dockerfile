FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# --omit=optional wird bewusst NICHT gesetzt: @node-rs/argon2 liefert seine
# vorkompilierten Binaries als optionale Abhaengigkeit aus.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build

# Nicht als root ausfuehren.
USER node

EXPOSE 3000
CMD ["node", "build"]
