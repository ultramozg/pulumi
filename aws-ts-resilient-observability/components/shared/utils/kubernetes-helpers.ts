import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

/**
 * Kubeconfig generation options
 */
export interface KubeconfigOptions {
    /**
     * EKS cluster name
     */
    clusterName: pulumi.Input<string>;

    /**
     * EKS cluster endpoint
     */
    clusterEndpoint: pulumi.Input<string>;

    /**
     * EKS cluster certificate authority data
     */
    clusterCertificateAuthority: pulumi.Input<string>;

    /**
     * AWS region where the cluster is deployed
     */
    region: string;

    /**
     * Optional IAM role ARN to assume when generating EKS authentication tokens
     */
    roleArn?: pulumi.Input<string>;
}

/**
 * Generate a kubeconfig for EKS cluster authentication
 *
 * This utility generates a kubeconfig that uses the AWS CLI to obtain
 * authentication tokens for EKS clusters. It supports optional role assumption
 * via the --role-arn flag.
 *
 * @param options - Kubeconfig generation options
 * @returns Pulumi output containing the kubeconfig object
 */
export function generateEKSKubeconfig(options: KubeconfigOptions): pulumi.Output<any> {
    return pulumi.all([
        options.clusterName,
        options.clusterEndpoint,
        options.clusterCertificateAuthority,
        options.roleArn
    ]).apply(([name, endpoint, ca, roleArn]) => {
        const args = [
            "eks",
            "get-token",
            "--cluster-name",
            name,
            "--region",
            options.region
        ];

        // Add --role-arn flag if a role is specified
        if (roleArn) {
            args.push("--role-arn", roleArn);
        }

        // Don't include environment variables in the kubeconfig
        // This prevents kubeconfig changes on every deployment when using temporary credentials
        // The AWS CLI will automatically pick up credentials from the environment or AWS credentials file
        const execConfig: any = {
            apiVersion: "client.authentication.k8s.io/v1beta1",
            command: "aws",
            args: args
        };

        return {
            apiVersion: "v1",
            kind: "Config",
            clusters: [{
                cluster: {
                    server: endpoint,
                    "certificate-authority-data": ca
                },
                name: "kubernetes"
            }],
            contexts: [{
                context: {
                    cluster: "kubernetes",
                    user: "aws"
                },
                name: "aws"
            }],
            "current-context": "aws",
            users: [{
                name: "aws",
                user: {
                    exec: execConfig
                }
            }]
        };
    });
}

/**
 * Generate a kubeconfig as a JSON string for EKS cluster authentication
 *
 * This is a convenience wrapper around generateEKSKubeconfig that returns
 * the kubeconfig as a JSON string instead of an object.
 *
 * @param options - Kubeconfig generation options
 * @returns Pulumi output containing the kubeconfig as a JSON string
 */
export function generateEKSKubeconfigString(options: KubeconfigOptions): pulumi.Output<string> {
    return generateEKSKubeconfig(options).apply(config => JSON.stringify(config));
}

/**
 * Create a Kubernetes provider for an EKS cluster
 *
 * This utility creates a Kubernetes provider configured to authenticate
 * to an EKS cluster using AWS credentials with optional role assumption.
 *
 * @param name - Name for the Kubernetes provider resource
 * @param options - Kubeconfig generation options
 * @param opts - Optional Pulumi resource options
 * @returns Kubernetes provider instance
 */
export function createEKSKubernetesProvider(
    name: string,
    options: KubeconfigOptions,
    opts?: pulumi.ResourceOptions
): k8s.Provider {
    const kubeconfig = generateEKSKubeconfigString(options);

    // Merge transformations to sanitize Kubernetes labels
    const transformations = [
        // Fix invalid Kubernetes labels (colons not allowed in label values)
        (args: pulumi.ResourceTransformationArgs): pulumi.ResourceTransformationResult => {
            if (args.props.metadata?.labels) {
                const labels = args.props.metadata.labels;
                // Sanitize label values: replace colons with hyphens
                for (const key in labels) {
                    if (typeof labels[key] === 'string' && labels[key].includes(':')) {
                        labels[key] = labels[key].replace(/:/g, '-');
                    }
                }
            }
            return {
                props: args.props,
                opts: args.opts
            };
        },
        ...(opts?.transformations || [])
    ];

    return new k8s.Provider(name, {
        kubeconfig: kubeconfig
    }, { ...opts, transformations });
}
