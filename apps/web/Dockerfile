FROM node:22-alpine
RUN corepack enable pnpm

WORKDIR /app

# Install dependencies first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

WORKDIR /app/apps/web

CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
