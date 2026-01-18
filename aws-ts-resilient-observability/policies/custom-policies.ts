import * as policy from "@pulumi/policy";

export interface CustomPolicy {
    name: string;
    enforcementLevel: "mandatory" | "advisory";
    description: string;
    validateResource: policy.ResourceValidationPolicy["validateResource"];
}

// Custom policies for AWS infrastructure governance
export const customPolicies: CustomPolicy[] = [
    {
        name: "require-resource-tags",
        enforcementLevel: "mandatory",
        description: "Require all resources to have required tags",
        validateResource: (args, reportViolation) => {
            const requiredTags = ["Environment", "Project", "ManagedBy"];
            const tags = args.props.tags || {};

            requiredTags.forEach(tag => {
                if (!tags[tag]) {
                    reportViolation(`Resource is missing required tag: ${tag}`);
                }
            });
        }
    },
    {
        name: "enforce-naming-convention",
        enforcementLevel: "advisory",
        description: "Enforce naming conventions for resources",
        validateResource: (args, reportViolation) => {
            const name = args.props.name;
            if (name && !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
                reportViolation(`Resource name "${name}" does not follow naming convention (lowercase, alphanumeric with hyphens)`);
            }
        }
    },
    {
        name: "require-rds-encryption",
        enforcementLevel: "mandatory",
        description: "Require encryption for RDS databases",
        validateResource: (args, reportViolation) => {
            if (args.type === "aws:rds/instance:Instance" || args.type === "aws:rds/cluster:Cluster") {
                if (!args.props.storageEncrypted) {
                    reportViolation("RDS instance must have storage encryption enabled");
                }
            }
        }
    },
    {
        name: "require-eks-logging",
        enforcementLevel: "mandatory",
        description: "Require logging for EKS clusters",
        validateResource: (args, reportViolation) => {
            if (args.type === "aws:eks/cluster:Cluster") {
                const enabledLogTypes = args.props.enabledClusterLogTypes || [];
                const requiredLogTypes = ["api", "audit", "authenticator"];

                requiredLogTypes.forEach(logType => {
                    if (!enabledLogTypes.includes(logType)) {
                        reportViolation(`EKS cluster is missing required log type: ${logType}`);
                    }
                });
            }
        }
    },
    {
        name: "require-vpc-flow-logs",
        enforcementLevel: "advisory",
        description: "Require VPC flow logs to be enabled",
        validateResource: (args, reportViolation) => {
            if (args.type === "aws:ec2/vpc:Vpc") {
                // This is a simplified check - in practice, you'd check for a corresponding flow log resource
                if (!args.props.enableFlowLogs) {
                    reportViolation("VPC should have flow logs enabled for security monitoring");
                }
            }
        }
    }
];
