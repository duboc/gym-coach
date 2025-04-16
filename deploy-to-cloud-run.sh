#!/bin/bash

# Deployment script for Gym Coach to Google Cloud Run
# Make sure you have gcloud CLI installed and configured

# Set variables
PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="gym-coach"
REGION="us-central1"  # Change this to your preferred region

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying ${SERVICE_NAME} to Google Cloud Run...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}You need to log in to Google Cloud first.${NC}"
    gcloud auth login
fi

# Check if project ID is set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}No project ID set. Please select a project:${NC}"
    gcloud projects list
    echo -e "${YELLOW}Enter the project ID:${NC}"
    read PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}Using project: ${PROJECT_ID}${NC}"
echo -e "${GREEN}Service name: ${SERVICE_NAME}${NC}"
echo -e "${GREEN}Region: ${REGION}${NC}"

# Confirm deployment
echo -e "${YELLOW}Ready to deploy. Continue? (y/n)${NC}"
read -r confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Enable required APIs if not already enabled
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com

# Prompt for Gemini API key
echo -e "${YELLOW}Do you want to set a Gemini API key for AI-powered exercise feedback? (y/n)${NC}"
read -r set_api_key
API_KEY_ENV=""

if [[ "$set_api_key" =~ ^[yY]$ ]]; then
    echo -e "${YELLOW}Enter your Gemini API key:${NC}"
    read -r api_key
    if [ -n "$api_key" ]; then
        API_KEY_ENV="--set-env-vars gemini-apikey=$api_key"
        echo -e "${GREEN}API key will be set as an environment variable.${NC}"
    else
        echo -e "${YELLOW}No API key entered. Users will be prompted to enter their own API key.${NC}"
    fi
else
    echo -e "${YELLOW}No API key will be set. Users will be prompted to enter their own API key.${NC}"
fi

# Deploy to Cloud Run
echo -e "${YELLOW}Building and deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    $API_KEY_ENV

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Deployment successful!${NC}"
    
    # Get the URL of the deployed service
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format="value(status.url)")
    echo -e "${GREEN}Your application is available at: ${SERVICE_URL}${NC}"
else
    echo -e "${RED}Deployment failed. Please check the error messages above.${NC}"
fi
