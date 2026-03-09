#!/bin/bash
#
# Sets up Firestore in native mode for the Sports Coach project
# and grants necessary IAM roles to service accounts.
#
# Usage: ./setup-firestore.sh
#

set -euo pipefail

# Load .env if it exists (to get GOOGLE_CLOUD_PROJECT)
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
fi

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "$PROJECT" ]; then
  echo "Error: No GCP project found."
  echo "Set GOOGLE_CLOUD_PROJECT in .env or run: gcloud config set project <project-id>"
  exit 1
fi

echo "Using GCP project: $PROJECT"

# 1. Enable Firestore API
echo ""
echo "Enabling Firestore API..."
gcloud services enable firestore.googleapis.com --project="$PROJECT"
echo "Firestore API enabled."

# 2. Create Firestore database in native mode
echo ""
echo "Creating Firestore database in native mode (nam5 - US multi-region)..."
if gcloud firestore databases describe --project="$PROJECT" >/dev/null 2>&1; then
  echo "Firestore database already exists, skipping creation."
else
  gcloud firestore databases create \
    --location=nam5 \
    --type=firestore-native \
    --project="$PROJECT"
  echo "Firestore database created."
fi

# 3. Grant roles/datastore.user to the default compute service account
echo ""
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting roles/datastore.user to default compute SA ($COMPUTE_SA)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  --quiet

# 4. Grant to Cloud Run service account if it exists
CLOUD_RUN_SA="${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
echo ""
echo "Granting roles/datastore.user to Cloud Run SA ($CLOUD_RUN_SA)..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/datastore.user" \
  --condition=None \
  --quiet 2>/dev/null || echo "Cloud Run SA not found or already configured — skipping."

echo ""
echo "Done! Firestore is ready. No extra environment variables needed — uses ADC + project ID."
echo "Restart the server to pick up Firestore: ./run.sh"
