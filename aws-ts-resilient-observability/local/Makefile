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
	@echo "$(BLUE)╔════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║   Local Development - Observability + Kafka Stack     ║$(NC)"
	@echo "$(BLUE)╚════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)Quick Start:$(NC)"
	@echo "  make install    # Install prerequisites"
	@echo "  make create     # Create Kind cluster"
	@echo "  make dev        # Start Skaffold (continuous development)"
	@echo ""
	@echo "$(GREEN)Demo Commands:$(NC)"
	@echo "  make demo       # Run demo (create order, payment, ship)"
	@echo "  make order      # Create a test order"
	@echo "  make batch      # Run batch demo (multiple events)"
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

dev: ## Start Skaffold (continuous development with apps)
	@command -v skaffold >/dev/null 2>&1 || (echo "$(RED)Run: make install$(NC)" && exit 1)
	skaffold dev

dev-infra: ## Infrastructure only (no apps)
	skaffold dev -p infra

run: ## Deploy once with Skaffold
	skaffold run

clean: ## Delete Skaffold deployments
	skaffold delete || true

down: clean delete ## Delete everything

dev-minimal: ## Minimal profile (Loki + Grafana)
	skaffold dev -p minimal

test: ## Run tests
	@kubectl get nodes && kubectl get pods -A

status: ## Show component status
	@echo "$(BLUE)=== Observability Stack ===$(NC)"
	@kubectl get pods -n loki -o wide 2>/dev/null | head -5 || true
	@kubectl get pods -n tempo -o wide 2>/dev/null | head -5 || true
	@kubectl get pods -n mimir -o wide 2>/dev/null | head -3 || true
	@kubectl get pods -n grafana -o wide 2>/dev/null | head -3 || true
	@kubectl get pods -n opentelemetry -o wide 2>/dev/null | head -3 || true
	@echo ""
	@echo "$(BLUE)=== Kafka ===$(NC)"
	@kubectl get pods -n strimzi -o wide 2>/dev/null | head -3 || true
	@kubectl get pods -n kafka -o wide 2>/dev/null || true
	@echo ""
	@echo "$(BLUE)=== Apps ===$(NC)"
	@kubectl get pods -n apps -o wide 2>/dev/null || true

logs-loki: ## Loki logs
	@kubectl logs -n loki -l app.kubernetes.io/name=loki --tail=100 -f

logs-grafana: ## Grafana logs
	@kubectl logs -n grafana -l app.kubernetes.io/name=grafana --tail=100 -f

logs-app1: ## App1 Producer logs
	@kubectl logs -n apps -l app=app1-producer --tail=100 -f

logs-app2: ## App2 Consumer logs
	@kubectl logs -n apps -l app=app2-consumer --tail=100 -f

logs-kafka: ## Kafka logs
	@kubectl logs -n kafka -l strimzi.io/name=kafka-cluster-kafka --tail=100 -f

grafana-url: ## Open Grafana
	@echo "http://localhost:3000 (admin/admin)"
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

# Demo commands
order: ## Create a test order
	@echo "$(BLUE)Creating test order...$(NC)"
	@curl -s -X POST http://localhost:8080/api/order \
		-H "Content-Type: application/json" \
		-d '{"product": "Widget Pro", "quantity": 3, "customerId": "cust-123"}' | jq .

payment: ## Process a payment
	@echo "$(BLUE)Processing payment...$(NC)"
	@curl -s -X POST http://localhost:8080/api/payment \
		-H "Content-Type: application/json" \
		-d '{"orderId": "test-order-001", "amount": 99.99, "method": "card"}' | jq .

ship: ## Initiate shipping
	@echo "$(BLUE)Initiating shipment...$(NC)"
	@curl -s -X POST http://localhost:8080/api/ship \
		-H "Content-Type: application/json" \
		-d '{"orderId": "test-order-001", "address": "123 Main St, City, ST 12345"}' | jq .

batch: ## Run batch demo
	@echo "$(BLUE)Running batch demo...$(NC)"
	@curl -s -X POST http://localhost:8080/api/demo/batch | jq .

demo: ## Run full demo (order -> payment -> ship)
	@echo "$(BLUE)Running full demo...$(NC)"
	@echo ""
	@echo "$(GREEN)1. Creating order...$(NC)"
	@curl -s -X POST http://localhost:8080/api/order \
		-H "Content-Type: application/json" \
		-d '{"product": "Laptop", "quantity": 1, "customerId": "demo-user"}' | jq .
	@echo ""
	@sleep 1
	@echo "$(GREEN)2. Processing payment...$(NC)"
	@curl -s -X POST http://localhost:8080/api/payment \
		-H "Content-Type: application/json" \
		-d '{"orderId": "demo-order", "amount": 1299.99, "method": "credit_card"}' | jq .
	@echo ""
	@sleep 1
	@echo "$(GREEN)3. Initiating shipment...$(NC)"
	@curl -s -X POST http://localhost:8080/api/ship \
		-H "Content-Type: application/json" \
		-d '{"orderId": "demo-order", "address": "456 Oak Ave, Town, ST 67890"}' | jq .
	@echo ""
	@echo "$(GREEN)Demo complete! Check Grafana for traces: http://localhost:3000$(NC)"

error-demo: ## Simulate errors for tracing
	@echo "$(BLUE)Simulating errors (50% error rate)...$(NC)"
	@for i in 1 2 3 4 5; do \
		curl -s http://localhost:8080/api/demo/error?rate=0.5 | jq .; \
		sleep 0.5; \
	done

latency-demo: ## Simulate latency for tracing
	@echo "$(BLUE)Simulating latency...$(NC)"
	@for i in 1 2 3 4 5; do \
		curl -s "http://localhost:8080/api/demo/latency?min=100&max=500" | jq .; \
	done

health: ## Check app health
	@echo "$(BLUE)App1 (Producer):$(NC)"
	@curl -s http://localhost:8080/health | jq . 2>/dev/null || echo "Not reachable"
	@echo ""
	@echo "$(BLUE)App2 (Consumer):$(NC)"
	@curl -s http://localhost:8081/health | jq . 2>/dev/null || echo "Not reachable"

stats: ## Show consumer stats
	@echo "$(BLUE)Consumer Statistics:$(NC)"
	@curl -s http://localhost:8081/stats | jq . 2>/dev/null || echo "Not reachable"

load: ## Generate load (10 batch requests)
	@echo "$(BLUE)Generating load...$(NC)"
	@for i in 1 2 3 4 5 6 7 8 9 10; do \
		echo "Request $$i"; \
		curl -s -X POST http://localhost:8080/api/demo/batch > /dev/null; \
		sleep 0.2; \
	done
	@echo "$(GREEN)Done! Generated 30 events (10 batches x 3 events each)$(NC)"
