# ==========================================
# Multi-stage Dockerfile for Keeper Bot
# ==========================================

# 1. Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package.json ./

# Install all dependencies (including devDependencies for TypeScript)
RUN npm install

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# 2. Production Runner Stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist
# Copy ABIs needed at runtime
COPY src/abis ./dist/abis

# Run as non-root user for security
USER node

# Health check (checks process is alive)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD pgrep node || exit 1

# Start the keeper bot
CMD ["node", "dist/index.js"]

