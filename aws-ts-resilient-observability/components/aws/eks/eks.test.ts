import { EKSComponent, EKSComponentArgs } from "./index";

describe("EKSComponent", () => {
    it("should create component without throwing", () => {
        const args: EKSComponentArgs = {
            clusterName: "test-cluster",
            region: "us-east-1",
            subnetIds: ["subnet-12345", "subnet-67890"],
            adminRoleArn: "arn:aws:iam::123456789012:role/test-admin-role"
        };

        expect(() => {
            new EKSComponent("test-eks", args);
        }).not.toThrow();
    });

    it("should use component name as default cluster name", () => {
        const args: EKSComponentArgs = {
            region: "us-east-1",
            subnetIds: ["subnet-12345", "subnet-67890"],
            adminRoleArn: "arn:aws:iam::123456789012:role/test-admin-role"
        };

        expect(() => {
            new EKSComponent("my-cluster-name", args);
        }).not.toThrow();
    });

    it("should validate region format", () => {
        const args: EKSComponentArgs = {
            clusterName: "test-cluster",
            region: "invalid-region",
            subnetIds: ["subnet-12345"],
            adminRoleArn: "arn:aws:iam::123456789012:role/test-admin-role"
        };

        expect(() => {
            new EKSComponent("test-region-eks", args);
        }).toThrow("Invalid region: expected AWS region format (e.g., us-east-1), got string (invalid-region)");
    });
});
