.PHONY: help install create delete dev run clean info test verify

CLUSTER_NAME := resilient-observability
KIND_CONFIG := kind/kind-config.yaml

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "$(BLUE)╔════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║   Local Development - Observability Stack ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Quick Start:$(NC)"
	@echo "  make install    # Install prerequisites"
	@echo "  make create     # Create Kind cluster"
	@echo "  make dev        # Start Skaffold (continuous development)"
	@echo ""
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

install: ## Install prerequisites (Skaffold, Kind, kubectl, Helm)
	@echo "$(BLUE)Installing prerequisites...$(NC)"
	@command -v brew >/dev/null 2>&1 || (echo "$(RED)Homebrew not found. Install from https://brew.sh$(NC)" && exit 1)
	@command -v kind >/dev/null 2>&1 || (echo "Installing Kind..." && brew install kind)
	@command -v kubectl >/dev/null 2>&1 || (echo "Installing kubectl..." && brew install kubectl)
	@command -v helm >/dev/null 2>&1 || (echo "Installing Helm..." && brew install helm)
	@command -v skaffold >/dev/null 2>&1 || (echo "Installing Skaffold..." && brew install skaffold)
	@command -v docker >/dev/null 2>&1 || echo "$(YELLOW)Docker not found. Install: brew install --cask docker$(NC)"
	@echo "$(GREEN)✓ All prerequisites installed$(NC)"

verify-docker: ## Verify Docker is running
	@docker ps >/dev/null 2>&1 || (echo "$(RED)Docker not running. Start Docker Desktop$(NC)" && exit 1)

create: verify-docker ## Create Kind cluster
	@echo "$(BLUE)Creating Kind cluster: $(CLUSTER_NAME)$(NC)"
	@kind create cluster --config $(KIND_CONFIG) --wait 3m
	@echo "$(GREEN)✓ Cluster created$(NC)"
	@kubectl get nodes

delete: ## Delete Kind cluster
	@echo "$(BLUE)Deleting cluster...$(NC)"
	@kind delete cluster --name $(CLUSTER_NAME) 2>/dev/null || true

info: ## Show cluster info
	@kubectl get nodes 2>/dev/null || echo "Cluster not running"

dev: ## Start Skaffold (continuous development)
	@command -v skaffold >/dev/null 2>&1 || (echo "$(RED)Run: make install$(NC)" && exit 1)
	skaffold dev

run: ## Deploy once with Skaffold
	skaffold run

clean: ## Delete Skaffold deployments
	skaffold delete || true

down: clean delete ## Delete everything

dev-minimal: ## Minimal profile (Loki + Grafana)
	skaffold dev -p minimal

dev-full: ## Full profile with sample app
	skaffold dev -p dev

test: ## Run tests
	@kubectl get nodes && kubectl get pods -A

status: ## Show component status
	@kubectl get deployments,statefulsets,pods -A | grep -E 'NAMESPACE|loki|tempo|mimir|grafana|opentelemetry'

logs-loki: ## Loki logs
	@kubectl logs -n loki -l app.kubernetes.io/name=loki --tail=100 -f

logs-grafana: ## Grafana logs
	@kubectl logs -n grafana -l app.kubernetes.io/name=grafana --tail=100 -f

grafana-url: ## Open Grafana
	@echo "http://localhost:3000 (admin/admin123)"
	@open http://localhost:3000 2>/dev/null || true

deploy-sample: ## Deploy sample app
	@kubectl apply -f manifests/sample-app.yaml

up: install create dev ## Full setup

reset: delete create ## Reset cluster

debug: ## Debug info
	@echo "Docker:" && docker version 2>/dev/null || echo "Not running"
	@echo "\nDocker Resources:" && docker info 2>/dev/null | grep -E "CPUs|Memory" || echo "N/A"
	@echo "\nKind:" && kind version 2>/dev/null || echo "Not installed"
	@echo "\nSkaffold:" && skaffold version 2>/dev/null || echo "Not installed"
	@echo "\nKubectl:" && kubectl version --client 2>/dev/null || echo "Not installed"
