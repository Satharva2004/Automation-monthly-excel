/**
 * YouTube analytics processing module
 */
const { safeNumber } = require("../utils/api");

// Sheet configuration
const SHEET_NAME = "Youtube";

// Sheet headers
const HEADERS = [
  "Date",
  "Network",
  "Profile Name",
  "Network ID",
  "Profile ID",
  "Followers Count",
  "Net Follower Growth",
  "Followers Gained",
  "Followers Lost",
  "Posts Sent Count",
  "netFollowerGrowths",
  "videoEngagements",
  "videoViews",
];

/**
 * Format YouTube analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error(
        "Invalid YouTube data point received for formatting:",
        dataPoint
      );
      return null;
    }

    const metrics = dataPoint.metrics;
    const reportingPeriod =
      dataPoint.dimensions &&
      (dataPoint.dimensions["reporting_period.by(day)"] ||
        dataPoint.dimensions.reporting_period);

    if (!reportingPeriod) {
      console.error(
        "No reporting period found in YouTube dataPoint:",
        dataPoint
      );
      return null;
    }

    const date = new Date(reportingPeriod).toISOString().split("T")[0];
    const netFollowerGrowths =
      parseFloat(metrics["followers_gained"] || 0) -
      parseFloat(metrics["followers_lost"] || 0);

    const videoEngagements =
      parseFloat(metrics["comments_count"] || 0) +
      parseFloat(metrics["likes"] || 0) +
      parseFloat(metrics["dislikes"] || 0) +
      parseFloat(metrics["shares_count"] || 0) +
      parseFloat(metrics["followers_gained"] || 0) +
      parseFloat(metrics["annotation_clicks"] || 0) +
      parseFloat(metrics["card_clicks"] || 0);

    const videoViews = parseFloat(metrics["video_views"] || 0);
    const engagementsPerView =
      videoViews > 0
        ? parseFloat((videoEngagements / videoViews).toFixed(4))
        : 0;

    // Remove totalGrowthSummary from the row array
    const row = [
      date,
      profileData.network_type,
      profileData.name,
      profileData.network_id,
      profileData.profile_id,
      metrics["lifetime_snapshot.followers_count"] || 0,
      metrics["net_follower_growth"] || 0,
      metrics["followers_gained"] || 0,
      metrics["followers_lost"] || 0,
      metrics["posts_sent_count"] || 0,
      netFollowerGrowths,
      videoEngagements,
      videoViews,
    ];

    return row;
  } catch (error) {
    console.error(`Error formatting YouTube analytics data: ${error.message}`);
    return null;
  }
};

/**
 * Setup YouTube sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update YouTube sheet with data
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @param {Array} rows - Data rows
 * @returns {Promise<boolean>} Success status
 */
const updateSheet = async (sheetsUtil, auth, spreadsheetId, rows) => {
  return sheetsUtil.updateSheet(auth, spreadsheetId, rows, SHEET_NAME);
};

/**
 * Add monthly summary to the sheet
 * @param {Object} sheets - Google Sheets API client
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {Array} data - Array of data rows
 */
const addMonthlySummary = async (sheets, spreadsheetId, data) => {
  try {
    // Get the last day of the current month
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Filter data for the current month
    const currentMonthData = data.filter((row) => {
      const rowDate = new Date(row[0]);
      return (
        rowDate.getMonth() === today.getMonth() &&
        rowDate.getFullYear() === today.getFullYear()
      );
    });

    if (currentMonthData.length === 0) return;

    // Calculate monthly totals
    const monthlyTotals = {
      followersCount: Math.max(...currentMonthData.map((row) => row[5])), // Followers Count
      netGrowth: currentMonthData.reduce((sum, row) => sum + row[6], 0), // Net Follower Growth
      followersGained: currentMonthData.reduce((sum, row) => sum + row[7], 0), // Followers Gained
      followersLost: currentMonthData.reduce((sum, row) => sum + row[8], 0), // Followers Lost
      postsCount: currentMonthData.reduce((sum, row) => sum + row[9], 0), // Posts Sent Count
      videoEngagements: currentMonthData.reduce((sum, row) => sum + row[11], 0), // Video Engagements
      videoViews: currentMonthData.reduce((sum, row) => sum + row[12], 0), // Video Views
    };

    // Create summary row
    const summaryRow = [
      lastDay.toISOString().split("T")[0],
      "Monthly Summary",
      "TOTAL",
      "",
      "",
      monthlyTotals.followersCount,
      monthlyTotals.netGrowth,
      monthlyTotals.followersGained,
      monthlyTotals.followersLost,
      monthlyTotals.postsCount,
      monthlyTotals.netGrowth, // netFollowerGrowths
      monthlyTotals.videoEngagements,
      monthlyTotals.videoViews,
    ];

    // Add summary row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:M`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [summaryRow],
      },
    });

    // Style the summary row
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheet = response.data.sheets.find(
      (s) => s.properties.title === SHEET_NAME
    );
    if (!sheet) return;

    const lastRow = currentMonthData.length + 1; // +1 for header row

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheet.properties.sheetId,
                startRowIndex: lastRow,
                endRowIndex: lastRow + 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 11,
                  },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields:
                "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("Error adding monthly summary:", error);
  }
};

module.exports = {
  SHEET_NAME,
  HEADERS,
  formatAnalyticsData,
  setupHeaders,
  updateSheet,
  addMonthlySummary,
};
