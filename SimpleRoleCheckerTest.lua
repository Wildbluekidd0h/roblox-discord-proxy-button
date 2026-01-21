-- SIMPLE TEST VERSION - LocalScript in StarterGui
-- This creates its own GUI for testing

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer

print("=== Simple Role Checker Test Started ===")

-- Wait for RemoteFunction
local remoteFunction = ReplicatedStorage:WaitForChild("CheckDiscordRole", 10)
if not remoteFunction then
	warn("RemoteFunction not found!")
	return
end

-- Create a simple test GUI
local screenGui = Instance.new("ScreenGui")
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Verification Frame
local verificationFrame = Instance.new("Frame")
verificationFrame.Name = "VerificationFrame"
verificationFrame.Size = UDim2.new(0, 300, 0, 200)
verificationFrame.Position = UDim2.new(0.5, -150, 0.5, -100)
verificationFrame.BackgroundColor3 = Color3.fromRGB(40, 40, 40)
verificationFrame.Parent = screenGui

-- Title
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 40)
title.BackgroundTransparency = 1
title.Text = "Discord Role Verification"
title.TextColor3 = Color3.new(1, 1, 1)
title.TextSize = 18
title.Font = Enum.Font.SourceSansBold
title.Parent = verificationFrame

-- TextBox for Discord ID
local textBox = Instance.new("TextBox")
textBox.Size = UDim2.new(0.9, 0, 0, 40)
textBox.Position = UDim2.new(0.05, 0, 0, 60)
textBox.PlaceholderText = "Enter your Discord User ID"
textBox.Text = ""
textBox.TextColor3 = Color3.new(1, 1, 1)
textBox.BackgroundColor3 = Color3.fromRGB(60, 60, 60)
textBox.TextSize = 16
textBox.Parent = verificationFrame

-- Verify Button
local verifyButton = Instance.new("TextButton")
verifyButton.Size = UDim2.new(0.9, 0, 0, 50)
verifyButton.Position = UDim2.new(0.05, 0, 0, 120)
verifyButton.Text = "Verify Discord Role"
verifyButton.TextColor3 = Color3.new(1, 1, 1)
verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
verifyButton.TextSize = 18
verifyButton.Font = Enum.Font.SourceSansBold
verifyButton.Parent = verificationFrame

-- Role-locked Frame (what shows when verified)
local roleFrame = Instance.new("Frame")
roleFrame.Name = "RoleFrame"
roleFrame.Size = UDim2.new(0, 400, 0, 300)
roleFrame.Position = UDim2.new(0.5, -200, 0.5, -150)
roleFrame.BackgroundColor3 = Color3.fromRGB(0, 200, 0)
roleFrame.Visible = false
roleFrame.Parent = screenGui

-- Success message
local successText = Instance.new("TextLabel")
successText.Size = UDim2.new(1, 0, 1, 0)
successText.BackgroundTransparency = 1
successText.Text = "✓ ACCESS GRANTED!\n\nYou have the required Discord role!"
successText.TextColor3 = Color3.new(1, 1, 1)
successText.TextSize = 24
successText.Font = Enum.Font.SourceSansBold
successText.Parent = roleFrame

print("✓ GUI Created")

-- Button click handler
verifyButton.MouseButton1Click:Connect(function()
	local discordId = textBox.Text
	
	print("Button clicked! Discord ID:", discordId)
	
	if discordId == "" then
		verifyButton.Text = "Enter Discord ID!"
		verifyButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
		wait(1)
		verifyButton.Text = "Verify Discord Role"
		verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
		return
	end
	
	-- Show loading
	verifyButton.Text = "Checking..."
	verifyButton.BackgroundColor3 = Color3.fromRGB(255, 200, 0)
	
	-- Call server
	local success, hasRole = pcall(function()
		return remoteFunction:InvokeServer(discordId)
	end)
	
	print("Server response - Success:", success, "Has Role:", hasRole)
	
	if success and hasRole then
		-- Access granted!
		print("✓ ACCESS GRANTED!")
		roleFrame.Visible = true
		verificationFrame.Visible = false
		
		-- Update Verification Status label if it exists
		local statusLabel = player.PlayerGui:FindFirstChild("Verification Status", true)
		if statusLabel and statusLabel:IsA("TextLabel") then
			statusLabel.Text = "Verified"
			statusLabel.TextColor3 = Color3.fromRGB(0, 255, 0)
		end
	else
		-- Access denied
		print("✗ ACCESS DENIED")
		verifyButton.Text = "Access Denied - No Role"
		verifyButton.BackgroundColor3 = Color3.fromRGB(255, 0, 0)
		wait(2)
		verifyButton.Text = "Verify Discord Role"
		verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
	end
end)

print("=== Role Checker Ready ===")
