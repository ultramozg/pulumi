package main

import (
	"fmt"

	appsv1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/apps/v1"
	corev1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/core/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
	metav1 "github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/meta/v1"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/providers"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func setupDeployments(ctx *pulumi.Context, k8sProvider *providers.Provider) error {
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

	ctx.Export("url", service.Status.ApplyT(func(status *corev1.ServiceStatus) *string {
		ingress := status.LoadBalancer.Ingress[0]
		if ingress.Hostname != nil {
			return ingress.Hostname
		}
		return ingress.Ip
	}))

	return nil
}
