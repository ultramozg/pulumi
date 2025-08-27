import * as pulumi from "@pulumi/pulumi";
import {
    ComponentLogger,
    DeploymentLogger,
    PerformanceMonitor,
    MetricsCollector,
    LogLevel
} from '../../components/utils/logging';

// Mock Pulumi logging
jest.mock('@pulumi/pulumi', () => ({
    log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

const mockPulumiLog = pulumi.log as jest.Mocked<typeof pulumi.log>;

describe('Logging', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('ComponentLogger', () => {
        let logger: ComponentLogger;

        beforeEach(() => {
            logger = new ComponentLogger('TestComponent', 'test-instance', {
                region: 'us-east-1'
            });
        });

        it('should create logger with base context', () => {
            expect(logger).toBeInstanceOf(ComponentLogger);
        });

        it('should log info messages with context', () => {
            logger.info('Test message', { operation: 'test' });

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('[TestComponent:test-instance] Test message')
            );
        });

        it('should log warning messages', () => {
            logger.warn('Warning message');

            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('[TestComponent:test-instance] Warning message')
            );
        });

        it('should log error messages with error context', () => {
            const error = new Error('Test error');
            logger.error('Error occurred', error);

            expect(mockPulumiLog.error).toHaveBeenCalledWith(
                expect.stringContaining('[TestComponent:test-instance] Error occurred')
            );
            
            const logCall = mockPulumiLog.error.mock.calls[0][0];
            expect(logCall).toContain('Test error');
        });

        it('should log debug messages as info with DEBUG prefix', () => {
            logger.debug('Debug message');

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG: [TestComponent:test-instance] Debug message')
            );
        });

        it('should log resource creation lifecycle', () => {
            logger.resourceCreationStart('AWS::EC2::VPC', 'test-vpc');
            logger.resourceCreationSuccess('AWS::EC2::VPC', 'test-vpc', 1000);
            logger.resourceCreationFailure('AWS::EC2::VPC', 'test-vpc', new Error('Creation failed'), 500);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating AWS::EC2::VPC: test-vpc')
            );
            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully created AWS::EC2::VPC: test-vpc')
            );
            expect(mockPulumiLog.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create AWS::EC2::VPC: test-vpc')
            );
        });

        it('should log validation lifecycle', () => {
            logger.validationStart('component-args');
            logger.validationSuccess('component-args');
            logger.validationFailure('component-args', new Error('Validation failed'));

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Starting validation: component-args')
            );
            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Validation successful: component-args')
            );
            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('Validation failed: component-args')
            );
        });

        it('should log dependency resolution', () => {
            logger.dependencyResolution('VPC', 'test-vpc', 'found');
            logger.dependencyResolution('VPC', 'missing-vpc', 'not_found');
            logger.dependencyResolution('VPC', 'error-vpc', 'error');

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining("Dependency found: VPC 'test-vpc'")
            );
            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining("Dependency not_found: VPC 'missing-vpc'")
            );
            expect(mockPulumiLog.error).toHaveBeenCalledWith(
                expect.stringContaining("Dependency error: VPC 'error-vpc'")
            );
        });

        it('should log operation timing', () => {
            logger.operationTiming('test-operation', 1500);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Operation completed: test-operation (1500ms)')
            );
        });

        it('should create child logger for resource', () => {
            const childLogger = logger.forResource('AWS::EC2::VPC', 'test-vpc');
            childLogger.info('Child logger message');

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('[TestComponent:test-instance] Child logger message')
            );
        });

        it('should create child logger for operation', () => {
            const childLogger = logger.forOperation('create-vpc');
            childLogger.info('Operation logger message');

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('[TestComponent:test-instance] Operation logger message')
            );
        });
    });

    describe('DeploymentLogger', () => {
        let logger: DeploymentLogger;

        beforeEach(() => {
            logger = new DeploymentLogger('test-deployment');
        });

        it('should log deployment lifecycle', () => {
            logger.deploymentStart(5);
            logger.deploymentComplete(4, 1, 30000);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('🚀 Starting deployment: test-deployment')
            );
            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('⚠️ Deployment completed: test-deployment')
            );
        });

        it('should log stack deployment lifecycle', () => {
            logger.stackDeploymentStart('test-stack', 1, 3);
            logger.stackDeploymentSuccess('test-stack', 5000, { output1: 'value1' });
            logger.stackDeploymentFailure('test-stack', new Error('Deployment failed'), 3000);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('📦 Deploying stack: test-stack (group 1/3)')
            );
            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('✅ Stack deployed successfully: test-stack')
            );
            expect(mockPulumiLog.error).toHaveBeenCalledWith(
                expect.stringContaining('❌ Stack deployment failed: test-stack')
            );
        });

        it('should log dependency resolution', () => {
            const groups = [['stack1', 'stack2'], ['stack3']];
            logger.dependencyResolution(2, groups);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('📋 Dependency resolution completed: 2 groups')
            );
        });

        it('should log group deployment lifecycle', () => {
            logger.groupDeploymentStart(1, 2, ['stack1', 'stack2']);
            logger.groupDeploymentComplete(1, ['stack1'], ['stack2']);

            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('🔄 Deploying group 1/2: stack1, stack2')
            );
            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('⚠️ Group 1 completed')
            );
        });

        it('should log retry attempts', () => {
            logger.retryAttempt('deploy-stack', 2, 3, 2000);

            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('🔄 Retrying deploy-stack (attempt 2/3) after 2000ms')
            );
        });

        it('should log rollback lifecycle', () => {
            logger.rollbackStart('Deployment failed');
            logger.rollbackComplete(true, 10000);

            expect(mockPulumiLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('🔙 Starting rollback: Deployment failed')
            );
            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('✅ Rollback completed')
            );
        });
    });

    describe('PerformanceMonitor', () => {
        let logger: ComponentLogger;

        beforeEach(() => {
            logger = new ComponentLogger('TestComponent', 'test-instance');
        });

        it('should measure operation duration', () => {
            const monitor = PerformanceMonitor.start('test-operation', logger);
            
            // Advance time by 1000ms
            jest.advanceTimersByTime(1000);
            
            const duration = monitor.end();

            expect(duration).toBe(1000);
            expect(mockPulumiLog.info).toHaveBeenCalledWith(
                expect.stringContaining('Operation completed: test-operation (1000ms)')
            );
        });

        it('should get current duration without ending', () => {
            const monitor = PerformanceMonitor.start('test-operation', logger);
            
            jest.advanceTimersByTime(500);
            
            const currentDuration = monitor.getCurrentDuration();
            expect(currentDuration).toBe(500);
            
            // Should not have logged completion yet
            expect(mockPulumiLog.info).not.toHaveBeenCalledWith(
                expect.stringContaining('Operation completed')
            );
        });
    });

    describe('MetricsCollector', () => {
        let collector: MetricsCollector;

        beforeEach(() => {
            collector = new MetricsCollector('test-deployment');
        });

        it('should track deployment metrics', () => {
            collector.startStack('stack1');
            collector.startStack('stack2');
            
            jest.advanceTimersByTime(1000);
            
            collector.completeStack('stack1', true, undefined, 5);
            collector.completeStack('stack2', false, 'Deployment failed', 3);
            
            collector.recordRetry('stack2');
            collector.recordRollback();
            
            const metrics = collector.completeDeployment();

            expect(metrics.deploymentName).toBe('test-deployment');
            expect(metrics.totalStacks).toBe(2);
            expect(metrics.successfulStacks).toBe(1);
            expect(metrics.failedStacks).toBe(1);
            expect(metrics.retryCount).toBe(1);
            expect(metrics.rollbackCount).toBe(1);
            expect(metrics.totalDuration).toBeGreaterThan(0);

            expect(metrics.stackMetrics).toHaveLength(2);
            expect(metrics.stackMetrics[0].stackName).toBe('stack1');
            expect(metrics.stackMetrics[0].success).toBe(true);
            expect(metrics.stackMetrics[0].resourceCount).toBe(5);
            expect(metrics.stackMetrics[1].stackName).toBe('stack2');
            expect(metrics.stackMetrics[1].success).toBe(false);
            expect(metrics.stackMetrics[1].error).toBe('Deployment failed');
        });

        it('should export metrics as JSON', () => {
            collector.startStack('stack1');
            collector.completeStack('stack1', true);
            
            const jsonMetrics = collector.exportMetrics();
            const parsedMetrics = JSON.parse(jsonMetrics);

            expect(parsedMetrics.deploymentName).toBe('test-deployment');
            expect(parsedMetrics.stackMetrics).toHaveLength(1);
        });

        it('should get current metrics snapshot', () => {
            collector.startStack('stack1');
            
            const snapshot = collector.getMetrics();
            
            expect(snapshot.deploymentName).toBe('test-deployment');
            expect(snapshot.totalStacks).toBe(1);
            expect(snapshot.successfulStacks).toBe(0);
            expect(snapshot.failedStacks).toBe(0);
        });
    });
});