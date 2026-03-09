#!/bin/bash

echo "Starting Football Video Analysis in local development mode..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "Created .env from .env.example — please edit with your GCP project details."
    else
        echo "Please create a .env file with your configuration."
    fi
fi

# Load environment variables from .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the Express server (serves static files + API endpoints)
echo "Starting server on http://localhost:${PORT:-8080}"
node server.js
