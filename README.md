# Via — Cycling Route Planner

Via is a route planner for long-distance cyclists (bikepacking, audax, ultra, multi-day touring).
The core differentiator: **cyclist-controlled routing profiles** — riders tune the routing algorithm
per trip via presets, rather than picking from a fixed menu.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), MapLibre GL JS |
| API | Fastify 5, TypeScript |
| Database | Postgres 16 + PostGIS |
| Queue / cache | Postgres (Phase 1–3) -> Redis only if measured pressure justifies it |
| Routing | GraphHopper (self-hosted) |
| Tooling | pnpm workspaces, Biome, TypeScript strict mode |

---

## Repo layout

```
project-via/
├── apps/
│   ├── web/          Next.js frontend
│   └── api/          Fastify API
├── packages/
│   └── shared/       Shared types (browser + Node compatible)
├── infra/
│   └── docker/       Docker Compose files (Task 02+)
```

---

## Getting started

Requires Node 22+, pnpm 10+, and Docker Desktop.

```bash
# Install all workspace dependencies
pnpm install

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## Make targets

Primary local workflow:

```bash
make up      # start local docker stack
make down    # stop local docker stack
make logs    # stream service logs
make reset   # wipe local volumes and rebuild
```

## Repo working rules

Follow the repo working rules in `CLAUDE.md`.

## Source of truth docs

- Product strategy and phase plan: `via-wiki/product/roadmap.md` (living, authoritative)
- Architecture and ADRs: `via-wiki/product/decisions/`
- Context index: `via-wiki/index.md`