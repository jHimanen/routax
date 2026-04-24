Report the current build phase status and surface the most actionable next steps.

1. Read `via-wiki/product/roadmap.md` to recall the current 7-phase plan (authoritative living roadmap). Use `via-wiki/raw/via-roadmap.md` only as historical source context.
2. Inspect the repo root to determine what exists: look for `apps/`, `packages/`, `infra/`, any `docker-compose*.yml`, `package.json` files, etc.
3. Read `via-wiki/log.md` (last 20 entries) to see recent activity.

Then produce a concise report:

**Current phase:** [1–7] — [phase name]

**What's done** (bullet list of deliverables already present in the repo or confirmed in the log)

**What's missing** (bullet list of Phase N deliverables not yet built, in dependency order)

**Blocking decisions** (any open questions from the wiki that must be resolved before proceeding — check `via-wiki/product/decisions/` and pages with `status: contested`)

**Phase gate** (the "done looks like" signal from the roadmap for the current phase — are we there yet?)

Keep the report tight. No padding. If Phase 1 hasn't started at all, say so clearly and list the first three concrete actions to take.
