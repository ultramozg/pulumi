import { StackConfig } from './types';

/**
 * Dependency resolution for inter-stack dependencies
 */
export class DependencyResolver {
    /**
     * Resolves stack dependencies and returns deployment groups in order
     * @param stacks Array of stack configurations
     * @returns Array of stack groups, where each group can be deployed in parallel
     */
    public resolveDependencies(stacks: StackConfig[]): StackConfig[][] {
        const stackMap = new Map<string, StackConfig>();
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const deploymentGroups: StackConfig[][] = [];
        
        // Create a map for quick lookup
        stacks.forEach(stack => {
            if (stack.name) {
                stackMap.set(stack.name, stack);
            }
        });
        
        // Validate all dependencies exist
        this.validateDependencies(stacks, stackMap);
        
        // Build dependency graph and detect cycles
        const dependencyGraph = this.buildDependencyGraph(stacks);
        this.detectCycles(dependencyGraph, visited, visiting);
        
        // Group stacks by dependency level
        const levels = this.calculateDependencyLevels(stacks, dependencyGraph);
        
        // Create deployment groups
        const maxLevel = Math.max(...Object.values(levels));
        for (let level = 0; level <= maxLevel; level++) {
            const group = stacks.filter(stack => stack.name && levels[stack.name] === level);
            if (group.length > 0) {
                deploymentGroups.push(group);
            }
        }
        
        return deploymentGroups;
    }
    
    private validateDependencies(stacks: StackConfig[], stackMap: Map<string, StackConfig>): void {
        for (const stack of stacks) {
            if (stack.dependencies) {
                for (const dep of stack.dependencies) {
                    if (!stackMap.has(dep)) {
                        throw new Error(`Stack '${stack.name}' depends on '${dep}' which does not exist`);
                    }
                }
            }
        }
    }
    
    private buildDependencyGraph(stacks: StackConfig[]): Map<string, string[]> {
        const graph = new Map<string, string[]>();
        
        stacks.forEach(stack => {
            if (stack.name) {
                graph.set(stack.name, stack.dependencies || []);
            }
        });
        
        return graph;
    }
    
    private detectCycles(
        graph: Map<string, string[]>,
        visited: Set<string>,
        visiting: Set<string>,
        node?: string
    ): void {
        if (!node) {
            // Start DFS from all unvisited nodes
            for (const stackName of graph.keys()) {
                if (!visited.has(stackName)) {
                    this.detectCycles(graph, visited, visiting, stackName);
                }
            }
            return;
        }
        
        if (visiting.has(node)) {
            throw new Error(`Circular dependency detected involving stack '${node}'`);
        }
        
        if (visited.has(node)) {
            return;
        }
        
        visiting.add(node);
        
        const dependencies = graph.get(node) || [];
        for (const dep of dependencies) {
            this.detectCycles(graph, visited, visiting, dep);
        }
        
        visiting.delete(node);
        visited.add(node);
    }
    
    private calculateDependencyLevels(
        stacks: StackConfig[],
        graph: Map<string, string[]>
    ): Record<string, number> {
        const levels: Record<string, number> = {};
        const calculated = new Set<string>();
        
        const calculateLevel = (stackName: string): number => {
            if (calculated.has(stackName)) {
                return levels[stackName];
            }
            
            const dependencies = graph.get(stackName) || [];
            if (dependencies.length === 0) {
                levels[stackName] = 0;
            } else {
                const maxDepLevel = Math.max(...dependencies.map(dep => calculateLevel(dep)));
                levels[stackName] = maxDepLevel + 1;
            }
            
            calculated.add(stackName);
            return levels[stackName];
        };
        
        stacks.forEach(stack => {
            if (stack.name) {
                calculateLevel(stack.name);
            }
        });
        
        return levels;
    }
}