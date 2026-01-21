-- ServerScript: Manual verification version
-- Place this in ServerScriptService

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

-- Configuration
local API_URL = "https://roblox-discord-proxy-button.onrender.com"

-- STAFF CONFIGURATION - Add staff User IDs here
local STAFF_USER_IDS = {
    8976444910,  -- Wyldieee
    -- Add more staff Roblox User IDs here:
    -- 123456789,
}

-- Or use Group Rank (set to 0 to disable)
local STAFF_GROUP_ID = 573963821  -- Your group ID (0 = disabled)
local STAFF_MIN_RANK = 250  -- Minimum rank to be staff (e.g., 250+)

-- Track which Discord IDs have already been sent to staff (prevent spam)
local DiscordIDsSentToStaff = {}

-- SERVER-SIDE VERIFIED PLAYERS - This is the source of truth! (prevents exploits)
local verifiedPlayers = {}  -- [UserId] = true

-- Track players currently being restricted (unverified)
local restrictedPlayers = {}  -- [UserId] = true

-- Create RemoteFunction for manual verification
local remoteFunction = ReplicatedStorage:FindFirstChild("RequestManualVerification")
if not remoteFunction then
    remoteFunction = Instance.new("RemoteFunction")
    remoteFunction.Name = "RequestManualVerification"
    remoteFunction.Parent = ReplicatedStorage
    print("Created RemoteFunction: RequestManualVerification")
end

-- Create RemoteFunction for contacting staff
local contactStaffRemote = ReplicatedStorage:FindFirstChild("ContactStaff")
if not contactStaffRemote then
    contactStaffRemote = Instance.new("RemoteFunction")
    contactStaffRemote.Name = "ContactStaff"
    contactStaffRemote.Parent = ReplicatedStorage
    print("Created RemoteFunction: ContactStaff")
end

-- Create RemoteFunction for staff actions
local staffActionsRemote = ReplicatedStorage:FindFirstChild("StaffActions")
if not staffActionsRemote then
    staffActionsRemote = Instance.new("RemoteFunction")
    staffActionsRemote.Name = "StaffActions"
    staffActionsRemote.Parent = ReplicatedStorage
    print("Created RemoteFunction: StaffActions")
end

-- Create RemoteEvent for notifying players when approved
local verificationApprovedEvent = ReplicatedStorage:FindFirstChild("VerificationApproved")
if not verificationApprovedEvent then
    verificationApprovedEvent = Instance.new("RemoteEvent")
    verificationApprovedEvent.Name = "VerificationApproved"
    verificationApprovedEvent.Parent = ReplicatedStorage
    print("Created RemoteEvent: VerificationApproved")
end

-- Create RemoteFunction for checking if player is verified (SERVER-SIDE CHECK)
local checkVerifiedRemote = ReplicatedStorage:FindFirstChild("CheckVerified")
if not checkVerifiedRemote then
    checkVerifiedRemote = Instance.new("RemoteFunction")
    checkVerifiedRemote.Name = "CheckVerified"
    checkVerifiedRemote.Parent = ReplicatedStorage
    print("Created RemoteFunction: CheckVerified")
end

-- Track pending players by their verification ID -> Roblox User ID
local pendingPlayersByVerificationId = {}
-- Also track by UserId directly for fallback
local pendingPlayersByUserId = {}
-- Track which players we've already added to pending (prevent duplicates)
local playersAlreadyAddedToPending = {}

-- Function to check if player is staff (MUST be defined before isPlayerVerified!)
local function isPlayerStaff(player)
    -- Check User ID list
    for _, staffId in ipairs(STAFF_USER_IDS) do
        if player.UserId == staffId then
            return true
        end
    end
    
    -- Check group rank
    if STAFF_GROUP_ID > 0 then
        local success, rank = pcall(function()
            return player:GetRankInGroup(STAFF_GROUP_ID)
        end)
        if success and rank >= STAFF_MIN_RANK then
            return true
        end
    end
    
    return false
end

-- Function to check if player is verified (SERVER-SIDE - call the API)
local function isPlayerVerified(player)
    -- Check local cache first
    if verifiedPlayers[player.UserId] then
        return true
    end
    
    -- Staff are always verified
    if isPlayerStaff(player) then
        return true
    end
    
    -- Check with the API using Roblox User ID (new Bloxlink-style endpoint)
    local success, result = pcall(function()
        local response = HttpService:GetAsync(
            API_URL .. "/check-roblox-verified/" .. tostring(player.UserId),
            false
        )
        return HttpService:JSONDecode(response)
    end)
    
    if success and result and result.verified then
        verifiedPlayers[player.UserId] = true  -- Cache it
        print("✓ Player verified via API:", player.Name)
        return true
    end
    
    return false
end

-- Handle CheckVerified requests from client
checkVerifiedRemote.OnServerInvoke = function(player)
    local verified = isPlayerVerified(player)
    print("Verification check for", player.Name, ":", verified)
    return verified
end

-- ============ SERVER-SIDE RESTRICTION FUNCTIONS ============
-- These functions enforce verification by restricting unverified players

-- Restrict a player (freeze them, disable controls, etc.)
local function restrictPlayer(player)
    print("🔒 Restricting player:", player.Name)
    restrictedPlayers[player.UserId] = true
    
    -- Wait for character to exist
    local character = player.Character or player.CharacterAdded:Wait()
    
    -- Method 1: Anchor the HumanoidRootPart (freezes player in place)
    local rootPart = character:FindFirstChild("HumanoidRootPart")
    if rootPart then
        rootPart.Anchored = true
    end
    
    -- Method 2: Set WalkSpeed to 0
    local humanoid = character:FindFirstChild("Humanoid")
    if humanoid then
        humanoid.WalkSpeed = 0
        humanoid.JumpPower = 0
        humanoid.JumpHeight = 0
    end
    
    -- Store original position to teleport back if they somehow move
    if rootPart then
        restrictedPlayers[player.UserId] = rootPart.Position
    end
end

-- Unrestrict a player (allow them to play)
local function unrestrictPlayer(player)
    print("🔓 Unrestricting player:", player.Name)
    restrictedPlayers[player.UserId] = nil
    
    local character = player.Character
    if not character then return end
    
    -- Unanchor
    local rootPart = character:FindFirstChild("HumanoidRootPart")
    if rootPart then
        rootPart.Anchored = false
    end
    
    -- Restore movement
    local humanoid = character:FindFirstChild("Humanoid")
    if humanoid then
        humanoid.WalkSpeed = 16 -- Default walk speed
        humanoid.JumpPower = 50 -- Default jump power
        humanoid.JumpHeight = 7.2 -- Default jump height
    end
end

-- Re-restrict player when they respawn (if still not verified)
local function setupRespawnRestriction(player)
    player.CharacterAdded:Connect(function(character)
        wait(0.5) -- Wait for character to fully load
        
        -- If player is still restricted (not verified), re-restrict them
        if restrictedPlayers[player.UserId] then
            print("🔒 Re-restricting respawned player:", player.Name)
            restrictPlayer(player)
        end
    end)
end
-- ============ END RESTRICTION FUNCTIONS ============

-- Function to get linked Discord for a Roblox user
local function getLinkedDiscord(robloxUserId)
    local success, result = pcall(function()
        local response = HttpService:GetAsync(
            API_URL .. "/get-linked-discord/" .. tostring(robloxUserId),
            false
        )
        return HttpService:JSONDecode(response)
    end)
    
    if success and result and result.linked then
        return result.discordId
    end
    return nil
end

-- Function to add player to pending list
local function addPlayerToPending(player)
    -- Check if already added (prevent duplicates)
    if playersAlreadyAddedToPending[player.UserId] then
        print("Player already in pending list, skipping:", player.Name)
        return nil
    end
    
    -- NOTE: Staff are now included in pending list for testing
    -- Uncomment below to skip staff again:
    -- if isPlayerStaff(player) then
    --     print("Staff member joined, skipping pending list:", player.Name)
    --     return nil
    -- end
    
    print("Adding player to pending list:", player.Name)
    
    -- Mark as added BEFORE the API call to prevent race conditions
    playersAlreadyAddedToPending[player.UserId] = true
    
    local success, result = pcall(function()
        local requestData = {
            playerName = player.Name,
            userId = player.UserId,
            displayName = player.DisplayName,
            accountAge = player.AccountAge,
            discordId = "pending_" .. player.UserId,
            robloxUserId = player.UserId,
            autoJoin = true
        }
        
        local jsonData = HttpService:JSONEncode(requestData)
        
        local response = HttpService:PostAsync(
            API_URL .. "/request-verification",
            jsonData,
            Enum.HttpContentType.ApplicationJson,
            false
        )
        
        return HttpService:JSONDecode(response)
    end)
    
    if success and result and result.verificationId then
        print("✓ Player added to pending:", player.Name, "ID:", result.verificationId)
        pendingPlayersByVerificationId[result.verificationId] = player.UserId
        pendingPlayersByUserId[player.UserId] = player -- Store the player object too
        return result.verificationId
    else
        warn("Failed to add player to pending:", result)
        return nil
    end
end

-- Handle verification requests from client
remoteFunction.OnServerInvoke = function(player, discordId, verificationId)
    print("\n=== VERIFICATION REQUEST ===")
    print("Player:", player.Name, "| Discord ID:", discordId, "| Verification ID:", verificationId)
    
    -- Special check for linked Discord (auto-fill feature)
    if discordId == "__CHECK_LINKED__" then
        local linkedDiscord = getLinkedDiscord(player.UserId)
        if linkedDiscord then
            return { linked = true, discordId = linkedDiscord }
        else
            return { linked = false }
        end
    end
    
    -- If verificationId is provided, check status
    if verificationId then
        print("[STATUS CHECK] Checking status of verification ID:", verificationId)
        
        local success, result = pcall(function()
            local requestData = { verificationId = verificationId }
            local jsonData = HttpService:JSONEncode(requestData)
            local response = HttpService:PostAsync(
                API_URL .. "/check-verification-status",
                jsonData,
                Enum.HttpContentType.ApplicationJson,
                false
            )
            return HttpService:JSONDecode(response)
        end)
        
        if success and result then
            return result.status or "error"
        else
            return "error"
        end
    end
    
    -- Otherwise, this is a new verification request
    if not discordId or discordId == "" then
        warn("No Discord ID provided by player:", player.Name)
        return { success = false, error = "No Discord ID" }
    end
    
    -- Request verification
    local success, result = pcall(function()
        local requestData = {
            playerName = player.Name,
            userId = player.UserId,
            displayName = player.DisplayName,
            accountAge = player.AccountAge,
            discordId = discordId,
            robloxUserId = player.UserId
        }
        
        local jsonData = HttpService:JSONEncode(requestData)
        
        local response = HttpService:PostAsync(
            API_URL .. "/request-verification",
            jsonData,
            Enum.HttpContentType.ApplicationJson,
            false
        )
        
        return HttpService:JSONDecode(response)
    end)
    
    if success and result then
        if result.verificationId then
            pendingPlayersByVerificationId[result.verificationId] = player.UserId
        end
        return result
    else
        return { success = false, error = "Failed to send request" }
    end
end

-- Handle contact staff requests
contactStaffRemote.OnServerInvoke = function(player, message)
    print("\n=== CONTACT STAFF REQUEST ===")
    print("Player:", player.Name, "| Message:", message)
    
    local success, result = pcall(function()
        local requestData = {
            playerName = player.Name,
            userId = player.UserId,
            message = message or "Needs help with verification"
        }
        
        local jsonData = HttpService:JSONEncode(requestData)
        
        local response = HttpService:PostAsync(
            API_URL .. "/contact-staff",
            jsonData,
            Enum.HttpContentType.ApplicationJson,
            false
        )
        
        return HttpService:JSONDecode(response)
    end)
    
    if success and result then
        return result
    else
        return { success = false, message = "Could not contact staff. Try again later." }
    end
end

-- Handle staff actions (approve/deny/get pending)
staffActionsRemote.OnServerInvoke = function(player, action, data)
    print("\n=== STAFF ACTION ===")
    print("Staff:", player.Name, "| Action:", action)
    
    -- Check if staff (this action doesn't require being staff already)
    if action == "check_staff" then
        local staffStatus = isPlayerStaff(player)
        print("Staff check for", player.Name, ":", staffStatus)
        return { success = true, isStaff = staffStatus }
    end
    
    -- All other actions require staff authorization
    if not isPlayerStaff(player) then
        warn("Non-staff player attempted staff action:", player.Name)
        return { success = false, error = "Not authorized" }
    end
    
    -- Get pending verifications
    if action == "get_pending" then
        print("Fetching pending verifications for staff:", player.Name)
        
        local success, result = pcall(function()
            local url = API_URL .. "/staff/pending?staffId=" .. tostring(player.UserId)
            print("Calling URL:", url)
            local response = HttpService:GetAsync(url, false)
            print("Raw response:", response)
            return HttpService:JSONDecode(response)
        end)
        
        print("API call success:", success)
        
        if success and result then
            if result.error then
                warn("API returned error:", result.error)
                return { success = false, error = result.error }
            end
            
            local pending = result
            if result.pending then
                pending = result.pending
            end
            
            print("Got pending verifications:", #pending, "items")
            return { success = true, pending = pending }
        else
            warn("Failed to fetch pending:", result)
            return { success = false, error = tostring(result) }
        end
    end
    
    -- Approve verification
    if action == "approve" then
        local verificationId = data.verificationId
        print("Approving verification:", verificationId)
        
        local success, result = pcall(function()
            local requestData = {
                staffId = player.UserId,
                staffName = player.Name,
                verificationId = verificationId
            }
            
            local jsonData = HttpService:JSONEncode(requestData)
            
            local response = HttpService:PostAsync(
                API_URL .. "/staff/approve",
                jsonData,
                Enum.HttpContentType.ApplicationJson,
                false
            )
            
            return HttpService:JSONDecode(response)
        end)
        
        if success and result and result.success then
            print("✓ Staff approved verification:", verificationId)
            
            -- Find the player and notify them
            local robloxUserId = pendingPlayersByVerificationId[verificationId]
            print("Looking up verificationId:", verificationId, "-> UserId:", robloxUserId)
            
            -- Try to extract userId from verificationId (format: "userId_timestamp")
            if not robloxUserId then
                local extractedId = string.match(verificationId, "^(%d+)_")
                if extractedId then
                    robloxUserId = tonumber(extractedId)
                    print("Extracted UserId from verificationId:", robloxUserId)
                end
            end
            
            if robloxUserId then
                -- Mark player as verified SERVER-SIDE
                verifiedPlayers[robloxUserId] = true
                print("✓ Marked player as verified:", robloxUserId)
                
                local targetPlayer = Players:GetPlayerByUserId(robloxUserId)
                if targetPlayer then
                    print("✓ Found player:", targetPlayer.Name, "- Firing approval event!")
                    
                    -- UNRESTRICT THE PLAYER - they're now verified!
                    unrestrictPlayer(targetPlayer)
                    
                    verificationApprovedEvent:FireClient(targetPlayer)
                    print("✓ Event fired to:", targetPlayer.Name)
                else
                    print("✗ Player not in game (UserId:", robloxUserId, ")")
                end
                pendingPlayersByVerificationId[verificationId] = nil
            else
                -- Last resort: notify ALL players in game (for testing)
                print("✗ Could not find UserId, notifying all players...")
                for _, p in ipairs(Players:GetPlayers()) do
                    print("Firing event to:", p.Name)
                    verificationApprovedEvent:FireClient(p)
                end
            end
            
            return result
        else
            warn("Approve failed:", result)
            return { success = false, error = "Could not approve" }
        end
    end
    
    -- Deny verification
    if action == "deny" then
        local verificationId = data.verificationId
        print("Denying verification:", verificationId)
        
        local success, result = pcall(function()
            local requestData = {
                staffId = player.UserId,
                staffName = player.Name,
                verificationId = verificationId
            }
            
            local jsonData = HttpService:JSONEncode(requestData)
            
            local response = HttpService:PostAsync(
                API_URL .. "/staff/deny",
                jsonData,
                Enum.HttpContentType.ApplicationJson,
                false
            )
            
            return HttpService:JSONDecode(response)
        end)
        
        if success and result and result.success then
            print("✓ Staff denied verification:", verificationId)
            pendingPlayersByVerificationId[verificationId] = nil
            return result
        else
            warn("Deny failed:", result)
            return { success = false, error = "Could not deny" }
        end
    end
    
    return { success = false, error = "Unknown action" }
end

-- Auto-add players to pending list when they join
Players.PlayerAdded:Connect(function(player)
    -- Set up respawn restriction handler FIRST
    setupRespawnRestriction(player)
    
    wait(2) -- Wait for player to fully load
    
    -- Check if already verified first (staff are always verified)
    if isPlayerVerified(player) then
        print("✓ Player already verified on join:", player.Name)
        verifiedPlayers[player.UserId] = true
        restrictedPlayers[player.UserId] = nil
        -- Make sure they're unrestricted
        unrestrictPlayer(player)
    else
        -- RESTRICT UNVERIFIED PLAYERS - they cannot move until verified!
        print("⚠ Restricting unverified player:", player.Name)
        restrictPlayer(player)
    end
    
    addPlayerToPending(player)
end)

-- Also add any players already in the game (and check/restrict them)
for _, existingPlayer in ipairs(Players:GetPlayers()) do
    spawn(function()
        setupRespawnRestriction(existingPlayer)
        
        if isPlayerVerified(existingPlayer) then
            print("✓ Existing player already verified:", existingPlayer.Name)
            verifiedPlayers[existingPlayer.UserId] = true
        else
            print("⚠ Restricting existing unverified player:", existingPlayer.Name)
            restrictPlayer(existingPlayer)
        end
        
        addPlayerToPending(existingPlayer)
    end)
end

-- Clean up when player leaves
Players.PlayerRemoving:Connect(function(player)
    -- Remove from pending tracking
    for verificationId, userId in pairs(pendingPlayersByVerificationId) do
        if userId == player.UserId then
            pendingPlayersByVerificationId[verificationId] = nil
            break
        end
    end
    -- Clean up restriction tracking
    restrictedPlayers[player.UserId] = nil
    pendingPlayersByUserId[player.UserId] = nil
    playersAlreadyAddedToPending[player.UserId] = nil -- Allow re-adding if they rejoin
    -- Note: We keep verifiedPlayers[player.UserId] so they stay verified if they rejoin
end)

-- NOTE: Duplicate PlayerAdded removed - verification check is now in main PlayerAdded above

print("Manual verification system initialized!")
print("Server-side restriction: ENABLED - Unverified players will be frozen!")
print("Staff User IDs:", table.concat(STAFF_USER_IDS, ", "))
