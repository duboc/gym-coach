#!/bin/bash
#
# Creates a YouTube Data API v3 key for the Sports Coach project
# using the currently configured gcloud project.
#
# Usage: ./setup-youtube-api-key.sh
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

# 1. Enable YouTube Data API v3
echo ""
echo "Enabling YouTube Data API v3..."
gcloud services enable youtube.googleapis.com --project="$PROJECT"
echo "YouTube Data API v3 enabled."

# 2. Create the API key
DISPLAY_NAME="sports-coach-youtube"
echo ""
echo "Creating API key '$DISPLAY_NAME'..."

CREATE_OUTPUT=$(gcloud services api-keys create \
  --display-name="$DISPLAY_NAME" \
  --project="$PROJECT" \
  --format="json" 2>&1)

# Extract the key ID from the operation result
KEY_UID=$(echo "$CREATE_OUTPUT" | grep -o '"uid":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$KEY_UID" ]; then
  echo "Waiting for key creation to complete..."
  sleep 5
  # List keys and find ours by display name
  KEY_UID=$(gcloud services api-keys list \
    --project="$PROJECT" \
    --filter="displayName=$DISPLAY_NAME" \
    --format="value(uid)" \
    --limit=1)
fi

if [ -z "$KEY_UID" ]; then
  echo "Error: Could not determine key ID. List your keys with:"
  echo "  gcloud services api-keys list --project=$PROJECT"
  exit 1
fi

echo "Key created with UID: $KEY_UID"

# 3. Restrict the key to YouTube Data API v3 only
echo ""
echo "Restricting key to YouTube Data API v3 only..."
gcloud services api-keys update "$KEY_UID" \
  --project="$PROJECT" \
  --api-target=service=youtube.googleapis.com

# 4. Get the key string
echo ""
echo "Retrieving key string..."
KEY_STRING=$(gcloud services api-keys get-key-string "$KEY_UID" \
  --project="$PROJECT" \
  --format="value(keyString)")

if [ -z "$KEY_STRING" ]; then
  echo "Error: Could not retrieve key string."
  exit 1
fi

# 5. Save to .env
echo ""
if grep -q "^YOUTUBE_API_KEY=" .env 2>/dev/null; then
  # Update existing entry
  sed -i.bak "s|^YOUTUBE_API_KEY=.*|YOUTUBE_API_KEY=$KEY_STRING|" .env
  rm -f .env.bak
  echo "Updated YOUTUBE_API_KEY in .env"
else
  # Append new entry
  echo "" >> .env
  echo "# YouTube Integration" >> .env
  echo "YOUTUBE_API_KEY=$KEY_STRING" >> .env
  echo "Added YOUTUBE_API_KEY to .env"
fi

echo ""
echo "Done! YouTube API key is configured and restricted to YouTube Data API v3."
echo "Restart the server to pick up the new key: ./run.sh"
