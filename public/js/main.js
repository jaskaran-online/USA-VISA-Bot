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

    // Handle bot selection
    if (e.target === botInstance || e.target.closest('.bot-header')) {
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
        return;
    }

    // Handle bot actions
    if (e.target.classList.contains('stop-bot') || e.target.classList.contains('restart-bot')) {
        const botInstance = e.target.closest('.bot-instance');
        const botId = botInstance.dataset.botId;
        const action = e.target.classList.contains('stop-bot') ? 'stop' : 'restart';
        
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
                }
            }
        } catch (error) {
            console.error(`Error ${action}ing bot:`, error);
            alert(`Failed to ${action} bot. Please try again.`);
        }
    }
});

// Handle bot logs
socket.on('bot-log', ({ id, message, type, timestamp }) => {
    const bots = botStore.get();
    if (bots[id]) {
        const logEntry = { message, type, timestamp };
        bots[id].logs.push(logEntry);
        botStore.set(bots);
        
        // Only update logs for the selected bot
        const selectedBotId = document.querySelector('.bot-instance.selected')?.dataset.botId;
        if (selectedBotId === id) {
            const logsDiv = document.querySelector(`.bot-instance[data-bot-id="${id}"] .bot-logs`);
            if (logsDiv) {
                const logDiv = document.createElement('div');
                logDiv.className = `log-entry ${type}`;
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'log-time';
                timeSpan.textContent = new Date(timestamp).toLocaleTimeString();
                
                const messageSpan = document.createElement('span');
                messageSpan.className = 'log-message';
                messageSpan.textContent = message;
                
                logDiv.appendChild(timeSpan);
                logDiv.appendChild(messageSpan);
                logsDiv.appendChild(logDiv);
                logsDiv.scrollTop = logsDiv.scrollHeight;
            }
        }
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
    updateBotUI(bot.id, bot);
    container.appendChild(div);
}

// Update bot UI
function updateBotUI(id, bot) {
    const div = document.querySelector(`.bot-instance[data-bot-id="${id}"]`);
    if (!div) return;
    
    div.querySelector('.bot-email').textContent = `Bot ${id} - ${bot.config.EMAIL}`;
    div.querySelector('.bot-country').textContent = COUNTRIES[bot.config.COUNTRY];
    div.querySelector('.bot-start-time').textContent = `Started: ${new Date(bot.startTime).toLocaleString()}`;
    const status = bot.status || 'running';
    const statusEl = div.querySelector('.bot-status');
    statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusEl.dataset.status = status;
    
    const stopBtn = div.querySelector('.stop-bot');
    const restartBtn = div.querySelector('.restart-bot');
    
    if (status === 'stopped' || status === 'error' || status === 'completed') {
        stopBtn.style.display = 'none';
        restartBtn.style.display = 'inline-block';
    } else {
        stopBtn.style.display = 'inline-block';
        restartBtn.style.display = 'none';
    }
    
    // Only update logs if this is the selected bot
    if (div.classList.contains('selected')) {
        const logsDiv = div.querySelector('.bot-logs');
        logsDiv.innerHTML = '';
        bot.logs?.forEach(log => {
            const logDiv = document.createElement('div');
            logDiv.className = `log-entry ${log.type || 'info'}`;
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = new Date(log.timestamp || bot.startTime).toLocaleTimeString();
            
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

loadActiveBots();
