/**
 * Daily Analytics Script for Sprout Social Analytics
 *
 * This script runs the analytics process without using node-schedule.
 * Designed to be triggered by Render's cron job service or directly.
 */

const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const tokenRefresh = require("./utils/token-refresh");

// Path to the main analytics script
const scriptPath = path.resolve(__dirname, "group-analytics.js");
// Fallback to simple-analytics.js if it exists
const simpleScriptPath = path.resolve(__dirname, "simple-analytics.js");

// Log file path
const LOG_PATH = path.join(__dirname, "daily-update-log.txt");

/**
 * Log a message to both console and log file
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  console.log(logMessage);

  // Append to log file
  fs.appendFileSync(LOG_PATH, logMessage + "\n");
}

/**
 * Validate and refresh Google token before running analytics
 */
async function refreshTokenBeforeAnalytics() {
  try {
    log("Checking Google API token validity...");
    await tokenRefresh.getRefreshedClients();
    log("Token is valid or has been refreshed successfully");
    return true;
  } catch (error) {
    log(`Error refreshing token: ${error.message}`);
    return false;
  }
}

/**
 * Run the analytics script and handle any errors
 */
async function runAnalyticsScript() {
  // First refresh token to ensure we have valid credentials
  const tokenValid = await refreshTokenBeforeAnalytics();
  if (!tokenValid) {
    log(
      "Token refresh failed. Proceeding with analytics, but it might fail if credentials are invalid."
    );
  }

  // Determine which script to run
  let analyticsScript;
  if (fs.existsSync(simpleScriptPath)) {
    analyticsScript = simpleScriptPath;
    log("Using simplified analytics script: simple-analytics.js");
  } else {
    analyticsScript = scriptPath;
    log("Using standard analytics script: group-analytics.js");
  }

  const startTime = new Date();
  log(`\n=== STARTING ANALYTICS UPDATE ===`);
  log(`Start time: ${startTime.toLocaleString()}`);
  log(`Script path: ${analyticsScript}`);
  log(`Max buffer size: 50MB`);
  log(`\n=== EXECUTION STARTING ===`);

  // Execute the script with increased buffer size (50MB)
  const child = exec(
    `node "${analyticsScript}"`,
    { maxBuffer: 50 * 1024 * 1024 },
    (error, stdout, stderr) => {
      const endTime = new Date();
      const executionTimeMs = endTime - startTime;
      const executionTimeSec = Math.round(executionTimeMs / 1000);
      const executionTimeMin = Math.round((executionTimeSec / 60) * 10) / 10;

      if (error) {
        log(`Error executing script: ${error.message}`);
        log(
          `Script failed after ${executionTimeMin} minutes (${executionTimeSec} seconds)`
        );
        return;
      }

      if (stderr) {
        log(
          `Script stderr: ${stderr.substring(0, 1000)}${
            stderr.length > 1000 ? "..." : ""
          }`
        );
      }

      log(
        `Analytics update completed successfully at ${endTime.toLocaleTimeString()}`
      );
      log(
        `Total execution time: ${executionTimeMin} minutes (${executionTimeSec} seconds)`
      );
      log(`Output: ${stdout.substring(0, 500)}...`); // Log first 500 chars of output
    }
  );

  // Handle process errors
  child.on("error", (error) => {
    log(`Failed to start script: ${error.message}`);
  });
}

// Run the analytics immediately (this is what Render's cron will trigger)
log("Running analytics update...");
runAnalyticsScript();

// Handle uncaught exceptions to prevent crashes
process.on("uncaughtException", (error) => {
  log(`Uncaught exception: ${error.message}`);
  log(error.stack);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  log("Unhandled promise rejection");
  log(`Reason: ${reason}`);
});

// Set a timeout to force exit after 2 hours (prevent hanging)
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
setTimeout(() => {
  log(
    `Forcing exit after ${
      TWO_HOURS_MS / (60 * 1000)
    } minutes timeout to prevent hanging`
  );
  process.exit(0);
}, TWO_HOURS_MS);
