#!/usr/bin/env node

/**
 * Sprout Social Group Analytics to Google Sheets
 * ==============================================
 * This script fetches analytics data from Sprout Social API for all profiles in each group
 * and creates separate Google Sheets for each group with the data.
 * Modified to save spreadsheets to multiple Drive folders.
 * Uses Google Service Account authentication for continuous operation.
 * UPDATED: Now performs monthly analytics operations.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Import utilities
const apiUtils = require("./utils/api");
const sheetsUtils = require("./utils/sheets");
const driveUtils = require("./utils/drive");
const groupUtils = require("./utils/groups");
const authUtils = require("./utils/auth");
const credentialsManager = require("./utils/credentials-manager");

// Import platform modules
const instagram = require("./platforms/instagram");
const youtube = require("./platforms/youtube");
const linkedin = require("./platforms/linkedin");
const facebook = require("./platforms/facebook");
const twitter = require("./platforms/twitter");

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// API & Authentication
const CUSTOMER_ID = "2426451";
const SPROUT_API_TOKEN =
  "MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==";

// Paths - now using the default path that works with our credentials-manager
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, "credentials.json");

/**
 * Get the first and last day of a month for the given date
 * @param {Date} date - Date to get month range for
 * @returns {Object} Object with startDate and endDate strings in YYYY-MM-DD format
 */
const getMonthDateRange = (date) => {
  // Get first day of the month
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);

  // Get last day of the month
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  // Format dates as YYYY-MM-DD
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: formatDate(firstDay),
    endDate: formatDate(lastDay),
    monthName: firstDay.toLocaleString("default", { month: "long" }),
    year: firstDay.getFullYear(),
  };
};

/**
 * Get the current month's date range
 * @returns {Object} Object with startDate and endDate strings in YYYY-MM-DD format
 */
const getCurrentMonthRange = () => {
  // Use previous month for more complete data
  const today = new Date();
  const previousMonth = new Date(today);
  previousMonth.setMonth(previousMonth.getMonth() - 1);

  return getMonthDateRange(previousMonth);
};

// Get current month's date range for analytics
const currentMonthRange = getCurrentMonthRange();

// Date ranges for analytics - only using one folder and fetching monthly data
const FOLDER_CONFIGS = [
  {
    folderId: "1OA82RSaq0On_ERovDsZYUqeoMByyWruP",
    startDate: currentMonthRange.startDate, // First day of the month
    endDate: currentMonthRange.endDate, // Last day of the month
    description: `Monthly Report - ${currentMonthRange.monthName} ${currentMonthRange.year}`,
  },
];

// Sprout Social API endpoints
const BASE_URL = "https://api.sproutsocial.com/v1";
const METADATA_URL = `${BASE_URL}/${CUSTOMER_ID}/metadata/customer`;
const ANALYTICS_URL = `${BASE_URL}/${CUSTOMER_ID}/analytics/profiles`;

// Add styling configuration
const SHEET_STYLES = {
  header: {
    backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
    textColor: { red: 1, green: 1, blue: 1 },
    bold: true,
    fontSize: 11,
    horizontalAlignment: "CENTER",
    verticalAlignment: "MIDDLE",
  },
  data: {
    fontSize: 10,
    horizontalAlignment: "LEFT",
    verticalAlignment: "MIDDLE",
  },
  dateColumn: {
    numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" },
  },
  numberColumn: {
    numberFormat: { type: "NUMBER", pattern: "#,##0" },
  },
  percentageColumn: {
    numberFormat: { type: "PERCENT", pattern: "0.00%" },
  },
};

/**
 * Apply styling to a sheet
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet to style
 * @param {Array} headers - Array of header names
 */
const applySheetStyling = async (sheets, spreadsheetId, sheetName, headers) => {
  try {
    // Get the sheet ID
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheet = response.data.sheets.find(
      (s) => s.properties.title === sheetName
    );
    if (!sheet) return;

    const sheetId = sheet.properties.sheetId;
    const requests = [];

    // Style header row
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: SHEET_STYLES.header.backgroundColor,
            textFormat: {
              foregroundColor: SHEET_STYLES.header.textColor,
              bold: SHEET_STYLES.header.bold,
              fontSize: SHEET_STYLES.header.fontSize,
            },
            horizontalAlignment: SHEET_STYLES.header.horizontalAlignment,
            verticalAlignment: SHEET_STYLES.header.verticalAlignment,
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      },
    });

    // Style data rows
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            fontSize: SHEET_STYLES.data.fontSize,
            horizontalAlignment: SHEET_STYLES.data.horizontalAlignment,
            verticalAlignment: SHEET_STYLES.data.verticalAlignment,
          },
        },
        fields:
          "userEnteredFormat(fontSize,horizontalAlignment,verticalAlignment)",
      },
    });

    // Style date column (Column A)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: SHEET_STYLES.dateColumn.numberFormat,
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    });

    // Style number columns (based on header names)
    const numberColumns = headers.reduce((acc, header, index) => {
      if (
        header.toLowerCase().includes("count") ||
        header.toLowerCase().includes("growth") ||
        header.toLowerCase().includes("gained") ||
        header.toLowerCase().includes("lost") ||
        header.toLowerCase().includes("views") ||
        header.toLowerCase().includes("impressions")
      ) {
        acc.push(index);
      }
      return acc;
    }, []);

    numberColumns.forEach((columnIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: SHEET_STYLES.numberColumn.numberFormat,
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    });

    // Style percentage columns
    const percentageColumns = headers.reduce((acc, header, index) => {
      if (
        header.toLowerCase().includes("rate") ||
        header.toLowerCase().includes("percentage")
      ) {
        acc.push(index);
      }
      return acc;
    }, []);

    percentageColumns.forEach((columnIndex) => {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: SHEET_STYLES.percentageColumn.numberFormat,
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    });

    // Apply all styles
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests,
      },
    });

    console.log(`Applied styling to sheet: ${sheetName}`);
  } catch (error) {
    console.error(
      `Error applying styles to sheet ${sheetName}:`,
      error.message
    );
  }
};

// Check for available credentials files
const checkCredentials = () => {
  try {
    // First check if environment variables are available
    if (process.env.CLIENT_EMAIL && process.env.PRIVATE_KEY) {
      console.log("Using Google API credentials from environment variables");
      return "env";
    }

    // Fall back to file-based credentials if environment variables aren't available
    // First check for service account key
    if (fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
      console.log(`Found service account key at ${SERVICE_ACCOUNT_KEY_PATH}`);
      return SERVICE_ACCOUNT_KEY_PATH;
    }

    // Check for drive-credentials.json as fallback
    const driveCredentialsPath = path.join(__dirname, "drive-credentials.json");
    if (fs.existsSync(driveCredentialsPath)) {
      console.log(
        `Service account key not found, using drive credentials at ${driveCredentialsPath}`
      );
      return driveCredentialsPath;
    }

    // Check for credentials.json as second fallback
    const credentialsPath = path.join(__dirname, "credentials.json");
    if (fs.existsSync(credentialsPath)) {
      console.log(`Using credentials at ${credentialsPath}`);
      return credentialsPath;
    }

    // No credentials found
    throw new Error(
      `No credentials found. Please either:
      1. Set CLIENT_EMAIL and PRIVATE_KEY environment variables, or
      2. Create one of the following files:
        - ${SERVICE_ACCOUNT_KEY_PATH}
        - ${driveCredentialsPath}
        - ${credentialsPath}`
    );
  } catch (error) {
    console.error(`Credentials error: ${error.message}`);
    console.error("\nPlease ensure you have:");
    console.error(
      "1. Set up environment variables with CLIENT_EMAIL and PRIVATE_KEY, or"
    );
    console.error(
      "2. Created a service account or OAuth client in the Google Cloud Console"
    );
    console.error("3. Downloaded the credentials file");
    console.error("4. Saved it to one of the locations mentioned above");
    console.error(
      "5. Shared your Google Drive folders with the appropriate account"
    );
    process.exit(1); // Exit if we can't set up credentials - no point continuing
  }
};

/**
 * Authenticate with Google Drive and verify access to folders
 * @returns {Promise<{auth, drive, sheets}>} Authentication and API clients
 */
const authenticateAndVerifyAccess = async () => {
  try {
    console.log("Authenticating with Google APIs...");

    // Get the credentials source
    const credentialsSource = checkCredentials();
    let googleClients;

    if (credentialsSource === "env") {
      // Use environment variables for authentication
      console.log("Using environment variables for Google API authentication");
      googleClients = await credentialsManager.getGoogleClientsFromEnv();
    } else {
      // Use file-based authentication
      console.log(`Using credentials file at ${credentialsSource}`);
      googleClients = await authUtils.authenticateWithServiceAccount(
        credentialsSource
      );
    }

    if (!googleClients.drive || !googleClients.sheets || !googleClients.auth) {
      throw new Error("Failed to initialize Google API clients");
    }

    // Make a simple API call to test authentication
    // List files with a very small limit to minimize API usage
    await googleClients.drive.files.list({
      pageSize: 1,
      fields: "files(id, name)",
    });

    console.log("Google Service Account authentication successful!");

    // Verify access to all folders
    let allFoldersAccessible = true;
    for (const folderConfig of FOLDER_CONFIGS) {
      let folderAccessible;

      // Handle folder verification based on the credentials source
      if (credentialsSource === "env") {
        folderAccessible = await credentialsManager.verifyFolderAccess(
          googleClients.drive,
          folderConfig.folderId
        );
      } else {
        folderAccessible = await authUtils.verifyFolderAccess(
          googleClients.drive,
          folderConfig.folderId
        );
      }

      if (!folderAccessible) {
        console.error(
          `Warning: Issues accessing folder ${folderConfig.folderId}`
        );
        console.error(
          "Make sure the folder is shared with the service account email."
        );
        allFoldersAccessible = false;
      }
    }

    if (!allFoldersAccessible) {
      console.warn(
        "\nSome folders may not be accessible. The script will continue but may encounter errors."
      );
      console.warn(
        "Please ensure all folders are shared with the service account email with Editor permissions."
      );
    }

    return googleClients;
  } catch (error) {
    console.error(`Google Drive authentication failed: ${error.message}`);

    if (
      error.message.includes("invalid_grant") ||
      error.message.includes("Invalid JWT")
    ) {
      console.error(
        "\nAuthentication error detected. The service account credentials are invalid."
      );
      console.error(
        "Please check your environment variables or generate new service account keys."
      );
    } else if (
      error.message.includes("permission") ||
      error.message.includes("access")
    ) {
      console.error(
        "\nPermission error detected. The service account does not have access to the requested resources."
      );
      console.error(
        "Please ensure all Google Drive folders are shared with the service account email."
      );
    }

    process.exit(1); // Exit if authentication fails - no point continuing
  }
};

/**
 * Process analytics data for a group
 * @param {string} groupId - Group ID
 * @param {string} groupName - Group name
 * @param {Array} profiles - Array of profiles in the group
 * @param {Object} googleClients - Authenticated Google API clients
 * @returns {Promise<Array<Object>>} Array of spreadsheet details
 */
const processGroupAnalytics = async (
  groupId,
  groupName,
  profiles,
  googleClients
) => {
  const groupStartTime = new Date();
  let currentSpreadsheetId = null;

  try {
    console.log(`\n=== Processing Group: ${groupName} (${groupId}) ===`);
    console.log(`Found ${profiles.length} profiles in this group`);

    // Use the provided Google API clients
    const { drive, sheets } = googleClients;
    if (!drive || !sheets) {
      throw new Error("Invalid Google API clients provided");
    }

    // Create spreadsheets in all specified folders with their respective date ranges
    const results = [];

    for (const folderConfig of FOLDER_CONFIGS) {
      const { folderId, startDate, endDate, description } = folderConfig;
      console.log(
        `Creating spreadsheet in folder: ${folderId} (${description}: ${startDate} to ${endDate})`
      );

      // Format date for title
      const now = new Date();
      const formattedDate = now.toLocaleDateString("en-GB"); // e.g., 06/05/2025
      const formattedTime = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }); // e.g., 11:42 pm

      const baseNamePattern = `Sprout Analytics - ${groupName} - ${description}`;
      const spreadsheetTitle = `${baseNamePattern} - Last Updated ${formattedDate} ${formattedTime}`;

      // First check if a spreadsheet for this group already exists by pattern matching
      const existingSpreadsheet = await driveUtils.findSpreadsheetByPattern(
        drive,
        baseNamePattern,
        folderId
      );

      let spreadsheetId;

      if (existingSpreadsheet) {
        // Use the existing spreadsheet but update its title to reflect the new update time
        spreadsheetId = existingSpreadsheet.id;
        currentSpreadsheetId = spreadsheetId; // Update the current spreadsheet ID
        console.log(
          `Found existing spreadsheet: "${existingSpreadsheet.name}" (${spreadsheetId})`
        );
        console.log(`Updating title to: "${spreadsheetTitle}"`);

        // Update the spreadsheet title
        await driveUtils.updateSpreadsheetTitle(
          drive,
          spreadsheetId,
          spreadsheetTitle
        );
      } else {
        // No existing spreadsheet found, create a new one
        console.log(
          `No existing spreadsheet found. Creating a new one: "${spreadsheetTitle}"`
        );
        spreadsheetId = await driveUtils.createSpreadsheet(
          sheets,
          drive,
          spreadsheetTitle,
          folderId
        );
        currentSpreadsheetId = spreadsheetId; // Update the current spreadsheet ID

        if (!spreadsheetId) {
          console.error(
            `Failed to create spreadsheet for group ${groupName} in folder ${folderId}`
          );
          continue; // Skip to next folder if this one fails
        }
      }

      // Group profiles by network type
      const profilesByNetwork = groupUtils.groupProfilesByNetworkType(profiles);

      // Create sheets for each network type that has profiles
      const networkModules = {
        instagram,
        youtube,
        linkedin,
        facebook,
        twitter,
      };

      // Keep track of which sheets we've created
      const createdSheets = [];

      // Create sheets for each network type
      for (const [networkType, networkProfiles] of Object.entries(
        profilesByNetwork
      )) {
        if (networkProfiles.length > 0) {
          const sheetName =
            networkType.charAt(0).toUpperCase() + networkType.slice(1);
          await driveUtils.createSheet(sheets, spreadsheetId, sheetName);
          createdSheets.push(sheetName);

          // Set up headers
          const module = networkModules[networkType];
          if (module && module.setupHeaders) {
            await module.setupHeaders(
              sheetsUtils,
              googleClients.auth,
              spreadsheetId
            );
            // Apply styling after setting up headers
            await applySheetStyling(
              sheets,
              spreadsheetId,
              sheetName,
              module.HEADERS
            );
          }
        }
      }

      // Fetch analytics data for all profiles in this group using this folder's date range
      const profileIds = profiles
        .map((p) => p.customer_profile_id)
        .filter((id) => id);
      console.log(
        `Fetching analytics data for ${profileIds.length} profiles in group ${groupName} from ${startDate} to ${endDate}`
      );

      // Check if we already have data for this month to avoid duplicates
      let existingData = false;
      try {
        // Create a month-year string for checking (e.g., "2024-01" for January 2024)
        const monthYearKey = startDate.substring(0, 7); // YYYY-MM format

        // Check if we already have data for this month in the spreadsheet
        for (const sheetName of createdSheets) {
          const existingValues = await sheetsUtils.getSheetValues(
            googleClients.auth,
            spreadsheetId,
            sheetName,
            "A:A"
          );
          if (existingValues && existingValues.length > 1) {
            // Check if any date in column A matches this month-year pattern
            const monthExists = existingValues.some((row) => {
              // If the date exists and starts with our month-year pattern
              return row[0] && row[0].startsWith(monthYearKey);
            });

            if (monthExists) {
              console.log(
                `Data for ${monthYearKey} already exists in sheet ${sheetName}. Skipping update.`
              );
              existingData = true;
              break;
            }
          }
        }
      } catch (error) {
        console.warn(
          `Error checking for existing data: ${error.message}. Will proceed with update.`
        );
      }

      // Skip fetching if we already have this month's data
      if (existingData) {
        console.log(
          `Skipping analytics update for group ${groupName} as data for this month already exists.`
        );
        results.push({
          groupId,
          groupName,
          folderId,
          description,
          dateRange: `${startDate} to ${endDate}`,
          profileCount: profiles.length,
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          status: "Already updated for this month",
        });
        continue; // Skip to next folder
      }

      // Fetch fresh data from API
      const analyticsData = await apiUtils.getAnalyticsData(
        ANALYTICS_URL,
        SPROUT_API_TOKEN,
        startDate,
        endDate,
        profileIds
      );

      // Log the raw data for debugging
      console.log(
        `Received ${analyticsData?.data?.length || 0} data points from API`
      );
      if (analyticsData?.data?.length > 0) {
        // Log the first data point's metrics to see all available fields
        const sampleDataPoint = analyticsData.data[0];
        console.log("\n=== SAMPLE API DATA POINT ===");
        console.log(
          "Date:",
          sampleDataPoint.dimensions?.reporting_period ||
            sampleDataPoint.dimensions?.["reporting_period.by(day)"]
        );
        console.log(
          "Profile ID:",
          sampleDataPoint.dimensions?.customer_profile_id
        );
        console.log("\nAVAILABLE METRICS:");
        console.log("----------------");

        // Sort metrics by name for easier reading
        const metricKeys = Object.keys(sampleDataPoint.metrics || {}).sort();
        metricKeys.forEach((key) => {
          console.log(`${key}: ${sampleDataPoint.metrics[key]}`);
        });

        console.log(
          "\nSample data point (full):",
          JSON.stringify(sampleDataPoint, null, 2)
        );
      }

      if (
        !analyticsData ||
        !analyticsData.data ||
        analyticsData.data.length === 0
      ) {
        console.warn(
          `No analytics data found for group ${groupName} in period ${startDate} to ${endDate}`
        );
        results.push({
          groupId,
          groupName,
          folderId,
          description,
          dateRange: `${startDate} to ${endDate}`,
          profileCount: profiles.length,
          spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          status: "No data",
        });
        continue; // Skip to next folder
      }

      // Group data by profile and date
      const dataByProfileAndDate = {};

      for (const dataPoint of analyticsData.data) {
        const customerProfileId = dataPoint.dimensions?.customer_profile_id;
        const reportingPeriod =
          dataPoint.dimensions?.["reporting_period.by(day)"] ||
          dataPoint.dimensions?.reporting_period;

        if (!customerProfileId || !reportingPeriod) continue;

        const date = new Date(reportingPeriod).toISOString().split("T")[0];
        const key = `${customerProfileId}_${date}`;

        if (!dataByProfileAndDate[key]) {
          dataByProfileAndDate[key] = {
            profileId: customerProfileId,
            date: date,
            dataPoint: dataPoint,
          };
        }
      }

      // Process data for each profile
      const rowsByNetwork = {
        instagram: [],
        youtube: [],
        linkedin: [],
        facebook: [],
        twitter: [],
      };

      for (const { profileId, date, dataPoint } of Object.values(
        dataByProfileAndDate
      )) {
        const profile = profiles.find(
          (p) => p.customer_profile_id === parseInt(profileId)
        );
        if (!profile) {
          console.log(`Profile not found for ID: ${profileId}`);
          continue;
        }

        // Map network types to our simplified types
        const networkTypeMapping = {
          linkedin_company: "linkedin",
          fb_instagram_account: "instagram",
          fb_page: "facebook",
          youtube_channel: "youtube",
          twitter_profile: "twitter",
        };

        // Get our simplified network type
        const networkType =
          networkTypeMapping[profile.network_type] ||
          profile.network_type.toLowerCase();
        console.log(
          `Processing data for profile ${profile.name} (${profileId}) with network type: ${profile.network_type} → ${networkType}`
        );

        const module = networkModules[networkType];
        if (module && module.formatAnalyticsData) {
          const row = module.formatAnalyticsData(dataPoint, profile);
          if (row) {
            rowsByNetwork[networkType].push(row);
            console.log(`Added row for ${networkType} profile ${profile.name}`);
          } else {
            console.log(
              `No row generated for ${networkType} profile ${profile.name}`
            );
          }
        } else {
          console.log(`No formatter found for network type: ${networkType}`);
        }
      }

      // Update sheets with data
      const updatePromises = [];
      const sheetTimers = {};

      for (const [networkType, rows] of Object.entries(rowsByNetwork)) {
        if (rows.length > 0) {
          const sheetName =
            networkType.charAt(0).toUpperCase() + networkType.slice(1);
          if (createdSheets.includes(sheetName)) {
            const module = networkModules[networkType];
            if (module && module.updateSheet) {
              // Record start time for this sheet
              const sheetStartTime = new Date();
              console.log(
                `Starting ${sheetName} sheet update at ${sheetStartTime.toLocaleTimeString()} with ${
                  rows.length
                } rows`
              );

              // Store the start time for later calculation
              sheetTimers[sheetName] = sheetStartTime;

              // Wrap the update in a function that logs timing information
              const updateWithTiming = async () => {
                try {
                  await module.updateSheet(
                    sheetsUtils,
                    googleClients.auth,
                    spreadsheetId,
                    rows
                  );

                  // Add monthly summary
                  await module.addMonthlySummary(sheets, spreadsheetId, rows);

                  const sheetEndTime = new Date();
                  const sheetTimeMs = sheetEndTime - sheetTimers[sheetName];
                  const sheetTimeSec = Math.round(sheetTimeMs / 1000);
                  console.log(
                    `Completed ${sheetName} sheet update at ${sheetEndTime.toLocaleTimeString()}. Time taken: ${sheetTimeSec} seconds`
                  );
                } catch (error) {
                  const sheetEndTime = new Date();
                  const sheetTimeMs = sheetEndTime - sheetTimers[sheetName];
                  const sheetTimeSec = Math.round(sheetTimeMs / 1000);
                  console.error(
                    `Error updating ${sheetName} sheet after ${sheetTimeSec} seconds: ${error.message}`
                  );
                  throw error; // Re-throw to maintain original error handling
                }
              };

              updatePromises.push(updateWithTiming());
            } else {
              console.log(`No updateSheet method found for ${networkType}`);
            }
          } else {
            console.log(`Sheet ${sheetName} not created, skipping update`);
          }
        } else {
          console.log(`No rows to update for ${networkType}`);
        }
      }

      await Promise.all(updatePromises);

      // After all data is written to the sheet, update the title with the correct time
      await driveUtils.updateSpreadsheetTitle(
        drive,
        spreadsheetId,
        spreadsheetTitle
      );
      console.log(`Spreadsheet title updated to: ${spreadsheetTitle}`);

      console.log(
        `Completed processing for group ${groupName} in folder ${folderId}`
      );
      console.log(
        `Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      );

      results.push({
        groupId,
        groupName,
        folderId,
        description,
        dateRange: `${startDate} to ${endDate}`,
        profileCount: profiles.length,
        spreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        status: "Completed",
      });
    }

    // Calculate and log the total time taken
    const groupEndTime = new Date();
    const executionTimeMs = groupEndTime - groupStartTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round((executionTimeSec / 60) * 10) / 10;

    console.log(
      `\n=== Completed Group: ${groupName} (${groupId}) at ${groupEndTime.toLocaleTimeString()} ===`
    );
    console.log(
      `Total time taken: ${executionTimeMin} minutes (${executionTimeSec} seconds)`
    );
    if (currentSpreadsheetId) {
      console.log(
        `Spreadsheet URL: https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}/edit`
      );
    }

    return results;
  } catch (error) {
    // Log error with timing information
    const groupEndTime = new Date();
    const executionTimeMs = groupEndTime - groupStartTime;
    const executionTimeSec = Math.round(executionTimeMs / 1000);
    const executionTimeMin = Math.round((executionTimeSec / 60) * 10) / 10;

    console.error(
      `Error processing group ${groupName} after ${executionTimeMin} minutes:`,
      error
    );
    return [
      {
        groupId,
        groupName,
        profileCount: profiles.length,
        status: `Error after ${executionTimeMin} minutes: ${error.message}`,
      },
    ];
  }
};

/**
 * Processes the analytics for a specific month
 * @param {Date} monthDate - Date object representing the month to process
 * @param {Object} googleClients - Authenticated Google API clients
 */
const processMonthAnalytics = async (monthDate, googleClients) => {
  try {
    const monthRange = getMonthDateRange(monthDate);
    console.log(
      `\n=== Processing Month: ${monthRange.monthName} ${monthRange.year} ===`
    );
    console.log(`Date Range: ${monthRange.startDate} to ${monthRange.endDate}`);

    // Update folder config for this month
    const folderConfig = {
      folderId: "1OA82RSaq0On_ERovDsZYUqeoMByyWruP", // Updated folder ID
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      description: `Monthly Report - ${monthRange.monthName} ${monthRange.year}`,
    };

    // Fetch all groups with retry logic
    console.log("\n=== Fetching Customer Groups ===");
    let groups = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(
          `[API CALL] Fetching customer groups from: ${BASE_URL}/${CUSTOMER_ID}/metadata/customer/groups (attempt ${attempt}/3)`
        );
        groups = await groupUtils.getCustomerGroups(
          BASE_URL,
          CUSTOMER_ID,
          SPROUT_API_TOKEN
        );
        if (groups.length > 0) break;

        console.error(`No groups found on attempt ${attempt}/3.`);
        if (attempt < 3) {
          console.log("Waiting 10 seconds before retrying...");
          await sleep(10000);
        }
      } catch (groupError) {
        console.error(
          `Error fetching groups (attempt ${attempt}/3): ${groupError.message}`
        );
        if (attempt < 3) {
          console.log("Waiting 10 seconds before retrying...");
          await sleep(10000);
        }
      }
    }

    if (groups.length === 0) {
      console.error("No groups found after multiple attempts. Cannot proceed.");
      return [];
    }

    // Fetch all profiles with retry logic
    console.log("\n=== Fetching All Profiles ===");
    let profiles = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        profiles = await groupUtils.getAllProfiles(
          BASE_URL,
          CUSTOMER_ID,
          SPROUT_API_TOKEN
        );
        if (profiles.length > 0) break;

        console.error(`No profiles found on attempt ${attempt}/3.`);
        if (attempt < 3) {
          console.log("Waiting 10 seconds before retrying...");
          await sleep(10000);
        }
      } catch (profileError) {
        console.error(
          `Error fetching profiles (attempt ${attempt}/3): ${profileError.message}`
        );
        if (attempt < 3) {
          console.log("Waiting 10 seconds before retrying...");
          await sleep(10000);
        }
      }
    }

    if (profiles.length === 0) {
      console.error(
        "No profiles found after multiple attempts. Cannot proceed."
      );
      return [];
    }

    // Group profiles by group ID
    console.log("\n=== Grouping Profiles by Group ID ===");
    let profilesByGroup;
    try {
      profilesByGroup = groupUtils.groupProfilesByGroup(profiles, groups);
    } catch (groupingError) {
      console.error(`Error grouping profiles: ${groupingError.message}`);
      console.error("Attempting to continue with limited functionality...");
      // Create a minimal profilesByGroup with available data
      profilesByGroup = {};
      groups.forEach((group) => {
        const groupProfiles = profiles.filter(
          (profile) => profile.groups && profile.groups.includes(group.group_id)
        );
        if (groupProfiles.length > 0) {
          profilesByGroup[group.group_id] = {
            groupName: group.name,
            profiles: groupProfiles,
          };
        }
      });
    }

    // Override the global FOLDER_CONFIGS for this month's processing
    FOLDER_CONFIGS[0] = folderConfig;

    // Process each group for this month
    const monthResults = [];

    // Process groups with a delay between each to avoid hitting API quotas
    for (const [groupId, groupData] of Object.entries(profilesByGroup)) {
      const { groupName, profiles } = groupData;

      if (profiles.length > 0) {
        try {
          console.log(
            `\nProcessing group: ${groupName} (${groupId}) with ${profiles.length} profiles for ${monthRange.monthName} ${monthRange.year}`
          );
          const results = await processGroupAnalytics(
            groupId,
            groupName,
            profiles,
            googleClients
          );
          if (results && results.length > 0) {
            monthResults.push(...results);
          }

          // Add a delay after processing each group to avoid hitting API quotas
          console.log(
            `Waiting 5 minutes before processing the next group to avoid API quota limits...`
          );
          await sleep(5 * 60 * 1000); // 5 minutes in milliseconds
        } catch (error) {
          console.error(
            `Error processing group ${groupName} for ${monthRange.monthName} ${monthRange.year}: ${error.message}`
          );
          if (error.stack) {
            console.error(`Stack trace: ${error.stack}`);
          }

          // Even if there's an error, wait before trying the next group
          console.log(
            `Waiting 10 seconds before continuing to the next group...`
          );
          await sleep(10000);
        }
      } else {
        console.log(
          `Skipping group ${groupName} (${groupId}) - no profiles found`
        );
      }
    }

    return monthResults;
  } catch (error) {
    console.error(`Error processing month analytics: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return [];
  }
};

/**
 * Main function to orchestrate the entire process
 */
const main = async () => {
  try {
    const startTime = new Date();
    console.log(
      `Starting Monthly Group Analytics Processing at ${startTime.toLocaleTimeString()}`
    );

    // Track execution time
    const trackTime = (label) => {
      const currentTime = new Date();
      const elapsedMs = currentTime - startTime;
      const elapsedSec = Math.round(elapsedMs / 1000);
      const elapsedMin = Math.round((elapsedSec / 60) * 10) / 10;
      console.log(
        `[TIMING] ${label}: ${elapsedMin} minutes (${elapsedSec} seconds)`
      );
      return currentTime;
    };

    trackTime("Process started");

    // Authenticate with Google APIs and verify folder access
    const googleClients = await authenticateAndVerifyAccess();
    trackTime("Google Drive authentication complete");

    // Determine which months to process
    const monthsToProcess = [];

    // Start from January 1, 2024
    const startDate = new Date(2024, 0, 1); // January 1, 2024
    const currentDate = new Date();

    // Process each month from January 2024 to the current month
    let currentMonth = new Date(startDate);
    while (currentMonth <= currentDate) {
      monthsToProcess.push(new Date(currentMonth));
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // Process each month
    const allResults = [];
    for (const monthDate of monthsToProcess) {
      const monthResults = await processMonthAnalytics(
        monthDate,
        googleClients
      );
      if (monthResults && monthResults.length > 0) {
        allResults.push(...monthResults);
      }

      // Add delay between months if processing multiple months
      if (monthsToProcess.length > 1) {
        console.log("\nWaiting 10 minutes before processing next month...");
        await sleep(10 * 60 * 1000); // 10 minutes between months
      }
    }

    // Print summary
    console.log("\n=== Monthly Processing Complete ===");
    console.log(
      `Processed ${allResults.length} spreadsheets across ${monthsToProcess.length} months:`
    );

    // Group results by month
    const resultsByMonth = {};
    allResults.forEach((result) => {
      const monthKey = result.startDate.substring(0, 7); // YYYY-MM format
      if (!resultsByMonth[monthKey]) {
        resultsByMonth[monthKey] = [];
      }
      resultsByMonth[monthKey].push(result);
    });

    // Print summary by month
    for (const [monthKey, monthResults] of Object.entries(resultsByMonth)) {
      console.log(
        `\nMonth: ${monthKey} - ${monthResults.length} spreadsheets created:`
      );

      monthResults.forEach((result) => {
        if (result.spreadsheetUrl) {
          console.log(
            `- ${result.groupName} (${result.profileCount} profiles): ${result.spreadsheetUrl}`
          );
        } else {
          console.log(
            `- ${result.groupName} (${result.profileCount} profiles): ${result.status}`
          );
        }
      });
    }

    // Calculate and log total execution time
    const endTime = new Date();
    const totalTimeMs = endTime - startTime;
    const totalTimeMin = Math.round((totalTimeMs / 1000 / 60) * 10) / 10;

    console.log(`\nTotal execution time: ${totalTimeMin} minutes`);
    console.log(`Script completed at ${endTime.toLocaleTimeString()}`);
  } catch (error) {
    console.error(`Error in main process: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  }
};

// Set up global unhandled exception handlers to prevent crashes
process.on("uncaughtException", (error) => {
  console.error("CRITICAL ERROR: Uncaught Exception detected");
  console.error(`Error: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  console.error("The script will continue execution despite this error.");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL ERROR: Unhandled Promise Rejection detected");
  console.error(`Reason: ${reason}`);
  console.error("The script will continue execution despite this error.");
});

// Add a watchdog timer to prevent indefinite hangs
const WATCHDOG_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours max runtime
const watchdog = setTimeout(() => {
  console.error(
    `WATCHDOG ALERT: Script has been running for ${
      WATCHDOG_TIMEOUT / 1000 / 60 / 60
    } hours.`
  );
  console.error("This may indicate a hang or infinite loop condition.");
  console.error(
    "Script execution will continue, but you may want to investigate."
  );
}, WATCHDOG_TIMEOUT);
watchdog.unref(); // Don't let the watchdog prevent the process from exiting normally

// Run the main function with comprehensive error handling
main().catch((err) => {
  console.error("Unhandled error in main function:", err);
  console.error("Script execution completed with errors, but did not crash.");
});
