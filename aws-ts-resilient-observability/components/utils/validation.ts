import * as pulumi from "@pulumi/pulumi";
import { ComponentValidationError } from "../base";

/**
 * Component dependency specification
 */
export interface ComponentDependency {
    componentType: string;
    requiredOutputs: string[];
    optional?: boolean;
}

/**
 * Component compatibility rule
 */
export interface CompatibilityRule {
    sourceComponent: string;
    targetComponent: string;
    requiredConditions: Array<{
        property: string;
        expectedValue?: any;
        validator?: (value: any, targetArgs?: any) => boolean;
    }>;
    errorMessage?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Component configuration for validation
 */
export interface ComponentConfig {
    type: string;
    name: string;
    args: any;
    outputs?: { [key: string]: any };
}

/**
 * Predefined compatibility rules for AWS components
 */
export const AWS_COMPATIBILITY_RULES: CompatibilityRule[] = [
    // VPC and EKS compatibility
    {
        sourceComponent: "VPC",
        targetComponent: "EKS",
        requiredConditions: [
            {
                property: "subnets",
                validator: (subnets: any) => {
                    // EKS requires at least 2 subnets in different AZs
                    return subnets && Object.keys(subnets).length >= 2;
                }
            }
        ],
        errorMessage: "EKS requires at least 2 subnets in different availability zones"
    },
    
    // VPC and RDS compatibility
    {
        sourceComponent: "VPC",
        targetComponent: "RDS",
        requiredConditions: [
            {
                property: "subnets",
                validator: (subnets: any) => {
                    // RDS requires at least 2 subnets for subnet group
                    return subnets && Object.keys(subnets).length >= 2;
                }
            }
        ],
        errorMessage: "RDS requires at least 2 subnets for DB subnet group creation"
    },

    // IPAM and VPC compatibility
    {
        sourceComponent: "IPAM",
        targetComponent: "VPC",
        requiredConditions: [
            {
                property: "operatingRegions",
                validator: (regions: string[], targetArgs: any) => {
                    // IPAM must operate in the same region as VPC
                    return regions && regions.includes(targetArgs.region);
                }
            }
        ],
        errorMessage: "IPAM must operate in the same region as the VPC"
    },

    // Route53 and ACM compatibility
    {
        sourceComponent: "Route53",
        targetComponent: "ACM",
        requiredConditions: [
            {
                property: "hostedZones",
                validator: (zones: any[], targetArgs: any) => {
                    // Route53 must have hosted zone for ACM domain validation
                    if (!zones || !targetArgs.certificates) return false;
                    
                    const zoneNames = zones.map(zone => zone.name);
                    return targetArgs.certificates.every((cert: any) => {
                        return zoneNames.some(zoneName => 
                            cert.domainName.endsWith(zoneName) || cert.domainName === zoneName
                        );
                    });
                }
            }
        ],
        errorMessage: "Route53 must have hosted zones for all ACM certificate domains"
    },

    // ECR and EKS compatibility
    {
        sourceComponent: "ECR",
        targetComponent: "EKS",
        requiredConditions: [
            {
                property: "sourceRegion",
                validator: (sourceRegion: string, targetArgs: any) => {
                    // ECR and EKS should be in the same region for optimal performance
                    return sourceRegion === targetArgs.region;
                }
            }
        ],
        errorMessage: "ECR and EKS should be in the same region for optimal performance"
    }
];

/**
 * Validate component dependencies
 */
export function validateComponentDependencies(
    component: ComponentConfig,
    dependencies: ComponentConfig[],
    requiredDependencies: ComponentDependency[]
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    requiredDependencies.forEach(dep => {
        const dependency = dependencies.find(d => d.type === dep.componentType);
        
        if (!dependency) {
            if (!dep.optional) {
                result.isValid = false;
                result.errors.push(
                    `${component.type} component '${component.name}' requires ${dep.componentType} dependency`
                );
            } else {
                result.warnings.push(
                    `${component.type} component '${component.name}' recommends ${dep.componentType} dependency`
                );
            }
            return;
        }

        // Check if required outputs are available
        dep.requiredOutputs.forEach(output => {
            if (!dependency.outputs || !(output in dependency.outputs)) {
                result.isValid = false;
                result.errors.push(
                    `${component.type} component '${component.name}' requires output '${output}' from ${dep.componentType} dependency`
                );
            }
        });
    });

    return result;
}

/**
 * Validate component compatibility using predefined rules
 */
export function validateComponentCompatibility(
    sourceComponent: ComponentConfig,
    targetComponent: ComponentConfig,
    customRules: CompatibilityRule[] = []
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    const allRules = [...AWS_COMPATIBILITY_RULES, ...customRules];
    
    const applicableRules = allRules.filter(rule => 
        rule.sourceComponent === sourceComponent.type && 
        rule.targetComponent === targetComponent.type
    );

    applicableRules.forEach(rule => {
        rule.requiredConditions.forEach(condition => {
            const sourceValue = sourceComponent.args[condition.property];
            let isValid = true;

            if (condition.expectedValue !== undefined) {
                isValid = sourceValue === condition.expectedValue;
            } else if (condition.validator) {
                isValid = condition.validator(sourceValue, targetComponent.args);
            }

            if (!isValid) {
                result.isValid = false;
                result.errors.push(
                    rule.errorMessage || 
                    `Compatibility check failed between ${sourceComponent.type} and ${targetComponent.type}`
                );
            }
        });
    });

    return result;
}

/**
 * Validate region consistency across components
 */
export function validateRegionConsistency(
    components: ComponentConfig[]
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    const regionsByComponent: { [componentName: string]: string } = {};

    components.forEach(component => {
        if (component.args.region) {
            regionsByComponent[component.name] = component.args.region;
        } else if (component.args.operatingRegions) {
            // For IPAM components, use the first operating region
            regionsByComponent[component.name] = component.args.operatingRegions[0];
        }
    });

    const uniqueRegions = [...new Set(Object.values(regionsByComponent))];
    
    if (uniqueRegions.length > 1) {
        result.warnings.push(
            `Components are deployed across multiple regions: ${uniqueRegions.join(', ')}. ` +
            `This may impact performance and increase costs.`
        );
        
        // Check for specific cross-region issues
        const crossRegionComponents = Object.entries(regionsByComponent);
        
        for (let i = 0; i < crossRegionComponents.length; i++) {
            for (let j = i + 1; j < crossRegionComponents.length; j++) {
                const [comp1Name, comp1Region] = crossRegionComponents[i];
                const [comp2Name, comp2Region] = crossRegionComponents[j];
                
                if (comp1Region !== comp2Region) {
                    const comp1 = components.find(c => c.name === comp1Name);
                    const comp2 = components.find(c => c.name === comp2Name);
                    
                    // Check for problematic cross-region combinations
                    if (comp1 && comp2) {
                        if ((comp1.type === 'EKS' && comp2.type === 'ECR') ||
                            (comp1.type === 'ECR' && comp2.type === 'EKS')) {
                            result.warnings.push(
                                `EKS (${comp1Name}) and ECR (${comp2Name}) are in different regions. ` +
                                `This may cause slower image pulls and higher data transfer costs.`
                            );
                        }
                        
                        if ((comp1.type === 'VPC' && comp2.type === 'RDS') ||
                            (comp1.type === 'RDS' && comp2.type === 'VPC')) {
                            result.isValid = false;
                            result.errors.push(
                                `VPC (${comp1Name}) and RDS (${comp2Name}) must be in the same region`
                            );
                        }
                    }
                }
            }
        }
    }

    return result;
}

/**
 * Validate subnet configuration for networking components
 */
export function validateSubnetConfiguration(
    vpcArgs: any,
    dependentComponents: ComponentConfig[]
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    if (!vpcArgs.subnets) {
        result.isValid = false;
        result.errors.push("VPC must have subnet configuration");
        return result;
    }

    const subnets = vpcArgs.subnets;
    const subnetTypes = Object.values(subnets).map((subnet: any) => subnet.type);
    
    // Check for required subnet types based on dependent components
    dependentComponents.forEach(component => {
        switch (component.type) {
            case 'EKS':
                if (!subnetTypes.includes('private')) {
                    result.warnings.push(
                        `EKS component '${component.name}' recommends private subnets for worker nodes`
                    );
                }
                if (!subnetTypes.includes('public')) {
                    result.warnings.push(
                        `EKS component '${component.name}' may need public subnets for load balancers`
                    );
                }
                break;
                
            case 'RDS':
                if (!subnetTypes.includes('private')) {
                    result.isValid = false;
                    result.errors.push(
                        `RDS component '${component.name}' requires private subnets for security`
                    );
                }
                break;
                
            case 'ALB':
                if (!subnetTypes.includes('public')) {
                    result.isValid = false;
                    result.errors.push(
                        `ALB component '${component.name}' requires public subnets for internet-facing load balancers`
                    );
                }
                break;
        }
    });

    // Validate subnet distribution across AZs
    Object.entries(subnets).forEach(([subnetName, subnetSpec]: [string, any]) => {
        if (!subnetSpec.availabilityZones || subnetSpec.availabilityZones.length === 0) {
            result.isValid = false;
            result.errors.push(`Subnet '${subnetName}' must specify availability zones`);
        }
        
        if (subnetSpec.availabilityZones.length < 2) {
            result.warnings.push(
                `Subnet '${subnetName}' spans only ${subnetSpec.availabilityZones.length} AZ. ` +
                `Consider using multiple AZs for high availability`
            );
        }
    });

    return result;
}

/**
 * Comprehensive validation for component composition
 */
export function validateComponentComposition(
    components: ComponentConfig[],
    customRules: CompatibilityRule[] = []
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    // Validate region consistency
    const regionValidation = validateRegionConsistency(components);
    result.errors.push(...regionValidation.errors);
    result.warnings.push(...regionValidation.warnings);
    if (!regionValidation.isValid) {
        result.isValid = false;
    }

    // Validate component compatibility
    for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
            const compatibilityValidation = validateComponentCompatibility(
                components[i],
                components[j],
                customRules
            );
            
            result.errors.push(...compatibilityValidation.errors);
            result.warnings.push(...compatibilityValidation.warnings);
            if (!compatibilityValidation.isValid) {
                result.isValid = false;
            }
        }
    }

    // Validate subnet configurations for VPC components
    components.forEach(component => {
        if (component.type === 'VPC') {
            const dependentComponents = components.filter(c => 
                ['EKS', 'RDS', 'ALB'].includes(c.type)
            );
            
            const subnetValidation = validateSubnetConfiguration(
                component.args,
                dependentComponents
            );
            
            result.errors.push(...subnetValidation.errors);
            result.warnings.push(...subnetValidation.warnings);
            if (!subnetValidation.isValid) {
                result.isValid = false;
            }
        }
    });

    return result;
}

/**
 * Validate component arguments against schema
 */
export function validateComponentArgs<T>(
    componentType: string,
    args: T,
    requiredFields: (keyof T)[],
    optionalFields: (keyof T)[] = []
): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    // Check required fields
    requiredFields.forEach(field => {
        if (args[field] === undefined || args[field] === null) {
            result.isValid = false;
            result.errors.push(`${componentType}: Required field '${String(field)}' is missing`);
        }
    });

    // Check for unknown fields
    const allKnownFields = [...requiredFields, ...optionalFields];
    const providedFields = Object.keys(args as any);
    
    providedFields.forEach(field => {
        if (!allKnownFields.includes(field as keyof T)) {
            result.warnings.push(`${componentType}: Unknown field '${field}' provided`);
        }
    });

    return result;
}