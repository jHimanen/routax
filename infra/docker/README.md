# infra/docker

Local data-plane services for Routax development.

## Services

| Service | URL | Notes |
|---|---|---|
| Routax (canonical) | `https://routax.cc` | requires `/etc/hosts` entry |
| Routax (fallback) | `https://localhost` | no `/etc/hosts` needed |
| Postgres 16 + PostGIS | `localhost:5432` | psql / TablePlus |
| MinIO API | `http://localhost:9000` | S3-compatible endpoint |
| MinIO Console | `http://localhost:9001` | Browser UI |
| MailHog SMTP | `localhost:1025` | SMTP sink |
| MailHog UI | `http://localhost:8025` | Browser UI |

## Dev credentials (local only)

Copy `.env.example` to `.env.local` at the repo root. Defaults:

| Var | Default |
|---|---|
| `POSTGRES_USER` | `routax` |
| `POSTGRES_PASSWORD` | `routax_dev_password` |
| `POSTGRES_DB` | `routax` |
| `MINIO_ROOT_USER` | `routax_minio` |
| `MINIO_ROOT_PASSWORD` | `routax_minio_secret` |

## Commands

```sh
make up      # start all services (detached)
make down    # stop services, keep volumes
make logs    # stream logs from all services
make reset   # stop services and DELETE all volumes (fresh start)
```

## State

- Postgres and MinIO data persists across `make down` / `make up` cycles.
- `make reset` wipes all named volumes — use when you need a clean slate.
- MailHog has no persistent volume; mail is ephemeral.
- The `minio-bootstrap` container runs once on first `make up` to create the `routax-local` bucket, then exits.
