export interface CloudFormationOutputs {
  HostingGatewayLoadBalancerDnsName: string;
  HostingGatewayLoadBalancerCanonicalHostedZoneId: string;
  HostingGatewayALBShard1DNS: string;
  HostingGatewayALBShard1HostedZoneId: string;
  HostingGatewayALBShard2DNS: string;
  HostingGatewayALBShard2HostedZoneId: string;
}

export interface TestDistribution {
  domainId: string;
  distributionId: string;
}