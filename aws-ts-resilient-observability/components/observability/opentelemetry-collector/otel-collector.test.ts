import { OTelCollectorComponent, OTelCollectorComponentArgs } from "./index";

describe("OTelCollectorComponent", () => {
    const mockClusterName = "test-cluster";
    const mockClusterEndpoint = "https://test-endpoint.eks.amazonaws.com";
    const mockClusterCA = "LS0tLS1CRUdJTi...";

    it("should create OTel Collector in daemonset mode with default configuration", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset",
            helm: {
                chartVersion: "0.111.0",
                namespace: "opentelemetry"
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-daemonset", args);
        }).not.toThrow();
    });

    it("should create OTel Collector in deployment mode with replicas", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "deployment",
            helm: {
                chartVersion: "0.111.0",
                namespace: "opentelemetry",
                replicas: 3
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-deployment", args);
        }).not.toThrow();
    });

    it("should create OTel Collector with all backends configured", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset",
            tempoEndpoint: "http://tempo-distributor.tempo.svc.cluster.local:4317",
            mimirEndpoint: "http://mimir-distributor.mimir.svc.cluster.local:8080",
            lokiEndpoint: "http://loki-gateway.loki.svc.cluster.local",
            helm: {
                namespace: "opentelemetry"
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-backends", args);
        }).not.toThrow();
    });

    it("should create OTel Collector with custom receivers", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset",
            receivers: [
                {
                    name: "jaeger",
                    config: {
                        protocols: {
                            grpc: {
                                endpoint: "0.0.0.0:14250"
                            },
                            thrift_http: {
                                endpoint: "0.0.0.0:14268"
                            }
                        }
                    }
                },
                {
                    name: "zipkin",
                    config: {
                        endpoint: "0.0.0.0:9411"
                    }
                }
            ],
            helm: {
                namespace: "opentelemetry"
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-receivers", args);
        }).not.toThrow();
    });

    it("should create OTel Collector with custom processors", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-west-2",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "deployment",
            processors: [
                {
                    name: "attributes",
                    config: {
                        actions: [
                            {
                                key: "environment",
                                value: "production",
                                action: "insert"
                            }
                        ]
                    }
                },
                {
                    name: "filter",
                    config: {
                        traces: {
                            span: [
                                'attributes["http.url"] == "/health"'
                            ]
                        }
                    }
                }
            ],
            helm: {
                namespace: "opentelemetry",
                replicas: 2
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-processors", args);
        }).not.toThrow();
    });

    it("should create OTel Collector with custom pipelines", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset",
            pipelines: [
                {
                    type: "traces",
                    receivers: ["otlp", "jaeger"],
                    processors: ["memory_limiter", "batch"],
                    exporters: ["otlp_tempo", "logging"]
                },
                {
                    type: "metrics",
                    receivers: ["otlp"],
                    processors: ["memory_limiter", "batch"],
                    exporters: ["prometheusremotewrite"]
                }
            ],
            helm: {
                namespace: "opentelemetry"
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-pipelines", args);
        }).not.toThrow();
    });

    it("should create OTel Collector with custom resources", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "deployment",
            helm: {
                namespace: "opentelemetry",
                replicas: 2,
                resources: {
                    requests: {
                        cpu: "500m",
                        memory: "512Mi"
                    },
                    limits: {
                        cpu: "1",
                        memory: "2Gi"
                    }
                }
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-resources", args);
        }).not.toThrow();
    });

    it("should throw error for missing cluster name", () => {
        const args = {
            region: "us-east-1",
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset" as const,
            helm: {
                namespace: "opentelemetry"
            }
        } as OTelCollectorComponentArgs;

        expect(() => {
            new OTelCollectorComponent("test-error-otel", args);
        }).toThrow();
    });

    it("should throw error for missing mode", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "opentelemetry"
            }
        } as OTelCollectorComponentArgs;

        expect(() => {
            new OTelCollectorComponent("test-error-mode", args);
        }).toThrow();
    });

    it("should throw error for missing helm configuration", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset" as const
        } as OTelCollectorComponentArgs;

        expect(() => {
            new OTelCollectorComponent("test-error-helm", args);
        }).toThrow();
    });

    it("should create with custom Helm values", () => {
        const args: OTelCollectorComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            mode: "daemonset",
            helm: {
                namespace: "opentelemetry",
                values: {
                    serviceMonitor: {
                        enabled: true
                    },
                    podAnnotations: {
                        "prometheus.io/scrape": "true",
                        "prometheus.io/port": "8888"
                    }
                }
            }
        };

        expect(() => {
            new OTelCollectorComponent("test-otel-custom", args);
        }).not.toThrow();
    });
});
