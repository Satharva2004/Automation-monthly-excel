/**
 * LinkedIn analytics processing module
 */
const { safeNumber } = require("../utils/api");

// Network types that should be processed as LinkedIn
const LINKEDIN_NETWORK_TYPES = ["linkedin", "linkedin_company"];

// Sheet configuration
const SHEET_NAME = "Linkedin";

// Sheet headers
const HEADERS = [
  "Date",
  "Network Type",
  "Profile Name",
  "Network ID",
  "Profile ID",
  "Net Follower Growth",
  "New Followers Gained",
  "Followers Lost",
  "Organic Impressions",
  "Paid Impressions",
  "Total Reactions",
  "Total Comments",
  "Total Shares",
  "Total Link Clicks",
  "Total Content Clicks",
  "Posts Published Count",
  "Total Clicks",
  "Total Impressions",
  "Lifetime Followers Count",
  "Total Engagement Actions",
  "Engagement Rate % (per Impression)",
  "Engagement Rate % (per Follower)",
  "Click-Through Rate %"
];

/**
 * Check if the network type should be processed as LinkedIn
 * @param {string} networkType - Network type from the profile
 * @returns {boolean} True if the network type should be processed as LinkedIn
 */
const isLinkedInType = (networkType) => {
  return LINKEDIN_NETWORK_TYPES.includes(networkType);
};

/**
 * Format LinkedIn analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error(
        "Invalid LinkedIn data point received for formatting:",
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
        "No reporting period found in LinkedIn dataPoint:",
        dataPoint
      );
      return null;
    }

    const date = new Date(reportingPeriod).toISOString().split("T")[0];

    // Calculate total engagement actions
    const engagements =
      parseFloat(metrics["reactions"] || 0) +
      parseFloat(metrics["comments_count"] || 0) +
      parseFloat(metrics["shares_count"] || 0) +
      parseFloat(metrics["post_link_clicks"] || 0) +
      parseFloat(metrics["post_content_clicks"] || 0);

    // Get total impressions and lifetime followers count
    const impressions = parseFloat(metrics["impressions"] || 0);
    const followersCount = parseFloat(
      metrics["lifetime_snapshot.followers_count"] || 0
    );

    // Calculate engagement rate as percentage of impressions
    const engagementRatePerImpression =
      impressions > 0
        ? parseFloat(((engagements / impressions) * 100).toFixed(2))
        : 0;

    // Calculate engagement rate as percentage of followers
    const engagementRatePerFollower =
      followersCount > 0
        ? parseFloat(((engagements / followersCount) * 100).toFixed(2))
        : 0;

    // Calculate click-through rate as percentage of impressions
    const clickThroughRate =
      impressions > 0
        ? parseFloat(
            (
              ((parseFloat(metrics["post_link_clicks"] || 0) +
                parseFloat(metrics["post_content_clicks"] || 0)) /
                impressions) *
              100
            ).toFixed(2)
          )
        : 0;

    // Map the data in the correct order according to the sheet headers
    const row = [
      date, // Date
      profileData.network_type, // Network Type
      profileData.name, // Profile Name
      profileData.network_id, // Network ID
      profileData.customer_profile_id, // Profile ID
      safeNumber(metrics["net_follower_growth"]), // Net Follower Growth
      safeNumber(metrics["followers_gained"]), // New Followers Gained
      safeNumber(metrics["followers_lost"]), // Followers Lost
      safeNumber(metrics["impressions_organic"]), // Organic Impressions
      safeNumber(metrics["impressions_paid"]), // Paid Impressions
      safeNumber(metrics["reactions"]), // Total Reactions
      safeNumber(metrics["comments_count"]), // Total Comments
      safeNumber(metrics["shares_count"]), // Total Shares
      safeNumber(metrics["post_link_clicks"]), // Total Link Clicks
      safeNumber(metrics["post_content_clicks"]), // Total Content Clicks
      safeNumber(metrics["posts_sent_count"]), // Posts Published Count
      safeNumber(metrics["post_link_clicks"]) +
        safeNumber(metrics["post_content_clicks"]), // Total Clicks
      safeNumber(metrics["impressions"]), // Total Impressions
      safeNumber(metrics["lifetime_snapshot.followers_count"]), // Lifetime Followers Count
      engagements, // Total Engagement Actions
      engagementRatePerImpression, // Engagement Rate % (per Impression)
      engagementRatePerFollower, // Engagement Rate % (per Follower)
      clickThroughRate // Click-Through Rate %
    ];

    console.log("Formatted LinkedIn row:", row);
    return row;
  } catch (error) {
    console.error(`Error formatting LinkedIn analytics data: ${error.message}`);
    console.error("Data point:", dataPoint);
    console.error("Profile data:", profileData);
    return null;
  }
};

/**
 * Setup LinkedIn sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update LinkedIn sheet with data
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
    const currentMonthData = data.filter(row => {
      const rowDate = new Date(row[0]);
      return rowDate.getMonth() === today.getMonth() && 
             rowDate.getFullYear() === today.getFullYear();
    });

    if (currentMonthData.length === 0) return;

    // Calculate monthly totals
    const monthlyTotals = {
      followersCount: Math.max(...currentMonthData.map(row => row[18])), // Lifetime Followers Count
      netGrowth: currentMonthData.reduce((sum, row) => sum + row[5], 0), // Net Follower Growth
      followersGained: currentMonthData.reduce((sum, row) => sum + row[6], 0), // New Followers Gained
      followersLost: currentMonthData.reduce((sum, row) => sum + row[7], 0), // Followers Lost
      postsCount: currentMonthData.reduce((sum, row) => sum + row[15], 0), // Posts Published Count
    };

    // Create summary row
    const summaryRow = [
      lastDay.toISOString().split('T')[0],
      'Monthly Summary',
      'TOTAL',
      '',
      '',
      monthlyTotals.netGrowth,
      monthlyTotals.followersGained,
      monthlyTotals.followersLost,
      '', // Organic Impressions
      '', // Paid Impressions
      '', // Total Reactions
      '', // Total Comments
      '', // Total Shares
      '', // Total Link Clicks
      '', // Total Content Clicks
      monthlyTotals.postsCount,
      '', // Total Clicks
      '', // Total Impressions
      monthlyTotals.followersCount,
      '', // Total Engagement Actions
      '', // Engagement Rate % (per Impression)
      '', // Engagement Rate % (per Follower)
      ''  // Click-Through Rate %
    ];

    // Add summary row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:W`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [summaryRow]
      }
    });

    // Style the summary row
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false
    });

    const sheet = response.data.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheet) return;

    const lastRow = currentMonthData.length + 1; // +1 for header row

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: sheet.properties.sheetId,
              startRowIndex: lastRow,
              endRowIndex: lastRow + 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 11
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        }]
      }
    });

  } catch (error) {
    console.error('Error adding monthly summary:', error);
  }
};

module.exports = {
  SHEET_NAME,
  HEADERS,
  formatAnalyticsData,
  setupHeaders,
  updateSheet,
  isLinkedInType,
  addMonthlySummary
};
