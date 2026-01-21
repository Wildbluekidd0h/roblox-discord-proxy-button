# Deploying to Render.com - Step by Step Guide

## 📋 Prerequisites
- A GitHub account (free)
- A Render.com account (free)
- Your Discord webhook URL (you already have this!)

## 🚀 Step-by-Step Deployment

### Step 1: Create a GitHub Repository

1. Go to https://github.com and sign in
2. Click the **+** icon in the top right → **New repository**
3. Name it: `roblox-discord-proxy`
4. Set it to **Public** (required for free Render.com tier)
5. Click **Create repository**

### Step 2: Upload Your Files to GitHub

**Option A: Using GitHub Web Interface (Easiest)**

1. On your new repository page, click **uploading an existing file**
2. Drag and drop these files from your folder:
   - `proxy-server.js`
   - `package.json`
   - `.gitignore`
3. Click **Commit changes**

**Option B: Using Git Command Line**

Open PowerShell in your project folder and run:
```powershell
git init
git add proxy-server.js package.json .gitignore
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/roblox-discord-proxy.git
git push -u origin main
```
(Replace YOUR_USERNAME with your GitHub username)

### Step 3: Deploy to Render.com

1. Go to https://render.com and sign up/sign in
2. Click **New +** in the top right
3. Select **Web Service**
4. Click **Connect account** next to GitHub (if not already connected)
5. Find and select your `roblox-discord-proxy` repository
6. Click **Connect**

### Step 4: Configure the Web Service

Fill in these settings:

- **Name**: `roblox-discord-proxy` (or any name you like)
- **Region**: Choose the closest to you
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: `Free`

### Step 5: Add Environment Variable

1. Scroll down to **Environment Variables**
2. Click **Add Environment Variable**
3. Set:
   - **Key**: `DISCORD_WEBHOOK_URL`
   - **Value**: `https://discord.com/api/webhooks/1445642143237673062/qWYZd0_u21JcCdNVKXanh_OOFvTTObsiCkGGYwmQVEKrBEIOj5fgJDcAfKr1PbqzulbF`

### Step 6: Deploy!

1. Click **Create Web Service** at the bottom
2. Wait 2-5 minutes for deployment (you'll see logs scrolling)
3. When you see "Discord Webhook Proxy Server running on port..." → Success! ✅

### Step 7: Copy Your Proxy URL

1. At the top of the page, you'll see a URL like:
   ```
   https://roblox-discord-proxy-xxxx.onrender.com
   ```
2. **Copy this URL**
3. Add `/discord-webhook` to the end, so it looks like:
   ```
   https://roblox-discord-proxy-xxxx.onrender.com/discord-webhook
   ```

### Step 8: Update Your Roblox Script

1. Open `ServerDiscordHandler.lua` in Roblox Studio
2. Replace line 8 with your Render URL:
   ```lua
   local WEBHOOK_PROXY_URL = "https://roblox-discord-proxy-xxxx.onrender.com/discord-webhook"
   ```

### Step 9: Test Your Setup

**Test the proxy server first:**
1. Open your Render dashboard
2. Click on your service
3. Click **Shell** tab on the left
4. You should see "Discord Webhook Proxy Server running"

**Test from a web browser:**
Visit: `https://your-app.onrender.com/` (without /discord-webhook)
You should see: `{"status":"ok","message":"Discord Webhook Proxy Server is running"}`

**Test from Roblox:**
1. Open Roblox Studio
2. Make sure HTTP requests are enabled (Game Settings → Security)
3. Run your game and click the button
4. Check Discord for the message!

## 🔧 Troubleshooting

### "Service failed to start"
- Check the logs in Render dashboard
- Make sure `package.json` and `proxy-server.js` are uploaded
- Verify the Build and Start commands are correct

### "Cannot POST /discord-webhook"
- Make sure you added the environment variable `DISCORD_WEBHOOK_URL`
- Restart the service after adding the variable

### "Message not appearing in Discord"
- Check Render logs for errors
- Verify your Discord webhook URL is correct
- Make sure the webhook wasn't deleted in Discord

### Free Tier Limitations
- Render free tier services "spin down" after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- Consider keeping it active or upgrade to paid tier for production games

## 💡 Tips

**Keep Service Active:**
Add this cron job on Render (in your service settings):
- Go to service settings
- Add a Cron Job
- Schedule: `*/14 * * * *` (every 14 minutes)
- Command: `curl https://your-app.onrender.com/`

**View Logs:**
- Click on your service in Render
- Click **Logs** tab to see real-time activity
- Useful for debugging issues

**Update Code:**
- Just push changes to your GitHub repository
- Render will automatically redeploy

**Security:**
- Never share your Discord webhook URL publicly
- Keep your GitHub repository private for production (requires paid tier)
- Consider adding authentication to your proxy server

## 📞 Need Help?

If you run into issues:
1. Check the Render logs for error messages
2. Verify all files are uploaded to GitHub
3. Make sure environment variable is set correctly
4. Test the proxy URL in a web browser first

Your webhook URL is already configured, so once the proxy is deployed, everything should work! 🎉
