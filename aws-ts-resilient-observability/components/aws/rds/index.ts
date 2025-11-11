import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { BaseAWSComponent, BaseComponentArgs, validateRequired, validateRegion, ComponentValidationError } from "../../shared/base";
import { SecurityGroupRule } from "../../shared/interfaces";

/**
 * Security group rule specification for RDS
 */
export interface RDSSecurityGroupRule extends SecurityGroupRule {
    description?: string;
}

/**
 * Regional configuration for RDS Global Database
 */
export interface RDSRegionConfig {
    region: string;
    isPrimary: boolean;
    subnetGroupName?: string;
    subnetIds?: string[];
    securityGroupIds?: string[];
    createSecurityGroup?: boolean;
    securityGroupRules?: RDSSecurityGroupRule[];
    instanceClass?: string;
    instanceCount?: number;
}

/**
 * Arguments for RDS Global Database Component
 */
export interface RDSGlobalComponentArgs extends BaseComponentArgs {
    globalClusterIdentifier: string;
    engine: 'aurora-mysql' | 'aurora-postgresql';
    engineVersion?: string;
    databaseName?: string;
    masterUsername?: string;
    masterPassword?: pulumi.Input<string>;
    regions: RDSRegionConfig[];
    backupRetentionPeriod?: number;
    preferredBackupWindow?: string;
    preferredMaintenanceWindow?: string;
    deletionProtection?: boolean;
    storageEncrypted?: boolean;
    kmsKeyId?: string;
}

/**
 * Outputs from RDS Global Database Component
 */
export interface RDSGlobalComponentOutputs {
    globalClusterArn: pulumi.Output<string>;
    globalClusterIdentifier: pulumi.Output<string>;
    primaryClusterEndpoint: pulumi.Output<string>;
    primaryClusterReaderEndpoint: pulumi.Output<string>;
    regionalClusters: pulumi.Output<{ [region: string]: any }>;
    securityGroups: pulumi.Output<{ [region: string]: string }>;
    subnetGroups: pulumi.Output<{ [region: string]: string }>;
}

/**
 * RDS Global Database Component with Aurora MySQL/PostgreSQL support
 */
export class RDSGlobalComponent extends BaseAWSComponent implements RDSGlobalComponentOutputs {
    public readonly globalClusterArn!: pulumi.Output<string>;
    public readonly globalClusterIdentifier!: pulumi.Output<string>;
    public readonly primaryClusterEndpoint!: pulumi.Output<string>;
    public readonly primaryClusterReaderEndpoint!: pulumi.Output<string>;
    public readonly regionalClusters!: pulumi.Output<{ [region: string]: any }>;
    public readonly securityGroups!: pulumi.Output<{ [region: string]: string }>;
    public readonly subnetGroups!: pulumi.Output<{ [region: string]: string }>;

    private readonly globalCluster: aws.rds.GlobalCluster;
    private readonly clusters: { [region: string]: aws.rds.Cluster } = {};
    private readonly createdSecurityGroups: { [region: string]: aws.ec2.SecurityGroup } = {};
    private readonly createdSubnetGroups: { [region: string]: aws.rds.SubnetGroup } = {};
    private readonly providers: { [region: string]: aws.Provider } = {};

    constructor(
        name: string,
        args: RDSGlobalComponentArgs,
        opts?: pulumi.ComponentResourceOptions
    ) {
        super("custom:aws:RDSGlobal", name, args, opts);

        // Validate required arguments
        this.validateArguments(args);

        // Create providers for each region
        this.createProviders(args);

        // Create global cluster
        this.globalCluster = this.createGlobalCluster(args);

        // Create regional clusters
        this.createRegionalClusters(args);

        // Set up outputs
        this.setupOutputs(args);

        // Register outputs
        this.registerOutputs({
            globalClusterArn: this.globalClusterArn,
            globalClusterIdentifier: this.globalClusterIdentifier,
            primaryClusterEndpoint: this.primaryClusterEndpoint,
            primaryClusterReaderEndpoint: this.primaryClusterReaderEndpoint,
            regionalClusters: this.regionalClusters,
            securityGroups: this.securityGroups,
            subnetGroups: this.subnetGroups
        });
    }

    /**
     * Validate component arguments
     */
    private validateArguments(args: RDSGlobalComponentArgs): void {
        validateRequired(args.globalClusterIdentifier, "globalClusterIdentifier", "RDSGlobalComponent");
        validateRequired(args.engine, "engine", "RDSGlobalComponent");
        validateRequired(args.regions, "regions", "RDSGlobalComponent");

        if (args.regions.length === 0) {
            throw new ComponentValidationError("RDSGlobalComponent", "At least one region must be specified");
        }

        const primaryRegions = args.regions.filter(r => r.isPrimary);
        if (primaryRegions.length !== 1) {
            throw new ComponentValidationError("RDSGlobalComponent", "Exactly one region must be marked as primary");
        }

        // Validate regions
        args.regions.forEach(regionConfig => {
            validateRegion(regionConfig.region, "RDSGlobalComponent");
            
            if (regionConfig.createSecurityGroup && (!regionConfig.subnetIds || regionConfig.subnetIds.length === 0)) {
                throw new ComponentValidationError(
                    "RDSGlobalComponent", 
                    `Region ${regionConfig.region}: subnetIds must be provided when createSecurityGroup is true`
                );
            }
        });

        // Validate engine
        if (!['aurora-mysql', 'aurora-postgresql'].includes(args.engine)) {
            throw new ComponentValidationError("RDSGlobalComponent", "Engine must be 'aurora-mysql' or 'aurora-postgresql'");
        }
    }

    /**
     * Create AWS providers for each region
     */
    private createProviders(args: RDSGlobalComponentArgs): void {
        args.regions.forEach(regionConfig => {
            this.providers[regionConfig.region] = this.createProvider(regionConfig.region);
        });
    }

    /**
     * Create the global cluster
     */
    private createGlobalCluster(args: RDSGlobalComponentArgs): aws.rds.GlobalCluster {
        const primaryRegion = args.regions.find(r => r.isPrimary)!;
        
        return new aws.rds.GlobalCluster(
            `${args.globalClusterIdentifier}-global`,
            {
                globalClusterIdentifier: args.globalClusterIdentifier,
                engine: args.engine,
                engineVersion: args.engineVersion,
                databaseName: args.databaseName,
                deletionProtection: args.deletionProtection || true,
                storageEncrypted: args.storageEncrypted !== false, // Default to true
                tags: this.mergeTags()
            },
            {
                parent: this,
                provider: this.providers[primaryRegion.region]
            }
        );
    }

    /**
     * Create regional clusters
     */
    private createRegionalClusters(args: RDSGlobalComponentArgs): void {
        args.regions.forEach(regionConfig => {
            // Create subnet group if needed
            let subnetGroupName: pulumi.Input<string>;
            if (regionConfig.subnetGroupName) {
                subnetGroupName = regionConfig.subnetGroupName;
            } else if (regionConfig.subnetIds) {
                const subnetGroup = this.createSubnetGroup(regionConfig, args);
                this.createdSubnetGroups[regionConfig.region] = subnetGroup;
                subnetGroupName = subnetGroup.name;
            } else {
                throw new ComponentValidationError(
                    "RDSGlobalComponent", 
                    `Region ${regionConfig.region}: Either subnetGroupName or subnetIds must be provided`
                );
            }

            // Create security group if needed
            let securityGroupIds: pulumi.Input<string[]>;
            if (regionConfig.securityGroupIds) {
                securityGroupIds = regionConfig.securityGroupIds;
            } else if (regionConfig.createSecurityGroup) {
                const securityGroup = this.createSecurityGroup(regionConfig, args);
                this.createdSecurityGroups[regionConfig.region] = securityGroup;
                securityGroupIds = pulumi.output([securityGroup.id]);
            } else {
                throw new ComponentValidationError(
                    "RDSGlobalComponent", 
                    `Region ${regionConfig.region}: Either securityGroupIds or createSecurityGroup must be specified`
                );
            }

            // Create cluster
            const cluster = this.createCluster(regionConfig, args, subnetGroupName, securityGroupIds);
            this.clusters[regionConfig.region] = cluster;

            // Create cluster instances
            this.createClusterInstances(regionConfig, args, cluster);
        });
    }

    /**
     * Create subnet group for a region
     */
    private createSubnetGroup(regionConfig: RDSRegionConfig, args: RDSGlobalComponentArgs): aws.rds.SubnetGroup {
        return new aws.rds.SubnetGroup(
            `${args.globalClusterIdentifier}-${regionConfig.region}-subnet-group`,
            {
                name: `${args.globalClusterIdentifier}-${regionConfig.region}-subnet-group`,
                subnetIds: regionConfig.subnetIds!,
                tags: this.mergeTags({
                    Name: `${args.globalClusterIdentifier}-${regionConfig.region}-subnet-group`,
                    Region: regionConfig.region
                })
            },
            {
                parent: this,
                provider: this.providers[regionConfig.region]
            }
        );
    }

    /**
     * Create security group for a region
     */
    private createSecurityGroup(regionConfig: RDSRegionConfig, args: RDSGlobalComponentArgs): aws.ec2.SecurityGroup {
        // Get VPC ID from first subnet
        const vpcId = pulumi.output(aws.ec2.getSubnet({
            id: regionConfig.subnetIds![0]
        }, { provider: this.providers[regionConfig.region] })).vpcId;

        const securityGroup = new aws.ec2.SecurityGroup(
            `${args.globalClusterIdentifier}-${regionConfig.region}-sg`,
            {
                name: `${args.globalClusterIdentifier}-${regionConfig.region}-sg`,
                description: `Security group for RDS Global Database ${args.globalClusterIdentifier} in ${regionConfig.region}`,
                vpcId: vpcId,
                tags: this.mergeTags({
                    Name: `${args.globalClusterIdentifier}-${regionConfig.region}-sg`,
                    Region: regionConfig.region
                })
            },
            {
                parent: this,
                provider: this.providers[regionConfig.region]
            }
        );

        // Create security group rules
        if (regionConfig.securityGroupRules) {
            regionConfig.securityGroupRules.forEach((rule, index) => {
                const ruleResource = rule.type === 'ingress' 
                    ? aws.ec2.SecurityGroupRule 
                    : aws.ec2.SecurityGroupRule;

                new ruleResource(
                    `${args.globalClusterIdentifier}-${regionConfig.region}-sg-rule-${index}`,
                    {
                        type: rule.type,
                        fromPort: rule.fromPort,
                        toPort: rule.toPort,
                        protocol: rule.protocol,
                        cidrBlocks: rule.cidrBlocks,
                        sourceSecurityGroupId: rule.securityGroupIds?.[0],
                        securityGroupId: securityGroup.id,
                        description: rule.description
                    },
                    {
                        parent: this,
                        provider: this.providers[regionConfig.region]
                    }
                );
            });
        } else {
            // Default rule: Allow MySQL/PostgreSQL access from VPC CIDR
            const defaultPort = args.engine === 'aurora-mysql' ? 3306 : 5432;
            
            new aws.ec2.SecurityGroupRule(
                `${args.globalClusterIdentifier}-${regionConfig.region}-sg-default-rule`,
                {
                    type: "ingress",
                    fromPort: defaultPort,
                    toPort: defaultPort,
                    protocol: "tcp",
                    cidrBlocks: ["10.0.0.0/8"], // Default to private IP ranges
                    securityGroupId: securityGroup.id,
                    description: `Default ${args.engine} access`
                },
                {
                    parent: this,
                    provider: this.providers[regionConfig.region]
                }
            );
        }

        return securityGroup;
    }

    /**
     * Create RDS cluster for a region
     */
    private createCluster(
        regionConfig: RDSRegionConfig, 
        args: RDSGlobalComponentArgs, 
        subnetGroupName: pulumi.Input<string>,
        securityGroupIds: pulumi.Input<string[]>
    ): aws.rds.Cluster {
        const clusterArgs: aws.rds.ClusterArgs = {
            clusterIdentifier: `${args.globalClusterIdentifier}-${regionConfig.region}`,
            engine: args.engine,
            engineVersion: args.engineVersion,
            dbSubnetGroupName: subnetGroupName,
            vpcSecurityGroupIds: securityGroupIds,
            storageEncrypted: args.storageEncrypted !== false,
            kmsKeyId: args.kmsKeyId,
            tags: this.mergeTags({
                Name: `${args.globalClusterIdentifier}-${regionConfig.region}`,
                Region: regionConfig.region,
                IsPrimary: regionConfig.isPrimary.toString()
            })
        };

        if (regionConfig.isPrimary) {
            // Primary cluster
            clusterArgs.globalClusterIdentifier = this.globalCluster.id;
            clusterArgs.databaseName = args.databaseName;
            clusterArgs.masterUsername = args.masterUsername;
            clusterArgs.masterPassword = args.masterPassword;
        } else {
            // Secondary cluster
            clusterArgs.globalClusterIdentifier = this.globalCluster.id;
            // Secondary clusters don't need master credentials
        }

        return new aws.rds.Cluster(
            `${args.globalClusterIdentifier}-${regionConfig.region}-cluster`,
            clusterArgs,
            {
                parent: this,
                provider: this.providers[regionConfig.region],
                dependsOn: regionConfig.isPrimary ? [this.globalCluster] : [this.globalCluster]
            }
        );
    }

    /**
     * Create cluster instances for a region
     */
    private createClusterInstances(regionConfig: RDSRegionConfig, args: RDSGlobalComponentArgs, cluster: aws.rds.Cluster): void {
        const instanceCount = regionConfig.instanceCount || 1;
        const instanceClass = regionConfig.instanceClass || "db.r6g.large";

        for (let i = 0; i < instanceCount; i++) {
            new aws.rds.ClusterInstance(
                `${args.globalClusterIdentifier}-${regionConfig.region}-instance-${i}`,
                {
                    identifier: `${args.globalClusterIdentifier}-${regionConfig.region}-${i}`,
                    clusterIdentifier: cluster.id,
                    instanceClass: instanceClass,
                    engine: args.engine,
                    engineVersion: args.engineVersion,
                    tags: this.mergeTags({
                        Name: `${args.globalClusterIdentifier}-${regionConfig.region}-${i}`,
                        Region: regionConfig.region,
                        InstanceIndex: i.toString()
                    })
                },
                {
                    parent: this,
                    provider: this.providers[regionConfig.region]
                }
            );
        }
    }

    /**
     * Set up component outputs
     */
    private setupOutputs(args: RDSGlobalComponentArgs): void {
        (this as any).globalClusterArn = this.globalCluster.arn;
        (this as any).globalClusterIdentifier = this.globalCluster.globalClusterIdentifier;

        // Find primary cluster for endpoints
        const primaryRegion = args.regions.find(r => r.isPrimary)!;
        const primaryCluster = this.clusters[primaryRegion.region];
        
        (this as any).primaryClusterEndpoint = primaryCluster.endpoint;
        (this as any).primaryClusterReaderEndpoint = primaryCluster.readerEndpoint;

        // Regional clusters output
        const regionalClustersOutput = pulumi.all(
            Object.entries(this.clusters).map(([region, cluster]) => ({
                region,
                data: {
                    clusterIdentifier: cluster.clusterIdentifier,
                    endpoint: cluster.endpoint,
                    readerEndpoint: cluster.readerEndpoint,
                    arn: cluster.arn
                }
            }))
        ).apply(clusters => {
            const result: { [region: string]: any } = {};
            clusters.forEach(({ region, data }) => {
                result[region] = data;
            });
            return result;
        });
        (this as any).regionalClusters = regionalClustersOutput;

        // Security groups output
        const securityGroupsOutput = pulumi.all(
            Object.entries(this.createdSecurityGroups).map(([region, sg]) => ({
                region,
                id: sg.id
            }))
        ).apply(sgs => {
            const result: { [region: string]: string } = {};
            sgs.forEach(({ region, id }) => {
                result[region] = id;
            });
            return result;
        });
        (this as any).securityGroups = securityGroupsOutput;

        // Subnet groups output
        const subnetGroupsOutput = pulumi.all(
            Object.entries(this.createdSubnetGroups).map(([region, sg]) => ({
                region,
                name: sg.name
            }))
        ).apply(sgs => {
            const result: { [region: string]: string } = {};
            sgs.forEach(({ region, name }) => {
                result[region] = name;
            });
            return result;
        });
        (this as any).subnetGroups = subnetGroupsOutput;
    }

    /**
     * Get cluster endpoint for a specific region
     */
    public getClusterEndpoint(region: string): pulumi.Output<string> {
        const cluster = this.clusters[region];
        if (!cluster) {
            throw new Error(`Cluster not found for region ${region}`);
        }
        return cluster.endpoint;
    }

    /**
     * Get cluster reader endpoint for a specific region
     */
    public getClusterReaderEndpoint(region: string): pulumi.Output<string> {
        const cluster = this.clusters[region];
        if (!cluster) {
            throw new Error(`Cluster not found for region ${region}`);
        }
        return cluster.readerEndpoint;
    }
}