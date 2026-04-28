Run a lint pass on the routax-wiki and produce a prioritized punch list.

Follow the lint procedure in `routax-wiki/CLAUDE.md` section 5.4. Scan for:

- **Contradictions** — all pages with `status: contested`.
- **Stale claims** — older sources superseded by newer ones cited on the same page.
- **Orphans** — pages with no inbound wikilinks (check index + grep for `[[page-stem]]`).
- **Missing hubs** — concepts mentioned across three or more pages but with no dedicated page.
- **Missing cross-refs** — pages that should link to each other but don't.
- **Data gaps** — topics where a targeted search or new source would meaningfully fill a hole.

Output a **prioritized punch list** grouped by severity (P0 = contradictions/contested, P1 = orphans/missing hubs, P2 = missing cross-refs, P3 = data gaps). Do not auto-fix — this pass is for the user to steer next moves.

Append one entry to `routax-wiki/log.md`:
```
## [YYYY-MM-DD] lint | <1-line summary of findings>
```
