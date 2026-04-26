FROM node:22-alpine
RUN corepack enable pnpm

WORKDIR /app

# Install dependencies first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

ARG SENTRY_RELEASE=dev
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

WORKDIR /app/apps/api

CMD ["pnpm", "dev"]
