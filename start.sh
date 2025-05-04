#!/bin/bash

# Run the setup script first
bash setup.sh

# Start the application with PM2
echo "Starting the application with PM2..."
pm2 start app.js --name "bot"
pm2 save 
