# Project Structure

## Repository Layout

This is a monorepo containing multiple Pulumi infrastructure projects:

- `aws-go-eks/`: Go-based EKS cluster implementation
- `aws-ts-resilient-observability/`: Main TypeScript observability platform

## Main Project Structure (`aws-ts-resilient-observability/`)

### Core Directories

- **`components/`**: Reusable infrastructure components
  - `base.ts`: Base component class with error handling and logging
  - `interfaces.ts`: Shared interfaces and types
  - `acm/`, `ecr/`, `eks/`, `ipam/`, `rds/`, `route53/`, `vpc/`: Component implementations
  - `utils/`: Shared utilities (error handling, logging, validation)

- **`automation/`**: Deployment orchestration and CLI
  - `cli.ts`: Command-line interface
  - `deployment-orchestrator.ts`: Multi-stack deployment logic
  - `config-manager.ts`: Configuration management
  - `dependency-resolver.ts`: Stack dependency resolution
  - `types.ts`: Automation type definitions

- **`shared-services/`**: Shared services stack (observability infrastructure)
- **`workloads/`**: Workloads stack (application infrastructure)

### Configuration & Examples

- **`examples/`**: Usage examples and deployment configurations
- **`deployment-config.json`**: Main deployment configuration
- **`.env.template`**: Environment variable template

### Testing

- **`tests/unit/`**: Unit tests for components and utilities
- **`tests/integration/`**: End-to-end deployment tests
- **`coverage/`**: Test coverage reports

### Documentation

- **`DEPLOYMENT_GUIDE.md`**: Detailed deployment instructions
- **`RUN_ALL_GUIDE.md`**: Automation usage guide
- **`diagrams/`**: Architecture diagrams

## Component Architecture Patterns

### Base Component Pattern
All infrastructure components extend `BaseAWSComponent` which provides:
- Standardized error handling and recovery
- Structured logging and performance monitoring
- Input validation and sanitization
- Common AWS provider management

### Configuration Pattern
Components use strongly-typed configuration interfaces that extend `BaseComponentArgs`:
- Region and tagging standardization
- Error handling configuration
- Logging configuration

### Testing Pattern
- Component tests in `component-name.test.ts`
- Integration tests in `tests/integration/`
- Shared test utilities in `tests/setup.ts`

## File Naming Conventions

- **Components**: `kebab-case` directories, `index.ts` for main export
- **Tests**: `component-name.test.ts` for unit tests
- **Configuration**: `kebab-case.json` or `kebab-case.yaml`
- **Documentation**: `UPPER_CASE.md` for guides, `README.md` for overviews