/**
 * Simple Google API Authentication
 * This module provides a simple way to authenticate with Google APIs
 * using existing credentials.
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Authenticate with Google APIs using OAuth2
 * @returns {Promise<{auth, drive, sheets}>} Authentication and API clients
 */
const authenticate = async () => {
  try {
    console.log('Authenticating with Google APIs...');
    
    // Path to credentials file
    const credentialsPath = path.join(__dirname, 'credentials.json');
    
    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Credentials file not found at ${credentialsPath}`);
    }
    
    // Read credentials file
    const content = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(content);
    
    // Get client credentials
    const clientCredentials = credentials.installed || credentials.web;
    if (!clientCredentials) {
      throw new Error('Invalid OAuth credentials format');
    }
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      clientCredentials.client_id,
      clientCredentials.client_secret,
      clientCredentials.redirect_uris[0]
    );
    
    // Check if we have a token file
    const tokenPath = path.join(__dirname, 'token.json');
    if (fs.existsSync(tokenPath)) {
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      oauth2Client.setCredentials(token);
    } else {
      console.log('No OAuth token found. Authentication may fail without a valid token.');
    }
    
    // Create Drive and Sheets clients
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    return { auth: oauth2Client, drive, sheets };
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    throw error;
  }
};

/**
 * Verify access to a specific Google Drive folder
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
      fields: 'id,name,capabilities(canEdit)'
    });
    
    const file = response.data;
    
    // Check if we have edit permissions
    if (!file.capabilities.canEdit) {
      console.warn(`Warning: Read-only access to folder "${file.name}" (${file.id})`);
      console.warn('You may encounter errors when trying to create or modify files in this folder.');
      return false;
    }
    
    console.log(`Successfully verified access to folder "${file.name}" (${file.id})`);
    return true;
  } catch (error) {
    console.error(`Error verifying folder access: ${error.message}`);
    
    if (error.code === 404) {
      console.error(`\nThe folder with ID ${folderId} was not found. Please ensure:`);
      console.error('1. The folder ID is correct');
      console.error('2. The folder has not been deleted');
    } else if (error.code === 403) {
      console.error(`\nAccess denied to folder with ID ${folderId}. Please ensure:`);
      console.error('1. The folder has been shared with your Google account');
      console.error('2. Your account has at least Editor access to the folder');
    }
    
    return false;
  }
};

module.exports = {
  authenticate,
  verifyFolderAccess
};
