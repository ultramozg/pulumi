import * as pulumi from "@pulumi/pulumi";
import { ECRComponent } from "../components/ecr";

/**
 * Example usage of ECR Component with cross-region replication
 * and organization sharing capabilities
 */

// Create ECR component with multiple repositories
const ecrComponent = new ECRComponent("example-ecr", {
    repositories: [
        {
            name: "web-app",
            shareWithOrganization: true,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 10 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 10
                    },
                    action: {
                        type: "expire"
                    }
                }]
            }),
            tags: {
                Application: "web-application",
                Team: "frontend"
            }
        },
        {
            name: "api-service",
            shareWithOrganization: false,
            lifecyclePolicy: JSON.stringify({
                rules: [{
                    rulePriority: 1,
                    description: "Keep last 5 images",
                    selection: {
                        tagStatus: "any",
                        countType: "imageCountMoreThan",
                        countNumber: 5
                    },
                    action: {
                        type: "expire"
                    }
                }]
            }),
            tags: {
                Application: "api-service",
                Team: "backend"
            }
        },
        {
            name: "worker-service",
            shareWithOrganization: false,
            tags: {
                Application: "worker-service",
                Team: "data"
            }
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        Environment: "production",
        Project: "microservices-platform",
        ManagedBy: "platform-team"
    }
});

// Export repository URLs for use in other stacks
export const repositoryUrls = ecrComponent.repositoryUrls;
export const repositoryArns = ecrComponent.repositoryArns;

// Export specific repository URLs
export const webAppRepositoryUrl = ecrComponent.getRepositoryUrl("web-app");
export const apiServiceRepositoryUrl = ecrComponent.getRepositoryUrl("api-service");
export const workerServiceRepositoryUrl = ecrComponent.getRepositoryUrl("worker-service");

// Export replication configuration
export const replicationConfiguration = ecrComponent.replicationConfiguration;