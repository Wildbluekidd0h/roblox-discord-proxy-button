# Discord Role Reader for Roblox

This system checks if a player has a specific Discord role and shows/hides a GUI frame in Roblox based on that.

## 📁 Files Overview

1. **GuiButtonHandler.lua** - LocalScript for the GUI button (Client-side)
2. **ServerDiscordHandler.lua** - ServerScript to handle requests (Server-side)
3. **proxy-server.js** - Node.js proxy server to forward messages to Discord
4. **package.json** - Node.js dependencies

## 🚀 Setup Instructions

### Part 1: Discord Webhook Setup

1. Go to your Discord server
2. Open Server Settings → Integrations → Webhooks
3. Click "New Webhook"
4. Name it (e.g., "Roblox Game Bot")
5. Select the channel where messages should appear
6. Copy the Webhook URL
7. Save the webhook

### Part 2: Deploy the Proxy Server

**Why do we need a proxy?** Roblox cannot directly call Discord webhooks due to CORS restrictions, so we need a middle server.

#### Option A: Deploy to Heroku (Free/Easy)

1. Create a Heroku account at https://heroku.com
2. Install Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
3. Open terminal in this folder and run:
   ```bash
   heroku login
   heroku create your-app-name
   heroku config:set DISCORD_WEBHOOK_URL="YOUR_DISCORD_WEBHOOK_URL"
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```
4. Your proxy server URL will be: `https://your-app-name.herokuapp.com/discord-webhook`

#### Option B: Deploy to Render (Free/Easy)

1. Create account at https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repo or upload these files
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variable: `DISCORD_WEBHOOK_URL` = your webhook URL
7. Deploy and copy the provided URL

#### Option C: Run Locally (Testing Only)

1. Install Node.js from https://nodejs.org
2. Open terminal in this folder
3. Run: `npm install`
4. Edit `proxy-server.js` and add your Discord webhook URL
5. Run: `npm start`
6. For Roblox to access it, use a tunneling service like ngrok:
   - Install ngrok: https://ngrok.com
   - Run: `ngrok http 3000`
   - Use the provided HTTPS URL

### Part 3: Configure Roblox Scripts

1. Open `ServerDiscordHandler.lua`
2. Replace `YOUR_PROXY_SERVER_URL_HERE` with your proxy server URL
   - Example: `https://your-app.herokuapp.com/discord-webhook`

### Part 4: Add Scripts to Roblox Studio

1. **Create the GUI:**
   - Open Roblox Studio
   - In Explorer, go to StarterGui
   - Insert a ScreenGui
   - Inside ScreenGui, insert a TextButton
   - Name it something like "DiscordButton"
   - Customize the button text and appearance

2. **Add the LocalScript:**
   - Copy the contents of `GuiButtonHandler.lua`
   - Inside the TextButton, insert a LocalScript
   - Paste the code
   - The script will automatically find the RemoteEvent

3. **Add the ServerScript:**
   - Copy the contents of `ServerDiscordHandler.lua`
   - Go to ServerScriptService
   - Insert a Script (not LocalScript!)
   - Paste the code
   - Make sure you updated the WEBHOOK_PROXY_URL

4. **Enable HTTP Requests:**
   - In Roblox Studio, go to Home → Game Settings
   - Click Security
   - Enable "Allow HTTP Requests"
   - Click Save

### Part 5: Test It!

1. Click "Play" in Roblox Studio
2. Click the GUI button you created
3. Check your Discord channel for the message!

## 🔧 Customization

### Change the Discord Message Format

Edit `ServerDiscordHandler.lua`, find this section:
```lua
local data = {
    content = string.format("🎮 **Player Action Detected!**\n**Player:** %s (ID: %d)\n**Time:** %s", 
        playerData.playerName, 
        playerData.userId,
        os.date("%Y-%m-%d %H:%M:%S", playerData.timestamp))
}
```

### Add Rich Embeds

In `proxy-server.js`, you can send rich embeds instead of simple text:
```javascript
await axios.post(DISCORD_WEBHOOK_URL, {
    embeds: [{
        title: "Player Action",
        description: req.body.content,
        color: 0x00ff00,
        timestamp: new Date()
    }]
});
```

### Add Cooldowns

To prevent spam, add a cooldown in `ServerDiscordHandler.lua`:
```lua
local cooldowns = {}
local COOLDOWN_TIME = 5 -- seconds

remoteEvent.OnServerEvent:Connect(function(player, data)
    local userId = player.UserId
    local currentTime = os.time()
    
    if cooldowns[userId] and (currentTime - cooldowns[userId]) < COOLDOWN_TIME then
        print("Player on cooldown:", player.Name)
        return
    end
    
    cooldowns[userId] = currentTime
    sendToDiscord(data)
end)
```

## 🐛 Troubleshooting

**"HTTP requests are not enabled"**
- Enable HTTP requests in Game Settings → Security

**"Failed to send message to Discord"**
- Check that your proxy server is running
- Verify the proxy URL is correct in ServerDiscordHandler.lua
- Check the proxy server logs for errors

**"RemoteEvent not found"**
- Make sure ServerDiscordHandler.lua runs before the LocalScript
- Check that the RemoteEvent is created in ReplicatedStorage

**Button doesn't respond**
- Make sure the LocalScript is inside the TextButton
- Check the Output window in Roblox Studio for errors

## 📝 Notes

- Keep your Discord webhook URL secret!
- The proxy server is necessary because Roblox blocks direct Discord webhook calls
- Free hosting services may have rate limits
- Test thoroughly before publishing your game

## 🎮 Next Steps

- Add different buttons for different message types
- Track game statistics and send daily reports
- Add player achievements that post to Discord
- Create admin commands that notify Discord

Happy coding! 🚀
