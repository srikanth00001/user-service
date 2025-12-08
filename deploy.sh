#!/bin/bash

# Navigate to project folder
cd /opt/lead-crm/user-service || exit

# Ensure we are on the correct branch
git fetch --all
git checkout dev

# Reset local changes and pull latest code
git reset --hard
git pull origin dev

# Install/update dependencies
npm install

# Build project
npm run build

# Restart service with PM2
pm2 restart user-service || pm2 start dist/main.js --name user-service
pm2 save

echo "Deployment finished!"
