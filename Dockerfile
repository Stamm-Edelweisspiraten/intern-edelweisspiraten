# Multi-stage build for SvelteKit (adapter-auto -> Node)

# --- Build Stage ---
FROM node:20 AS builder
WORKDIR /app

COPY package*.json ./
COPY .npmrc ./
RUN npm ci

COPY . .
RUN npm run prepare && npm run build

# --- Run Stage ---
FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY .npmrc ./
COPY package*.json ./
RUN npm ci --omit=dev

# Copy SvelteKit output (adapter-auto -> node)
COPY --from=builder /app/.svelte-kit ./ ./.svelte-kit

EXPOSE 3000
CMD ["node", ".svelte-kit/output/server/index.js"]
