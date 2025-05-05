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

# Scheduler Settings (for Web Service Scheduler)
ENABLE_SCHEDULER=true
```

## Free Deployment Options (No Credit Card Required)

### Option 1: Render Free Tier Web Service with Built-in Scheduler

Instead of using Render's cron job service (which requires a credit card), you can use a single web service with an internal scheduler:

1. In the Render dashboard, click "New" → "Web Service"
2. Connect to your GitHub repository
3. Configure the web service:
   - **Name**: `sprout-analytics`
   - **Environment**: `Node`
   - **Region**: Choose the region closest to you
   - **Branch**: `main` (or your default branch)
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free (or Starter if you have a credit card)
   - **Add Environment Variables**: Copy from the environment variables section above, and set `ENABLE_SCHEDULER=true`
4. Click "Create Web Service"

The internal scheduler will run your analytics job daily at 2:00 AM UTC. However, be aware that Render's free tier web services will spin down after periods of inactivity, which means the scheduler might not run if the service is inactive.

### Option 2: External Services to Trigger Your Web Hook

You can use these free services to trigger your analytics by hitting your `/run` endpoint:

#### A. GitHub Actions (Free)

1. Create a `.github/workflows/cron.yml` file in your repository:

```yaml
name: Daily Analytics Run

on:
  schedule:
    - cron: "0 2 * * *" # Runs at 2:00 AM UTC daily

jobs:
  trigger-analytics:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger analytics webhook
        run: |
          curl -X GET https://your-render-app-url.onrender.com/run
```

2. Push this file to your repository
3. GitHub will automatically run this workflow according to the schedule

#### B. Pipedream (Free Plan)

1. Sign up for [Pipedream](https://pipedream.com/) (no credit card required)
2. Create a new workflow with a Schedule trigger
3. Set it to run daily at 2:00 AM UTC
4. Add an HTTP step to call your Render URL: `https://your-render-app-url.onrender.com/run`

#### C. Cron-job.org (Free)

1. Sign up for [cron-job.org](https://cron-job.org/) (free, no credit card)
2. Create a new cronjob
3. Set the URL to your Render app endpoint: `https://your-render-app-url.onrender.com/run`
4. Set the schedule to daily at 2:00 AM UTC
5. Save the cronjob

### Option 3: Vercel Deploy with Cron Jobs (Free)

If you're open to using Vercel instead of Render, they offer serverless functions with cron job support on their free plan:

1. Sign up for [Vercel](https://vercel.com/) (no credit card required)
2. Connect your GitHub repository
3. In your `vercel.json` file, add:

```json
{
  "crons": [
    {
      "path": "/run",
      "schedule": "0 2 * * *"
    }
  ]
}
```

4. Deploy your application to Vercel
5. Vercel will automatically call your `/run` endpoint daily at 2:00 AM UTC

## Standard Render Deployment (When Ready)

When you have a credit card available, follow these steps for a more reliable deployment:

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

## Troubleshooting

- **Authentication Issues**: Make sure your `service-account-key.json` file is correctly uploaded and that the service account has the necessary permissions to access your Google Drive folders.
- **Web Service Sleep**: Render's free tier web services will spin down after periods of inactivity. This means your internal scheduler might miss its scheduled time. Consider using one of the external services to keep it active.
- **Logs**: Always check the logs in Render for error messages if something isn't working.

## Important Notes

1. The free tier web service has limitations. It will spin down after inactivity, affecting the reliability of the built-in scheduler. For more reliable scheduling, consider:

   - Using an external service to trigger your analytics (Options 2A, 2B, or 2C)
   - Upgrading to Render's Starter plan when possible
   - Switching to Vercel's serverless functions with cron support (Option 3)

2. Token refresh has been added to handle Google API token expiration automatically.

3. The default schedule is set to run daily at 2:00 AM UTC. You can adjust this in the code for built-in scheduling, or in the external service's configuration.
