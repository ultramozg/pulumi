/**
 * Example: Cross-account AWS provider configuration
 * 
 * This example demonstrates how to use the new cross-account provider
 * utilities to deploy resources in different AWS accounts.
 */

import * as aws from "@pulumi/aws";
import { 
    createCrossAccountProvider, 
    getCachedProvider,
    validateRoleAssumption 
} from '../components/utils/aws-provider';

// Example role ARNs
const sharedServicesRoleArn = "arn:aws:iam::123456789012:role/PulumiExecutionRole";
const workloadsRoleArn = "arn:aws:iam::987654321098:role/PulumiExecutionRole";

export async function demonstrateCrossAccountDeployment() {
    console.log('=== Cross-Account Provider Demo ===');
    
    try {
        // 1. Validate role access before deployment
        console.log('Validating role access...');
        await validateRoleAssumption(sharedServicesRoleArn);
        await validateRoleAssumption(workloadsRoleArn);
        console.log('✅ All roles validated');
        
        // 2. Create providers for different accounts and regions
        const sharedServicesProviderEast = createCrossAccountProvider(
            sharedServicesRoleArn, 
            "us-east-1", 
            "shared-services"
        );
        
        const workloadsProviderEast = createCrossAccountProvider(
            workloadsRoleArn, 
            "us-east-1", 
            "workloads"
        );
        
        // 3. Use cached providers for efficiency
        const cachedProvider = getCachedProvider(
            sharedServicesRoleArn, 
            "us-east-1", 
            "shared-services"
        );
        
        // 4. Example: Create resources in different accounts
        
        // VPC in shared services account
        const sharedVpc = new aws.ec2.Vpc("shared-hub-vpc", {
            cidrBlock: "10.0.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: {
                Name: "shared-hub-vpc",
                Account: "shared-services"
            }
        }, { provider: sharedServicesProviderEast });
        
        // VPC in workloads account
        const workloadsVpc = new aws.ec2.Vpc("workloads-spoke-vpc", {
            cidrBlock: "10.1.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: {
                Name: "workloads-spoke-vpc",
                Account: "workloads"
            }
        }, { provider: workloadsProviderEast });
        
        console.log('✅ Cross-account resources created successfully');
        
        return {
            sharedVpcId: sharedVpc.id,
            workloadsVpcId: workloadsVpc.id
        };
        
    } catch (error) {
        console.error('❌ Cross-account deployment failed:', error);
        throw error;
    }
}

// Example of how to use this in a Pulumi program
export function createCrossAccountInfrastructure() {
    // This would be called from your main Pulumi program
    return demonstrateCrossAccountDeployment();
}

// Run the demo if this file is executed directly
if (require.main === module) {
    demonstrateCrossAccountDeployment()
        .then(result => {
            console.log('Demo completed successfully:', result);
        })
        .catch(error => {
            console.error('Demo failed:', error);
            process.exit(1);
        });
}