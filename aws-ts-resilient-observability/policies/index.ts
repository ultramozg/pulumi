import * as policy from "@pulumi/policy";

// Empty policy pack - placeholder for future policies
// Add your custom policies here as needed
new policy.PolicyPack("aws-infrastructure-governance", {
    policies: [],
    enforcementLevel: "advisory",
});