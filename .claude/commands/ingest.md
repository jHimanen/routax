Run a batch ingest of new source files in `routax-wiki/raw/`.

1. List all files currently in `routax-wiki/raw/`. Cross-reference against `routax-wiki/index.md` and the existing `routax-wiki/sources/` pages to identify which raw files have **not yet been ingested** (i.e., have no corresponding `sources/<slug>.md`).

2. If there are no new files, report that and stop.

3. For each un-ingested source, follow the batch ingest procedure in `routax-wiki/CLAUDE.md` section 5.1:
   - Read the source end-to-end.
   - Write a source summary page at `routax-wiki/sources/<slug>.md`.
   - Propose a touched-pages diff report (entities/concepts/product pages to create or update).
   - Apply updates: create or update wiki pages, add cross-references, flag contradictions.
   - Update `routax-wiki/index.md`.
   - Append an entry to `routax-wiki/log.md`.

4. After all sources are processed, print a summary of everything touched.
