import axios from "axios";
import yargs from "yargs";

async function validateHeaders(imageUrl: string): Promise<void> {
  try {
    // Send an HTTP HEAD request to retrieve only headers
    const response = await axios.head(imageUrl);

    // Check if the HTTP status code is 200
    if (response.status === 200) {
      // Check if the 'x-amplify-optimized' header exists
      if ("x-amplify-optimized" in response.headers) {
        console.log(
          'Image downloaded successfully, and "x-amplify-optimized" header exists.'
        );
      } else {
        console.error(
          'Image downloaded successfully, but "x-amplify-optimized" header is missing.'
        );
      }
    } else {
      console.error(
        `Failed to download the image. HTTP status code: ${response.status}`
      );
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
  }
}

// Validate the image using the provided URL
async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
    Validates that provided image url has the x-amplify-optimized header.

    Usage:
    npx ts-node validate-ahio-headers.ts --url <image_url>
    `
    )
    .option("url", {
      describe: "URL of the image to validate",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { url } = args;
  validateHeaders(url);
}

main().then(console.log).catch(console.error);
