Update the wiki to reflect progress made in the current Claude Code session.

## Step 1 — Reconstruct what happened this session

Review the conversation context for work done: tasks completed, decisions made, files changed, design choices, tradeoffs noted, and any surprises or deviations from the plan. Also run:

```
git log --oneline -20
git diff main...HEAD --stat
```

to confirm what landed. Use the union of both signals — conversation + commits — as your ground truth.

## Step 2 — Identify which wiki pages are affected

For each unit of work, determine the most specific wiki page it belongs to:

- **Task files** (`routax-wiki/product/tasks/phaseN/NN-<slug>.md`) — for concrete implementation work on a planned task. This is the most common target.
- **Phase index files** (`routax-wiki/product/tasks/phaseN.md`) — only if a task's overall status changed (e.g., newly completed) or the phase-level picture shifted.
- **Roadmap** (`routax-wiki/product/roadmap.md`) — only if a phase gate was crossed or the plan materially changed.
- **Decision pages** (`routax-wiki/product/decisions/`) — if a significant architectural or product decision was made or reversed.
- **Concept / entity pages** — if a meaningful discovery was made about a concept, tool, or entity (e.g., a GraphHopper quirk, an OSM tagging edge case).

Read each candidate page before editing.

## Step 3 — Write as-built notes into task files

For each affected task file, add or update an **## As built** section at the bottom (before any existing "## Related" or "## Sources" sections, or at the very end if neither exists). Use this structure:

```markdown
## As built

_Updated: YYYY-MM-DD_

### What was done
- <bullet per concrete deliverable completed>

### Deviations from plan
- <anything that diverged from the Scope section — omit if none>

### Surprises / lessons
- <non-obvious findings: quirks, edge cases, wrong assumptions — the things a future engineer needs to know that aren't obvious from the code>

### Still open
- <scope items from this task that remain incomplete — omit if none>
```

Rules for as-built content:
- Write what would have saved the next engineer an hour. Skip what's obvious from the code or PR description.
- Attribute specific file paths and line numbers where helpful (e.g. `apps/api/src/adapters/GraphhopperRoutingProvider.ts:42`).
- If something important was decided mid-task, note the decision and its reason — especially if it differs from the task plan.
- Do not duplicate the PR description verbatim. Extract the _non-obvious_ parts.

Bump the frontmatter `updated` date and, if the task is now fully done, set `status: stable`.

## Step 4 — Review acceptance criteria

Review the acceptance criteria for the tasks involved and check all boxes that are now complete. If some acceptance criteria are not met, add a note to the task file.

## Step 5 — Update phase index and roadmap if needed

- If a task moved from in-progress to complete, mark it done in the phase index table (`routax-wiki/product/tasks/phaseN.md`).
- Only touch `routax-wiki/product/roadmap.md` if a phase gate was crossed or something changed that the roadmap is wrong about.

## Step 6 — Append to log.md

Append one entry per significant unit of work (a completed task, a notable decision, a surprise discovery). Format:

```
## [YYYY-MM-DD] progress | <Phase N · Task NN — short title>
What landed: <1–2 line summary of what was completed>.
As-built notes added to [[product/tasks/phaseN/NN-slug]].
```

Use op `progress` for implementation work. Use `decision` if the primary output was an architectural or product decision with no code shipped.

## Step 7 — Report back

Print a short summary of every wiki page touched and what changed. One bullet per page.

---

**Guard rails:**
- Never edit anything under `routax-wiki/raw/`.
- Do not invent claims not grounded in the session's actual work.
- Do not update the roadmap for speculative future work — only for things that actually happened.
- If the session's work doesn't map cleanly to any existing task page, note this and ask the user before creating a new page.
