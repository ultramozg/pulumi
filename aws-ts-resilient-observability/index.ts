import * as automation from "@pulumi/pulumi/automation";

async function upStack(stackName: string, workDir: string) {
    const stack = await automation.LocalWorkspace.createOrSelectStack({ stackName, workDir });
    await stack.up();
}

async function main() {
    await upStack("shared-services", "./shared-services");
    await upStack("workloads", "./workloads");
}

main();