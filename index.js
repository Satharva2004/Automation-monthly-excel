/**
 * Sprout Social Analytics to Google Sheets - Render Deployment
 * ============================================================
 * This file serves as the entry point for Render deployment.
 * It provides HTTP endpoints and handles direct execution for cron jobs.
 */

const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// Path to the analytics script
const ANALYTICS_SCRIPT = path.join(__dirname, "schedule-daily-update.js");

// Set timeout for long-running operations (30 minutes)
const EXECUTION_TIMEOUT = 30 * 60 * 1000;

// Scheduler settings
const SCHEDULER_ENABLED = process.env.ENABLE_SCHEDULER === "true";
const TARGET_HOUR = 2; // 2 AM
const TARGET_MINUTE = 0; // 0 minutes

/**
 * Simple in-memory scheduler that runs a task at a specific time
 */
const setupInternalScheduler = () => {
  if (!SCHEDULER_ENABLED) {
    console.log(
      "Internal scheduler is disabled. Set ENABLE_SCHEDULER=true to enable."
    );
    return;
  }

  console.log(
    `Internal scheduler enabled. Will run daily at ${TARGET_HOUR}:${
      TARGET_MINUTE < 10 ? "0" + TARGET_MINUTE : TARGET_MINUTE
    }`
  );

  // Function to check if it's time to run
  const checkSchedule = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if it's the target time (with a 1-minute window)
    if (currentHour === TARGET_HOUR && currentMinute === TARGET_MINUTE) {
      console.log(
        `Scheduled time reached (${TARGET_HOUR}:${TARGET_MINUTE}). Running analytics...`
      );
      runAnalytics()
        .then(() => console.log("Scheduled analytics completed successfully"))
        .catch((err) => console.error("Error in scheduled analytics:", err));
    }
  };

  // Check every minute
  setInterval(checkSchedule, 60 * 1000);
  console.log("Scheduler initialized. Checking schedule every minute.");
};

/**
 * Run the analytics script
 * @returns {Promise<string>} Output from the script
 */
const runAnalytics = () => {
  return new Promise((resolve, reject) => {
    console.log(`Running analytics script: ${ANALYTICS_SCRIPT}`);

    const process = exec(`node ${ANALYTICS_SCRIPT}`, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    let output = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
      console.log(data.toString());
    });

    process.stderr.on("data", (data) => {
      output += data.toString();
      console.error(data.toString());
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(`Analytics script exited with code ${code}: ${output}`)
        );
      }
    });
  });
};

// Define HTTP routes
app.get("/", async (req, res) => {
  try {
    res.status(200).json({
      status: "online",
      message: "Sprout Social Analytics API is running",
      timestamp: new Date().toISOString(),
      scheduler: SCHEDULER_ENABLED ? "enabled" : "disabled",
      next_run: SCHEDULER_ENABLED
        ? `Daily at ${TARGET_HOUR}:${
            TARGET_MINUTE < 10 ? "0" + TARGET_MINUTE : TARGET_MINUTE
          } UTC`
        : "N/A",
    });
  } catch (error) {
    console.error("Error in root endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/run", async (req, res) => {
  try {
    // For web requests, respond quickly and run in background
    res.status(200).json({
      status: "processing",
      message: "Analytics process started in the background",
      timestamp: new Date().toISOString(),
    });

    // Run analytics in background after response is sent
    runAnalytics()
      .then(() => console.log("Analytics completed successfully"))
      .catch((err) => {
        console.error("Error running analytics:", err);
        // Don't exit the process for web requests
      });
  } catch (error) {
    console.error("Error starting analytics process:", error);
    res.status(500).json({ error: "Failed to start analytics process" });
  }
});

// Add a health check endpoint for Railway monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Available endpoints:");
  console.log("  - GET /: Check API status");
  console.log("  - GET /run: Trigger analytics update");

  // Initialize the internal scheduler
  setupInternalScheduler();

  // If this is a direct invocation from a cron job (CRON=true)
  if (process.env.CRON === "true") {
    console.log("Running as cron job");

    // Set a timeout to force exit after max execution time
    const timeoutId = setTimeout(() => {
      console.error("Execution timed out after", EXECUTION_TIMEOUT, "ms");
      process.exit(1); // Exit with error code
    }, EXECUTION_TIMEOUT);

    // Run analytics and then exit the process with appropriate code
    runAnalytics()
      .then((output) => {
        console.log("Cron job completed successfully");
        clearTimeout(timeoutId);
        server.close(() => process.exit(0)); // Clean exit
      })
      .catch((error) => {
        console.error("Cron job failed:", error);
        clearTimeout(timeoutId);
        server.close(() => process.exit(1)); // Exit with error code
      });
  }
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Export the Express app for module usage
module.exports = app;
