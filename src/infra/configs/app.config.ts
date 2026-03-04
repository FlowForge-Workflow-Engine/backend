import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ConfigService } from "@nestjs/config";

/**
 * This function is executed when the configModule is loaded.
 * It calls the loadSecretsFromAWS function to fetch and load secrets.
 */
export default async () => {
  return await loadSecretsFromAWS(); // Await the loading of secrets from AWS
};

/**
 * This function fetches secrets from AWS Secrets Manager and stores them as environment variables.
 */
export async function loadSecretsFromAWS() {
  try {
    // Create an instance of ConfigService to manage configuration
    const configService = new ConfigService();

    // Initialize the Secrets Manager client with AWS region and credentials
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION, // AWS region from environment variables
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY, // AWS access key from environment variables
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // AWS secret access key from environment variables
      },
    });

    // Create a command to get the secret value using the secret name from environment variables
    const command = new GetSecretValueCommand({ SecretId: process.env.AWS_SECRET_NAME });

    // Send the command to the Secrets Manager client and await the response
    const response = await client.send(command);

    // Check if the response contains a SecretString
    if ("SecretString" in response) {
      // Parse the secret string into a JSON object
      const secrets = JSON.parse(response.SecretString!);

      // Iterate over each key in the secrets object
      Object.keys(secrets).forEach((key) => {
        // Set each secret in the ConfigService
        configService.set(key, secrets[key]);
        // Optionally, you could also set it in process.env
        // process.env[key] = secrets[key];

        // Log the key-value pair (commented out for production)
        // console.log({ key, value: secrets[key] });
      });

      // Log a message indicating that secrets have been loaded (commented out for production)
      // console.log(`Secrets loaded into ConfigService and process.env`);
    } else {
      // Throw an error if the secret is not found
      throw new Error("Secret not found");
    }
  } catch (error) {
    // Log the error if loading secrets fails
    console.error(`Failed to load secrets`, error);

    // Rethrow the error for further handling
    throw error;
  }
}
