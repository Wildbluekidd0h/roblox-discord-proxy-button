-- LocalScript: Manual Verification Client
-- Place this in StarterGui

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

print("=== Manual Verification Client Starting ===")

-- Wait for RemoteFunctions to exist
local remoteFunction = ReplicatedStorage:WaitForChild("RequestManualVerification", 10)
local contactStaffRemote = ReplicatedStorage:WaitForChild("ContactStaff", 10)
local verificationApprovedEvent = ReplicatedStorage:WaitForChild("VerificationApproved", 10)
local checkVerifiedRemote = ReplicatedStorage:WaitForChild("CheckVerified", 10)

if not remoteFunction then
    warn("RequestManualVerification RemoteFunction not found!")
    return
end

print("✓ RequestManualVerification RemoteFunction found")

-- CHECK SERVER-SIDE IF PLAYER IS ALREADY VERIFIED (prevents bypasses!)
local function checkIfAlreadyVerified()
    if checkVerifiedRemote then
        local success, isVerified = pcall(function()
            return checkVerifiedRemote:InvokeServer()
        end)
        if success and isVerified then
            return true
        end
    end
    return false
end

-- If already verified, show RoleFrame immediately and skip verification
print("Checking if player is already verified...")
if checkIfAlreadyVerified() then
    print("✓ Player is already verified! Skipping verification screen.")
    wait(1) -- Wait for GUI to load
    local roleFrame = playerGui:FindFirstChild("RoleFrame", true)
    local verificationFrameEarly = playerGui:FindFirstChild("VerificationFrame", true)
    
    if roleFrame then
        roleFrame.Visible = true
        print("✓ RoleFrame shown (already verified)")
    end
    if verificationFrameEarly then
        verificationFrameEarly.Visible = false
        print("✓ VerificationFrame hidden (already verified)")
    end
    return -- Exit the script, no need for verification
end
print("Player not yet verified, showing verification screen...")

-- Function to recursively find VerificationFrame
local function findVerificationFrame()
    for i = 1, 30 do
        local verificationFrame = playerGui:FindFirstChild("VerificationFrame", true) -- true for recursive search
        if verificationFrame then
            return verificationFrame
        end
        wait(0.5)
    end
    return nil
end

-- Find your VerificationFrame (search recursively with timeout)
print("Searching for VerificationFrame...")
local verificationFrame = findVerificationFrame()

if not verificationFrame then
    warn("VerificationFrame not found after 15 seconds!")
    return
end

print("✓ VerificationFrame found:", verificationFrame)

-- Find TextBox and Button within VerificationFrame
local discordIdBox = verificationFrame:FindFirstChildOfClass("TextBox")
local verifyButton = verificationFrame:FindFirstChildOfClass("TextButton")

-- Find or create Contact Staff button
local contactButton = verificationFrame:FindFirstChild("ContactStaffButton")
if not contactButton then
    -- Look for any button with "contact" or "help" in the name
    for _, child in pairs(verificationFrame:GetChildren()) do
        if child:IsA("TextButton") and child ~= verifyButton then
            local name = child.Name:lower()
            if name:find("contact") or name:find("help") or name:find("staff") then
                contactButton = child
                break
            end
        end
    end
end

if not discordIdBox then
    warn("No TextBox found in VerificationFrame!")
    return
end

if not verifyButton then
    warn("No TextButton found in VerificationFrame!")
    return
end

print("✓ TextBox found:", discordIdBox.Name)
print("✓ TextButton found:", verifyButton.Name)
if contactButton then
    print("✓ Contact Staff button found:", contactButton.Name)
end

-- Find RoleFrame (search recursively)
local roleFrame = playerGui:FindFirstChild("RoleFrame", true)
print("RoleFrame:", roleFrame and "Found" or "Not found")

-- Find HelpFrame (search recursively in PlayerGui)
local helpFrame = playerGui:FindFirstChild("HelpFrame", true)
if helpFrame then
    helpFrame.Visible = false -- Start hidden
    print("✓ HelpFrame found:", helpFrame:GetFullName())
else
    -- Try to find it in the same ScreenGui as VerificationFrame
    local screenGui = verificationFrame.Parent
    if screenGui then
        helpFrame = screenGui:FindFirstChild("HelpFrame", true)
        if helpFrame then
            helpFrame.Visible = false
            print("✓ HelpFrame found in ScreenGui:", helpFrame:GetFullName())
        else
            warn("✗ HelpFrame not found! Create a Frame named 'HelpFrame' in your ScreenGui")
        end
    end
end

-- Check if player has linked Discord (auto-fill)
local function checkLinkedDiscord()
    local success, result = pcall(function()
        return remoteFunction:InvokeServer("__CHECK_LINKED__")
    end)
    
    if success and result and result.linked then
        discordIdBox.Text = result.discordId or ""
        print("✓ Auto-filled linked Discord:", result.discordId)
        return true
    end
    return false
end

-- Try to auto-fill Discord
checkLinkedDiscord()

-- Make sure button properties are set correctly
verifyButton.Active = true
verifyButton.Selectable = true

print("Button Active:", verifyButton.Active)
print("Button Selectable:", verifyButton.Selectable)

-- Find send button inside HelpFrame (if exists)
local sendHelpButton = helpFrame and helpFrame:FindFirstChild("SendButton", true)
local helpMessageBox = helpFrame and helpFrame:FindFirstChild("MessageBox", true) or (helpFrame and helpFrame:FindFirstChildOfClass("TextBox"))
local closeHelpButton = helpFrame and helpFrame:FindFirstChild("CloseButton", true)

if helpFrame then
    print("HelpFrame children:")
    for _, child in pairs(helpFrame:GetChildren()) do
        print("  -", child.Name, "(", child.ClassName, ")")
    end
end

-- Contact Staff button handler - opens HelpFrame
if contactButton then
    print("✓ Setting up Contact Staff button click handler")
    contactButton.MouseButton1Click:Connect(function()
        print(">>> CONTACT STAFF CLICKED! <<<")
        
        if helpFrame then
            print("Opening HelpFrame...")
            helpFrame.Visible = true
            verificationFrame.Visible = false
            print("HelpFrame opened, VerificationFrame hidden")
        else
            -- No HelpFrame, just notify staff directly
            if contactStaffRemote then
                contactButton.Text = "Contacting..."
                contactButton.Active = false
                
                local success, result = pcall(function()
                    return contactStaffRemote:InvokeServer("Need help with verification")
                end)
                
                if success and result and result.success then
                    contactButton.Text = "Staff Notified!"
                    contactButton.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
                else
                    contactButton.Text = result and result.message or "Try again later"
                    contactButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
                end
                
                wait(3)
                contactButton.Text = "Contact Staff"
                contactButton.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
                contactButton.Active = true
            end
        end
    end)
end

-- Close HelpFrame button handler
if closeHelpButton then
    closeHelpButton.MouseButton1Click:Connect(function()
        print(">>> CLOSE HELP CLICKED! <<<")
        if helpFrame then
            helpFrame.Visible = false
        end
        if verificationFrame then
            verificationFrame.Visible = true
        end
    end)
end

-- Send help message button handler
if sendHelpButton and contactStaffRemote then
    sendHelpButton.MouseButton1Click:Connect(function()
        print(">>> SEND HELP CLICKED! <<<")
        
        local message = "Need help with verification"
        if helpMessageBox then
            message = helpMessageBox.Text ~= "" and helpMessageBox.Text or message
        end
        
        sendHelpButton.Text = "Sending..."
        sendHelpButton.Active = false
        
        local success, result = pcall(function()
            return contactStaffRemote:InvokeServer(message)
        end)
        
        if success and result and result.success then
            sendHelpButton.Text = "Staff Notified!"
            sendHelpButton.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
            
            wait(2)
            -- Close help frame and go back
            if helpFrame then
                helpFrame.Visible = false
            end
            if verificationFrame then
                verificationFrame.Visible = true
            end
        else
            sendHelpButton.Text = result and result.message or "Try again later"
            sendHelpButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
        end
        
        wait(2)
        sendHelpButton.Text = "Send"
        sendHelpButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
        sendHelpButton.Active = true
    end)
end

-- Button click handler
print("Connecting MouseButton1Click event...")
verifyButton.MouseButton1Click:Connect(function()
    print(">>> BUTTON CLICKED! <<<")
    
    local discordUsername = discordIdBox.Text
    print("Discord Username entered:", discordUsername)
    
    if discordUsername == "" then
        print("Discord Username is empty, showing error")
        verifyButton.Text = "Enter Username!"
        verifyButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
        wait(1)
        verifyButton.Text = "Request 18+ Verification"
        verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
        return
    end
    
    print("Requesting verification for Discord Username:", discordUsername)
    
    -- Show loading
    verifyButton.Text = "Sending Request..."
    verifyButton.BackgroundColor3 = Color3.fromRGB(255, 200, 0)
    verifyButton.Active = false
    
    -- Request verification
    local success, result = pcall(function()
        print("Calling InvokeServer with Discord Username:", discordUsername)
        return remoteFunction:InvokeServer(discordUsername)
    end)
    
    print("InvokeServer success:", success)
    print("InvokeServer result:", result)
    
    -- Check if we got a valid response (either success=true or has verificationId)
    if success and result and (result.success or result.verificationId) then
        -- Request sent
        print("✓ Verification request successful!")
        verifyButton.Text = "Waiting for Confirmation..."
        verifyButton.BackgroundColor3 = Color3.fromRGB(100, 100, 255)
        
        local verificationId = result.verificationId
        local alreadySentToStaff = result.alreadySentToStaff
        
        if alreadySentToStaff then
            print("[INFO] Staff was NOT notified (already sent for this Discord ID)")
        else
            print("[INFO] Staff WAS notified of this verification")
        end
        
        print("Verification request sent! Check your Discord DM.")
        
        -- Poll for approval (60 attempts, 5 second intervals)
        local approved = false
        for i = 1, 60 do
            wait(5)
            print("Polling verification status... attempt", i)
            
            local checkSuccess, checkResult = pcall(function()
                return remoteFunction:InvokeServer(nil, verificationId)
            end)
            
            print("Status check result:", checkResult)
            
            if checkSuccess and checkResult then
                if checkResult == "approved" or checkResult == "confirmed" then
                    print("✓ Verification approved!")
                    approved = true
                    break
                elseif checkResult == "denied" then
                    print("✗ Verification denied!")
                    verifyButton.Text = "Verification Denied"
                    verifyButton.BackgroundColor3 = Color3.fromRGB(255, 0, 0)
                    wait(2)
                    verifyButton.Text = "Request 18+ Verification"
                    verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
                    verifyButton.Active = true
                    return
                elseif checkResult == "expired" then
                    print("✗ Verification expired!")
                    verifyButton.Text = "Request Expired"
                    verifyButton.BackgroundColor3 = Color3.fromRGB(255, 100, 0)
                    wait(2)
                    verifyButton.Text = "Request 18+ Verification"
                    verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
                    verifyButton.Active = true
                    return
                end
            end
        end
        
        if approved then
            verifyButton.Text = "Verified!"
            verifyButton.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
            verifyButton.Active = false
            if roleFrame then
                roleFrame.Visible = true
                print("✓ RoleFrame shown")
            end
            if verificationFrame then
                verificationFrame.Visible = false
                print("✓ VerificationFrame hidden")
            end
        else
            verifyButton.Text = "Still Waiting..."
            verifyButton.BackgroundColor3 = Color3.fromRGB(255, 200, 0)
            verifyButton.Active = true
        end
    else
        print("✗ Error:", success, result)
        local errorMessage = "Connection Error"
        if result and type(result) == "table" then
            errorMessage = result.error or result.message or "Server Error"
        elseif result and type(result) == "string" then
            errorMessage = result
        end
        verifyButton.Text = errorMessage
        verifyButton.BackgroundColor3 = Color3.fromRGB(255, 0, 0)
        wait(2)
        verifyButton.Text = "Request 18+ Verification"
        verifyButton.BackgroundColor3 = Color3.fromRGB(0, 170, 255)
        verifyButton.Active = true
    end
end)

-- Listen for staff approval event
if verificationApprovedEvent then
    verificationApprovedEvent.OnClientEvent:Connect(function()
        print(">>> VERIFICATION APPROVED BY STAFF! <<<")
        
        -- Debug: Print all ScreenGuis and their children
        print("=== DEBUG: Searching for RoleFrame ===")
        for _, screenGui in pairs(playerGui:GetChildren()) do
            if screenGui:IsA("ScreenGui") then
                print("ScreenGui:", screenGui.Name)
                for _, child in pairs(screenGui:GetChildren()) do
                    print("  - Child:", child.Name, "(" .. child.ClassName .. ")")
                end
            end
        end
        
        -- Find RoleFrame (search recursively)
        local currentRoleFrame = playerGui:FindFirstChild("RoleFrame", true)
        local currentVerificationFrame = playerGui:FindFirstChild("VerificationFrame", true)
        
        print("RoleFrame search result:", currentRoleFrame and currentRoleFrame:GetFullName() or "NOT FOUND")
        print("VerificationFrame search result:", currentVerificationFrame and currentVerificationFrame:GetFullName() or "NOT FOUND")
        
        -- Show RoleFrame and hide VerificationFrame
        if currentRoleFrame then
            currentRoleFrame.Visible = true
            print("✓ RoleFrame.Visible set to TRUE!")
        else
            warn("✗ RoleFrame not found! Creating a test message...")
            -- Show a message that it worked but RoleFrame doesn't exist
            if currentVerificationFrame then
                local existingLabel = currentVerificationFrame:FindFirstChildOfClass("TextLabel")
                if existingLabel then
                    existingLabel.Text = "VERIFIED! (RoleFrame not found)"
                    existingLabel.TextColor3 = Color3.fromRGB(0, 255, 0)
                end
            end
        end
        
        if currentVerificationFrame then
            currentVerificationFrame.Visible = false
            print("✓ VerificationFrame.Visible set to FALSE!")
        end
        
        -- Update button if visible
        if verifyButton then
            verifyButton.Text = "Verified!"
            verifyButton.BackgroundColor3 = Color3.fromRGB(0, 255, 0)
            verifyButton.Active = false
        end
        
        print("=== APPROVAL HANDLING COMPLETE ===")
    end)
    print("✓ Listening for staff approval")
else
    warn("✗ VerificationApproved event not found! Staff approval won't work.")
end

-- Set up 18+ verification message and friend referral question
local function setupVerificationMessages()
    if verificationFrame then
        -- Find or create the title/description labels
        local titleLabel = verificationFrame:FindFirstChild("TitleLabel")
        local descriptionLabel = verificationFrame:FindFirstChild("DescriptionLabel")
        local friendReferralLabel = verificationFrame:FindFirstChild("FriendReferralLabel")
        
        -- Update title if exists
        if titleLabel and titleLabel:IsA("TextLabel") then
            titleLabel.Text = "18+ Verification Required"
            print("✓ Updated title to 18+ verification")
        end
        
        -- Update description if exists
        if descriptionLabel and descriptionLabel:IsA("TextLabel") then
            descriptionLabel.Text = "This is an 18+ community. Please enter your Discord username to verify your age."
            print("✓ Updated description for 18+ verification")
        end
        
        -- Look for any TextLabel that might contain verification text
        for _, child in pairs(verificationFrame:GetChildren()) do
            if child:IsA("TextLabel") then
                local text = child.Text:lower()
                if text:find("verify") or text:find("discord") or text:find("enter") then
                    child.Text = "18+ Verification Required\n\nThis is an 18+ community. Please enter your Discord username to verify.\n\nIf you were invited by a friend, please let us know who invited you!"
                    child.TextWrapped = true
                    print("✓ Updated verification label:", child.Name)
                end
            end
        end
        
        -- Create friend referral label if it doesn't exist
        if not friendReferralLabel then
            -- Check if there's a TextBox for friend referral
            local friendReferralBox = verificationFrame:FindFirstChild("FriendReferralBox")
            if not friendReferralBox then
                print("Note: No FriendReferralBox found. Consider adding a TextBox named 'FriendReferralBox' for friend referrals.")
            end
        end
    end
end

setupVerificationMessages()

print("✓ Manual Verification Client loaded! Ready to verify.")
