import { LokiComponent, LokiComponentArgs } from "./index";

describe("LokiComponent", () => {
    const mockClusterName = "test-cluster";
    const mockClusterEndpoint = "https://test-endpoint.eks.amazonaws.com";
    const mockClusterCA = "LS0tLS1CRUdJTi...";
    const mockOidcProviderArn = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/TEST";
    const mockOidcProviderUrl = "https://oidc.eks.us-east-1.amazonaws.com/id/TEST";

    it("should create Loki component with S3 storage without throwing", () => {
        const args: LokiComponentArgs = {
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
                        transitionToIA: 30,
                        transitionToGlacier: 90,
                        expiration: 365
                    }
                }
            },
            helm: {
                chartVersion: "6.22.0",
                namespace: "loki",
                replicas: 3,
                gateway: {
                    enabled: true,
                    replicas: 2
                }
            }
        };

        expect(() => {
            new LokiComponent("test-loki", args);
        }).not.toThrow();
    });

    it("should create Loki component with IRSA configuration", () => {
        const args: LokiComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            oidcProviderArn: mockOidcProviderArn,
            oidcProviderUrl: mockOidcProviderUrl,
            storage: {
                type: "s3",
                s3: {
                    bucketName: "custom-loki-bucket",
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
            new LokiComponent("test-loki-irsa", args);
        }).not.toThrow();
    });

    it("should create Loki component in distributed mode", () => {
        const args: LokiComponentArgs = {
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
                namespace: "loki",
                replicas: 5
            },
            distributed: true
        };

        expect(() => {
            new LokiComponent("test-loki-distributed", args);
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
                namespace: "loki"
            }
        } as LokiComponentArgs;

        expect(() => {
            new LokiComponent("test-error-loki", args);
        }).toThrow();
    });

    it("should throw error for missing storage configuration", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "loki"
            }
        } as LokiComponentArgs;

        expect(() => {
            new LokiComponent("test-error-storage", args);
        }).toThrow();
    });

    it("should throw error for unsupported storage type GCS", () => {
        const args: LokiComponentArgs = {
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
                namespace: "loki"
            }
        };

        expect(() => {
            new LokiComponent("test-gcs-loki", args);
        }).toThrow("GCS storage backend not yet implemented");
    });

    it("should throw error for unsupported storage type Azure", () => {
        const args: LokiComponentArgs = {
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
                namespace: "loki"
            }
        };

        expect(() => {
            new LokiComponent("test-azure-loki", args);
        }).toThrow("Azure storage backend not yet implemented");
    });

    it("should create with custom Helm values", () => {
        const args: LokiComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "loki",
                values: {
                    monitoring: {
                        serviceMonitor: {
                            enabled: true
                        }
                    }
                },
                resources: {
                    requests: {
                        cpu: "500m",
                        memory: "1Gi"
                    },
                    limits: {
                        cpu: "2",
                        memory: "4Gi"
                    }
                }
            }
        };

        expect(() => {
            new LokiComponent("test-loki-custom", args);
        }).not.toThrow();
    });
});
