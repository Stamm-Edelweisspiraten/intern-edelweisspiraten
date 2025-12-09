# Multi-stage build for SvelteKit (adapter-auto -> Node)

# --- Build Stage ---
FROM node:20 AS builder
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# --- Run Stage ---
FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY .npmrc ./
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build

EXPOSE 3000
CMD ["node", "build"]
