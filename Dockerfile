# =============================================================================
# NOVA AI — Production Multi-Stage Dockerfile
# Optimized for minimal image size, zero secrets in layers, and non-root runtime
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend Assets
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies required for Vite build)
RUN npm ci

# Copy source code and build config
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY server/ ./server/

# Build static assets for production into /app/dist
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime Environment
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server application code
COPY server/ ./server/

# Copy built frontend assets from builder stage into /app/dist
COPY --from=builder /app/dist ./dist

# Create local storage directories with non-root permissions
RUN mkdir -p storage/documents storage/media && \
    chown -R node:node /app

# Run as unprivileged node user
USER node

# Expose default application port
EXPOSE 5000

# Safe healthcheck against unauthenticated health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 5000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start NOVA AI production server
CMD ["node", "server/server.js"]
