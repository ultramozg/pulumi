import {
    ComponentError,
    ValidationError,
    ResourceCreationError,
    DependencyError,
    ConfigurationError,
    ErrorHandler,
    RecoveryStrategy,
    ValidationUtils
} from "../components/shared/utils/error-handling';

describe('Error Handling', () => {
    describe('ComponentError', () => {
        it('should create error with proper context', () => {
            const error = new ComponentError(
                'TestComponent',
                'test-instance',
                'Test error message',
                'TEST_ERROR',
                { key: 'value' }
            );

            expect(error.name).toBe('ComponentError');
            expect(error.componentType).toBe('TestComponent');
            expect(error.componentName).toBe('test-instance');
            expect(error.errorCode).toBe('TEST_ERROR');
            expect(error.message).toBe('[TestComponent:test-instance] Test error message');
            expect(error.context).toEqual({ key: 'value' });
            expect(error.timestamp).toBeInstanceOf(Date);
        });
    });

    describe('ValidationError', () => {
        it('should create validation error with field context', () => {
            const error = new ValidationError(
                'TestComponent',
                'test-instance',
                'fieldName',
                'invalid-value',
                'string',
                { additional: 'context' }
            );

            expect(error.name).toBe('ValidationError');
            expect(error.errorCode).toBe('VALIDATION_ERROR');
            expect(error.context).toEqual({
                fieldName: 'fieldName',
                value: 'invalid-value',
                expectedType: 'string',
                additional: 'context'
            });
        });
    });

    describe('ResourceCreationError', () => {
        it('should create resource error with AWS error context', () => {
            const awsError = {
                code: 'InvalidParameterValue',
                message: 'Invalid parameter',
                statusCode: 400
            };

            const error = new ResourceCreationError(
                'VPCComponent',
                'test-vpc',
                'AWS::EC2::VPC',
                'my-vpc',
                'Failed to create VPC',
                awsError
            );

            expect(error.name).toBe('ResourceCreationError');
            expect(error.resourceType).toBe('AWS::EC2::VPC');
            expect(error.resourceName).toBe('my-vpc');
            expect(error.awsError).toEqual(awsError);
            expect(error.context?.awsError).toEqual({
                code: 'InvalidParameterValue',
                message: 'Invalid parameter',
                statusCode: 400
            });
        });
    });

    describe('ErrorHandler', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should execute operation successfully without retry', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            
            const result = await ErrorHandler.executeWithRecovery(
                operation,
                'test-operation',
                'TestComponent',
                'test-instance',
                { strategy: RecoveryStrategy.RETRY, maxRetries: 3 }
            );

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry operation on failure', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('First failure'))
                .mockRejectedValueOnce(new Error('Second failure'))
                .mockResolvedValue('success');

            const result = await ErrorHandler.executeWithRecovery(
                operation,
                'test-operation',
                'TestComponent',
                'test-instance',
                { 
                    strategy: RecoveryStrategy.RETRY, 
                    maxRetries: 3,
                    retryDelay: 10 // Short delay for testing
                }
            );

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('should fail fast when strategy is FAIL_FAST', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

            await expect(
                ErrorHandler.executeWithRecovery(
                    operation,
                    'test-operation',
                    'TestComponent',
                    'test-instance',
                    { strategy: RecoveryStrategy.FAIL_FAST }
                )
            ).rejects.toThrow(ComponentError);

            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should skip operation when skip condition is met', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Skip this error'));

            await expect(
                ErrorHandler.executeWithRecovery(
                    operation,
                    'test-operation',
                    'TestComponent',
                    'test-instance',
                    { 
                        strategy: RecoveryStrategy.RETRY,
                        skipCondition: (error) => error.message.includes('Skip this')
                    }
                )
            ).rejects.toThrow('Operation skipped');

            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should execute rollback actions on ROLLBACK strategy', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            const rollbackAction1 = jest.fn().mockResolvedValue(undefined);
            const rollbackAction2 = jest.fn().mockResolvedValue(undefined);

            await expect(
                ErrorHandler.executeWithRecovery(
                    operation,
                    'test-operation',
                    'TestComponent',
                    'test-instance',
                    { 
                        strategy: RecoveryStrategy.ROLLBACK,
                        rollbackActions: [rollbackAction1, rollbackAction2]
                    }
                )
            ).rejects.toThrow(ComponentError);

            expect(rollbackAction2).toHaveBeenCalled(); // Rollback actions are executed in reverse order
            expect(rollbackAction1).toHaveBeenCalled();
        });

        it('should continue rollback even if one action fails', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
            const rollbackAction1 = jest.fn().mockResolvedValue(undefined);
            const rollbackAction2 = jest.fn().mockRejectedValue(new Error('Rollback failed'));

            await expect(
                ErrorHandler.executeWithRecovery(
                    operation,
                    'test-operation',
                    'TestComponent',
                    'test-instance',
                    { 
                        strategy: RecoveryStrategy.ROLLBACK,
                        rollbackActions: [rollbackAction1, rollbackAction2]
                    }
                )
            ).rejects.toThrow(ComponentError);

            expect(rollbackAction2).toHaveBeenCalled();
            expect(rollbackAction1).toHaveBeenCalled();
        });
    });

    describe('ValidationUtils', () => {
        describe('validateRequired', () => {
            it('should return value when not null or undefined', () => {
                const result = ValidationUtils.validateRequired(
                    'test-value',
                    'testField',
                    'TestComponent',
                    'test-instance'
                );
                expect(result).toBe('test-value');
            });

            it('should throw ValidationError when value is undefined', () => {
                expect(() => {
                    ValidationUtils.validateRequired(
                        undefined,
                        'testField',
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });

            it('should throw ValidationError when value is null', () => {
                expect(() => {
                    ValidationUtils.validateRequired(
                        null,
                        'testField',
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });
        });

        describe('validateFormat', () => {
            it('should pass when value matches pattern', () => {
                expect(() => {
                    ValidationUtils.validateFormat(
                        'us-east-1',
                        'region',
                        /^[a-z]{2}-[a-z]+-\d+$/,
                        'TestComponent',
                        'test-instance',
                        'AWS region format'
                    );
                }).not.toThrow();
            });

            it('should throw ValidationError when value does not match pattern', () => {
                expect(() => {
                    ValidationUtils.validateFormat(
                        'invalid-region',
                        'region',
                        /^[a-z]{2}-[a-z]+-\d+$/,
                        'TestComponent',
                        'test-instance',
                        'AWS region format'
                    );
                }).toThrow(ValidationError);
            });
        });

        describe('validateNonEmptyArray', () => {
            it('should return array when not empty', () => {
                const array = ['item1', 'item2'];
                const result = ValidationUtils.validateNonEmptyArray(
                    array,
                    'testArray',
                    'TestComponent',
                    'test-instance'
                );
                expect(result).toBe(array);
            });

            it('should throw ValidationError when array is empty', () => {
                expect(() => {
                    ValidationUtils.validateNonEmptyArray(
                        [],
                        'testArray',
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });

            it('should throw ValidationError when value is not an array', () => {
                expect(() => {
                    ValidationUtils.validateNonEmptyArray(
                        'not-an-array' as any,
                        'testArray',
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });
        });

        describe('validateRange', () => {
            it('should pass when value is within range', () => {
                expect(() => {
                    ValidationUtils.validateRange(
                        5,
                        'testNumber',
                        1,
                        10,
                        'TestComponent',
                        'test-instance'
                    );
                }).not.toThrow();
            });

            it('should throw ValidationError when value is below minimum', () => {
                expect(() => {
                    ValidationUtils.validateRange(
                        0,
                        'testNumber',
                        1,
                        10,
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });

            it('should throw ValidationError when value is above maximum', () => {
                expect(() => {
                    ValidationUtils.validateRange(
                        15,
                        'testNumber',
                        1,
                        10,
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });
        });

        describe('validateEnum', () => {
            it('should pass when value is in valid values', () => {
                expect(() => {
                    ValidationUtils.validateEnum(
                        'option1',
                        'testEnum',
                        ['option1', 'option2', 'option3'],
                        'TestComponent',
                        'test-instance'
                    );
                }).not.toThrow();
            });

            it('should throw ValidationError when value is not in valid values', () => {
                expect(() => {
                    ValidationUtils.validateEnum(
                        'invalid-option',
                        'testEnum',
                        ['option1', 'option2', 'option3'],
                        'TestComponent',
                        'test-instance'
                    );
                }).toThrow(ValidationError);
            });
        });

        describe('validateRegion', () => {
            it('should pass for valid AWS regions', () => {
                const validRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
                
                validRegions.forEach(region => {
                    expect(() => {
                        ValidationUtils.validateRegion(region, 'TestComponent', 'test-instance');
                    }).not.toThrow();
                });
            });

            it('should throw ValidationError for invalid regions', () => {
                const invalidRegions = ['us-east', 'invalid-region', 'us-east-1-extra', ''];
                
                invalidRegions.forEach(region => {
                    expect(() => {
                        ValidationUtils.validateRegion(region, 'TestComponent', 'test-instance');
                    }).toThrow(ValidationError);
                });
            });
        });

        describe('validateCidrBlock', () => {
            it('should pass for valid CIDR blocks', () => {
                const validCidrs = ['10.0.0.0/16', '192.168.1.0/24', '172.16.0.0/12'];
                
                validCidrs.forEach(cidr => {
                    expect(() => {
                        ValidationUtils.validateCidrBlock(cidr, 'TestComponent', 'test-instance');
                    }).not.toThrow();
                });
            });

            it('should throw ValidationError for invalid CIDR format', () => {
                const invalidCidrs = ['10.0.0.0', '10.0.0.0/33', '256.0.0.0/16', 'invalid-cidr'];
                
                invalidCidrs.forEach(cidr => {
                    expect(() => {
                        ValidationUtils.validateCidrBlock(cidr, 'TestComponent', 'test-instance');
                    }).toThrow(ValidationError);
                });
            });

            it('should throw ValidationError for invalid prefix length', () => {
                expect(() => {
                    ValidationUtils.validateCidrBlock('10.0.0.0/7', 'TestComponent', 'test-instance');
                }).toThrow(ValidationError);

                expect(() => {
                    ValidationUtils.validateCidrBlock('10.0.0.0/33', 'TestComponent', 'test-instance');
                }).toThrow(ValidationError);
            });

            it('should throw ValidationError for invalid IP octets', () => {
                expect(() => {
                    ValidationUtils.validateCidrBlock('256.0.0.0/16', 'TestComponent', 'test-instance');
                }).toThrow(ValidationError);

                expect(() => {
                    ValidationUtils.validateCidrBlock('10.256.0.0/16', 'TestComponent', 'test-instance');
                }).toThrow(ValidationError);
            });
        });
    });
});