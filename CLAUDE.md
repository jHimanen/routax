# Routax — Project Root

Routax is a route planner for long-distance cyclists (bikepacking, audax, ultra, multi-day touring). The core differentiator: **cyclist-controlled routing profiles** — riders tune the routing profile themselves per trip via presets, rather than picking from a fixed menu.

The project capitalises on Komoot's March 2025 acquisition by Bending Spoons and subsequent community collapse (80%+ staff cut, trust broken, no consensus replacement).

---

## Repo layout

```
project-via/
├── CLAUDE.md              ← you are here
├── via-wiki/              ← Obsidian knowledge wiki (wiki operating manual: via-wiki/CLAUDE.md)
│
├── apps/
│   ├── web/               Next.js + MapLibre
│   └── api/               Fastify + TypeScript
├── packages/
│   └── shared/            Types, validation (shared between web and api)
└── infra/
    └── docker/            docker-compose files
```

The monorepo directories exist and are being filled in phase order per the living roadmap.

---

## Where knowledge lives

All cycling domain knowledge, product decisions, competitor research, architecture rationale, and the 7-phase build plan live in **`via-wiki/`**. Before touching code, check the wiki for context:

- `via-wiki/overview.md` — living thesis, positioning, target users
- `via-wiki/product/roadmap.md` — authoritative living 7-phase build plan (€0 → break-even)
- `via-wiki/raw/via-roadmap.md` — immutable original source artifact
- `via-wiki/product/decisions/` — ADR-style routing engine and frontend choices
- `via-wiki/concepts/engineering/` — adapter pattern, phased build, SaaS stack
- `via-wiki/index.md` — full content catalogue

For wiki operations (ingest, lint, refactor) follow `via-wiki/CLAUDE.md`. Never edit anything under `via-wiki/raw/`.

---

## Current phase

**Phase 1 — Local foundation (weeks 1–3, €0).**

Goal: a route planner running entirely on Docker on the laptop. Plan a cycling route in Finland with a tunable custom profile. No users, no accounts, no deployment.

### Phase 1 deliverables
- Monorepo structure: `apps/web`, `apps/api`, `packages/shared`, `infra/docker`
- `docker-compose.local.yml`: Postgres+PostGIS, GraphHopper (Finland extract), MinIO, MailHog, Caddy (Redis deliberately deferred — see `via-wiki/product/decisions/postgres-first-defer-redis.md`)
- Next.js + MapLibre GL frontend with local tile source (MapTiler dev key)
- Fastify API with `/route` endpoint proxying to GraphHopper
- One custom GraphHopper profile with three parameters: `avoid_traffic`, `prefer_quiet_surfaces`, `max_gradient`
- Adapter interfaces: `AuthProvider`, `PaymentProvider`, `EmailProvider`, `StorageProvider`, `AnalyticsProvider`, `RoutingProvider`, `QueueProvider`, `CacheProvider` — all backed by local implementations. Auth and payments are true stubs; the rest speak real protocols locally (SMTP → MailHog, S3 → MinIO, HTTP → GraphHopper; queue/cache on Postgres via `FOR UPDATE SKIP LOCKED` and keyed TTL; analytics to a Postgres `analytics_events` table that stays the system of record through Phase 5 — see `via-wiki/product/decisions/defer-posthog-for-postgres-analytics.md`)

### Phase 1 "done" signal
Open `localhost:3000`, click two points on a Finland map, see a cycling route, adjust sliders that meaningfully change the route.

---

## Core architecture decisions (already made)

| Concern | Choice | Why |
|---|---|---|
| Routing engine | GraphHopper | Custom models are tunable per-request without graph rebuilds; Apache 2.0 |
| Frontend maps | MapLibre GL JS | BSD-licensed Mapbox fork; no vendor lock-in |
| Tile serving (Phase 1–3) | MapTiler dev key | Free at dev volume |
| Tile serving (Phase 4+) | Planetiler → PMTiles → Cloudflare R2 | ~$3/mo global coverage; no tile server |
| Backend | Fastify + TypeScript | Low overhead; strong TypeScript support |
| Database | Postgres + PostGIS | Route geometry as PostGIS types |
| Auth (Phase 4+) | Clerk | Free to 10k MAU; no DIY auth |
| Payments (Phase 6+) | Stripe + Stripe Tax | EU VAT mandatory |
| Deploy (Phase 4+) | Coolify on Hetzner | Self-hosted Heroku-like UX |
| Mobile offline routing (Phase 7) | BRouter | More expressive DSL than GraphHopper for offline |

Full rationale in `via-wiki/product/decisions/`.

---

## Non-negotiable engineering rules

1. **Everything runs in Docker from day one.** Same `docker-compose.yml` works locally and on Hetzner. No dev/prod surprises.
2. **All external services go through a thin adapter layer.** Application code calls `emailService.send(…)`, not `postmark.send(…)`. Local = MailHog. Phase 5 = Postmark. One file changes.
3. **Features are built in dependency order, not excitement order.** Auth before payments. Route planning before device sync. Real users before mobile app.
4. **GitHub from day 1, PR-based workflow even solo.** Commit history is documentation.

---

# Repo working rules

## Critical rules
- Never commit or push directly to main
- Always create a branch and open a PR

## Product and engineering intent
- Optimize for correctness, clarity, and shipping speed.
- Prefer the simplest implementation that solves the actual problem.
- Avoid speculative abstractions.

## PR scope
- Keep PRs small and reviewable.
- Prefer fewer than 10 files changed when practical.
- Avoid mixing refactors with feature work.
- Do not modify unrelated files.

## Code changes
- Follow existing patterns unless there is a strong reason not to.
- Do not add new dependencies without explicit justification in the PR description.
- Preserve backwards compatibility unless the task explicitly allows breaking changes.
- For risky changes, leave a short note in the PR describing tradeoffs.

## Tests
- Add or update tests for behavior changes.
- Do not add excessive test scaffolding for trivial edits.
- If no test is added, explain why in the PR.

## Sensitive areas
- Do not change auth, billing, secrets, infrastructure, or deployment workflows unless explicitly asked.
- Do not rotate, print, or expose secrets.
- Treat migrations and data-deletion code as high-risk.

## Communication
- When opening a PR, include:
  - what changed
  - why
  - risks
  - how it was tested

---

## Tech stack quick reference

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), MapLibre GL JS, TypeScript |
| API | Fastify, TypeScript |
| Database | Postgres 16 + PostGIS |
| Queue / cache | Postgres (Phase 1–3) → Redis only if measured pressure justifies it |
| Routing | GraphHopper (self-hosted, Java) |
| Object storage | MinIO (local) → S3/Cloudflare R2 (prod) |
| Email | MailHog (local) → Postmark (Phase 5) |
| Auth | stub (Phase 1–3) → Clerk (Phase 4) |
| Payments | stub → Stripe + Stripe Tax (Phase 6) |
| Analytics | Postgres `analytics_events` system-of-record (Phase 1+) → PostHog Cloud EU adapter (Phase 6) |
| Deployment | docker compose (local) → Coolify on Hetzner (Phase 4) |

---

## What Claude does NOT do here

- Does not edit anything under `via-wiki/raw/` — those are immutable source documents.
- Does not invent citations or make claims not grounded in wiki sources.
- Does not skip phases or add features ahead of their phase gate — the ordering is intentional.
- Does not write the mobile app until web paid conversion is proven (Phase 7 gate).
- Does not roll custom auth — Clerk in Phase 4, stub before that.
