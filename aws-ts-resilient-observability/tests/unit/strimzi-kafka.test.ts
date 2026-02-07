/**
 * @jest-environment node
 */

// IMPORTANT: Must be called BEFORE any pulumi imports at module level.
// Since tests/setup.ts (setupFilesAfterEnv) calls setMocks in beforeEach,
// and setMocks can only be set once per process, we need a different approach.
// We override by using jest.config's setupFilesAfterEnv — but since we can't
// change that per-test, we instead hook into the global mock.

import * as pulumi from "@pulumi/pulumi";

// The global setup.ts calls setMocks via beforeEach, which means it's called
// before our component instantiation. We'll use the mock set by setup.ts and
// instead spy on pulumi internals to track resources.
//
// Alternative: We use a custom jest project config that skips setup.ts.

import { StrimziKafkaComponent } from "../../components/kafka/strimzi";

function promiseOutput<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise<T>((resolve) => output.apply(resolve));
}

// Since setMocks only works once, we track resources by wrapping
// the mock monitor. The setup.ts mock creates resources but doesn't track them.
// We access the internal mock monitor to inspect created resources.
//
// The approach: We inspect the resources after creation by checking Pulumi
// internals through the component's children.
//
// Actually, the simplest approach: use a describe-level wrapper that
// intercepts the global mock.

describe("StrimziKafkaComponent", () => {
    // We test by examining component properties and outputs,
    // which doesn't require resource tracking since the mock
    // from setup.ts handles resource creation.

    it("creates component with correct outputs", async () => {
        const component = new StrimziKafkaComponent("test-kafka", {
            region: "us-east-1",
            clusterName: "workload-kafka",
            clusterEndpoint: pulumi.output("https://eks.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
        });

        const clusterName = await promiseOutput(component.clusterName);
        expect(clusterName).toBe("workload-kafka");

        const bootstrapServers = await promiseOutput(component.bootstrapServers);
        expect(bootstrapServers).toBe("workload-kafka-kafka-bootstrap.kafka.svc:9092");

        expect(component.namespace).toBe("kafka");
        expect(component.metricsPort).toBe(9404);
    });

    it("sets empty NLB outputs when enableLoadBalancer is false", async () => {
        const component = new StrimziKafkaComponent("test-no-lb", {
            region: "us-east-1",
            clusterName: "workload-kafka",
            clusterEndpoint: pulumi.output("https://eks.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
            enableLoadBalancer: false,
        });

        const nlbDns = await promiseOutput(component.bootstrapNlbDnsName);
        expect(nlbDns).toBe("");
    });

    it("sets NLB outputs when enableLoadBalancer is true", async () => {
        const component = new StrimziKafkaComponent("test-lb", {
            region: "us-east-1",
            clusterName: "workload-kafka",
            clusterEndpoint: pulumi.output("https://eks.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
            enableLoadBalancer: true,
        });

        const nlbDns = await promiseOutput(component.bootstrapNlbDnsName);
        expect(nlbDns).not.toBe("");
        expect(nlbDns).toContain("workload-kafka");
    });

    it("accepts us-west-2 region", async () => {
        const component = new StrimziKafkaComponent("test-west", {
            region: "us-west-2",
            clusterName: "workload-kafka",
            clusterEndpoint: pulumi.output("https://eks-west.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
        });

        const clusterName = await promiseOutput(component.clusterName);
        expect(clusterName).toBe("workload-kafka");
    });

    it("component instantiation does not throw", () => {
        expect(() => {
            new StrimziKafkaComponent("test-no-throw", {
                region: "us-east-1",
                clusterName: "workload-kafka",
                clusterEndpoint: pulumi.output("https://eks.example.com"),
                clusterCertificateAuthority: pulumi.output("base64cert"),
                kubeconfig: pulumi.output("{}"),
                enableMetrics: true,
                enableLoadBalancer: true,
                topics: [
                    {
                        name: "events",
                        partitions: 3,
                        replicas: 1,
                        config: { "retention.ms": "86400000" },
                    },
                ],
            });
        }).not.toThrow();
    });

    it("component with metrics disabled does not throw", () => {
        expect(() => {
            new StrimziKafkaComponent("test-no-metrics", {
                region: "us-east-1",
                clusterName: "workload-kafka",
                clusterEndpoint: pulumi.output("https://eks.example.com"),
                clusterCertificateAuthority: pulumi.output("base64cert"),
                kubeconfig: pulumi.output("{}"),
                enableMetrics: false,
            });
        }).not.toThrow();
    });

    it("component with no loadbalancer does not throw", () => {
        expect(() => {
            new StrimziKafkaComponent("test-no-lb-safe", {
                region: "us-east-1",
                clusterName: "workload-kafka",
                clusterEndpoint: pulumi.output("https://eks.example.com"),
                clusterCertificateAuthority: pulumi.output("base64cert"),
                kubeconfig: pulumi.output("{}"),
                enableLoadBalancer: false,
            });
        }).not.toThrow();
    });

    it("bootstrapServers contains cluster name and port", async () => {
        const component = new StrimziKafkaComponent("test-bootstrap", {
            region: "us-east-1",
            clusterName: "my-cluster",
            clusterEndpoint: pulumi.output("https://eks.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
        });

        const bootstrapServers = await promiseOutput(component.bootstrapServers);
        expect(bootstrapServers).toBe("my-cluster-kafka-bootstrap.kafka.svc:9092");
    });

    it("uses custom namespace when provided", () => {
        const component = new StrimziKafkaComponent("test-ns", {
            region: "us-east-1",
            clusterName: "workload-kafka",
            clusterEndpoint: pulumi.output("https://eks.example.com"),
            clusterCertificateAuthority: pulumi.output("base64cert"),
            kubeconfig: pulumi.output("{}"),
            namespace: "custom-kafka",
        });

        expect(component.namespace).toBe("custom-kafka");
    });
});
