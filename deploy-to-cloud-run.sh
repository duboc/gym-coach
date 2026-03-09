#!/bin/bash

# Deployment script for Football Video Analysis to Google Cloud Run
# Uses Vertex AI with ADC authentication and GCS for video storage

# Set variables
PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="football-video-analysis"
REGION="us-central1"
BUCKET_NAME="${PROJECT_ID}-football-videos"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Deploying ${SERVICE_NAME} to Google Cloud Run...${NC}"

# Check gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed.${NC}"
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check login
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}Logging in to Google Cloud...${NC}"
    gcloud auth login
fi

# Check project ID
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}No project ID set. Enter the project ID:${NC}"
    read PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}Project: ${PROJECT_ID}${NC}"
echo -e "${GREEN}Service: ${SERVICE_NAME}${NC}"
echo -e "${GREEN}Region: ${REGION}${NC}"
echo -e "${GREEN}Bucket: ${BUCKET_NAME}${NC}"

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    storage.googleapis.com \
    aiplatform.googleapis.com

# Create GCS bucket if it doesn't exist
echo -e "${YELLOW}Creating GCS bucket for video storage...${NC}"
if ! gsutil ls -b gs://${BUCKET_NAME} &> /dev/null 2>&1; then
    gsutil mb -p ${PROJECT_ID} -l ${REGION} gs://${BUCKET_NAME}
    echo -e "${GREEN}Bucket created: gs://${BUCKET_NAME}${NC}"
else
    echo -e "${GREEN}Bucket already exists: gs://${BUCKET_NAME}${NC}"
fi

# Confirm deployment
echo -e "${YELLOW}Ready to deploy. Continue? (y/n)${NC}"
read -r confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Deploy to Cloud Run
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 4Gi \
    --cpu 2 \
    --timeout 1800 \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GCS_BUCKET_NAME=${BUCKET_NAME},NODE_ENV=production,GEMINI_MODEL=gemini-3.1-flash-lite-preview"

# Check deployment
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Deployment successful!${NC}"

    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(status.url)")
    echo -e "${GREEN}Application URL: ${SERVICE_URL}${NC}"
    echo -e "${GREEN}Video Analysis:  ${SERVICE_URL}/video-analysis${NC}"

    # Grant service account permissions
    echo -e "${YELLOW}Configuring service account permissions...${NC}"
    SERVICE_ACCOUNT=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(spec.template.spec.serviceAccountName)")

    if [ -n "$SERVICE_ACCOUNT" ]; then
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:${SERVICE_ACCOUNT}" \
            --role="roles/aiplatform.user" \
            --quiet

        gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://${BUCKET_NAME}

        echo -e "${GREEN}Permissions configured.${NC}"
    else
        echo -e "${YELLOW}Using default compute service account — ensure it has Vertex AI and GCS permissions.${NC}"
    fi
else
    echo -e "${RED}Deployment failed. Check the error messages above.${NC}"
fi
