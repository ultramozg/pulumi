import { GrafanaComponent, GrafanaComponentArgs } from "./index";

describe("GrafanaComponent", () => {
    const mockClusterName = "test-cluster";
    const mockClusterEndpoint = "https://test-endpoint.eks.amazonaws.com";
    const mockClusterCA = "LS0tLS1CRUdJTi...";

    it("should create Grafana component without datasources", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                chartVersion: "8.8.2",
                namespace: "grafana",
                replicas: 2,
                persistence: {
                    enabled: true,
                    size: "10Gi",
                    storageClassName: "gp3"
                }
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana", args);
        }).not.toThrow();
    });

    it("should create Grafana with all datasources configured", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            datasources: [
                {
                    name: "Prometheus",
                    type: "prometheus",
                    url: "http://mimir-query-frontend.mimir.svc.cluster.local:8080/prometheus",
                    isDefault: true
                },
                {
                    name: "Loki",
                    type: "loki",
                    url: "http://loki-gateway.loki.svc.cluster.local"
                },
                {
                    name: "Tempo",
                    type: "tempo",
                    url: "http://tempo-query-frontend.tempo.svc.cluster.local:3100"
                }
            ],
            helm: {
                namespace: "grafana"
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana-datasources", args);
        }).not.toThrow();
    });

    it("should create Grafana with ingress enabled", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana",
                ingress: {
                    enabled: true,
                    host: "grafana.example.com",
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "cert-manager.io/cluster-issuer": "letsencrypt-prod"
                    },
                    tls: {
                        enabled: true,
                        secretName: "grafana-tls"
                    }
                }
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana-ingress", args);
        }).not.toThrow();
    });

    it("should create Grafana with custom admin password", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana",
                adminPassword: "SuperSecretPassword123!"
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana-password", args);
        }).not.toThrow();
    });

    it("should create Grafana with plugins installed", () => {
        const args: GrafanaComponentArgs = {
            region: "us-west-2",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana",
                plugins: [
                    "grafana-clock-panel",
                    "grafana-piechart-panel",
                    "grafana-worldmap-panel"
                ]
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana-plugins", args);
        }).not.toThrow();
    });

    it("should create Grafana with anonymous auth enabled", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana"
            },
            anonymousAuth: true
        };

        expect(() => {
            new GrafanaComponent("test-grafana-anonymous", args);
        }).not.toThrow();
    });

    it("should create Grafana with custom resources", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana",
                replicas: 3,
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
            new GrafanaComponent("test-grafana-resources", args);
        }).not.toThrow();
    });

    it("should throw error for missing cluster name", () => {
        const args = {
            region: "us-east-1",
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana"
            }
        } as GrafanaComponentArgs;

        expect(() => {
            new GrafanaComponent("test-error-grafana", args);
        }).toThrow();
    });

    it("should throw error for missing helm configuration", () => {
        const args = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA
        } as GrafanaComponentArgs;

        expect(() => {
            new GrafanaComponent("test-error-helm", args);
        }).toThrow();
    });

    it("should create with custom Helm values", () => {
        const args: GrafanaComponentArgs = {
            region: "us-east-1",
            clusterName: mockClusterName,
            clusterEndpoint: mockClusterEndpoint,
            clusterCertificateAuthority: mockClusterCA,
            helm: {
                namespace: "grafana",
                values: {
                    "grafana.ini": {
                        smtp: {
                            enabled: true,
                            host: "smtp.example.com:587",
                            user: "grafana@example.com"
                        }
                    },
                    dashboardProviders: {
                        "dashboardproviders.yaml": {
                            apiVersion: 1,
                            providers: [
                                {
                                    name: "default",
                                    orgId: 1,
                                    folder: "",
                                    type: "file",
                                    disableDeletion: false,
                                    editable: true,
                                    options: {
                                        path: "/var/lib/grafana/dashboards/default"
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        };

        expect(() => {
            new GrafanaComponent("test-grafana-custom", args);
        }).not.toThrow();
    });
});
