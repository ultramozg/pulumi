
import * as pulumi from "@pulumi/pulumi";
import { ECRComponent } from "../../../components/ecr";

const ecr = new ECRComponent("application-registry", {
    repositories: [
        {
            name: "test-app",
            shareWithOrganization: false
        }
    ],
    replicationEnabled: true,
    sourceRegion: "us-east-1",
    destinationRegion: "us-west-2",
    tags: {
        TestType: "integration",
        Layer: "container-registry"
    }
});

export const repositoryUrls = ecr.repositoryUrls;
export const replicationConfigurationId = ecr.replicationConfigurationId;
