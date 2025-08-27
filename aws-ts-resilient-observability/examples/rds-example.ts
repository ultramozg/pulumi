import * as pulumi from "@pulumi/pulumi";
import { RDSGlobalComponent } from "../components/rds";

/**
 * Example: RDS Global Database with Aurora MySQL
 * 
 * This example demonstrates how to create an RDS Global Database
 * with Aurora MySQL engine across multiple regions.
 */

// Create RDS Global Database with Aurora MySQL
const rdsGlobal = new RDSGlobalComponent("example-rds-global", {
    globalClusterIdentifier: "example-global-cluster",
    engine: "aurora-mysql",
    engineVersion: "8.0.mysql_aurora.3.02.0",
    databaseName: "exampledb",
    masterUsername: "admin",
    masterPassword: pulumi.secret("MySecurePassword123!"),
    regions: [
        {
            region: "us-east-1",
            isPrimary: true,
            subnetIds: [
                "subnet-12345678", // Replace with actual subnet IDs
                "subnet-87654321"
            ],
            createSecurityGroup: true,
            securityGroupRules: [
                {
                    type: "ingress",
                    fromPort: 3306,
                    toPort: 3306,
                    protocol: "tcp",
                    cidrBlocks: ["10.0.0.0/16"],
                    description: "MySQL access from VPC"
                }
            ],
            instanceClass: "db.r6g.large",
            instanceCount: 2
        },
        {
            region: "us-west-2",
            isPrimary: false,
            subnetIds: [
                "subnet-abcdefgh", // Replace with actual subnet IDs
                "subnet-hgfedcba"
            ],
            createSecurityGroup: true,
            securityGroupRules: [
                {
                    type: "ingress",
                    fromPort: 3306,
                    toPort: 3306,
                    protocol: "tcp",
                    cidrBlocks: ["10.1.0.0/16"],
                    description: "MySQL access from VPC"
                }
            ],
            instanceClass: "db.r6g.large",
            instanceCount: 1
        }
    ],
    backupRetentionPeriod: 14,
    deletionProtection: true,
    storageEncrypted: true,
    tags: {
        Environment: "production",
        Application: "example-app"
    }
});

/**
 * Example: RDS Global Database with Aurora PostgreSQL
 */
const rdsPostgres = new RDSGlobalComponent("example-postgres-global", {
    globalClusterIdentifier: "example-postgres-cluster",
    engine: "aurora-postgresql",
    engineVersion: "15.4",
    databaseName: "postgresdb",
    masterUsername: "postgres",
    masterPassword: pulumi.secret("MySecurePostgresPassword123!"),
    regions: [
        {
            region: "eu-west-1",
            isPrimary: true,
            subnetIds: [
                "subnet-postgres1", // Replace with actual subnet IDs
                "subnet-postgres2"
            ],
            createSecurityGroup: true,
            securityGroupRules: [
                {
                    type: "ingress",
                    fromPort: 5432,
                    toPort: 5432,
                    protocol: "tcp",
                    cidrBlocks: ["10.2.0.0/16"],
                    description: "PostgreSQL access from VPC"
                }
            ],
            instanceClass: "db.r6g.xlarge",
            instanceCount: 2
        }
    ],
    backupRetentionPeriod: 7,
    deletionProtection: true,
    storageEncrypted: true,
    tags: {
        Environment: "development",
        Application: "postgres-app"
    }
});

/**
 * Example: Using existing subnet groups and security groups
 */
const rdsWithExistingResources = new RDSGlobalComponent("existing-resources-rds", {
    globalClusterIdentifier: "existing-resources-cluster",
    engine: "aurora-mysql",
    databaseName: "existingdb",
    masterUsername: "admin",
    masterPassword: pulumi.secret("ExistingResourcesPassword123!"),
    regions: [
        {
            region: "ap-southeast-1",
            isPrimary: true,
            subnetGroupName: "existing-subnet-group", // Use existing subnet group
            securityGroupIds: ["sg-existing123", "sg-existing456"], // Use existing security groups
            instanceClass: "db.r6g.large",
            instanceCount: 1
        }
    ],
    storageEncrypted: true,
    tags: {
        Environment: "staging",
        Application: "existing-resources-app"
    }
});

// Export outputs
export const mysqlGlobalClusterArn = rdsGlobal.globalClusterArn;
export const mysqlPrimaryEndpoint = rdsGlobal.primaryClusterEndpoint;
export const mysqlReaderEndpoint = rdsGlobal.primaryClusterReaderEndpoint;
export const mysqlRegionalClusters = rdsGlobal.regionalClusters;

export const postgresGlobalClusterArn = rdsPostgres.globalClusterArn;
export const postgresPrimaryEndpoint = rdsPostgres.primaryClusterEndpoint;

export const existingResourcesClusterArn = rdsWithExistingResources.globalClusterArn;

// Example of getting specific regional endpoints
export const usEast1Endpoint = rdsGlobal.getClusterEndpoint("us-east-1");
export const usWest2ReaderEndpoint = rdsGlobal.getClusterReaderEndpoint("us-west-2");