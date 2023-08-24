import {
  GetObjectCommand,
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import logger from "../../Commons/utils/logger";

// One time script to delete problematic files that contain unicode characters
// to resolve ticket: https://t.corp.amazon.com/V929949195/communication.

async function main() {
  process.env.ISENGARD_SIM = "V929949195";
  const account = await controlPlaneAccount("prod", "ap-northeast-2");

  const s3Client = new S3Client({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  const problematicFiles = [
    "d15cn0yz7lqhf8/main/0000000006/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000007/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000008/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000009/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000010/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000011/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000012/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000013/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000014/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000015/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000016/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000017/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000019/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000020/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000023/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000024/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000025/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000026/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000027/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000028/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000029/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000030/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000031/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000032/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000033/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000034/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000035/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000036/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000037/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000038/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000039/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000040/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000041/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000042/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000043/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000045/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000046/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000047/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000048/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000049/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000050/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000051/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000052/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000053/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000054/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000055/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000056/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000057/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000058/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000059/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000060/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000061/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000063/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000064/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000065/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000066/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000068/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000069/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000070/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000071/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000072/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000073/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000074/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000075/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000076/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000077/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000078/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000079/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000080/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000081/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000082/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000083/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000084/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000085/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000086/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000087/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000088/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000089/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000090/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000091/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000092/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000093/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000094/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000095/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000096/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000097/\u0008main-icon.svg",
    "d15cn0yz7lqhf8/main/0000000098/\u0008main-icon.svg",
  ];

  for (const problematicFile of problematicFiles) {
    logger.info(`Deleting ${problematicFile}`);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: "aws-amplify-prod-ap-northeast-2-website-hosting",
        Key: problematicFile,
      })
    );
  }
}

main()
  .then(() => console.log("done"))
  .catch(console.error);
