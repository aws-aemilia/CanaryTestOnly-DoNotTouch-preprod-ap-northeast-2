import {
  LambdaEdgeConfig,
  getDynamoDBDocumentClient,
  paginateLambdaEdgeConfigs,
  lookupCustomerAccountId
} from '../../Commons/dynamodb'
import { createLogger } from '../../Commons/utils/logger'
import sleep from '../../Commons/utils/sleep'
import yargs from 'yargs'
import {
  Region,
  getIsengardCredentialsProvider,
  controlPlaneAccounts,
  Stage
} from '../../Commons/Isengard'
import { writeFile } from 'node:fs/promises'

const logger = createLogger()

async function main () {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Gather customer impact for MCM-82671364

      Usage:
      # For a single region
      npx ts-node customerimpact.ts --stage beta --region us-west-2

      # For all regions
      npx ts-node customerimpact.ts --stage prod
      `
    )
    .option('stage', {
      describe: 'stage to run the command',
      type: 'string',
      default: 'prod',
      choices: ['beta', 'gamma', 'preprod', 'prod']
    })
    .option('region', {
      describe: 'region to run the command',
      type: 'string',
      default: 'eu-central-1'
    })
    .option('output-type', {
      alias: 'outputType',
      describe: 'Whether the output should generate a list of App IDs or Account IDs',
      type: 'string',
      default: 'accounts',
      choices: ['apps', 'accounts'],
    })
    .strict()
    .version(false)
    .help().argv

  const { stage, region, outputType } = args

  logger.info(`Running with stage: ${stage} and region: ${region}`)

  logger.info('Starting to gather customer impact...')
  //   process.env.ISENGARD_MCM = 'MCM-82671364'
  process.env.ISENGARD_SIM = 'P91879547'

  // If region is not provided it will return all accounts for that stage
  const accounts = await controlPlaneAccounts({
    stage: stage as Stage,
    region: region as Region
  })

  logger.info(accounts, 'Control plane accounts')
  const uniqueCustomers = new Set<{ accountId: string; region: string }>()
  const uniqueApps = new Set<{ appId: string; region: string, stage: string }>()

  for (const account of accounts) {
    logger.info(
      `Starting execution for ${account.airportCode} (${account.accountId})`
    )

    const credentials = getIsengardCredentialsProvider(
      account.accountId,
      'FullReadOnly'
    )

    const ddbClient = getDynamoDBDocumentClient(region as Region, credentials)
    const pages = paginateLambdaEdgeConfigs(ddbClient, [
      'appId',
      'branchConfig',
      'customDomainIds',
    ])

    logger.info(`Paginating through lambda edge config table...`)
    for await (const page of pages) {
      for (const item of page.Items ?? []) {
        const lecItem = item as Partial<LambdaEdgeConfig>

        if (isStaticAssetSeparated(lecItem)) {
          if (outputType === 'apps') {
            if (lecItem.customDomainIds?.size) {
              uniqueApps.add({
                appId: lecItem.appId!,
                region: account.region,
                stage: account.stage,
              });
            }
            continue;
          }
          const customerAccountId = await lookupCustomerAccountId(
            ddbClient,
            stage,
            account.region,
            lecItem.appId!
          )

          if (customerAccountId) {
            uniqueCustomers.add({
              accountId: customerAccountId,
              region: account.region
            })
          }
        }
      }

      logger.info('Sleeping between pages...')
      await sleep(1000)
    }
  }

  if (outputType === 'apps') {
    logger.info(`Found ${uniqueApps.size} unique apps`);

    let csvOutput = 'appId,region,stage\n'
    for (const { appId, region, stage } of uniqueApps) {
      csvOutput += `${appId},${region},${stage}\n`;
    }
  
    logger.info(`Writing customer impact to customer-impact-apps.csv`)
    await writeFile('customer-impact-apps.csv', csvOutput);
    logger.info(`Done!`);
    return;
  }

  logger.info(`Found ${uniqueCustomers.size} unique customers`)

  let csvOutput = 'accountId,region\n'
  for (const { accountId, region } of uniqueCustomers) {
    csvOutput += `${accountId},${region}\n`
  }

  logger.info(`Writing customer impact to customer-impact.csv`)
  await writeFile('customer-impact.csv', csvOutput)
  logger.info(`Done!`)
}

function isStaticAssetSeparated (
  edgeConfig: Partial<LambdaEdgeConfig>
): boolean {
  if (!edgeConfig.branchConfig) {
    return false
  }

  for (const [branchName, branchConfig] of Object.entries(
    edgeConfig.branchConfig
  )) {
    if (branchConfig.version && branchConfig.version === '1') {
      logger.info(
        `Found affected branch ${branchName} in EdgeConfig item ${edgeConfig.appId}`
      )
      return true
    }
  }

  return false
}

main().then(console.log).catch(console.error)
