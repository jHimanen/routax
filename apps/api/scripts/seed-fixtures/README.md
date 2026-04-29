# seed-fixtures/routes.json

Frozen GraphHopper route results for the five Finnish sample routes.
Committed so `pnpm --filter @routax/api db:seed` works offline (no live GraphHopper required).

The seed script auto-detects whether GraphHopper is reachable. If it is, routes are
planned live and this file is not used. If GraphHopper is unavailable, the frozen
fixture is used instead and a notice is logged.

The committed file contains placeholder straight-line geometry. It displays routes on
the map but does not follow roads. Regenerate once GraphHopper is running to get
realistic routing.

## Regenerating fixtures

Run this command with a live GraphHopper stack (`make up`):

```sh
pnpm --filter @routax/api db:seed -- --write-fixtures
```

Commit the updated `routes.json` after verifying the output looks reasonable.
