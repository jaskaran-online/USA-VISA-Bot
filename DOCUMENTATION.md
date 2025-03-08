# USA VISA Bot Documentation

A Python bot for automating US visa appointment scheduling and rescheduling.

## Architecture

```mermaid
classDiagram
    class Config {
        +str email
        +str password
        +str country
        +str schedule_id
        +str facility_id
        +str asc_facility_id
        +str min_date
        +load()
        +save()
    }
    
    class Logger {
        +log_file str
        +log_format str
        +__call__(message)
    }
    
    class Appointment {
        +str schedule_id
        +str description
        +datetime appointment_datetime
    }
    
    class Bot {
        +Config config
        +Logger logger
        +str asc_file
        +dict headers
        +init()
        +login()
        +process()
        -get_available_dates()
        -get_available_times()
        -book()
    }
    
    Bot --> Config : uses
    Bot --> Logger : uses
    Bot --> Appointment : creates

```

## Core Components

### 1. Configuration Management
- Handles user credentials and preferences
- Stores country selection, facility IDs, and scheduling parameters
- Persists data in a local config file

### 2. Appointment System
```mermaid
sequenceDiagram
    participant User
    participant Bot
    participant USVISA System
    
    User->>Bot: Start bot
    Bot->>USVISA System: Login
    Bot->>USVISA System: Get available dates
    loop Every interval
        Bot->>USVISA System: Check dates
        alt Better date found
            Bot->>USVISA System: Book appointment
            Bot->>User: Notify success
        else
            Bot->>Bot: Wait for next interval
        end
    end
```

### 3. Session Management
```mermaid
flowchart TD
    A[Start] --> B{Config exists?}
    B -->|No| C[Get user input]
    B -->|Yes| D[Load config]
    C --> E[Save config]
    E --> F[Initialize session]
    D --> F
    F --> G[Login]
    G --> H{Login successful?}
    H -->|No| I[Log error]
    H -->|Yes| J[Start monitoring]
    J --> K{Found better date?}
    K -->|No| J
    K -->|Yes| L[Book appointment]
```

## Key Features

1. **Automated Login**
   - Secure credential management
   - Session persistence
   - CSRF token handling

2. **Date Monitoring**
   - Continuous checking of available dates
   - Comparison with current appointment
   - Support for minimum date preferences

3. **Multi-facility Support**
   - Primary visa appointment facility
   - ASC (Application Support Center) scheduling
   - Facility ID management

4. **Error Handling**
   - Network error recovery
   - Session expiration handling
   - Comprehensive logging

## Configuration Options

| Parameter | Description | Required |
|-----------|-------------|----------|
| EMAIL | User's email address | Yes |
| PASSWORD | Account password | Yes |
| COUNTRY | Country code (e.g., 'mx' for Mexico) | Yes |
| SCHEDULE_ID | Current appointment ID | No |
| FACILITY_ID | Visa facility ID | No |
| ASC_FACILITY_ID | ASC facility ID | No |
| MIN_DATE | Minimum acceptable date | No |

## Supported Countries

The bot supports scheduling in multiple countries including:
- Mexico (mx)
- Canada (ca)
- United Kingdom (gb)
- India (in)
- And many more (see COUNTRIES dictionary in code)

## Error Handling

```mermaid
flowchart TD
    A[Error Occurs] --> B{Type?}
    B -->|Network| C[Retry with backoff]
    B -->|Auth| D[Re-login]
    B -->|Schedule| E[Reset schedule ID]
    C --> F[Continue]
    D --> F
    E --> F
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

3. **Maintainability**
   - Modular code structure
   - Comprehensive logging
   - Clear error messages
