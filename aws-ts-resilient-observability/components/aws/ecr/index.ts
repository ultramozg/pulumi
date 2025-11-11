import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion } from "../../shared/base";
import { StorageOutputs } from "../../shared/interfaces";

/**
 * ECR Repository specification
 */
export interface ECRRepositorySpec {
    name: string;
    lifecyclePolicy?: string;
    shareWithOrganization?: boolean;
    tags?: { [key: string]: string };
}

/**
 * Arguments for ECR Component
 */
export interface ECRComponentArgs extends BaseComponentArgs {
    repositories: ECRRepositorySpec[];
    replicationEnabled: boolean;
    sourceRegion: string;
    destinationRegion: string;
}

/**
 * Outputs from ECR Component
 */
export interface ECRComponentOutputs extends StorageOutputs {
    repositoryUrls: pulumi.Output<{ [name: string]: string }>;
    repositoryArns: pulumi.Output<{ [name: string]: string }>;
    replicationConfiguration?: pulumi.Output<any>;
}

/**
 * ECR Component with cross-region replication and organization sharing
 */
export class ECRComponent extends BaseAWSComponent implements ECRComponentOutputs {
    public readonly repositoryUrls: pulumi.Output<{ [name: string]: string }>;
    public readonly repositoryArns: pulumi.Output<{ [name: string]: string }>;
    public readonly repositoryUrl: pulumi.Output<string>;
    public readonly repositoryArn: pulumi.Output<string>;
    public replicationConfiguration?: pulumi.Output<any>;

    private readonly repositories: { [name: string]: aws.ecr.Repository } = {};
    private readonly sourceProvider: aws.Provider;

    constructor(
        name: string,
        args: ECRComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:ECR", name, args, opts);

        // Validate required arguments
        validateRequired(args.repositories, "repositories", "ECRComponent");
        validateRequired(args.sourceRegion, "sourceRegion", "ECRComponent");
        validateRequired(args.destinationRegion, "destinationRegion", "ECRComponent");

        // Validate regions
        validateRegion(args.sourceRegion, "ECRComponent");
        validateRegion(args.destinationRegion, "ECRComponent");

        if (args.repositories.length === 0) {
            throw new Error("ECRComponent: At least one repository must be specified");
        }

        // Create provider for source region
        this.sourceProvider = this.createProvider(args.sourceRegion);

        // Create repositories
        this.createRepositories(args);

        // Set up cross-region replication if enabled
        if (args.replicationEnabled) {
            this.setupReplication(args);
        }

        // Set up organization sharing for repositories that require it
        this.setupOrganizationSharing(args);

        // Create outputs
        const urls: { [name: string]: pulumi.Output<string> } = {};
        const arns: { [name: string]: pulumi.Output<string> } = {};

        Object.entries(this.repositories).forEach(([name, repo]) => {
            urls[name] = repo.repositoryUrl;
            arns[name] = repo.arn;
        });

        this.repositoryUrls = pulumi.output(urls);
        this.repositoryArns = pulumi.output(arns);

        // Set primary repository outputs (first repository for backward compatibility)
        const primaryRepoName = args.repositories[0].name;
        this.repositoryUrl = this.repositories[primaryRepoName].repositoryUrl;
        this.repositoryArn = this.repositories[primaryRepoName].arn;

        // Register outputs
        this.registerOutputs({
            repositoryUrls: this.repositoryUrls,
            repositoryArns: this.repositoryArns,
            repositoryUrl: this.repositoryUrl,
            repositoryArn: this.repositoryArn,
            replicationConfiguration: this.replicationConfiguration
        });
    }

    /**
     * Create ECR repositories based on specifications
     */
    private createRepositories(args: ECRComponentArgs): void {
        args.repositories.forEach(repoSpec => {
            const repoTags = this.mergeTags(repoSpec.tags);

            // Create repository in source region
            const repository = new aws.ecr.Repository(
                `${repoSpec.name}-repo`,
                {
                    name: repoSpec.name,
                    imageTagMutability: "MUTABLE",
                    imageScanningConfiguration: {
                        scanOnPush: true
                    },
                    encryptionConfigurations: [{
                        encryptionType: "AES256"
                    }],
                    tags: repoTags
                },
                {
                    parent: this,
                    provider: this.sourceProvider
                }
            );

            // Apply lifecycle policy if specified
            if (repoSpec.lifecyclePolicy) {
                new aws.ecr.LifecyclePolicy(
                    `${repoSpec.name}-lifecycle`,
                    {
                        repository: repository.name,
                        policy: repoSpec.lifecyclePolicy
                    },
                    {
                        parent: this,
                        provider: this.sourceProvider
                    }
                );
            }

            this.repositories[repoSpec.name] = repository;
        });
    }

    /**
     * Set up cross-region replication configuration
     */
    private setupReplication(args: ECRComponentArgs): void {
        const replicationRules = [{
            destinations: [{
                region: args.destinationRegion,
                registryId: pulumi.output(aws.getCallerIdentity()).accountId
            }]
        }];

        new aws.ecr.ReplicationConfiguration(
            `${this.getResourceName()}-replication`,
            {
                replicationConfiguration: {
                    rules: replicationRules
                }
            },
            {
                parent: this,
                provider: this.sourceProvider
            }
        );

        this.replicationConfiguration = pulumi.output({
            rules: replicationRules
        });
    }

    /**
     * Set up organization sharing for repositories that require it
     */
    private setupOrganizationSharing(args: ECRComponentArgs): void {
        args.repositories.forEach(repoSpec => {
            if (repoSpec.shareWithOrganization) {
                const repository = this.repositories[repoSpec.name];

                // Create repository policy for organization sharing
                const organizationId = pulumi.output(aws.organizations.getOrganization()).id;

                const policyDocument = organizationId.apply(orgId => JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Sid: "AllowOrganizationAccess",
                        Effect: "Allow",
                        Principal: "*",
                        Action: [
                            "ecr:GetDownloadUrlForLayer",
                            "ecr:BatchGetImage",
                            "ecr:BatchCheckLayerAvailability",
                            "ecr:GetRepositoryPolicy",
                            "ecr:DescribeRepositories",
                            "ecr:ListImages",
                            "ecr:DescribeImages"
                        ],
                        Condition: {
                            "ForAnyValue:StringEquals": {
                                "aws:PrincipalOrgID": orgId
                            }
                        }
                    }]
                }));

                new aws.ecr.RepositoryPolicy(
                    `${repoSpec.name}-org-policy`,
                    {
                        repository: repository.name,
                        policy: policyDocument
                    },
                    {
                        parent: this,
                        provider: this.sourceProvider
                    }
                );
            }
        });
    }

    /**
     * Get repository URL by name
     */
    public getRepositoryUrl(repositoryName: string): pulumi.Output<string> {
        const repository = this.repositories[repositoryName];
        if (!repository) {
            throw new Error(`Repository ${repositoryName} not found in ECR component`);
        }
        return repository.repositoryUrl;
    }

    /**
     * Get repository ARN by name
     */
    public getRepositoryArn(repositoryName: string): pulumi.Output<string> {
        const repository = this.repositories[repositoryName];
        if (!repository) {
            throw new Error(`Repository ${repositoryName} not found in ECR component`);
        }
        return repository.arn;
    }
}