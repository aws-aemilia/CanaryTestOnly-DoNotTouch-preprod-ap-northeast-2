import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  paginateScan,
} from "@aws-sdk/lib-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import { AppDO, AppDOJava } from "../types";

export class AppDAO {
  private tableName: string;
  private client: DynamoDBDocumentClient;

  constructor(
    private stage: string,
    private region: string,
    credentials?: Provider<Credentials>
  ) {
    this.tableName = `${this.stage}-${this.region}-App`;
    const dynamoDBClient = new DynamoDBClient({
      region: this.region,
      credentials,
    });
    this.client = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  /**
   * Returns an iterator to paginate the LambdaEdgeConfig table. You can use the iterator
   * with `for await (const batch of paginateLambdaEdgeConfigs())`. Each batch will contain
   * a list of items. It uses lazy loading so it doesn't consume the next page
   * until the iterator reaches the end.
   *
   * @param documentClient DynamoDB document client
   * @param attributesToGet i.e. ["appId", "platform"]
   *
   * @returns Iterator of pages
   */
  public paginate = (attributesToGet: string[] = ["appId"]) => {
    return paginateScan(
      {
        pageSize: 1000,
        client: this.client,
      },
      {
        TableName: this.tableName,
        ProjectionExpression: attributesToGet.join(","),
      }
    );
  };

  public getAppById = async (appId: string, attributesToGet?: string[]) => {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        ProjectionExpression: attributesToGet?.join(","),
        Key: { appId },
      })
    );

    return response.Item as AppDO;
  };

  /**
   * In DynamoDB AppDO booleans are stored as numbers but AppDO in Java
   * parses them as booleans.
   * This is useful for creating messages for SQS queues
   */
  public mapToJavaType(app: AppDO): AppDOJava {
    // todo: convert actual obj to array
    app.autoBranchCreationPatterns = [];

    const autoBranchCreationBranchConfig = {
      ...app.autoBranchCreationConfig?.branchConfig,
      ...{
        enableAutoBuild: Boolean(
          app.autoBranchCreationConfig?.branchConfig.enableAutoBuild
        ),
        enableBasicAuth: Boolean(
          app.autoBranchCreationConfig?.branchConfig.enableBasicAuth
        ),
        enablePullRequestPreview: Boolean(
          app.autoBranchCreationConfig?.branchConfig.enablePullRequestPreview
        ),
      },
    };

    return {
      ...app,
      enableBranchAutoBuild: Boolean(app.enableBranchAutoBuild),
      enableAutoBranchDeletion: Boolean(app.enableAutoBranchDeletion),
      autoBranchCreationConfig: {
        ...app.autoBranchCreationConfig,
        branchConfig: autoBranchCreationBranchConfig,
      },
      enableBasicAuth: Boolean(app.enableBasicAuth),
      enableRewriteAndRedirect: Boolean(app.enableRewriteAndRedirect),
      enableCustomHeadersV2: Boolean(app.enableCustomHeadersV2),
      enableAutoBranchCreation: Boolean(app.enableAutoBranchCreation),
    };
  }
}
