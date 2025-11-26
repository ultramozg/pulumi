import { MimirComponent, MimirComponentArgs } from "./index";

describe("MimirComponent", () => {
    const mockClusterName = "test-cluster";
    const mockClusterEndpoint = "https://test-endpoint.eks.amazonaws.com";
    const mockClusterCA = "LS0tLS1CRUdJTi...";
    const mockOidcProviderArn = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/TEST";
    const mockOidcProviderUrl = "https://oidc.eks.us-east-1.amazonaws.com/id/TEST";

    it("should create Mimir component with S3 storage without throwing", () => {
        const args: MimirComponentArgs = {
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
                chartVersion: "5.6.0",
                namespace: "mimir",
                retentionPeriod: "90d",
                replicas: {
                    distributor: 3,
                    ingester: 3,
                    querier: 2,
                    queryFrontend: 2,
                    storeGateway: 3,
                    compactor: 1
                }
            }
        };

        expect(() => {
            new MimirComponent("test-mimir", args);
        }).not.toThrow();
    });

    it("should create Mimir component with IRSA configuration", () => {
        const args: MimirComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            oidcProviderArn: mockOidcProviderArn,
            oidcProviderUrl: mockOidcProviderUrl,
            storage: {
                type: "s3",
                s3: {
                    bucketName: "custom-mimir-bucket",
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
            new MimirComponent("test-mimir-irsa", args);
        }).not.toThrow();
    });

    it("should create Mimir with multi-tenancy enabled", () => {
        const args: MimirComponentArgs = {
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
                namespace: "mimir"
            },
            multiTenancy: true
        };

        expect(() => {
            new MimirComponent("test-mimir-multitenancy", args);
        }).not.toThrow();
    });

    it("should create Mimir with ruler and alertmanager enabled", () => {
        const args: MimirComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "mimir",
                ruler: {
                    enabled: true,
                    replicas: 2
                },
                alertmanager: {
                    enabled: true,
                    replicas: 3
                }
            }
        };

        expect(() => {
            new MimirComponent("test-mimir-ruler-am", args);
        }).not.toThrow();
    });

    it("should create Mimir with custom resource limits", () => {
        const args: MimirComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "mimir",
                resources: {
                    distributor: {
                        requests: { cpu: "500m", memory: "1Gi" },
                        limits: { cpu: "2", memory: "4Gi" }
                    },
                    ingester: {
                        requests: { cpu: "1", memory: "4Gi" },
                        limits: { cpu: "4", memory: "16Gi" }
                    },
                    querier: {
                        requests: { cpu: "500m", memory: "2Gi" },
                        limits: { cpu: "2", memory: "8Gi" }
                    },
                    storeGateway: {
                        requests: { cpu: "500m", memory: "2Gi" },
                        limits: { cpu: "2", memory: "8Gi" }
                    }
                }
            }
        };

        expect(() => {
            new MimirComponent("test-mimir-resources", args);
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
                namespace: "mimir"
            }
        } as MimirComponentArgs;

        expect(() => {
            new MimirComponent("test-error-mimir", args);
        }).toThrow();
    });

    it("should throw error for missing storage configuration", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "mimir"
            }
        } as MimirComponentArgs;

        expect(() => {
            new MimirComponent("test-error-storage", args);
        }).toThrow();
    });

    it("should throw error for unsupported storage type GCS", () => {
        const args: MimirComponentArgs = {
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
                namespace: "mimir"
            }
        };

        expect(() => {
            new MimirComponent("test-gcs-mimir", args);
        }).toThrow("GCS storage backend not yet implemented");
    });

    it("should throw error for unsupported storage type Azure", () => {
        const args: MimirComponentArgs = {
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
                namespace: "mimir"
            }
        };

        expect(() => {
            new MimirComponent("test-azure-mimir", args);
        }).toThrow("Azure storage backend not yet implemented");
    });

    it("should create with custom Helm values", () => {
        const args: MimirComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            storage: {
                type: "s3",
                s3: {}
            },
            helm: {
                namespace: "mimir",
                values: {
                    nginx: {
                        enabled: true
                    },
                    monitoring: {
                        serviceMonitor: {
                            enabled: true
                        }
                    }
                },
                retentionPeriod: "180d"
            }
        };

        expect(() => {
            new MimirComponent("test-mimir-custom", args);
        }).not.toThrow();
    });
});
