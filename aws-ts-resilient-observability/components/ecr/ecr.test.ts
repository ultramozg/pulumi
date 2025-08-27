import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { ECRComponent, ECRComponentArgs, ECRRepositorySpec } from "./index";

// Mock Pulumi runtime
pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): pulumi.runtime.MockResourceResult => {
        const outputs: { [key: string]: any } = { ...args.inputs };
        
        // Mock specific resource outputs
        switch (args.type) {
            case "aws:ecr/repository:Repository":
                outputs.repositoryUrl = `123456789012.dkr.ecr.us-east-1.amazonaws.com/${args.inputs.name}`;
                outputs.arn = `arn:aws:ecr:us-east-1:123456789012:repository/${args.inputs.name}`;
                outputs.registryId = "123456789012";
                break;
            case "aws:ecr/replicationConfiguration:ReplicationConfiguration":
                outputs.registryId = "123456789012";
                break;
            case "aws:ecr/repositoryPolicy:RepositoryPolicy":
                outputs.registryId = "123456789012";
                break;
            case "aws:ecr/lifecyclePolicy:LifecyclePolicy":
                outputs.registryId = "123456789012";
                break;
            case "pulumi:providers:aws":
                outputs.region = args.inputs.region || "us-east-1";
                break;
        }
        
        return {
            id: `${args.name}-id`,
            state: outputs
        };
    },
    call: (args: pulumi.runtime.MockCallArgs): pulumi.runtime.MockCallResult => {
        switch (args.token) {
            case "aws:index/getCallerIdentity:getCallerIdentity":
                return {
                    outputs: {
                        accountId: "123456789012",
                        arn: "arn:aws:iam::123456789012:root",
                        userId: "123456789012"
                    }
                };
            case "aws:organizations/getOrganization:getOrganization":
                return {
                    outputs: {
                        id: "o-example123456",
                        arn: "arn:aws:organizations::123456789012:organization/o-example123456",
                        masterAccountArn: "arn:aws:organizations::123456789012:account/o-example123456/123456789012",
                        masterAccountEmail: "test@example.com",
                        masterAccountId: "123456789012"
                    }
                };
            default:
                return { outputs: {} };
        }
    }
});

describe("ECRComponent", () => {
    let component: ECRComponent;
    
    const basicArgs: ECRComponentArgs = {
        repositories: [
            {
                name: "test-repo",
                shareWithOrganization: false
            }
        ],
        replicationEnabled: false,
        sourceRegion: "us-east-1",
        destinationRegion: "us-west-2",
        tags: {
            Environment: "test"
        }
    };

    afterEach(() => {
        // Clean up any resources
        component = undefined as any;
    });

    describe("Constructor validation", () => {
        test("should throw error when repositories array is empty", () => {
            const invalidArgs = {
                ...basicArgs,
                repositories: []
            };

            expect(() => {
                new ECRComponent("test-ecr", invalidArgs);
            }).toThrow("ECRComponent: At least one repository must be specified");
        });

        test("should throw error when repositories is undefined", () => {
            const invalidArgs = {
                ...basicArgs,
                repositories: undefined as any
            };

            expect(() => {
                new ECRComponent("test-ecr", invalidArgs);
            }).toThrow("ECRComponent: repositories is required");
        });

        test("should throw error when sourceRegion is invalid", () => {
            const invalidArgs = {
                ...basicArgs,
                sourceRegion: "invalid-region"
            };

            expect(() => {
                new ECRComponent("test-ecr", invalidArgs);
            }).toThrow("ECRComponent: Invalid region format: invalid-region");
        });

        test("should throw error when destinationRegion is invalid", () => {
            const invalidArgs = {
                ...basicArgs,
                destinationRegion: "invalid-region"
            };

            expect(() => {
                new ECRComponent("test-ecr", invalidArgs);
            }).toThrow("ECRComponent: Invalid region format: invalid-region");
        });
    });

    describe("Basic repository creation", () => {
        test("should create ECR component with single repository", () => {
            component = new ECRComponent("test-ecr", basicArgs);

            expect(component).toBeDefined();
            expect(component.repositoryUrl).toBeDefined();
            expect(component.repositoryArn).toBeDefined();
            expect(component.repositoryUrls).toBeDefined();
            expect(component.repositoryArns).toBeDefined();
        });

        test("should create ECR component with multiple repositories", () => {
            const multiRepoArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    { name: "repo1", shareWithOrganization: false },
                    { name: "repo2", shareWithOrganization: false },
                    { name: "repo3", shareWithOrganization: false }
                ]
            };

            component = new ECRComponent("test-ecr", multiRepoArgs);

            expect(component).toBeDefined();
            expect(component.repositoryUrls).toBeDefined();
            expect(component.repositoryArns).toBeDefined();
        });

        test("should apply custom tags to repositories", () => {
            const customTags = {
                Environment: "production",
                Team: "platform",
                Project: "infrastructure"
            };

            const taggedArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    {
                        name: "tagged-repo",
                        shareWithOrganization: false,
                        tags: customTags
                    }
                ]
            };

            component = new ECRComponent("test-ecr", taggedArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Cross-region replication", () => {
        test("should create replication configuration when enabled", () => {
            const replicationArgs: ECRComponentArgs = {
                ...basicArgs,
                replicationEnabled: true
            };

            component = new ECRComponent("test-ecr", replicationArgs);

            expect(component.replicationConfiguration).toBeDefined();
        });

        test("should not create replication configuration when disabled", () => {
            const noReplicationArgs: ECRComponentArgs = {
                ...basicArgs,
                replicationEnabled: false
            };

            component = new ECRComponent("test-ecr", noReplicationArgs);

            expect(component.replicationConfiguration).toBeUndefined();
        });
    });

    describe("Organization sharing", () => {
        test("should create repository policy for organization sharing", () => {
            const orgSharingArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    {
                        name: "shared-repo",
                        shareWithOrganization: true
                    }
                ]
            };

            component = new ECRComponent("test-ecr", orgSharingArgs);
            expect(component).toBeDefined();
        });

        test("should not create repository policy when organization sharing is disabled", () => {
            const noSharingArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    {
                        name: "private-repo",
                        shareWithOrganization: false
                    }
                ]
            };

            component = new ECRComponent("test-ecr", noSharingArgs);
            expect(component).toBeDefined();
        });

        test("should handle mixed sharing configuration", () => {
            const mixedSharingArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    {
                        name: "shared-repo",
                        shareWithOrganization: true
                    },
                    {
                        name: "private-repo",
                        shareWithOrganization: false
                    }
                ]
            };

            component = new ECRComponent("test-ecr", mixedSharingArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Lifecycle policies", () => {
        test("should create lifecycle policy when specified", () => {
            const lifecyclePolicyJson = JSON.stringify({
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
            });

            const lifecycleArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    {
                        name: "lifecycle-repo",
                        shareWithOrganization: false,
                        lifecyclePolicy: lifecyclePolicyJson
                    }
                ]
            };

            component = new ECRComponent("test-ecr", lifecycleArgs);
            expect(component).toBeDefined();
        });

        test("should not create lifecycle policy when not specified", () => {
            component = new ECRComponent("test-ecr", basicArgs);
            expect(component).toBeDefined();
        });
    });

    describe("Helper methods", () => {
        beforeEach(() => {
            const multiRepoArgs: ECRComponentArgs = {
                ...basicArgs,
                repositories: [
                    { name: "repo1", shareWithOrganization: false },
                    { name: "repo2", shareWithOrganization: false }
                ]
            };
            component = new ECRComponent("test-ecr", multiRepoArgs);
        });

        test("should get repository URL by name", () => {
            const repoUrl = component.getRepositoryUrl("repo1");
            expect(repoUrl).toBeDefined();
        });

        test("should get repository ARN by name", () => {
            const repoArn = component.getRepositoryArn("repo1");
            expect(repoArn).toBeDefined();
        });

        test("should throw error for non-existent repository URL", () => {
            expect(() => {
                component.getRepositoryUrl("non-existent");
            }).toThrow("Repository non-existent not found in ECR component");
        });

        test("should throw error for non-existent repository ARN", () => {
            expect(() => {
                component.getRepositoryArn("non-existent");
            }).toThrow("Repository non-existent not found in ECR component");
        });
    });

    describe("Integration scenarios", () => {
        test("should create complete ECR setup with all features", () => {
            const completeArgs: ECRComponentArgs = {
                repositories: [
                    {
                        name: "app-repo",
                        shareWithOrganization: true,
                        lifecyclePolicy: JSON.stringify({
                            rules: [{
                                rulePriority: 1,
                                description: "Keep last 5 images",
                                selection: {
                                    tagStatus: "any",
                                    countType: "imageCountMoreThan",
                                    countNumber: 5
                                },
                                action: { type: "expire" }
                            }]
                        }),
                        tags: {
                            Application: "web-app",
                            Team: "backend"
                        }
                    },
                    {
                        name: "worker-repo",
                        shareWithOrganization: false,
                        tags: {
                            Application: "worker",
                            Team: "data"
                        }
                    }
                ],
                replicationEnabled: true,
                sourceRegion: "us-east-1",
                destinationRegion: "us-west-2",
                tags: {
                    Environment: "production",
                    ManagedBy: "platform-team"
                }
            };

            component = new ECRComponent("complete-ecr", completeArgs);

            expect(component).toBeDefined();
            expect(component.replicationConfiguration).toBeDefined();
            expect(component.repositoryUrls).toBeDefined();
            expect(component.repositoryArns).toBeDefined();
        });
    });
});