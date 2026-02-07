/**
 * @jest-environment node
 */
import * as pulumi from "@pulumi/pulumi";

import { KafkaMirrorMaker2Component } from "../../components/kafka/mirror-maker";

function promiseOutput<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise<T>((resolve) => output.apply(resolve));
}

describe("KafkaMirrorMaker2Component", () => {
    it("creates component with correct outputs", async () => {
        const component = new KafkaMirrorMaker2Component("test-mm2", {
            region: "us-east-1",
            kubeconfig: pulumi.output("{}"),
            localClusterAlias: "primary",
            localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
            remoteClusterAlias: "secondary",
            remoteBootstrapServers: pulumi.output("secondary-nlb.elb.amazonaws.com:9094"),
            topicsPattern: "events",
            enableMetrics: true,
        });

        const name = await promiseOutput(component.name);
        expect(name).toContain("mm2");

        expect(component.sourceCluster).toBe("secondary");
        expect(component.targetCluster).toBe("primary");
        expect(component.replicatedTopics).toBe("events");
    });

    it("sets sourceCluster to remote and targetCluster to local", async () => {
        const component = new KafkaMirrorMaker2Component("test-mm2-dir", {
            region: "us-west-2",
            kubeconfig: pulumi.output("{}"),
            localClusterAlias: "secondary",
            localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
            remoteClusterAlias: "primary",
            remoteBootstrapServers: pulumi.output("primary-nlb.elb.amazonaws.com:9094"),
            topicsPattern: "events",
        });

        expect(component.sourceCluster).toBe("primary");
        expect(component.targetCluster).toBe("secondary");
    });

    it("component instantiation with metrics does not throw", () => {
        expect(() => {
            new KafkaMirrorMaker2Component("test-mm2-metrics", {
                region: "us-east-1",
                kubeconfig: pulumi.output("{}"),
                localClusterAlias: "primary",
                localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
                remoteClusterAlias: "secondary",
                remoteBootstrapServers: pulumi.output("secondary-nlb.elb.amazonaws.com:9094"),
                topicsPattern: "events",
                enableMetrics: true,
            });
        }).not.toThrow();
    });

    it("component instantiation without metrics does not throw", () => {
        expect(() => {
            new KafkaMirrorMaker2Component("test-mm2-no-metrics", {
                region: "us-east-1",
                kubeconfig: pulumi.output("{}"),
                localClusterAlias: "primary",
                localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
                remoteClusterAlias: "secondary",
                remoteBootstrapServers: pulumi.output("secondary-nlb.elb.amazonaws.com:9094"),
                enableMetrics: false,
            });
        }).not.toThrow();
    });

    it("defaults topicsPattern to events", async () => {
        const component = new KafkaMirrorMaker2Component("test-mm2-default", {
            region: "us-east-1",
            kubeconfig: pulumi.output("{}"),
            localClusterAlias: "primary",
            localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
            remoteClusterAlias: "secondary",
            remoteBootstrapServers: pulumi.output("secondary-nlb.elb.amazonaws.com:9094"),
        });

        expect(component.replicatedTopics).toBe("events");
    });

    it("uses custom topicsPattern when provided", async () => {
        const component = new KafkaMirrorMaker2Component("test-mm2-custom", {
            region: "us-east-1",
            kubeconfig: pulumi.output("{}"),
            localClusterAlias: "primary",
            localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
            remoteClusterAlias: "secondary",
            remoteBootstrapServers: pulumi.output("secondary-nlb.elb.amazonaws.com:9094"),
            topicsPattern: "orders|payments",
        });

        expect(component.replicatedTopics).toBe("orders|payments");
    });

    it("accepts us-west-2 region", () => {
        expect(() => {
            new KafkaMirrorMaker2Component("test-mm2-west", {
                region: "us-west-2",
                kubeconfig: pulumi.output("{}"),
                localClusterAlias: "secondary",
                localBootstrapServers: "workload-kafka-kafka-bootstrap.kafka.svc:9092",
                remoteClusterAlias: "primary",
                remoteBootstrapServers: pulumi.output("primary-nlb.elb.amazonaws.com:9094"),
            });
        }).not.toThrow();
    });
});
