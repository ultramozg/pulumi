import { 
    extractAccountIdFromArn, 
    parseArn, 
    isValidAccountId, 
    getAccountIdFromEnv 
} from './aws-helpers';

describe('AWS Helpers', () => {
    describe('extractAccountIdFromArn', () => {
        it('should extract account ID from valid role ARN', () => {
            const arn = 'arn:aws:iam::123456789012:role/PulumiExecutionRole';
            const accountId = extractAccountIdFromArn(arn);
            expect(accountId).toBe('123456789012');
        });

        it('should throw error for S3 bucket ARN (no account ID)', () => {
            const arn = 'arn:aws:s3:::my-bucket';
            expect(() => extractAccountIdFromArn(arn)).toThrow('Invalid account ID in ARN');
        });

        it('should extract account ID from EC2 instance ARN', () => {
            const arn = 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0';
            const accountId = extractAccountIdFromArn(arn);
            expect(accountId).toBe('123456789012');
        });

        it('should throw error for invalid ARN format', () => {
            expect(() => extractAccountIdFromArn('invalid-arn')).toThrow('Invalid ARN format');
        });

        it('should throw error for empty ARN', () => {
            expect(() => extractAccountIdFromArn('')).toThrow('ARN must be a non-empty string');
        });

        it('should throw error for invalid account ID format', () => {
            const arn = 'arn:aws:iam::invalid-account:role/PulumiExecutionRole';
            expect(() => extractAccountIdFromArn(arn)).toThrow('Invalid account ID in ARN');
        });
    });

    describe('parseArn', () => {
        it('should parse IAM role ARN correctly', () => {
            const arn = 'arn:aws:iam::123456789012:role/PulumiExecutionRole';
            const parsed = parseArn(arn);
            
            expect(parsed).toEqual({
                partition: 'aws',
                service: 'iam',
                region: '',
                accountId: '123456789012',
                resource: 'role/PulumiExecutionRole',
                resourceType: 'role',
                resourceId: 'PulumiExecutionRole'
            });
        });

        it('should parse EC2 instance ARN correctly', () => {
            const arn = 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0';
            const parsed = parseArn(arn);
            
            expect(parsed).toEqual({
                partition: 'aws',
                service: 'ec2',
                region: 'us-east-1',
                accountId: '123456789012',
                resource: 'instance/i-1234567890abcdef0',
                resourceType: 'instance',
                resourceId: 'i-1234567890abcdef0'
            });
        });

        it('should parse S3 bucket ARN correctly', () => {
            const arn = 'arn:aws:s3:::my-bucket';
            const parsed = parseArn(arn);
            
            expect(parsed).toEqual({
                partition: 'aws',
                service: 's3',
                region: '',
                accountId: '',
                resource: 'my-bucket',
                resourceType: undefined,
                resourceId: undefined
            });
        });
    });

    describe('isValidAccountId', () => {
        it('should return true for valid account ID', () => {
            expect(isValidAccountId('123456789012')).toBe(true);
        });

        it('should return false for invalid account ID', () => {
            expect(isValidAccountId('12345')).toBe(false);
            expect(isValidAccountId('1234567890123')).toBe(false);
            expect(isValidAccountId('abcd56789012')).toBe(false);
            expect(isValidAccountId('')).toBe(false);
        });
    });

    describe('getAccountIdFromEnv', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            jest.resetModules();
            process.env = { ...originalEnv };
        });

        afterAll(() => {
            process.env = originalEnv;
        });

        it('should extract account ID from environment variable', () => {
            process.env.TEST_ROLE_ARN = 'arn:aws:iam::123456789012:role/TestRole';
            const accountId = getAccountIdFromEnv('TEST_ROLE_ARN');
            expect(accountId).toBe('123456789012');
        });

        it('should throw error if environment variable is not set', () => {
            expect(() => getAccountIdFromEnv('NONEXISTENT_VAR')).toThrow('Environment variable NONEXISTENT_VAR is not set');
        });
    });
});