#!/bin/bash
set -e
set -o pipefail

# Navigate to project folder
cd /opt/lead-crm/user-service || { echo "Directory not found!"; exit 1; }

# Fetch all branches
git fetch --all

# Checkout dev branch (create it locally if it doesn't exist)
if git show-ref --verify --quiet refs/heads/dev; then
    git checkout dev
else
    git checkout -b dev origin/dev
fi

# Reset local dev branch to remote state
git reset --hard origin/dev

# Install/update dependencies
npm install

# Build project
npm run build

# Restart service with PM2
if pm2 list | grep -q "user-service"; then
    pm2 restart user-service
else
    pm2 start dist/main.js --name user-service
fi

# Save PM2 process list
pm2 save

echo "Deployment from dev branch finished!"
