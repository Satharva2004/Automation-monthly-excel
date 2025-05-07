/**
 * Twitter analytics processing module
 */
const { safeNumber } = require("../utils/api");

// Sheet configuration
const SHEET_NAME = "Twitter";
const PROFILE_ID = "6911594";

// Sheet headers
const HEADERS = [
  "Date",
  "Network Type",
  "Profile Name",
  "Network ID",
  "Profile ID",
  "Lifetime Followers Count",
  "Net Follower Growth",
  "Total Impressions",
  "Total Media Views",
  "Total Video Views",
  "Total Reactions",
  "Total Likes",
  "Total Comments/Replies",
  "Total Shares/Reposts",
  "Total Content Clicks",
  "Total Link Clicks",
  "Total Other Content Clicks",
  "Total Media Clicks",
  "Total Hashtag Clicks",
  "Total Expand Clicks",
  "Total Profile Clicks",
  "Other Engagement Actions",
  "Total App Engagements",
  "Total App Installs",
  "Total App Opens",
  "Posts Published Count",
  "Posts by Post Type",
  "Posts by Content Type",
  "Total Engagement Actions",
  "Engagement Rate % (per Impression)",
  "Engagement Rate % (per Follower)",
  "Click-Through Rate %",
];

/**
 * Format Twitter analytics data for Google Sheets
 * @param {Object} dataPoint - Data point from API
 * @param {Object} profileData - Profile metadata
 * @returns {Array|null} Formatted row for Google Sheets
 */
const formatAnalyticsData = (dataPoint, profileData) => {
  try {
    if (!dataPoint || !dataPoint.metrics) {
      console.error(
        "Invalid Twitter data point received for formatting:",
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
        "No reporting period found in Twitter dataPoint:",
        dataPoint
      );
      return null;
    }

    const date = new Date(reportingPeriod).toISOString().split("T")[0];

    const followers = metrics["lifetime_snapshot.followers_count"] || 0;
    const impressions = metrics["impressions"] || 0;
    const postLinkClicks = metrics["post_link_clicks"] || 0;
    const otherClicks = metrics["post_content_clicks_other"] || 0;
    const otherEngagements = metrics["engagements_other"] || 0;

    // Calculate total engagement actions (Sprout's default Engagements calculation for Twitter/X)
    const engagements =
      parseFloat(metrics["likes"] || 0) +
      parseFloat(metrics["comments_count"] || 0) + // Comments/Replies on Twitter
      parseFloat(metrics["shares_count"] || 0) + // Shares/Reposts on Twitter
      parseFloat(postLinkClicks) +
      parseFloat(otherClicks) +
      parseFloat(otherEngagements);

    // Calculate engagement rate as percentage of followers
    const engagementRatePerFollower =
      followers > 0
        ? parseFloat(((engagements / followers) * 100).toFixed(2))
        : 0;

    // Calculate engagement rate as percentage of impressions
    const engagementRatePerImpression =
      impressions > 0
        ? parseFloat(((engagements / impressions) * 100).toFixed(2))
        : 0;

    // Calculate click-through rate as percentage of impressions
    const clickThroughRate =
      impressions > 0
        ? parseFloat(((postLinkClicks / impressions) * 100).toFixed(2))
        : 0;

    return [
      date, // Date
      profileData ? profileData.network_type : "", // Network Type
      profileData ? profileData.name : "", // Profile Name
      profileData ? profileData.network_id : "", // Network ID
      dataPoint.dimensions.customer_profile_id || "", // Profile ID
      safeNumber(metrics["lifetime_snapshot.followers_count"]), // Lifetime Followers Count
      safeNumber(metrics["net_follower_growth"]), // Net Follower Growth
      safeNumber(metrics["impressions"]), // Total Impressions
      safeNumber(metrics["post_media_views"]), // Total Media Views
      safeNumber(metrics["video_views"]), // Total Video Views
      safeNumber(metrics["reactions"]), // Total Reactions
      safeNumber(metrics["likes"]), // Total Likes
      safeNumber(metrics["comments_count"]), // Total Comments/Replies
      safeNumber(metrics["shares_count"]), // Total Shares/Reposts
      safeNumber(metrics["post_content_clicks"]), // Total Content Clicks
      safeNumber(metrics["post_link_clicks"]), // Total Link Clicks
      safeNumber(metrics["post_content_clicks_other"]), // Total Other Content Clicks
      safeNumber(metrics["post_media_clicks"]), // Total Media Clicks
      safeNumber(metrics["post_hashtag_clicks"]), // Total Hashtag Clicks
      safeNumber(metrics["post_detail_expand_clicks"]), // Total Expand Clicks
      safeNumber(metrics["post_profile_clicks"]), // Total Profile Clicks
      safeNumber(metrics["engagements_other"]), // Other Engagement Actions
      safeNumber(metrics["post_app_engagements"]), // Total App Engagements
      safeNumber(metrics["post_app_installs"]), // Total App Installs
      safeNumber(metrics["post_app_opens"]), // Total App Opens
      safeNumber(metrics["posts_sent_count"]), // Posts Published Count
      safeNumber(metrics["posts_sent_by_post_type"]), // Posts by Post Type
      safeNumber(metrics["posts_sent_by_content_type"]), // Posts by Content Type
      engagements, // Total Engagement Actions
      engagementRatePerImpression, // Engagement Rate % (per Impression)
      engagementRatePerFollower, // Engagement Rate % (per Follower)
      clickThroughRate, // Click-Through Rate %
    ];
  } catch (err) {
    console.error("Error formatting Twitter analytics data:", err.message);
    return null;
  }
};

/**
 * Setup Twitter sheet headers
 * @param {Object} sheetsUtil - Sheets utility module
 * @param {Object} auth - Google auth client
 * @param {string} spreadsheetId - Google Spreadsheet ID
 * @returns {Promise<boolean>} Success status
 */
const setupHeaders = async (sheetsUtil, auth, spreadsheetId) => {
  return sheetsUtil.setupSheetHeaders(auth, spreadsheetId, SHEET_NAME, HEADERS);
};

/**
 * Update Twitter sheet with data
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
      followersCount: Math.max(...currentMonthData.map((row) => row[5])), // Lifetime Followers Count
      netGrowth: currentMonthData.reduce((sum, row) => sum + row[6], 0), // Net Follower Growth
      followersGained: currentMonthData.reduce((sum, row) => sum + row[6], 0), // Net Follower Growth (as gained)
      followersLost: 0, // Not directly available in Twitter data
      postsCount: currentMonthData.reduce((sum, row) => sum + row[25], 0), // Posts Published Count
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
      "", // Total Impressions
      "", // Total Media Views
      "", // Total Video Views
      "", // Total Reactions
      "", // Total Likes
      "", // Total Comments/Replies
      "", // Total Shares/Reposts
      "", // Total Content Clicks
      "", // Total Link Clicks
      "", // Total Other Content Clicks
      "", // Total Media Clicks
      "", // Total Hashtag Clicks
      "", // Total Expand Clicks
      "", // Total Profile Clicks
      "", // Other Engagement Actions
      "", // Total App Engagements
      "", // Total App Installs
      "", // Total App Opens
      monthlyTotals.postsCount,
      "", // Posts by Post Type
      "", // Posts by Content Type
      "", // Total Engagement Actions
      "", // Engagement Rate % (per Impression)
      "", // Engagement Rate % (per Follower)
      "", // Click-Through Rate %
    ];

    // Add summary row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:AE`,
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
  PROFILE_ID,
  HEADERS,
  formatAnalyticsData,
  setupHeaders,
  updateSheet,
  addMonthlySummary,
};
