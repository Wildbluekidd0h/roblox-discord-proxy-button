-- LocalScript: Place this in StarterGui -> ScreenGui
-- This script manages the GUI frame based on Discord role

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer

print("=== Role Checker Client Starting ===")

-- Wait for RemoteFunction to exist
local remoteFunction = ReplicatedStorage:WaitForChild("CheckDiscordRole", 10)
if remoteFunction then
	print("✓ Found RemoteFunction")
else
	warn("✗ RemoteFunction not found!")
end

-- GUI Elements (adjust paths to match your GUI structure)
local screenGui = script.Parent -- The ScreenGui this script is in
print("ScreenGui:", screenGui.Name)

-- List all children for debugging
print("Children in ScreenGui:")
for _, child in pairs(screenGui:GetChildren()) do
	print(" -", child.Name, "(", child.ClassName, ")")
end

-- Try to find frames (with error handling)
local roleFrame = screenGui:FindFirstChild("RoleFrame")
local verificationFrame = screenGui:FindFirstChild("VerificationFrame")
local discordIdBox
local verifyButton

if verificationFrame then
	print("✓ Found VerificationFrame")
	discordIdBox = verificationFrame:FindFirstChild("DiscordIdTextBox")
	verifyButton = verificationFrame:FindFirstChild("VerifyButton")
	
	if discordIdBox then print("✓ Found DiscordIdTextBox") else warn("✗ DiscordIdTextBox not found in VerificationFrame") end
	if verifyButton then print("✓ Found VerifyButton") else warn("✗ VerifyButton not found in VerificationFrame") end
else
	warn("✗ VerificationFrame not found in ScreenGui!")
end

if roleFrame then
	print("✓ Found RoleFrame")
	-- Initially hide the role-locked frame
	roleFrame.Visible = false
else
	warn("✗ RoleFrame not found in ScreenGui!")
end

if verificationFrame then
	verificationFrame.Visible = true
end

-- Function to check role
local function checkAndUpdateRole(discordId)
	if not remoteFunction then
		warn("RemoteFunction not found!")
		return
	end
	
	if not verifyButton then
		warn("VerifyButton not found, cannot update UI")
		return
	end
	
	print("Checking role for Discord ID:", discordId)
	
	-- Show loading state
	verifyButton.Text = "Checking..."
	verifyButton.BackgroundColor3 = Color3.fromRGB(255, 200, 0)
	
	-- Call server to check role
	local hasRole = false
	local success, result = pcall(function()
		return remoteFunction:InvokeServer(discordId)
	end)
	
	print("Server response - Success:", success, "Result:", result)
	
	if success then
		hasRole = result
	else
		warn("Error checking role:", result)
	end
	
	-- Update GUI based on result
	if hasRole then
		-- Player has the required role
		print("✓ ACCESS GRANTED! Player has the required role")
		if roleFrame then
			roleFrame.Visible = true
			print("RoleFrame is now visible")
		else
			warn("Cannot show RoleFrame - it doesn't exist!")
		end
		if verificationFrame then
			verificationFrame.Visible = false
		end
		verifyButton.Text = "Access Granted!"
		verifyButton.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
		
		-- Update Verification Status label if it exists
		local statusLabel = screenGui:FindFirstChild("Verification Status", true)
		if statusLabel and statusLabel:IsA("TextLabel") then
			statusLabel.Text = "Verified"
			statusLabel.TextColor3 = Color3.fromRGB(0, 255, 0)
		end
	else
		-- Player does NOT have the required role
		print("✗ ACCESS DENIED - Required role not found")
		if roleFrame then
			roleFrame.Visible = false
		end
		verifyButton.Text = "Access Denied"
		verifyButton.BackgroundColor3 = Color3.fromRGB(255, 0, 0)
		wait(2)
		verifyButton.Text = "Verify Discord"
		verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
	end
end

-- Verify button click handler
if verifyButton and discordIdBox then
	verifyButton.MouseButton1Click:Connect(function()
		local discordId = discordIdBox.Text
		
		print("Button clicked! Discord ID entered:", discordId)
		
		if discordId == "" then
			verifyButton.Text = "Enter Discord ID!"
			verifyButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
			wait(1)
			verifyButton.Text = "Verify Discord"
			verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
			return
		end
		
		checkAndUpdateRole(discordId)
	end)
	print("✓ Button click handler connected")
else
	warn("Cannot setup button - verifyButton or discordIdBox is missing!")
end

print("=== Role-based GUI controller loaded for:", player.Name, "===")
