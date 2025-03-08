require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const { sendAppointmentNotification } = require('./utils/emailService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const activeBots = new Map();
const BOTS_FILE = path.join(__dirname, 'active_bots.json');

// Add these constants at the top of the file, after the imports
const FACILITIES = {
  "89": "Calgary",
  "90": "Halifax",
  "9": "Montreal (Closed)",
  "92": "Ottawa",
  "93": "Quebec City",
  "94": "Toronto",
  "95": "Vancouver"
};

const COUNTRIES = {
  "ar": "Argentina",
  "ec": "Ecuador",
  "bs": "The Bahamas",
  "gy": "Guyana",
  "bb": "Barbados",
  "jm": "Jamaica",
  "bz": "Belize",
  "mx": "Mexico",
  "br": "Brazil",
  "py": "Paraguay",
  "bo": "Bolivia",
  "pe": "Peru",
  "ca": "Canada",
  "sr": "Suriname",
  "cl": "Chile",
  "tt": "Trinidad and Tobago",
  "co": "Colombia",
  "uy": "Uruguay",
  "cw": "Curacao",
  "us": "United States (Domestic Visa Renewal)"
};

// Determine Python path based on environment
const pythonPath = process.platform === 'win32' 
  ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
  : path.join(__dirname, 'venv', 'bin', 'python');

// Load saved bots on startup
try {
  if (fs.existsSync(BOTS_FILE)) {
    const savedBots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
    for (const [id, bot] of Object.entries(savedBots)) {
      const configPath = path.join(__dirname, `config_${id}`);
      
      // Recreate config file
      fs.writeFileSync(configPath, Object.entries(bot.config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'));
      
      // Start Python shell
      const pyshell = new PythonShell('main.py', {
        args: [configPath],
        mode: 'text',
        pythonOptions: ['-u'],
        pythonPath: pythonPath,
        stderrParser: (line) => line,
        stdoutParser: (line) => line
      });
      
      const botData = {
        ...bot,
        pyshell,
        status: 'running'
      };
      
      // Set up event handlers
      pyshell.on('message', (message) => {
        console.log(`Bot ${id}:`, message);
        const logEntry = { message, type: 'info', timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
      });
      
      pyshell.on('stderr', (message) => {
        console.error(`Bot ${id} error:`, message);
        const logEntry = { message, type: 'error', timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
      });
      
      pyshell.on('error', (err) => {
        console.error(`Bot ${id} error:`, err);
        const logEntry = { message: err.message, type: 'error', timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
        botData.status = 'error';
      });
      
      pyshell.on('close', (code) => {
        const message = code === 0 ? 'Bot finished successfully' : `Process exited with code ${code}`;
        const type = code === 0 ? 'info' : 'error';
        const logEntry = { message, type, timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
        botData.status = code === 0 ? 'completed' : 'error';
      });
      
      activeBots.set(id, botData);
    }
  }
} catch (error) {
  console.error('Error loading saved bots:', error);
}

// Save bots state periodically
setInterval(() => {
  const botsData = {};
  for (const [id, bot] of activeBots.entries()) {
    botsData[id] = {
      config: bot.config,
      startTime: bot.startTime,
      logs: bot.logs,
      status: bot.status
    };
  }
  // fs.writeFileSync(BOTS_FILE, JSON.stringify(botsData, null, 2));
}, 5000);

// Save bots to file
function saveBotsToFile() {
  try {
    const botsToSave = {};
    for (const [id, bot] of activeBots.entries()) {
      // Don't save pyshell instance and don't save logs
      const { pyshell, logs, ...botData } = bot;
      botsToSave[id] = {
        ...botData,
        logs: [] // Store empty logs array to save space
      };
    }
    fs.writeFileSync(BOTS_FILE, JSON.stringify(botsToSave, null, 2));
  } catch (error) {
    console.error('Error saving bots to file:', error);
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/bot/start', (req, res) => {
  const { config } = req.body;
  const configId = Date.now().toString();
  const configPath = path.join(__dirname, `config_${configId}`);
  
  // Create config file
  fs.writeFileSync(configPath, Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'));
  
  // Create bot data but don't start the bot automatically
  const botData = {
    id: configId,
    config,
    status: 'stopped',
    startTime: new Date().toISOString(),
    logs: [] // Empty logs array
  };
  
  // Save bot data
  activeBots.set(configId, botData);
  
  // Emit initial log message to client
  io.emit('bot-log', { 
    id: configId, 
    message: formatLogMessage('Bot created. Click "Restart" to start the bot.'), 
    type: 'info', 
    timestamp: new Date().toISOString() 
  });
  
  // Save to file
  saveBotsToFile();

  res.json({ id: configId });
});

app.post('/api/bot/stop/:id', (req, res) => {
  const { id } = req.params;
  const bot = activeBots.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  try {
    // Check if pyshell exists before terminating
    if (bot.pyshell) {
      try {
        bot.pyshell.terminate();
      } catch (error) {
        console.error(`Error terminating bot ${id}:`, error);
      }
    }
    
    bot.status = 'stopped';
    
    // Only emit to client, don't store in bot object
    io.emit('bot-log', { 
      id, 
      message: formatLogMessage('Bot stopped by user'), 
      type: 'info', 
      timestamp: new Date().toISOString() 
    });
    
    // Keep bot data but remove pyshell
    bot.pyshell = undefined;
    
    // Save to file
    saveBotsToFile();
    
    res.json({ success: true });
  } catch (error) {
    console.error(`Error stopping bot ${id}:`, error);
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

app.post('/api/bot/restart/:id', (req, res) => {
  const { id } = req.params;
  const bot = activeBots.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  if (bot.pyshell) {
    return res.status(400).json({ error: 'Bot is already running' });
  }
  
  try {
    // Create config file
    const configPath = path.join(__dirname, `config_${id}`);
    
    // Set defaults for MIN_DATE and NEED_ASC if not present
    const configWithDefaults = {
      ...bot.config,
      MIN_DATE: bot.config.MIN_DATE || new Date().toLocaleDateString('en-GB').split('/').join('.'),
      NEED_ASC: bot.config.NEED_ASC || 'false'
    };
    
    fs.writeFileSync(configPath, Object.entries(configWithDefaults)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'));
    
    // Start Python shell
    const pyshell = new PythonShell('main.py', {
      args: [configPath],
      mode: 'text',
      pythonOptions: ['-u'],
      pythonPath: pythonPath,
      stderrParser: (line) => line,
      stdoutParser: (line) => line
    });
    
    // Add log function with deduplication
    let lastLogMessage = '';
    let duplicateCount = 0;
    
    // Add a function to parse appointment date and time from log messages
    function parseAppointmentDetails(message) {
      // Look for the appointment date and time in the log message
      const appointmentMatch = message.match(/Your current appointment: (\d{2}:\d{2}) (\d{4}-\d{2}-\d{2})/);
      if (appointmentMatch) {
        return {
          time: appointmentMatch[1],
          date: appointmentMatch[2]
        };
      }
      
      // Also check for the "Booked at" message format
      const bookedMatch = message.match(/Success! Appointment booked successfully!/);
      if (bookedMatch) {
        return { booked: true };
      }
      
      return null;
    }
    
    // Update the addLog function to check for successful booking and send email notification
    const addLog = (message, type = 'info') => {
      // Format the message
      const formattedMessage = formatLogMessage(message, type);
      
      // Skip if the message should be filtered out
      if (formattedMessage === null) {
        return;
      }
      
      // Check for appointment booking success
      const appointmentDetails = parseAppointmentDetails(formattedMessage);
      if (appointmentDetails && (appointmentDetails.booked || (appointmentDetails.date && appointmentDetails.time))) {
        // Send email notification if environment variables are set
        if (process.env.NOTIFICATION_EMAIL && process.env.SENDER_EMAIL && process.env.SENDER_PASSWORD) {
          sendAppointmentNotification({
            botEmail: bot.config.EMAIL,
            appointmentDate: appointmentDetails.date || 'Check your account',
            appointmentTime: appointmentDetails.time || 'Check your account',
            facility: FACILITIES[bot.config.FACILITY_ID] || bot.config.FACILITY_ID || 'Unknown',
            country: COUNTRIES[bot.config.COUNTRY] || bot.config.COUNTRY || 'Unknown'
          }).then(result => {
            if (result.success) {
              io.emit('bot-log', { 
                id, 
                message: formatLogMessage('📧 Email notification sent successfully'), 
                type: 'info', 
                timestamp: new Date().toISOString() 
              });
            } else {
              io.emit('bot-log', { 
                id, 
                message: formatLogMessage(`❌ Failed to send email notification: ${result.error}`), 
                type: 'error', 
                timestamp: new Date().toISOString() 
              });
            }
          });
        }
      }
      
      // Check for duplicate messages
      if (formattedMessage === lastLogMessage) {
        duplicateCount++;
        
        // Only log every 5th duplicate message
        if (duplicateCount % 5 !== 0) {
          return;
        }
        
        // Add count to message
        const countMessage = `${formattedMessage} (repeated ${duplicateCount} times)`;
        // Only emit to client, don't store in bot object
        io.emit('bot-log', { 
          id, 
          message: countMessage, 
          type, 
          timestamp: new Date().toISOString() 
        });
      } else {
        // Reset duplicate counter for new message
        if (duplicateCount > 1) {
          // Add final count for previous message
          const countMessage = `${lastLogMessage} (repeated ${duplicateCount} times)`;
          // Only emit to client, don't store in bot object
          io.emit('bot-log', { 
            id, 
            message: countMessage, 
            type, 
            timestamp: new Date().toISOString() 
          });
        }
        
        // Log new message
        duplicateCount = 1;
        lastLogMessage = formattedMessage;
        // Only emit to client, don't store in bot object
        io.emit('bot-log', { 
          id, 
          message: formattedMessage, 
          type, 
          timestamp: new Date().toISOString() 
        });
      }
    };
    
    // Set up event handlers
    pyshell.on('message', (message) => {
      console.log(`Bot ${id}:`, message);
      addLog(message);
    });
    
    pyshell.on('stderr', (message) => {
      console.error(`Bot ${id} error:`, message);
      addLog(message, 'error');
    });
    
    pyshell.on('error', (err) => {
      console.error(`Bot ${id} error:`, err);
      addLog(err.message, 'error');
      bot.status = 'error';
    });
    
    pyshell.on('close', (code) => {
      const message = code === 0 ? 'Bot finished successfully' : `Process exited with code ${code}`;
      const type = code === 0 ? 'info' : 'error';
      addLog(message, type);
      bot.status = code === 0 ? 'completed' : 'error';
      bot.pyshell = undefined;
    });
    
    bot.pyshell = pyshell;
    bot.status = 'running';
    
    // Initialize empty logs array if it doesn't exist
    if (!bot.logs) {
      bot.logs = [];
    }
    
    // Send initial message
    addLog('Bot started');
    
    // Save to file
    saveBotsToFile();
    
    res.json({ success: true });
  } catch (error) {
    console.error(`Error restarting bot ${id}:`, error);
    res.status(500).json({ error: 'Failed to restart bot' });
  }
});

app.get('/api/bots', (req, res) => {
  const bots = Array.from(activeBots.entries()).map(([id, bot]) => ({
    id,
    config: bot.config,
    startTime: bot.startTime,
    status: bot.status,
    logs: bot.logs
  }));
  res.json(bots);
});

// Format log message with emoji
function formatLogMessage(message, type = 'info') {
  // Add emoji based on message type
  let emoji = '';
  
  // Clean up message first
  let cleanMessage = message;
  
  // Remove timestamps from error messages
  if (cleanMessage.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}/)) {
    cleanMessage = cleanMessage.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}\s+/, '');
  }
  
  // Format HTTP requests to be more readable
  if (cleanMessage.includes('HTTP/1.1')) {
    cleanMessage = cleanMessage.replace(/https:\/\/ais\.usvisa-info\.com:\d+\s+"([A-Z]+)\s+([^"]+)\s+HTTP\/1\.1"\s+(\d+).*/, 'Request: $1 $2 (Status: $3)');
  }
  
  // Make messages more meaningful
  if (type === 'error') {
    emoji = '❌ ';
    if (cleanMessage.includes('ModuleNotFoundError')) {
      cleanMessage = cleanMessage.replace(/ModuleNotFoundError: No module named '([^']+)'/, 'Missing Python module: "$1". Please run setup.sh to install dependencies.');
    } else if (cleanMessage.includes('DeprecationWarning')) {
      // Hide deprecation warnings as they're not critical
      return null;
    } else if (cleanMessage.includes('Failed to send email notification')) {
      emoji = '📧❌ ';
    }
  } else if (cleanMessage === 'Wait' || cleanMessage.includes('Wait')) {
    emoji = '⏳ ';
    cleanMessage = 'Searching for available appointment slots...';
  } else if (cleanMessage.includes('Get sign in')) {
    emoji = '🔑 ';
    cleanMessage = 'Logging into visa appointment system...';
  } else if (cleanMessage.includes('Post sing in') || cleanMessage.includes('Post sign in')) {
    emoji = '🔐 ';
    cleanMessage = 'Authenticating with credentials...';
  } else if (cleanMessage.includes('Get current appointment')) {
    emoji = '📅 ';
    cleanMessage = 'Retrieving your current appointment details...';
  } else if (cleanMessage.includes('Current appointment date')) {
    emoji = '📆 ';
    cleanMessage = cleanMessage.replace('Current appointment date and time:', 'Your current appointment:');
  } else if (cleanMessage.includes('Init csrf')) {
    emoji = '🔒 ';
    cleanMessage = 'Initializing secure session...';
  } else if (cleanMessage.includes('Get new appointment')) {
    emoji = '🔍 ';
    cleanMessage = 'Checking for new appointment availability...';
  } else if (cleanMessage.includes('Get available date')) {
    emoji = '📆 ';
    cleanMessage = 'Retrieving available appointment dates...';
  } else if (cleanMessage.includes('Get available time')) {
    emoji = '🕒 ';
    cleanMessage = 'Retrieving available appointment times...';
  } else if (cleanMessage.includes('All available dates')) {
    emoji = '📅 ';
    cleanMessage = cleanMessage.replace(/All available dates: \[(.*)\]/, 'Available dates found: $1');
  } else if (cleanMessage.includes('All available times')) {
    emoji = '🕓 ';
    cleanMessage = cleanMessage.replace(/All available times for date ([^:]+): \[(.*)\]/, 'Available times for $1: $2');
  } else if (cleanMessage.includes('Next nearest date')) {
    emoji = '📌 ';
    cleanMessage = cleanMessage.replace('Next nearest date:', 'Checking date:');
  } else if (cleanMessage.includes('Next nearest time')) {
    emoji = '⏰ ';
    cleanMessage = cleanMessage.replace('Next nearest time:', 'Checking time:');
  } else if (cleanMessage.includes('Try to book')) {
    emoji = '🎯 ';
    cleanMessage = 'Attempting to book appointment...';
  } else if (cleanMessage.includes('Booked at')) {
    emoji = '✅ ';
    cleanMessage = 'Success! Appointment booked successfully!';
  } else if (cleanMessage.includes('Email notification sent')) {
    emoji = '📧 ';
    cleanMessage = 'Email notification sent successfully!';
  } else if (cleanMessage.includes('cleared')) {
    emoji = '🧹 ';
  } else if (cleanMessage.includes('stopped')) {
    emoji = '🛑 ';
  } else if (cleanMessage.includes('started')) {
    emoji = '▶️ ';
  } else if (cleanMessage.includes('finished') || cleanMessage.includes('completed')) {
    emoji = '✅ ';
  } else if (cleanMessage.includes('No available dates')) {
    emoji = '❗ ';
    cleanMessage = 'No available appointment dates found. Will keep checking...';
  } else if (cleanMessage.includes('No available times')) {
    emoji = '❗ ';
    cleanMessage = 'No available appointment times found. Will try another date...';
  } else if (cleanMessage.includes('Response:')) {
    // Hide raw response data as it's not user-friendly
    return null;
  } else {
    emoji = 'ℹ️ ';
  }
  
  // Return null for messages we want to filter out completely
  if (cleanMessage === null) {
    return null;
  }
  
  return emoji + cleanMessage;
}

// Add API endpoint to clear logs
app.post('/api/bot/clear-logs/:id', (req, res) => {
  const { id } = req.params;
  const bot = activeBots.get(id);
  
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  try {
    // Just emit a clear logs event to the client
    io.emit('bot-logs-cleared', { id });
    
    // Emit a message that logs were cleared
    io.emit('bot-log', { 
      id, 
      message: formatLogMessage('Logs cleared by user'), 
      type: 'info', 
      timestamp: new Date().toISOString() 
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error(`Error clearing logs for bot ${id}:`, error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Auto-clear logs periodically to prevent memory issues
function setupAutoLogCleaning() {
  setInterval(() => {
    for (const [id, bot] of activeBots.entries()) {
      if (bot.logs && bot.logs.length > 500) {
        console.log(`Auto-clearing logs for bot ${id}, current log count: ${bot.logs.length}`);
        
        // Keep only the last 100 logs
        const lastLogs = bot.logs.slice(-100);
        bot.logs = [
          { 
            message: formatLogMessage(`Auto-cleared ${bot.logs.length - 100} older log entries`), 
            type: 'info', 
            timestamp: new Date().toISOString() 
          },
          ...lastLogs
        ];
        
        // Emit log cleared event
        io.emit('bot-logs-cleared', { id });
      }
    }
    
    // Save to file
    saveBotsToFile();
  }, 2 * 60 * 1000); // 2 minutes
}

// Initialize auto log cleaning
setupAutoLogCleaning();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Clean up orphaned config files
  fs.readdirSync(__dirname)
    .filter(file => file.startsWith('config_') && !Array.from(activeBots.keys()).some(id => file === `config_${id}`))
    .forEach(file => fs.unlinkSync(path.join(__dirname, file)));
});
