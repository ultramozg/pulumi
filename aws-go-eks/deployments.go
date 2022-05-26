package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v5/go/aws/iam"
	"github.com/pulumi/pulumi-kubernetes/sdk/v3/go/kubernetes/helm/v3"
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

	_, err = helm.NewChart(ctx, "aws-load-balancer-controller", helm.ChartArgs{
		Chart:     pulumi.String("aws-load-balancer-controller"),
		Version:   pulumi.String("1.4.1"),
		Namespace: pulumi.String("kube-system"),
		FetchArgs: helm.FetchArgs{
			Repo: pulumi.String("https://aws.github.io/eks-charts"),
		},
		Values: pulumi.Map{
			"clusterName": eksResources.eksCluster.Name,
			"serviceAccount": pulumi.Map{
				"create": pulumi.String("true"),
				"name":   pulumi.String("aws-load-balancer-controller"),
			},
		},
	}, pulumi.Provider(eksResources.k8sProvider))
	if err != nil {
		return err
	}

	return nil
}
