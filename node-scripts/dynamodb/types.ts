export interface LambdaEdgeConfig {
  appId: string;
  customDomainIds: Set<string>;
}

export interface DynamoDBAttributeName {
  attributeName: string;
  ExpressionAttributeNames: {
    [key: string]: string;
  };
}
