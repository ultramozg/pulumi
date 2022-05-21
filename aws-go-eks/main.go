package main

import (
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/url"

	appsv1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/apps/v1"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		resourceTags := make(map[string]string)

		resourceTags["CreatedBy"] = "pulumi-eks-go"
		resourceTags["GitOrg"] = "gsweene2"
		resourceTags["GitRepo"] = "pulumi"

		netResources, err := setupNetwork(ctx)
		if err != nil {
			return err
		}

		k8sProvider, err := setupEKS(ctx, netResources)
		if err != nil {
			return err
		}

		/* DEPLOYMENTS */
		chart, err := helm.NewChart(ctx, "metrics-server", helm.ChartArgs{
			Chart:     pulumi.String("metrics-server"),
			Version:   pulumi.String("3.8.2"),
			Namespace: pulumi.String("kube-system"),
			FetchArgs: helm.FetchArgs{
				Repo: pulumi.String("https://kubernetes-sigs.github.io/metrics-server/"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}
		fmt.Println(chart)

		namespace, err := corev1.NewNamespace(ctx, "app", &corev1.NamespaceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Name: pulumi.String("app"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}

		appLabels := pulumi.StringMap{
			"app": pulumi.String("nginx"),
		}
		_, err = appsv1.NewDeployment(ctx, "app-dep", &appsv1.DeploymentArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Namespace: namespace.Metadata.Elem().Name(),
			},
			Spec: appsv1.DeploymentSpecArgs{
				Selector: &metav1.LabelSelectorArgs{
					MatchLabels: appLabels,
				},
				Replicas: pulumi.Int(1),
				Template: &corev1.PodTemplateSpecArgs{
					Metadata: &metav1.ObjectMetaArgs{
						Labels: appLabels,
					},
					Spec: &corev1.PodSpecArgs{
						Containers: corev1.ContainerArray{
							corev1.ContainerArgs{
								Name:  pulumi.String("nginx"),
								Image: pulumi.String("nginx"),
							}},
					},
				},
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}

		service, err := corev1.NewService(ctx, "app-service", &corev1.ServiceArgs{
			Metadata: &metav1.ObjectMetaArgs{
				Namespace: namespace.Metadata.Elem().Name(),
				Labels:    appLabels,
			},
			Spec: &corev1.ServiceSpecArgs{
				Ports: corev1.ServicePortArray{
					corev1.ServicePortArgs{
						Port:       pulumi.Int(80),
						TargetPort: pulumi.Int(80),
					},
				},
				Selector: appLabels,
				Type:     pulumi.String("LoadBalancer"),
			},
		}, pulumi.Provider(k8sProvider))
		if err != nil {
			return err
		}
		/* END */

		ctx.Export("url", service.Status.ApplyT(func(status *corev1.ServiceStatus) *string {
			ingress := status.LoadBalancer.Ingress[0]
			if ingress.Hostname != nil {
				return ingress.Hostname
			}
			return ingress.Ip
		}))

		return nil
	})
}

//Create the KubeConfig Structure as per https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html
func generateKubeconfig(clusterEndpoint pulumi.StringOutput, certData pulumi.StringOutput, clusterName pulumi.StringOutput) pulumi.StringOutput {
	return pulumi.Sprintf(`{
        "apiVersion": "v1",
        "clusters": [{
            "cluster": {
                "server": "%s",
                "certificate-authority-data": "%s"
            },
            "name": "kubernetes",
        }],
        "contexts": [{
            "context": {
                "cluster": "kubernetes",
                "user": "aws",
            },
            "name": "aws",
        }],
        "current-context": "aws",
        "kind": "Config",
        "users": [{
            "name": "aws",
            "user": {
                "exec": {
                    "apiVersion": "client.authentication.k8s.io/v1alpha1",
                    "command": "aws",
                    "args": [
						"--region",
						"eu-west-1",
						"--profile",
						"my-admin-account",
						"eks",
						"get-token",
                        "--cluster-name",
                        "%s",
                    ],
                },
            },
        }],
    }`, clusterEndpoint, certData, clusterName)
}

func toPulumiStringArray(a []string) pulumi.StringArrayInput {
	var res []pulumi.StringInput
	for _, s := range a {
		res = append(res, pulumi.String(s))
	}
	return pulumi.StringArray(res)
}

func getThumbprint(oidc_issuer string) (string, error) {
	url, err := url.Parse(oidc_issuer)
	if err != nil {
		return "", err
	}

	conn, err := tls.Dial("tcp", url.Hostname()+":443", &tls.Config{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return "", err
	}
	defer conn.Close()

	cs := conn.ConnectionState()
	numCerts := len(cs.PeerCertificates)
	var root *x509.Certificate
	// Important! Get the last cert in the chain, which is the root CA.
	if numCerts >= 1 {
		root = cs.PeerCertificates[numCerts-1]
	} else {
		return "", errors.New("Error getting cert list from connection \n")
	}
	// print out the fingerprint
	return fmt.Sprintf("%x", sha1.Sum(root.Raw)), nil
}
