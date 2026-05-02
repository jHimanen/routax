# @routax/api

Fastify API for Routax.

## Database migrations

Migrations use [node-pg-migrate](https://salsita.github.io/node-pg-migrate/). Migration files live in `apps/api/migrations/` and are plain CommonJS (`.cjs`) files.

### Creating a migration

```sh
pnpm --filter @routax/api db:migrate:create -- "my_migration_name"
```

This scaffolds `apps/api/migrations/<timestamp>_my_migration_name.cjs` with empty `up` and `down` stubs.

### Applying migrations

```sh
pnpm --filter @routax/api db:migrate
```

Calling on an up-to-date database is a no-op. Requires `DATABASE_URL` to be set (e.g. in `.env.local`):

```
DATABASE_URL=postgresql://routax:routax_dev_password@localhost:5432/routax
```

### Rolling back one migration

```sh
pnpm --filter @routax/api db:migrate:down
```

### Checking status

```sh
pnpm --filter @routax/api db:migrate:status
```

---

## Dev seed data

Populates 8 feature flags, 58 analytics events, and 5 Finnish sample routes for local development.

```sh
pnpm --filter @routax/api db:seed
```

Safe to run multiple times (idempotent). The script auto-detects whether GraphHopper is running:
- **GraphHopper up** — routes are planned live via the routing engine
- **GraphHopper down** — routes use committed placeholder geometry from `scripts/seed-fixtures/routes.json`

### Reset and reseed (60-second budget)

```sh
pnpm --filter @routax/api db:seed -- --reset
```

Rolls all migrations down to zero, re-applies them, then seeds. Use this after a migration conflict or to start completely fresh.

### Regenerate route fixtures

```sh
pnpm --filter @routax/api db:seed -- --write-fixtures
```

Requires a live GraphHopper stack (`make up`). Overwrites `scripts/seed-fixtures/routes.json` with real routed geometry.

---

## Migration conventions

### File format

Use `.cjs` (CommonJS JS) with `up` and `down` exports:

```js
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE ...`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE ...`);
};
```

### JS vs SQL

- **JS migration** (`.cjs`): use for mixed DDL + DML, or when you need `down` to do something non-trivial. This is the default.
- **Paired SQL** (not currently used): node-pg-migrate also supports `*_up.sql` / `*_down.sql` pairs for pure DDL — either works.

### Always write a real `down`

Every migration must have a real `down`. One exception: data-only migrations where reverting is not meaningful (e.g., a one-time backfill). In that case, leave a no-op `down` with a comment explaining why:

```js
exports.down = (_pgm) => {
  // no-op: this backfill cannot be reversed without restoring from backup
};
```

### Rollback policy

`down` migrations are a **developer convenience** for local iteration. Production rollbacks require restoring from a database backup snapshot — running `down` on production is not supported and may cause data loss.

---

## One-shot ledger migration (existing local databases)

If you have a local database that was set up with the old hand-rolled runner (before this tooling was introduced), run the following SQL once after pulling this change to register the already-applied migrations in `pgmigrations`:

```sql
INSERT INTO pgmigrations (name, run_on)
VALUES
  ('1740000000001_queue_cache_analytics', now()),
  ('1740000000002_feature_flags',         now()),
  ('1740000000003_routes',                now())
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS migrations.applied;
```

After this, `pnpm --filter @routax/api db:migrate` should report no pending migrations.
