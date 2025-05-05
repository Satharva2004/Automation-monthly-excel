/**
 * Token Refresh Utility
 *
 * Handles refreshing Google OAuth tokens when needed
 */

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// Path to credentials file
const SERVICE_ACCOUNT_KEY_PATH = path.join(
  __dirname,
  "..",
  "service-account-key.json"
);
const TOKEN_CACHE_PATH = path.join(__dirname, "..", "token-cache.json");

/**
 * Initialize the auth client with refresh capabilities
 * @returns {Promise<Object>} Google auth client
 */
async function initAuthClient() {
  try {
    // Check if service account key exists
    if (fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
      console.log("Using service account authentication");
      return initServiceAccount();
    } else {
      console.log("Service account key not found, trying cached token");
      return initWithCachedToken();
    }
  } catch (error) {
    console.error("Error initializing auth client:", error.message);
    throw error;
  }
}

/**
 * Initialize using service account
 * @returns {Promise<Object>} Google auth client
 */
async function initServiceAccount() {
  try {
    const credentials = JSON.parse(
      fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, "utf8")
    );
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    const client = await auth.getClient();
    return {
      auth,
      client,
      drive: google.drive({ version: "v3", auth }),
      sheets: google.sheets({ version: "v4", auth }),
    };
  } catch (error) {
    console.error("Error initializing service account:", error.message);
    throw error;
  }
}

/**
 * Initialize using cached token
 * @returns {Promise<Object>} Google auth client
 */
async function initWithCachedToken() {
  try {
    if (!fs.existsSync(TOKEN_CACHE_PATH)) {
      throw new Error("No cached token found");
    }

    const tokenData = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf8"));

    // Check if token is expired
    if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date) {
      console.log("Cached token is expired, refreshing...");
      return await refreshToken(tokenData);
    }

    // Create OAuth2 client
    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokenData);

    return {
      auth,
      client: auth,
      drive: google.drive({ version: "v3", auth }),
      sheets: google.sheets({ version: "v4", auth }),
    };
  } catch (error) {
    console.error("Error initializing with cached token:", error.message);
    throw error;
  }
}

/**
 * Refresh the OAuth token
 * @param {Object} tokenData - Current token data
 * @returns {Promise<Object>} Refreshed Google auth client
 */
async function refreshToken(tokenData) {
  try {
    if (!tokenData.refresh_token) {
      throw new Error("No refresh token available");
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials(tokenData);

    return new Promise((resolve, reject) => {
      auth.refreshAccessToken((err, tokens) => {
        if (err) {
          return reject(err);
        }

        // Save the new token
        const newTokenData = { ...tokenData, ...tokens };
        fs.writeFileSync(
          TOKEN_CACHE_PATH,
          JSON.stringify(newTokenData, null, 2)
        );

        // Update auth client
        auth.setCredentials(newTokenData);

        resolve({
          auth,
          client: auth,
          drive: google.drive({ version: "v3", auth }),
          sheets: google.sheets({ version: "v4", auth }),
        });
      });
    });
  } catch (error) {
    console.error("Error refreshing token:", error.message);
    throw error;
  }
}

/**
 * Validate that the token is still working
 * @param {Object} authClient - Auth client to validate
 * @returns {Promise<boolean>} Whether the token is valid
 */
async function validateToken(authClient) {
  try {
    // Make a simple API call to test authentication
    const drive = google.drive({ version: "v3", auth: authClient.auth });
    await drive.files.list({
      pageSize: 1,
      fields: "files(id, name)",
    });
    return true;
  } catch (error) {
    console.error("Token validation failed:", error.message);
    return false;
  }
}

/**
 * Get fresh Google API clients with token validation
 * @returns {Promise<Object>} Refreshed Google API clients
 */
async function getRefreshedClients() {
  try {
    // Initialize auth client
    const authClient = await initAuthClient();

    // Validate token
    const isValid = await validateToken(authClient);
    if (
      !isValid &&
      authClient.auth.credentials &&
      authClient.auth.credentials.refresh_token
    ) {
      console.log("Token is invalid, attempting refresh...");
      return await refreshToken(authClient.auth.credentials);
    }

    return authClient;
  } catch (error) {
    console.error("Error getting refreshed clients:", error.message);
    throw error;
  }
}

module.exports = {
  getRefreshedClients,
  initAuthClient,
};
