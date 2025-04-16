# Deploying Gym Coach to Google Cloud Run

This document provides instructions for deploying the Gym Coach application to Google Cloud Run.

## Prerequisites

Before deploying, make sure you have the following:

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured
2. A Google Cloud Platform account with billing enabled
3. Permissions to create and deploy Cloud Run services

## Deployment Options

You have two options for deploying the application:

### Option 1: Using the Deployment Script (Recommended)

1. Make sure the deployment script is executable:
   ```bash
   chmod +x deploy-to-cloud-run.sh
   ```

2. Run the deployment script:
   ```bash
   ./deploy-to-cloud-run.sh
   ```

3. Follow the prompts in the script. It will:
   - Check if you're logged in to Google Cloud
   - Confirm your project ID
   - Enable necessary APIs
   - Build and deploy the application

### Option 2: Manual Deployment

If you prefer to deploy manually, follow these steps:

1. Make sure you're logged in to Google Cloud:
   ```bash
   gcloud auth login
   ```

2. Set your project ID:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

3. Enable required APIs:
   ```bash
   gcloud services enable cloudbuild.googleapis.com run.googleapis.com
   ```

4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy gym-coach \
       --source . \
       --platform managed \
       --region us-central1 \
       --allow-unauthenticated
   ```

## Environment Variables

The application uses the Gemini API for AI-powered exercise feedback. The deployment script now includes an option to set the Gemini API key as an environment variable. You have three options for providing the API key:

1. **During Deployment**: The deployment script will prompt you to enter a Gemini API key. This is the recommended approach as it securely sets the API key as an environment variable in Cloud Run.

2. **Manual Environment Variable**: You can set the API key as an environment variable in Cloud Run after deployment:
   ```bash
   gcloud run services update gym-coach \
       --set-env-vars "gemini-apikey=YOUR_API_KEY" \
       --region us-central1
   ```

3. **User Input**: If no API key is provided during deployment, the application will prompt users to enter their own Gemini API key. The key will be stored in their browser's localStorage for future sessions.

### How API Key Handling Works

The application now uses a server-side component that:
1. Exposes the API key through a secure endpoint
2. The client-side code checks this endpoint first
3. Falls back to localStorage or user prompt if no API key is found

This approach provides flexibility while maintaining security.

## Customizing the Deployment

### Changing the Region

By default, the application is deployed to `us-central1`. To change the region:

1. In the deployment script, modify the `REGION` variable.
2. For manual deployment, change the `--region` parameter.

### Changing the Service Name

By default, the service is named `gym-coach`. To change the name:

1. In the deployment script, modify the `SERVICE_NAME` variable.
2. For manual deployment, change the service name in the `gcloud run deploy` command.

## Troubleshooting

### Deployment Failures

If deployment fails, check the following:

1. Make sure you have billing enabled for your project
2. Verify that you have the necessary permissions
3. Check the build logs for any errors:
   ```bash
   gcloud builds list
   gcloud builds log BUILD_ID
   ```

### Application Issues

If the application deploys but doesn't work correctly:

1. Check the Cloud Run logs:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gym-coach"
   ```

2. Verify that the Gemini API key is correctly set up

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Deploying from Source Code](https://cloud.google.com/run/docs/deploying-source-code)
- [Managing Environment Variables](https://cloud.google.com/run/docs/configuring/environment-variables)
