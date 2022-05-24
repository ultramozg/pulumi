package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/iam"
	appsv1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/apps/v1"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func setupDeployments(ctx *pulumi.Context, eksResources *eksResources) error {
	/* DEPLOYMENTS */
	chart, err := helm.NewChart(ctx, "metrics-server", helm.ChartArgs{
		Chart:     pulumi.String("metrics-server"),
		Version:   pulumi.String("3.8.2"),
		Namespace: pulumi.String("kube-system"),
		FetchArgs: helm.FetchArgs{
			Repo: pulumi.String("https://kubernetes-sigs.github.io/metrics-server/"),
		},
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}
	fmt.Println(chart)

	current, err := aws.GetCallerIdentity(ctx, nil, nil)
	if err != nil {
		return err
	}

	// we should get oidc provider & account_id
	jsonPolicy := eksResources.oidcUrl.ApplyT(func(url string) string {
		tmpAlbRole, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
				map[string]interface{}{
					"Action": "sts:AssumeRoleWithWebIdentity",
					"Effect": "Allow",
					"Sid":    "",
					"Principal": map[string]interface{}{
						//                                                    /<OIDC provider without https://
						"Federated": "arn:aws:iam::" + current.AccountId + ":oidc-provider/" + strings.TrimPrefix(url, "https://"),
					},
					"Condition": map[string]interface{}{
						"StringEquals": map[string]interface{}{
							// Something like this , should be changed OIDC provider without https://
							strings.TrimPrefix(url, "https://") + ":sub": "system:serviceaccount:kube-system:aws-load-balancer-controller",
						},
					},
				},
			},
		})
		if err != nil {
			return "ERROR: " + err.Error()
		}
		return string(tmpAlbRole)
	}).(pulumi.StringOutput)

	albRole, err := iam.NewRole(ctx, "albRole", &iam.RoleArgs{
		AssumeRolePolicy: pulumi.StringInput(jsonPolicy),
		Tags: pulumi.StringMap{
			"tag-key": pulumi.String("tag-value"),
		},
	})
	fmt.Println(albRole)

	// Junk staff
	namespace, err := corev1.NewNamespace(ctx, "app", &corev1.NamespaceArgs{
		Metadata: &metav1.ObjectMetaArgs{
			Name: pulumi.String("app"),
		},
	}, pulumi.Provider(eksResources.k8sProvider))
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
	}, pulumi.Provider(eksResources.k8sProvider))
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
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}

	ctx.Export("url", service.Status.ApplyT(func(status *corev1.ServiceStatus) *string {
		ingress := status.LoadBalancer.Ingress[0]
		if ingress.Hostname != nil {
			return ingress.Hostname
		}
		return ingress.Ip
	}))
	// end of the junk staff

	return nil
}
