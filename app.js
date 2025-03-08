const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const activeBots = new Map();
const BOTS_FILE = path.join(__dirname, 'active_bots.json');

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
        pythonPath: 'python3',
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
  fs.writeFileSync(BOTS_FILE, JSON.stringify(botsData, null, 2));
}, 5000);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/bot/start', (req, res) => {
  const { config } = req.body;
  const configId = Date.now().toString();
  const configPath = path.join(__dirname, `config_${configId}`);

  // Set defaults for MIN_DATE and NEED_ASC
  const configWithDefaults = {
    ...config,
    MIN_DATE: config.MIN_DATE || new Date().toLocaleDateString('en-GB').split('/').join('.'),
    NEED_ASC: 'false'
  };

  fs.writeFileSync(configPath, Object.entries(configWithDefaults)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'));

  const botData = {
    config,
    startTime: new Date(),
    logs: [],
    status: 'running'
  };

  const addLog = (message, type = 'info') => {
    const logEntry = { message, type, timestamp: new Date().toISOString() };
    botData.logs.push(logEntry);
    io.emit('bot-log', { id: configId, ...logEntry });
  };

  const pyshell = new PythonShell('main.py', {
    args: [configPath],
    mode: 'text',
    pythonOptions: ['-u'],
    pythonPath: 'python3',
    stderrParser: (line) => line,
    stdoutParser: (line) => line
  });

  pyshell.on('message', (message) => {
    console.log(`Bot ${configId}:`, message);
    addLog(message);
  });

  pyshell.on('stderr', (message) => {
    console.error(`Bot ${configId} error:`, message);
    addLog(message, 'error');
  });

  pyshell.on('error', (err) => {
    console.error(`Bot ${configId} error:`, err);
    addLog(err.message, 'error');
    botData.status = 'error';
  });

  pyshell.on('close', (code) => {
    const message = code === 0 ? 'Bot finished successfully' : `Process exited with code ${code}`;
    const type = code === 0 ? 'info' : 'error';
    addLog(message, type);
    botData.status = code === 0 ? 'completed' : 'error';
  });

  botData.pyshell = pyshell;
  activeBots.set(configId, botData);

  res.json({ id: configId });
});

app.post('/api/bot/stop/:id', (req, res) => {
  const { id } = req.params;
  const bot = activeBots.get(id);
  
  if (bot) {
    bot.pyshell.terminate();
    bot.status = 'stopped';
    const logEntry = { message: 'Bot stopped by user', type: 'info', timestamp: new Date().toISOString() };
    bot.logs.push(logEntry);
    io.emit('bot-log', { id, ...logEntry });
    
    // Keep bot data but remove pyshell
    const { pyshell, ...botData } = bot;
    activeBots.set(id, botData);
    
    // Clean up config file
    fs.unlinkSync(path.join(__dirname, `config_${id}`));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Bot not found' });
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
  
  // Create config file
  const configPath = path.join(__dirname, `config_${id}`);
  fs.writeFileSync(configPath, Object.entries(bot.config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'));
  
  // Start Python shell
  const pyshell = new PythonShell('main.py', {
    args: [configPath],
    mode: 'text',
    pythonOptions: ['-u'],
    pythonPath: 'python3',
    stderrParser: (line) => line,
    stdoutParser: (line) => line
  });
  
  bot.pyshell = pyshell;
  bot.status = 'running';
  
  // Set up event handlers
  pyshell.on('message', (message) => {
    console.log(`Bot ${id}:`, message);
    const logEntry = { message, type: 'info', timestamp: new Date().toISOString() };
    bot.logs.push(logEntry);
    io.emit('bot-log', { id, ...logEntry });
  });
  
  pyshell.on('stderr', (message) => {
    console.error(`Bot ${id} error:`, message);
    const logEntry = { message, type: 'error', timestamp: new Date().toISOString() };
    bot.logs.push(logEntry);
    io.emit('bot-log', { id, ...logEntry });
  });
  
  pyshell.on('error', (err) => {
    console.error(`Bot ${id} error:`, err);
    const logEntry = { message: err.message, type: 'error', timestamp: new Date().toISOString() };
    bot.logs.push(logEntry);
    io.emit('bot-log', { id, ...logEntry });
    bot.status = 'error';
  });
  
  pyshell.on('close', (code) => {
    const message = code === 0 ? 'Bot finished successfully' : `Process exited with code ${code}`;
    const type = code === 0 ? 'info' : 'error';
    const logEntry = { message, type, timestamp: new Date().toISOString() };
    bot.logs.push(logEntry);
    io.emit('bot-log', { id, ...logEntry });
    bot.status = code === 0 ? 'completed' : 'error';
  });
  
  res.json({ success: true });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Clean up orphaned config files
  fs.readdirSync(__dirname)
    .filter(file => file.startsWith('config_') && !Array.from(activeBots.keys()).some(id => file === `config_${id}`))
    .forEach(file => fs.unlinkSync(path.join(__dirname, file)));
});
