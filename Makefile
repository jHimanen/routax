COMPOSE_FILE := infra/docker/docker-compose.local.yml

.PHONY: up down logs reset dev

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
