import { DependencyResolver } from './dependency-resolver';
import { StackConfig } from './types';

describe('DependencyResolver', () => {
    let resolver: DependencyResolver;
    
    beforeEach(() => {
        resolver = new DependencyResolver();
    });
    
    describe('resolveDependencies', () => {
        it('should handle stacks with no dependencies', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'stack1',
                    workDir: './stack1',
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'stack2',
                    workDir: './stack2',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            const groups = resolver.resolveDependencies(stacks);
            
            expect(groups).toHaveLength(1);
            expect(groups[0]).toHaveLength(2);
            expect(groups[0].map(s => s.name).sort()).toEqual(['stack1', 'stack2']);
        });
        
        it('should resolve simple linear dependencies', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'stack2',
                    workDir: './stack2',
                    dependencies: ['stack1'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'stack1',
                    workDir: './stack1',
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            const groups = resolver.resolveDependencies(stacks);
            
            expect(groups).toHaveLength(2);
            expect(groups[0]).toHaveLength(1);
            expect(groups[0][0].name).toBe('stack1');
            expect(groups[1]).toHaveLength(1);
            expect(groups[1][0].name).toBe('stack2');
        });
        
        it('should resolve complex dependencies with parallel groups', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'app1',
                    workDir: './app1',
                    dependencies: ['networking'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'app2',
                    workDir: './app2',
                    dependencies: ['networking'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'networking',
                    workDir: './networking',
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'monitoring',
                    workDir: './monitoring',
                    dependencies: ['app1', 'app2'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            const groups = resolver.resolveDependencies(stacks);
            
            expect(groups).toHaveLength(3);
            
            // First group: networking (no dependencies)
            expect(groups[0]).toHaveLength(1);
            expect(groups[0][0].name).toBe('networking');
            
            // Second group: app1 and app2 (depend on networking, can run in parallel)
            expect(groups[1]).toHaveLength(2);
            expect(groups[1].map(s => s.name).sort()).toEqual(['app1', 'app2']);
            
            // Third group: monitoring (depends on both apps)
            expect(groups[2]).toHaveLength(1);
            expect(groups[2][0].name).toBe('monitoring');
        });
        
        it('should detect circular dependencies', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'stack1',
                    workDir: './stack1',
                    dependencies: ['stack2'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                },
                {
                    name: 'stack2',
                    workDir: './stack2',
                    dependencies: ['stack1'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            expect(() => {
                resolver.resolveDependencies(stacks);
            }).toThrow('Circular dependency detected');
        });
        
        it('should detect missing dependencies', () => {
            const stacks: StackConfig[] = [
                {
                    name: 'stack1',
                    workDir: './stack1',
                    dependencies: ['nonexistent'],
                    components: [{ type: 'test', name: 'test', config: {} }]
                }
            ];
            
            expect(() => {
                resolver.resolveDependencies(stacks);
            }).toThrow("Stack 'stack1' depends on 'nonexistent' which does not exist");
        });
    });
});