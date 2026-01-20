# Horalix Backend Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY turbo.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages/ ./packages/

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
WORKDIR /app/apps/backend
RUN npx prisma generate

# Build the backend
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Create app user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 horalix

# Copy necessary files
COPY --from=builder --chown=horalix:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=horalix:nodejs /app/apps/backend/node_modules ./node_modules
COPY --from=builder --chown=horalix:nodejs /app/apps/backend/prisma ./prisma
COPY --from=builder --chown=horalix:nodejs /app/apps/backend/package*.json ./

# Create uploads directory
RUN mkdir -p ./uploads && chown horalix:nodejs ./uploads

USER horalix

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]
