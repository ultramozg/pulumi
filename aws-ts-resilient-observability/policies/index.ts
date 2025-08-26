import * as policy from "@pulumi/policy";

// Import custom policies
import { customPolicies } from "./custom-policies";

// Create the policy pack with custom rules
// Note: AWS Guard policies can be added separately via pulumi policy enable
export const policyPack = new policy.PolicyPack("aws-infrastructure-governance", {
    policies: [
        // Custom organization-specific policies
        ...customPolicies,
    ],
});