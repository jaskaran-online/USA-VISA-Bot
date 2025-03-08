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

2. Build and start the container:
   ```bash
   docker-compose up -d
   ```

3. Access the application:
   Open your browser and navigate to `http://localhost:3000`

4. Stop the container:
   ```bash
   docker-compose down
   ```

## Configuration

The Docker setup mounts the following files as volumes to persist data:
- `active_bots.json`: Stores information about active bots
- `log.txt`: Contains application logs

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
chmod 666 active_bots.json log.txt
``` 