#!/usr/bin/env python3

from diagrams import Diagram, Cluster
from diagrams.aws.network import ALB, VPC, TransitGateway, TransitGatewayAttachment
from diagrams.aws.compute import ElasticKubernetesService, EC2ContainerRegistry
from diagrams.aws.database import RDS
from diagrams.aws.management import OrganizationsAccount, Organizations

with Diagram("Multi region workload", show=False):
    org = Organizations("AWS Organizations")

    with Cluster("Shared Account"):
        ecr = EC2ContainerRegistry("ECR with multiregion replication")
        tgw = TransitGateway("Transit Gateway")
        shared_acc = OrganizationsAccount("Shared account")
        tgw_attachment_shared = TransitGatewayAttachment("Transit Gateway Attachment")
        vpc_shared = VPC("VPC")  
        with Cluster("Private Subnet"):
            lb = ALB("Application Load Balancer")
            eks = ElasticKubernetesService("web services")
            lb >> eks

    with Cluster("Workload Account"):
        with Cluster("us-east-1"):
            workload_acc = OrganizationsAccount("Worklaod account")
            tgw_attachment_workload_region_1 = TransitGatewayAttachment("Transit Gateway Attachment")
            vpc_workload_region_1 = VPC("VPC")  
            with Cluster("Public Subnet"):
                lb = ALB("Application Load Balancer")
                eks = ElasticKubernetesService("web services")
                db = RDS("Aurora Global Database")
                lb >> eks >> db
        with Cluster("us-west-2"):
            workload_acc = OrganizationsAccount("Worklaod account")
            tgw_attachment_workload_region_2 = TransitGatewayAttachment("Transit Gateway Attachment")
            vpc_workload_region_2 = VPC("VPC")  
            with Cluster("Public Subnet"):
                lb = ALB("Application Load Balancer")
                eks = ElasticKubernetesService("web services")
                db = RDS("Aurora Global Database")
                lb >> eks >> db

    tgw >> tgw_attachment_workload_region_1 >> vpc_workload_region_1
    tgw >> tgw_attachment_workload_region_2 >> vpc_workload_region_2
    tgw >> tgw_attachment_shared >> vpc_shared
    org >> workload_acc
    org >> shared_acc