/**
 * Utility interface for testing policy violations
 */
export interface PolicyTestCase {
    name: string;
    resourceType: string;
    resourceName: string;
    props: any;
    expectedViolations?: string[];
    shouldPass?: boolean;
}

/**
 * Mock implementation of reportViolation for testing
 */
export class MockViolationReporter {
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

/**
 * Simplified test function that directly tests policy validation logic
 */
export function testPolicyValidation(
    validateFunction: (args: any, reportViolation: (message: string) => void) => void,
    testCase: PolicyTestCase
): MockViolationReporter {
    const reporter = new MockViolationReporter();
    
    const args = {
        type: testCase.resourceType,
        name: testCase.resourceName,
        props: testCase.props,
        urn: `urn:pulumi:test::test::${testCase.resourceType}::${testCase.resourceName}`,
    };

    validateFunction(args, reporter.reportViolation);
    
    return reporter;
}

/**
 * Helper to create test resource props with common defaults
 */
export function createTestResourceProps(overrides: any = {}): any {
    return {
        tags: {
            Environment: "test",
            Owner: "test-team",
            Project: "test-project",
        },
        ...overrides,
    };
}



/**
 * Helper to create RDS instance test props
 */
export function createRDSInstanceProps(overrides: any = {}): any {
    return createTestResourceProps({
        storageEncrypted: true,
        engine: "mysql",
        instanceClass: "db.t3.micro",
        ...overrides,
    });
}

/**
 * Helper to create EKS cluster test props
 */
export function createEKSClusterProps(overrides: any = {}): any {
    return createTestResourceProps({
        enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"],
        version: "1.27",
        ...overrides,
    });
}

/**
 * Helper to create VPC test props
 */
export function createVPCProps(overrides: any = {}): any {
    return createTestResourceProps({
        cidrBlock: "10.0.0.0/16",
        enableDnsHostnames: true,
        enableDnsSupport: true,
        ...overrides,
    });
}