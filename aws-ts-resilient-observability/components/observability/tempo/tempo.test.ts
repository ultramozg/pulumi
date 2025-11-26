import { TempoComponent, TempoComponentArgs } from "./index";

describe("TempoComponent", () => {
    const mockClusterName = "test-cluster";
    const mockClusterEndpoint = "https://test-endpoint.eks.amazonaws.com";
    const mockClusterCA = "LS0tLS1CRUdJTi...";
    const mockOidcProviderArn = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/TEST";
    const mockOidcProviderUrl = "https://oidc.eks.us-east-1.amazonaws.com/id/TEST";

    it("should create Tempo component with S3 storage without throwing", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {
                    versioning: true,
                    encryption: {
                        enabled: true
                    },
                    lifecycleRules: {
                        enabled: true,
                        transitionToIA: 7,
                        transitionToGlacier: 30,
                        expiration: 90
                    }
                }
            },
            helm: {
                chartVersion: "1.17.0",
                namespace: "tempo",
                retentionPeriod: "720h",
                search: {
                    enabled: true
                }
            }
        };

        expect(() => {
            new TempoComponent("test-tempo", args);
        }).not.toThrow();
    });

    it("should create Tempo component with IRSA configuration", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            oidcProviderArn: mockOidcProviderArn,
            oidcProviderUrl: mockOidcProviderUrl,
            storage: {
                type: "s3",
                s3: {
                    bucketName: "custom-tempo-bucket",
                    encryption: {
                        enabled: true
                    }
                }
            },
            helm: {
                namespace: "observability"
            }
        };

        expect(() => {
            new TempoComponent("test-tempo-irsa", args);
        }).not.toThrow();
    });

    it("should create Tempo component in distributed mode", () => {
        const args: TempoComponentArgs = {
            region: "us-west-2",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {
                    versioning: false,
                    forceDestroy: true
                }
            },
            helm: {
                namespace: "tempo"
            },
            distributed: true
        };

        expect(() => {
            new TempoComponent("test-tempo-distributed", args);
        }).not.toThrow();
    });

    it("should create Tempo with metrics generator enabled", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "tempo",
                metricsGenerator: {
                    enabled: true,
                    remoteWriteUrl: "http://mimir-distributor.mimir.svc.cluster.local:8080/api/v1/push"
                }
            }
        };

        expect(() => {
            new TempoComponent("test-tempo-metrics-gen", args);
        }).not.toThrow();
    });

    it("should throw error for missing cluster name", () => {
        const args = {
            region: "us-east-1",
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3" as const,
                s3: {}
            },
            helm: {
                namespace: "tempo"
            }
        } as TempoComponentArgs;

        expect(() => {
            new TempoComponent("test-error-tempo", args);
        }).toThrow();
    });

    it("should throw error for missing storage configuration", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "tempo"
            }
        } as TempoComponentArgs;

        expect(() => {
            new TempoComponent("test-error-storage", args);
        }).toThrow();
    });

    it("should throw error for unsupported storage type GCS", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "gcs",
                gcs: {
                    bucketName: "test-bucket"
                }
            },
            helm: {
                namespace: "tempo"
            }
        };

        expect(() => {
            new TempoComponent("test-gcs-tempo", args);
        }).toThrow("GCS storage backend not yet implemented");
    });

    it("should throw error for unsupported storage type Azure", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "azure",
                azure: {
                    containerName: "test-container"
                }
            },
            helm: {
                namespace: "tempo"
            }
        };

        expect(() => {
            new TempoComponent("test-azure-tempo", args);
        }).toThrow("Azure storage backend not yet implemented");
    });

    it("should create with custom Helm values and resources", () => {
        const args: TempoComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "tempo",
                values: {
                    gateway: {
                        enabled: true
                    }
                },
                resources: {
                    requests: {
                        cpu: "1",
                        memory: "2Gi"
                    },
                    limits: {
                        cpu: "4",
                        memory: "8Gi"
                    }
                },
                retentionPeriod: "336h" // 14 days
            }
        };

        expect(() => {
            new TempoComponent("test-tempo-custom", args);
        }).not.toThrow();
    });
});
