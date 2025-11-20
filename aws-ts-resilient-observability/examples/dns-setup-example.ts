/**
 * Example: DNS Setup for Multi-Region Internal Services
 * 
 * This example shows how to integrate Route53 private zones and ACM certificates
 * into the shared-services stack for internal observability services.
 */

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as namecheap from "pulumi-namecheap";
import { Route53HostedZoneComponent } from "../components/aws/route53";
import { AcmCertificateComponent } from "../components/aws/acm";

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");

// Get Namecheap credentials from Pulumi ESC
// These should be configured in your Pulumi ESC environment
const namecheapApiUser = config.requireSecret("namecheapApiUser");
const namecheapApiKey = config.requireSecret("namecheapApiKey");
const namecheapUsername = config.requireSecret("namecheapUsername");

// DNS configuration
const parentDomain = "srelog.dev"; // Your domain in Namecheap
const baseDomain = "internal.srelog.dev"; // Base for internal services

// Region configuration
const currentRegion = awsConfig.require("region");
const isPrimary = config.getBoolean("isPrimary") ?? true;

// ============================================================================
// SETUP PROVIDERS
// ============================================================================

// Assume you have VPC IDs from your shared-services stack
// In real implementation, these would come from stack references or config
const vpcId = config.require("vpcId"); // e.g., from hubVpc.vpcId

const awsProvider = new aws.Provider(`${currentRegion}-provider`, {
    region: currentRegion,
});

// Configure Namecheap provider
const namecheapProvider = new namecheap.Provider("namecheap", {
    apiUser: namecheapApiUser,
    apiKey: namecheapApiKey,
    userName: namecheapUsername,
    useSandbox: false, // Set to true for testing
});

// ============================================================================
// CREATE PRIVATE ZONE
// ============================================================================

const privateZone = new Route53HostedZoneComponent(`${currentRegion}-internal-zone`, {
    region: currentRegion,
    hostedZones: [
        {
            name: `${currentRegion}.${baseDomain}`,
            private: true,
            vpcIds: [vpcId],
            comment: `Private zone for ${currentRegion} internal services`,
        }
    ],
    tags: {
        Environment: "production",
        Purpose: "internal-services",
        Region: currentRegion,
    },
});

// ============================================================================
// CREATE ACM CERTIFICATE - Multiple Options
// ============================================================================

// Option 1: Namecheap DNS Validation (automatic)
const certificateNamecheap = new AcmCertificateComponent(
    `${currentRegion}-wildcard-cert-namecheap`,
    {
        domainName: `*.${currentRegion}.${baseDomain}`,
        validationMethod: "namecheap",
        namecheapValidation: {
            provider: namecheapProvider,
            parentDomain: parentDomain,
        },
        region: currentRegion,
        tags: {
            Environment: "production",
            Purpose: "internal-services",
            ValidationMethod: "namecheap",
        },
    }
);

// Option 2: Route53 DNS Validation (automatic) - if you have a public zone
// const certificateRoute53 = new AcmCertificateComponent(
//     `${currentRegion}-wildcard-cert-route53`,
//     {
//         domainName: `*.${currentRegion}.${baseDomain}`,
//         validationMethod: "route53",
//         route53Validation: {
//             hostedZoneId: "Z1234567890ABC", // Your public Route53 zone ID
//         },
//         region: currentRegion,
//         tags: {
//             Environment: "production",
//             Purpose: "internal-services",
//             ValidationMethod: "route53",
//         },
//     }
// );

// Option 3: Manual Validation - outputs records for you to create manually
// const certificateManual = new AcmCertificateComponent(
//     `${currentRegion}-wildcard-cert-manual`,
//     {
//         domainName: `*.${currentRegion}.${baseDomain}`,
//         validationMethod: "manual",
//         region: currentRegion,
//         tags: {
//             Environment: "production",
//             Purpose: "internal-services",
//             ValidationMethod: "manual",
//         },
//     }
// );

// ============================================================================
// EXAMPLE: CREATE DNS RECORDS FOR SERVICES
// ============================================================================

const zoneName = `${currentRegion}.${baseDomain}`;
const zoneId = privateZone.getHostedZoneId(zoneName);

// Example: Loki service record
const lokiRecord = new aws.route53.Record(`loki-${currentRegion}`, {
    zoneId: zoneId,
    name: `loki.${zoneName}`,
    type: "A",
    aliases: [{
        name: "your-alb-dns-name.elb.amazonaws.com", // Replace with actual ALB
        zoneId: "Z35SXDOTRQ7X7K", // ALB zone ID for us-east-1
        evaluateTargetHealth: true,
    }],
}, { provider: awsProvider });

// Example: Grafana service record
const grafanaRecord = new aws.route53.Record(`grafana-${currentRegion}`, {
    zoneId: zoneId,
    name: `grafana.${zoneName}`,
    type: "A",
    aliases: [{
        name: "your-alb-dns-name.elb.amazonaws.com", // Replace with actual ALB
        zoneId: "Z35SXDOTRQ7X7K", // ALB zone ID for us-east-1
        evaluateTargetHealth: true,
    }],
}, { provider: awsProvider });

// ============================================================================
// EXPORTS
// ============================================================================

export const privateZoneId = zoneId;
export const privateZoneName = zoneName;
export const certificateArn = certificateNamecheap.certificateArn;
export const lokiEndpoint = `loki.${zoneName}`;
export const grafanaEndpoint = `grafana.${zoneName}`;

// If using manual validation, export the validation records
// export const validationRecords = certificateManual.validationRecords;
