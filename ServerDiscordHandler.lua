-- ServerScript: Place this in ServerScriptService
-- This script receives the button click event and sends data to your external server

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Configuration
local WEBHOOK_PROXY_URL = "https://discord.com/api/webhooks/1445642143237673062/qWYZd0_u21JcCdNVKXanh_OOFvTTObsiCkGGYwmQVEKrBEIOj5fgJDcAfKr1PbqzulbF" -- Replace with your proxy server URL
-- Example: "https://your-app.herokuapp.com/discord-webhook"

-- Create RemoteEvent if it doesn't exist
local remoteEvent = ReplicatedStorage:FindFirstChild("SendDiscordMessage")
if not remoteEvent then
	remoteEvent = Instance.new("RemoteEvent")
	remoteEvent.Name = "SendDiscordMessage"
	remoteEvent.Parent = ReplicatedStorage
	print("Created RemoteEvent: SendDiscordMessage")
end

-- Function to send message to Discord via proxy
local function sendToDiscord(playerData)
	local success, result = pcall(function()
		local data = {
			content = string.format("🎮 **Player Action Detected!**\n**Player:** %s (ID: %d)\n**Time:** %s", 
				playerData.playerName, 
				playerData.userId,
				os.date("%Y-%m-%d %H:%M:%S", playerData.timestamp))
		}
		
		local jsonData = HttpService:JSONEncode(data)
		
		local response = HttpService:PostAsync(
			WEBHOOK_PROXY_URL,
			jsonData,
			Enum.HttpContentType.ApplicationJson,
			false
		)
		
		return response
	end)
	
	if success then
		print("Successfully sent message to Discord for player:", playerData.playerName)
	else
		warn("Failed to send message to Discord:", result)
	end
end

-- Listen for button clicks from clients
remoteEvent.OnServerEvent:Connect(function(player, data)
	print("Received request from:", player.Name)
	
	-- Validate the request is from the correct player
	if data.playerName == player.Name and data.userId == player.UserId then
		sendToDiscord(data)
	else
		warn("Invalid request from player:", player.Name)
	end
end)

print("Discord webhook handler initialized!")
