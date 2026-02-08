# Pulumi Learning Plan

A structured learning path for mastering Pulumi Infrastructure as Code.

---

## Phase 1: Foundations

### Getting Started
- [ ] Install Pulumi CLI (`brew install pulumi` or equivalent)
- [ ] Create a Pulumi Cloud account (free tier)
- [ ] Configure cloud provider credentials (AWS, Azure, or GCP)
- [ ] Run `pulumi new` to create your first project
- [ ] Understand project structure: `Pulumi.yaml`, `Pulumi.<stack>.yaml`, and source files

### Core Concepts
- [ ] Understand Resources and their lifecycle (create, update, delete)
- [ ] Learn about Inputs, Outputs, and the `apply()` function
- [ ] Understand Stacks and how they represent environments (dev, staging, prod)
- [ ] Learn about State and how Pulumi tracks infrastructure
- [ ] Practice with `pulumi preview`, `pulumi up`, and `pulumi destroy`

### Configuration & Secrets
- [ ] Use `pulumi config set` for stack configuration
- [ ] Manage secrets with `pulumi config set --secret`
- [ ] Access config values in code using `Config` class
- [ ] Understand encryption and secret providers

### LocalStack Setup (Local Development)
- [ ] Install LocalStack (`brew install localstack` or Docker)
- [ ] Start LocalStack with `localstack start` or `docker-compose`
- [ ] Configure Pulumi to use LocalStack endpoints
- [ ] Create a local AWS provider configuration:
  ```typescript
  const localAwsProvider = new aws.Provider("local", {
      skipCredentialsValidation: true,
      skipMetadataApiCheck: true,
      s3UsePathStyle: true,
      endpoints: [{ s3: "http://localhost:4566", /* ... */ }],
  });
  ```
- [ ] Test your first S3 bucket deployment locally
- [ ] Understand LocalStack Pro vs Community limitations

---

## Phase 1.5: CDK to Pulumi Transition

*For engineers coming from AWS CDK - leverage what you already know.*

### Concept Mapping

| AWS CDK | Pulumi | Notes |
|---------|--------|-------|
| `Construct` | `ComponentResource` | Both are composable building blocks |
| `Stack` | `Stack` | Same concept, different state management |
| `App` | `Pulumi.yaml` project | Entry point / project definition |
| `cdk synth` | `pulumi preview` | Preview changes before deploy |
| `cdk deploy` | `pulumi up` | Apply changes |
| `cdk destroy` | `pulumi destroy` | Tear down |
| `CfnOutput` | `pulumi.export()` | Export values for other stacks |
| `Fn.ref` / Tokens | `Output<T>` | Lazy-evaluated values |
| `cdk.context.json` | `Pulumi.<stack>.yaml` | Stack-specific config |
| L1 Constructs (`Cfn*`) | Raw resources (`aws.*`) | Direct CloudFormation/API mapping |
| L2 Constructs | Pulumi resources | Higher-level abstractions |
| L3 Constructs (Patterns) | ComponentResource | Reusable patterns |

### Key Differences to Internalize
- [ ] **No CloudFormation**: Pulumi calls AWS APIs directly (faster, no CFN limits)
- [ ] **Real programming**: No tokens/intrinsic functions - use real `if/else`, loops
- [ ] **Output vs Token**: CDK tokens resolve at synth; Pulumi Outputs resolve at runtime
- [ ] **State**: CDK uses CFN state; Pulumi has its own state (cloud or self-hosted)
- [ ] **Multi-cloud**: Same patterns work for AWS, Azure, GCP, K8s

### Using CDK Constructs in Pulumi
- [ ] Install the CDK adapter: `npm install @pulumi/cdk`
- [ ] Wrap CDK constructs:
  ```typescript
  import * as pulumi from "@pulumi/pulumi";
  import * as pulumicdk from "@pulumi/cdk";
  import * as s3 from "aws-cdk-lib/aws-s3";

  class MyStack extends pulumicdk.Stack {
      constructor(id: string) {
          super(id);
          // Use your existing CDK constructs!
          new s3.Bucket(this, "MyBucket", {
              versioned: true,
          });
      }
  }

  const stack = new MyStack("my-stack");
  ```
- [ ] Understand limitations (some L3 constructs may not work)
- [ ] Gradually migrate to native Pulumi resources

### Migration Path
- [ ] **Phase 1**: Run existing CDK code via `@pulumi/cdk` adapter
- [ ] **Phase 2**: Convert L1/L2 constructs to native Pulumi resources
- [ ] **Phase 3**: Refactor L3 patterns into Pulumi ComponentResources
- [ ] **Phase 4**: Remove CDK dependency entirely

### Side-by-Side Examples

**S3 Bucket with Lambda trigger:**

```typescript
// ─── AWS CDK ───────────────────────────────────
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

const bucket = new s3.Bucket(this, 'MyBucket');
const fn = new lambda.Function(this, 'MyFunction', {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.handler',
    code: lambda.Code.fromAsset('lambda'),
});
bucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.LambdaDestination(fn)
);
```

```typescript
// ─── Pulumi ────────────────────────────────────
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("my-bucket");

const fn = new aws.lambda.Function("my-function", {
    runtime: "nodejs18.x",
    handler: "index.handler",
    code: new pulumi.asset.FileArchive("lambda"),
    role: lambdaRole.arn,
});

const permission = new aws.lambda.Permission("allow-s3", {
    action: "lambda:InvokeFunction",
    function: fn.arn,
    principal: "s3.amazonaws.com",
    sourceArn: bucket.arn,
});

const notification = new aws.s3.BucketNotification("notification", {
    bucket: bucket.id,
    lambdaFunctions: [{
        lambdaFunctionArn: fn.arn,
        events: ["s3:ObjectCreated:*"],
    }],
}, { dependsOn: [permission] });
```

### Practice Exercise
- [ ] Take a simple CDK stack from work (with permission)
- [ ] Convert it to Pulumi manually (not using adapter)
- [ ] Compare: lines of code, clarity, deployment speed
- [ ] Document gotchas you encounter

---

## Phase 2: Intermediate Skills

### Resource Dependencies
- [ ] Understand implicit dependencies (automatic from references)
- [ ] Create explicit dependencies with `dependsOn`
- [ ] Use `ignoreChanges` to prevent drift detection on specific properties
- [ ] Learn about `deleteBeforeReplace` and replace behavior

### Component Resources
- [ ] Create your first `ComponentResource` class
- [ ] Understand parent-child relationships
- [ ] Register outputs from components
- [ ] Build reusable infrastructure modules

### Working with Outputs
- [ ] Chain outputs using `apply()` and `all()`
- [ ] Export stack outputs for cross-stack references
- [ ] Use `StackReference` to read outputs from other stacks
- [ ] Handle async operations and promises

### Imports & Adoption
- [ ] Import existing cloud resources with `pulumi import`
- [ ] Use `import` resource option for declarative imports
- [ ] Understand the adoption workflow for brownfield environments

---

## Phase 3: Advanced Patterns

### Multi-Stack Architecture
- [ ] Design stack hierarchy (shared infrastructure, applications)
- [ ] Implement cross-stack references
- [ ] Use Pulumi Automation API for orchestration
- [ ] Build micro-stacks for modular deployments

### Testing Infrastructure
- [ ] Write unit tests with mocks
- [ ] Create property tests for resource validation
- [ ] Implement integration tests with real resources
- [ ] Set up CI/CD pipelines for infrastructure testing

### Policy as Code
- [ ] Install and configure Pulumi CrossGuard
- [ ] Write resource validation policies
- [ ] Create stack validation policies
- [ ] Enforce compliance with policy packs

### Dynamic Providers
- [ ] Understand when to use dynamic providers
- [ ] Create custom CRUD operations
- [ ] Handle provider state management
- [ ] Build providers for unsupported resources

---

## Phase 3.5: Architecture Patterns

### Serverless Architecture
- [ ] Understand Lambda function lifecycle and cold starts
- [ ] Deploy Lambda with API Gateway (REST and HTTP APIs)
- [ ] Use Lambda layers for shared dependencies
- [ ] Implement Lambda destinations and async invocation
- [ ] Configure provisioned concurrency vs on-demand
- [ ] Build Step Functions for orchestration workflows

### Event-Driven Architecture
- [ ] Deploy SQS queues with dead-letter queues (DLQ)
- [ ] Set up SNS topics with fan-out patterns
- [ ] Configure EventBridge rules and event buses
- [ ] Implement S3 event notifications to Lambda
- [ ] Build event sourcing patterns with DynamoDB Streams
- [ ] Design retry and backoff strategies

### API Patterns
- [ ] Build REST APIs with API Gateway + Lambda
- [ ] Implement GraphQL with AppSync
- [ ] Configure custom domains and certificates
- [ ] Set up API authentication (Cognito, API Keys, IAM)
- [ ] Implement rate limiting and throttling
- [ ] Design API versioning strategies

### Data Architecture
- [ ] Deploy DynamoDB with GSI/LSI patterns
- [ ] Set up Aurora Serverless v2
- [ ] Configure ElastiCache (Redis) for caching
- [ ] Implement data pipelines with Kinesis
- [ ] Design single-table DynamoDB patterns
- [ ] Set up backup and point-in-time recovery

### Cost Optimization Patterns
- [ ] Implement right-sizing with Compute Optimizer
- [ ] Use Spot instances for batch workloads
- [ ] Configure S3 lifecycle policies
- [ ] Set up cost allocation tags
- [ ] Design for cost visibility with Pulumi

---

## Phase 4: Production Readiness

### State Management
- [ ] Configure remote state backends (Pulumi Cloud, S3, Azure Blob)
- [ ] Understand state locking and concurrent operations
- [ ] Practice state recovery and `pulumi refresh`
- [ ] Learn state import/export for migrations

### Secrets & Security
- [ ] Use Pulumi ESC for environment configuration
- [ ] Configure OIDC for cloud provider authentication
- [ ] Integrate with external secret stores (Vault, AWS Secrets Manager)
- [ ] Implement least-privilege IAM patterns

### Refactoring & Migrations
- [ ] Use `aliases` for safe resource renaming
- [ ] Migrate resources between stacks
- [ ] Handle breaking changes in provider versions
- [ ] Plan and execute zero-downtime migrations

### CI/CD Integration
- [ ] Set up Pulumi with GitHub Actions
- [ ] Configure preview comments on PRs
- [ ] Implement deployment gates and approvals
- [ ] Use Deployments for GitOps workflows

---

## Phase 5: Expert Topics

### Automation API
- [ ] Embed Pulumi in custom applications
- [ ] Build self-service infrastructure portals
- [ ] Orchestrate complex multi-stack deployments
- [ ] Create infrastructure-as-software solutions

### Multi-Language Components
- [ ] Understand Pulumi's polyglot architecture
- [ ] Build components that work across languages
- [ ] Publish to Pulumi Registry
- [ ] Version and distribute component packages

### Provider Development
- [ ] Understand the Pulumi provider model
- [ ] Bridge Terraform providers to Pulumi
- [ ] Build native Pulumi providers
- [ ] Contribute to open-source providers

---

## Hands-On Projects

### Beginner (LocalStack)
- [ ] Deploy a static website to S3 (local)
- [ ] Create a VPC with public/private subnets (local)
- [ ] Set up a DynamoDB table with sample data (local)
- [ ] Deploy a Lambda function with API Gateway (local)

### Intermediate (LocalStack)
- [ ] Build an SQS/SNS messaging system (local)
- [ ] Deploy Step Functions workflow (local)
- [ ] Implement S3 + Lambda image processing pipeline (local)
- [ ] Create EventBridge scheduled jobs (local)

### Advanced (LocalStack → AWS)
- [ ] Multi-region active-active architecture
- [ ] Kubernetes operators deployed via Pulumi
- [ ] Self-healing infrastructure with event-driven automation

---

## Pet Project: "LinkShortener" (Full Serverless App)

A URL shortener service built incrementally to learn all concepts.

### Phase A: Foundation (LocalStack)
- [ ] **Storage Layer**: DynamoDB table for URL mappings
  - Partition key: `shortCode`, attributes: `originalUrl`, `createdAt`, `clickCount`
- [ ] **API Layer**: API Gateway + Lambda for create/redirect
  - POST `/shorten` → creates short URL
  - GET `/{code}` → redirects to original URL
- [ ] **Testing**: Deploy and test locally with curl/Postman

### Phase B: Enhance (LocalStack)
- [ ] **Analytics**: DynamoDB Streams → Lambda → update click counts
- [ ] **Async Processing**: SQS queue for analytics events
- [ ] **Caching**: ElastiCache (Redis) for hot URLs
- [ ] **Scheduled Jobs**: EventBridge rule to cleanup expired URLs

### Phase C: Production Features (LocalStack)
- [ ] **Auth**: Cognito user pool for authenticated URL management
- [ ] **Custom Domain**: Route53 + ACM certificate setup
- [ ] **CDN**: CloudFront distribution for global edge caching
- [ ] **Monitoring**: CloudWatch dashboards and alarms

### Phase D: Architecture (LocalStack → AWS)
- [ ] **Multi-Stack**: Split into `network`, `data`, `api`, `monitoring` stacks
- [ ] **Components**: Create reusable `ServerlessApi` ComponentResource
- [ ] **Testing**: Unit tests, integration tests, policy tests
- [ ] **CI/CD**: GitHub Actions pipeline with preview environments
- [ ] **Deploy to AWS**: Graduate from LocalStack to real AWS

### Phase E: Advanced (AWS)
- [ ] **Multi-Region**: Active-active with DynamoDB Global Tables
- [ ] **Canary Deployments**: Gradual Lambda rollouts
- [ ] **Cost Tracking**: Resource tagging and cost allocation
- [ ] **Disaster Recovery**: Backup and restore procedures

### Phase F: AI-Powered Operations (AIOps)
- [ ] **Log Aggregation**: CloudWatch Logs → Kinesis Firehose → S3
- [ ] **AI Agent**: Deploy Ollama locally or use Bedrock for LLM
- [ ] **Log Analysis Agent**: Strands Agent that reads error logs
- [ ] **Auto-Remediation**: Agent suggests or executes fixes via Lambda
- [ ] **Slack/Discord Integration**: Agent reports findings to chat
- [ ] **Feedback Loop**: Store successful remediations for learning

### Project Structure
```
linkshortener/
├── infrastructure/
│   ├── stacks/
│   │   ├── network/        # VPC, subnets (if needed)
│   │   ├── data/           # DynamoDB, ElastiCache
│   │   ├── api/            # Lambda, API Gateway
│   │   └── monitoring/     # CloudWatch, alarms
│   ├── components/
│   │   ├── serverless-api/ # Reusable API component
│   │   └── dynamo-table/   # Reusable DynamoDB component
│   └── tests/
├── functions/
│   ├── create-url/
│   ├── redirect/
│   └── analytics/
├── localstack/
│   └── docker-compose.yml
└── README.md
```

---

## Mini Projects (Quick Wins with LocalStack)

### 1. Static Site Generator Pipeline
- [ ] S3 bucket for hosting
- [ ] Lambda triggered on S3 upload (markdown → HTML)
- [ ] CloudFront distribution
- [ ] Estimated time: 2-3 hours

### 2. Webhook Processor
- [ ] API Gateway endpoint
- [ ] SQS queue for buffering
- [ ] Lambda consumer with retry logic
- [ ] DLQ for failed messages
- [ ] Estimated time: 2-3 hours

### 3. Scheduled Report Generator
- [ ] EventBridge scheduled rule
- [ ] Lambda to query data
- [ ] S3 bucket for report storage
- [ ] SNS notification on completion
- [ ] Estimated time: 2-3 hours

### 4. Image Thumbnail Service
- [ ] S3 bucket with event notification
- [ ] Lambda with Sharp/Pillow for resizing
- [ ] Destination bucket for thumbnails
- [ ] Estimated time: 3-4 hours

### 5. Chat Bot Backend
- [ ] API Gateway WebSocket API
- [ ] Lambda for connection management
- [ ] DynamoDB for connection state
- [ ] SNS for message fanout
- [ ] Estimated time: 4-5 hours

---

## Pet Project: "LogSherlock" (AI-Powered Log Analysis)

An intelligent log analysis system that uses local LLMs to diagnose and remediate issues.

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ logs
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CloudWatch Logs → Kinesis Firehose → S3 (log archive)          │
│                          │                                       │
│                          ▼                                       │
│              CloudWatch Log Subscription                         │
│                          │                                       │
│                          ▼                                       │
│                    Lambda (filter)                               │
│                    (error detection)                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ error events
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SQS Queue                                    │
│                  (error buffer)                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI Analysis Layer                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Option A: Ollama (Local)     Option B: Bedrock (AWS)      │ │
│  │  - Runs on EC2/ECS            - Managed service            │ │
│  │  - Llama 3, Mistral, etc.     - Claude, Titan              │ │
│  │  - No data leaves your VPC    - Pay per token              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│               Strands Agent Framework                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Tools:                                                     │ │
│  │  - read_logs: Fetch recent logs from CloudWatch            │ │
│  │  - search_docs: Query knowledge base (past incidents)      │ │
│  │  - get_metrics: Fetch CloudWatch metrics                   │ │
│  │  - run_diagnostic: Execute diagnostic Lambda               │ │
│  │  - apply_fix: Execute remediation (with approval)          │ │
│  │  - notify_team: Send to Slack/Discord                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐
│   Auto-Remediation   │    │   Human Notification │
│   (approved actions) │    │   (Slack/Discord)    │
│                      │    │                      │
│   - Scale up ECS     │    │   - Error summary    │
│   - Restart service  │    │   - Root cause       │
│   - Clear cache      │    │   - Suggested fix    │
│   - Rollback deploy  │    │   - Action buttons   │
└──────────────────────┘    └──────────────────────┘
```

### Phase A: Log Pipeline (LocalStack)
- [ ] **Log Ingestion**: Set up CloudWatch Logs subscription filter
- [ ] **Error Detection Lambda**: Filter for ERROR/EXCEPTION patterns
- [ ] **Queue**: SQS for buffering errors with DLQ
- [ ] **Storage**: S3 bucket for log archive
- [ ] **Test**: Generate sample errors and verify pipeline

### Phase B: Local LLM Setup
- [ ] **Ollama Deployment**:
  ```bash
  # Local development
  docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
  ollama pull llama3.2
  ollama pull codellama  # for code-related errors
  ```
- [ ] **EC2/ECS for Ollama**: Deploy Ollama on GPU instance (g4dn.xlarge)
- [ ] **API Wrapper**: Lambda/Container to proxy Ollama API
- [ ] **Prompt Engineering**: Create system prompts for log analysis
- [ ] **Test**: Send sample logs, verify meaningful analysis

### Phase C: AI Agent (TypeScript)
- [ ] **Agent Setup** using Vercel AI SDK or LangChain.js:
  ```typescript
  import { generateText, tool } from "ai";
  import { createOllama } from "ollama-ai-provider";

  const ollama = createOllama({ baseURL: "http://localhost:11434/api" });

  // Define tools
  const readLogsTool = tool({
      description: "Fetch recent logs from CloudWatch by time range",
      parameters: z.object({
          logGroup: z.string(),
          startTime: z.number(),
          endTime: z.number(),
      }),
      execute: async ({ logGroup, startTime, endTime }) => {
          // Fetch from CloudWatch
          return await cloudWatchClient.filterLogEvents({ ... });
      },
  });

  const agent = async (errorMessage: string) => {
      const result = await generateText({
          model: ollama("llama3.2"),
          system: LOG_ANALYSIS_PROMPT,
          prompt: `Analyze this error: ${errorMessage}`,
          tools: {
              readLogs: readLogsTool,
              searchDocs: searchDocsTool,
              getMetrics: getMetricsTool,
              notifyTeam: notifyTeamTool,
          },
          maxSteps: 10, // Allow multiple tool calls
      });
      return result;
  };
  ```
- [ ] **Tool: readLogs**: Fetch logs from CloudWatch by time range
- [ ] **Tool: searchDocs**: Query past incidents in DynamoDB/OpenSearch
- [ ] **Tool: getMetrics**: Fetch CPU, memory, error rates
- [ ] **Tool: notifyTeam**: Post to Slack webhook
- [ ] **Deploy**: Lambda or ECS Fargate for agent runtime

### Phase D: Knowledge Base
- [ ] **Incident Database**: DynamoDB table for past incidents
  - `incidentId`, `errorPattern`, `rootCause`, `resolution`, `timestamp`
- [ ] **Runbook Storage**: S3 bucket with markdown runbooks
- [ ] **Vector Store**: OpenSearch or Pinecone for semantic search
- [ ] **Learning Loop**: Store successful diagnoses for RAG

### Phase E: Auto-Remediation
- [ ] **Action Registry**: DynamoDB table of approved actions
  - `actionId`, `trigger`, `command`, `requiresApproval`, `lastRun`
- [ ] **Remediation Lambdas**:
  - Scale ECS service
  - Restart ECS task
  - Clear ElastiCache
  - Trigger rollback
- [ ] **Approval Flow**: Slack interactive buttons for human approval
- [ ] **Audit Log**: Track all actions taken

### Phase F: Production (AWS)
- [ ] **Bedrock Integration**: Add Claude as alternative to Ollama
- [ ] **Multi-App Support**: Handle logs from multiple services
- [ ] **Dashboards**: Grafana dashboard for agent activity
- [ ] **Alerting**: PagerDuty integration for critical issues
- [ ] **Cost Controls**: Rate limiting, token budgets

### Project Structure
```
logsherlock/
├── infrastructure/
│   ├── stacks/
│   │   ├── log-pipeline/     # CloudWatch, Kinesis, S3
│   │   ├── ai-platform/      # Ollama on ECS, or Bedrock config
│   │   ├── agent/            # Agent runtime on ECS/Lambda
│   │   └── knowledge-base/   # DynamoDB, OpenSearch
│   └── components/
│       ├── log-subscriber/   # Reusable log subscription
│       └── llm-endpoint/     # Abstraction over Ollama/Bedrock
├── agent/
│   ├── src/
│   │   ├── tools/
│   │   │   ├── readLogs.ts
│   │   │   ├── searchDocs.ts
│   │   │   ├── getMetrics.ts
│   │   │   ├── runDiagnostic.ts
│   │   │   └── notifyTeam.ts
│   │   ├── prompts/
│   │   │   ├── system.ts
│   │   │   └── analysis.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── functions/
│   ├── error-filter/
│   ├── remediation/
│   └── slack-handler/
├── runbooks/
│   ├── high-cpu.md
│   ├── oom-error.md
│   └── connection-timeout.md
├── docker/
│   ├── ollama/
│   └── agent/
└── localstack/
    └── docker-compose.yml
```

### Example Agent Interaction
```
[ERROR DETECTED] 2024-01-15 14:23:45 - OutOfMemoryError in api-service

Agent: I've detected an OutOfMemoryError in the api-service. Let me investigate.

1. Fetching recent logs... Found 47 error entries in last 5 minutes.
2. Checking metrics... Memory usage at 98%, CPU normal at 45%.
3. Searching knowledge base... Found similar incident from 2024-01-02.

Root Cause Analysis:
- Memory leak detected in /api/reports endpoint
- Large report generation without pagination
- Previous fix: Increased memory limit temporarily, added pagination

Recommended Actions:
1. [IMMEDIATE] Scale ECS service from 2 to 4 tasks ⚡
2. [SHORT-TERM] Restart affected tasks to clear memory
3. [FOLLOW-UP] Review report pagination implementation

Should I execute action #1? [Approve] [Deny] [More Info]
```

---

## Pet Project: "TenantForge" (Multi-Tenant Provisioning API)

A self-service API that provisions isolated infrastructure per tenant using Pulumi Automation API.

### The Vision
```bash
# Create a new tenant environment
curl -X POST https://api.tenantforge.local/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "tenant_id": "acme-corp",
    "region": "eu-central-1",
    "tier": "professional",
    "features": ["api", "database", "cache"]
  }'

# Response
{
  "tenant_id": "acme-corp",
  "status": "provisioning",
  "stack_name": "tenant-acme-corp-eu-central-1",
  "estimated_time": "3-5 minutes",
  "webhook": "https://api.tenantforge.local/tenants/acme-corp/status"
}
```

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────┐
│                         TenantForge API                              │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  POST /tenants              - Create new tenant                 │ │
│  │  GET  /tenants/:id          - Get tenant status                 │ │
│  │  PUT  /tenants/:id          - Update tenant (scale, features)   │ │
│  │  DELETE /tenants/:id        - Destroy tenant                    │ │
│  │  GET  /tenants/:id/outputs  - Get connection strings, URLs      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Job Queue (SQS/Redis)                             │
│                                                                      │
│   { action: "create", tenant: "acme", region: "eu-central-1" }      │
│   { action: "update", tenant: "foo", features: ["cache"] }          │
│   { action: "destroy", tenant: "old-customer" }                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Provisioning Workers (ECS/Lambda)                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Pulumi Automation API                                          │ │
│  │                                                                  │ │
│  │  const stack = await LocalWorkspace.createOrSelectStack({       │ │
│  │      stackName: `tenant-${tenantId}-${region}`,                 │ │
│  │      projectName: "tenant-infrastructure",                      │ │
│  │      program: async () => {                                     │ │
│  │          // Dynamically build infrastructure based on tier      │ │
│  │          const vpc = new TenantVpc(tenantId, { ... });         │ │
│  │          const db = new TenantDatabase(tenantId, { ... });     │ │
│  │          const api = new TenantApi(tenantId, { ... });         │ │
│  │      },                                                         │ │
│  │  });                                                            │ │
│  │  await stack.up({ onOutput: console.log });                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Per-Tenant Infrastructure                         │
│                                                                      │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │ Tenant: A   │   │ Tenant: B   │   │ Tenant: C   │   ...        │
│   │ eu-central-1│   │ us-east-1   │   │ ap-south-1  │              │
│   │             │   │             │   │             │              │
│   │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │              │
│   │ │   VPC   │ │   │ │   VPC   │ │   │ │   VPC   │ │              │
│   │ │   RDS   │ │   │ │   RDS   │ │   │ │ DynamoDB│ │              │
│   │ │   ECS   │ │   │ │  Lambda │ │   │ │  Lambda │ │              │
│   │ │  Redis  │ │   │ │         │ │   │ │  Redis  │ │              │
│   │ └─────────┘ │   │ └─────────┘ │   │ └─────────┘ │              │
│   └─────────────┘   └─────────────┘   └─────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Tenant Tiers
```typescript
const TENANT_TIERS = {
    starter: {
        database: "dynamodb",      // Serverless, pay-per-use
        compute: "lambda",         // No idle cost
        cache: null,               // No cache
        replicas: 0,
    },
    professional: {
        database: "aurora-serverless",
        compute: "ecs-fargate",
        cache: "elasticache-small",
        replicas: 1,
    },
    enterprise: {
        database: "aurora-provisioned",
        compute: "ecs-ec2",
        cache: "elasticache-cluster",
        replicas: 2,
        dedicated_vpc: true,
    },
};
```

### Phase A: Core API (LocalStack)
- [ ] **API Service**: Express/FastAPI with endpoints:
  - `POST /tenants` - Create tenant
  - `GET /tenants/:id` - Get status
  - `DELETE /tenants/:id` - Destroy tenant
- [ ] **Job Queue**: SQS for async provisioning
- [ ] **State Store**: DynamoDB for tenant metadata
  - `tenantId`, `region`, `tier`, `status`, `stackName`, `createdAt`, `outputs`
- [ ] **Basic Automation API**: Inline program that creates S3 bucket per tenant
- [ ] **Test locally**: Create/destroy tenants via curl

### Phase B: Infrastructure Templates (LocalStack)
- [ ] **Tenant VPC Component**: Isolated network per tenant
  ```typescript
  class TenantVpc extends pulumi.ComponentResource {
      public vpc: aws.ec2.Vpc;
      public subnets: aws.ec2.Subnet[];

      constructor(tenantId: string, opts?: pulumi.ResourceOptions) {
          super("tenantforge:network:TenantVpc", tenantId, {}, opts);
          // Create isolated VPC with CIDR based on tenant number
      }
  }
  ```
- [ ] **Tenant Database Component**: RDS/DynamoDB based on tier
- [ ] **Tenant API Component**: Lambda or ECS based on tier
- [ ] **Tier-based provisioning**: Different resources per tier

### Phase C: Async Operations
- [ ] **Worker Service**: ECS task or Lambda for long-running provisions
- [ ] **Progress Tracking**: Update DynamoDB during provisioning
- [ ] **Webhooks**: Notify external systems on completion
- [ ] **Retry Logic**: Handle transient failures
- [ ] **Concurrency Control**: Limit parallel provisions per region

### Phase D: Lifecycle Management
- [ ] **Updates**: Scale tenant resources (upgrade/downgrade tier)
  ```bash
  curl -X PUT https://api.tenantforge.local/tenants/acme-corp \
    -d '{"tier": "enterprise"}'
  ```
- [ ] **Outputs**: Return connection strings, endpoints
  ```bash
  curl https://api.tenantforge.local/tenants/acme-corp/outputs
  # { "api_url": "https://...", "db_host": "...", "redis_host": "..." }
  ```
- [ ] **Destroy**: Clean teardown with confirmation
- [ ] **Drift Detection**: Scheduled `pulumi refresh` per tenant

### Phase E: Multi-Region (AWS)
- [ ] **Region Selection**: Provision in any supported region
- [ ] **State Backend**: Central state storage (Pulumi Cloud or S3)
- [ ] **Cross-Region Resources**: Route53 for DNS, global WAF
- [ ] **Region Failover**: Move tenant to different region

### Phase F: Production Hardening
- [ ] **Authentication**: API keys or OAuth for tenant management
- [ ] **RBAC**: Who can create/destroy tenants
- [ ] **Cost Tracking**: Tag all resources with tenant ID
- [ ] **Quotas**: Max tenants per tier, resource limits
- [ ] **Audit Log**: Track all provisioning actions
- [ ] **Billing Integration**: Meter usage per tenant

### Project Structure
```
tenantforge/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── tenants.ts
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── provisioner.ts      # Automation API wrapper
│   │   │   ├── queue.ts            # SQS interactions
│   │   │   └── state.ts            # DynamoDB operations
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
├── worker/
│   ├── src/
│   │   ├── handler.ts              # Process queue messages
│   │   └── programs/
│   │       ├── tenant-starter.ts   # Starter tier program
│   │       ├── tenant-pro.ts       # Professional tier program
│   │       └── tenant-enterprise.ts
│   └── Dockerfile
├── infrastructure/
│   ├── platform/                   # TenantForge's own infra
│   │   ├── api.ts
│   │   ├── queue.ts
│   │   └── database.ts
│   └── components/                 # Reusable tenant components
│       ├── tenant-vpc/
│       ├── tenant-database/
│       ├── tenant-api/
│       └── tenant-cache/
├── localstack/
│   └── docker-compose.yml
└── README.md
```

### Example: Provisioner Service
```typescript
// worker/src/programs/tenant-starter.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { LocalWorkspace } from "@pulumi/pulumi/automation";

interface TenantConfig {
    tenantId: string;
    region: string;
    tier: "starter" | "professional" | "enterprise";
}

export async function provisionTenant(config: TenantConfig) {
    const stackName = `tenant-${config.tenantId}-${config.region}`;

    const stack = await LocalWorkspace.createOrSelectStack({
        stackName,
        projectName: "tenant-infrastructure",
        program: async () => {
            // All infrastructure defined inline
            const tags = {
                TenantId: config.tenantId,
                Tier: config.tier,
                ManagedBy: "TenantForge",
            };

            // DynamoDB table for tenant data
            const table = new aws.dynamodb.Table(`${config.tenantId}-data`, {
                attributes: [{ name: "pk", type: "S" }],
                hashKey: "pk",
                billingMode: "PAY_PER_REQUEST",
                tags,
            });

            // Lambda function for tenant API
            const fn = new aws.lambda.Function(`${config.tenantId}-api`, {
                runtime: "nodejs18.x",
                handler: "index.handler",
                code: new pulumi.asset.AssetArchive({
                    "index.js": new pulumi.asset.StringAsset(`
                        exports.handler = async (event) => ({
                            statusCode: 200,
                            body: JSON.stringify({ tenant: "${config.tenantId}" })
                        });
                    `),
                }),
                role: lambdaRole.arn,
                environment: {
                    variables: {
                        TABLE_NAME: table.name,
                        TENANT_ID: config.tenantId,
                    },
                },
                tags,
            });

            // API Gateway
            const api = new aws.apigatewayv2.Api(`${config.tenantId}-http`, {
                protocolType: "HTTP",
                tags,
            });

            // Return outputs
            return {
                tableArn: table.arn,
                apiUrl: api.apiEndpoint,
                functionArn: fn.arn,
            };
        },
    });

    // Set config
    await stack.setConfig("aws:region", { value: config.region });

    // Run the update
    const result = await stack.up({ onOutput: console.log });

    return {
        stackName,
        outputs: result.outputs,
        summary: result.summary,
    };
}
```

### API Usage Examples
```bash
# Create starter tenant
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "startup-xyz",
    "region": "us-west-2",
    "tier": "starter"
  }'

# Check provisioning status
curl http://localhost:3000/tenants/startup-xyz
# { "status": "provisioning", "progress": "Creating database..." }

# Get outputs after provisioning
curl http://localhost:3000/tenants/startup-xyz/outputs
# { "api_url": "https://abc123.execute-api.us-west-2.amazonaws.com", ... }

# Upgrade tenant tier
curl -X PUT http://localhost:3000/tenants/startup-xyz \
  -d '{ "tier": "professional" }'

# Destroy tenant (with confirmation)
curl -X DELETE http://localhost:3000/tenants/startup-xyz \
  -H "X-Confirm-Destroy: true"
```

---

## Resources

### Official Documentation
- [Pulumi Docs](https://www.pulumi.com/docs/)
- [Pulumi Examples](https://github.com/pulumi/examples)
- [Pulumi Registry](https://www.pulumi.com/registry/)

### CDK to Pulumi Migration
- [Pulumi CDK Adapter](https://www.pulumi.com/docs/iac/clouds/aws/guides/cdk/) - Use CDK constructs in Pulumi
- [CDK Migration Guide](https://www.pulumi.com/docs/iac/adopting-pulumi/migrating-to-pulumi/from-aws-cdk/)
- [pulumi/cdk on GitHub](https://github.com/pulumi/pulumi-cdk) - Adapter source code
- [CDK vs Pulumi Comparison](https://www.pulumi.com/docs/iac/concepts/vs/cloud-development-kit/)

### Automation API
- [Automation API Docs](https://www.pulumi.com/docs/iac/packages-and-automation/automation-api/)
- [Automation API Examples](https://github.com/pulumi/automation-api-examples)
- [Building a Self-Service Platform](https://www.pulumi.com/blog/building-a-self-service-platform/)
- [Multi-Tenant SaaS with Pulumi](https://www.pulumi.com/blog/pulumiup-automation-api-scalable-infrastructure/)

### LocalStack
- [LocalStack Docs](https://docs.localstack.cloud/)
- [LocalStack Coverage](https://docs.localstack.cloud/references/coverage/) - AWS service parity
- [Pulumi + LocalStack Guide](https://docs.localstack.cloud/user-guide/integrations/pulumi/)
- [LocalStack Docker Compose](https://github.com/localstack/localstack)

### LocalStack Quick Start
```bash
# Install
brew install localstack/tap/localstack-cli

# Start (Docker required)
localstack start

# Or with Docker Compose
docker-compose up -d

# Verify
curl http://localhost:4566/_localstack/health
```

### LocalStack docker-compose.yml
```yaml
version: "3.8"
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"            # LocalStack Gateway
      - "4510-4559:4510-4559"  # External services
    environment:
      - SERVICES=s3,dynamodb,lambda,apigateway,sqs,sns,events,stepfunctions
      - DEBUG=1
      - LAMBDA_EXECUTOR=docker
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "./localstack-data:/var/lib/localstack"
```

### AI & Agents (TypeScript)
- [Vercel AI SDK](https://sdk.vercel.ai/docs) - Best TypeScript AI toolkit with tool calling
- [LangChain.js](https://js.langchain.com/) - TypeScript agent framework
- [Ollama](https://ollama.ai/) - Run LLMs locally
- [ollama-ai-provider](https://www.npmjs.com/package/ollama-ai-provider) - Vercel AI SDK provider for Ollama
- [Ollama Models](https://ollama.ai/library) - Available models (Llama, Mistral, CodeLlama)
- [AWS Bedrock](https://aws.amazon.com/bedrock/) - Managed LLM service
- [@ai-sdk/amazon-bedrock](https://www.npmjs.com/package/@ai-sdk/amazon-bedrock) - Vercel AI SDK for Bedrock

### Ollama Quick Start
```bash
# Install Ollama
brew install ollama

# Start server
ollama serve

# Pull models
ollama pull llama3.2        # General purpose
ollama pull codellama       # Code analysis
ollama pull mistral         # Fast, good for logs

# Test
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Analyze this error: ConnectionTimeout after 30s",
  "stream": false
}'
```

### TypeScript AI Agent Quick Start
```bash
# Install dependencies
npm install ai ollama-ai-provider zod
```

```typescript
// agent.ts
import { generateText, tool } from "ai";
import { createOllama } from "ollama-ai-provider";
import { z } from "zod";

const ollama = createOllama({ baseURL: "http://localhost:11434/api" });

const result = await generateText({
    model: ollama("llama3.2"),
    system: "You are a DevOps expert analyzing application logs.",
    prompt: "Analyze this error: ConnectionTimeout after 30s to database",
    tools: {
        getMetrics: tool({
            description: "Get current system metrics",
            parameters: z.object({ service: z.string() }),
            execute: async ({ service }) => ({
                cpu: 45, memory: 78, connections: 150
            }),
        }),
    },
    maxSteps: 5,
});

console.log(result.text);
```

### Community
- [Pulumi Community Slack](https://slack.pulumi.com/)
- [Pulumi Blog](https://www.pulumi.com/blog/)
- [GitHub Discussions](https://github.com/pulumi/pulumi/discussions)

---

## Progress Tracking

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Foundations | Not Started | | |
| 1.5. CDK → Pulumi Transition | Not Started | | |
| 2. Intermediate | Not Started | | |
| 3. Advanced Patterns | Not Started | | |
| 3.5. Architecture | Not Started | | |
| 4. Production | Not Started | | |
| 5. Expert | Not Started | | |
| Pet Project: LinkShortener | Not Started | | |
| Pet Project: LogSherlock (AIOps) | Not Started | | |
| Pet Project: TenantForge (Multi-Tenant) | Not Started | | |
| Mini Projects | Not Started | | |
