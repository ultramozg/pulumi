import { TransitGateway } from "./components/transitGateway";

// Create a reusable Transit Gateway component
const transitGateway = new TransitGateway("main-transit-gateway", {
	description: "Main Transit Gateway for multi-account connectivity",
	amazonSideAsn: 64512,
	tags: { Name: "main-transit-gateway" },
});
