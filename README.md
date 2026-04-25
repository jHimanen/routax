# Routax — Cycling Route Planner

Routax is a route planner for long-distance cyclists (bikepacking, audax, ultra, multi-day touring).
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
make up          # start local docker stack
make down        # stop local docker stack
make logs        # stream service logs
make reset       # wipe local volumes and rebuild
make smoke       # end-to-end smoke test through Caddy HTTPS
make smoke-test  # direct GraphHopper routing test (bypasses Caddy)
```

## Local HTTPS entry point

All traffic goes through Caddy at **https://routax.cc** (canonical) or **https://localhost** (CI / no-hosts fallback), both on port 443.

| URL | Routed to |
|---|---|
| `https://routax.cc` | Next.js frontend (canonical) |
| `https://routax.cc/api/*` | Fastify API (canonical) |
| `https://localhost` | Next.js frontend |
| `https://localhost/api/*` | Fastify API |

### Local hostname setup

Add `routax.cc` to your machine's `/etc/hosts` so it resolves to the local stack:

```bash
echo "127.0.0.1 routax.cc" | sudo tee -a /etc/hosts
```

`make smoke` uses `localhost` directly and needs no `/etc/hosts` entry — it continues to pass on any machine.

### Trust the Caddy CA

Caddy uses its built-in internal CA to issue a self-signed certificate.
Your browser will show a security warning on first visit — click
**Advanced → Proceed** (Chrome/Edge) or **Accept the Risk and Continue** (Firefox).

To silence the warning permanently on macOS, trust Caddy's root cert:

```bash
docker compose -f infra/docker/docker-compose.local.yml exec caddy \
  cat /data/caddy/pki/authorities/local/root.crt \
  | sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain /dev/stdin
```

Restart your browser after running this. If you run `make reset` (which wipes
`caddy-data`), Caddy generates a new CA — re-run the command above.

> **No public DNS.** `routax.cc` is parked at the registrar with no A records. `dig routax.cc` returns NXDOMAIN. Production DNS is a Phase 4 task.

## Repo working rules

Follow the repo working rules in `CLAUDE.md`.

## Source of truth docs

- Product strategy and phase plan: `via-wiki/product/roadmap.md` (living, authoritative)
- Architecture and ADRs: `via-wiki/product/decisions/`
- Context index: `via-wiki/index.md`