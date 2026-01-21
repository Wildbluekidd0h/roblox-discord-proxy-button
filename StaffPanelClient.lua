-- LocalScript: Staff Panel Client
-- Place this in StarterGui (inside a ScreenGui with StaffPanel frame)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

print("=== Staff Panel Client Starting ===")

-- Wait for StaffActions RemoteFunction
local staffActionsRemote = ReplicatedStorage:WaitForChild("StaffActions", 10)
if not staffActionsRemote then
    warn("StaffActions RemoteFunction not found!")
    return
end

print("✓ StaffActions RemoteFunction found")

-- Check if player is staff
local isStaff = false
local adminToken = nil

local function checkIfStaff()
    print("Checking if player is staff...")
    local success, result = pcall(function()
        return staffActionsRemote:InvokeServer("check_staff")
    end)
    
    print("Staff check - success:", success, "result:", result)
    
    if success and result and result.isStaff then
        isStaff = true
        print("✓ Player is STAFF")
        return true
    else
        print("Player is not staff - success:", success, "isStaff:", result and result.isStaff)
        return false
    end
end

-- Check staff status
if not checkIfStaff() then
    print("Not staff - Staff Panel disabled")
    return
end

-- Find StaffPanel GUI
local function findStaffPanel()
    for i = 1, 30 do
        local panel = playerGui:FindFirstChild("StaffPanel", true)
        if panel then
            return panel
        end
        wait(0.5)
    end
    return nil
end

local staffPanel = findStaffPanel()
local staffButton = playerGui:FindFirstChild("StaffButton", true)

if not staffPanel then
    warn("StaffPanel not found - create a Frame named 'StaffPanel' in your ScreenGui")
    return
end

print("✓ StaffPanel found")

-- Find elements inside StaffPanel
local pendingList = staffPanel:FindFirstChild("PendingList", true) -- ScrollingFrame
local refreshButton = staffPanel:FindFirstChild("RefreshButton", true)
local closeButton = staffPanel:FindFirstChild("CloseButton", true)
local loginFrame = staffPanel:FindFirstChild("LoginFrame", true)
local passwordBox = loginFrame and loginFrame:FindFirstChild("PasswordBox", true)
local loginButton = loginFrame and loginFrame:FindFirstChild("LoginButton", true)
local mainPanel = staffPanel:FindFirstChild("MainPanel", true)

-- Hide staff panel initially
staffPanel.Visible = false

-- No login needed - staff is verified in-game via isPlayerStaff()
local staffVerified = true
print("✓ Staff verified in-game - no login required")

-- Create player entry with Verify button next to name
local function createPlayerEntry(verification, index, yOffset)
    local itemFrame = Instance.new("Frame")
    itemFrame.Name = "Item_" .. index
    itemFrame.Size = UDim2.new(1, -10, 0, 50)
    itemFrame.Position = UDim2.new(0, 5, 0, yOffset)
    itemFrame.BackgroundColor3 = Color3.fromRGB(50, 50, 70)
    itemFrame.BorderSizePixel = 0
    
    -- Round corners
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 6)
    corner.Parent = itemFrame
    
    -- Player name label (left side)
    local nameLabel = Instance.new("TextLabel")
    nameLabel.Name = "PlayerName"
    nameLabel.Size = UDim2.new(0.5, -10, 1, 0)
    nameLabel.Position = UDim2.new(0, 10, 0, 0)
    nameLabel.BackgroundTransparency = 1
    nameLabel.Text = verification.playerName or "Unknown Player"
    nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
    nameLabel.TextXAlignment = Enum.TextXAlignment.Left
    nameLabel.Font = Enum.Font.GothamBold
    nameLabel.TextSize = 16
    nameLabel.Parent = itemFrame
    
    -- VERIFY button (right side, next to name)
    local verifyBtn = Instance.new("TextButton")
    verifyBtn.Name = "VerifyButton"
    verifyBtn.Size = UDim2.new(0, 70, 0, 32)
    verifyBtn.Position = UDim2.new(1, -155, 0.5, -16)
    verifyBtn.BackgroundColor3 = Color3.fromRGB(46, 204, 113)
    verifyBtn.Text = "✓ Verify"
    verifyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    verifyBtn.Font = Enum.Font.GothamBold
    verifyBtn.TextSize = 14
    verifyBtn.Parent = itemFrame
    
    local verifyCorner = Instance.new("UICorner")
    verifyCorner.CornerRadius = UDim.new(0, 4)
    verifyCorner.Parent = verifyBtn
    
    verifyBtn.MouseButton1Click:Connect(function()
        verifyBtn.Text = "..."
        verifyBtn.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
        
        local success, result = pcall(function()
            return staffActionsRemote:InvokeServer("approve", {
                verificationId = verification.id
            })
        end)
        
        print("Approve result:", success, result)
        
        if success and result and result.success then
            itemFrame.BackgroundColor3 = Color3.fromRGB(46, 125, 50)
            verifyBtn.Text = "✓ Done"
            wait(1)
            refreshPendingList()
        else
            verifyBtn.Text = "Error"
            verifyBtn.BackgroundColor3 = Color3.fromRGB(180, 0, 0)
            wait(1)
            verifyBtn.Text = "✓ Verify"
            verifyBtn.BackgroundColor3 = Color3.fromRGB(46, 204, 113)
        end
    end)
    
    -- DENY button (far right)
    local denyBtn = Instance.new("TextButton")
    denyBtn.Name = "DenyButton"
    denyBtn.Size = UDim2.new(0, 70, 0, 32)
    denyBtn.Position = UDim2.new(1, -80, 0.5, -16)
    denyBtn.BackgroundColor3 = Color3.fromRGB(231, 76, 60)
    denyBtn.Text = "✗ Deny"
    denyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    denyBtn.Font = Enum.Font.GothamBold
    denyBtn.TextSize = 14
    denyBtn.Parent = itemFrame
    
    local denyCorner = Instance.new("UICorner")
    denyCorner.CornerRadius = UDim.new(0, 4)
    denyCorner.Parent = denyBtn
    
    denyBtn.MouseButton1Click:Connect(function()
        denyBtn.Text = "..."
        denyBtn.BackgroundColor3 = Color3.fromRGB(100, 100, 100)
        
        local success, result = pcall(function()
            return staffActionsRemote:InvokeServer("deny", {
                verificationId = verification.id
            })
        end)
        
        print("Deny result:", success, result)
        
        if success and result and result.success then
            itemFrame.BackgroundColor3 = Color3.fromRGB(100, 30, 30)
            denyBtn.Text = "✗ Done"
            wait(1)
            refreshPendingList()
        else
            denyBtn.Text = "Error"
            wait(1)
            denyBtn.Text = "✗ Deny"
            denyBtn.BackgroundColor3 = Color3.fromRGB(231, 76, 60)
        end
    end)
    
    return itemFrame
end

-- Refresh pending list (no login needed - staff verified in-game)
function refreshPendingList()
    if not pendingList then
        warn("PendingList ScrollingFrame not found")
        return
    end
    
    print("Refreshing pending list...")
    
    -- Clear existing items
    for _, child in pairs(pendingList:GetChildren()) do
        if child:IsA("Frame") or child:IsA("TextLabel") then
            child:Destroy()
        end
    end
    
    -- Fetch pending (no token needed - staff verified in-game)
    local success, result = pcall(function()
        return staffActionsRemote:InvokeServer("get_pending")
    end)
    
    print("Fetch result - success:", success)
    if result then
        print("Result success:", result.success)
        print("Pending count:", result.pending and #result.pending or "nil")
    end
    
    if success and result and result.success and result.pending then
        local pendingCount = #result.pending
        print("✓ Loaded", pendingCount, "pending verifications")
        
        if pendingCount == 0 then
            -- Show "No pending" message
            local noDataLabel = Instance.new("TextLabel")
            noDataLabel.Name = "NoDataLabel"
            noDataLabel.Size = UDim2.new(1, -20, 0, 40)
            noDataLabel.Position = UDim2.new(0, 10, 0, 10)
            noDataLabel.BackgroundTransparency = 1
            noDataLabel.Text = "No pending verifications"
            noDataLabel.TextColor3 = Color3.fromRGB(150, 150, 150)
            noDataLabel.Font = Enum.Font.Gotham
            noDataLabel.TextSize = 14
            noDataLabel.Parent = pendingList
            return
        end
        
        local yOffset = 5
        for i, verification in ipairs(result.pending) do
            print("Creating entry for:", verification.playerName, "ID:", verification.id)
            local entry = createPlayerEntry(verification, i, yOffset)
            entry.Parent = pendingList
            yOffset = yOffset + 55
        end
        
        -- Update canvas size
        pendingList.CanvasSize = UDim2.new(0, 0, 0, yOffset + 10)
    else
        print("No pending verifications or error occurred")
        -- Show error message
        local errorLabel = Instance.new("TextLabel")
        errorLabel.Name = "ErrorLabel"
        errorLabel.Size = UDim2.new(1, -20, 0, 40)
        errorLabel.Position = UDim2.new(0, 10, 0, 10)
        errorLabel.BackgroundTransparency = 1
        errorLabel.Text = "Could not load pending list"
        errorLabel.TextColor3 = Color3.fromRGB(255, 100, 100)
        errorLabel.Font = Enum.Font.Gotham
        errorLabel.TextSize = 14
        errorLabel.Parent = pendingList
    end
end

-- Staff button to open panel (if exists)
if staffButton then
    staffButton.Visible = true -- Show for staff only
    staffButton.MouseButton1Click:Connect(function()
        staffPanel.Visible = not staffPanel.Visible
        if staffPanel.Visible then
            refreshPendingList()
        end
    end)
    print("✓ Staff button connected")
end

-- Refresh button handler
if refreshButton then
    refreshButton.MouseButton1Click:Connect(function()
        refreshButton.Text = "..."
        refreshPendingList()
        wait(0.5)
        refreshButton.Text = "Refresh"
    end)
end

-- Close button handler
if closeButton then
    closeButton.MouseButton1Click:Connect(function()
        staffPanel.Visible = false
    end)
end

print("✓ Staff Panel Client loaded!")
