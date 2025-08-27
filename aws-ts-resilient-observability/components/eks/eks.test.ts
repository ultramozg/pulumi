import { EKSComponent, EKSComponentArgs } from "./index";

describe("EKSComponent", () => {
    it("should create component without throwing", () => {
        const args: EKSComponentArgs = {
            clusterName: "test-cluster",
            region: "us-east-1",
            subnetIds: ["subnet-12345", "subnet-67890"]
        };

        expect(() => {
            new EKSComponent("test-eks", args);
        }).not.toThrow();
    });

    it("should throw error for missing cluster name", () => {
        expect(() => {
            new EKSComponent("test-error-eks", {} as EKSComponentArgs);
        }).toThrow("EKSComponent: clusterName is required");
    });

    it("should validate region format", () => {
        const args: EKSComponentArgs = {
            clusterName: "test-cluster",
            region: "invalid-region",
            subnetIds: ["subnet-12345"]
        };

        expect(() => {
            new EKSComponent("test-region-eks", args);
        }).toThrow("Invalid region: expected AWS region format (e.g., us-east-1), got string (invalid-region)");
    });
});
