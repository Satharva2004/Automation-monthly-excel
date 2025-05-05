# Render Deployment Guide

This guide provides step-by-step instructions for deploying your Sprout Social Analytics application to Render.

## Environment Variables for Render

Copy these variables into your Render Dashboard Environment Variables section:

```
# API Credentials
SPROUT_API_TOKEN=MjQyNjQ1MXwxNzQyNzk4MTc4fDQ0YmU1NzQ4LWI1ZDAtNDhkMi04ODQxLWE1YzM1YmI4MmNjNQ==
CUSTOMER_ID=2426451

# Google Drive Folder ID
DRIVE_FOLDER_ID=1usYEd9TeNI_2gapA-dLK4y27zvvWJO8r

# Application Settings
NODE_ENV=production
PORT=3000
```

## Deployment Steps

### 1. Prepare Your Code

1. Make sure your code is in a Git repository (GitHub is preferred for Render integration)
2. Ensure your `service-account-key.json` file is included in the repository
3. Verify that all dependencies are listed in `package.json`
4. Commit all changes to your repository

### 2. Set Up Render Account

1. Go to [Render](https://render.com/) and sign up or log in
2. Connect your GitHub account to Render

### 3. Deploy using Render Blueprint (Recommended)

1. In the Render dashboard, click "New" and select "Blueprint"
2. Connect to your GitHub repository
3. Render will detect the `render.yaml` file and propose services to create
4. Review the settings for the web service and cron job
5. Click "Apply" to create the services as defined in your `render.yaml`

### 4. Manual Deployment (Alternative)

If the Blueprint approach doesn't work, you can manually create the services:

#### Web Service

1. In the Render dashboard, click "New" → "Web Service"
2. Connect to your GitHub repository
3. Configure the web service:
   - **Name**: `sprout-analytics`
   - **Environment**: `Node`
   - **Region**: Choose the region closest to you
   - **Branch**: `main` (or your default branch)
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Choose "Starter" or higher (Free tier will sleep after inactivity)
   - **Add Environment Variables**: Copy from the environment variables section above
4. Click "Create Web Service"

#### Cron Job

1. In the Render dashboard, click "New" → "Cron Job"
2. Connect to your GitHub repository
3. Configure the cron job:
   - **Name**: `daily-analytics-update`
   - **Environment**: `Node`
   - **Region**: Choose the same region as your web service
   - **Branch**: `main` (or your default branch)
   - **Schedule**: `00 2 * * *` (runs daily at 2:00 AM UTC)
   - **Build Command**: `npm install`
   - **Start Command**: `node schedule-daily-update.js`
   - **Add Environment Variables**: Copy from the environment variables section above
4. Click "Create Cron Job"

### 5. Upload Service Account Key (If Not in Repository)

If you did not include your `service-account-key.json` in your repository, you can add it as a secret file:

1. Go to your web service or cron job in the Render dashboard
2. Navigate to "Environment" → "Secret Files"
3. Click "Add Secret File"
4. Set the filename to `service-account-key.json`
5. Paste the contents of your service account key file
6. Click "Save"
7. Repeat for the other service

### 6. Verify Deployment

1. After deployment completes, click on the URL of your web service
2. You should see a JSON response with `status: "online"`
3. To manually test the analytics, go to `<your-render-url>/run`

### 7. Monitor Your Services

1. In the Render dashboard, monitor the logs for both your web service and cron job
2. Check logs after 2:00 AM to verify the cron job is running properly
3. Set up notifications in Render to be alerted of failures

## Troubleshooting

- **Authentication Issues**: Make sure your `service-account-key.json` file is correctly uploaded and that the service account has the necessary permissions to access your Google Drive folders.
- **Memory/CPU Issues**: If your job is failing due to memory or CPU limits, consider upgrading your Render plan.
- **Timeout Issues**: Long-running jobs might time out. The code includes proper timeouts and exit handling to prevent this.
- **Logs**: Always check the logs in Render for error messages if something isn't working.

## Important Notes

1. The free tier of Render has limitations, including that web services will spin down after inactivity. Consider using at least the "Starter" plan for better reliability.
2. The cron job runs at 2:00 AM UTC. Adjust the schedule in `render.yaml` if you need a different time.
3. Token refresh has been added to handle Google API token expiration automatically. 