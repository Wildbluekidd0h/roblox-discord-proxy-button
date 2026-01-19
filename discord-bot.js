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

// Role to give to new members when they join the server
const AUTO_ROLE_ID = '1462613689168302183';

// Additional role to give when verified (e.g., member role)
const VERIFIED_MEMBER_ROLE_ID = '1462613966453739743';

// Manual verification channels
const VERIFICATION_LOG_CHANNEL_ID = '1386815060428722196';
const HOW_TO_VERIFY_CHANNEL_ID = '1462633444407513118';

// Store pending manual verifications
const pendingManualVerifications = new Map();

// DM Verification Questions
const VERIFICATION_QUESTIONS = [
    { key: 'birthdate', question: '**Question 1/15:** What is your birthdate? (MM/DD/YYYY or DD/MM/YYYY)\n*We use this to confirm your age. You must be 13 or older to join.*' },
    { key: 'nextBirthdayAge', question: '**Question 2/15:** How old will you be on your next birthday?' },
    { key: 'voreServers', question: '**Question 3/15:** List any vore-related servers you are currently in.\n*Include server names or links. If none, explain why you joined this server.*' },
    { key: 'whyJoin', question: '**Question 4/15:** Why did you decide to join Forest Park Hangout?' },
    { key: 'interests', question: '**Question 5/15:** What about this server interests you?' },
    { key: 'rulesQuote', question: '**Question 6/15:** Quote 3 rules from our server and explain what they mean in your own words.\n*This shows you\'ve read and understand the rules.*' },
    { key: 'howFound', question: '**Question 7/15:** How did you find this server?\n*Be specific: invite from a friend, Discord search, another server, etc.*' },
    { key: 'timezone', question: '**Question 8/15:** What timezone are you in?\n*e.g. EST, PST, GMT, UTC+2*' },
    { key: 'bannedBefore', question: '**Question 9/15:** Have you been banned from any Discord servers before?\n*If yes, explain which servers and why. If no, just say No.*' },
    { key: 'altAccounts', question: '**Question 10/15:** Do you have any alt Discord accounts?\n*If yes, list them. If no, just say No.*' },
    { key: 'voreMeaning', question: '**Question 11/15:** (Optional) What does vore mean to you?\n*You can skip this by typing "skip"*' },
    { key: 'robloxUsername', question: '**Question 12/15:** What is your Roblox username?\n*Your actual username, not display name. We will verify you own this account.*' },
    { key: 'playedBefore', question: '**Question 13/15:** Have you played Forest Park Hangout on Roblox before?\n*If yes, what features or areas have you explored?*' },
    { key: 'comfortableRules', question: '**Question 14/15:** Are you comfortable following all server rules?\n*Explain how you make sure to follow community rules.*' },
    { key: 'experienceHoping', question: '**Question 15/15:** What kind of experience are you hoping to have here?\n*e.g. roleplay, social hangout, exploration, events...*' }
];

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
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
                // Search by username using query (much faster than fetching all members)
                const searchResults = await guild.members.search({ query: discordId, limit: 10 });
                
                // Find exact match
                const member = searchResults.find(m => 
                    m.user.username.toLowerCase() === discordId.toLowerCase() ||
                    m.user.tag.toLowerCase() === discordId.toLowerCase() ||
                    (m.user.globalName && m.user.globalName.toLowerCase() === discordId.toLowerCase())
                );
                
                if (member) {
                    discordUser = member.user;
                    actualDiscordId = member.user.id;
                    console.log(`✓ Found user by username: ${discordUser.tag} (ID: ${actualDiscordId})`);
                } else {
                    console.warn(`User not found with username: ${discordId}`);
                    return res.json({ success: false, message: 'Discord user not found. Make sure you entered your username correctly and that you are in the server.' });
                }
            } else {
                // It's a numeric ID, fetch directly
                discordUser = await client.users.fetch(discordId);
                actualDiscordId = discordId;
            }
        } catch (fetchError) {
            console.error('Error finding Discord user:', fetchError.message);
            return res.json({ success: false, message: 'Discord user not found. Make sure you entered your username correctly.' });
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

// Discord bot ready event
client.once('ready', async () => {
    console.log(`✓ Discord Bot logged in as ${client.user.tag}`);
    console.log(`✓ Bot is in ${client.guilds.cache.size} server(s)`);
    
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
});

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
    
    // Send DM with verification instructions
    try {
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🌲 Welcome to Forest Park Hangout - Manual Verification Required')
            .setDescription('To keep our community safe and friendly, all visitors must complete verification before accessing the full server.\n\n**Please answer all the following questions honestly and completely.**')
            .setColor(0x00d4ff)
            .addFields(
                { name: '📋 How to Verify', value: `Please go to <#${HOW_TO_VERIFY_CHANNEL_ID}> and click the **"Start Verification"** button to begin answering the verification questions.` },
                { name: '🔒 Privacy', value: 'Only staff can see your answers — your privacy is respected.' },
                { name: '⚠️ Note', value: 'If your answers don\'t match or you appear underage, your verification will be denied.' }
            )
            .setFooter({ text: 'Thanks for helping us keep Forest Park Hangout safe and welcoming! 🌿' })
            .setTimestamp();
        
        await member.send({ embeds: [welcomeEmbed] });
        console.log(`✓ Sent welcome DM to ${member.user.tag}`);
    } catch (dmError) {
        console.error(`Failed to send welcome DM to ${member.user.tag}:`, dmError.message);
    }
});

// Track processed messages to prevent duplicates
const processedMessages = new Set();

// Handle DM messages for verification
client.on('messageCreate', async (message) => {
    // Ignore bot messages and non-DM messages
    if (message.author.bot) return;
    if (message.guild) return; // Only handle DMs
    
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
            .setTitle('🌲 Welcome to Forest Park Hangout – Manual Verification Required')
            .setDescription('To keep our community safe and friendly, all visitors must complete verification before accessing the full server.\n\n**🛡️ Please answer all the following questions honestly and completely.**')
            .setColor(0x87CEEB)
            .addFields(
                { name: '🔐 Part 1 - Identity & Age Verification:', value: 
                    '1. What is your birthdate? (MM/DD/YYYY)\n' +
                    '2. How old will you be on your next birthday?\n' +
                    '3. List any vore-related servers you are currently in\n' +
                    '4. Why did you decide to join Forest Park Hangout?\n' +
                    '5. Quote 3 rules & explain them in your own words'
                },
                { name: '🔐 Part 2 - About You:', value: 
                    '6. How did you find this server?\n' +
                    '7. What timezone are you in?\n' +
                    '8. Have you been banned from any Discord servers?\n' +
                    '9. Do you have any alt Discord accounts?\n' +
                    '10. (Optional) What does vore mean to you?'
                },
                { name: '🔐 Part 3 - Roblox & Final Questions:', value: 
                    '11. What is your Roblox username?\n' +
                    '12. Have you played Forest Park Hangout before?\n' +
                    '13. Are you comfortable following all server rules?\n' +
                    '14. What experience are you hoping to have?\n' +
                    '15. Anything else you want staff to know?'
                },
                { name: '🔒 Privacy', value: 'Only staff can see your answers — your privacy is respected.' },
                { name: '🚨 Note', value: 'If your answers don\'t match or you appear underage, your verification will be denied.\n\nIf you need help, ping <@&1386816989137211575>.' }
            )
            .setFooter({ text: 'Thanks for helping us keep Forest Park Hangout safe and welcoming! 🌿' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start_manual_verification')
                    .setLabel('📝 Start Verification')
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
        
        // Log to staff channel
        try {
            const logChannel = await client.channels.fetch(process.env.DISCORD_VERIFICATION_CHANNEL_ID);
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
        
        // Start DM verification
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
            
            await interaction.reply({
                content: '✅ **Verification started!** Check your DMs to answer the verification questions.',
                ephemeral: true
            });
            
        } catch (dmError) {
            console.error(`Could not DM ${interaction.user.tag}:`, dmError.message);
            pendingManualVerifications.delete(interaction.user.id);
            await interaction.reply({
                content: '❌ **Could not send you a DM!** Please make sure your DMs are open for this server, then try again.\n\n**How to enable DMs:**\n1. Right-click the server icon\n2. Click "Privacy Settings"\n3. Enable "Direct Messages"',
                ephemeral: true
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
        await interaction.deferUpdate();
        
        const verification = pendingVerifications.get(verificationId);
        
        if (!verification) {
            console.log(`Verification ${verificationId} NOT FOUND in pending list`);
            console.log(`This usually means the server restarted (Render free tier sleeps after inactivity)`);
            await interaction.followUp({
                content: '❌ This verification request has expired. This can happen if the server restarted. Please go back to the game and try again.',
                ephemeral: true
            });
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
        
        // Optionally log to staff channel (just for info, no action needed)
        try {
            const channelId = process.env.DISCORD_VERIFICATION_CHANNEL_ID;
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
            }
        } catch (replyError) {
            console.error('Could not send error reply:', replyError);
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
client.login(DISCORD_BOT_TOKEN)
    .then(() => console.log('Connecting to Discord...'))
    .catch(err => console.error('Failed to login to Discord:', err));

// Export for potential use
module.exports = { app, client, pendingVerifications };
