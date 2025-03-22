FROM node:18-slim

# Install Python and required packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install Node.js dependencies
RUN pnpm install

# Copy Python requirements
COPY requirements.txt ./

# Set up Python virtual environment and install dependencies
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make start.sh executable
RUN chmod +x start.sh

# Expose port
EXPOSE 6000

# Start using start.sh
CMD ["./start.sh"] 