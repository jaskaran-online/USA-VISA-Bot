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
    B --> H[Email Notifications]
    
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
    H
    end
```

## Core Components

### 1. Web Interface
- Modern responsive UI built with Tailwind CSS
- Real-time log updates via Socket.IO
- Dashboard with bot statistics
- User-friendly form for bot configuration
- Bot identification and management

### 2. Node.js Server
- Express.js web server
- Socket.IO for real-time communication
- PythonShell for Python process management
- File-based storage for bot configurations
- Email notification system via SMTP
- Multi-bot orchestration

### 3. Python Bot
```mermaid
sequenceDiagram
    participant User
    participant WebUI
    participant NodeServer
    participant PythonBot
    participant USVISA System
    participant EmailService
    
    User->>WebUI: Configure bot with name
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
            NodeServer->>EmailService: Send email notification
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
   - Named bot instances for easy identification

2. **Enhanced Logging System**
   - Real-time log updates with emoji indicators
   - User-friendly message formatting
   - Log deduplication to reduce noise
   - Automatic log cleanup to manage memory usage
   - Direct display in UI without JSON storage
   - Per-bot log filtering and management

3. **Bot Management**
   - Multiple bot support with unique names
   - Start/stop/restart functionality
   - Persistent configuration storage
   - Manual and automatic startup options
   - Individual bot control and monitoring

4. **Containerization**
   - Docker support for easy deployment
   - Docker Compose for simplified orchestration
   - Volume mounting for data persistence
   - Cross-platform compatibility
   - Environment-based configuration

5. **Appointment System**
   - Automated login and session management
   - Continuous monitoring of available dates
   - Intelligent date comparison
   - Support for multiple facilities
   - Configurable date preferences

6. **Email Notifications**
   - Automatic email alerts when appointments are booked
   - Secure credential management via environment variables
   - Gmail SMTP integration with app password support
   - Detailed HTML email with appointment information
   - Configurable recipient address
   - Bot name included in notifications for identification

## Configuration Options

| Parameter | Description | Required |
|-----------|-------------|----------|
| BOT_NAME | Friendly name for the bot | No |
| EMAIL | User's email address | Yes |
| PASSWORD | Account password | Yes |
| COUNTRY | Country code (e.g., 'ca' for Canada) | Yes |
| SCHEDULE_ID | Current appointment ID | No |
| FACILITY_ID | Visa facility ID | No |
| ASC_FACILITY_ID | ASC facility ID | No |
| MIN_DATE | Minimum acceptable date | No |

## Environment Variables

The application uses environment variables for sensitive configuration:

| Variable | Description | Required for Email |
|----------|-------------|-------------------|
| SENDER_EMAIL | Gmail address to send notifications from | Yes |
| SENDER_PASSWORD | Gmail app password (not regular password) | Yes |
| NOTIFICATION_EMAIL | Email address to receive notifications | Yes |

## Supported Countries

The bot supports scheduling in multiple countries including:
- Canada (ca)
- Mexico (mx)
- United Kingdom (gb)
- India (in)
- And many more (see COUNTRIES dictionary in code)

## Bot Workflow

```mermaid
stateDiagram-v2
    [*] --> Configured: User creates bot with name
    Configured --> Stopped: Initial state
    Stopped --> Running: User clicks Start/Restart
    Running --> Monitoring: Bot logs in
    Monitoring --> Checking: Check for dates
    Checking --> Monitoring: No better dates
    Checking --> Booking: Better date found
    Booking --> Success: Appointment booked
    Booking --> Monitoring: Booking failed
    Success --> EmailSent: Send notification
    EmailSent --> Monitoring: Continue monitoring
    Monitoring --> Stopped: User clicks Stop
    Running --> Error: Login failed
    Error --> Stopped: User intervention
    Stopped --> [*]: User deletes bot
```

## Deployment Options

### 1. Local Development
```mermaid
flowchart LR
    A[Clone Repository] --> B[Install Dependencies]
    B --> C[Run setup.sh]
    C --> D[Configure .env file]
    D --> E[Start Node.js Server]
    E --> F[Access Web UI]
    F --> G[Create Named Bots]
```

### 2. Docker Deployment
```mermaid
flowchart LR
    A[Clone Repository] --> B[Configure .env file]
    B --> C[Build Docker Image]
    C --> D[Run Docker Container]
    D --> E[Access Web UI]
    E --> F[Create Named Bots]
```

## Email Notification System

```mermaid
sequenceDiagram
    participant Bot as Bot Process
    participant Server as Node.js Server
    participant Email as Email Service
    participant Gmail as Gmail SMTP
    participant User as User's Inbox
    
    Bot->>Server: Appointment booked notification
    Server->>Email: Send notification request with bot name
    Email->>Email: Create HTML email template
    Email->>Gmail: Send via SMTP
    Gmail->>User: Deliver email notification
    Email->>Server: Notification status
    Server->>Bot: Log notification result
```

## Multi-Bot Management

```mermaid
flowchart TD
    A[Web UI] --> B[Bot List View]
    B --> C[Individual Bot Cards]
    C --> D[Bot Controls]
    D --> E[Start/Stop/Restart]
    D --> F[View Logs]
    D --> G[Clear Logs]
    D --> H[Delete Bot]
    
    I[Add New Bot] --> J[Configure Bot]
    J --> K[Set Bot Name]
    J --> L[Set Credentials]
    J --> M[Set Parameters]
    J --> N[Create Bot]
    N --> B
```

## Error Handling

```mermaid
flowchart TD
    A[Error Occurs] --> B{Type?}
    B -->|Network| C[Retry with backoff]
    B -->|Auth| D[Re-login]
    B -->|Schedule| E[Reset schedule ID]
    B -->|Python| F[Show user-friendly error]
    B -->|Email| G[Log failure, continue bot]
    C --> H[Continue]
    D --> H
    E --> H
    F --> I[Suggest fix]
    G --> H
```

## Best Practices

1. **Rate Limiting**
   - Implements random delays between requests
   - Respects server limitations
   - Prevents account blocking

2. **Security**
   - No hardcoded credentials
   - Environment variables for sensitive data
   - Secure session management
   - HTTPS communication
   - Bot isolation for multi-user environments

3. **User Experience**
   - Meaningful log messages
   - Emoji indicators for visual scanning
   - Automatic cleanup of repetitive logs
   - Clear error messages with suggested fixes
   - Email notifications for important events
   - Named bots for easy identification and management

4. **Resource Management**
   - Efficient memory usage
   - Automatic log rotation
   - Proper process termination
   - Docker resource constraints
   - Per-bot resource allocation
