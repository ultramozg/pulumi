
import * as pulumi from "@pulumi/pulumi";

// This will cause a deployment failure
throw new Error("Intentional test failure");
