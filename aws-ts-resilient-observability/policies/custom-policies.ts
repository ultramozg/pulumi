import * as policy from "@pulumi/policy";

// Custom policy to ensure all resources have required tags
const requireResourceTags: policy.ResourceValidationPolicy = {
    name: "require-resource-tags",
    description: "All resources must have required tags: Environment, Owner, Project",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
        const requiredTags = ["Environment", "Owner", "Project"];
        const resourceTags = args.props.tags || {};
        
        const missingTags = requiredTags.filter(tag => !resourceTags[tag]);
        
        if (missingTags.length > 0) {
            reportViolation(
                `Resource is missing required tags: ${missingTags.join(", ")}. ` +
                `All resources must have tags: ${requiredTags.join(", ")}`
            );
        }
    },
};

// Custom policy to enforce naming conventions
const enforceNamingConvention: policy.ResourceValidationPolicy = {
    name: "enforce-naming-convention",
    description: "Resources must follow naming convention: {environment}-{project}-{resource-type}-{identifier}",
    enforcementLevel: "advisory",
    validateResource: (args, reportViolation) => {
        const resourceName = args.name;
        const namingPattern = /^(dev|staging|prod)-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+$/;
        
        if (!namingPattern.test(resourceName)) {
            reportViolation(
                `Resource name "${resourceName}" does not follow naming convention. ` +
                `Expected format: {environment}-{project}-{resource-type}-{identifier}`
            );
        }
    },
};

// Custom policy to ensure RDS instances are encrypted
const requireRDSEncryption: policy.ResourceValidationPolicy = {
    name: "require-rds-encryption",
    description: "RDS instances must have encryption at rest enabled",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
        if (args.type === "aws:rds/instance:Instance" || args.type === "aws:rds/cluster:Cluster") {
            const storageEncrypted = args.props.storageEncrypted;
            
            if (!storageEncrypted) {
                reportViolation(
                    "RDS instance/cluster must have storage encryption enabled for data security"
                );
            }
        }
    },
};

// Custom policy to ensure EKS clusters have logging enabled
const requireEKSLogging: policy.ResourceValidationPolicy = {
    name: "require-eks-logging",
    description: "EKS clusters must have control plane logging enabled",
    enforcementLevel: "mandatory",
    validateResource: (args, reportViolation) => {
        if (args.type === "aws:eks/cluster:Cluster") {
            const enabledClusterLogTypes = args.props.enabledClusterLogTypes;
            
            if (!enabledClusterLogTypes || enabledClusterLogTypes.length === 0) {
                reportViolation(
                    "EKS cluster must have control plane logging enabled for monitoring and compliance"
                );
            }
        }
    },
};

// Custom policy to ensure VPCs have flow logs enabled
const requireVPCFlowLogs: policy.ResourceValidationPolicy = {
    name: "require-vpc-flow-logs",
    description: "VPCs must have flow logs enabled for network monitoring",
    enforcementLevel: "advisory",
    validateResource: (args, reportViolation) => {
        if (args.type === "aws:ec2/vpc:Vpc") {
            // This is advisory since flow logs are typically created separately
            // In a real implementation, you might check for the existence of flow log resources
            reportViolation(
                "Consider enabling VPC Flow Logs for network traffic monitoring and security analysis"
            );
        }
    },
};

export const customPolicies: policy.ResourceValidationPolicy[] = [
    requireResourceTags,
    enforceNamingConvention,
    requireRDSEncryption,
    requireEKSLogging,
    requireVPCFlowLogs,
];