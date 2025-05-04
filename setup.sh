#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

echo "Setup complete! Virtual environment is activated."

# Install PM2 globally
#install pnpm if not installed
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

#install node modules
echo "Installing node modules..."
pnpm install

#install pm2
echo "Installing PM2..."
pnpm add -g pm2


#run the application
echo "Run 'node app.js' to start the application." 
