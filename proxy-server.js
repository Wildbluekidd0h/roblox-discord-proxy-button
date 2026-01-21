// Proxy Server (Node.js + Express)
// This server receives requests from Roblox and forwards them to Discord
// Roblox cannot directly call Discord webhooks due to CORS restrictions

const express = require('express');
const axios = require('axios');
const app = express();

// Configuration
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS headers to allow Roblox to make requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Discord Webhook Proxy Server is running' });
});

// Webhook proxy endpoint
app.post('/discord-webhook', async (req, res) => {
    try {
        console.log('Received request from Roblox:', req.body);
        
        // Validate the request has content
        if (!req.body.content) {
            return res.status(400).json({ error: 'Missing content in request' });
        }
        
        // Forward the message to Discord
        await axios.post(DISCORD_WEBHOOK_URL, {
            content: req.body.content,
            username: req.body.username || 'Roblox Game Bot',
            avatar_url: req.body.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'
        });
        
        console.log('Successfully forwarded message to Discord');
        res.json({ success: true, message: 'Message sent to Discord' });
        
    } catch (error) {
        console.error('Error forwarding to Discord:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send message to Discord',
            details: error.message 
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Discord Webhook Proxy Server running on port ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/discord-webhook`);
});
