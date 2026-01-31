// Discord Bot for Manual Verification System
// This bot handles button interactions for verification requests

const { Client, GatewayIntentBits, Partials, InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

// Configuration
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PORT = process.env.PORT || 3000;

// Store pending verifications (shared with API)
const pendingVerifications = new Map();
const verifiedUsers = new Map(); // Maps Discord ID to verified Roblox account info
const robloxToDiscord = new Map(); // Maps Roblox User ID to Discord ID (remembers link)
const discordToRoblox = new Map(); // Maps Discord ID to Roblox User ID
const staffContactRequests = new Map(); // Tracks contact requests to prevent spam
const pendingRobloxVerifications = new Map(); // Maps Discord ID to pending Roblox verification (with code)

// Staff User IDs (verified in-game, can access without password)
const STAFF_USER_IDS = new Set([
    8976444910,  // Wyldieee
    // Add more staff Roblox User IDs here
]);

// Simple admin password (change this!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

// Required Discord role ID that users will GET after verifying
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || null; // Role to give after verification

// Required Discord role ID that users must HAVE before they can verify (optional)
const REQUIRED_ROLE_ID = process.env.REQUIRED_ROLE_ID || null; // Role required to verify (null = no requirement)

// Require Roblox display name to match Discord display name (like Bloxlink)
const REQUIRE_MATCHING_DISPLAY_NAME = process.env.REQUIRE_MATCHING_DISPLAY_NAME !== 'false'; // Default: true

// Verification channel where the verify button will be posted
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID || process.env.DISCORD_VERIFICATION_CHANNEL_ID;

// Role to give to new members when they join the server (run !setupserver to create)
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID || null;

// Additional role to give when verified (e.g., member role)
const VERIFIED_MEMBER_ROLE_ID = process.env.VERIFIED_MEMBER_ROLE_ID || null;

// Manual verification channels (run !setupserver to create)
const VERIFICATION_LOG_CHANNEL_ID = process.env.VERIFICATION_LOG_CHANNEL_ID || '1467019082409840672';
const HOW_TO_VERIFY_CHANNEL_ID = process.env.HOW_TO_VERIFY_CHANNEL_ID || null;

// In-game verification logs channel (logs when people verify in-game)
const IN_GAME_VERIFICATION_LOG_CHANNEL_ID = process.env.IN_GAME_VERIFICATION_LOG_CHANNEL_ID || '1467045351969128530';

// Ping roles channel - where users can get notification roles
const PING_ROLES_CHANNEL_ID = process.env.PING_ROLES_CHANNEL_ID || '1467184314675494996';

// Ping roles configuration - add your role IDs here
// Format: { id: 'ROLE_ID', label: 'Button Label', emoji: 'emoji', description: 'What this role is for' }
const PING_ROLES = [
    { id: '1467184546918174937', label: 'Game Ping', emoji: '🎮', description: 'Get pinged for game sessions' },
    { id: '1467184619748327485', label: 'Server Ping', emoji: '📢', description: 'Get pinged for server announcements' },
    { id: '1467184650983051418', label: 'Giveaway Ping', emoji: '🎁', description: 'Get pinged for giveaways' },
    { id: '1467184692347539664', label: 'Poll Ping', emoji: '📊', description: 'Get pinged for polls and voting' },
    { id: '1467184731664941189', label: 'Sneaks Ping', emoji: '👀', description: 'Get pinged for sneak peeks' },
    { id: '1467184771473084503', label: 'Looking Ping', emoji: '🔍', description: 'Get pinged when people are looking for others' },
    { id: '1467184835687612476', label: 'Update Ping', emoji: '🆕', description: 'Get pinged for updates' },
].filter(role => role.id); // Only include roles that have IDs set

// Gender roles configuration - will be auto-created if they don't exist
const GENDER_ROLE_DEFINITIONS = [
    { name: 'Male', emoji: '♂️', color: '#3498db', description: 'Male' },
    { name: 'Female', emoji: '♀️', color: '#e91e63', description: 'Female' },
    { name: 'Non-Binary', emoji: '⚧️', color: '#9b59b6', description: 'Non-Binary' },
    { name: 'Other', emoji: '🌈', color: '#2ecc71', description: 'Other' },
];

// Vore preference roles configuration - will be auto-created if they don't exist
const VORE_ROLE_DEFINITIONS = [
    { name: 'Switch', emoji: '🔄', color: '#f39c12', description: 'Both pred and prey' },
    { name: 'Pred', emoji: '🦁', color: '#e74c3c', description: 'Predator' },
    { name: 'Prey', emoji: '🐰', color: '#3498db', description: 'Prey' },
];

// These will be populated when roles are created/found
let GENDER_ROLES = [];
let VORE_ROLES = [];

// Roblox Group Configuration
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID || null; // Your Roblox group ID
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE || null; // .ROBLOSECURITY cookie (optional, for auto-accept)

// Store pending manual verifications
const pendingManualVerifications = new Map();

// DM Verification Questions
const VERIFICATION_QUESTIONS = [
    { key: 'birthdate', question: '**Question 1/16:** What is your birthdate? (MM/DD/YYYY or DD/MM/YYYY)\n*We use this to confirm your age. You must be 18 or older to join this community.*' },
    { key: 'nextBirthdayAge', question: '**Question 2/16:** How old will you be on your next birthday?' },
    { key: 'voreServers', question: '**Question 3/16:** List any vore-related servers you are currently in.\n*Include server names or links. If none, explain why you joined this server.*' },
    { key: 'whyJoin', question: '**Question 4/16:** Why did you decide to join Forest Park Hangout?' },
    { key: 'interests', question: '**Question 5/16:** What about this server interests you?' },
    { key: 'rulesQuote', question: '**Question 6/16:** Quote 3 rules from our server and explain what they mean in your own words.\n*This shows you\'ve read and understand the rules.*' },
    { key: 'friendReferral', question: '**Question 7/16:** Were you invited by a friend? If yes, please tell us their Discord username or server nickname.\n*If not invited by a friend, just say No.*' },
    { key: 'howFound', question: '**Question 8/16:** How did you find this server?\n*Be specific: invite from a friend, Discord search, another server, etc.*' },
    { key: 'timezone', question: '**Question 9/16:** What timezone are you in?\n*e.g. EST, PST, GMT, UTC+2*' },
    { key: 'bannedBefore', question: '**Question 10/16:** Have you been banned from any Discord servers before?\n*If yes, explain which servers and why. If no, just say No.*' },
    { key: 'altAccounts', question: '**Question 11/16:** Do you have any alt Discord accounts?\n*If yes, list them. If no, just say No.*' },
    { key: 'voreMeaning', question: '**Question 12/16:** (Optional) What does vore mean to you?\n*You can skip this by typing "skip"*' },
    { key: 'robloxUsername', question: '**Question 13/16:** What is your Roblox username?\n*Your actual username, not display name. We will verify you own this account.*' },
    { key: 'playedBefore', question: '**Question 14/16:** Have you played Forest Park Hangout on Roblox before?\n*If yes, what features or areas have you explored?*' },
    { key: 'comfortableRules', question: '**Question 15/16:** Are you comfortable following all server rules?\n*Explain how you make sure to follow community rules.*' },
    { key: 'experienceHoping', question: '**Question 16/16:** What kind of experience are you hoping to have here?\n*e.g. roleplay, social hangout, exploration, events...*' }
];

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User
    ]
});

// Create Express app for API endpoints
const app = express();
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

// Admin Panel HTML
const adminPanelHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Verification Admin Panel</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00d4ff; }
        .card { background: #16213e; padding: 20px; margin: 15px 0; border-radius: 10px; border-left: 4px solid #00d4ff; }
        input, button { padding: 10px 15px; margin: 5px; border-radius: 5px; border: none; }
        input { background: #0f3460; color: #fff; width: 200px; }
        button { background: #00d4ff; color: #000; cursor: pointer; font-weight: bold; }
        button:hover { background: #00a8cc; }
        .danger { background: #ff4757; color: #fff; }
        .success { background: #2ed573; color: #000; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #0f3460; }
        th { background: #0f3460; }
        .status-pending { color: #ffa502; }
        .status-approved { color: #2ed573; }
        .status-denied { color: #ff4757; }
        #loginForm, #adminContent { display: none; }
        .tab { padding: 10px 20px; background: #0f3460; cursor: pointer; display: inline-block; margin-right: 5px; border-radius: 5px 5px 0 0; }
        .tab.active { background: #16213e; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <h1>🔐 Verification Admin Panel</h1>
    
    <div id="loginForm">
        <div class="card">
            <h3>Login</h3>
            <input type="password" id="password" placeholder="Admin Password">
            <button onclick="login()">Login</button>
            <p id="loginError" style="color: #ff4757;"></p>
        </div>
    </div>
    
    <div id="adminContent">
        <div>
            <div class="tab active" onclick="showTab('manual')">Manual Verify</div>
            <div class="tab" onclick="showTab('pending')">Pending Requests</div>
            <div class="tab" onclick="showTab('verified')">Verified Users</div>
            <div class="tab" onclick="showTab('contacts')">Staff Contacts</div>
        </div>
        
        <div id="manual" class="tab-content active">
            <div class="card">
                <h3>Manually Verify a Player</h3>
                <p>For players who cannot use Discord verification.</p>
                <input type="text" id="robloxUsername" placeholder="Roblox Username">
                <input type="text" id="robloxUserId" placeholder="Roblox User ID">
                <input type="text" id="discordId" placeholder="Discord ID (optional)">
                <input type="text" id="reason" placeholder="Reason">
                <button class="success" onclick="manualVerify()">✓ Verify Player</button>
                <p id="manualResult"></p>
            </div>
        </div>
        
        <div id="pending" class="tab-content">
            <div class="card">
                <h3>Pending Verification Requests</h3>
                <button onclick="loadPending()">Refresh</button>
                <div id="pendingList"></div>
            </div>
        </div>
        
        <div id="verified" class="tab-content">
            <div class="card">
                <h3>Verified Users</h3>
                <button onclick="loadVerified()">Refresh</button>
                <div id="verifiedList"></div>
            </div>
        </div>
        
        <div id="contacts" class="tab-content">
            <div class="card">
                <h3>Staff Contact Requests</h3>
                <button onclick="loadContacts()">Refresh</button>
                <div id="contactsList"></div>
            </div>
        </div>
    </div>
    
    <script>
        let adminToken = '';
        
        document.getElementById('loginForm').style.display = 'block';
        
        async function login() {
            const password = document.getElementById('password').value;
            const res = await fetch('/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (data.success) {
                adminToken = data.token;
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('adminContent').style.display = 'block';
                loadPending();
            } else {
                document.getElementById('loginError').textContent = 'Invalid password';
            }
        }
        
        function showTab(name) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(name).classList.add('active');
        }
        
        async function manualVerify() {
            const robloxUsername = document.getElementById('robloxUsername').value;
            const robloxUserId = document.getElementById('robloxUserId').value;
            const discordId = document.getElementById('discordId').value;
            const reason = document.getElementById('reason').value;
            
            const res = await fetch('/admin/manual-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: adminToken, robloxUsername, robloxUserId, discordId, reason })
            });
            const data = await res.json();
            document.getElementById('manualResult').textContent = data.message;
            document.getElementById('manualResult').style.color = data.success ? '#2ed573' : '#ff4757';
        }
        
        async function loadPending() {
            const res = await fetch('/admin/pending?token=' + adminToken);
            const data = await res.json();
            let html = '<table><tr><th>Player</th><th>Discord</th><th>Status</th><th>Actions</th></tr>';
            data.forEach(v => {
                html += '<tr><td>' + v.playerName + ' (' + v.userId + ')</td><td>' + v.discordId + '</td><td class="status-' + v.status + '">' + v.status + '</td>';
                html += '<td><button class="success" onclick="approve(\\'' + v.id + '\\')">✓</button> <button class="danger" onclick="deny(\\'' + v.id + '\\')">✗</button></td></tr>';
            });
            html += '</table>';
            document.getElementById('pendingList').innerHTML = html;
        }
        
        async function loadVerified() {
            const res = await fetch('/admin/verified?token=' + adminToken);
            const data = await res.json();
            let html = '<table><tr><th>Roblox User</th><th>Discord ID</th><th>Verified At</th></tr>';
            data.forEach(v => {
                html += '<tr><td>' + v.robloxUsername + ' (' + v.robloxUserId + ')</td><td>' + v.discordId + '</td><td>' + v.approvedAt + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('verifiedList').innerHTML = html;
        }
        
        async function loadContacts() {
            const res = await fetch('/admin/contacts?token=' + adminToken);
            const data = await res.json();
            let html = '<table><tr><th>Player</th><th>Message</th><th>Time</th></tr>';
            data.forEach(c => {
                html += '<tr><td>' + c.playerName + ' (' + c.userId + ')</td><td>' + c.message + '</td><td>' + c.time + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('contactsList').innerHTML = html;
        }
        
        async function approve(id) {
            await fetch('/admin/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminToken, verificationId: id }) });
            loadPending();
        }
        
        async function deny(id) {
            await fetch('/admin/deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: adminToken, verificationId: id }) });
            loadPending();
        }
    </script>
</body>
</html>
`;

// Serve admin panel
app.get('/admin', (req, res) => {
    res.send(adminPanelHTML);
});

// Admin login
let adminTokens = new Set();
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = Math.random().toString(36).substring(2);
        adminTokens.add(token);
        res.json({ success: true, token });
    } else {
        res.json({ success: false });
    }
});

// Admin middleware
const checkAdmin = (req, res, next) => {
    const token = req.query.token || req.body.token;
    if (!adminTokens.has(token)) {
        return res.json({ error: 'Unauthorized' });
    }
    next();
};

// Manual verify endpoint
app.post('/admin/manual-verify', checkAdmin, (req, res) => {
    const { robloxUsername, robloxUserId, discordId, reason } = req.body;
    
    if (!robloxUsername || !robloxUserId) {
        return res.json({ success: false, message: 'Roblox username and ID required' });
    }
    
    // Add to verified users
    const finalDiscordId = discordId || 'manual_' + robloxUserId;
    verifiedUsers.set(finalDiscordId, {
        robloxUsername,
        robloxUserId,
        approvedAt: new Date().toISOString(),
        approvedBy: 'Admin Panel',
        reason: reason || 'Manual verification'
    });
    
    // Link Roblox to Discord
    robloxToDiscord.set(robloxUserId, finalDiscordId);
    
    console.log(`✓ Manual verification: ${robloxUsername} (${robloxUserId}) by admin`);
    res.json({ success: true, message: `Verified ${robloxUsername} successfully!` });
});

// Get pending verifications
app.get('/admin/pending', checkAdmin, (req, res) => {
    const pending = [];
    pendingVerifications.forEach((v, id) => {
        pending.push({ id, ...v });
    });
    res.json(pending);
});

// Get verified users
app.get('/admin/verified', checkAdmin, (req, res) => {
    const verified = [];
    verifiedUsers.forEach((v, discordId) => {
        verified.push({ discordId, ...v });
    });
    res.json(verified);
});

// Get contact requests
app.get('/admin/contacts', checkAdmin, (req, res) => {
    const contacts = [];
    staffContactRequests.forEach((c, id) => {
        contacts.push({ id, ...c });
    });
    res.json(contacts);
});

// Admin approve
app.post('/admin/approve', checkAdmin, async (req, res) => {
    const { verificationId } = req.body;
    const verification = pendingVerifications.get(verificationId);
    if (verification) {
        verification.status = 'approved';
        verifiedUsers.set(verification.discordId, {
            robloxUsername: verification.playerName,
            robloxUserId: verification.robloxUserId,
            approvedAt: new Date().toISOString(),
            approvedBy: 'Admin Panel'
        });
        robloxToDiscord.set(verification.robloxUserId || verification.userId, verification.discordId);
    }
    res.json({ success: true });
});

// Admin deny
app.post('/admin/deny', checkAdmin, (req, res) => {
    const { verificationId } = req.body;
    const verification = pendingVerifications.get(verificationId);
    if (verification) {
        verification.status = 'denied';
    }
    res.json({ success: true });
});

// Get linked Discord for Roblox user (for auto-fill)
app.get('/get-linked-discord/:robloxUserId', (req, res) => {
    const { robloxUserId } = req.params;
    const linkedDiscord = robloxToDiscord.get(robloxUserId);
    if (linkedDiscord) {
        res.json({ linked: true, discordId: linkedDiscord });
    } else {
        res.json({ linked: false });
    }
});

// ========== STAFF ENDPOINTS (no password needed, verified in-game) ==========

// Check if user ID is staff
const isStaff = (userId) => STAFF_USER_IDS.has(parseInt(userId));

// Get pending verifications for staff (no login required - staff verified in-game)
app.get('/staff/pending', (req, res) => {
    const { staffId } = req.query;
    
    if (!staffId || !isStaff(staffId)) {
        console.log(`Unauthorized staff/pending attempt from: ${staffId}`);
        return res.json({ error: 'Unauthorized' });
    }
    
    console.log(`Staff ${staffId} fetching pending verifications`);
    const pending = [];
    pendingVerifications.forEach((v, id) => {
        pending.push({ id, ...v });
    });
    res.json(pending);
});

// Staff approve (no login required - staff verified in-game)
app.post('/staff/approve', async (req, res) => {
    const { staffId, staffName, verificationId } = req.body;
    
    if (!staffId || !isStaff(staffId)) {
        console.log(`Unauthorized staff/approve attempt from: ${staffId}`);
        return res.json({ success: false, error: 'Unauthorized' });
    }
    
    const verification = pendingVerifications.get(verificationId);
    if (!verification) {
        return res.json({ success: false, error: 'Verification not found' });
    }
    
    verification.status = 'approved';
    verifiedUsers.set(verification.discordId, {
        robloxUsername: verification.playerName,
        robloxUserId: verification.robloxUserId,
        discordId: verification.discordId,
        verifiedAt: new Date().toISOString(),
        approvedBy: staffName || staffId
    });
    
    // Remember the link
    if (verification.robloxUserId) {
        robloxToDiscord.set(String(verification.robloxUserId), verification.discordId);
    }
    
    console.log(`✓ Staff ${staffName || staffId} approved verification: ${verificationId}`);
    res.json({ success: true, message: 'Verification approved!' });
});

// Staff deny (no login required - staff verified in-game)
app.post('/staff/deny', async (req, res) => {
    const { staffId, staffName, verificationId } = req.body;
    
    if (!staffId || !isStaff(staffId)) {
        console.log(`Unauthorized staff/deny attempt from: ${staffId}`);
        return res.json({ success: false, error: 'Unauthorized' });
    }
    
    const verification = pendingVerifications.get(verificationId);
    if (!verification) {
        return res.json({ success: false, error: 'Verification not found' });
    }
    
    verification.status = 'denied';
    console.log(`✗ Staff ${staffName || staffId} denied verification: ${verificationId}`);
    res.json({ success: true, message: 'Verification denied!' });
});

// ========== END STAFF ENDPOINTS ==========

// Contact staff endpoint
app.post('/contact-staff', async (req, res) => {
    const { playerName, userId, message } = req.body;
    
    // Check for spam (1 request per 5 minutes per user)
    const lastRequest = staffContactRequests.get(userId);
    if (lastRequest && Date.now() - lastRequest.timestamp < 300000) {
        return res.json({ success: false, message: 'Please wait 5 minutes between contact requests' });
    }
    
    const contactId = `contact_${userId}_${Date.now()}`;
    staffContactRequests.set(contactId, {
        playerName,
        userId,
        message: message || 'Needs help with verification',
        time: new Date().toISOString(),
        timestamp: Date.now()
    });
    
    // Send to Discord channel
    try {
        const channelId = process.env.DISCORD_VERIFICATION_CHANNEL_ID;
        if (channelId && client.user) {
            const channel = await client.channels.fetch(channelId);
            const { EmbedBuilder } = require('discord.js');
            
            const embed = new EmbedBuilder()
                .setTitle('📞 Staff Contact Request')
                .setDescription('A player needs help with verification')
                .setColor(0xffa502)
                .addFields(
                    { name: '👤 Player', value: `**${playerName}**\\nID: ${userId}\\n[Profile](https://www.roblox.com/users/${userId}/profile)`, inline: true },
                    { name: '💬 Message', value: message || 'Needs help with verification', inline: true }
                )
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error('Failed to send contact request to Discord:', err.message);
    }
    
    console.log(`Staff contact request from ${playerName} (${userId}): ${message}`);
    res.json({ success: true, message: 'Staff has been notified! They will help you soon.' });
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok',
        bot: client.user ? client.user.tag : 'Not connected',
        message: 'Discord Manual Verification Bot is running' 
    });
});

// Request verification endpoint
app.post('/request-verification', async (req, res) => {
    try {
        const { playerName, userId, displayName, accountAge, discordId, robloxUserId, autoJoin } = req.body;
        
        console.log(`Verification request from: ${playerName} (Discord: ${discordId}, autoJoin: ${autoJoin})`);
        
        // Generate unique verification ID
        const verificationId = `${userId}_${Date.now()}`;
        
        // If this is an auto-join (player just joined game), add directly to pending
        if (autoJoin || discordId.startsWith('pending_')) {
            console.log(`Auto-join entry for: ${playerName}`);
            
            // Check if this user already has a pending entry (prevent duplicates)
            let existingEntry = null;
            for (const [id, v] of pendingVerifications.entries()) {
                if (v.userId === userId || v.robloxUserId === robloxUserId) {
                    existingEntry = { id, ...v };
                    break;
                }
            }
            
            if (existingEntry) {
                console.log(`Player ${playerName} already in pending list, returning existing entry`);
                return res.json({ 
                    success: true, 
                    verificationId: existingEntry.id,
                    message: 'Already in pending list'
                });
            }
            
            pendingVerifications.set(verificationId, {
                playerName,
                userId,
                robloxUserId,
                discordId: null, // No Discord linked yet
                discordUsername: null,
                displayName,
                accountAge,
                timestamp: Date.now(),
                status: 'pending_staff_review', // Waiting for staff to verify in-game
                autoJoin: true
            });
            
            // Log to Discord channel that a new player joined and needs verification
            if (client.user && IN_GAME_VERIFICATION_LOG_CHANNEL_ID) {
                try {
                    const logChannel = await client.channels.fetch(IN_GAME_VERIFICATION_LOG_CHANNEL_ID);
                    const { EmbedBuilder } = require('discord.js');
                    
                    const joinEmbed = new EmbedBuilder()
                        .setTitle('🎮 New Player Joined Game')
                        .setDescription(`A new unverified player has joined the game.`)
                        .setColor(0xffa500) // Orange for pending
                        .addFields(
                            { name: '👤 Roblox Username', value: playerName, inline: true },
                            { name: '🏷️ Display Name', value: displayName || playerName, inline: true },
                            { name: '🆔 User ID', value: String(userId), inline: true },
                            { name: '📅 Account Age', value: accountAge ? `${accountAge} days` : 'Unknown', inline: true },
                            { name: '🔗 Profile', value: `[View Profile](https://www.roblox.com/users/${robloxUserId || userId}/profile)`, inline: true },
                            { name: '📋 Status', value: '⏳ Waiting for Discord verification', inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: `Verification ID: ${verificationId}` });
                    
                    await logChannel.send({ embeds: [joinEmbed] });
                    console.log(`✓ Logged new player join to Discord: ${playerName}`);
                } catch (logErr) {
                    console.error('Failed to log player join to Discord:', logErr.message);
                }
            }
            
            // Auto-expire after 30 minutes for auto-join
            setTimeout(() => {
                const verification = pendingVerifications.get(verificationId);
                if (verification && verification.status !== 'approved' && verification.status !== 'denied') {
                    pendingVerifications.delete(verificationId);
                    console.log(`Auto-join verification ${verificationId} expired and removed`);
                }
            }, 30 * 60 * 1000);
            
            return res.json({ 
                success: true, 
                verificationId,
                message: 'Added to pending list for staff review'
            });
        }
        
        // Normal flow - lookup Discord user
        // Get verification channel ID from environment
        const channelId = process.env.DISCORD_VERIFICATION_CHANNEL_ID;
        const guildId = process.env.DISCORD_GUILD_ID;
        
        if (!channelId) {
            console.warn('No verification channel ID configured');
            return res.json({ success: false, message: 'Channel not configured' });
        }
        
        if (!client.user) {
            console.warn('Bot not connected to Discord');
            return res.json({ success: false, message: 'Bot not connected' });
        }
        
        // Find Discord user by username
        let discordUser = null;
        let actualDiscordId = discordId; // Will be updated to actual ID if username provided
        
        try {
            const guild = await client.guilds.fetch(guildId);
            
            // Check if it's a username (not a numeric ID)
            if (isNaN(discordId)) {
                // Clean up the input (remove @ symbol, extra spaces, etc.)
                const cleanUsername = discordId.trim().replace(/^@/, '').toLowerCase();
                
                // Search by username using query (much faster than fetching all members)
                const searchResults = await guild.members.search({ query: cleanUsername, limit: 50 });
                
                console.log(`Searching for: "${cleanUsername}", found ${searchResults.size} potential matches`);
                
                // Find exact match (check multiple fields)
                let member = searchResults.find(m => {
                    const username = m.user.username?.toLowerCase() || '';
                    const globalName = m.user.globalName?.toLowerCase() || '';
                    const displayName = m.displayName?.toLowerCase() || '';
                    const tag = m.user.tag?.toLowerCase() || '';
                    const nickname = m.nickname?.toLowerCase() || '';
                    
                    return username === cleanUsername ||
                           globalName === cleanUsername ||
                           displayName === cleanUsername ||
                           tag === cleanUsername ||
                           tag.split('#')[0] === cleanUsername ||
                           nickname === cleanUsername;
                });
                
                // If no exact match, try partial match
                if (!member && searchResults.size > 0) {
                    member = searchResults.find(m => {
                        const username = m.user.username?.toLowerCase() || '';
                        const globalName = m.user.globalName?.toLowerCase() || '';
                        const displayName = m.displayName?.toLowerCase() || '';
                        
                        return username.includes(cleanUsername) ||
                               cleanUsername.includes(username) ||
                               globalName.includes(cleanUsername) ||
                               cleanUsername.includes(globalName) ||
                               displayName.includes(cleanUsername) ||
                               cleanUsername.includes(displayName);
                    });
                    
                    if (member) {
                        console.log(`Found partial match: ${member.user.username}`);
                    }
                }
                
                if (member) {
                    discordUser = member.user;
                    actualDiscordId = member.user.id;
                    console.log(`✓ Found user by username: ${discordUser.tag} (ID: ${actualDiscordId}, globalName: ${discordUser.globalName})`);
                } else {
                    console.warn(`User not found with username: ${discordId}`);
                    console.log(`Search results were:`, searchResults.map(m => `${m.user.username} / ${m.user.globalName} / ${m.displayName}`).join(', ') || 'none');
                    return res.json({ success: false, message: `Discord user "${discordId}" not found. Make sure you:\n1. Entered your EXACT Discord username (not display name)\n2. Are already in the Discord server\n\nYour username is shown in your Discord profile settings.` });
                }
            } else {
                // It's a numeric ID, fetch directly
                discordUser = await client.users.fetch(discordId);
                actualDiscordId = discordId;
            }
        } catch (fetchError) {
            console.error('Error finding Discord user:', fetchError.message);
            return res.json({ success: false, message: `Could not find Discord user "${discordId}". Make sure you entered your username correctly and are in the server.` });
        }
        
        // Generate unique verification ID (for normal flow)
        const normalVerificationId = `${userId}_${Date.now()}`;
        
        // Store pending verification with awaiting_user_confirm status
        const isReturningUser = verifiedUsers.has(actualDiscordId);
        
        pendingVerifications.set(normalVerificationId, {
            playerName,
            userId,
            robloxUserId,
            discordId: actualDiscordId, // Store the actual Discord ID
            discordUsername: discordId, // Store the original username input
            displayName,
            accountAge,
            timestamp: Date.now(),
            status: 'awaiting_user_confirm',
            isReturningUser // Flag to skip staff notification
        });
        
        // Auto-expire after 30 minutes (increased from 5 min to handle server cold starts)
        setTimeout(() => {
            const verification = pendingVerifications.get(normalVerificationId);
            if (verification && verification.status !== 'approved' && verification.status !== 'denied') {
                verification.status = 'expired';
                console.log(`Verification ${normalVerificationId} expired`);
            }
        }, 30 * 60 * 1000);
        
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        // Try to send DM to the Discord user (already fetched above)
        try {
            console.log(`✓ Sending DM to: ${discordUser.tag}`);
            
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔐 Roblox Verification Request')
                .setDescription('Someone is trying to verify a Roblox account using your Discord username.')
                .setColor(0xff9900)
                .addFields(
                    {
                        name: '👤 Roblox Account',
                        value: `**Username:** ${playerName}\n**Display Name:** ${displayName}\n**User ID:** ${userId}`,
                        inline: false
                    },
                    {
                        name: '⚠️ Important',
                        value: 'If this **IS YOU**, click "✅ Confirm" below.\nIf this is **NOT YOU**, click "❌ Deny" or ignore this message.',
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'Click Confirm now - do not wait!' });
            
            const dmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`verify_user_confirm_${normalVerificationId}`)
                        .setLabel('✅ Confirm - This is me!')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`verify_user_deny_${normalVerificationId}`)
                        .setLabel('❌ Deny - Not me!')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await discordUser.send({
                embeds: [dmEmbed],
                components: [dmRow]
            });
            
            console.log(`✓ DM sent to Discord user ${discordId}`);
            res.json({ success: true, verificationId: normalVerificationId, message: 'Confirmation DM sent' });
            
        } catch (dmError) {
            console.error('Failed to send DM to user', discordId, ':', dmError.message);
            console.error('Full error:', dmError);
            // If DM fails, still allow verification but note it
            pendingVerifications.get(normalVerificationId).dmFailed = true;
            res.json({ success: true, verificationId: normalVerificationId, message: 'DM failed, proceeding anyway' });
        }
        
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
        
        res.json({ status: verification.status });
        
    } catch (error) {
        console.error('Error checking verification status:', error.message);
        res.json({ status: 'error', error: error.message });
    }
});

// ==================== ROBLOX GROUP MANAGEMENT ====================

// Check if a Roblox user is verified in Discord
app.get('/api/is-verified/:robloxId', (req, res) => {
    try {
        const robloxId = req.params.robloxId;
        const discordId = robloxToDiscord.get(String(robloxId));
        
        if (discordId) {
            const userData = verifiedUsers.get(discordId);
            res.json({
                verified: true,
                discordId: discordId,
                robloxUsername: userData?.robloxUsername || 'Unknown',
                verifiedAt: userData?.verifiedAt || null
            });
        } else {
            res.json({ verified: false });
        }
    } catch (error) {
        res.json({ verified: false, error: error.message });
    }
});

// Get all verified users (for group management)
app.get('/api/verified-users', (req, res) => {
    try {
        const users = [];
        for (const [discordId, data] of verifiedUsers.entries()) {
            users.push({
                discordId,
                robloxUserId: data.robloxUserId,
                robloxUsername: data.robloxUsername,
                verifiedAt: data.verifiedAt
            });
        }
        res.json({ success: true, users });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Get pending group join requests (requires ROBLOX_COOKIE)
app.get('/api/group/pending', async (req, res) => {
    if (!ROBLOX_GROUP_ID) {
        return res.json({ success: false, error: 'ROBLOX_GROUP_ID not configured' });
    }
    if (!ROBLOX_COOKIE) {
        return res.json({ success: false, error: 'ROBLOX_COOKIE not configured (required for group management)' });
    }
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=100`, {
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
            }
        });
        
        const data = await response.json();
        
        if (data.errors) {
            return res.json({ success: false, error: data.errors[0]?.message || 'Failed to get join requests' });
        }
        
        // Check which users are verified in Discord
        const pendingWithVerification = data.data?.map(request => {
            const discordId = robloxToDiscord.get(String(request.requester.userId));
            return {
                ...request,
                isVerifiedInDiscord: !!discordId,
                discordId: discordId || null
            };
        }) || [];
        
        res.json({
            success: true,
            pending: pendingWithVerification,
            verifiedCount: pendingWithVerification.filter(r => r.isVerifiedInDiscord).length,
            totalCount: pendingWithVerification.length
        });
        
    } catch (error) {
        console.error('Error getting group join requests:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Accept a group join request (requires ROBLOX_COOKIE)
app.post('/api/group/accept/:userId', async (req, res) => {
    if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
        return res.json({ success: false, error: 'Group management not configured' });
    }
    
    const userId = req.params.userId;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        // First get CSRF token
        const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
            }
        });
        const csrfToken = csrfResponse.headers.get('x-csrf-token');
        
        // Accept the join request
        const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${userId}`, {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                'X-CSRF-TOKEN': csrfToken,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            console.log(`✓ Accepted group join request for Roblox user ${userId}`);
            res.json({ success: true, message: `Accepted user ${userId} into group` });
        } else {
            const errorData = await response.json();
            res.json({ success: false, error: errorData.errors?.[0]?.message || 'Failed to accept' });
        }
        
    } catch (error) {
        console.error('Error accepting join request:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Decline a group join request (requires ROBLOX_COOKIE)
app.post('/api/group/decline/:userId', async (req, res) => {
    if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
        return res.json({ success: false, error: 'Group management not configured' });
    }
    
    const userId = req.params.userId;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        // First get CSRF token
        const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
            }
        });
        const csrfToken = csrfResponse.headers.get('x-csrf-token');
        
        // Decline the join request
        const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                'X-CSRF-TOKEN': csrfToken
            }
        });
        
        if (response.ok) {
            console.log(`✓ Declined group join request for Roblox user ${userId}`);
            res.json({ success: true, message: `Declined user ${userId}` });
        } else {
            const errorData = await response.json();
            res.json({ success: false, error: errorData.errors?.[0]?.message || 'Failed to decline' });
        }
        
    } catch (error) {
        console.error('Error declining join request:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// Auto-accept all verified users' join requests
app.post('/api/group/accept-all-verified', async (req, res) => {
    if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
        return res.json({ success: false, error: 'Group management not configured' });
    }
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        // Get pending requests
        const pendingResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=100`, {
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
            }
        });
        const pendingData = await pendingResponse.json();
        
        if (!pendingData.data) {
            return res.json({ success: false, error: 'Failed to get pending requests' });
        }
        
        // Get CSRF token
        const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
            }
        });
        const csrfToken = csrfResponse.headers.get('x-csrf-token');
        
        // Accept verified users
        const results = { accepted: [], failed: [], notVerified: [] };
        
        for (const request of pendingData.data) {
            const discordId = robloxToDiscord.get(String(request.requester.userId));
            
            if (discordId) {
                // User is verified, accept them
                try {
                    const acceptResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${request.requester.userId}`, {
                        method: 'POST',
                        headers: {
                            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                            'X-CSRF-TOKEN': csrfToken,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (acceptResponse.ok) {
                        results.accepted.push({ userId: request.requester.userId, username: request.requester.username });
                        console.log(`✓ Auto-accepted verified user: ${request.requester.username} (${request.requester.userId})`);
                    } else {
                        results.failed.push({ userId: request.requester.userId, username: request.requester.username });
                    }
                } catch (err) {
                    results.failed.push({ userId: request.requester.userId, username: request.requester.username });
                }
            } else {
                results.notVerified.push({ userId: request.requester.userId, username: request.requester.username });
            }
        }
        
        res.json({
            success: true,
            accepted: results.accepted.length,
            failed: results.failed.length,
            notVerified: results.notVerified.length,
            details: results
        });
        
    } catch (error) {
        console.error('Error auto-accepting:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ==================== END GROUP MANAGEMENT ====================

// ==================== SERVER SETUP COMMAND ====================
// Run !setupserver once to create all channels and roles

async function setupServer(guild) {
    const results = { roles: {}, channels: {}, categories: {} };
    
    console.log('🚀 Starting server setup...');
    
    // ========== CREATE ROLES (bottom to top order) ==========
    const rolesToCreate = [
        { name: '──────────────', color: '#2f3136', hoist: false }, // Divider
        { name: '🌟 Boosters', color: '#f47fff', hoist: true },
        { name: '──────────────', color: '#2f3136', hoist: false }, // Divider
        { name: '🔴 Banned from Game', color: '#ff0000', hoist: false },
        { name: '⚠️ Warned', color: '#ffcc00', hoist: false },
        { name: '🔇 Muted', color: '#808080', hoist: false },
        { name: '──────────────', color: '#2f3136', hoist: false }, // Divider
        { name: '🎮 Verified Player', color: '#2ecc71', hoist: true },
        { name: '✅ Verified', color: '#3498db', hoist: true },
        { name: '⏳ Unverified', color: '#95a5a6', hoist: true },
        { name: '──────────────', color: '#2f3136', hoist: false }, // Divider
        { name: '🎉 Event Team', color: '#e91e63', hoist: true },
        { name: '🛡️ Moderator', color: '#e67e22', hoist: true },
        { name: '⚔️ Admin', color: '#e74c3c', hoist: true },
        { name: '👑 Owner', color: '#f1c40f', hoist: true },
    ];
    
    for (const roleData of rolesToCreate) {
        try {
            const existingRole = guild.roles.cache.find(r => r.name === roleData.name);
            if (!existingRole) {
                const role = await guild.roles.create({
                    name: roleData.name,
                    color: roleData.color,
                    hoist: roleData.hoist,
                    mentionable: false
                });
                results.roles[roleData.name] = role.id;
                console.log(`✅ Created role: ${roleData.name}`);
            } else {
                results.roles[roleData.name] = existingRole.id;
                console.log(`⏭️ Role exists: ${roleData.name}`);
            }
        } catch (err) {
            console.log(`❌ Failed to create role ${roleData.name}: ${err.message}`);
        }
    }
    
    // Get role references for permissions
    const everyoneRole = guild.roles.everyone;
    const verifiedRole = guild.roles.cache.find(r => r.name === '✅ Verified');
    const unverifiedRole = guild.roles.cache.find(r => r.name === '⏳ Unverified');
    const staffRole = guild.roles.cache.find(r => r.name === '🛡️ Moderator');
    const adminRole = guild.roles.cache.find(r => r.name === '⚔️ Admin');
    
    // ========== CREATE CATEGORIES AND CHANNELS ==========
    const serverStructure = [
        {
            name: '📢 INFORMATION',
            channels: [
                { name: '📜・rules', type: 0, topic: 'Server rules and guidelines', isRulesChannel: true },
                { name: '📣・announcements', type: 0, topic: 'Important server announcements' },
                { name: '🎉・giveaways', type: 0, topic: 'Server giveaways and events' },
                { name: '📝・changelog', type: 0, topic: 'Updates and changes to the server' },
                { name: '🔗・socials', type: 0, topic: 'Our social media and links' },
            ]
        },
        {
            name: '🔐 VERIFICATION',
            channels: [
                { name: '❓・how-to-verify', type: 0, topic: 'Instructions on how to verify your account', isVerifyChannel: true },
                { name: '✅・verify-here', type: 0, topic: 'Click the button to start verification' },
            ]
        },
        {
            name: '💬 COMMUNITY',
            verifiedOnly: true,
            channels: [
                { name: '👋・introductions', type: 0, topic: 'Introduce yourself to the community!' },
                { name: '💭・general', type: 0, topic: 'General chat for everyone' },
                { name: '🎮・gaming', type: 0, topic: 'Talk about games' },
                { name: '🖼️・media', type: 0, topic: 'Share images, videos, and memes' },
                { name: '🤖・bot-commands', type: 0, topic: 'Use bot commands here' },
            ]
        },
        {
            name: '🎮 ROBLOX',
            verifiedOnly: true,
            channels: [
                { name: '🏠・forest-park-chat', type: 0, topic: 'Chat about Forest Park Hangout' },
                { name: '📸・screenshots', type: 0, topic: 'Share your in-game screenshots' },
                { name: '💡・suggestions', type: 0, topic: 'Suggest features for the game' },
                { name: '🐛・bug-reports', type: 0, topic: 'Report bugs in the game' },
            ]
        },
        {
            name: '🔊 VOICE CHANNELS',
            verifiedOnly: true,
            channels: [
                { name: '🎙️ General Voice', type: 2 },
                { name: '🎮 Gaming', type: 2 },
                { name: '🎵 Music', type: 2 },
                { name: '🔒 Private (2 max)', type: 2, userLimit: 2 },
            ]
        },
        {
            name: '🛡️ STAFF AREA',
            staffOnly: true,
            channels: [
                { name: '📋・staff-chat', type: 0, topic: 'Staff discussion' },
                { name: '📝・verification-logs', type: 0, topic: 'Verification request logs', isLogChannel: true },
                { name: '🔨・mod-logs', type: 0, topic: 'Moderation action logs' },
                { name: '📊・staff-commands', type: 0, topic: 'Bot commands for staff' },
                { name: '🎙️ Staff Voice', type: 2 },
            ]
        },
        {
            name: '⚙️ ADMIN',
            adminOnly: true,
            channels: [
                { name: '🔐・admin-chat', type: 0, topic: 'Admin only discussion' },
                { name: '📜・audit-logs', type: 0, topic: 'Server audit logs' },
                { name: '🤖・bot-config', type: 0, topic: 'Bot configuration' },
            ]
        }
    ];
    
    for (const category of serverStructure) {
        try {
            // Check if category exists
            let cat = guild.channels.cache.find(c => c.name === category.name && c.type === 4);
            
            if (!cat) {
                // Set up category permissions
                const permissionOverwrites = [
                    { id: everyoneRole.id, deny: ['ViewChannel'] }
                ];
                
                if (category.staffOnly && staffRole) {
                    permissionOverwrites.push({ id: staffRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] });
                    if (adminRole) permissionOverwrites.push({ id: adminRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] });
                } else if (category.adminOnly && adminRole) {
                    permissionOverwrites.push({ id: adminRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] });
                } else if (category.verifiedOnly && verifiedRole) {
                    permissionOverwrites.push({ id: verifiedRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] });
                } else {
                    // Public category (like INFORMATION and VERIFICATION)
                    permissionOverwrites[0] = { id: everyoneRole.id, allow: ['ViewChannel', 'ReadMessageHistory'], deny: ['SendMessages'] };
                }
                
                cat = await guild.channels.create({
                    name: category.name,
                    type: 4, // Category
                    permissionOverwrites
                });
                console.log(`✅ Created category: ${category.name}`);
            } else {
                console.log(`⏭️ Category exists: ${category.name}`);
            }
            
            results.categories[category.name] = cat.id;
            
            // Create channels in this category
            for (const channelData of category.channels) {
                try {
                    const existingChannel = guild.channels.cache.find(c => c.name === channelData.name && c.parentId === cat.id);
                    
                    if (!existingChannel) {
                        const channelOptions = {
                            name: channelData.name,
                            type: channelData.type, // 0 = text, 2 = voice
                            parent: cat.id,
                            topic: channelData.topic || null
                        };
                        
                        if (channelData.userLimit) {
                            channelOptions.userLimit = channelData.userLimit;
                        }
                        
                        const channel = await guild.channels.create(channelOptions);
                        results.channels[channelData.name] = channel.id;
                        console.log(`  ✅ Created channel: ${channelData.name}`);
                        
                        // Mark special channels
                        if (channelData.isVerifyChannel) {
                            results.verifyChannelId = channel.id;
                        }
                        if (channelData.isLogChannel) {
                            results.logChannelId = channel.id;
                        }
                        if (channelData.isRulesChannel) {
                            results.rulesChannelId = channel.id;
                        }
                    } else {
                        results.channels[channelData.name] = existingChannel.id;
                        if (channelData.isVerifyChannel) {
                            results.verifyChannelId = existingChannel.id;
                        }
                        if (channelData.isLogChannel) {
                            results.logChannelId = existingChannel.id;
                        }
                        if (channelData.isRulesChannel) {
                            results.rulesChannelId = existingChannel.id;
                        }
                        console.log(`  ⏭️ Channel exists: ${channelData.name}`);
                    }
                } catch (err) {
                    console.log(`  ❌ Failed to create channel ${channelData.name}: ${err.message}`);
                }
            }
        } catch (err) {
            console.log(`❌ Failed to create category ${category.name}: ${err.message}`);
        }
    }
    
    // ========== POST RULES ==========
    if (results.rulesChannelId) {
        try {
            const rulesChannel = await guild.channels.fetch(results.rulesChannelId);
            
            // Check if rules already posted
            const existingMessages = await rulesChannel.messages.fetch({ limit: 10 });
            const hasRules = existingMessages.some(m => 
                m.author.id === client.user.id && 
                m.embeds.length > 0 && 
                m.embeds[0].title?.includes('PARK RULES')
            );
            
            if (hasRules) {
                console.log('⏭️ Rules already posted, skipping');
            } else {
                const rulesEmbed = new EmbedBuilder()
                    .setTitle('🌲 PARK RULES 🌲')
                    .setColor(0x2D5A27)
                    .setDescription(
                        '```\n' +
                        '╔══════════════════════════════════════╗\n' +
                        '║     FOREST PARK HANGOUT • 18+        ║\n' +
                        '╚══════════════════════════════════════╝\n' +
                        '```\n' +
                        'Welcome! Please read and follow all rules.'
                    )
                    .addFields(
                        { name: '───────── AGE & ENTRY ─────────', value: 
                            '```\n' +
                            '1. Must be 18+ to join\n' +
                            '2. No lying about your age\n' +
                            '3. Complete verification to access server\n' +
                            '```'
                        },
                        { name: '───────── BEHAVIOR ─────────', value: 
                            '```\n' +
                            '4. Be respectful to everyone\n' +
                            '5. No harassment or bullying\n' +
                            '6. No spam or flooding\n' +
                            '7. Keep drama out of public channels\n' +
                            '8. English only in public channels\n' +
                            '```'
                        },
                        { name: '───────── SAFETY ─────────', value: 
                            '```\n' +
                            '9.  No sharing personal info\n' +
                            '10. No doxxing or threats\n' +
                            '11. No unsolicited DMs\n' +
                            '12. Report issues to staff\n' +
                            '```'
                        },
                        { name: '───────── ROBLOX ─────────', value: 
                            '```\n' +
                            '13. Verify your Roblox account\n' +
                            '14. No exploiting or hacking\n' +
                            '15. In-game rules apply here too\n' +
                            '```'
                        },
                        { name: '───────── MODERATION ─────────', value: 
                            '```\n' +
                            '16. Staff decisions are final\n' +
                            '17. No loopholes or rule-lawyering\n' +
                            '18. No alt accounts to evade bans\n' +
                            '```'
                        }
                    )
                    .setFooter({ text: '⚠️ Breaking rules = warn → mute → kick → ban' })
                    .setTimestamp();
                
                await rulesChannel.send({ embeds: [rulesEmbed] });
                console.log('✅ Posted rules to rules channel');
            }
        } catch (err) {
            console.log(`❌ Failed to post rules: ${err.message}`);
        }
    }
    
    // ========== POST VERIFICATION INSTRUCTIONS ==========
    if (results.verifyChannelId) {
        try {
            const verifyChannel = await guild.channels.fetch(results.verifyChannelId);
            
            // Check if verification instructions already posted
            const existingMessages = await verifyChannel.messages.fetch({ limit: 10 });
            const hasVerify = existingMessages.some(m => 
                m.author.id === client.user.id && 
                m.components.length > 0 &&
                m.components[0]?.components[0]?.customId === 'start_manual_verification'
            );
            
            if (hasVerify) {
                console.log('⏭️ Verification instructions already posted, skipping');
            } else {
                const verifyEmbed = new EmbedBuilder()
                    .setTitle('🔞 Welcome to Forest Park Hangout – 18+ Verification Required')
                    .setDescription('**This is an 18+ community.** To keep our community safe and friendly, all visitors must complete age verification before accessing the full server.\n\n**🛡️ Please answer all the following questions honestly and completely.**')
                    .setColor(0x87CEEB)
                    .addFields(
                        { name: '🔐 Part 1 - Identity & Age Verification:', value: 
                            '1. What is your birthdate? (MM/DD/YYYY)\n' +
                            '2. How old will you be on your next birthday?\n' +
                            '3. List any vore-related servers you are currently in\n' +
                            '4. Why did you decide to join Forest Park Hangout?\n' +
                            '5. Quote 3 rules & explain them in your own words\n' +
                            '6. **Were you invited by a friend? If yes, who?**'
                        },
                        { name: '🔐 Part 2 - About You:', value: 
                            '7. How did you find this server?\n' +
                            '8. What timezone are you in?\n' +
                            '9. Have you been banned from any Discord servers?\n' +
                            '10. Do you have any alt Discord accounts?\n' +
                            '11. (Optional) What does vore mean to you?'
                        },
                        { name: '🔐 Part 3 - Roblox & Final Questions:', value: 
                            '12. What is your Roblox username?\n' +
                            '13. Have you played Forest Park Hangout before?\n' +
                            '14. Are you comfortable following all server rules?\n' +
                            '15. What experience are you hoping to have?\n' +
                            '16. Anything else you want staff to know?'
                        },
                        { name: '👥 Invited by a Friend?', value: 'If you were invited by a friend, please let us know who invited you!' },
                        { name: '🔒 Privacy', value: 'Only staff can see your answers — your privacy is respected.' },
                        { name: '🚨 Note', value: 'If your answers don\'t match or you appear to be under 18, your verification will be denied.\n\nIf you need help, contact staff.' }
                    )
                    .setFooter({ text: 'Thanks for helping us keep Forest Park Hangout safe and welcoming! 🌿' });
                
                const verifyButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('start_manual_verification')
                            .setLabel('📝 Start 18+ Verification')
                            .setStyle(ButtonStyle.Success)
                    );
                
                await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyButton] });
                console.log('✅ Posted verification instructions to verify channel');
            }
        } catch (err) {
            console.log(`❌ Failed to post verification instructions: ${err.message}`);
        }
    }
    
    console.log('🎉 Server setup complete!');
    console.log('\n📋 IMPORTANT IDs TO UPDATE IN CODE:');
    console.log(`AUTO_ROLE_ID (Unverified): ${results.roles['⏳ Unverified'] || 'Not created'}`);
    console.log(`VERIFIED_MEMBER_ROLE_ID: ${results.roles['✅ Verified'] || 'Not created'}`);
    console.log(`STAFF_ROLE_ID: ${results.roles['🛡️ Moderator'] || 'Not created'}`);
    console.log(`HOW_TO_VERIFY_CHANNEL_ID: ${results.verifyChannelId || 'Not created'}`);
    console.log(`VERIFICATION_LOG_CHANNEL_ID: ${results.logChannelId || 'Not created'}`);
    
    return results;
}

// Setup self-assignable roles (gender, vore preferences)
async function setupSelfAssignRoles(guild) {
    console.log(`🔧 Setting up self-assign roles in ${guild.name}...`);
    
    // Create/find Gender Roles
    GENDER_ROLES = [];
    for (const roleDef of GENDER_ROLE_DEFINITIONS) {
        try {
            let role = guild.roles.cache.find(r => r.name === roleDef.name);
            if (!role) {
                role = await guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    hoist: false,
                    mentionable: false,
                    reason: 'Auto-created gender role for self-assignment'
                });
                console.log(`✅ Created gender role: ${roleDef.name}`);
            } else {
                console.log(`⏭️ Gender role exists: ${roleDef.name}`);
            }
            GENDER_ROLES.push({
                id: role.id,
                label: roleDef.name,
                emoji: roleDef.emoji,
                description: roleDef.description
            });
        } catch (err) {
            console.log(`❌ Failed to create gender role ${roleDef.name}: ${err.message}`);
        }
    }
    
    // Create/find Vore Preference Roles
    VORE_ROLES = [];
    for (const roleDef of VORE_ROLE_DEFINITIONS) {
        try {
            let role = guild.roles.cache.find(r => r.name === roleDef.name);
            if (!role) {
                role = await guild.roles.create({
                    name: roleDef.name,
                    color: roleDef.color,
                    hoist: false,
                    mentionable: false,
                    reason: 'Auto-created vore preference role for self-assignment'
                });
                console.log(`✅ Created vore role: ${roleDef.name}`);
            } else {
                console.log(`⏭️ Vore role exists: ${roleDef.name}`);
            }
            VORE_ROLES.push({
                id: role.id,
                label: roleDef.name,
                emoji: roleDef.emoji,
                description: roleDef.description
            });
        } catch (err) {
            console.log(`❌ Failed to create vore role ${roleDef.name}: ${err.message}`);
        }
    }
    
    console.log(`✓ Self-assign roles setup complete! Gender: ${GENDER_ROLES.length}, Vore: ${VORE_ROLES.length}`);
}

// ==================== END SERVER SETUP ====================

// Discord bot ready event
client.once('ready', async () => {
    console.log(`✓ Discord Bot logged in as ${client.user.tag}`);
    console.log(`✓ Bot is in ${client.guilds.cache.size} server(s)`);
    
    // Setup gender and vore roles in all guilds
    for (const guild of client.guilds.cache.values()) {
        await setupSelfAssignRoles(guild);
    }
    
    // Post verification message to channel (if configured)
    if (VERIFY_CHANNEL_ID) {
        try {
            const channel = await client.channels.fetch(VERIFY_CHANNEL_ID);
            
            // Check if we already have a verify message (don't spam)
            const messages = await channel.messages.fetch({ limit: 10 });
            const hasVerifyMessage = messages.some(m => 
                m.author.id === client.user.id && 
                m.embeds.length > 0 && 
                m.embeds[0].title?.includes('Verification')
            );
            
            if (!hasVerifyMessage) {
                const embed = new EmbedBuilder()
                    .setTitle('🔐 Roblox Verification')
                    .setDescription('Click the button below to link your Roblox account to Discord.\n\n**How it works:**\n1. Enter your Roblox username\n2. Add a verification code to your Roblox profile description\n3. Click verify - done!\n\n*This proves you own the Roblox account*')
                    .setColor(0x00d4ff)
                    .setFooter({ text: 'Verification powered by Gatekeeper' });
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('bloxlink_verify_start')
                            .setLabel('🔗 Verify with Roblox')
                            .setStyle(ButtonStyle.Primary)
                    );
                
                await channel.send({ embeds: [embed], components: [row] });
                console.log('✓ Posted verification message to channel');
            } else {
                console.log('✓ Verification message already exists in channel');
            }
        } catch (err) {
            console.error('Failed to post verification message:', err.message);
        }
    }
    
    // Post manual verification instructions
    await postVerificationInstructions();
    
    // Post ping roles message
    await postPingRolesMessage();
    
    // Start auto-accept polling if group management is configured
    if (ROBLOX_GROUP_ID && ROBLOX_COOKIE) {
        console.log('✓ Starting auto-accept group polling (every 15 seconds)');
        // Run once immediately
        setTimeout(autoAcceptVerifiedGroupRequests, 5000); // Wait 5 seconds for bot to fully initialize
        // Then run every 15 seconds for near-instant acceptance
        setInterval(autoAcceptVerifiedGroupRequests, 15 * 1000);
    }
});

// Auto-accept verified users who request to join the Roblox group
async function autoAcceptVerifiedGroupRequests() {
    if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) return;
    
    try {
        const fetch = (await import('node-fetch')).default;
        
        // Get pending requests
        const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=100`, {
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        const data = await response.json();
        
        if (data.errors) {
            console.log(`Auto-accept check failed: ${data.errors[0]?.message}`);
            return;
        }
        
        if (!data.data || data.data.length === 0) {
            return; // No pending requests, silently continue
        }
        
        console.log(`Auto-accept: Checking ${data.data.length} pending group requests...`);
        
        // Get CSRF token
        const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
        });
        const csrfToken = csrfResponse.headers.get('x-csrf-token');
        
        // Get the guild to check for server members
        const guildId = process.env.DISCORD_GUILD_ID;
        let guild = null;
        let allMembers = [];
        
        if (guildId) {
            try {
                guild = await client.guilds.fetch(guildId);
                // Fetch ALL members in the server
                await guild.members.fetch();
                allMembers = guild.members.cache;
                console.log(`Found ${allMembers.size} total members in server`);
            } catch (guildErr) {
                console.log(`Could not fetch guild members: ${guildErr.message}`);
            }
        }
        
        let accepted = 0;
        
        for (const request of data.data) {
            let discordId = robloxToDiscord.get(String(request.requester.userId));
            let shouldAccept = !!discordId;
            
            // Fetch the Roblox user's ACTUAL display name from the API (join requests may not include it)
            let robloxDisplayName = request.requester.username; // Default to username
            try {
                const userInfoResponse = await fetch(`https://users.roblox.com/v1/users/${request.requester.userId}`);
                const userInfo = await userInfoResponse.json();
                if (userInfo.displayName) {
                    robloxDisplayName = userInfo.displayName;
                }
                console.log(`Roblox user ${request.requester.userId}: username="${request.requester.username}", displayName="${robloxDisplayName}"`);
            } catch (err) {
                console.log(`Could not fetch display name for ${request.requester.userId}: ${err.message}`);
            }
            
            // If not found in map, try to find by checking all verified users in memory
            if (!shouldAccept) {
                for (const [dId, userData] of verifiedUsers.entries()) {
                    if (String(userData.robloxUserId) === String(request.requester.userId) ||
                        userData.robloxUsername?.toLowerCase() === request.requester.username?.toLowerCase()) {
                        discordId = dId;
                        shouldAccept = true;
                        robloxToDiscord.set(String(request.requester.userId), dId);
                        console.log(`Found verified user in memory: ${request.requester.username} -> ${dId}`);
                        break;
                    }
                }
            }
            
            // If STILL not found, search Discord members by display name match (must have verified role)
            if (!shouldAccept && allMembers.size > 0) {
                console.log(`Looking for Discord member with display name matching Roblox display name: "${robloxDisplayName}"`);
                
                // Try to find a Discord member whose DISPLAY NAME matches AND has the verified role
                const matchedMember = allMembers.find(member => {
                    const discordDisplayName = member.displayName.toLowerCase().trim(); // Server nickname or display name
                    const hasVerifiedRole = VERIFIED_MEMBER_ROLE_ID && member.roles.cache.has(VERIFIED_MEMBER_ROLE_ID);
                    
                    // Check if Discord display name matches Roblox display name AND has verified role
                    return discordDisplayName === robloxDisplayName.toLowerCase().trim() && hasVerifiedRole;
                });
                
                if (matchedMember) {
                    discordId = matchedMember.user.id;
                    shouldAccept = true;
                    // Save the link for future use
                    robloxToDiscord.set(String(request.requester.userId), discordId);
                    verifiedUsers.set(discordId, {
                        robloxUsername: request.requester.username,
                        robloxUserId: request.requester.userId,
                        discordId: discordId,
                        verifiedAt: new Date().toISOString(),
                        approvedBy: 'Auto-matched by display name'
                    });
                    console.log(`✓ Matched by display name: ${robloxDisplayName} -> ${matchedMember.user.tag} (${matchedMember.displayName})`);
                } else {
                    // Log some members for debugging
                    const sampleMembers = allMembers.first(10).map(m => m.displayName);
                    console.log(`No match found. Sample member display names: ${sampleMembers.join(', ')}`);
                }
            }
            
            if (shouldAccept && discordId) {
                // User is verified in Discord, auto-accept them!
                const acceptResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${request.requester.userId}`, {
                    method: 'POST',
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                        'X-CSRF-TOKEN': csrfToken,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (acceptResponse.ok) {
                    accepted++;
                    console.log(`✓ Auto-accepted ${request.requester.username} (Discord: ${discordId})`);
                    
                    // Try to DM the Discord user to let them know
                    try {
                        const discordUser = await client.users.fetch(discordId);
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🎉 Group Join Request Accepted!')
                            .setDescription(`Your request to join the Roblox group has been **automatically approved** because you're in our Discord server!`)
                            .setColor(0x2ed573)
                            .addFields(
                                { name: '👤 Roblox Account', value: `**${request.requester.username}**`, inline: true },
                                { name: '📅 Accepted', value: 'Just now!', inline: true }
                            )
                            .setFooter({ text: 'Welcome to the group! 🌲' })
                            .setTimestamp();
                        
                        await discordUser.send({ embeds: [dmEmbed] });
                        console.log(`✓ Sent acceptance DM to ${discordUser.tag}`);
                    } catch (dmErr) {
                        console.log(`Could not DM user ${discordId}: ${dmErr.message}`);
                    }
                } else {
                    const errorData = await acceptResponse.json().catch(() => ({}));
                    console.log(`Failed to accept ${request.requester.username}: ${errorData.errors?.[0]?.message || 'Unknown error'}`);
                }
            } else {
                console.log(`Skipped ${request.requester.username} (Roblox display: "${robloxDisplayName}") - no Discord member with matching display name`);
            }
        }
        
        if (accepted > 0) {
            console.log(`✓ Auto-accept complete: ${accepted} users accepted`);
        }
        
    } catch (error) {
        console.error('Auto-accept error:', error.message);
    }
}

// Welcome channel ID for public welcome messages
const WELCOME_CHANNEL_ID = '1467030660836491315';

// Moderation data storage
const warnings = new Map(); // Maps `${guildId}-${odId}` to array of warnings
const modLogs = []; // Array of moderation actions

// Auto-give role when someone joins the server
client.on('guildMemberAdd', async (member) => {
    console.log(`New member joined: ${member.user.tag}`);
    
    if (AUTO_ROLE_ID) {
        try {
            await member.roles.add(AUTO_ROLE_ID);
            console.log(`✓ Gave auto-role to ${member.user.tag}`);
        } catch (error) {
            console.error(`Failed to give auto-role to ${member.user.tag}:`, error.message);
        }
    }
    
    // Send welcome message to welcome channel
    if (WELCOME_CHANNEL_ID) {
        try {
            const welcomeChannel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
            if (welcomeChannel) {
                const memberCount = member.guild.memberCount;
                const welcomeMessages = [
                    `🌲 **${member.user.username}** just wandered into the forest!`,
                    `🌿 Welcome to the park, **${member.user.username}**!`,
                    `🦊 **${member.user.username}** has entered the forest!`,
                    `🌳 A wild **${member.user.username}** appeared!`,
                    `🍃 **${member.user.username}** found their way to the hangout!`
                ];
                const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
                
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x2D5A27)
                    .setTitle('🌲 Welcome to Forest Park Hangout!')
                    .setDescription(randomMessage)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .addFields(
                        { name: '👤 New Member', value: `${member.user}`, inline: true },
                        { name: '🔢 Member #', value: `${memberCount}`, inline: true },
                        { name: '📅 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: `Please read the rules and verify to access the server!` })
                    .setTimestamp();
                
                await welcomeChannel.send({ embeds: [welcomeEmbed] });
                console.log(`✓ Sent welcome message for ${member.user.tag}`);
            }
        } catch (err) {
            console.error(`Failed to send welcome message: ${err.message}`);
        }
    }
    
    // Send DM with verification instructions
    try {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🔞 Welcome to Forest Park Hangout - 18+ Verification Required')
            .setDescription('**This is an 18+ community.** To keep our community safe and friendly, all visitors must complete age verification before accessing the full server.\n\n**Please answer all the following questions honestly and completely.**')
            .setColor(0x00d4ff)
            .addFields(
                { name: '📋 How to Verify', value: `Please go to <#${HOW_TO_VERIFY_CHANNEL_ID}> and click the **"Start 18+ Verification"** button to begin answering the verification questions.` },
                { name: '👥 Invited by a Friend?', value: 'If you were invited by a friend, please let us know who invited you during the verification process!' },
                { name: '🔒 Privacy', value: 'Only staff can see your answers — your privacy is respected.' },
                { name: '⚠️ Note', value: 'If your answers don\'t match or you appear to be under 18, your verification will be denied.' }
            )
            .setFooter({ text: 'Thanks for helping us keep Forest Park Hangout safe and welcoming! 🌿' })
            .setTimestamp();
        
        await member.send({ embeds: [welcomeEmbed] });
        console.log(`✓ Sent welcome DM to ${member.user.tag}`);
    } catch (dmError) {
        console.error(`Failed to send welcome DM to ${member.user.tag}:`, dmError.message);
    }
});

// Goodbye message when someone leaves
client.on('guildMemberRemove', async (member) => {
    console.log(`Member left: ${member.user.tag}`);
    
    if (WELCOME_CHANNEL_ID) {
        try {
            const welcomeChannel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
            if (welcomeChannel) {
                const goodbyeEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setDescription(`🍂 **${member.user.username}** has left the forest. Goodbye!`)
                    .setFooter({ text: `We now have ${member.guild.memberCount} members` })
                    .setTimestamp();
                
                await welcomeChannel.send({ embeds: [goodbyeEmbed] });
            }
        } catch (err) {
            console.error(`Failed to send goodbye message: ${err.message}`);
        }
    }
});

// Track processed messages to prevent duplicates
const processedMessages = new Set();

// Staff role ID for group management commands (run !setupserver to create)
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || null;

// Shutdown mode configuration
const SHUTDOWN_CHANNEL_ID = '1466993014164422677'; // Channel users can see during shutdown
let serverShutdownMode = false;
const savedRoles = new Map(); // Maps user ID to their saved roles

// Handle messages (DMs for verification + server commands for staff)
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Debug log for all messages
    if (message.guild) {
        console.log(`Message in server: "${message.content}" from ${message.author.tag}`);
    }
    
    // ============ SERVER SETUP COMMAND (Owner only) ============
    if (message.guild && message.content.toLowerCase() === '!setupserver') {
        const member = message.member;
        // Only allow server owner
        if (message.guild.ownerId !== message.author.id) {
            return message.reply('❌ Only the server owner can use this command.');
        }
        
        const statusMsg = await message.reply('🚀 **Setting up server...** This may take a minute.\n\n*Creating roles and channels...*');
        
        try {
            const results = await setupServer(message.guild);
            
            const embed = new EmbedBuilder()
                .setTitle('🎉 Server Setup Complete!')
                .setColor(0x2ecc71)
                .setDescription('All channels and roles have been created!')
                .addFields(
                    { name: '📋 Important IDs', value: 
                        `**Unverified Role:** \`${results.roles['⏳ Unverified'] || 'N/A'}\`\n` +
                        `**Verified Role:** \`${results.roles['✅ Verified'] || 'N/A'}\`\n` +
                        `**Moderator Role:** \`${results.roles['🛡️ Moderator'] || 'N/A'}\`\n` +
                        `**Verify Channel:** \`${results.verifyChannelId || 'N/A'}\`\n` +
                        `**Log Channel:** \`${results.logChannelId || 'N/A'}\``
                    },
                    { name: '⚠️ Next Steps', value: 
                        '1. Update the role/channel IDs in your code\n' +
                        '2. Set environment variables on Render\n' +
                        '3. Restart the bot\n' +
                        '4. Run `!postverify` in the verify channel'
                    }
                )
                .setTimestamp();
            
            await statusMsg.edit({ content: null, embeds: [embed] });
        } catch (error) {
            console.error('Setup error:', error);
            await statusMsg.edit(`❌ Setup failed: ${error.message}`);
        }
        return;
    }
    
    // Handle server commands (not DMs)
    if (message.guild) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        
        // Check if user is staff/mod
        const isStaff = message.member?.permissions.has('ModerateMembers') || 
                        message.member?.permissions.has('KickMembers') ||
                        message.member?.permissions.has('BanMembers') ||
                        (STAFF_ROLE_ID && message.member?.roles.cache.has(STAFF_ROLE_ID));
        const isAdmin = message.member?.permissions.has('Administrator') || 
                        message.guild.ownerId === message.author.id;
        
        // ============ HELP COMMAND ============
        if (message.content.toLowerCase() === '!help' || message.content.toLowerCase() === '!commands') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('🤖 Bot Commands')
                .setColor(0x00d4ff)
                .addFields(
                    { name: '👥 Everyone', value: 
                        '`!help` - Show this help menu\n' +
                        '`!serverinfo` - Show server information\n' +
                        '`!userinfo [@user]` - Show user information\n' +
                        '`!avatar [@user]` - Show user avatar'
                    },
                    { name: '🛡️ Staff Only', value: 
                        '`!warn @user [reason]` - Warn a user\n' +
                        '`!warnings @user` - Check user warnings\n' +
                        '`!clearwarnings @user` - Clear user warnings\n' +
                        '`!mute @user [duration] [reason]` - Timeout user\n' +
                        '`!unmute @user` - Remove timeout\n' +
                        '`!kick @user [reason]` - Kick a user\n' +
                        '`!ban @user [reason]` - Ban a user\n' +
                        '`!unban [userID]` - Unban a user\n' +
                        '`!purge [amount]` - Delete messages (1-100)\n' +
                        '`!pending` - View pending verifications\n' +
                        '`!verify <roblox name>` - Verify a player'
                    },
                    { name: '👑 Admin Only', value: 
                        '`!setupserver` - Setup server channels/roles\n' +
                        '`!pingroles` - Post/update ping roles message\n' +
                        '`!shutdown` - Emergency lockdown\n' +
                        '`!restore` - Restore from lockdown'
                    }
                )
                .setFooter({ text: 'Forest Park Hangout • Moderation Bot' })
                .setTimestamp();
            
            return message.reply({ embeds: [helpEmbed] });
        }
        
        // ============ SERVER INFO ============
        if (message.content.toLowerCase() === '!serverinfo') {
            const guild = message.guild;
            const embed = new EmbedBuilder()
                .setTitle(`🌲 ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
                .setColor(0x2D5A27)
                .addFields(
                    { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                    { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                    { name: '🔢 Channels', value: `${guild.channels.cache.size}`, inline: true },
                    { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                    { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        // ============ USER INFO ============
        if (message.content.toLowerCase().startsWith('!userinfo')) {
            const target = message.mentions.members.first() || message.member;
            const embed = new EmbedBuilder()
                .setTitle(`👤 ${target.user.username}`)
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setColor(target.displayHexColor || 0x00d4ff)
                .addFields(
                    { name: '🏷️ Tag', value: `${target.user.tag}`, inline: true },
                    { name: '🆔 ID', value: `\`${target.id}\``, inline: true },
                    { name: '🤖 Bot', value: target.user.bot ? 'Yes' : 'No', inline: true },
                    { name: '📅 Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '📥 Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: '🎭 Roles', value: target.roles.cache.filter(r => r.id !== message.guild.id).map(r => r).join(', ') || 'None', inline: false }
                )
                .setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        // ============ AVATAR ============
        if (message.content.toLowerCase().startsWith('!avatar')) {
            const target = message.mentions.users.first() || message.author;
            const embed = new EmbedBuilder()
                .setTitle(`🖼️ ${target.username}'s Avatar`)
                .setImage(target.displayAvatarURL({ dynamic: true, size: 512 }))
                .setColor(0x00d4ff)
                .setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        // ============ WARN COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!warn ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user to warn.');
            
            const reason = args.slice(1).join(' ') || 'No reason provided';
            const warningKey = `${message.guild.id}-${target.id}`;
            
            if (!warnings.has(warningKey)) warnings.set(warningKey, []);
            const userWarnings = warnings.get(warningKey);
            userWarnings.push({
                reason,
                moderator: message.author.id,
                timestamp: Date.now()
            });
            
            const warnEmbed = new EmbedBuilder()
                .setTitle('⚠️ User Warned')
                .setColor(0xFFCC00)
                .addFields(
                    { name: '👤 User', value: `${target.user.tag}`, inline: true },
                    { name: '🛡️ Moderator', value: `${message.author.tag}`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false },
                    { name: '⚠️ Total Warnings', value: `${userWarnings.length}`, inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [warnEmbed] });
            
            // DM the user
            try {
                await target.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ You have been warned')
                        .setColor(0xFFCC00)
                        .setDescription(`You received a warning in **${message.guild.name}**`)
                        .addFields(
                            { name: '📝 Reason', value: reason },
                            { name: '⚠️ Total Warnings', value: `${userWarnings.length}` }
                        )
                        .setTimestamp()
                    ]
                });
            } catch (e) { /* Can't DM user */ }
            
            // Auto-action based on warning count
            if (userWarnings.length >= 5) {
                await target.ban({ reason: 'Reached 5 warnings - Auto-ban' });
                message.channel.send(`🔨 **${target.user.tag}** has been auto-banned for reaching 5 warnings.`);
            } else if (userWarnings.length >= 3) {
                await target.timeout(24 * 60 * 60 * 1000, 'Reached 3 warnings - 24h timeout');
                message.channel.send(`🔇 **${target.user.tag}** has been auto-muted for 24 hours (3 warnings).`);
            }
            return;
        }
        
        // ============ WARNINGS CHECK (Staff) ============
        if (message.content.toLowerCase().startsWith('!warnings ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user.');
            
            const warningKey = `${message.guild.id}-${target.id}`;
            const userWarnings = warnings.get(warningKey) || [];
            
            if (userWarnings.length === 0) {
                return message.reply(`✅ **${target.user.tag}** has no warnings.`);
            }
            
            const warningList = userWarnings.map((w, i) => 
                `**${i + 1}.** ${w.reason} - <t:${Math.floor(w.timestamp / 1000)}:R>`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings for ${target.user.tag}`)
                .setColor(0xFFCC00)
                .setDescription(warningList)
                .setFooter({ text: `Total: ${userWarnings.length} warning(s)` })
                .setTimestamp();
            
            return message.reply({ embeds: [embed] });
        }
        
        // ============ CLEAR WARNINGS (Staff) ============
        if (message.content.toLowerCase().startsWith('!clearwarnings ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user.');
            
            const warningKey = `${message.guild.id}-${target.id}`;
            warnings.delete(warningKey);
            
            return message.reply(`✅ Cleared all warnings for **${target.user.tag}**.`);
        }
        
        // ============ MUTE/TIMEOUT COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!mute ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user to mute.');
            if (target.id === message.author.id) return message.reply('❌ You cannot mute yourself.');
            if (target.permissions.has('Administrator')) return message.reply('❌ Cannot mute administrators.');
            
            // Parse duration (default 1 hour)
            let duration = 60 * 60 * 1000; // 1 hour default
            let durationText = '1 hour';
            const durationArg = args[1];
            
            if (durationArg) {
                const match = durationArg.match(/^(\d+)(m|h|d)$/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    if (unit === 'm') { duration = num * 60 * 1000; durationText = `${num} minute(s)`; }
                    if (unit === 'h') { duration = num * 60 * 60 * 1000; durationText = `${num} hour(s)`; }
                    if (unit === 'd') { duration = num * 24 * 60 * 60 * 1000; durationText = `${num} day(s)`; }
                }
            }
            
            const reason = args.slice(2).join(' ') || 'No reason provided';
            
            try {
                await target.timeout(duration, reason);
                
                const embed = new EmbedBuilder()
                    .setTitle('🔇 User Muted')
                    .setColor(0x808080)
                    .addFields(
                        { name: '👤 User', value: `${target.user.tag}`, inline: true },
                        { name: '🛡️ Moderator', value: `${message.author.tag}`, inline: true },
                        { name: '⏱️ Duration', value: durationText, inline: true },
                        { name: '📝 Reason', value: reason, inline: false }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
                
                try {
                    await target.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔇 You have been muted')
                            .setColor(0x808080)
                            .setDescription(`You have been muted in **${message.guild.name}**`)
                            .addFields(
                                { name: '⏱️ Duration', value: durationText },
                                { name: '📝 Reason', value: reason }
                            )
                            .setTimestamp()
                        ]
                    });
                } catch (e) { /* Can't DM user */ }
            } catch (err) {
                message.reply(`❌ Failed to mute: ${err.message}`);
            }
            return;
        }
        
        // ============ UNMUTE COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!unmute ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user to unmute.');
            
            try {
                await target.timeout(null);
                message.reply(`✅ **${target.user.tag}** has been unmuted.`);
            } catch (err) {
                message.reply(`❌ Failed to unmute: ${err.message}`);
            }
            return;
        }
        
        // ============ KICK COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!kick ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user to kick.');
            if (target.id === message.author.id) return message.reply('❌ You cannot kick yourself.');
            if (!target.kickable) return message.reply('❌ I cannot kick this user. They may have higher permissions.');
            
            const reason = args.slice(1).join(' ') || 'No reason provided';
            
            try {
                // DM before kick
                try {
                    await target.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('👢 You have been kicked')
                            .setColor(0xFF6B6B)
                            .setDescription(`You have been kicked from **${message.guild.name}**`)
                            .addFields({ name: '📝 Reason', value: reason })
                            .setTimestamp()
                        ]
                    });
                } catch (e) { /* Can't DM user */ }
                
                await target.kick(reason);
                
                const embed = new EmbedBuilder()
                    .setTitle('👢 User Kicked')
                    .setColor(0xFF6B6B)
                    .addFields(
                        { name: '👤 User', value: `${target.user.tag}`, inline: true },
                        { name: '🛡️ Moderator', value: `${message.author.tag}`, inline: true },
                        { name: '📝 Reason', value: reason, inline: false }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            } catch (err) {
                message.reply(`❌ Failed to kick: ${err.message}`);
            }
            return;
        }
        
        // ============ BAN COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!ban ') && isStaff) {
            const target = message.mentions.members.first();
            if (!target) return message.reply('❌ Please mention a user to ban.');
            if (target.id === message.author.id) return message.reply('❌ You cannot ban yourself.');
            if (!target.bannable) return message.reply('❌ I cannot ban this user. They may have higher permissions.');
            
            const reason = args.slice(1).join(' ') || 'No reason provided';
            
            try {
                // DM before ban
                try {
                    await target.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔨 You have been banned')
                            .setColor(0xFF0000)
                            .setDescription(`You have been banned from **${message.guild.name}**`)
                            .addFields({ name: '📝 Reason', value: reason })
                            .setTimestamp()
                        ]
                    });
                } catch (e) { /* Can't DM user */ }
                
                await target.ban({ reason, deleteMessageSeconds: 86400 }); // Delete 24h of messages
                
                const embed = new EmbedBuilder()
                    .setTitle('🔨 User Banned')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: '👤 User', value: `${target.user.tag}`, inline: true },
                        { name: '🛡️ Moderator', value: `${message.author.tag}`, inline: true },
                        { name: '📝 Reason', value: reason, inline: false }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            } catch (err) {
                message.reply(`❌ Failed to ban: ${err.message}`);
            }
            return;
        }
        
        // ============ UNBAN COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!unban ') && isStaff) {
            const userId = args[0];
            if (!userId) return message.reply('❌ Please provide a user ID to unban.');
            
            try {
                await message.guild.members.unban(userId);
                message.reply(`✅ User \`${userId}\` has been unbanned.`);
            } catch (err) {
                message.reply(`❌ Failed to unban: ${err.message}`);
            }
            return;
        }
        
        // ============ PENDING VERIFICATIONS COMMAND (Staff) ============
        if ((message.content.toLowerCase() === '!pending' || message.content.toLowerCase() === '!verifylist') && isStaff) {
            const pending = [];
            pendingVerifications.forEach((v, id) => {
                if (v.status === 'pending_staff_review' || v.status === 'awaiting_user_confirm') {
                    pending.push({ id, ...v });
                }
            });
            
            if (pending.length === 0) {
                return message.reply('✅ No pending verifications!');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Pending Verifications')
                .setColor(0xffa500)
                .setDescription(`There are **${pending.length}** pending verification(s).\nUse \`!verify <roblox username>\` to verify a player.`)
                .setTimestamp();
            
            // Show up to 10 pending
            const toShow = pending.slice(0, 10);
            for (const v of toShow) {
                embed.addFields({
                    name: `🎮 ${v.playerName || v.displayName || 'Unknown'}`,
                    value: `**Roblox ID:** ${v.userId || v.robloxUserId}\n**Status:** ${v.status}\n**Discord:** ${v.discordUsername || 'Not linked yet'}`,
                    inline: true
                });
            }
            
            if (pending.length > 10) {
                embed.setFooter({ text: `Showing 10 of ${pending.length} pending verifications` });
            }
            
            return message.reply({ embeds: [embed] });
        }
        
        // ============ VERIFY PLAYER COMMAND (Staff) ============
        if (message.content.toLowerCase().startsWith('!verify ') && isStaff) {
            const robloxUsername = args.join(' ').trim();
            if (!robloxUsername) {
                return message.reply('❌ Usage: `!verify <roblox username>` or `!verify <@discord user>`');
            }
            
            // Check if it's a Discord mention
            const mentionMatch = robloxUsername.match(/^<@!?(\d+)>$/);
            let targetDiscordId = mentionMatch ? mentionMatch[1] : null;
            let targetRobloxUsername = mentionMatch ? null : robloxUsername;
            
            // Find the pending verification
            let foundVerification = null;
            let foundId = null;
            
            for (const [id, v] of pendingVerifications.entries()) {
                // Match by Roblox username
                if (targetRobloxUsername && 
                    (v.playerName?.toLowerCase() === targetRobloxUsername.toLowerCase() ||
                     v.displayName?.toLowerCase() === targetRobloxUsername.toLowerCase())) {
                    foundVerification = v;
                    foundId = id;
                    break;
                }
                // Match by Discord ID
                if (targetDiscordId && v.discordId === targetDiscordId) {
                    foundVerification = v;
                    foundId = id;
                    break;
                }
            }
            
            if (!foundVerification) {
                return message.reply(`❌ No pending verification found for **${robloxUsername}**.\nUse \`!pending\` to see all pending verifications.`);
            }
            
            // Mark as verified
            foundVerification.status = 'approved';
            foundVerification.approvedBy = message.author.tag;
            foundVerification.approvedAt = new Date().toISOString();
            
            // Add to verified users if they have a Discord ID
            if (foundVerification.discordId) {
                verifiedUsers.set(foundVerification.discordId, {
                    robloxUsername: foundVerification.playerName,
                    robloxUserId: foundVerification.robloxUserId || foundVerification.userId,
                    robloxDisplayName: foundVerification.displayName,
                    discordId: foundVerification.discordId,
                    verifiedAt: new Date().toISOString(),
                    approvedBy: message.author.tag
                });
                
                // Remember the link
                robloxToDiscord.set(String(foundVerification.robloxUserId || foundVerification.userId), foundVerification.discordId);
                discordToRoblox.set(foundVerification.discordId, foundVerification.robloxUserId || foundVerification.userId);
                
                // Try to give verified role
                if (VERIFIED_ROLE_ID) {
                    try {
                        const member = await message.guild.members.fetch(foundVerification.discordId);
                        await member.roles.add(VERIFIED_ROLE_ID);
                        console.log(`✓ Gave verified role to ${member.user.tag}`);
                    } catch (roleErr) {
                        console.log(`Could not give verified role: ${roleErr.message}`);
                    }
                }
                
                // Try to DM the user
                try {
                    const discordUser = await client.users.fetch(foundVerification.discordId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('✅ Verification Approved!')
                        .setDescription(`Your Roblox account **${foundVerification.playerName}** has been verified by staff!\n\nYou now have full access to the game.`)
                        .setColor(0x00ff00)
                        .setTimestamp();
                    await discordUser.send({ embeds: [dmEmbed] });
                } catch (dmErr) {
                    console.log(`Could not DM user: ${dmErr.message}`);
                }
            }
            
            // Log to verification channel
            if (IN_GAME_VERIFICATION_LOG_CHANNEL_ID) {
                try {
                    const logChannel = await client.channels.fetch(IN_GAME_VERIFICATION_LOG_CHANNEL_ID);
                    const logEmbed = new EmbedBuilder()
                        .setTitle('✅ Player Verified by Staff')
                        .setColor(0x00ff00)
                        .addFields(
                            { name: '🎮 Roblox', value: `${foundVerification.playerName} (${foundVerification.userId || foundVerification.robloxUserId})`, inline: true },
                            { name: '💬 Discord', value: foundVerification.discordId ? `<@${foundVerification.discordId}>` : 'Not linked', inline: true },
                            { name: '👮 Verified By', value: message.author.tag, inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                } catch (logErr) {
                    console.log(`Could not log verification: ${logErr.message}`);
                }
            }
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Player Verified!')
                .setColor(0x00ff00)
                .addFields(
                    { name: '🎮 Roblox Username', value: foundVerification.playerName || 'Unknown', inline: true },
                    { name: '🆔 Roblox ID', value: String(foundVerification.userId || foundVerification.robloxUserId), inline: true },
                    { name: '💬 Discord', value: foundVerification.discordId ? `<@${foundVerification.discordId}>` : 'Not linked yet', inline: true }
                )
                .setFooter({ text: `Verified by ${message.author.tag}` })
                .setTimestamp();
            
            return message.reply({ embeds: [successEmbed] });
        }
        
        // ============ PURGE/CLEAR COMMAND (Staff) ============
        if ((message.content.toLowerCase().startsWith('!purge ') || message.content.toLowerCase().startsWith('!clear ')) && isStaff) {
            const amount = parseInt(args[0]);
            if (isNaN(amount) || amount < 1 || amount > 100) {
                return message.reply('❌ Please provide a number between 1 and 100.');
            }
            
            try {
                const deleted = await message.channel.bulkDelete(amount + 1, true); // +1 to include command
                const confirmMsg = await message.channel.send(`🗑️ Deleted **${deleted.size - 1}** messages.`);
                setTimeout(() => confirmMsg.delete().catch(() => {}), 3000);
            } catch (err) {
                message.reply(`❌ Failed to delete messages: ${err.message}`);
            }
            return;
        }
        
        // ============ PING ROLES COMMAND (Admin only) ============
        if (message.content.toLowerCase() === '!pingroles') {
            const member = message.member;
            // Only allow server owner or admins
            if (!member || (!member.permissions.has('Administrator') && message.guild.ownerId !== message.author.id)) {
                return message.reply('❌ Only administrators can use this command.');
            }
            
            await message.reply('🔄 Setting up roles and posting messages...');
            
            try {
                // First, create/find the gender and vore roles
                console.log('Starting setupSelfAssignRoles...');
                await setupSelfAssignRoles(message.guild);
                console.log(`After setup - Gender: ${GENDER_ROLES.length}, Vore: ${VORE_ROLES.length}, Ping: ${PING_ROLES.length}`);
                
                // Then post the role selection messages
                console.log('Starting postPingRolesMessage...');
                console.log(`Channel ID: ${PING_ROLES_CHANNEL_ID}`);
                await postPingRolesMessage();
                console.log('postPingRolesMessage completed');
                
                const summary = `✅ Roles setup complete!\n• Ping Roles: ${PING_ROLES.length}\n• Gender Roles: ${GENDER_ROLES.length}\n• Vore Roles: ${VORE_ROLES.length}\n\nMessages posted to <#${PING_ROLES_CHANNEL_ID}>`;
                await message.channel.send(summary);
            } catch (err) {
                console.error('!pingroles error:', err);
                await message.channel.send(`❌ Failed: ${err.message}\n\`\`\`${err.stack?.substring(0, 500)}\`\`\``);
            }
            return;
        }
        
        // ============ SHUTDOWN COMMAND (Owner/Admin only) ============
        if (message.content.toLowerCase() === '!shutdown') {
            const member = message.member;
            // Only allow server owner or admins
            if (!member || (!member.permissions.has('Administrator') && message.guild.ownerId !== message.author.id)) {
                return message.reply('❌ Only administrators can use this command.');
            }
            
            if (serverShutdownMode) {
                return message.reply('⚠️ Server is already in shutdown mode. Use `!restore` to restore roles.');
            }
            
            await message.reply('🔄 **INITIATING SERVER SHUTDOWN MODE...**\nThis will remove all roles and restrict access. Please wait...');
            
            try {
                const guild = message.guild;
                
                // Create or find shutdown role
                let shutdownRole = guild.roles.cache.find(r => r.name === 'Server Shutdown');
                if (!shutdownRole) {
                    shutdownRole = await guild.roles.create({
                        name: 'Server Shutdown',
                        color: 0x808080, // Gray
                        reason: 'Server shutdown mode',
                        permissions: [] // No permissions
                    });
                    console.log(`✓ Created "Server Shutdown" role: ${shutdownRole.id}`);
                }
                
                // Set channel permissions - only allow viewing the shutdown channel
                const shutdownChannel = guild.channels.cache.get(SHUTDOWN_CHANNEL_ID);
                if (shutdownChannel) {
                    await shutdownChannel.permissionOverwrites.edit(shutdownRole, {
                        ViewChannel: true,
                        SendMessages: false,
                        ReadMessageHistory: true
                    });
                    console.log(`✓ Set permissions for shutdown channel`);
                }
                
                // Deny the shutdown role from viewing all other channels
                for (const [channelId, channel] of guild.channels.cache) {
                    if (channelId !== SHUTDOWN_CHANNEL_ID && channel.permissionOverwrites) {
                        try {
                            await channel.permissionOverwrites.edit(shutdownRole, {
                                ViewChannel: false
                            });
                        } catch (e) {
                            // Skip channels we can't edit
                        }
                    }
                }
                
                // Process all members
                const members = await guild.members.fetch();
                let processed = 0;
                let errors = 0;
                
                for (const [memberId, guildMember] of members) {
                    // Skip bots and the person running the command
                    if (guildMember.user.bot) continue;
                    if (memberId === message.author.id) continue;
                    
                    try {
                        // Save their current roles (excluding @everyone and managed roles)
                        const memberRoles = guildMember.roles.cache
                            .filter(r => r.id !== guild.id && !r.managed)
                            .map(r => r.id);
                        savedRoles.set(memberId, memberRoles);
                        
                        // Remove all their roles and add shutdown role
                        await guildMember.roles.set([shutdownRole.id]);
                        
                        // DM the user with the new server invite
                        try {
                            const dmEmbed = new EmbedBuilder()
                                .setTitle('🔒 Server Temporarily Closed')
                                .setDescription('**Forest Park Hangout** is currently undergoing maintenance and has been temporarily shut down.\n\nIn the meantime, please join our backup server to stay connected with the community!')
                                .addFields(
                                    { name: '🔗 Join Our Backup Server', value: 'https://discord.gg/sghBZx7gr' },
                                    { name: '📢 What\'s Happening?', value: 'We\'re making some changes to improve the server. You\'ll be notified when we\'re back!' }
                                )
                                .setColor(0xFF6B6B)
                                .setFooter({ text: 'Thank you for your patience! 💚' })
                                .setTimestamp();
                            await guildMember.send({ embeds: [dmEmbed] });
                            console.log(`✓ Sent shutdown DM to ${guildMember.user.tag}`);
                        } catch (dmError) {
                            console.log(`Could not DM ${guildMember.user.tag}: ${dmError.message}`);
                        }
                        
                        processed++;
                        
                        if (processed % 10 === 0) {
                            console.log(`Processed ${processed} members...`);
                        }
                    } catch (e) {
                        console.error(`Failed to process ${guildMember.user.tag}: ${e.message}`);
                        errors++;
                    }
                }
                
                serverShutdownMode = true;
                
                // Send message to shutdown channel
                if (shutdownChannel) {
                    const shutdownEmbed = new EmbedBuilder()
                        .setTitle('🔒 Server Temporarily Closed')
                        .setDescription('The server is currently undergoing maintenance or has been temporarily shut down.\n\nPlease wait for further announcements.')
                        .setColor(0xFF0000)
                        .setTimestamp();
                    await shutdownChannel.send({ embeds: [shutdownEmbed] });
                }
                
                await message.channel.send(`✅ **SERVER SHUTDOWN COMPLETE**\n• Processed: ${processed} members\n• Errors: ${errors}\n• Shutdown role created/applied\n• Users can only see <#${SHUTDOWN_CHANNEL_ID}>\n\nUse \`!restore\` to restore all roles.`);
                
            } catch (error) {
                console.error('Shutdown error:', error);
                await message.reply(`❌ Error during shutdown: ${error.message}`);
            }
            return;
        }
        
        // ============ MASS DM COMMAND (Owner/Admin only) ============
        if (message.content.toLowerCase() === '!massdm' || message.content.toLowerCase() === '!dmall') {
            const member = message.member;
            if (!member || (!member.permissions.has('Administrator') && message.guild.ownerId !== message.author.id)) {
                return message.reply('❌ Only administrators can use this command.');
            }
            
            await message.reply('🔄 **SENDING DMs TO ALL MEMBERS...**\nThis may take a while. Please wait...');
            
            try {
                const guild = message.guild;
                const members = await guild.members.fetch();
                let sent = 0;
                let failed = 0;
                
                for (const [memberId, guildMember] of members) {
                    // Skip bots
                    if (guildMember.user.bot) continue;
                    
                    try {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🔒 Server Temporarily Closed')
                            .setDescription('**Forest Park Hangout** is currently undergoing maintenance and has been temporarily shut down.\n\nIn the meantime, please join our backup server to stay connected with the community!')
                            .addFields(
                                { name: '🔗 Join Our Backup Server', value: 'https://discord.gg/sghBZx7gr' },
                                { name: '📢 What\'s Happening?', value: 'We\'re making some changes to improve the server. You\'ll be notified when we\'re back!' }
                            )
                            .setColor(0xFF6B6B)
                            .setFooter({ text: 'Thank you for your patience! 💚' })
                            .setTimestamp();
                        await guildMember.send({ embeds: [dmEmbed] });
                        sent++;
                        console.log(`✓ Sent DM to ${guildMember.user.tag} (${sent} sent)`);
                        
                        // Small delay to avoid rate limits
                        if (sent % 5 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (dmError) {
                        failed++;
                        console.log(`✗ Could not DM ${guildMember.user.tag}: ${dmError.message}`);
                    }
                }
                
                await message.channel.send(`✅ **MASS DM COMPLETE**\n• Sent: ${sent} DMs\n• Failed: ${failed} (DMs disabled or blocked)`);
                
            } catch (error) {
                console.error('Mass DM error:', error);
                await message.reply(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        // ============ RESTORE COMMAND (Owner/Admin only) ============
        if (message.content.toLowerCase() === '!restore') {
            const member = message.member;
            if (!member || (!member.permissions.has('Administrator') && message.guild.ownerId !== message.author.id)) {
                return message.reply('❌ Only administrators can use this command.');
            }
            
            if (!serverShutdownMode) {
                return message.reply('⚠️ Server is not in shutdown mode.');
            }
            
            await message.reply('🔄 **RESTORING ROLES...**\nPlease wait...');
            
            try {
                const guild = message.guild;
                let restored = 0;
                let errors = 0;
                
                for (const [memberId, roleIds] of savedRoles) {
                    try {
                        const guildMember = await guild.members.fetch(memberId).catch(() => null);
                        if (guildMember && roleIds.length > 0) {
                            await guildMember.roles.set(roleIds);
                            restored++;
                        }
                    } catch (e) {
                        console.error(`Failed to restore roles for ${memberId}: ${e.message}`);
                        errors++;
                    }
                }
                
                // Clear saved roles
                savedRoles.clear();
                serverShutdownMode = false;
                
                // Optionally delete the shutdown role
                const shutdownRole = guild.roles.cache.find(r => r.name === 'Server Shutdown');
                if (shutdownRole) {
                    await shutdownRole.delete('Server restored').catch(() => {});
                }
                
                await message.channel.send(`✅ **ROLES RESTORED**\n• Restored: ${restored} members\n• Errors: ${errors}\n• Server is back to normal!`);
                
            } catch (error) {
                console.error('Restore error:', error);
                await message.reply(`❌ Error during restore: ${error.message}`);
            }
            return;
        }
        
        // Check for !grouprequests command (staff only)
        if (message.content.toLowerCase() === '!grouprequests') {
            console.log(`!grouprequests command from ${message.author.tag}`);
            
            // Check if user has staff role
            const member = message.member;
            console.log(`User has staff role: ${member?.roles.cache.has(STAFF_ROLE_ID)}, Staff Role ID: ${STAFF_ROLE_ID}`);
            
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('❌ You need the staff role to use this command.');
            }
            
            console.log(`ROBLOX_GROUP_ID: ${ROBLOX_GROUP_ID}, ROBLOX_COOKIE set: ${!!ROBLOX_COOKIE}`);
            
            if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
                return message.reply('❌ Group management is not configured. Set `ROBLOX_GROUP_ID` and `ROBLOX_COOKIE` environment variables.');
            }
            
            await message.reply('🔄 Fetching pending group join requests...');
            
            try {
                const fetch = (await import('node-fetch')).default;
                
                const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=50`, {
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`
                    }
                });
                
                const data = await response.json();
                
                if (data.errors) {
                    return message.channel.send(`❌ Error: ${data.errors[0]?.message || 'Failed to get requests'}`);
                }
                
                if (!data.data || data.data.length === 0) {
                    return message.channel.send('✅ No pending group join requests!');
                }
                
                // Build embed with requests
                let verifiedList = '';
                let unverifiedList = '';
                
                for (const request of data.data) {
                    const discordId = robloxToDiscord.get(String(request.requester.userId));
                    const line = `• **${request.requester.username}** (ID: ${request.requester.userId})`;
                    
                    if (discordId) {
                        verifiedList += `${line} - <@${discordId}> ✅\n`;
                    } else {
                        unverifiedList += `${line}\n`;
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Pending Group Join Requests')
                    .setColor(0x00d4ff)
                    .setDescription(`Total: **${data.data.length}** pending requests`)
                    .setTimestamp();
                
                if (verifiedList) {
                    embed.addFields({ name: '✅ Verified in Discord (Safe to accept)', value: verifiedList.substring(0, 1024) || 'None' });
                }
                if (unverifiedList) {
                    embed.addFields({ name: '❓ Not Verified', value: unverifiedList.substring(0, 1024) || 'None' });
                }
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('group_accept_all_verified')
                            .setLabel('✅ Accept All Verified')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('group_refresh')
                            .setLabel('🔄 Refresh')
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                await message.channel.send({ embeds: [embed], components: [row] });
                
            } catch (error) {
                console.error('Error fetching group requests:', error.message);
                message.channel.send(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        // Check for !linkme <roblox username> command (staff only) - quick self-link
        if (message.content.toLowerCase().startsWith('!linkme ')) {
            const member = message.member;
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('❌ You need the staff role to use this command.');
            }
            
            const robloxUsername = message.content.slice(8).trim();
            if (!robloxUsername) {
                return message.reply('❌ Usage: `!linkme YourRobloxUsername`');
            }
            
            await message.reply(`🔄 Looking up **${robloxUsername}**...`);
            
            try {
                const fetch = (await import('node-fetch')).default;
                
                // Look up Roblox user
                const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: true })
                });
                const userData = await userResponse.json();
                
                if (!userData.data || userData.data.length === 0) {
                    return message.channel.send(`❌ Could not find Roblox user **${robloxUsername}**`);
                }
                
                const robloxUser = userData.data[0];
                
                // Link the accounts
                verifiedUsers.set(message.author.id, {
                    robloxUsername: robloxUser.name,
                    robloxUserId: robloxUser.id,
                    discordId: message.author.id,
                    verifiedAt: new Date().toISOString(),
                    approvedBy: 'Self-link (staff)'
                });
                
                robloxToDiscord.set(String(robloxUser.id), message.author.id);
                discordToRoblox.set(message.author.id, String(robloxUser.id));
                
                message.channel.send(`✅ **Linked!** Your Discord account is now linked to Roblox user **${robloxUser.name}** (ID: ${robloxUser.id})\n\nIf you have a pending group request, it will be auto-accepted within 5 minutes (or use \`!acceptall\` now).`);
                
                console.log(`✓ Staff ${message.author.tag} self-linked to Roblox: ${robloxUser.name} (${robloxUser.id})`);
                
            } catch (error) {
                console.error('Error in !linkme:', error.message);
                message.channel.send(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        // Check for !verify @user command (staff only) - quickly verify a user
        if (message.content.toLowerCase().startsWith('!verify ')) {
            const member = message.member;
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('❌ You need the staff role to use this command.');
            }
            
            // Get mentioned user
            const mentionedUser = message.mentions.members.first();
            if (!mentionedUser) {
                return message.reply('❌ Usage: `!verify @user` - Mention the user you want to verify.');
            }
            
            try {
                // Give verified role
                if (VERIFIED_MEMBER_ROLE_ID) {
                    await mentionedUser.roles.add(VERIFIED_MEMBER_ROLE_ID);
                }
                
                // Try to DM the user
                try {
                    const verifiedEmbed = new EmbedBuilder()
                        .setTitle('✅ You Have Been Verified!')
                        .setDescription('A staff member has manually verified you for **Forest Park Hangout**!\n\nYou now have full access to the server. Enjoy your stay! 🌿')
                        .setColor(0x00ff00)
                        .setFooter({ text: 'Welcome to the community!' })
                        .setTimestamp();
                    
                    await mentionedUser.send({ embeds: [verifiedEmbed] });
                } catch (dmErr) {
                    // Couldn't DM, that's fine
                }
                
                message.channel.send(`✅ **${mentionedUser.user.tag}** has been verified and given the verified role!`);
                console.log(`✓ Staff ${message.author.tag} manually verified ${mentionedUser.user.tag}`);
                
            } catch (error) {
                console.error('Error in !verify:', error.message);
                message.channel.send(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        // Check for !acceptall command (staff only) - accepts all verified users
        if (message.content.toLowerCase() === '!acceptall') {
            const member = message.member;
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('❌ You need the staff role to use this command.');
            }
            
            if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
                return message.reply('❌ Group management is not configured.');
            }
            
            const statusMsg = await message.reply('🔄 Accepting all verified users...');
            
            try {
                const fetch = (await import('node-fetch')).default;
                
                // Get pending requests
                const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=100`, {
                    headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
                });
                const data = await response.json();
                
                if (data.errors) {
                    return statusMsg.edit(`❌ Error: ${data.errors[0]?.message || 'Failed to get requests'}`);
                }
                
                if (!data.data || data.data.length === 0) {
                    return statusMsg.edit('✅ No pending join requests!');
                }
                
                // Get CSRF token
                const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
                    method: 'POST',
                    headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
                });
                const csrfToken = csrfResponse.headers.get('x-csrf-token');
                
                let accepted = 0;
                let skipped = 0;
                const acceptedNames = [];
                
                for (const request of data.data) {
                    const discordId = robloxToDiscord.get(String(request.requester.userId));
                    
                    if (discordId) {
                        const acceptResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${request.requester.userId}`, {
                            method: 'POST',
                            headers: {
                                'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                                'X-CSRF-TOKEN': csrfToken,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (acceptResponse.ok) {
                            accepted++;
                            acceptedNames.push(request.requester.username);
                        }
                    } else {
                        skipped++;
                    }
                }
                
                let result = `✅ **Group Accept Complete**\n**Accepted:** ${accepted} verified users\n**Skipped:** ${skipped} unverified users`;
                if (acceptedNames.length > 0) {
                    result += `\n**Users:** ${acceptedNames.join(', ')}`;
                }
                
                await statusMsg.edit(result);
                
            } catch (error) {
                console.error('Error accepting all:', error.message);
                statusMsg.edit(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        // Check for !acceptgroup <username> command (staff only)
        if (message.content.toLowerCase().startsWith('!acceptgroup ')) {
            const member = message.member;
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return message.reply('❌ You need the staff role to use this command.');
            }
            
            const username = message.content.slice(13).trim();
            if (!username) {
                return message.reply('❌ Usage: `!acceptgroup <roblox username>`');
            }
            
            if (!ROBLOX_GROUP_ID || !ROBLOX_COOKIE) {
                return message.reply('❌ Group management is not configured.');
            }
            
            await message.reply(`🔄 Looking up user **${username}**...`);
            
            try {
                const fetch = (await import('node-fetch')).default;
                
                // Look up Roblox user
                const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
                });
                const userData = await userResponse.json();
                
                if (!userData.data || userData.data.length === 0) {
                    return message.channel.send(`❌ Roblox user **${username}** not found.`);
                }
                
                const robloxUser = userData.data[0];
                console.log(`Found Roblox user: ${robloxUser.name} (ID: ${robloxUser.id})`);
                
                // Get CSRF token
                const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
                    method: 'POST',
                    headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
                });
                const csrfToken = csrfResponse.headers.get('x-csrf-token');
                console.log(`Got CSRF token: ${csrfToken ? 'Yes' : 'No'}`);
                
                // Accept the request
                console.log(`Accepting join request for user ${robloxUser.id} in group ${ROBLOX_GROUP_ID}...`);
                const acceptResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${robloxUser.id}`, {
                    method: 'POST',
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                        'X-CSRF-TOKEN': csrfToken,
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log(`Accept response status: ${acceptResponse.status}`);
                
                if (acceptResponse.ok) {
                    const discordId = robloxToDiscord.get(String(robloxUser.id));
                    const discordMention = discordId ? ` (<@${discordId}>)` : '';
                    message.channel.send(`✅ Accepted **${robloxUser.name}**${discordMention} into the group!`);
                } else {
                    const errorData = await acceptResponse.json();
                    console.log(`Accept error response:`, JSON.stringify(errorData));
                    message.channel.send(`❌ Failed to accept: ${errorData.errors?.[0]?.message || 'Unknown error'}`);
                }
                
            } catch (error) {
                console.error('Error accepting user:', error.message);
                message.channel.send(`❌ Error: ${error.message}`);
            }
            return;
        }
        
        return; // Don't process other server messages
    }
    
    // === DM HANDLING BELOW ===
    
    // Prevent processing the same message twice
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    
    // Clean up old message IDs (keep last 100)
    if (processedMessages.size > 100) {
        const arr = Array.from(processedMessages);
        for (let i = 0; i < 50; i++) {
            processedMessages.delete(arr[i]);
        }
    }
    
    const pending = pendingManualVerifications.get(message.author.id);
    
    // Check if user has an active verification in progress
    if (!pending || pending.step !== 'answering') return;
    
    const questionIndex = pending.currentQuestion;
    const answer = message.content.trim();
    
    // Handle skip for optional questions
    if (VERIFICATION_QUESTIONS[questionIndex].key === 'voreMeaning' && answer.toLowerCase() === 'skip') {
        pending.answers[VERIFICATION_QUESTIONS[questionIndex].key] = 'Skipped';
    } else {
        pending.answers[VERIFICATION_QUESTIONS[questionIndex].key] = answer;
    }
    
    // Move to next question
    pending.currentQuestion++;
    
    // Check if all questions are answered
    if (pending.currentQuestion >= VERIFICATION_QUESTIONS.length) {
        // All questions answered - now verify Roblox account
        pending.step = 'roblox_verify';
        pendingManualVerifications.set(message.author.id, pending);
        
        await message.reply('✅ **All questions answered!** Now verifying your Roblox account...');
        
        // Look up Roblox user
        const robloxUser = await lookupRobloxUser(pending.answers.robloxUsername);
        
        if (!robloxUser) {
            await message.channel.send(`❌ Could not find Roblox user **${pending.answers.robloxUsername}**. Please start verification again with the correct username.`);
            pendingManualVerifications.delete(message.author.id);
            return;
        }
        
        if (robloxUser.isBanned) {
            await message.channel.send('❌ This Roblox account is banned and cannot be verified.');
            pendingManualVerifications.delete(message.author.id);
            return;
        }
        
        // Check if account is at least 30 days old
        if (robloxUser.created) {
            const accountCreated = new Date(robloxUser.created);
            const now = new Date();
            const daysSinceCreation = Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24));
            
            if (daysSinceCreation < 30) {
                const daysRemaining = 30 - daysSinceCreation;
                await message.channel.send(`❌ **Account Too New**\n\nYour Roblox account **${robloxUser.username}** was created ${daysSinceCreation} days ago.\n\nFor security reasons, Roblox accounts must be **at least 30 days old** to verify.\n\nPlease try again in **${daysRemaining} day${daysRemaining === 1 ? '' : 's'}**.`);
                pendingManualVerifications.delete(message.author.id);
                return;
            }
        }
        
        // Generate verification code
        const verificationCode = generateVerificationCode();
        pending.robloxUser = robloxUser;
        pending.verificationCode = verificationCode;
        pending.step = 'code_verify';
        pendingManualVerifications.set(message.author.id, pending);
        
        // Auto-expire code after 15 minutes
        setTimeout(() => {
            const p = pendingManualVerifications.get(message.author.id);
            if (p && p.verificationCode === verificationCode && p.step === 'code_verify') {
                pendingManualVerifications.delete(message.author.id);
                message.author.send('⏰ Your verification code has expired. Please start verification again.').catch(() => {});
            }
        }, 15 * 60 * 1000);
        
        const codeEmbed = new EmbedBuilder()
            .setTitle('🔐 Verify Your Roblox Account')
            .setDescription(`To prove you own **${robloxUser.username}**, add this code to your Roblox profile description:`)
            .setColor(0x00d4ff)
            .addFields(
                { name: '📋 Your Verification Code', value: `\`\`\`${verificationCode}\`\`\``, inline: false },
                { name: '📝 Instructions', value: 
                    '1. Go to your [Roblox Profile Settings](https://www.roblox.com/my/account#!/info)\n' +
                    '2. In the "About" section, paste the code above anywhere in your description\n' +
                    '3. Save your profile\n' +
                    '4. Click the **"✅ I Added the Code"** button below\n\n' +
                    '*You can remove the code after verification*', inline: false },
                { name: '⏰ Expires', value: 'This code expires in **15 minutes**', inline: true }
            )
            .setFooter({ text: `Verifying: ${robloxUser.username} (${robloxUser.id})` });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('dm_verify_code_check')
                    .setLabel('✅ I Added the Code')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('dm_verify_code_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setLabel('Open Roblox Profile')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
            );
        
        await message.channel.send({ embeds: [codeEmbed], components: [row] });
        return;
    }
    
    // Send next question
    pendingManualVerifications.set(message.author.id, pending);
    
    const nextQuestion = VERIFICATION_QUESTIONS[pending.currentQuestion];
    const progressBar = `[${pending.currentQuestion + 1}/${VERIFICATION_QUESTIONS.length}]`;
    
    await message.channel.send(`${nextQuestion.question}`);
});

// Post verification instructions to the how-to-verify channel on ready
async function postVerificationInstructions() {
    if (!HOW_TO_VERIFY_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(HOW_TO_VERIFY_CHANNEL_ID);
        
        // Build the embed and button
        const embed = new EmbedBuilder()
            .setTitle('🔞 Welcome to Forest Park Hangout – 18+ Verification Required')
            .setDescription('**This is an 18+ community.** To keep our community safe and friendly, all visitors must complete age verification before accessing the full server.\n\n**🛡️ Please answer all the following questions honestly and completely.**')
            .setColor(0x87CEEB)
            .addFields(
                { name: '🔐 Part 1 - Identity & Age Verification:', value: 
                    '1. What is your birthdate? (MM/DD/YYYY)\n' +
                    '2. How old will you be on your next birthday?\n' +
                    '3. List any vore-related servers you are currently in\n' +
                    '4. Why did you decide to join Forest Park Hangout?\n' +
                    '5. Quote 3 rules & explain them in your own words\n' +
                    '6. **Were you invited by a friend? If yes, who?**'
                },
                { name: '🔐 Part 2 - About You:', value: 
                    '7. How did you find this server?\n' +
                    '8. What timezone are you in?\n' +
                    '9. Have you been banned from any Discord servers?\n' +
                    '10. Do you have any alt Discord accounts?\n' +
                    '11. (Optional) What does vore mean to you?'
                },
                { name: '🔐 Part 3 - Roblox & Final Questions:', value: 
                    '12. What is your Roblox username?\n' +
                    '13. Have you played Forest Park Hangout before?\n' +
                    '14. Are you comfortable following all server rules?\n' +
                    '15. What experience are you hoping to have?\n' +
                    '16. Anything else you want staff to know?'
                },
                { name: '👥 Invited by a Friend?', value: 'If you were invited by a friend, please let us know who invited you!' },
                { name: '🔒 Privacy', value: 'Only staff can see your answers — your privacy is respected.' },
                { name: '🚨 Note', value: 'If your answers don\'t match or you appear to be under 18, your verification will be denied.\n\nIf you need help, ping <@&1386816989137211575>.' }
            )
            .setFooter({ text: 'Thanks for helping us keep Forest Park Hangout safe and welcoming! 🌿' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start_manual_verification')
                    .setLabel('📝 Start 18+ Verification')
                    .setStyle(ButtonStyle.Success)
            );
        
        // Check if we already have a verification message
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMessage = messages.find(m => 
            m.author.id === client.user.id && 
            m.components.length > 0 &&
            m.components[0]?.components[0]?.customId === 'start_manual_verification'
        );
        
        if (existingMessage) {
            // Edit the existing message with updated content
            await existingMessage.edit({ embeds: [embed], components: [row] });
            console.log('✓ Updated existing verification instructions message');
        } else {
            // Post a new message
            await channel.send({ embeds: [embed], components: [row] });
            console.log('✓ Posted new verification instructions to channel');
        }
    } catch (err) {
        console.error('Failed to post verification instructions:', err.message);
    }
}

// Post ping roles message to the ping roles channel
async function postPingRolesMessage() {
    console.log('postPingRolesMessage called');
    console.log(`PING_ROLES_CHANNEL_ID: ${PING_ROLES_CHANNEL_ID}`);
    console.log(`PING_ROLES.length: ${PING_ROLES.length}`);
    console.log(`GENDER_ROLES.length: ${GENDER_ROLES.length}`);
    console.log(`VORE_ROLES.length: ${VORE_ROLES.length}`);
    
    if (!PING_ROLES_CHANNEL_ID) {
        console.log('ℹ️ Ping roles channel not configured');
        return;
    }
    
    const hasAnyRoles = PING_ROLES.length > 0 || GENDER_ROLES.length > 0 || VORE_ROLES.length > 0;
    if (!hasAnyRoles) {
        console.log('ℹ️ No roles configured - add role IDs to PING_ROLES, GENDER_ROLES, or VORE_ROLES arrays');
        return;
    }
    
    try {
        const channel = await client.channels.fetch(PING_ROLES_CHANNEL_ID);
        console.log(`Fetched channel: ${channel.name}`);
        
        // ========== NOTIFICATION ROLES ==========
        if (PING_ROLES.length > 0) {
            console.log('Posting notification roles...');
            const roleDescriptions = PING_ROLES.map(role => 
                `${role.emoji} **${role.label}** - ${role.description}`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setTitle('🔔 Notification Roles')
                .setDescription('Click the buttons below to toggle notification roles.\nClick once to **add** the role, click again to **remove** it.\n\n' + roleDescriptions)
                .setColor(0x5865F2)
                .setFooter({ text: 'Toggle roles anytime by clicking the buttons' });
            
            // Build button rows (max 5 buttons per row)
            const rows = [];
            for (let i = 0; i < PING_ROLES.length; i += 5) {
                const row = new ActionRowBuilder();
                const rolesInRow = PING_ROLES.slice(i, i + 5);
                
                for (const role of rolesInRow) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ping_role_${role.id}`)
                            .setLabel(role.label)
                            .setEmoji(role.emoji)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                rows.push(row);
            }
            
            // Check if we already have a ping roles message
            const messages = await channel.messages.fetch({ limit: 20 });
            const existingMessage = messages.find(m => 
                m.author.id === client.user.id && 
                m.embeds.length > 0 &&
                m.embeds[0].title?.includes('Notification Roles')
            );
            
            if (existingMessage) {
                await existingMessage.edit({ embeds: [embed], components: rows });
                console.log('✓ Updated existing notification roles message');
            } else {
                await channel.send({ embeds: [embed], components: rows });
                console.log('✓ Posted new notification roles message');
            }
        }
        
        // ========== GENDER ROLES ==========
        if (GENDER_ROLES.length > 0) {
            console.log('Posting gender roles...');
            console.log('GENDER_ROLES:', JSON.stringify(GENDER_ROLES));
            try {
                const genderDescriptions = GENDER_ROLES.map(role => 
                    `${role.emoji} **${role.label}**`
                ).join(' • ');
                
                const genderEmbed = new EmbedBuilder()
                    .setTitle('⚧️ Gender Roles')
                    .setDescription('Select your gender identity.\nClick once to **add** the role, click again to **remove** it.\n\n' + genderDescriptions)
                    .setColor(0xFF69B4)
                    .setFooter({ text: 'You can select one or more roles' });
                
                const genderRows = [];
                for (let i = 0; i < GENDER_ROLES.length; i += 5) {
                    const row = new ActionRowBuilder();
                    const rolesInRow = GENDER_ROLES.slice(i, i + 5);
                    
                    for (const role of rolesInRow) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`gender_role_${role.id}`)
                                .setLabel(role.label)
                                .setEmoji(role.emoji)
                                .setStyle(ButtonStyle.Secondary)
                        );
                    }
                    genderRows.push(row);
                }
                
                const messages = await channel.messages.fetch({ limit: 20 });
                const existingGenderMessage = messages.find(m => 
                    m.author.id === client.user.id && 
                    m.embeds.length > 0 &&
                    m.embeds[0].title?.includes('Gender Roles')
                );
                
                if (existingGenderMessage) {
                    await existingGenderMessage.edit({ embeds: [genderEmbed], components: genderRows });
                    console.log('✓ Updated existing gender roles message');
                } else {
                    await channel.send({ embeds: [genderEmbed], components: genderRows });
                    console.log('✓ Posted new gender roles message');
                }
            } catch (genderErr) {
                console.error('❌ Error posting gender roles:', genderErr.message);
                console.error('Full error:', genderErr);
            }
        } else {
            console.log('⚠️ GENDER_ROLES is empty, skipping gender roles message');
        }
        
        // ========== VORE PREFERENCE ROLES ==========
        if (VORE_ROLES.length > 0) {
            console.log('Posting vore roles...');
            try {
                const voreDescriptions = VORE_ROLES.map(role => 
                    `${role.emoji} **${role.label}** - ${role.description}`
                ).join('\n');
                
                const voreEmbed = new EmbedBuilder()
                    .setTitle('🍽️ Vore Preference Roles')
                    .setDescription('Select your vore preference.\nClick once to **add** the role, click again to **remove** it.\n\n' + voreDescriptions)
                    .setColor(0x9B59B6)
                    .setFooter({ text: 'You can select one or more roles' });
                
                const voreRows = [];
                for (let i = 0; i < VORE_ROLES.length; i += 5) {
                    const row = new ActionRowBuilder();
                    const rolesInRow = VORE_ROLES.slice(i, i + 5);
                    
                    for (const role of rolesInRow) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`vore_role_${role.id}`)
                                .setLabel(role.label)
                                .setEmoji(role.emoji)
                                .setStyle(ButtonStyle.Secondary)
                        );
                    }
                    voreRows.push(row);
                }
                
                const messages = await channel.messages.fetch({ limit: 20 });
                const existingVoreMessage = messages.find(m => 
                    m.author.id === client.user.id && 
                    m.embeds.length > 0 &&
                    m.embeds[0].title?.includes('Vore Preference Roles')
                );
                
                if (existingVoreMessage) {
                    await existingVoreMessage.edit({ embeds: [voreEmbed], components: voreRows });
                    console.log('✓ Updated existing vore preference roles message');
                } else {
                    await channel.send({ embeds: [voreEmbed], components: voreRows });
                    console.log('✓ Posted new vore preference roles message');
                }
            } catch (voreErr) {
                console.error('❌ Error posting vore roles:', voreErr.message);
                console.error('Full error:', voreErr);
            }
        } else {
            console.log('⚠️ VORE_ROLES is empty, skipping vore roles message');
        }
        
        console.log('✓ postPingRolesMessage completed');
        
    } catch (err) {
        console.error('Failed to post roles messages:', err.message);
        console.error('Full error:', err);
    }
}

// Function to look up Roblox user by username
async function lookupRobloxUser(username) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        // Use Roblox API to get user by username
        const response = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usernames: [username],
                excludeBannedUsers: true
            })
        });
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const user = data.data[0];
            
            // Get more details including display name
            const detailsResponse = await fetch(`https://users.roblox.com/v1/users/${user.id}`);
            const details = await detailsResponse.json();
            
            return {
                id: user.id,
                username: user.name,
                displayName: details.displayName || user.name,
                created: details.created,
                isBanned: details.isBanned || false
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error looking up Roblox user:', error.message);
        return null;
    }
}

// Function to check if verification code is in Roblox profile description
async function checkRobloxProfileCode(userId, code) {
    try {
        const fetch = (await import('node-fetch')).default;
        
        // Get user's profile description
        const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        const data = await response.json();
        
        if (data.description) {
            // Check if the code exists in their description (case insensitive)
            return data.description.toLowerCase().includes(code.toLowerCase());
        }
        
        return false;
    } catch (error) {
        console.error('Error checking Roblox profile:', error.message);
        return false;
    }
}

// Generate a random verification code
function generateVerificationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like I, 1, O, 0
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Handle all interactions (buttons and modals)
client.on('interactionCreate', async (interaction) => {
    console.log(`Interaction received: type=${interaction.type}, customId=${interaction.customId || 'N/A'}, user=${interaction.user?.tag}`);
    
    try {
        // Handle Modal submissions (Roblox username input)
        if (interaction.type === InteractionType.ModalSubmit) {
            console.log(`Modal submitted: ${interaction.customId}`);
            
            // Handle Manual Verification Modal - Step 1
            if (interaction.customId === 'manual_verification_modal') {
                const birthdate = interaction.fields.getTextInputValue('birthdate');
                const nextBirthdayAge = interaction.fields.getTextInputValue('next_birthday_age');
                const voreServers = interaction.fields.getTextInputValue('vore_servers');
                const whyJoin = interaction.fields.getTextInputValue('why_join');
                const rulesQuote = interaction.fields.getTextInputValue('rules_quote');
                
                console.log(`Manual verification step 1 submitted by ${interaction.user.tag}`);
                
                // Store partial data for step 2
                pendingManualVerifications.set(interaction.user.id, {
                    odId: interaction.user.id,
                    username: interaction.user.username,
                    tag: interaction.user.tag,
                    birthdate,
                    nextBirthdayAge,
                    voreServers,
                    whyJoin,
                    rulesQuote,
                    step: 1
                });
                
                // Show second modal with additional questions
                const modal2 = new ModalBuilder()
                    .setCustomId('manual_verification_modal_2')
                    .setTitle('Verification - Part 2 of 3');
                
                const howFoundInput = new TextInputBuilder()
                    .setCustomId('how_found')
                    .setLabel('6. How did you find this server?')
                    .setPlaceholder('Be specific: invite from friend, Discord search, another server...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                const timezoneInput = new TextInputBuilder()
                    .setCustomId('timezone')
                    .setLabel('7. What timezone are you in?')
                    .setPlaceholder('e.g. EST, PST, GMT, UTC+2, etc.')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                
                const bannedBeforeInput = new TextInputBuilder()
                    .setCustomId('banned_before')
                    .setLabel('8. Been banned from any Discord servers?')
                    .setPlaceholder('If yes, explain which servers and why. If no, say No.')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                const altAccountsInput = new TextInputBuilder()
                    .setCustomId('alt_accounts')
                    .setLabel('9. Do you have any alt Discord accounts?')
                    .setPlaceholder('If yes, list them. If no, say No.')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                const voreMeaningInput = new TextInputBuilder()
                    .setCustomId('vore_meaning')
                    .setLabel('10. (Optional) What does vore mean to you?')
                    .setPlaceholder('Leave blank if you prefer not to answer')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);
                
                modal2.addComponents(
                    new ActionRowBuilder().addComponents(howFoundInput),
                    new ActionRowBuilder().addComponents(timezoneInput),
                    new ActionRowBuilder().addComponents(bannedBeforeInput),
                    new ActionRowBuilder().addComponents(altAccountsInput),
                    new ActionRowBuilder().addComponents(voreMeaningInput)
                );
                
                await interaction.showModal(modal2);
                return;
            }
            
            // Handle Manual Verification Modal - Step 2
            if (interaction.customId === 'manual_verification_modal_2') {
                const howFound = interaction.fields.getTextInputValue('how_found');
                const timezone = interaction.fields.getTextInputValue('timezone');
                const bannedBefore = interaction.fields.getTextInputValue('banned_before');
                const altAccounts = interaction.fields.getTextInputValue('alt_accounts');
                const voreMeaning = interaction.fields.getTextInputValue('vore_meaning') || 'Not provided';
                
                console.log(`Manual verification step 2 submitted by ${interaction.user.tag}`);
                
                // Get step 1 data
                const step1Data = pendingManualVerifications.get(interaction.user.id);
                
                if (!step1Data || step1Data.step !== 1) {
                    await interaction.reply({
                        content: '❌ Your first step data was lost. Please start the verification again.',
                        ephemeral: true
                    });
                    return;
                }
                
                // Update with step 2 data
                pendingManualVerifications.set(interaction.user.id, {
                    ...step1Data,
                    howFound,
                    timezone,
                    bannedBefore,
                    altAccounts,
                    voreMeaning,
                    step: 2
                });
                
                // Send a message with button to continue to Part 3 (can't show modal from modal)
                const continueEmbed = new EmbedBuilder()
                    .setTitle('✅ Part 2 Complete!')
                    .setDescription('Great job! You\'re almost done. Click the button below to continue to the final part where you\'ll verify your Roblox account.')
                    .setColor(0x00ff00)
                    .addFields(
                        { name: '📋 Part 3 Questions', value: 
                            '• Your Roblox username\n' +
                            '• If you\'ve played Forest Park before\n' +
                            '• If you\'re comfortable with the rules\n' +
                            '• What experience you\'re hoping for\n' +
                            '• Anything else for staff'
                        }
                    )
                    .setFooter({ text: 'Click Continue to finish your verification' });
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('continue_to_part3')
                            .setLabel('➡️ Continue to Part 3')
                            .setStyle(ButtonStyle.Primary)
                    );
                
                await interaction.reply({ embeds: [continueEmbed], components: [row], ephemeral: true });
                return;
            }
            
            // Handle Manual Verification Modal - Step 3
            if (interaction.customId === 'manual_verification_modal_3') {
                const robloxUsernameVerify = interaction.fields.getTextInputValue('roblox_username_verify');
                const playedBefore = interaction.fields.getTextInputValue('played_before');
                const comfortableRules = interaction.fields.getTextInputValue('comfortable_rules');
                const experienceHoping = interaction.fields.getTextInputValue('experience_hoping');
                const anythingElse = interaction.fields.getTextInputValue('anything_else') || 'Not provided';
                
                console.log(`Manual verification step 3 submitted by ${interaction.user.tag}`);
                
                // Get step 2 data
                const step2Data = pendingManualVerifications.get(interaction.user.id);
                
                if (!step2Data || step2Data.step !== 2) {
                    await interaction.reply({
                        content: '❌ Your previous step data was lost. Please start the verification again.',
                        ephemeral: true
                    });
                    return;
                }
                
                await interaction.deferReply({ ephemeral: true });
                
                // Look up the Roblox user to verify they exist
                const robloxUser = await lookupRobloxUser(robloxUsernameVerify);
                
                if (!robloxUser) {
                    await interaction.editReply({
                        content: `❌ Could not find Roblox user **${robloxUsernameVerify}**. Please check the spelling and start verification again.`
                    });
                    pendingManualVerifications.delete(interaction.user.id);
                    return;
                }
                
                if (robloxUser.isBanned) {
                    await interaction.editReply({
                        content: '❌ This Roblox account is banned and cannot be verified.'
                    });
                    pendingManualVerifications.delete(interaction.user.id);
                    return;
                }
                
                // Check if account is at least 30 days old
                if (robloxUser.created) {
                    const accountCreated = new Date(robloxUser.created);
                    const now = new Date();
                    const daysSinceCreation = Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24));
                    
                    if (daysSinceCreation < 30) {
                        const daysRemaining = 30 - daysSinceCreation;
                        await interaction.editReply({
                            content: `❌ **Account Too New**\n\nYour Roblox account **${robloxUser.username}** was created ${daysSinceCreation} days ago.\n\nFor security reasons, Roblox accounts must be **at least 30 days old** to verify.\n\nPlease try again in **${daysRemaining} day${daysRemaining === 1 ? '' : 's'}**.`
                        });
                        pendingManualVerifications.delete(interaction.user.id);
                        return;
                    }
                }
                
                // Generate verification code to prove account ownership
                const verificationCode = generateVerificationCode();
                
                // Update with full data and code
                pendingManualVerifications.set(interaction.user.id, {
                    ...step2Data,
                    robloxUsernameVerify,
                    robloxUser,
                    playedBefore,
                    comfortableRules,
                    experienceHoping,
                    anythingElse,
                    verificationCode,
                    step: 3,
                    submittedAt: new Date().toISOString()
                });
                
                // Auto-expire code after 15 minutes
                setTimeout(() => {
                    const pending = pendingManualVerifications.get(interaction.user.id);
                    if (pending && pending.verificationCode === verificationCode && pending.step === 3) {
                        pendingManualVerifications.delete(interaction.user.id);
                        console.log(`Manual verification code expired for ${interaction.user.tag}`);
                    }
                }, 15 * 60 * 1000);
                
                // Send code verification instructions
                const codeEmbed = new EmbedBuilder()
                    .setTitle('🔐 Verify Your Roblox Account')
                    .setDescription(`To prove you own **${robloxUser.username}**, add this code to your Roblox profile description:`)
                    .setColor(0x00d4ff)
                    .addFields(
                        { name: '📋 Your Verification Code', value: `\`\`\`${verificationCode}\`\`\``, inline: false },
                        { name: '📝 Instructions', value: 
                            '1. Go to your [Roblox Profile Settings](https://www.roblox.com/my/account#!/info)\n' +
                            '2. In the "About" section, paste the code above anywhere in your description\n' +
                            '3. Save your profile\n' +
                            '4. Click the **"✅ I Added the Code"** button below\n\n' +
                            '*You can remove the code after verification*', inline: false },
                        { name: '⏰ Expires', value: 'This code expires in **15 minutes**', inline: true }
                    )
                    .setThumbnail(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxUser.id}&size=150x150&format=Png`)
                    .setFooter({ text: `Verifying: ${robloxUser.username} (${robloxUser.id})` });
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('manual_verify_code_check')
                            .setLabel('✅ I Added the Code')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('manual_verify_code_cancel')
                            .setLabel('❌ Cancel')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setLabel('Open Roblox Profile')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
                    );
                
                await interaction.editReply({ embeds: [codeEmbed], components: [row] });
                return;
            }
            
            if (interaction.customId === 'bloxlink_verify_modal') {
            const robloxUsername = interaction.fields.getTextInputValue('roblox_username');
            
            console.log(`User ${interaction.user.tag} submitted Roblox username: ${robloxUsername}`);
            
            await interaction.deferReply({ ephemeral: true });
            
            // Look up the Roblox user
            const robloxUser = await lookupRobloxUser(robloxUsername);
            
            if (!robloxUser) {
                await interaction.editReply({
                    content: `❌ Could not find Roblox user **${robloxUsername}**. Please check the spelling and try again.`
                });
                return;
            }
            
            if (robloxUser.isBanned) {
                await interaction.editReply({
                    content: '❌ This Roblox account is banned and cannot be verified.'
                });
                return;
            }
            
            // Check if this Roblox account is already verified to someone else
            const existingDiscord = robloxToDiscord.get(String(robloxUser.id));
            if (existingDiscord && existingDiscord !== interaction.user.id) {
                await interaction.editReply({
                    content: `❌ This Roblox account is already linked to another Discord user. Contact staff if you think this is an error.`
                });
                return;
            }
            
            // Check if user is already verified with different account
            const existingRoblox = discordToRoblox.get(interaction.user.id);
            if (existingRoblox && existingRoblox !== robloxUser.id) {
                await interaction.editReply({
                    content: `⚠️ You are already verified with a different Roblox account. Contact staff if you need to change it.`
                });
                return;
            }
            
            // Get Discord member info
            const guildId = process.env.DISCORD_GUILD_ID;
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(interaction.user.id);
            
            // Get Discord display name (nickname > global name > username)
            const discordDisplayName = member.nickname || interaction.user.globalName || interaction.user.username;
            const robloxDisplayName = robloxUser.displayName;
            
            console.log(`Comparing: Discord "${discordDisplayName}" vs Roblox "${robloxDisplayName}"`);
            
            // Check if display names match (if required)
            if (REQUIRE_MATCHING_DISPLAY_NAME) {
                if (discordDisplayName.toLowerCase() !== robloxDisplayName.toLowerCase()) {
                    await interaction.editReply({
                        content: `❌ **Display name mismatch!**\n\nYour Discord display name: **${discordDisplayName}**\nYour Roblox display name: **${robloxDisplayName}**\n\nPlease change your **Roblox display name** to **${discordDisplayName}** (or change your Discord name to match), then try again.\n\n[Change Roblox Display Name](https://www.roblox.com/my/account#!/info)`
                    });
                    return;
                }
            }
            
            // Generate a unique verification code
            const verificationCode = generateVerificationCode();
            
            // Store pending verification
            pendingRobloxVerifications.set(interaction.user.id, {
                robloxUser,
                verificationCode,
                discordDisplayName,
                timestamp: Date.now(),
                member
            });
            
            // Auto-expire after 10 minutes
            setTimeout(() => {
                const pending = pendingRobloxVerifications.get(interaction.user.id);
                if (pending && pending.verificationCode === verificationCode) {
                    pendingRobloxVerifications.delete(interaction.user.id);
                    console.log(`Verification code expired for ${interaction.user.tag}`);
                }
            }, 10 * 60 * 1000);
            
            // Send instructions with the code
            const codeEmbed = new EmbedBuilder()
                .setTitle('🔐 Verify Your Roblox Account')
                .setDescription(`To prove you own **${robloxUser.username}**, add this code to your Roblox profile description:`)
                .setColor(0x00d4ff)
                .addFields(
                    { name: '📋 Your Verification Code', value: `\`\`\`${verificationCode}\`\`\``, inline: false },
                    { name: '📝 Instructions', value: 
                        '1. Go to your [Roblox Profile Settings](https://www.roblox.com/my/account#!/info)\n' +
                        '2. In the "About" section, paste the code above anywhere in your description\n' +
                        '3. Save your profile\n' +
                        '4. Click the **"✅ I Added the Code"** button below\n\n' +
                        '*You can remove the code after verification*', inline: false },
                    { name: '⏰ Expires', value: 'This code expires in **10 minutes**', inline: true }
                )
                .setFooter({ text: `Verifying: ${robloxUser.username} (${robloxUser.id})` });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_code_check')
                        .setLabel('✅ I Added the Code')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('verify_code_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setLabel('Open Roblox Profile')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
                );
            
            await interaction.editReply({ embeds: [codeEmbed], components: [row] });
            return;
        }
    }
    
    // Handle Button clicks
    if (interaction.type !== InteractionType.MessageComponent) return;
    
    const customId = interaction.customId;
    console.log(`Button click detected: customId="${customId}"`);
    
    // Handle ping role toggle buttons
    if (customId.startsWith('ping_role_')) {
        const roleId = customId.replace('ping_role_', '');
        
        // Make sure we're in a guild
        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ This can only be used in a server.',
                ephemeral: true
            });
            return;
        }
        
        try {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(roleId);
            
            if (!role) {
                await interaction.reply({
                    content: '❌ This role no longer exists. Please contact a staff member.',
                    ephemeral: true
                });
                return;
            }
            
            // Check if member has the role
            const hasRole = member.roles.cache.has(roleId);
            
            if (hasRole) {
                // Remove the role
                await member.roles.remove(roleId);
                await interaction.reply({
                    content: `✅ Removed the **${role.name}** notification role. You will no longer be pinged for these notifications.`,
                    ephemeral: true
                });
                console.log(`✓ Removed ping role ${role.name} from ${interaction.user.tag}`);
            } else {
                // Add the role
                await member.roles.add(roleId);
                await interaction.reply({
                    content: `✅ Added the **${role.name}** notification role! You will now be pinged for these notifications.`,
                    ephemeral: true
                });
                console.log(`✓ Added ping role ${role.name} to ${interaction.user.tag}`);
            }
        } catch (err) {
            console.error('Error toggling ping role:', err.message);
            await interaction.reply({
                content: '❌ Failed to toggle the role. The bot may not have permission to manage roles.',
                ephemeral: true
            });
        }
        return;
    }
    
    // Handle gender role toggle buttons
    if (customId.startsWith('gender_role_')) {
        const roleId = customId.replace('gender_role_', '');
        
        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ This can only be used in a server.',
                ephemeral: true
            });
            return;
        }
        
        try {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(roleId);
            
            if (!role) {
                await interaction.reply({
                    content: '❌ This role no longer exists. Please contact a staff member.',
                    ephemeral: true
                });
                return;
            }
            
            const hasRole = member.roles.cache.has(roleId);
            
            if (hasRole) {
                await member.roles.remove(roleId);
                await interaction.reply({
                    content: `✅ Removed the **${role.name}** role.`,
                    ephemeral: true
                });
                console.log(`✓ Removed gender role ${role.name} from ${interaction.user.tag}`);
            } else {
                await member.roles.add(roleId);
                await interaction.reply({
                    content: `✅ Added the **${role.name}** role!`,
                    ephemeral: true
                });
                console.log(`✓ Added gender role ${role.name} to ${interaction.user.tag}`);
            }
        } catch (err) {
            console.error('Error toggling gender role:', err.message);
            await interaction.reply({
                content: '❌ Failed to toggle the role. The bot may not have permission to manage roles.',
                ephemeral: true
            });
        }
        return;
    }
    
    // Handle vore preference role toggle buttons
    if (customId.startsWith('vore_role_')) {
        const roleId = customId.replace('vore_role_', '');
        
        if (!interaction.guild) {
            await interaction.reply({
                content: '❌ This can only be used in a server.',
                ephemeral: true
            });
            return;
        }
        
        try {
            const member = interaction.member;
            const role = interaction.guild.roles.cache.get(roleId);
            
            if (!role) {
                await interaction.reply({
                    content: '❌ This role no longer exists. Please contact a staff member.',
                    ephemeral: true
                });
                return;
            }
            
            const hasRole = member.roles.cache.has(roleId);
            
            if (hasRole) {
                await member.roles.remove(roleId);
                await interaction.reply({
                    content: `✅ Removed the **${role.name}** role.`,
                    ephemeral: true
                });
                console.log(`✓ Removed vore role ${role.name} from ${interaction.user.tag}`);
            } else {
                await member.roles.add(roleId);
                await interaction.reply({
                    content: `✅ Added the **${role.name}** role!`,
                    ephemeral: true
                });
                console.log(`✓ Added vore role ${role.name} to ${interaction.user.tag}`);
            }
        } catch (err) {
            console.error('Error toggling vore role:', err.message);
            await interaction.reply({
                content: '❌ Failed to toggle the role. The bot may not have permission to manage roles.',
                ephemeral: true
            });
        }
        return;
    }
    
    // Handle "I Added the Code" button - verify the profile
    if (customId === 'verify_code_check') {
        const pending = pendingRobloxVerifications.get(interaction.user.id);
        
        if (!pending) {
            await interaction.reply({
                content: '❌ Your verification session has expired. Please start again by clicking "Verify with Roblox".',
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferUpdate();
        
        // Check if the code is in their Roblox profile
        const codeFound = await checkRobloxProfileCode(pending.robloxUser.id, pending.verificationCode);
        
        if (!codeFound) {
            const retryEmbed = new EmbedBuilder()
                .setTitle('❌ Code Not Found')
                .setDescription(`Could not find the verification code in your Roblox profile description.`)
                .setColor(0xff0000)
                .addFields(
                    { name: '📋 Your Code', value: `\`\`\`${pending.verificationCode}\`\`\``, inline: false },
                    { name: '💡 Tips', value: 
                        '• Make sure you saved your profile after adding the code\n' +
                        '• The code must be in your "About" description\n' +
                        '• Copy the exact code (no extra spaces)\n' +
                        '• Wait a few seconds after saving, then try again', inline: false }
                )
                .setFooter({ text: 'Click "I Added the Code" again after fixing' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_code_check')
                        .setLabel('✅ I Added the Code')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('verify_code_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setLabel('Open Roblox Profile')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.roblox.com/users/${pending.robloxUser.id}/profile`)
                );
            
            await interaction.editReply({ embeds: [retryEmbed], components: [row] });
            return;
        }
        
        // SUCCESS! Code was found - verify the user
        const robloxUser = pending.robloxUser;
        
        verifiedUsers.set(interaction.user.id, {
            robloxUsername: robloxUser.username,
            robloxUserId: robloxUser.id,
            robloxDisplayName: robloxUser.displayName,
            discordId: interaction.user.id,
            discordUsername: interaction.user.username,
            verifiedAt: new Date().toISOString()
        });
        
        // Remember the links both ways
        robloxToDiscord.set(String(robloxUser.id), interaction.user.id);
        discordToRoblox.set(interaction.user.id, robloxUser.id);
        
        // Clean up pending verification
        pendingRobloxVerifications.delete(interaction.user.id);
        
        console.log(`✓ Verified (code method): Discord ${interaction.user.tag} <-> Roblox ${robloxUser.username} (${robloxUser.id})`);
        
        // Give verified role if configured
        if (VERIFIED_ROLE_ID) {
            try {
                await pending.member.roles.add(VERIFIED_ROLE_ID);
                console.log(`✓ Gave verified role to ${interaction.user.tag}`);
            } catch (roleError) {
                console.error('Failed to give verified role:', roleError.message);
            }
        }
        
        // Give additional verified member role
        if (VERIFIED_MEMBER_ROLE_ID) {
            try {
                await pending.member.roles.add(VERIFIED_MEMBER_ROLE_ID);
                console.log(`✓ Gave verified member role to ${interaction.user.tag}`);
            } catch (roleError) {
                console.error('Failed to give verified member role:', roleError.message);
            }
        }
        
        // Success message
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Verification Successful!')
            .setDescription(`Your accounts have been linked.\n\n*You can now remove the code from your Roblox profile.*`)
            .setColor(0x00ff00)
            .addFields(
                { name: '🎮 Roblox Account', value: `**${robloxUser.username}**\nDisplay: ${robloxUser.displayName}\nID: ${robloxUser.id}`, inline: true },
                { name: '💬 Discord Account', value: `**${interaction.user.username}**\nDisplay: ${pending.discordDisplayName}`, inline: true }
            )
            .setFooter({ text: 'You can now access verified features in-game!' });
        
        await interaction.editReply({ embeds: [successEmbed], components: [] });
        
        // Log to in-game verification log channel
        try {
            const logChannel = await client.channels.fetch(IN_GAME_VERIFICATION_LOG_CHANNEL_ID);
            const logEmbed = new EmbedBuilder()
                .setTitle('✅ New Verification (Code Verified)')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'Discord', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: 'Roblox', value: `[${robloxUser.username}](https://www.roblox.com/users/${robloxUser.id}/profile) (${robloxUser.id})`, inline: true }
                )
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        } catch (err) {
            console.log('Could not log verification:', err.message);
        }
        
        return;
    }
    
    // Handle cancel button (Bloxlink-style)
    if (customId === 'verify_code_cancel') {
        pendingRobloxVerifications.delete(interaction.user.id);
        await interaction.update({
            content: '❌ Verification cancelled. Click "Verify with Roblox" to start again.',
            embeds: [],
            components: []
        });
        return;
    }
    
    // Handle manual verification code check
    if (customId === 'manual_verify_code_check') {
        const pending = pendingManualVerifications.get(interaction.user.id);
        
        if (!pending || pending.step !== 3) {
            await interaction.reply({
                content: '❌ Your verification session has expired. Please start again by clicking "Start Verification".',
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferUpdate();
        
        // Check if the code is in their Roblox profile
        const codeFound = await checkRobloxProfileCode(pending.robloxUser.id, pending.verificationCode);
        
        if (!codeFound) {
            const retryEmbed = new EmbedBuilder()
                .setTitle('❌ Code Not Found')
                .setDescription(`Could not find the verification code in your Roblox profile description.`)
                .setColor(0xff0000)
                .addFields(
                    { name: '📋 Your Code', value: `\`\`\`${pending.verificationCode}\`\`\``, inline: false },
                    { name: '💡 Tips', value: 
                        '• Make sure you saved your profile after adding the code\n' +
                        '• The code must be in your "About" description\n' +
                        '• Copy the exact code (no extra spaces)\n' +
                        '• Wait a few seconds after saving, then try again', inline: false }
                )
                .setFooter({ text: 'Click "I Added the Code" again after fixing' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('manual_verify_code_check')
                        .setLabel('✅ I Added the Code')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('manual_verify_code_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setLabel('Open Roblox Profile')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.roblox.com/users/${pending.robloxUser.id}/profile`)
                );
            
            await interaction.editReply({ embeds: [retryEmbed], components: [row] });
            return;
        }
        
        // SUCCESS! Code was found - mark as verified and send to staff
        pending.step = 4; // Mark as code verified
        pending.robloxVerified = true;
        pendingManualVerifications.set(interaction.user.id, pending);
        
        console.log(`✓ Roblox account verified for manual verification: ${pending.robloxUser.username}`);
        
        // Send to verification log channel
        try {
            const logChannel = await client.channels.fetch(VERIFICATION_LOG_CHANNEL_ID);
            
            const logEmbed = new EmbedBuilder()
                .setTitle('📋 New Verification Request')
                .setDescription(`**User:** <@${interaction.user.id}> (${pending.tag})\n\n✅ **Roblox Account Verified** - User proved ownership via profile code`)
                .setColor(0xffaa00)
                .addFields(
                    { name: '🎂 Birthdate', value: pending.birthdate, inline: true },
                    { name: '🔢 Age on Next Birthday', value: pending.nextBirthdayAge, inline: true },
                    { name: '� Timezone', value: pending.timezone, inline: true },
                    { name: '🎮 Roblox Account (VERIFIED ✅)', value: `[${pending.robloxUser.username}](https://www.roblox.com/users/${pending.robloxUser.id}/profile) (${pending.robloxUser.id})`, inline: false },
                    { name: '🌐 Vore-Related Servers', value: pending.voreServers.substring(0, 1024) },
                    { name: '❓ Why Join Forest Park?', value: pending.whyJoin.substring(0, 1024) },
                    { name: '📜 Rules Quote & Explanation', value: pending.rulesQuote.substring(0, 1024) },
                    { name: '🔍 How Found This Server', value: pending.howFound.substring(0, 1024) },
                    { name: '⚠️ Been Banned From Servers?', value: pending.bannedBefore.substring(0, 1024) },
                    { name: '👥 Alt Discord Accounts?', value: pending.altAccounts.substring(0, 1024) },
                    { name: '💭 What Does Vore Mean to You?', value: pending.voreMeaning.substring(0, 1024) },
                    { name: '🏠 Played Forest Park Before?', value: pending.playedBefore.substring(0, 1024) },
                    { name: '✅ Comfortable Following Rules?', value: pending.comfortableRules.substring(0, 1024) },
                    { name: '🌟 Experience Hoping For', value: pending.experienceHoping.substring(0, 1024) },
                    { name: '📝 Anything Else', value: pending.anythingElse.substring(0, 1024) }
                )
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: `User ID: ${interaction.user.id} | Roblox verified via profile code` })
                .setTimestamp();
            
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`manual_verify_accept_${interaction.user.id}`)
                        .setLabel('✅ Accept')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`manual_verify_deny_${interaction.user.id}`)
                        .setLabel('❌ Deny')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await logChannel.send({ embeds: [logEmbed], components: [actionRow] });
            console.log(`✓ Sent verified verification request to log channel for ${interaction.user.tag}`);
            
        } catch (logError) {
            console.error('Failed to send to log channel:', logError.message);
        }
        
        // Send pending DM to user
        try {
            const pendingEmbed = new EmbedBuilder()
                .setTitle('✅ Roblox Account Verified!')
                .setDescription(`Your Roblox account **${pending.robloxUser.username}** has been verified!\n\n**What happens next:**\n• Staff will now review your verification answers\n• You\'ll receive a DM when a decision is made\n• This usually takes a few hours\n\n*You can now remove the code from your Roblox profile.*`)
                .setColor(0x00ff00)
                .setFooter({ text: 'Forest Park Hangout' })
                .setTimestamp();
            
            await interaction.user.send({ embeds: [pendingEmbed] });
        } catch (dmErr) {
            console.error('Could not send pending DM:', dmErr.message);
        }
        
        // Update the message
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Roblox Account Verified!')
            .setDescription(`Your Roblox account **${pending.robloxUser.username}** has been verified!\n\nYour verification request has been sent to staff for review. Check your DMs for updates.`)
            .setColor(0x00ff00)
            .setFooter({ text: 'You can now remove the code from your Roblox profile' });
        
        await interaction.editReply({ embeds: [successEmbed], components: [] });
        return;
    }
    
    // Handle "Continue to Part 3" button click
    if (customId === 'continue_to_part3') {
        const pending = pendingManualVerifications.get(interaction.user.id);
        
        if (!pending || pending.step !== 2) {
            await interaction.reply({
                content: '❌ Your verification session has expired. Please start again by clicking "Start Verification".',
                ephemeral: true
            });
            return;
        }
        
        // Show Part 3 modal
        const modal3 = new ModalBuilder()
            .setCustomId('manual_verification_modal_3')
            .setTitle('Verification - Part 3 of 3');
        
        const robloxUsernameInput = new TextInputBuilder()
            .setCustomId('roblox_username_verify')
            .setLabel('11. What is your Roblox username?')
            .setPlaceholder('Your actual username, not display name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        
        const playedBeforeInput = new TextInputBuilder()
            .setCustomId('played_before')
            .setLabel('12. Have you played Forest Park Hangout before?')
            .setPlaceholder('If yes, what features or areas have you explored?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        
        const comfortableRulesInput = new TextInputBuilder()
            .setCustomId('comfortable_rules')
            .setLabel('13. Comfortable following all server rules?')
            .setPlaceholder('Yes/No and explain how you make sure to follow rules')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        
        const experienceHopingInput = new TextInputBuilder()
            .setCustomId('experience_hoping')
            .setLabel('14. What experience are you hoping to have?')
            .setPlaceholder('e.g. roleplay, social hangout, exploration, events...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        
        const anythingElseInput = new TextInputBuilder()
            .setCustomId('anything_else')
            .setLabel('15. Anything else you want staff to know?')
            .setPlaceholder('Optional - any additional info or questions')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);
        
        modal3.addComponents(
            new ActionRowBuilder().addComponents(robloxUsernameInput),
            new ActionRowBuilder().addComponents(playedBeforeInput),
            new ActionRowBuilder().addComponents(comfortableRulesInput),
            new ActionRowBuilder().addComponents(experienceHopingInput),
            new ActionRowBuilder().addComponents(anythingElseInput)
        );
        
        await interaction.showModal(modal3);
        return;
    }
    
    // Handle manual verification code cancel
    if (customId === 'manual_verify_code_cancel') {
        pendingManualVerifications.delete(interaction.user.id);
        await interaction.update({
            content: '❌ Verification cancelled. Click "Start Verification" to try again.',
            embeds: [],
            components: []
        });
        return;
    }
    
    // Handle "Start Manual Verification" button click
    if (customId === 'start_manual_verification') {
        console.log(`Manual verification started by ${interaction.user.tag}`);
        
        // Check if already has a pending verification
        const existingPending = pendingManualVerifications.get(interaction.user.id);
        if (existingPending) {
            if (existingPending.step === 'submitted') {
                await interaction.reply({
                    content: '⏳ You already have a pending verification. Please wait for staff to review it.',
                    ephemeral: true
                });
                return;
            } else if (existingPending.step === 'code_verify') {
                await interaction.reply({
                    content: '⏳ You have an ongoing verification. Please check your DMs and complete the Roblox profile code step.',
                    ephemeral: true
                });
                return;
            } else if (existingPending.step === 'answering') {
                await interaction.reply({
                    content: '⏳ You have an ongoing verification. Please check your DMs and answer the questions there.',
                    ephemeral: true
                });
                return;
            }
        }
        
        // Start DM verification - defer first to prevent timeout
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Initialize verification data
            pendingManualVerifications.set(interaction.user.id, {
                odId: interaction.user.id,
                username: interaction.user.username,
                tag: interaction.user.tag,
                step: 'answering',
                currentQuestion: 0,
                answers: {},
                startedAt: new Date().toISOString()
            });
            
            // Send first question via DM
            const startEmbed = new EmbedBuilder()
                .setTitle('🌲 Forest Park Hangout - Verification Started')
                .setDescription('Thank you for starting the verification process!\n\nI will ask you **15 questions** one at a time. Simply reply to each message with your answer.\n\n**Important:**\n• Answer honestly and completely\n• For optional questions, type "skip" to skip\n• Take your time - there\'s no rush')
                .setColor(0x87CEEB)
                .setFooter({ text: 'Your answers are only visible to staff' });
            
            await interaction.user.send({ embeds: [startEmbed] });
            
            // Send first question
            const firstQuestion = VERIFICATION_QUESTIONS[0];
            await interaction.user.send(firstQuestion.question);
            
            await interaction.editReply({
                content: '✅ **Verification started!** Check your DMs to answer the verification questions.'
            });
            
        } catch (dmError) {
            console.error(`Could not DM ${interaction.user.tag}:`, dmError.message);
            pendingManualVerifications.delete(interaction.user.id);
            await interaction.editReply({
                content: '❌ **Could not send you a DM!** Please make sure your DMs are open for this server, then try again.\n\n**How to enable DMs:**\n1. Right-click the server icon\n2. Click "Privacy Settings"\n3. Enable "Direct Messages"'
            });
        }
        return;
    }
    
    // Handle DM verification code check
    if (customId === 'dm_verify_code_check') {
        const pending = pendingManualVerifications.get(interaction.user.id);
        
        if (!pending || pending.step !== 'code_verify') {
            await interaction.reply({
                content: '❌ Your verification session has expired. Please start again by clicking "Start Verification" in the server.',
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferUpdate();
        
        // Check if the code is in their Roblox profile
        const codeFound = await checkRobloxProfileCode(pending.robloxUser.id, pending.verificationCode);
        
        if (!codeFound) {
            const retryEmbed = new EmbedBuilder()
                .setTitle('❌ Code Not Found')
                .setDescription('Could not find the verification code in your Roblox profile description.')
                .setColor(0xff0000)
                .addFields(
                    { name: '📋 Your Code', value: `\`\`\`${pending.verificationCode}\`\`\``, inline: false },
                    { name: '💡 Tips', value: 
                        '• Make sure you saved your profile after adding the code\n' +
                        '• The code must be in your "About" description\n' +
                        '• Copy the exact code (no extra spaces)\n' +
                        '• Wait a few seconds after saving, then try again', inline: false }
                )
                .setFooter({ text: 'Click "I Added the Code" again after fixing' });
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('dm_verify_code_check')
                        .setLabel('✅ I Added the Code')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('dm_verify_code_cancel')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setLabel('Open Roblox Profile')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://www.roblox.com/users/${pending.robloxUser.id}/profile`)
                );
            
            await interaction.editReply({ embeds: [retryEmbed], components: [row] });
            return;
        }
        
        // SUCCESS! Send to staff for review
        pending.step = 'submitted';
        pending.robloxVerified = true;
        pending.submittedAt = new Date().toISOString();
        pendingManualVerifications.set(interaction.user.id, pending);
        
        console.log(`✓ Roblox verified for ${interaction.user.tag}, sending to staff`);
        
        // Send to verification log channel
        try {
            const logChannel = await client.channels.fetch(VERIFICATION_LOG_CHANNEL_ID);
            
            const logEmbed = new EmbedBuilder()
                .setTitle('📋 New Verification Request')
                .setDescription(`**User:** <@${interaction.user.id}> (${pending.tag})\n\n✅ **Roblox Account Verified** - User proved ownership via profile code`)
                .setColor(0xffaa00)
                .addFields(
                    { name: '🎂 Birthdate', value: pending.answers.birthdate || 'Not provided', inline: true },
                    { name: '🔢 Age on Next Birthday', value: pending.answers.nextBirthdayAge || 'Not provided', inline: true },
                    { name: '🌍 Timezone', value: pending.answers.timezone || 'Not provided', inline: true },
                    { name: '🎮 Roblox Account (VERIFIED ✅)', value: `[${pending.robloxUser.username}](https://www.roblox.com/users/${pending.robloxUser.id}/profile) (${pending.robloxUser.id})`, inline: false },
                    { name: '🌐 Vore-Related Servers', value: (pending.answers.voreServers || 'Not provided').substring(0, 1024) },
                    { name: '❓ Why Join Forest Park?', value: (pending.answers.whyJoin || 'Not provided').substring(0, 1024) },
                    { name: '💡 What Interests You?', value: (pending.answers.interests || 'Not provided').substring(0, 1024) },
                    { name: '📜 Rules Quote & Explanation', value: (pending.answers.rulesQuote || 'Not provided').substring(0, 1024) },
                    { name: '🔍 How Found This Server', value: (pending.answers.howFound || 'Not provided').substring(0, 1024) },
                    { name: '⚠️ Been Banned From Servers?', value: (pending.answers.bannedBefore || 'Not provided').substring(0, 1024) },
                    { name: '👥 Alt Discord Accounts?', value: (pending.answers.altAccounts || 'Not provided').substring(0, 1024) },
                    { name: '💭 What Does Vore Mean to You?', value: (pending.answers.voreMeaning || 'Skipped').substring(0, 1024) },
                    { name: '🏠 Played Forest Park Before?', value: (pending.answers.playedBefore || 'Not provided').substring(0, 1024) },
                    { name: '✅ Comfortable Following Rules?', value: (pending.answers.comfortableRules || 'Not provided').substring(0, 1024) },
                    { name: '🌟 Experience Hoping For', value: (pending.answers.experienceHoping || 'Not provided').substring(0, 1024) }
                )
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: `User ID: ${interaction.user.id} | Roblox verified via profile code` })
                .setTimestamp();
            
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`manual_verify_accept_${interaction.user.id}`)
                        .setLabel('✅ Accept')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`manual_verify_deny_${interaction.user.id}`)
                        .setLabel('❌ Deny')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await logChannel.send({ embeds: [logEmbed], components: [actionRow] });
            
        } catch (logError) {
            console.error('Failed to send to log channel:', logError.message);
        }
        
        // Success message to user
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Verification Submitted!')
            .setDescription(`Your Roblox account **${pending.robloxUser.username}** has been verified!\n\n**What happens next:**\n• Staff will now review your verification answers\n• You'll receive a DM when a decision is made\n• This usually takes a few hours\n\n*You can now remove the code from your Roblox profile.*`)
            .setColor(0x00ff00)
            .setFooter({ text: 'Thanks for verifying!' });
        
        await interaction.editReply({ embeds: [successEmbed], components: [] });
        return;
    }
    
    // Handle DM verification code cancel
    if (customId === 'dm_verify_code_cancel') {
        pendingManualVerifications.delete(interaction.user.id);
        await interaction.update({
            content: '❌ Verification cancelled. You can start again by clicking "Start Verification" in the server.',
            embeds: [],
            components: []
        });
        return;
    }
    
    // Handle group accept all verified button
    if (customId === 'group_accept_all_verified') {
        // Check if user has staff role
        const member = interaction.member;
        if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
            return interaction.reply({ content: '❌ You need the staff role to use this.', ephemeral: true });
        }
        
        // Defer immediately to prevent timeout
        try {
            await interaction.deferReply({ ephemeral: false });
        } catch (deferErr) {
            console.log('Could not defer group accept button:', deferErr.message);
            return;
        }
        
        try {
            const fetch = (await import('node-fetch')).default;
            
            // Get pending requests
            const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=100`, {
                headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
            });
            const data = await response.json();
            
            if (data.errors) {
                return interaction.editReply({ content: `❌ Error: ${data.errors[0]?.message || 'Failed to get requests'}` });
            }
            
            if (!data.data || data.data.length === 0) {
                return interaction.editReply({ content: '✅ No pending join requests!' });
            }
            
            // Get CSRF token
            const csrfResponse = await fetch('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
            });
            const csrfToken = csrfResponse.headers.get('x-csrf-token');
            
            let accepted = 0;
            let skipped = 0;
            const acceptedNames = [];
            
            for (const request of data.data) {
                const discordId = robloxToDiscord.get(String(request.requester.userId));
                
                if (discordId) {
                    // User is verified, accept them
                    const acceptResponse = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests/users/${request.requester.userId}`, {
                        method: 'POST',
                        headers: {
                            'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                            'X-CSRF-TOKEN': csrfToken,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (acceptResponse.ok) {
                        accepted++;
                        acceptedNames.push(request.requester.username);
                    }
                } else {
                    skipped++;
                }
            }
            
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Group Accept Complete')
                .setColor(0x00ff00)
                .setDescription(`**Accepted:** ${accepted} verified users\n**Skipped:** ${skipped} unverified users`)
                .setTimestamp();
            
            if (acceptedNames.length > 0) {
                resultEmbed.addFields({ name: 'Accepted Users', value: acceptedNames.slice(0, 20).join(', ') + (acceptedNames.length > 20 ? '...' : '') });
            }
            
            await interaction.editReply({ embeds: [resultEmbed] });
            
        } catch (error) {
            console.error('Error accepting all verified:', error.message);
            interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
        return;
    }
    
    // Handle group refresh button
    if (customId === 'group_refresh') {
        const member = interaction.member;
        if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
            return interaction.reply({ content: '❌ You need the staff role to use this.', ephemeral: true });
        }
        
        await interaction.deferUpdate();
        
        try {
            const fetch = (await import('node-fetch')).default;
            
            const response = await fetch(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/join-requests?limit=50`, {
                headers: { 'Cookie': `.ROBLOSECURITY=${ROBLOX_COOKIE}` }
            });
            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return interaction.editReply({ content: '✅ No pending group join requests!', embeds: [], components: [] });
            }
            
            let verifiedList = '';
            let unverifiedList = '';
            
            for (const request of data.data) {
                const discordId = robloxToDiscord.get(String(request.requester.userId));
                const line = `• **${request.requester.username}** (ID: ${request.requester.userId})`;
                
                if (discordId) {
                    verifiedList += `${line} - <@${discordId}> ✅\n`;
                } else {
                    unverifiedList += `${line}\n`;
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Pending Group Join Requests')
                .setColor(0x00d4ff)
                .setDescription(`Total: **${data.data.length}** pending requests`)
                .setTimestamp();
            
            if (verifiedList) {
                embed.addFields({ name: '✅ Verified in Discord (Safe to accept)', value: verifiedList.substring(0, 1024) || 'None' });
            }
            if (unverifiedList) {
                embed.addFields({ name: '❓ Not Verified', value: unverifiedList.substring(0, 1024) || 'None' });
            }
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('group_accept_all_verified')
                        .setLabel('✅ Accept All Verified')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('group_refresh')
                        .setLabel('🔄 Refresh')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({ embeds: [embed], components: [row] });
            
        } catch (error) {
            console.error('Error refreshing group requests:', error.message);
            interaction.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
        return;
    }
    
    // Handle staff Accept/Deny for manual verification
    if (customId.startsWith('manual_verify_accept_') || customId.startsWith('manual_verify_deny_')) {
        const action = customId.startsWith('manual_verify_accept_') ? 'accepted' : 'denied';
        const odId = customId.replace('manual_verify_accept_', '').replace('manual_verify_deny_', '');
        
        console.log(`Manual verification ${action} by ${interaction.user.tag} for user ID: ${odId}`);
        
        const pendingData = pendingManualVerifications.get(odId);
        
        if (!pendingData) {
            await interaction.reply({
                content: '❌ This verification request has expired or was already processed.',
                ephemeral: true
            });
            return;
        }
        
        await interaction.deferUpdate();
        
        try {
            const guild = interaction.guild;
            const member = await guild.members.fetch(odId);
            
            if (action === 'accepted') {
                // Give verified role
                if (VERIFIED_MEMBER_ROLE_ID) {
                    await member.roles.add(VERIFIED_MEMBER_ROLE_ID);
                }
                
                // Send DM to user
                try {
                    const approvedEmbed = new EmbedBuilder()
                        .setTitle('✅ Verification Approved!')
                        .setDescription('Your verification for **Forest Park Hangout** has been approved!\n\nYou now have full access to the server. Enjoy your stay! 🌿')
                        .setColor(0x00ff00)
                        .setFooter({ text: 'Welcome to the community!' })
                        .setTimestamp();
                    
                    await member.send({ embeds: [approvedEmbed] });
                } catch (dmErr) {
                    console.error('Could not DM user about approval:', dmErr.message);
                }
                
                // Update the log message
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x00ff00)
                    .setTitle('✅ Verification Approved')
                    .addFields({ name: '👮 Approved By', value: `<@${interaction.user.id}>`, inline: true });
                
                await interaction.editReply({
                    embeds: [updatedEmbed],
                    components: []
                });
                
                console.log(`✓ Manual verification approved for ${member.user.tag}`);
                
            } else {
                // Denied
                try {
                    const deniedEmbed = new EmbedBuilder()
                        .setTitle('❌ Verification Denied')
                        .setDescription('Your verification for **Forest Park Hangout** has been denied.\n\nIf you believe this is an error, please contact staff.')
                        .setColor(0xff0000)
                        .setTimestamp();
                    
                    await member.send({ embeds: [deniedEmbed] });
                } catch (dmErr) {
                    console.error('Could not DM user about denial:', dmErr.message);
                }
                
                // Update the log message
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xff0000)
                    .setTitle('❌ Verification Denied')
                    .addFields({ name: '👮 Denied By', value: `<@${interaction.user.id}>`, inline: true });
                
                await interaction.editReply({
                    embeds: [updatedEmbed],
                    components: []
                });
                
                console.log(`✗ Manual verification denied for ${member.user.tag}`);
            }
            
            // Remove from pending
            pendingManualVerifications.delete(odId);
            
        } catch (error) {
            console.error('Error processing manual verification:', error);
            await interaction.followUp({
                content: `❌ Error processing verification: ${error.message}`,
                ephemeral: true
            });
        }
        
        return;
    }
    
    // Handle "Verify with Roblox" button click
    if (customId === 'bloxlink_verify_start') {
        console.log(`Verify button clicked by ${interaction.user.tag}`);
        
        // Check if already verified
        if (verifiedUsers.has(interaction.user.id)) {
            const existing = verifiedUsers.get(interaction.user.id);
            await interaction.reply({
                content: `✅ You are already verified as **${existing.robloxUsername}** (${existing.robloxUserId}).\n\nContact staff if you need to change your linked account.`,
                ephemeral: true
            });
            return;
        }
        
        try {
            // Show modal to enter Roblox username
            const modal = new ModalBuilder()
                .setCustomId('bloxlink_verify_modal')
                .setTitle('Roblox Verification');
            
            const usernameInput = new TextInputBuilder()
                .setCustomId('roblox_username')
                .setLabel('Enter your Roblox Username')
                .setPlaceholder('e.g. Wyldieee')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(20);
            
            const actionRow = new ActionRowBuilder().addComponents(usernameInput);
            modal.addComponents(actionRow);
            
            await interaction.showModal(modal);
            console.log(`✓ Modal shown to ${interaction.user.tag}`);
        } catch (modalError) {
            console.error('Error showing modal:', modalError);
            // Try to reply with error message if modal fails
            try {
                await interaction.reply({
                    content: '❌ Something went wrong. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Could not send error reply:', replyError);
            }
        }
        return;
    }
    
    // Handle user confirmation in DM
    if (customId.startsWith('verify_user_confirm_') || customId.startsWith('verify_user_deny_')) {
        const userAction = customId.startsWith('verify_user_confirm_') ? 'confirmed' : 'denied';
        const verificationId = customId.replace('verify_user_confirm_', '').replace('verify_user_deny_', '');
        
        console.log(`Button clicked: ${userAction} for verification ${verificationId}`);
        console.log(`Current pending verifications: ${pendingVerifications.size}`);
        
        // Acknowledge the interaction immediately to prevent timeout
        try {
            await interaction.deferUpdate();
        } catch (deferError) {
            console.log('Could not defer (already handled):', deferError.message);
            return; // Already handled, exit
        }
        
        const verification = pendingVerifications.get(verificationId);
        
        if (!verification) {
            console.log(`Verification ${verificationId} NOT FOUND in pending list`);
            console.log(`Server may have restarted - Render free tier sleeps after inactivity`);
            
            // Update the DM message to show it expired
            try {
                const expiredEmbed = new EmbedBuilder()
                    .setTitle('⏰ Verification Expired')
                    .setDescription('This verification request has expired because the server restarted.\n\n**What to do:**\n1. Go back to Roblox\n2. Use the verification GUI again\n3. A new DM will be sent\n\n*Render free tier sleeps after 15 minutes of inactivity, which clears pending verifications.*')
                    .setColor(0xff9900)
                    .setFooter({ text: 'This is normal - just try again!' });
                
                await interaction.editReply({
                    embeds: [expiredEmbed],
                    components: [] // Remove the buttons
                });
            } catch (editError) {
                // Fall back to followUp if edit fails
                await interaction.followUp({
                    content: '⏰ This verification request has expired. Please go back to Roblox and try again.',
                    ephemeral: true
                });
            }
            return;
        }
        
        console.log(`Found verification: ${JSON.stringify(verification)}`);
        
        // Check if user has the required role in the server
        if (REQUIRED_ROLE_ID) {
            try {
                const guildId = process.env.DISCORD_GUILD_ID;
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(interaction.user.id);
                
                if (!member.roles.cache.has(REQUIRED_ROLE_ID)) {
                    console.log(`User ${interaction.user.tag} does not have required role ${REQUIRED_ROLE_ID}`);
                    verification.status = 'denied';
                    await interaction.editReply({
                        components: [] // Remove buttons
                    });
                    await interaction.followUp({
                        content: '❌ You do not have the required role in the Discord server to verify. Please make sure you have the correct role first.',
                        ephemeral: true
                    });
                    return;
                }
                console.log(`✓ User ${interaction.user.tag} has required role`);
            } catch (roleError) {
                console.error('Error checking user role:', roleError.message);
                // Continue anyway if role check fails
            }
        }
        
        // Check if Roblox display name matches Discord display name
        if (REQUIRE_MATCHING_DISPLAY_NAME) {
            try {
                const guildId = process.env.DISCORD_GUILD_ID;
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(interaction.user.id);
                
                // Get Discord display name (nickname > global name > username)
                const discordDisplayName = member.nickname || interaction.user.globalName || interaction.user.username;
                const robloxDisplayName = verification.displayName || verification.playerName;
                
                console.log(`Comparing names - Discord: "${discordDisplayName}" vs Roblox: "${robloxDisplayName}"`);
                
                // Case-insensitive comparison
                if (discordDisplayName.toLowerCase() !== robloxDisplayName.toLowerCase()) {
                    console.log(`Display name mismatch for ${interaction.user.tag}`);
                    verification.status = 'denied';
                    await interaction.editReply({
                        components: [] // Remove buttons
                    });
                    await interaction.followUp({
                        content: `❌ **Display name mismatch!**\n\nYour Discord display name: **${discordDisplayName}**\nYour Roblox display name: **${robloxDisplayName}**\n\nPlease change your **Roblox display name** to match your Discord display name, then try again.`,
                        ephemeral: true
                    });
                    return;
                }
                console.log(`✓ Display names match: "${discordDisplayName}"`);
            } catch (nameError) {
                console.error('Error checking display name:', nameError.message);
                // Continue anyway if name check fails
            }
        }
        
        if (userAction === 'denied') {
            // User denied - cancel verification
            verification.status = 'denied';
            await interaction.editReply({
                components: [] // Remove buttons
            });
            await interaction.followUp({
                content: '❌ You have denied this verification request. No access will be granted.',
                ephemeral: true
            });
            console.log(`User ${interaction.user.tag} denied their own verification`);
            return;
        }
        
        // User confirmed - auto-approve immediately (no staff approval needed)
        const isAlreadyVerified = verifiedUsers.has(verification.discordId);
        
        // Set to 'approved' so Roblox client shows RoleFrame immediately
        verification.status = 'approved';
        
        // Add to verified users list and remember the link
        verifiedUsers.set(verification.discordId, {
            robloxUsername: verification.playerName,
            robloxUserId: verification.robloxUserId || verification.userId,
            approvedAt: new Date().toISOString(),
            approvedBy: 'Auto-approved (user confirmed)'
        });
        
        // Remember the Roblox → Discord link
        robloxToDiscord.set(String(verification.robloxUserId || verification.userId), verification.discordId);
        
        // Give verified member role
        if (VERIFIED_MEMBER_ROLE_ID) {
            try {
                const guildId = process.env.DISCORD_GUILD_ID;
                const guild = await client.guilds.fetch(guildId);
                const member = await guild.members.fetch(verification.discordId);
                await member.roles.add(VERIFIED_MEMBER_ROLE_ID);
                console.log(`✓ Gave verified member role to Discord ID ${verification.discordId}`);
            } catch (roleError) {
                console.error('Failed to give verified member role:', roleError.message);
            }
        }
        
        await interaction.editReply({
            components: [] // Remove buttons from DM
        });
        
        // Send success message to user
        await interaction.followUp({
            content: '✅ You have been verified! Return to the game - you should now have access.',
            ephemeral: true
        });
        
        console.log(`✓ User ${interaction.user.tag} verified automatically (Discord: ${verification.discordId}, Roblox: ${verification.playerName})`);
        
        // Log to in-game verification log channel
        try {
            const channelId = IN_GAME_VERIFICATION_LOG_CHANNEL_ID;
            if (channelId) {
                const channel = await client.channels.fetch(channelId);
                const embed = new EmbedBuilder()
                    .setTitle('✅ Auto-Verification Complete')
                    .setDescription('A user has been automatically verified')
                    .setColor(0x00ff00)
                    .addFields(
                        { name: '👤 Roblox', value: `${verification.playerName} (${verification.userId})`, inline: true },
                        { name: '💬 Discord', value: `<@${verification.discordId}>`, inline: true }
                    )
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.log('Could not send log to staff channel:', err.message);
        }
        
        return; // Important: prevent fall-through to other handlers
    }
    
    // Handle staff approval/denial
    if (customId.startsWith('verify_approve_') || customId.startsWith('verify_deny_')) {
        const action = customId.startsWith('verify_approve_') ? 'approved' : 'denied';
        const verificationId = customId.replace('verify_approve_', '').replace('verify_deny_', '');
        
        console.log(`Verification ${action} by ${interaction.user.tag} for ID: ${verificationId}`);
        
        // Get verification data
        const verification = pendingVerifications.get(verificationId);
        
        if (!verification) {
            await interaction.reply({
                content: '❌ This verification request has expired or was already processed.',
                ephemeral: true
            });
            return;
        }
        
        if (verification.status !== 'pending') {
            await interaction.reply({
                content: `❌ This verification was already ${verification.status}.`,
                ephemeral: true
            });
            return;
        }
        
        // Update status
        verification.status = action;
        
        // If approved, add to verified users list AND remember the link
        if (action === 'approved') {
            verifiedUsers.set(verification.discordId, {
                robloxUsername: verification.playerName,
                robloxUserId: verification.robloxUserId,
                approvedAt: new Date(),
                approvedBy: interaction.user.tag
            });
            // Remember the Roblox → Discord link
            robloxToDiscord.set(verification.robloxUserId || verification.userId, verification.discordId);
            console.log(`✓ User ${verification.discordId} added to verified list`);
            console.log(`✓ Linked Roblox ${verification.robloxUserId} to Discord ${verification.discordId}`);
        }
        
        // Update the message
        const updatedEmbed = interaction.message.embeds[0];
        updatedEmbed.color = action === 'approved' ? 0x00ff00 : 0xff0000;
        updatedEmbed.title = action === 'approved' ? '✅ Verification Approved' : '❌ Verification Denied';
        
        await interaction.update({
            embeds: [updatedEmbed],
            components: [] // Remove buttons
        });
        
        // Send confirmation
        await interaction.followUp({
            content: `${action === 'approved' ? '✅' : '❌'} Verification ${action} by ${interaction.user}`,
            ephemeral: false
        });
        
        // Send DM to user
        try {
            const discordUser = await client.users.fetch(verification.discordId);
            const resultEmbed = new EmbedBuilder()
                .setTitle(action === 'approved' ? '✅ Verification Approved!' : '❌ Verification Denied')
                .setDescription(action === 'approved' 
                    ? `Your Roblox account **${verification.playerName}** has been verified! You now have access in-game.`
                    : `Your verification request for **${verification.playerName}** was denied by staff.`)
                .setColor(action === 'approved' ? 0x00ff00 : 0xff0000);
            
            await discordUser.send({ embeds: [resultEmbed] });
        } catch (dmError) {
            console.warn('Could not send result DM to user:', dmError.message);
        }
        
        console.log(`✓ Verification ${verificationId} ${action} by ${interaction.user.tag}`);
    }
    
    } catch (error) {
        console.error('Error handling interaction:', error);
        // Try to respond to the user if we haven't already
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred. Please try again.',
                    ephemeral: true
                });
            } else if (interaction.deferred && !interaction.replied) {
                // If we deferred but haven't replied, use followUp
                await interaction.followUp({
                    content: '❌ An error occurred. Please try again.',
                    ephemeral: true
                });
            }
            // If already replied, do nothing - we can't send more
        } catch (replyError) {
            // Ignore - interaction already handled or timed out
            console.log('Could not send error reply (interaction already handled)');
        }
    }
});

// Get verified users endpoint (for Roblox to check)
app.get('/verified-users/:discordId', (req, res) => {
    try {
        const { discordId } = req.params;
        const verifiedUser = verifiedUsers.get(discordId);
        
        if (verifiedUser) {
            res.json({ verified: true, user: verifiedUser });
        } else {
            res.json({ verified: false });
        }
    } catch (error) {
        console.error('Error checking verified user:', error.message);
        res.json({ verified: false, error: error.message });
    }
});

// Check if Roblox user is verified (for game to check by Roblox User ID)
app.get('/check-roblox-verified/:robloxUserId', (req, res) => {
    try {
        const { robloxUserId } = req.params;
        const discordId = robloxToDiscord.get(String(robloxUserId));
        
        if (discordId) {
            const verifiedUser = verifiedUsers.get(discordId);
            if (verifiedUser) {
                res.json({ 
                    verified: true, 
                    robloxUserId: verifiedUser.robloxUserId,
                    robloxUsername: verifiedUser.robloxUsername,
                    discordId: discordId
                });
                return;
            }
        }
        
        res.json({ verified: false });
    } catch (error) {
        console.error('Error checking Roblox verification:', error.message);
        res.json({ verified: false, error: error.message });
    }
});

// Start Express server
app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
});

// Login to Discord
if (!DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is not set! Please add it to your environment variables on Render.');
    console.error('   Go to Render Dashboard -> Your Service -> Environment -> Add DISCORD_BOT_TOKEN');
} else {
    console.log('🔄 Attempting to connect to Discord...');
    console.log(`   Token starts with: ${DISCORD_BOT_TOKEN.substring(0, 10)}...`);
    
    client.login(DISCORD_BOT_TOKEN)
        .then(() => console.log('✅ Successfully connected to Discord!'))
        .catch(err => {
            console.error('❌ Failed to login to Discord:', err.message);
            console.error('   Full error:', err);
            console.error('   Make sure your bot token is valid and not expired.');
            console.error('   You can regenerate it at: https://discord.com/developers/applications');
        });
}

// Export for potential use
module.exports = { app, client, pendingVerifications };
