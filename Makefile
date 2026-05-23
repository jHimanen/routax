COMPOSE_FILE := infra/docker/docker-compose.local.yml
COMPOSE_ENV_FILE := .env.local
INFRA_SERVICES := postgres minio mailhog

.PHONY: up up-build rebuild down logs reset dev osm-reimport download-osm smoke-test smoke test test-integration

up:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) up -d

up-build:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) build --pull --no-cache \
	  --build-arg SENTRY_RELEASE=$(shell git rev-parse --short HEAD)
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) up -d --renew-anon-volumes

# Rebuild a single service and restart it without touching other containers.
# Usage: make rebuild SVC=api   (or web, graphhopper, etc.)
rebuild:
	@test -n "$(SVC)" || (echo "Usage: make rebuild SVC=<service>" && exit 1)
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) up --build -d $(SVC)

down:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) down

logs:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) logs -f

reset:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) down -v

dev:
	@echo "→ Starting infra (postgres, minio, mailhog)…"
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) \
		up -d --wait $(INFRA_SERVICES)
	@echo "→ Running minio-bootstrap…"
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) \
		up -d minio-bootstrap
	@echo "→ Starting GraphHopper in background (takes several minutes to warm up)…"
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) \
		up -d graphhopper
	@echo "→ Wiring web env (one-time symlink)…"
	@test -e apps/web/.env.local || ln -sf ../../.env.local apps/web/.env.local
	@echo "→ Building shared package…"
	pnpm --filter @routax/shared build
	@echo "→ Starting api + web with hot-reload…"
	pnpm --parallel --filter @routax/api --filter @routax/web dev

osm-reimport:
	bash scripts/osm-reimport.sh $(ARGS)

download-osm:
	@echo "NOTE: 'make download-osm' is deprecated. Use 'make osm-reimport'."
	bash scripts/download-finland-osm.sh

smoke-test:
	bash scripts/smoke-test-route.sh

smoke:
	bash scripts/smoke.sh

# Run all checks. Requires the infra stack to be up (make up or make dev).
# GraphHopper integration tests are skipped unless GRAPHHOPPER_URL is set.
# To include them: make test-integration
test:
	@echo "→ Typecheck…"
	pnpm -w typecheck
	@echo "→ Lint…"
	pnpm -w lint
	@echo "→ Vitest (unit; GraphHopper integration skipped)…"
	pnpm -w test
	@echo "→ Smoke (GraphHopper via Caddy)…"
	bash scripts/smoke.sh
	@echo "→ Smoke-test (GraphHopper direct)…"
	bash scripts/smoke-test-route.sh
	@echo "✓ All checks passed."

# Like 'make test' but enables GraphHopper integration tests.
# Requires the full stack including GraphHopper (make up).
test-integration:
	@echo "→ Typecheck…"
	pnpm -w typecheck
	@echo "→ Lint…"
	pnpm -w lint
	@echo "→ Vitest (unit + GraphHopper integration)…"
	GRAPHHOPPER_URL=http://localhost:8989 pnpm -w test
	@echo "→ Smoke (GraphHopper via Caddy)…"
	bash scripts/smoke.sh
	@echo "→ Smoke-test (GraphHopper direct)…"
	bash scripts/smoke-test-route.sh
	@echo "✓ All checks passed (integration mode)."
