Plan the implementation of the next unbuilt task in dependency order.

## Step 1 — Enter plan mode

Enter plan mode now (EnterPlanMode). All subsequent work happens inside that plan.

## Step 2 — Determine the next task

1. Read the current phase index file at `routax-wiki/product/tasks/phaseN.md` (start with the highest active phase — check phase-3 first, then phase-2, then phase-1). Look at the task table and identify which tasks have `status: stable` (done) and which are `status: draft` (not yet built).

2. Cross-reference with the task files in `routax-wiki/product/tasks/phaseN/`. A task is truly done only if its file has `status: stable` AND an **## As built** section. A task that is `stable` but lacks as-built notes is done from a code standpoint but incompletely documented — treat it as done.

3. The "next task" is the first `draft` task whose dependencies are all `stable`. Dependencies are listed in the task file's **Inputs / prerequisites** section.

4. Print a one-line status summary:
   ```
   Last completed: Phase N · Task NN — <title>
   Next task:      Phase N · Task NN — <title>
   Blocked by:     none  ← or list any unfinished prerequisites
   ```
   If everything in the current phase is done, report that and identify the next phase's first task.

## Step 3 — Read the task file end to end

Read the full task file: `routax-wiki/product/tasks/phaseN/NN-<slug>.md`. Also read any wiki pages linked in its **Wiki references** section that are directly relevant to the implementation approach.

Then read the existing code in the areas the task will touch:
- Follow the file paths mentioned in the task's **Scope** section.
- For schema changes, read the existing migration files and the relevant `packages/shared/src/types/` files.
- For API changes, read the relevant adapter and repository files.
- For frontend changes, read the relevant component and page files.
- Do NOT read files that are clearly out of scope for this task.

## Step 4 — Build the implementation plan

Produce a complete, commit-by-commit plan. Structure it as follows:

---

### Task: Phase N · Task NN — <title>

**Branch name:** `phase-N/NN-<kebab-slug>`

**Summary:** 2–3 sentences on what this task ships and why it matters, in plain language.

**Prerequisites confirmed:** list each dependency task and confirm its status.

---

#### Commits

For each commit, write:

```
#### Commit N: <imperative title, ≤72 chars>

Files touched:
- `path/to/file.ts` — what changes and why

What this commit accomplishes:
<1–3 sentences. What is in a working state after this commit lands.>

Risks / notes:
<Only if non-obvious: migration safety, backwards compatibility, a tricky invariant.
Omit this section if there is nothing worth noting.>
```

Commit split rules:
- One concern per commit. Schema change and application code that uses it belong together if they're always deployed atomically; split them only if the application code is large enough to warrant it.
- Infrastructure commits (config changes, dependency additions, new migration files) come before the application code that depends on them.
- Tests go in the same commit as the code they test, unless the test setup is substantial enough to merit its own commit.
- Never split a change in a way that would leave the build broken mid-stack.
- Aim for 3–6 commits for a typical Phase 3 task. Fewer for small tasks; more only if the task genuinely spans independent concerns.

---

#### Final step — ship it (always last, non-negotiable)

After all implementation commits are done:

1. Run the full quality gate:
   ```
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
   Fix every error and warning before continuing. Re-run until all three pass clean.

2. Commit any lint/type fixes as a final tidy commit if they didn't fit in an earlier commit:
   ```
   fix: typecheck and lint clean-up for <task slug>
   ```

3. Push the branch:
   ```
   git push -u origin <branch-name>
   ```

4. Open a PR using the project template (`.github/PULL_REQUEST_TEMPLATE.md`). Fill in every section:
   - **What changed** — what the PR delivers (one paragraph).
   - **Why** — link to the wiki task page and state the Phase N goal it serves.
   - **Risks** — migration safety, backwards compatibility, anything non-obvious. If genuinely none, say so explicitly.
   - **How it was tested** — list every test added or updated, plus any manual smoke steps.
   - **Checklist** — mark each item; never leave unchecked boxes.

   PR title format: `feat(phase-N): <short imperative description>`

---

## Step 5 — Surface open questions before building

Before exiting plan mode, list any questions or ambiguities that would change the plan if answered differently. Phrase each as a concrete decision with two plausible options and a recommendation. Example:

> **Q: Should the migration default the new column to `[]` or `null`?**
> Option A: `DEFAULT '[]'::jsonb` — existing rows are valid immediately, no backfill needed.
> Option B: `DEFAULT NULL` — explicit null signals "pre-feature data"; requires nullable type in shared schema.
> **Recommendation:** Option A — the task spec says "existing rows remain valid"; null would leak into the type system everywhere.

If there are no open questions, say so and indicate the plan is ready to execute.

---

**Guard rails:**
- Do not propose work outside the scope defined in the task file.
- Do not design for tasks further down the queue (no speculative abstractions).
- Do not plan commits that would leave tests red.
- Never plan a force-push to main or a commit that bypasses the quality gate.
