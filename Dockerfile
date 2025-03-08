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

# Copy .env.example to .env if .env doesn't exist
RUN if [ ! -f .env ]; then cp -n .env.example .env || true; fi

# Expose port
EXPOSE 3000

# Start the application
CMD ["sh", "-c", "node app.js"] 