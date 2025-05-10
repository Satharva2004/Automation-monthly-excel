/**
 * Credentials Manager Utility
 *
 * This module provides functions to load Google API credentials from environment variables
 * instead of physical service account key files. This approach is better for production
 * environments where storing sensitive files is not recommended.
 */
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const config = require("./env-config");

/**
 * Get service account credentials from environment variables
 * @returns {Object} Service account credentials object
 */
const getCredentialsFromEnv = () => {
  // Validate that required environment variables exist
  if (!config.CLIENT_EMAIL || !config.PRIVATE_KEY) {
    throw new Error(
      "Missing required environment variables: CLIENT_EMAIL and PRIVATE_KEY must be set"
    );
  }

  // Construct credentials object from environment variables
  return {
    type: "service_account",
    project_id: config.PROJECT_ID || "automated-sheets-458809",
    private_key_id:
      config.PRIVATE_KEY_ID || "53e7d30a15c70a44724f0cac7fa79a3eb1b16fae",
    private_key: config.PRIVATE_KEY,
    client_email: config.CLIENT_EMAIL,
    client_id: config.CLIENT_ID || "103089537597211538910",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
      config.CLIENT_EMAIL
    )}`,
    universe_domain: "googleapis.com",
  };
};

/**
 * Create a JWT client directly from environment variables
 * @returns {Promise<google.auth.JWT>} Authorized JWT client
 */
const createJwtClientFromEnv = async () => {
  try {
    console.log("Creating JWT client from environment variables...");

    // Create a JWT client with credential values from environment
    const auth = new google.auth.JWT(
      config.CLIENT_EMAIL,
      null,
      config.PRIVATE_KEY,
      [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
      null,
      {
        key: config.PRIVATE_KEY,
        email: config.CLIENT_EMAIL,
        keyId: config.PRIVATE_KEY_ID,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
        // Set a longer expiration time (12 hours)
        expiresIn: 43200,
      }
    );

    // Authorize the client
    await auth.authorize();
    console.log(
      "Successfully authenticated JWT client using environment variables"
    );

    return auth;
  } catch (error) {
    console.error(
      `Error creating JWT client from environment: ${error.message}`
    );
    throw error;
  }
};

/**
 * Get Google API clients using credentials from environment variables
 * @returns {Promise<{auth: any, drive: google.drive.v3.Drive, sheets: google.sheets.v4.Sheets}>}
 */
const getGoogleClientsFromEnv = async () => {
  try {
    const auth = await createJwtClientFromEnv();

    // Create Drive and Sheets clients
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    return { auth, drive, sheets };
  } catch (error) {
    console.error(
      `Failed to get Google clients from environment: ${error.message}`
    );
    throw error;
  }
};

/**
 * Check if we should use environment variables or file-based credentials
 * @returns {boolean} True if environment variables should be used
 */
const shouldUseEnvCredentials = () => {
  return (
    process.env.NODE_ENV === "production" ||
    (config.CLIENT_EMAIL && config.PRIVATE_KEY)
  );
};

/**
 * Generate a credentials.json file from environment variables
 * This is useful for compatibility with existing code that expects a file
 * @param {string} outputPath - Path to save the credentials file
 * @returns {Promise<boolean>} Success status
 */
const generateCredentialsFile = async (
  outputPath = path.join(__dirname, "..", "credentials.json")
) => {
  try {
    const credentials = getCredentialsFromEnv();

    // Write credentials to file
    fs.writeFileSync(outputPath, JSON.stringify(credentials, null, 2));
    console.log(`Generated credentials file at ${outputPath}`);

    return true;
  } catch (error) {
    console.error(`Error generating credentials file: ${error.message}`);
    return false;
  }
};

/**
 * Verify access to a Google Drive folder
 * @param {google.drive.v3.Drive} drive - Authenticated Drive client
 * @param {string} folderId - ID of the folder to verify access to
 * @returns {Promise<boolean>} True if the folder is accessible, false otherwise
 */
const verifyFolderAccess = async (drive, folderId) => {
  try {
    console.log(`Verifying access to folder: ${folderId}`);

    // Try to get the folder metadata
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id,name,capabilities(canEdit)",
    });

    const file = response.data;

    // Check if we have edit permissions
    if (!file.capabilities.canEdit) {
      console.warn(
        `Warning: The service account has read-only access to folder "${file.name}" (${file.id})`
      );
      console.warn(
        "You may encounter errors when trying to create or modify files in this folder."
      );
      return false;
    }

    console.log(
      `Successfully verified access to folder "${file.name}" (${file.id})`
    );
    return true;
  } catch (error) {
    console.error(`Error verifying folder access: ${error.message}`);

    if (error.code === 404) {
      console.error(`Folder not found: ${folderId}`);
    }

    return false; // Return false for any folder access error
  }
};

module.exports = {
  getCredentialsFromEnv,
  createJwtClientFromEnv,
  getGoogleClientsFromEnv,
  shouldUseEnvCredentials,
  generateCredentialsFile,
  verifyFolderAccess,
};
