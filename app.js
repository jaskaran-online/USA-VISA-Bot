const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || ''
  }
};

const notificationEmail = process.env.NOTIFICATION_EMAIL || 'jaskaransingh4704@gmail.com';

// Create email transporter
const transporter = nodemailer.createTransport(emailConfig);

// Function to send email
async function sendEmail(subject, html) {
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.log('Email credentials not configured. Skipping email notification.');
    return;
  }

  try {
    await transporter.sendMail({
      from: emailConfig.auth.user,
      to: notificationEmail,
      subject,
      html
    });
    console.log(`Email sent: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

app.use(express.static('public'));
app.use(express.json());

const activeBots = new Map();
const BOTS_FILE = path.join(__dirname, 'active_bots.json');

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
        const logEntry = { message, type: 'info', timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
      });
      
      pyshell.on('stderr', (message) => {
        const logEntry = { message, type: 'error', timestamp: new Date().toISOString() };
        botData.logs.push(logEntry);
        io.emit('bot-log', { id, ...logEntry });
        console.error(`Bot ${id}:`, message);
      });
      
      pyshell.on('error', (err) => {
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
    
    const addLog = (message, type = 'info') => {
      // Format the message
      const formattedMessage = formatLogMessage(message, type);
      
      // Skip if the message should be filtered out
      if (formattedMessage === null) {
        return;
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
        
        // Check for successful booking
        if (formattedMessage.includes('Successfully booked appointment')) {
          // Send email notification
          const emailHtml = `
            <h2>🎉 Appointment Successfully Booked!</h2>
            <p><strong>Email:</strong> ${bot.config.EMAIL}</p>
            <p><strong>Country:</strong> ${bot.config.COUNTRY}</p>
            <p><strong>Facility ID:</strong> ${bot.config.FACILITY_ID}</p>
            <p><strong>Booked At:</strong> ${new Date().toLocaleString()}</p>
            <p>Check the application for more details.</p>
          `;
          sendEmail(`Appointment Booked - ${bot.config.EMAIL}`, emailHtml);
        }
      }
    };
    
    // Set up event handlers
    pyshell.on('message', (message) => {
      addLog(message);
    });
    
    pyshell.on('stderr', (message) => {
      addLog(message, 'error');
    });
    
    pyshell.on('error', (err) => {
      addLog(err.message, 'error');
      bot.status = 'error';
      
      // Send email notification for error
      const emailHtml = `
        <h2>⚠️ Visa Bot Error</h2>
        <p><strong>Email:</strong> ${bot.config.EMAIL}</p>
        <p><strong>Country:</strong> ${bot.config.COUNTRY}</p>
        <p><strong>Error:</strong> ${err.message}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      `;
      sendEmail(`Visa Bot Error - ${bot.config.EMAIL}`, emailHtml);
    });
    
    pyshell.on('close', (code) => {
      const message = code === 0 ? 'Bot finished successfully' : `Process exited with code ${code}`;
      const type = code === 0 ? 'info' : 'error';
      addLog(message, type);
      bot.status = code === 0 ? 'completed' : 'error';
      bot.pyshell = undefined;
      
      // Send email notification for unexpected close
      if (code !== 0) {
        const emailHtml = `
          <h2>⚠️ Visa Bot Stopped</h2>
          <p><strong>Email:</strong> ${bot.config.EMAIL}</p>
          <p><strong>Country:</strong> ${bot.config.COUNTRY}</p>
          <p><strong>Exit Code:</strong> ${code}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        `;
        sendEmail(`Visa Bot Stopped - ${bot.config.EMAIL}`, emailHtml);
      }
    });
    
    bot.pyshell = pyshell;
    bot.status = 'running';
    
    // Initialize empty logs array if it doesn't exist
    if (!bot.logs) {
      bot.logs = [];
    }
    
    // Send initial message
    addLog('Bot started');
    
    // Send email notification for bot start
    const emailHtml = `
      <h2>Visa Appointment Bot Started</h2>
      <p><strong>Email:</strong> ${bot.config.EMAIL}</p>
      <p><strong>Country:</strong> ${bot.config.COUNTRY}</p>
      <p><strong>Facility ID:</strong> ${bot.config.FACILITY_ID || 'Not specified'}</p>
      <p><strong>Min Date:</strong> ${bot.config.MIN_DATE}</p>
      <p><strong>Max Date:</strong> ${bot.config.MAX_DATE || 'Not specified'}</p>
      <p><strong>Start Time:</strong> ${new Date().toLocaleString()}</p>
    `;
    sendEmail(`Visa Bot Started - ${bot.config.EMAIL}`, emailHtml);
    
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

const PORT = process.env.PORT || 9000 ;
server.listen(PORT, () => {
  console.log(`Server running on`);
  console.log(`http://localhost:${PORT}`);

  // Clean up orphaned config files
  fs.readdirSync(__dirname)
    .filter(file => file.startsWith('config_') && !Array.from(activeBots.keys()).some(id => file === `config_${id}`))
    .forEach(file => fs.unlinkSync(path.join(__dirname, file)));
});
