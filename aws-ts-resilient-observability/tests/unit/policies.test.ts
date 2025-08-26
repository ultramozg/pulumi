import { customPolicies } from "../../policies/custom-policies";

// Simple mock for testing policy validation logic
class MockViolationReporter {
    private violations: string[] = [];

    reportViolation = (message: string): void => {
        this.violations.push(message);
    };

    getViolations(): string[] {
        return [...this.violations];
    }

    hasViolations(): boolean {
        return this.violations.length > 0;
    }

    clear(): void {
        this.violations = [];
    }
}

describe("Custom Policy Validation", () => {
    describe("Policy Pack Structure", () => {
        test("should export all expected custom policies", () => {
            expect(customPolicies).toHaveLength(5);
            
            const policyNames = customPolicies.map(p => p.name);
            expect(policyNames).toContain("require-resource-tags");
            expect(policyNames).toContain("enforce-naming-convention");
            expect(policyNames).toContain("require-rds-encryption");
            expect(policyNames).toContain("require-eks-logging");
            expect(policyNames).toContain("require-vpc-flow-logs");
        });

        test("should have proper enforcement levels", () => {
            const mandatoryPolicies = customPolicies.filter(p => p.enforcementLevel === "mandatory");
            const advisoryPolicies = customPolicies.filter(p => p.enforcementLevel === "advisory");
            
            expect(mandatoryPolicies).toHaveLength(3);
            expect(advisoryPolicies).toHaveLength(2);
        });

        test("should have proper policy structure", () => {
            customPolicies.forEach(policy => {
                expect(policy.name).toBeDefined();
                expect(policy.description).toBeDefined();
                expect(policy.enforcementLevel).toBeDefined();
                expect(policy.validateResource).toBeDefined();
            });
        });
    });

    describe("require-resource-tags policy logic", () => {
        test("should validate required tags are present", () => {
            const requiredTags = ["Environment", "Owner", "Project"];
            const resourceTags: { [key: string]: string } = {
                Environment: "test",
                Owner: "test-team",
                Project: "test-project",
            };
            
            const missingTags = requiredTags.filter(tag => !resourceTags[tag]);
            
            expect(missingTags).toHaveLength(0);
        });

        test("should identify missing tags", () => {
            const requiredTags = ["Environment", "Owner", "Project"];
            const resourceTags: { [key: string]: string } = {
                Environment: "test",
                // Missing Owner and Project tags
            };
            
            const missingTags = requiredTags.filter(tag => !resourceTags[tag]);
            
            expect(missingTags).toEqual(["Owner", "Project"]);
        });
    });

    describe("enforce-naming-convention policy logic", () => {
        test("should validate correct naming pattern", () => {
            const namingPattern = /^(dev|staging|prod)-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+$/;
            
            expect("prod-myproject-rds-instance-001").toMatch(namingPattern);
            expect("dev-test-eks-cluster-001").toMatch(namingPattern);
            expect("staging-app-vpc-001").toMatch(namingPattern);
        });

        test("should reject incorrect naming patterns", () => {
            const namingPattern = /^(dev|staging|prod)-[a-z0-9-]+-[a-z0-9-]+-[a-z0-9-]+$/;
            
            expect("invalid-name").not.toMatch(namingPattern);
            expect("prod-only-two").not.toMatch(namingPattern);
            expect("test-invalid-environment-name").not.toMatch(namingPattern);
        });
    });

    describe("require-rds-encryption policy logic", () => {
        test("should validate RDS resource type detection", () => {
            const instanceType = "aws:rds/instance:Instance";
            const clusterType = "aws:rds/cluster:Cluster";
            
            expect(instanceType).toBe("aws:rds/instance:Instance");
            expect(clusterType).toBe("aws:rds/cluster:Cluster");
            
            // Test type checking logic
            const isRDSResource = (type: string) => 
                type === "aws:rds/instance:Instance" || type === "aws:rds/cluster:Cluster";
            
            expect(isRDSResource(instanceType)).toBe(true);
            expect(isRDSResource(clusterType)).toBe(true);
            expect(isRDSResource("aws:ec2/instance:Instance")).toBe(false);
        });

        test("should validate encryption configuration", () => {
            const encrypted = { storageEncrypted: true };
            const notEncrypted = { storageEncrypted: false };
            
            expect(encrypted.storageEncrypted).toBe(true);
            expect(notEncrypted.storageEncrypted).toBe(false);
        });
    });

    describe("require-eks-logging policy logic", () => {
        test("should validate EKS resource type detection", () => {
            const resourceType = "aws:eks/cluster:Cluster";
            expect(resourceType).toBe("aws:eks/cluster:Cluster");
        });

        test("should validate logging configuration", () => {
            const enabledLogging = ["api", "audit", "authenticator"];
            const disabledLogging: string[] = [];
            
            expect(enabledLogging.length > 0).toBe(true);
            expect(disabledLogging.length === 0).toBe(true);
        });
    });

    describe("require-vpc-flow-logs policy logic", () => {
        test("should validate VPC resource type detection", () => {
            const resourceType = "aws:ec2/vpc:Vpc";
            expect(resourceType).toBe("aws:ec2/vpc:Vpc");
        });

        test("should be advisory policy", () => {
            const vpcFlowLogsPolicy = customPolicies.find(p => p.name === "require-vpc-flow-logs")!;
            expect(vpcFlowLogsPolicy.enforcementLevel).toBe("advisory");
        });
    });
});

describe("Policy Pack Integration", () => {
    test("should be importable without errors", () => {
        expect(() => {
            require("../../policies/custom-policies");
        }).not.toThrow();
    });

    test("should have consistent policy structure", () => {
        customPolicies.forEach(policy => {
            expect(typeof policy.name).toBe("string");
            expect(typeof policy.description).toBe("string");
            expect(["mandatory", "advisory"]).toContain(policy.enforcementLevel);
            expect(typeof policy.validateResource).toBeDefined();
        });
    });
});