# Running USA-VISA-Bot with Docker

This guide explains how to run the USA-VISA-Bot application using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/USA-VISA-Bot.git
   cd USA-VISA-Bot
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your email notification settings:
   ```
   # Email Notification Settings
   SENDER_EMAIL=your-gmail@gmail.com
   SENDER_PASSWORD=your-app-password
   NOTIFICATION_EMAIL=your-email@example.com
   ```
   
   > **Note:** For Gmail, you'll need to use an App Password. Create one at: https://myaccount.google.com/apppasswords

3. Build and start the container:
   ```bash
   docker-compose up -d
   ```

4. Access the application:
   Open your browser and navigate to `http://localhost:3000`

5. Stop the container:
   ```bash
   docker-compose down
   ```

## Configuration

The Docker setup mounts the following files as volumes to persist data:
- `active_bots.json`: Stores information about active bots
- `log.txt`: Contains application logs
- `.env`: Contains environment variables for email notifications

## Email Notifications

When an appointment is successfully scheduled, the application will send an email notification to the address specified in the `.env` file. This requires:

1. A Gmail account to send from
2. An App Password for that Gmail account
3. An email address to receive notifications

## Rebuilding the Container

If you make changes to the code, you'll need to rebuild the container:

```bash
docker-compose up -d --build
```

## Viewing Logs

To view the container logs:

```bash
docker-compose logs -f
```

## Troubleshooting

### Port Conflict

If port 3000 is already in use, you can change the port mapping in the `docker-compose.yml` file:

```yaml
ports:
  - "8080:3000"  # Change 8080 to any available port
```

### Permission Issues

If you encounter permission issues with the mounted volumes, you may need to adjust the permissions:

```bash
chmod 666 active_bots.json log.txt .env
```

### Email Notification Issues

If email notifications aren't working:

1. Check that your `.env` file contains the correct credentials
2. Make sure you're using an App Password, not your regular Gmail password
3. Check the application logs for any email-related errors 