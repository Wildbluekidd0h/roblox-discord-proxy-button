-- ServerScript: Place this in ServerScriptService
-- This script checks if a player has a specific Discord role via your API

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

-- Configuration
local API_URL = "https://roblox-discord-proxy-button.onrender.com/check-role"
local WEBHOOK_URL = "https://roblox-discord-proxy-button.onrender.com/verification-log"
local REQUIRED_ROLE_ID = "1445626315125555210"

-- Create RemoteEvent if it doesn't exist
local remoteEvent = ReplicatedStorage:FindFirstChild("RoleCheckResponse")
if not remoteEvent then
	remoteEvent = Instance.new("RemoteEvent")
	remoteEvent.Name = "RoleCheckResponse"
	remoteEvent.Parent = ReplicatedStorage
	print("Created RemoteEvent: RoleCheckResponse")
end

-- Create RemoteFunction for role checking
local remoteFunction = ReplicatedStorage:FindFirstChild("CheckDiscordRole")
if not remoteFunction then
	remoteFunction = Instance.new("RemoteFunction")
	remoteFunction.Name = "CheckDiscordRole"
	remoteFunction.Parent = ReplicatedStorage
	print("Created RemoteFunction: CheckDiscordRole")
end

-- Function to check if player has the required role
local function checkPlayerRole(player, discordId)
	print("=== Checking role for player:", player.Name, "===")
	print("Discord ID:", discordId)
	print("Required Role ID:", REQUIRED_ROLE_ID)
	print("API URL:", API_URL)
	
	local success, result = pcall(function()
		local requestData = {
			discordId = discordId,
			requiredRoleId = REQUIRED_ROLE_ID
		}
		
		local jsonData = HttpService:JSONEncode(requestData)
		print("Sending request data:", jsonData)
		
		local response = HttpService:PostAsync(
			API_URL,
			jsonData,
			Enum.HttpContentType.ApplicationJson,
			false
		)
		
		print("Raw API response:", response)
		
		local decoded = HttpService:JSONDecode(response)
		return decoded
	end)
	
	if success then
		print("API call successful!")
		print("Full result:", game:GetService("HttpService"):JSONEncode(result))
		print("Has role:", result.hasRole)
		return result.hasRole or false
	else
		warn("Failed to check role for", player.Name)
		warn("Error:", result)
		return false
	end
end

-- Function to log verification to Discord
local function logVerification(player, discordId, hasRole)
	spawn(function()
		local success, err = pcall(function()
			local logData = {
				playerName = player.Name,
				userId = player.UserId,
				displayName = player.DisplayName,
				accountAge = player.AccountAge,
				discordId = discordId,
				hasRole = hasRole,
				timestamp = os.date("%Y-%m-%d %H:%M:%S")
			}
			
			local jsonData = HttpService:JSONEncode(logData)
			print("Logging verification to Discord:", jsonData)
			
			HttpService:PostAsync(
				WEBHOOK_URL,
				jsonData,
				Enum.HttpContentType.ApplicationJson,
				false
			)
			
			print("✓ Verification logged to Discord")
		end)
		
		if not success then
			warn("Failed to log verification:", err)
		end
	end)
end

-- Handle role check requests from clients
remoteFunction.OnServerInvoke = function(player, discordId)
	if not discordId or discordId == "" then
		warn("No Discord ID provided by player:", player.Name)
		return false
	end
	
	local hasRole = checkPlayerRole(player, discordId)
	
	-- Log the verification attempt to Discord
	logVerification(player, discordId, hasRole)
	
	return hasRole
end

-- Auto-check when player joins (optional)
Players.PlayerAdded:Connect(function(player)
	-- Wait a bit for the player to load
	wait(2)
	
	-- You can implement automatic role checking here if you have a way to get their Discord ID
	-- For now, players will need to provide their Discord ID manually
	print("Player joined:", player.Name, "- Waiting for Discord ID verification")
end)

print("Discord role checker initialized!")
