/**
 * Environment Configuration Utility
 *
 * This module loads environment variables from .env file and validates them.
 * It provides access to environment variables with proper type conversion and validation.
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");

// Define environment variables with defaults and validation rules
const envVars = {
  // Google API Credentials
  CLIENT_EMAIL: {
    value: process.env.CLIENT_EMAIL,
    required: true,
    validate: (value) => value && value.includes("@") && value.includes("."),
    errorMessage: "CLIENT_EMAIL must be a valid email address",
  },
  PRIVATE_KEY: {
    value: process.env.PRIVATE_KEY,
    required: true,
    validate: (value) =>
      value &&
      value.includes("BEGIN PRIVATE KEY") &&
      value.includes("END PRIVATE KEY"),
    errorMessage: "PRIVATE_KEY must be a valid private key in PEM format",
  },
  PROJECT_ID: {
    value: process.env.PROJECT_ID || "automated-sheets-458809",
    required: false,
    validate: (value) => value && value.length > 0,
    errorMessage: "PROJECT_ID must be a valid Google Cloud project ID",
  },
  PRIVATE_KEY_ID: {
    value:
      process.env.PRIVATE_KEY_ID || "53e7d30a15c70a44724f0cac7fa79a3eb1b16fae",
    required: false,
    validate: (value) => value && value.length > 0,
    errorMessage: "PRIVATE_KEY_ID must be a valid key ID",
  },
  CLIENT_ID: {
    value: process.env.CLIENT_ID || "103089537597211538910",
    required: false,
    validate: (value) => value && value.length > 0,
    errorMessage: "CLIENT_ID must be a valid client ID",
  },

  // Google Drive Settings
  DRIVE_FOLDER_ID: {
    value: process.env.DRIVE_FOLDER_ID,
    required: true,
    validate: (value) => value && value.length > 10,
    errorMessage: "DRIVE_FOLDER_ID must be a valid Google Drive folder ID",
  },
  SPREADSHEET_ID: {
    value: process.env.SPREADSHEET_ID,
    required: false,
    validate: (value) => !value || value.length > 10,
    errorMessage: "SPREADSHEET_ID must be a valid Google Sheets spreadsheet ID",
  },
  OUTPUT_FOLDER_ID: {
    value: process.env.OUTPUT_FOLDER_ID,
    required: false,
    validate: (value) => !value || value.length > 10,
    errorMessage: "OUTPUT_FOLDER_ID must be a valid Google Drive folder ID",
  },

  // Application Settings
  PORT: {
    value: process.env.PORT || 3000,
    required: false,
    transform: (value) => parseInt(value, 10),
    validate: (value) => !isNaN(value) && value > 0 && value < 65536,
    errorMessage: "PORT must be a valid port number",
  },
  NODE_ENV: {
    value: process.env.NODE_ENV || "development",
    required: false,
    validate: (value) => ["development", "production", "test"].includes(value),
    errorMessage: "NODE_ENV must be one of: development, production, test",
  },
  ENABLE_SCHEDULER: {
    value: process.env.ENABLE_SCHEDULER || "false",
    required: false,
    transform: (value) => value === "true",
    errorMessage: 'ENABLE_SCHEDULER must be either "true" or "false"',
  },
  JWT_SECRET: {
    value: process.env.JWT_SECRET,
    required: true,
    validate: (value) => value && value.length >= 32,
    errorMessage: "JWT_SECRET must be at least 32 characters long for security",
  },
  JWT_EXPIRY: {
    value: process.env.JWT_EXPIRY || "24h",
    required: false,
    validate: (value) =>
      value &&
      (/^\d+$/.test(value) || // Number of seconds
        /^\d+d$/.test(value) || // Days
        /^\d+h$/.test(value) || // Hours
        /^\d+m$/.test(value) || // Minutes
        /^\d+s$/.test(value)), // Seconds
    errorMessage:
      'JWT_EXPIRY must be a valid duration format (e.g., "24h", "7d", "3600")',
  },

  // Table Formatting
  TABLE_HEADER_BACKGROUND_COLOR: {
    value: process.env.TABLE_HEADER_BACKGROUND_COLOR || "#4285F4",
    required: false,
    validate: (value) => /^#[0-9A-Fa-f]{6}$/.test(value),
    errorMessage:
      "TABLE_HEADER_BACKGROUND_COLOR must be a valid hex color code",
  },
  TABLE_HEADER_TEXT_COLOR: {
    value: process.env.TABLE_HEADER_TEXT_COLOR || "#FFFFFF",
    required: false,
    validate: (value) => /^#[0-9A-Fa-f]{6}$/.test(value),
    errorMessage: "TABLE_HEADER_TEXT_COLOR must be a valid hex color code",
  },
  TABLE_ALTERNATE_ROW_COLOR: {
    value: process.env.TABLE_ALTERNATE_ROW_COLOR || "#F3F3F3",
    required: false,
    validate: (value) => /^#[0-9A-Fa-f]{6}$/.test(value),
    errorMessage: "TABLE_ALTERNATE_ROW_COLOR must be a valid hex color code",
  },
  TABLE_BORDER_COLOR: {
    value: process.env.TABLE_BORDER_COLOR || "#CCCCCC",
    required: false,
    validate: (value) => /^#[0-9A-Fa-f]{6}$/.test(value),
    errorMessage: "TABLE_BORDER_COLOR must be a valid hex color code",
  },
  TABLE_FONT_FAMILY: {
    value: process.env.TABLE_FONT_FAMILY || "Arial",
    required: false,
    errorMessage: "TABLE_FONT_FAMILY must be a valid font name",
  },
  TABLE_FONT_SIZE: {
    value: process.env.TABLE_FONT_SIZE || "11",
    required: false,
    transform: (value) => parseInt(value, 10),
    validate: (value) => !isNaN(value) && value > 0 && value < 100,
    errorMessage: "TABLE_FONT_SIZE must be a valid font size",
  },

  // Error Handling
  MAX_RETRIES: {
    value: process.env.MAX_RETRIES || "5",
    required: false,
    transform: (value) => parseInt(value, 10),
    validate: (value) => !isNaN(value) && value > 0 && value <= 10,
    errorMessage: "MAX_RETRIES must be a number between 1 and 10",
  },
  RETRY_DELAY: {
    value: process.env.RETRY_DELAY || "5000",
    required: false,
    transform: (value) => parseInt(value, 10),
    validate: (value) => !isNaN(value) && value > 0,
    errorMessage: "RETRY_DELAY must be a positive number",
  },
};

// Validate environment variables
const validateEnv = () => {
  const missingVars = [];
  const invalidVars = [];

  for (const [key, config] of Object.entries(envVars)) {
    // Check if required variables are present
    if (
      config.required &&
      (!config.value ||
        (typeof config.value === "string" && config.value.trim() === ""))
    ) {
      missingVars.push(key);
      continue;
    }

    // Skip validation for empty optional variables
    if (
      !config.required &&
      (!config.value ||
        (typeof config.value === "string" && config.value.trim() === ""))
    ) {
      continue;
    }

    // Apply transformation if defined
    if (config.transform && config.value) {
      config.value = config.transform(config.value);
    }

    // Validate the value if validation is defined
    if (config.validate && !config.validate(config.value)) {
      invalidVars.push({ key, message: config.errorMessage });
    }
  }

  // Handle missing required variables
  if (missingVars.length > 0) {
    console.error(
      "\nThe following required environment variables are missing:"
    );
    missingVars.forEach((variable) => console.error(`- ${variable}`));
    console.error(
      "\nPlease set these variables in your .env file or environment."
    );
    console.error("You can use the .env.example file as a template.\n");
  }

  // Handle invalid variables
  if (invalidVars.length > 0) {
    console.error("\nThe following environment variables are invalid:");
    invalidVars.forEach(({ key, message }) =>
      console.error(`- ${key}: ${message}`)
    );
    console.error(
      "\nPlease correct these values in your .env file or environment.\n"
    );
  }

  // Exit if there are any issues
  if (missingVars.length > 0 || invalidVars.length > 0) {
    console.error(
      "Environment configuration validation failed. Please fix the issues above."
    );

    // In development, create a template .env file if it doesn't exist
    if (
      process.env.NODE_ENV !== "production" &&
      !fs.existsSync(path.join(__dirname, "..", ".env"))
    ) {
      const envExamplePath = path.join(__dirname, "..", ".env.example");
      if (fs.existsSync(envExamplePath)) {
        const template = fs.readFileSync(envExamplePath, "utf8");
        fs.writeFileSync(path.join(__dirname, "..", ".env"), template);
        console.log(
          "Created a new .env file from the template. Please fill in the required values."
        );
      } else {
        console.log(
          "No .env or .env.example file found. Please create a .env file with the required variables."
        );
      }
    }

    if (process.env.NODE_ENV === "production") {
      // In production, exit the process
      process.exit(1);
    }
  }

  return missingVars.length === 0 && invalidVars.length === 0;
};

// Create configuration object with validated environment variables
const config = {};
for (const [key, envVar] of Object.entries(envVars)) {
  config[key] = envVar.value;
}

// Validate and export
validateEnv();
module.exports = config;
