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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/api/bot/start', (req, res) => {
  const { config } = req.body;
  const configId = Date.now().toString();
  const configPath = path.join(__dirname, `config_${configId}`);

  fs.writeFileSync(configPath, Object.entries(config)
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
    activeBots.delete(id);
    fs.unlinkSync(path.join(__dirname, `config_${id}`));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Bot not found' });
  }
});

app.get('/api/bots', (req, res) => {
  const bots = Array.from(activeBots.entries()).map(([id, bot]) => ({
    id,
    config: bot.config,
    startTime: bot.startTime,
    logs: bot.logs
  }));
  res.json(bots);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
