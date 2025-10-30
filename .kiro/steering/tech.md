# Technology Stack

## Core Technologies

- **Language**: TypeScript
- **Infrastructure as Code**: Pulumi v3.113.0+
- **Cloud Provider**: AWS
- **Testing Framework**: Jest with ts-jest
- **Package Manager**: npm

## Key Dependencies

- `@pulumi/aws`: AWS provider for Pulumi
- `@pulumi/awsx`: Higher-level AWS components
- `@pulumi/policy`: Policy as code framework
- `@pulumi/awsguard`: AWS security policies
- `js-yaml`: YAML configuration parsing

## Build System & Commands

### Testing
```bash
npm test                    # Run unit tests
npm run test:integration    # Run integration tests
npm run test:coverage       # Generate coverage reports
npm run test:all           # Run all tests
```

### Deployment
```bash
npm run deploy             # Deploy using automation CLI
npm run destroy            # Destroy infrastructure
npm run preview            # Preview changes
npm run deploy:multi-region # Multi-region deployment
npm run run-all            # Deploy from configuration file
```

### Automation CLI
```bash
npm run automation deploy   # CLI-based deployment
npm run automation validate # Validate configuration
npm run automation status   # Check deployment status
```

## TypeScript Configuration

- **Target**: ES2020
- **Module**: CommonJS
- **Strict mode**: Enabled
- **Source maps**: Enabled
- **Experimental decorators**: Enabled

## Testing Strategy

- **Unit Tests**: Components and utilities (`jest.config.js`)
- **Integration Tests**: End-to-end deployment scenarios (`jest.integration.config.js`)
- **Coverage**: Automated coverage reporting
- **Test Structure**: Separate unit and integration test directories