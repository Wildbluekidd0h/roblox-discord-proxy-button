-- LocalScript: Place this in StarterGui -> ScreenGui -> TextButton (or your GUI button)
-- This script handles the button click and sends a message to the server

local button = script.Parent -- The GUI button this script is attached to
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Create or get the RemoteEvent
local remoteEvent = ReplicatedStorage:FindFirstChild("SendDiscordMessage")
if not remoteEvent then
	warn("RemoteEvent 'SendDiscordMessage' not found in ReplicatedStorage!")
end

-- Button click handler
button.MouseButton1Click:Connect(function()
	local player = game.Players.LocalPlayer
	
	-- Send the request to the server
	if remoteEvent then
		print("Button clicked! Sending message to server...")
		remoteEvent:FireServer({
			playerName = player.Name,
			userId = player.UserId,
			timestamp = os.time()
		})
		
		-- Optional: Give visual feedback to the player
		button.Text = "Sent!"
		wait(1)
		button.Text = "Click Me"
	end
end)
