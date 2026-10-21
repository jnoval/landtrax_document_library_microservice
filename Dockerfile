# Multi-stage build for NestJS Document Library Microservice

# Stage 1: Build
FROM node:24.11.1-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules and tooling
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copy source code and config
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production Runtime
FROM node:24.11.1-alpine AS production

# Install runtime dependencies for document conversion (LibreOffice) and fonts
RUN apk add --no-cache \
    libreoffice \
    poppler-utils \
    fontconfig \
    ttf-dejavu \
    font-liberation

# Security: create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 && \
    mkdir -p /app && \
    chown -R backend:nodejs /app

WORKDIR /app
USER backend

# Copy package files
COPY --chown=backend:nodejs package*.json ./

# Copy installed node_modules from builder
COPY --from=builder --chown=backend:nodejs /app/node_modules ./node_modules

# Copy compiled application code from builder
COPY --from=builder --chown=backend:nodejs /app/dist ./dist

# Create logs and temp directories for runtime file handling and diagnostics
USER root
RUN mkdir -p /app/logs /app/tmp && \
    chown -R backend:nodejs /app/logs /app/tmp && \
    chmod 755 /app/logs /app/tmp
USER backend

# Ensure LibreOffice user profile can be written by non-root user
ENV HOME=/tmp

WORKDIR /app

# Expose HTTP API (5022) and TCP RPC (5023)
EXPOSE 5022 5023

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5022/health || exit 1

# Run production build
CMD ["npm", "run", "start:prod"]
