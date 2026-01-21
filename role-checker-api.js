// Discord Role Checker API Server (Node.js + Express)
// This server checks if a Discord user has a specific role

const express = require('express');
const axios = require('axios');
const app = express();

// Configuration
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || 'YOUR_SERVER_ID_HERE';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Discord Role Checker API is running',
        endpoints: {
            checkRole: 'POST /check-role',
            verificationLog: 'POST /verification-log'
        }
    });
});

// Store pending verifications (in production, use a database)
const pendingVerifications = new Map();

// Request verification endpoint
app.post('/request-verification', async (req, res) => {
    try {
        const { playerName, userId, displayName, accountAge, discordId, robloxUserId } = req.body;
        
        console.log(`Verification request from: ${playerName}`);
        
        // Get Discord webhook URL from environment
        const logWebhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
        
        if (!logWebhookUrl) {
            console.warn('No log webhook URL configured');
            return res.json({ success: false, message: 'Logging not configured' });
        }
        
        // Generate unique verification ID
        const verificationId = `${userId}_${Date.now()}`;
        
        // Store pending verification
        pendingVerifications.set(verificationId, {
            playerName,
            userId,
            robloxUserId,
            discordId,
            timestamp: Date.now(),
            status: 'pending'
        });
        
        // Create embed for Discord with button
        const embed = {
            title: '🔔 New Verification Request',
            color: 0xffaa00,
            fields: [
                {
                    name: '👤 Roblox Player',
                    value: `**Username:** ${playerName}\n**Display:** ${displayName}\n**User ID:** ${userId}`,
                    inline: true
                },
                {
                    name: '🎮 Account Info',
                    value: `**Account Age:** ${accountAge} days\n**Profile:** [View](https://www.roblox.com/users/${userId}/profile)`,
                    inline: true
                },
                {
                    name: '💬 Discord User',
                    value: `**User ID:** ${discordId}\n**Mention:** <@${discordId}>`,
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: `Verification ID: ${verificationId}`
            }
        };
        
        // Send to Discord webhook with button
        await axios.post(logWebhookUrl, {
            embeds: [embed],
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    style: 3,
                    label: 'Approve',
                    custom_id: `verify_approve_${verificationId}`
                }, {
                    type: 2,
                    style: 4,
                    label: 'Deny',
                    custom_id: `verify_deny_${verificationId}`
                }]
            }]
        });
        
        console.log('Verification request sent to Discord');
        res.json({ success: true, verificationId });
        
    } catch (error) {
        console.error('Error sending verification request:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Check verification status endpoint
app.post('/check-verification-status', (req, res) => {
    try {
        const { verificationId } = req.body;
        
        const verification = pendingVerifications.get(verificationId);
        
        if (!verification) {
            return res.json({ status: 'not_found' });
        }
        
        // Auto-expire after 5 minutes
        if (Date.now() - verification.timestamp > 300000) {
            pendingVerifications.delete(verificationId);
            return res.json({ status: 'expired' });
        }
        
        res.json({ status: verification.status });
        
    } catch (error) {
        console.error('Error checking verification status:', error.message);
        res.json({ status: 'error', error: error.message });
    }
});

// Verification logging endpoint (for automatic role-based verification)
app.post('/verification-log', async (req, res) => {
    try {
        const { playerName, userId, displayName, accountAge, discordId, hasRole, timestamp } = req.body;
        
        console.log(`Logging verification: ${playerName} - ${hasRole ? 'GRANTED' : 'DENIED'}`);
        
        // Get Discord webhook URL from environment
        const logWebhookUrl = process.env.DISCORD_LOG_WEBHOOK_URL;
        
        if (!logWebhookUrl) {
            console.warn('No log webhook URL configured');
            return res.json({ success: false, message: 'Logging not configured' });
        }
        
        // Create embed for Discord
        const embed = {
            title: hasRole ? '✅ Access Granted' : '❌ Access Denied',
            color: hasRole ? 0x00ff00 : 0xff0000,
            fields: [
                {
                    name: '👤 Roblox Player',
                    value: `**Username:** ${playerName}\n**Display:** ${displayName}\n**User ID:** ${userId}`,
                    inline: true
                },
                {
                    name: '🎮 Account Info',
                    value: `**Account Age:** ${accountAge} days\n**Profile:** [View](https://www.roblox.com/users/${userId}/profile)`,
                    inline: true
                },
                {
                    name: '💬 Discord',
                    value: `**User ID:** ${discordId}\n**Mention:** <@${discordId}>`,
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Role Verification System'
            }
        };
        
        // Send to Discord webhook
        await axios.post(logWebhookUrl, {
            embeds: [embed]
        });
        
        console.log('Verification logged to Discord');
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error logging verification:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Role check endpoint
app.post('/check-role', async (req, res) => {
    try {
        const { discordId, requiredRoleId } = req.body;
        
        console.log(`Checking role for Discord ID: ${discordId}`);
        
        // Validate input
        if (!discordId || !requiredRoleId) {
            return res.status(400).json({ 
                error: 'Missing discordId or requiredRoleId',
                hasRole: false 
            });
        }
        
        // Get guild member from Discord API
        const memberResponse = await axios.get(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discordId}`,
            {
                headers: {
                    'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
                }
            }
        );
        
        const member = memberResponse.data;
        const hasRole = member.roles.includes(requiredRoleId);
        
        console.log(`User ${member.user.username} has role: ${hasRole}`);
        
        res.json({
            success: true,
            hasRole: hasRole,
            username: member.user.username,
            roles: member.roles
        });
        
    } catch (error) {
        console.error('Error checking role:', error.message);
        
        if (error.response) {
            // Discord API error
            console.error('Discord API Error:', error.response.status, error.response.data);
            
            if (error.response.status === 404) {
                return res.json({
                    success: false,
                    hasRole: false,
                    error: 'User not found in Discord server'
                });
            }
        }
        
        res.status(500).json({ 
            success: false,
            hasRole: false,
            error: 'Failed to check role',
            details: error.message 
        });
    }
});

// Get role info endpoint (helper)
app.get('/roles', async (req, res) => {
    try {
        const rolesResponse = await axios.get(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/roles`,
            {
                headers: {
                    'Authorization': `Bot ${DISCORD_BOT_TOKEN}`
                }
            }
        );
        
        const roles = rolesResponse.data.map(role => ({
            id: role.id,
            name: role.name,
            color: role.color
        }));
        
        res.json({ roles });
        
    } catch (error) {
        console.error('Error fetching roles:', error.message);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Discord Role Checker API running on port ${PORT}`);
    console.log(`Guild ID: ${DISCORD_GUILD_ID}`);
    console.log(`Endpoints:`);
    console.log(`  - POST /check-role`);
    console.log(`  - POST /verification-log`);
    console.log(`  - GET /roles`);
});
