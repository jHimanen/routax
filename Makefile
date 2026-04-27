COMPOSE_FILE := infra/docker/docker-compose.local.yml
COMPOSE_ENV_FILE := .env.local

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
	@echo "not yet implemented"

download-osm:
	bash scripts/download-finland-osm.sh

smoke-test:
	bash scripts/smoke-test-route.sh

smoke:
	bash scripts/smoke.sh
