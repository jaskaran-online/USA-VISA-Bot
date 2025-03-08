# USA VISA Bot Documentation

A Python bot for automating US visa appointment scheduling and rescheduling with a modern web interface.

## System Architecture

```mermaid
graph TD
    A[Web UI] <--> B[Node.js Server]
    B <--> C[Socket.IO]
    B <--> D[Python Bot]
    D <--> E[US Visa API]
    B <--> F[File Storage]
    C <--> G[Real-time Updates]
    
    subgraph Frontend
    A
    G
    end
    
    subgraph Backend
    B
    C
    D
    F
    end
    
    subgraph External
    E
    end
```

## Core Components

### 1. Web Interface
- Modern responsive UI built with Tailwind CSS
- Real-time log updates via Socket.IO
- Dashboard with bot statistics
- User-friendly form for bot configuration

### 2. Node.js Server
- Express.js web server
- Socket.IO for real-time communication
- PythonShell for Python process management
- File-based storage for bot configurations

### 3. Python Bot
```mermaid
sequenceDiagram
    participant User
    participant WebUI
    participant NodeServer
    participant PythonBot
    participant USVISA System
    
    User->>WebUI: Configure bot
    WebUI->>NodeServer: Start bot request
    NodeServer->>PythonBot: Launch with config
    PythonBot->>USVISA System: Login
    
    loop Every interval
        PythonBot->>USVISA System: Check dates
        PythonBot->>NodeServer: Send log updates
        NodeServer->>WebUI: Real-time log display
        
        alt Better date found
            PythonBot->>USVISA System: Book appointment
            PythonBot->>NodeServer: Success notification
            NodeServer->>WebUI: Update UI
        end
    end
    
    User->>WebUI: Stop bot
    WebUI->>NodeServer: Stop request
    NodeServer->>PythonBot: Terminate process
```

## Key Features

1. **User-Friendly Interface**
   - Dashboard with real-time statistics
   - Intuitive bot configuration form
   - Responsive design for mobile and desktop
   - Clear visual indicators of bot status

2. **Enhanced Logging System**
   - Real-time log updates with emoji indicators
   - User-friendly message formatting
   - Log deduplication to reduce noise
   - Automatic log cleanup to manage memory usage
   - Direct display in UI without JSON storage

3. **Bot Management**
   - Multiple bot support
   - Start/stop/restart functionality
   - Persistent configuration storage
   - Manual and automatic startup options

4. **Containerization**
   - Docker support for easy deployment
   - Docker Compose for simplified orchestration
   - Volume mounting for data persistence
   - Cross-platform compatibility

5. **Appointment System**
   - Automated login and session management
   - Continuous monitoring of available dates
   - Intelligent date comparison
   - Support for multiple facilities

## Configuration Options

| Parameter | Description | Required |
|-----------|-------------|----------|
| EMAIL | User's email address | Yes |
| PASSWORD | Account password | Yes |
| COUNTRY | Country code (e.g., 'ca' for Canada) | Yes |
| SCHEDULE_ID | Current appointment ID | No |
| FACILITY_ID | Visa facility ID | No |
| ASC_FACILITY_ID | ASC facility ID | No |
| MIN_DATE | Minimum acceptable date | No |

## Supported Countries

The bot supports scheduling in multiple countries including:
- Canada (ca)
- Mexico (mx)
- United Kingdom (gb)
- India (in)
- And many more (see COUNTRIES dictionary in code)

## Deployment Options

### 1. Local Development
```mermaid
flowchart LR
    A[Clone Repository] --> B[Install Dependencies]
    B --> C[Run setup.sh]
    C --> D[Start Node.js Server]
    D --> E[Access Web UI]
```

### 2. Docker Deployment
```mermaid
flowchart LR
    A[Clone Repository] --> B[Build Docker Image]
    B --> C[Run Docker Container]
    C --> D[Access Web UI]
```

## Error Handling

```mermaid
flowchart TD
    A[Error Occurs] --> B{Type?}
    B -->|Network| C[Retry with backoff]
    B -->|Auth| D[Re-login]
    B -->|Schedule| E[Reset schedule ID]
    B -->|Python| F[Show user-friendly error]
    C --> G[Continue]
    D --> G
    E --> G
    F --> H[Suggest fix]
```

## Best Practices

1. **Rate Limiting**
   - Implements random delays between requests
   - Respects server limitations
   - Prevents account blocking

2. **Security**
   - No hardcoded credentials
   - Secure session management
   - HTTPS communication

3. **User Experience**
   - Meaningful log messages
   - Emoji indicators for visual scanning
   - Automatic cleanup of repetitive logs
   - Clear error messages with suggested fixes

4. **Resource Management**
   - Efficient memory usage
   - Automatic log rotation
   - Proper process termination
   - Docker resource constraints
