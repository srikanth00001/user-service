#!/bin/bash
set -e
set -o pipefail

cd /opt/lead-crm/user-service || exit

echo "Fetching all branches..."
git fetch --all

echo "Switching to dev branch..."

# If dev branch exists locally → checkout
if git show-ref --verify --quiet refs/heads/dev; then
    git checkout dev
else
    # If dev does not exist locally → create it from origin/dev
    git checkout -b dev origin/dev
fi

echo "Resetting to origin/dev..."
git reset --hard origin/dev

echo "Installing dependencies..."
npm install

echo "Building project..."
npm run build

echo "Restarting PM2 service..."
pm2 restart user-service || pm2 start dist/main.js --name user-service

pm2 save

echo "Deployment from DEV branch completed successfully!"
