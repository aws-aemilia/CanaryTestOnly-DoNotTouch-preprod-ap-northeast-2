import {
  AmplifyAccount,
  StandardRoles,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { AhioRequest, HostingGatewayImageRequest } from "./types";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const FAKE_ORIGIN_DOMAIN = "https://ahio-traffic-replay.com";
const MAX_LIFETIME_OF_PRESIGNED_URL_SEC = 30;

export async function convertImageRequestToAhioRequest(
  imageRequest: HostingGatewayImageRequest,
  controlPlaneAccountForRegion: AmplifyAccount
): Promise<AhioRequest> {
  const requestUrl = new URL(imageRequest.uri, FAKE_ORIGIN_DOMAIN);
  const widthFromRequest = Number(requestUrl.searchParams.get("w") || "");
  const heightFromRequest = Number(requestUrl.searchParams.get("h") || "");
  const decodedUrlParam = decodeURIComponent(
    requestUrl.searchParams.get("url") || ""
  );

  const domains: string[] = [];
  if (decodedUrlParam.startsWith("http")) {
    const remoteUrl = new URL(decodedUrlParam);
    domains.push(remoteUrl.hostname);
  }

  let presignedS3Url = "";
  if (domains.length === 0) {
    // This is a relative pathed request
    // Create Presigned URL from Hosting Bucket
    presignedS3Url = await createPresignedUrl({
      controlPlaneAccountForRegion,
      imageRequest,
      decodedUrlParam,
    });
  }

  return {
    schemaVersion: 0,
    accountId: "123456789012",
    // Use a fake app Id do avoid metering customers
    appId: imageRequest.appId + "-traffic-replay",
    branchName: imageRequest.branchName,
    activeJobId: imageRequest.activeJobId,
    presignedS3Url: presignedS3Url || undefined,
    requestUrl: requestUrl.toString(),
    headers: {
      Accept: imageRequest.acceptHeader,
    },
    imageSettings: {
      sizes: [widthFromRequest, heightFromRequest],
      domains,
      remotePatterns: [],
      formats: ["image/webp", "image/avif"],
      minimumCacheTTL: 60, // Default from NextJS
      dangerouslyAllowSVG: false, // Default from NextJS
    },
  };
}

async function createPresignedUrl({
  controlPlaneAccountForRegion,
  imageRequest,
  decodedUrlParam,
}: {
  controlPlaneAccountForRegion: AmplifyAccount;
  imageRequest: HostingGatewayImageRequest;
  decodedUrlParam: string;
}): Promise<string> {
  const s3Client = new S3Client({
    region: controlPlaneAccountForRegion.region,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccountForRegion.accountId,
      StandardRoles.FullReadOnly
    ),
  });

  const bucketName = `aws-amplify-${controlPlaneAccountForRegion.stage}-${controlPlaneAccountForRegion.region}-website-hosting`;
  const objectKey = `${imageRequest.appId}/${imageRequest.branchName}/${imageRequest.activeJobId}${decodedUrlParam}`;

  const s3Request = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  return await getSignedUrl(s3Client, s3Request, {
    expiresIn: MAX_LIFETIME_OF_PRESIGNED_URL_SEC,
  });
}
