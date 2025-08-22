import { TransitGateway } from "../components/transitGateway";

// Example: create Transit Gateway in shared-services account
const transitGateway = new TransitGateway("main-transit-gateway", {
    description: "Main Transit Gateway for multi-account connectivity",
    amazonSideAsn: 64512,
    tags: { Name: "main-transit-gateway" },
});
