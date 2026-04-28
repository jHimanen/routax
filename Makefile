COMPOSE_FILE := infra/docker/docker-compose.local.yml
COMPOSE_ENV_FILE := .env.local
INFRA_SERVICES := postgres minio mailhog

.PHONY: up up-build down logs reset dev download-osm smoke-test smoke

up:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) up -d

up-build:
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) build --pull --no-cache \
	  --build-arg SENTRY_RELEASE=$(shell git rev-parse --short HEAD)
	docker compose --env-file $(COMPOSE_ENV_FILE) -f $(COMPOSE_FILE) up -d --renew-anon-volumes

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

download-osm:
	bash scripts/download-finland-osm.sh

smoke-test:
	bash scripts/smoke-test-route.sh

smoke:
	bash scripts/smoke.sh
