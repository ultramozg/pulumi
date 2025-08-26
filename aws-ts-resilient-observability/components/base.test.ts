import * as pulumi from "@pulumi/pulumi";
import { BaseAWSComponent, ComponentValidationError, validateRequired, validateRegion } from "./base";

// Mock implementation for testing
class TestComponent extends BaseAWSComponent {
    constructor(name: string, args: { region?: string; tags?: { [key: string]: string } }) {
        super("test:component:TestComponent", name, args);
    }
}

describe("BaseAWSComponent", () => {
    beforeEach(() => {
        // Pulumi mocks are set up in tests/setup.ts
    });

    test("should create component with default values", async () => {
        const component = new TestComponent("test-component", {});
        
        expect(component).toBeDefined();
        // The region and tags are set internally and can be tested through outputs
    });

    test("should create component with custom region and tags", async () => {
        const customTags = { Environment: "test", Project: "aws-components" };
        const component = new TestComponent("test-component", {
            region: "us-west-2",
            tags: customTags
        });
        
        expect(component).toBeDefined();
    });

    test("should merge tags correctly", async () => {
        const customTags = { Environment: "test" };
        const component = new TestComponent("test-component", {
            tags: customTags
        });
        
        // Test the protected mergeTags method through inheritance
        class TestableComponent extends TestComponent {
            public testMergeTags(resourceTags?: { [key: string]: string }) {
                return this.mergeTags(resourceTags);
            }
        }
        
        const testableComponent = new TestableComponent("testable", { tags: customTags });
        const mergedTags = testableComponent.testMergeTags({ Resource: "test-resource" });
        
        expect(mergedTags).toEqual({
            Component: "test:component:TestComponent",
            ManagedBy: "Pulumi",
            Environment: "test",
            Resource: "test-resource"
        });
    });
});

describe("Validation utilities", () => {
    test("validateRequired should throw error for undefined values", () => {
        expect(() => {
            validateRequired(undefined, "testField", "TestComponent");
        }).toThrow(ComponentValidationError);
        
        expect(() => {
            validateRequired(null, "testField", "TestComponent");
        }).toThrow(ComponentValidationError);
    });

    test("validateRequired should return value for defined values", () => {
        const testValue = "test-value";
        const result = validateRequired(testValue, "testField", "TestComponent");
        expect(result).toBe(testValue);
    });

    test("validateRegion should validate region format", () => {
        // Valid regions
        expect(() => validateRegion("us-east-1", "TestComponent")).not.toThrow();
        expect(() => validateRegion("eu-west-2", "TestComponent")).not.toThrow();
        expect(() => validateRegion("ap-southeast-1", "TestComponent")).not.toThrow();
        
        // Invalid regions
        expect(() => validateRegion("invalid-region", "TestComponent")).toThrow(ComponentValidationError);
        expect(() => validateRegion("us-east", "TestComponent")).toThrow(ComponentValidationError);
        expect(() => validateRegion("", "TestComponent")).toThrow(ComponentValidationError);
    });
});