COMPOSE_FILE := infra/docker/docker-compose.local.yml

.PHONY: up down logs reset dev download-osm smoke-test smoke

up:
	docker compose -f $(COMPOSE_FILE) up -d

down:
	docker compose -f $(COMPOSE_FILE) down

logs:
	docker compose -f $(COMPOSE_FILE) logs -f

reset:
	docker compose -f $(COMPOSE_FILE) down -v

dev:
	@echo "not yet implemented"

download-osm:
	bash scripts/download-finland-osm.sh

smoke-test:
	bash scripts/smoke-test-route.sh

smoke:
	bash scripts/smoke.sh
