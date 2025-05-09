const socket = io();

// Bot management
const botStore = {
    get: () => JSON.parse(localStorage.getItem('activeBots') || '{}'),
    set: (bots) => localStorage.setItem('activeBots', JSON.stringify(bots)),
    add: (id, bot) => {
        const bots = botStore.get();
        bots[id] = bot;
        botStore.set(bots);
    },
    remove: (id) => {
        const bots = botStore.get();
        delete bots[id];
        botStore.set(bots);
    },
    clear: () => localStorage.removeItem('activeBots')
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

// Initialize country select
const countrySelect = document.getElementById('countrySelect');
Object.entries(COUNTRIES).forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    countrySelect.appendChild(option);
});

// Handle form submission
document.getElementById('botForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const config = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/bot/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config })
        });
        
        if (!response.ok) throw new Error('Failed to start bot');
        
        const { id } = await response.json();
        const bot = {
            id,
            config,
            startTime: new Date().toISOString(),
            logs: []
        };
        
        botStore.add(id, bot);
        addBotToUI(bot);
        e.target.reset();
    } catch (error) {
        console.error('Error starting bot:', error);
        alert('Failed to start bot. Please try again.');
    }
});

// Handle bot selection and actions
document.getElementById('activeBots').addEventListener('click', async (e) => {
    const botInstance = e.target.closest('.bot-instance');
    if (!botInstance) return;

    // Handle clear logs button
    const clearLogsButton = e.target.closest('.clear-logs');
    if (clearLogsButton) {
        const botId = botInstance.dataset.botId;
        clearBotLogs(botId);
        return;
    }

    // Handle stop/restart button clicks
    const stopButton = e.target.closest('.stop-bot');
    const restartButton = e.target.closest('.restart-bot');
    
    if (stopButton || restartButton) {
        const botId = botInstance.dataset.botId;
        const action = stopButton ? 'stop' : 'restart';
        const button = stopButton || restartButton;
        
        // Disable button during action
        button.disabled = true;
        button.innerHTML = action === 'stop' 
            ? '<i class="fas fa-spinner fa-spin"></i> Stopping...' 
            : '<i class="fas fa-spinner fa-spin"></i> Restarting...';
        
        try {
            const response = await fetch(`/api/bot/${action}/${botId}`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error(`Failed to ${action} bot`);
            
            if (action === 'stop') {
                const bots = botStore.get();
                if (bots[botId]) {
                    bots[botId].status = 'stopped';
                    botStore.set(bots);
                    updateBotUI(botId, bots[botId]);
                    
                    // Show restart button, hide stop button
                    botInstance.querySelector('.stop-bot').style.display = 'none';
                    botInstance.querySelector('.restart-bot').style.display = 'inline-flex';
                }
            } else if (action === 'restart') {
                const bots = botStore.get();
                if (bots[botId]) {
                    bots[botId].status = 'running';
                    botStore.set(bots);
                    updateBotUI(botId, bots[botId]);
                    
                    // Show stop button, hide restart button
                    botInstance.querySelector('.stop-bot').style.display = 'inline-flex';
                    botInstance.querySelector('.restart-bot').style.display = 'none';
                }
            }
        } catch (error) {
            console.error(`Error ${action}ing bot:`, error);
            alert(`Failed to ${action} bot. Please try again.`);
        } finally {
            // Re-enable button
            button.disabled = false;
            button.innerHTML = action === 'stop' 
                ? '<i class="fas fa-stop"></i> Stop' 
                : '<i class="fas fa-play"></i> Restart';
        }
        return;
    }

    // Handle bot selection
    if (e.target === botInstance || e.target.closest('.bot-header')) {
        // Don't select if clicking on buttons
        if (e.target.closest('button')) return;
        
        document.querySelectorAll('.bot-instance').forEach(bot => bot.classList.remove('selected'));
        botInstance.classList.add('selected');
        // Show logs for selected bot
        const botId = botInstance.dataset.botId;
        const bots = botStore.get();
        if (bots[botId]) {
            const logsDiv = botInstance.querySelector('.bot-logs');
            logsDiv.innerHTML = '';
            bots[botId].logs.forEach(log => {
                const logDiv = document.createElement('div');
                logDiv.className = `log-entry ${log.type || 'info'}`;
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'log-time';
                timeSpan.textContent = new Date(log.timestamp).toLocaleTimeString();
                
                const messageSpan = document.createElement('span');
                messageSpan.className = 'log-message';
                messageSpan.textContent = typeof log === 'string' ? log : log.message;
                
                logDiv.appendChild(timeSpan);
                logDiv.appendChild(messageSpan);
                logsDiv.appendChild(logDiv);
            });
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }
    }
});

// Handle bot logs
socket.on('bot-log', (data) => {
    const { id, message, type, timestamp } = data;
    
    // Update UI if this bot is currently visible
    const logsDiv = document.querySelector(`.bot-instance[data-bot-id="${id}"] .bot-logs`);
    if (logsDiv) {
        // Create log entry
        const logDiv = document.createElement('div');
        logDiv.className = `log-entry ${type || 'info'}`;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'log-message';
        messageSpan.textContent = message;
        
        logDiv.appendChild(timeSpan);
        logDiv.appendChild(messageSpan);
        logsDiv.appendChild(logDiv);
        
        // Limit to 50 lines
        const logEntries = logsDiv.querySelectorAll('.log-entry');
        if (logEntries.length > 50) {
            // Remove oldest entries
            for (let i = 0; i < logEntries.length - 50; i++) {
                logEntries[i].remove();
            }
        }
        
        // Scroll to bottom
        logsDiv.scrollTop = logsDiv.scrollHeight;
    }
});

// Handle logs cleared event
socket.on('bot-logs-cleared', (data) => {
    const { id } = data;
    const logsDiv = document.querySelector(`.bot-instance[data-bot-id="${id}"] .bot-logs`);
    if (logsDiv) {
        logsDiv.innerHTML = '';
    }
});

// Add bot to UI
function addBotToUI(bot) {
    const template = document.getElementById('botTemplate');
    const container = document.getElementById('activeBots');
    const instance = template.content.cloneNode(true);
    const div = instance.querySelector('.bot-instance');
    
    div.dataset.botId = bot.id;
    div.classList.add('selected');
    document.querySelectorAll('.bot-instance').forEach(b => b.classList.remove('selected'));
    
    // Add bot name to the header
    const botName = bot.name || `Bot ${bot.id.slice(-4)}`;
    const nameEl = document.createElement('span');
    nameEl.className = 'text-xs font-normal text-indigo-400 ml-2';
    nameEl.textContent = botName;
    div.querySelector('.bot-email').after(nameEl);
    
    // Update UI with bot data
    updateBotUI(bot.id, bot);
    
    // Show logs
    const logsDiv = div.querySelector('.bot-logs');
    logsDiv.style.display = 'block';
    div.querySelector('.toggle-logs i').classList.replace('fa-chevron-down', 'fa-chevron-up');
    
    container.appendChild(div);
    
    // Update counters
    updateCounters();
}

// Update bot UI
function updateBotUI(id, bot) {
    const div = document.querySelector(`.bot-instance[data-bot-id="${id}"]`);
    if (!div) return;
    
    // Update name and email
    const botName = bot.name || `Bot ${id.slice(-4)}`;
    div.querySelector('.bot-email').textContent = bot.config.EMAIL || 'No email';
    div.querySelector('.bot-email').setAttribute('title', botName);
    
    // Add bot name as a data attribute for filtering
    div.dataset.botName = botName;
    
    // Update country
    const countryEl = div.querySelector('.bot-country');
    countryEl.textContent = COUNTRIES[bot.config.COUNTRY] || bot.config.COUNTRY || 'Unknown';
    
    // Update facility
    const facilityEl = div.querySelector('.bot-facility');
    facilityEl.textContent = `Facility: ${bot.config.FACILITY_ID || 'Not specified'}`;
    
    // Update start time
    const startTimeEl = div.querySelector('.bot-start-time');
    startTimeEl.textContent = new Date(bot.startTime).toLocaleString();
    
    // Update status
    const status = bot.status || 'stopped';
    const statusEl = div.querySelector('.bot-status');
    statusEl.dataset.status = status;
    
    const statusText = {
        'running': 'Running',
        'stopped': 'Stopped',
        'error': 'Error',
        'completed': 'Completed'
    };
    
    statusEl.textContent = statusText[status] || status;
    
    // Show/hide buttons based on status
    const stopBtn = div.querySelector('.stop-bot');
    const restartBtn = div.querySelector('.restart-bot');
    
    if (status === 'running') {
        stopBtn.style.display = 'inline-flex';
        restartBtn.style.display = 'none';
    } else {
        stopBtn.style.display = 'none';
        restartBtn.style.display = 'inline-flex';
    }
}

// Load active bots on page load
async function loadActiveBots() {
    try {
        // Load from localStorage
        const storedBots = botStore.get();
        Object.values(storedBots).forEach(addBotToUI);
        
        // Sync with server
        const response = await fetch('/api/bots');
        const serverBots = await response.json();
        
        // Update localStorage with server data
        const newBots = {};
        serverBots.forEach(bot => {
            newBots[bot.id] = {
                ...bot,
                logs: storedBots[bot.id]?.logs || []
            };
        });
        botStore.set(newBots);
        
        // Clear and reload UI
        document.getElementById('activeBots').innerHTML = '';
        Object.values(newBots).forEach(addBotToUI);
    } catch (error) {
        console.error('Error loading active bots:', error);
    }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    const bots = botStore.get();
    Object.values(bots).forEach(bot => {
        fetch(`/api/bot/stop/${bot.id}`, { method: 'POST' }).catch(() => {});
    });
});

// Clear bot logs
async function clearBotLogs(botId) {
    try {
        // Call the API to clear logs on the server
        const response = await fetch(`/api/bot/clear-logs/${botId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to clear logs');
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        alert('Failed to clear logs. Please try again.');
    }
}

// Auto-clear logs every 2 minutes
function setupAutoClearLogs() {
    // No need to auto-clear logs in local storage anymore
    // We're now limiting logs to 50 lines directly in the UI
}

// Initialize auto-clear logs
setupAutoClearLogs();

loadActiveBots();
