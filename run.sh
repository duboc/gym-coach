#!/bin/bash

echo "Starting Fitness Tracker application..."

# Check if Python is installed
if command -v python3 &>/dev/null; then
    echo "Starting server with Python 3..."
    python3 -m http.server
elif command -v python &>/dev/null; then
    echo "Starting server with Python..."
    # Check Python version
    PYTHON_VERSION=$(python -c 'import sys; print(sys.version_info[0])')
    if [ "$PYTHON_VERSION" -eq 3 ]; then
        python -m http.server
    else
        python -m SimpleHTTPServer
    fi
elif command -v npx &>/dev/null; then
    echo "Starting server with npx..."
    npx http-server
else
    echo "Error: Could not find Python or Node.js to start a server."
    echo "Please install Python 3 or Node.js, or manually start a server."
    exit 1
fi 