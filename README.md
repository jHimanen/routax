# Via — Cycling Route Planner

Via is a route planner for long-distance cyclists (bikepacking, audax, ultra, multi-day touring).
The core differentiator: **cyclist-controlled routing profiles** — riders tune the routing algorithm
per trip via presets, rather than picking from a fixed menu.

---

## Stack

| Layer    | Technology                                       |
|----------|--------------------------------------------------|
| Frontend | Next.js 15 (App Router), MapLibre GL JS          |
| API      | Fastify 5, TypeScript                            |
| Database | Postgres 16 + PostGIS                            |
| Cache    | Redis                                            |
| Routing  | GraphHopper (self-hosted)                        |
| Tooling  | pnpm workspaces, Biome, TypeScript strict mode   |

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

Requires Node 22+ and pnpm 10+. Docker Compose setup is coming in Task 02.

```bash
# Install all workspace dependencies
pnpm install

# Typecheck all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

## Make targets

These are stubs — implemented in later tasks.

```bash
make dev    # start all services locally
make up     # docker compose up
make down   # docker compose down
```

## Repo working rules

Follow the repo working rules in `CLAUDE.md`.