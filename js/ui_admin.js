// =========================================================
// ðŸ› ï¸ SHARED MAP & LEVEL EDITOR STATE
// =========================================================
var TILESET_CONFIG = window.TILESET_CONFIG || [];
window.TILESET_CONFIG = TILESET_CONFIG;
var loadedTilesets = window.loadedTilesets || {};
window.loadedTilesets = loadedTilesets;
var currentTilesetIndex = window.currentTilesetIndex || 0;
window.currentTilesetIndex = currentTilesetIndex;

var editMode = typeof window.editMode !== 'undefined' ? window.editMode : false;
window.editMode = editMode;
var editorMouseGridX = 0;
window.editorMouseGridX = editorMouseGridX;
var editorMouseGridY = 0;
window.editorMouseGridY = editorMouseGridY;
var showGridOverlay = false;
window.showGridOverlay = showGridOverlay;
var hiddenLayers = window.hiddenLayers || new Set();
window.hiddenLayers = hiddenLayers;
var selectedTileId = 0;
window.selectedTileId = selectedTileId;
var TILE_SIZE = 16;
window.TILE_SIZE = TILE_SIZE;
var CHUNK_SIZE = 32;
window.CHUNK_SIZE = CHUNK_SIZE;

function getTilesetData(globalTileId) {
    if (globalTileId === -1 || globalTileId === undefined) return null;
    const configs = window.TILESET_CONFIG || TILESET_CONFIG;
    const tilesets = window.loadedTilesets || loadedTilesets;
    for (let i = configs.length - 1; i >= 0; i--) {
        if (globalTileId >= configs[i].startId) {
            return {
                img: tilesets[configs[i].id],
                localId: globalTileId - configs[i].startId
            };
        }
    }
    return null;
}
window.getTilesetData = getTilesetData;

// --- 1. UI ELEMENT GRABBERS ---
const appEditMode = document.getElementById('app-edit-mode');
const tilePalette = document.getElementById('tile-palette');
const closePalette = document.getElementById('close-palette');

const tileInspector = document.getElementById('tile-inspector');
const inspectDelete = document.getElementById('inspect-delete');
const inspectCollision = document.getElementById('inspect-collision');
const inspectIsSit = document.getElementById('inspect-issit');
const eraserBtn = document.getElementById('eraser-btn');
const paletteResizer = document.getElementById('palette-resizer');
const coordHelper = document.getElementById('coord-helper');

let isResizingPalette = false;
let inspectingCoord = null;
let pCanvas, pCtx, PALETTE_SCALE, cols;

const tabSearchInput = document.getElementById('tab-search');
const tilesetTabsContainer = document.getElementById('tileset-tabs');

if (tabSearchInput && tilesetTabsContainer) {
    tabSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const tabs = tilesetTabsContainer.querySelectorAll('button');
        tabs.forEach(tab => {
            const tabName = tab.innerText.toLowerCase();
            if (tabName.includes(query)) {
                tab.style.display = 'block';
            } else {
                tab.style.display = 'none';
            }
        });
    });
}

// --- LÃ“GICA DEL BOTÃ“N DE EDIT MODE ---
if (appEditMode) {
    appEditMode.addEventListener('click', () => {
        if (typeof appTray !== 'undefined' && appTray) appTray.classList.remove('open');

        editMode = !editMode; window.editMode = editMode;

        if (editMode) {
            const editorToolbar = document.getElementById('editor-toolbar');
            if (editorToolbar) editorToolbar.style.display = 'flex';
            if (tilePalette) tilePalette.style.display = 'flex';
            if (coordHelper) coordHelper.style.display = 'block';

            if (!pCanvas) {
                pCanvas = document.getElementById('palette-canvas');
                if (pCanvas) pCtx = pCanvas.getContext('2d');
                PALETTE_SCALE = 2;
                if (typeof attachPaletteListeners === 'function') attachPaletteListeners();

                const tabsContainer = document.getElementById('tileset-tabs');
                if (tabsContainer) {
                    tabsContainer.innerHTML = '';

                    TILESET_CONFIG.forEach((ts, index) => {
                        const btn = document.createElement('button');
                        btn.innerText = ts.name;
                        btn.className = `tool-btn ${index === 0 ? 'active' : ''}`;
                        btn.style.whiteSpace = 'nowrap';
                        btn.style.flexShrink = '0';

                        btn.onclick = () => {
                            tabsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            switchTileset(index);
                        };
                        tabsContainer.appendChild(btn);
                    });

                    switchTileset(0);
                }
            }

            const toolSelect = document.getElementById('tool-select');
            if (toolSelect) toolSelect.click();
            const appBg = appEditMode.querySelector('.app-bg');
            if (appBg) appBg.style.boxShadow = "0 0 15px #f5576c";
        } else {
            const editorToolbar = document.getElementById('editor-toolbar');
            if (editorToolbar) editorToolbar.style.display = 'none';
            if (tilePalette) tilePalette.style.display = 'none';
            if (tileInspector) tileInspector.style.display = 'none';
            if (typeof isPainting !== 'undefined') isPainting = false;
            const appBg = appEditMode.querySelector('.app-bg');
            if (appBg) appBg.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
            if (coordHelper) coordHelper.style.display = 'none';
            if (typeof floorDirty !== 'undefined') floorDirty = true;
            if (typeof minimapDirty !== 'undefined') minimapDirty = true;

            const zoneFilterToolbar = document.getElementById('zone-filter-toolbar');
            const btnToggleZoneFilters = document.getElementById('btn-toggle-zone-filters');
            const zoneTypeSelect = document.getElementById('zone-type-select');
            const btnMakeSafeZone = document.getElementById('btn-make-safezone');

            if (zoneFilterToolbar) zoneFilterToolbar.style.display = 'none';
            if (btnToggleZoneFilters) {
                btnToggleZoneFilters.style.display = 'none';
                btnToggleZoneFilters.style.background = "transparent";
                btnToggleZoneFilters.style.color = "#2ecc71";
            }
            if (zoneTypeSelect) zoneTypeSelect.style.display = 'none';
            if (btnMakeSafeZone) btnMakeSafeZone.style.display = 'none';

            if (typeof showSafeZoneVisuals !== 'undefined') showSafeZoneVisuals = false;
        }
    });
}

function switchTileset(index) {
    currentTilesetIndex = index;
    const activeTs = TILESET_CONFIG[index];
    if (!activeTs) return;
    const img = loadedTilesets[activeTs.id];
    if (!img || !pCanvas) return;

    const scaledSize = TILE_SIZE * PALETTE_SCALE;
    cols = Math.floor(img.width / TILE_SIZE);
    const rows = Math.floor(img.height / TILE_SIZE);
    pCanvas.width = cols * scaledSize;
    pCanvas.height = rows * scaledSize;

    if (typeof selectStart !== 'undefined') selectStart = null;
    if (typeof selectEnd !== 'undefined') selectEnd = null;
    if (typeof isDraggingBox !== 'undefined') isDraggingBox = false;

    if (typeof drawPalette === 'function') drawPalette();
}
window.switchTileset = switchTileset;

// BotÃ³n de la "X" para cerrar la paleta lateral
if (closePalette) {
    closePalette.addEventListener('click', () => {
        if (editMode && appEditMode) appEditMode.click();
    });
}

// =========================================================
// âš¡ GOD PANEL & ADMIN ONLINE PLAYERS CONTROLLER
// =========================================================
const appGodPanel = document.getElementById('app-god-panel');
const godModal = document.getElementById('god-modal');
const closeGodModal = document.getElementById('close-god-modal');
const godPointerBtn = document.getElementById('god-pointer-btn');
const godDragHandle = document.getElementById('god-drag-handle');
const godOnlineBadge = document.getElementById('god-online-badge');
const godOnlineCount = document.getElementById('god-online-count');
const godPlayersList = document.getElementById('god-players-list');
const godPlayerSearch = document.getElementById('god-player-search');
const godRefreshPlayersBtn = document.getElementById('god-refresh-players-btn');
const godSelectedPlayerPill = document.getElementById('god-selected-player-pill');
const godSelectedPlayerName = document.getElementById('god-selected-player-name');
const godClearTargetBtn = document.getElementById('god-clear-target-btn');

const adminTargetIdInput = document.getElementById('admin-target-id');
const adminSummonBtn = document.getElementById('admin-summon-btn');
const adminTeleportBtn = document.getElementById('admin-teleport-btn');
const adminKickBtn = document.getElementById('admin-kick-btn');
const adminRespawnBtn = document.getElementById('admin-respawn-btn');
const adminAnnounceBtn = document.getElementById('admin-announce-btn');
const adminAnnounceInput = document.getElementById('admin-announce-input');
const adminInvisBtn = document.getElementById('admin-invis-btn');
const adminNoclipBtn = document.getElementById('admin-noclip-btn');
const adminClearArenasBtn = document.getElementById('admin-clearenas-btn');

let godPointerActive = false;
let godRefreshTimer = null;
window.godOnlinePlayersCache = [];

function requestGodOnlinePlayers() {
    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: 'admin_get_online_players' }));
    }
    // Instant fallback render from local client state
    renderGodOnlinePlayers();
}
window.requestGodOnlinePlayers = requestGodOnlinePlayers;

function selectGodTarget(p) {
    if (!p) return;
    const targetIdVal = p.gameId || p.username || p.id;
    if (adminTargetIdInput) {
        adminTargetIdInput.value = targetIdVal;
    }
    if (godSelectedPlayerPill && godSelectedPlayerName) {
        godSelectedPlayerName.innerText = `${p.username || 'Player'} [${targetIdVal}]`;
        godSelectedPlayerPill.style.display = 'flex';
    }
    const adminFreezeBtn = document.getElementById('admin-freeze-btn');
    if (adminFreezeBtn) {
        if (p.isFrozen) {
            adminFreezeBtn.innerHTML = '❄️ Unfreeze';
        } else {
            adminFreezeBtn.innerHTML = '❄️ Freeze';
        }
    }
    renderGodOnlinePlayers();
}
window.selectGodTarget = selectGodTarget;

function clearGodTarget() {
    if (adminTargetIdInput) {
        adminTargetIdInput.value = '';
    }
    if (godSelectedPlayerPill) {
        godSelectedPlayerPill.style.display = 'none';
    }
    renderGodOnlinePlayers();
}
window.clearGodTarget = clearGodTarget;

function sendAdminCommand(type) {
    if (!adminTargetIdInput) return;
    const targetGameId = adminTargetIdInput.value.trim().toUpperCase();
    if (!targetGameId) {
        alert("Please select or enter a target Player ID.");
        return;
    }
    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: type, targetGameId: targetGameId }));
    }
}
window.sendAdminCommand = sendAdminCommand;

// Helper to render character head avatar in the God Panel (matching friends-modal style)
function createGodAvatarCanvas(playerData, size = 28) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.borderRadius = "6px";
    canvas.style.background = "rgba(0, 0, 0, 0.45)";
    canvas.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    canvas.style.flexShrink = "0";
    canvas.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    let headId = 'head_default';
    if (playerData) {
        if (playerData.equipped && playerData.equipped.head) {
            headId = playerData.equipped.head;
        } else if (playerData.headId || playerData.head || playerData.targetHeadId) {
            headId = playerData.headId || playerData.head || playerData.targetHeadId;
        } else if (playerData.isSelf || (typeof player !== 'undefined' && player && (playerData.accountId === player.accountId || playerData.gameId === player.gameId))) {
            headId = player.equipped?.head || 'head_default';
        } else if (typeof otherPlayers !== 'undefined' && otherPlayers) {
            for (let pid in otherPlayers) {
                const op = otherPlayers[pid];
                if (op && (op.accountId === playerData.accountId || op.gameId === playerData.gameId || pid === playerData.id)) {
                    headId = op.equipped?.head || op.headId || 'head_default';
                    break;
                }
            }
        }
    }

    const safeSprites = window.loadedItemSprites || {};
    let dHead = safeSprites[headId] || window.headImg;

    const draw = (img) => {
        if (!img || !img.complete || img.naturalWidth <= 0) return;
        ctx.clearRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = false;
        const frameW = (typeof FRAME_WIDTH !== 'undefined') ? FRAME_WIDTH : 48;
        const headFrameH = img.height / 4 || 48;
        const zoom = size / 32;
        const drawW = frameW * zoom;
        const drawH = headFrameH * zoom;
        ctx.drawImage(
            img,
            0, 0, frameW, headFrameH,
            (size - drawW) / 2,
            (size - drawH) / 2 + (3 * zoom),
            drawW, drawH
        );
    };

    if (dHead && dHead.complete && dHead.naturalWidth > 0) {
        draw(dHead);
        setTimeout(() => draw(dHead), 15);
    } else if (dHead) {
        dHead.addEventListener('load', () => draw(dHead), { once: true });
    }

    return canvas;
}

function renderGodOnlinePlayers(playersList) {
    if (Array.isArray(playersList)) {
        window.godOnlinePlayersCache = playersList;
    }

    let list = Array.isArray(window.godOnlinePlayersCache) && window.godOnlinePlayersCache.length > 0
        ? [...window.godOnlinePlayersCache]
        : [];

    // Fallback: If no server list received yet, build from client-side memory
    if (list.length === 0) {
        if (typeof player !== 'undefined' && player) {
            list.push({
                id: (typeof myId !== 'undefined' ? myId : 'self'),
                gameId: player.gameId || 'YOU',
                accountId: player.accountId || 'self',
                username: player.username || 'Admin (You)',
                role: player.role || 'admin',
                equipped: player.equipped || { head: 'head_default' },
                hp: typeof player.hp === 'number' ? player.hp : 100,
                maxHp: player.maxHp || 100,
                worldX: Math.round(player.worldX || 0),
                worldY: Math.round(player.worldY || 0),
                isDead: !!player.isDead,
                isSelf: true
            });
        }
        if (typeof otherPlayers !== 'undefined' && otherPlayers) {
            for (let pid in otherPlayers) {
                const op = otherPlayers[pid];
                if (!op) continue;
                const isGuestPlayer = !!op.isGuest || (op.role === 'guest') || (op.username && op.username.startsWith('Guest_'));
                list.push({
                    id: pid,
                    gameId: op.gameId || (isGuestPlayer ? ('G' + pid.slice(0, 4).toUpperCase()) : ('P' + pid.slice(0, 5))),
                    accountId: op.accountId || (isGuestPlayer ? ('guest_' + pid) : pid),
                    username: op.username || (isGuestPlayer ? 'Guest' : 'Player'),
                    role: op.role || (isGuestPlayer ? 'guest' : 'player'),
                    isGuest: isGuestPlayer,
                    equipped: op.equipped || { head: op.headId || 'head_default' },
                    hp: typeof op.hp === 'number' ? op.hp : 100,
                    maxHp: 100,
                    worldX: Math.round(op.worldX || op.targetX || 0),
                    worldY: Math.round(op.worldY || op.targetY || 0),
                    isDead: !!op.isDead,
                    isSelf: false
                });
            }
        }
    }

    const isSelfPlayer = (p) => {
        if (!p) return false;
        if (p.isSelf) return true;
        if (typeof myId !== 'undefined' && myId && (p.id === myId || p.gameId === myId || p.accountId === myId)) return true;
        if (typeof player !== 'undefined' && player) {
            if (player.accountId && p.accountId === player.accountId) return true;
            if (player.gameId && p.gameId === player.gameId) return true;
            if (player.id && p.id === player.id) return true;
        }
        return false;
    };

    // Separate self from others
    const selfIndex = list.findIndex(isSelfPlayer);
    let selfObj = null;
    if (selfIndex !== -1) {
        selfObj = list[selfIndex];
    } else if (typeof player !== 'undefined' && player) {
        selfObj = {
            id: (typeof myId !== 'undefined' ? myId : 'self'),
            gameId: player.gameId || 'YOU',
            accountId: player.accountId || 'self',
            username: player.username || 'Admin',
            role: player.role || 'admin',
            equipped: player.equipped || { head: 'head_default' },
            hp: typeof player.hp === 'number' ? player.hp : 100,
            maxHp: player.maxHp || 100,
            worldX: Math.round(player.worldX || 0),
            worldY: Math.round(player.worldY || 0),
            isDead: !!player.isDead,
            isSelf: true
        };
    }

    const otherPlayersList = list.filter((p, idx) => idx !== selfIndex && !isSelfPlayer(p));
    const totalCount = (selfObj ? 1 : 0) + otherPlayersList.length;

    if (godOnlineCount) godOnlineCount.innerText = totalCount;
    if (godOnlineBadge) godOnlineBadge.innerText = `ðŸŸ¢ ${totalCount} Online`;

    if (!godPlayersList) return;

    // Filter by search query (supports username, gameId, accountId, role, or 'guest' keyword)
    const query = godPlayerSearch ? godPlayerSearch.value.trim().toLowerCase() : '';
    const filteredOthers = query
        ? otherPlayersList.filter(p => 
            (p.username && p.username.toLowerCase().includes(query)) ||
            (p.gameId && p.gameId.toLowerCase().includes(query)) ||
            (p.accountId && p.accountId.toLowerCase().includes(query)) ||
            (p.id && p.id.toLowerCase().includes(query)) ||
            (p.role && p.role.toLowerCase().includes(query)) ||
            ((query === 'guest' || query === 'invitado') && (p.isGuest || p.role === 'guest'))
          )
        : otherPlayersList;

    const showSelf = selfObj && (!query || query === 'yo' || query === 'me' || 
        (selfObj.gameId && selfObj.gameId.toLowerCase().includes(query)) ||
        (selfObj.username && selfObj.username.toLowerCase().includes(query)));

    godPlayersList.innerHTML = '';

    const currentSelectedId = adminTargetIdInput ? adminTargetIdInput.value.trim().toUpperCase() : '';

    // 1. PINNED "YO" (SELF) AT THE VERY TOP - With Head Avatar, No ID, Compact & Minimalist
    if (showSelf && selfObj) {
        const selfGameId = (selfObj.gameId || selfObj.id || 'YOU').toUpperCase();
        const isSelfSelected = currentSelectedId && (currentSelectedId === selfGameId || currentSelectedId === (selfObj.accountId || '').toUpperCase());
        const hpPercent = Math.max(0, Math.min(100, Math.round(((selfObj.hp || 0) / (selfObj.maxHp || 100)) * 100)));
        const hpColor = selfObj.isDead ? '#e74c3c' : hpPercent > 50 ? '#2ecc71' : hpPercent > 25 ? '#f39c12' : '#e74c3c';
        const curX = typeof player !== 'undefined' && player.worldX !== undefined ? Math.round(player.worldX) : (selfObj.worldX || 0);
        const curY = typeof player !== 'undefined' && player.worldY !== undefined ? Math.round(player.worldY) : (selfObj.worldY || 0);

        const selfCard = document.createElement('div');
        selfCard.className = 'god-self-pinned';
        selfCard.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 6px;
            background: ${isSelfSelected ? 'rgba(56, 239, 125, 0.22)' : 'rgba(56, 239, 125, 0.08)'};
            border: 1px solid ${isSelfSelected ? '#38ef7d' : 'rgba(56, 239, 125, 0.35)'};
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            flex-shrink: 0;
            margin-bottom: 3px;
            gap: 6px;
        `;

        selfCard.onmouseover = () => {
            if (!isSelfSelected) selfCard.style.background = 'rgba(56, 239, 125, 0.16)';
        };
        selfCard.onmouseout = () => {
            if (!isSelfSelected) selfCard.style.background = 'rgba(56, 239, 125, 0.08)';
        };

        const avatarCanvas = createGodAvatarCanvas(selfObj, 26);

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `display: flex; flex-direction: column; gap: 1px; overflow: hidden; flex: 1;`;
        infoDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #38ef7d; box-shadow: 0 0 5px #38ef7d; flex-shrink: 0;"></span>
                <span style="font-size: 10.5px; font-weight: 800; color: #38ef7d; letter-spacing: 0.5px;">Yo</span>
                <span style="font-size: 7.5px; background: rgba(56,239,125,0.22); color: #38ef7d; border: 1px solid rgba(56,239,125,0.4); padding: 0.5px 3.5px; border-radius: 3px; font-weight: 800;">TÃš</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 8.5px; color: #8fa095;">
                <span>ðŸ“ ${curX}, ${curY}</span>
                <span style="color: ${hpColor}; font-weight: bold;">ðŸ’š ${hpPercent}%</span>
            </div>
        `;

        selfCard.appendChild(avatarCanvas);
        selfCard.appendChild(infoDiv);

        selfCard.onclick = () => {
            selectGodTarget(selfObj);
        };

        godPlayersList.appendChild(selfCard);
    }

    // 2. OTHER ONLINE PLAYERS - With Head Avatar, No ID, Coords & Distance & Action Buttons
    if (filteredOthers.length === 0) {
        if (!showSelf) {
            godPlayersList.innerHTML = `
                <div style="text-align: center; padding: 25px 10px; color: #888; font-size: 11px;">
                    ${query ? 'ðŸ” No players matching "' + query + '"' : 'â³ No other players online'}
                </div>
            `;
        }
        return;
    }

    filteredOthers.forEach(p => {
        const pGameId = (p.gameId || p.id || '').toUpperCase();
        const pUsername = (p.username || '').toUpperCase();
        const pAccountId = (p.accountId || '').toUpperCase();
        const isSelected = currentSelectedId && (currentSelectedId === pGameId || currentSelectedId === pUsername || currentSelectedId === pAccountId);

        const row = document.createElement('div');
        row.className = 'god-player-row';
        row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 6px;
            background: ${isSelected ? 'rgba(56, 239, 125, 0.22)' : 'rgba(255, 255, 255, 0.04)'};
            border: 1px solid ${isSelected ? '#38ef7d' : 'rgba(255, 255, 255, 0.08)'};
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
            gap: 6px;
        `;

        row.onmouseover = () => {
            if (!isSelected) {
                row.style.background = 'rgba(56, 239, 125, 0.12)';
                row.style.borderColor = 'rgba(56, 239, 125, 0.4)';
            }
        };
        row.onmouseout = () => {
            if (!isSelected) {
                row.style.background = 'rgba(255, 255, 255, 0.04)';
                row.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }
        };

        const isAdmin = (p.role || '').toLowerCase() === 'admin';
        const isMod = (p.role || '').toLowerCase() === 'mod';
        const isGuest = (p.role || '').toLowerCase() === 'guest' || !!p.isGuest || (p.username && p.username.startsWith('Guest_'));
        const roleBadge = isAdmin
            ? '<span style="font-size: 8px; background: linear-gradient(135deg, #f39c12, #e74c3c); color: #fff; padding: 0.5px 4px; border-radius: 3px; font-weight: 800;">ADMIN</span>'
            : isMod
            ? '<span style="font-size: 8px; background: #3498db; color: #fff; padding: 0.5px 4px; border-radius: 3px; font-weight: 800;">MOD</span>'
            : isGuest
            ? '<span style="font-size: 8px; background: rgba(243, 156, 18, 0.2); border: 1px solid rgba(243, 156, 18, 0.5); color: #f39c12; padding: 0.5px 4px; border-radius: 3px; font-weight: 700;">GUEST</span>'
            : '<span style="font-size: 8px; background: rgba(255,255,255,0.12); color: #ccc; padding: 0.5px 3px; border-radius: 3px;">USER</span>';

        const hpPercent = Math.max(0, Math.min(100, Math.round(((p.hp || 0) / (p.maxHp || 100)) * 100)));
        const hpColor = p.isDead ? '#e74c3c' : hpPercent > 50 ? '#2ecc71' : hpPercent > 25 ? '#f39c12' : '#e74c3c';

        // Distance measurement from current player
        let distText = '';
        if (typeof player !== 'undefined' && player.worldX !== undefined && p.worldX !== undefined) {
            const dist = Math.round(Math.hypot(p.worldX - player.worldX, p.worldY - player.worldY));
            distText = `<span style="font-size: 8.5px; color: #38ef7d; opacity: 0.9;">ðŸ“ ${dist}px</span>`;
        }

        const avatarCanvas = createGodAvatarCanvas(p, 28);

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `display: flex; flex-direction: column; gap: 1px; overflow: hidden; flex: 1;`;
        infoDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${p.isDead ? '#e74c3c' : '#38ef7d'}; flex-shrink: 0; box-shadow: 0 0 4px ${p.isDead ? '#e74c3c' : '#38ef7d'};"></span>
                <span style="font-size: 10.5px; font-weight: 700; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                    ${p.username || 'Anonymous'}
                </span>
                ${roleBadge}
            </div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 8.5px; color: #aaa;">
                <span>ðŸ“ ${p.worldX || 0}, ${p.worldY || 0}</span>
                ${distText}
            </div>
            <!-- HP Bar -->
            <div style="width: 100%; height: 2.5px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-top: 1px;">
                <div style="width: ${hpPercent}%; height: 100%; background: ${hpColor};"></div>
            </div>
        `;

        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = `display: flex; gap: 3px; align-items: center; flex-shrink: 0;`;
        actionsDiv.onclick = (e) => e.stopPropagation();
        actionsDiv.innerHTML = `
            <button class="god-quick-btn" title="Goto (Teleport)" data-action="admin_teleport" data-target="${p.gameId || p.id}" style="padding: 3px 5px; font-size: 9px; background: #9b59b6; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-weight: bold; transition: 0.15s;">ðŸš€</button>
            <button class="god-quick-btn" title="Bring (Summon)" data-action="admin_summon" data-target="${p.gameId || p.id}" style="padding: 3px 5px; font-size: 9px; background: #3498db; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-weight: bold; transition: 0.15s;">ðŸ§²</button>
        `;

        row.appendChild(avatarCanvas);
        row.appendChild(infoDiv);
        row.appendChild(actionsDiv);

        row.onclick = () => {
            selectGodTarget(p);
        };

        actionsDiv.querySelectorAll('.god-quick-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const target = btn.getAttribute('data-target');
                if (adminTargetIdInput) adminTargetIdInput.value = target;
                selectGodTarget(p);
                sendAdminCommand(action);
            };
        });

        godPlayersList.appendChild(row);
    });
}
window.renderGodOnlinePlayers = renderGodOnlinePlayers;

// Modal lifecycle & controls
if (appGodPanel && godModal && closeGodModal && godPointerBtn) {

    appGodPanel.addEventListener('click', () => {
        if (typeof hideTrayForModal === 'function') hideTrayForModal();
        godModal.style.display = 'flex';
        if (typeof clampGodModalToViewport === 'function') clampGodModalToViewport();
        requestGodOnlinePlayers();
        if (godRefreshTimer) clearInterval(godRefreshTimer);
        godRefreshTimer = setInterval(() => {
            if (godModal.style.display !== 'none') {
                requestGodOnlinePlayers();
            } else {
                clearInterval(godRefreshTimer);
            }
        }, 3000);
    });

    closeGodModal.addEventListener('click', () => {
        godModal.style.display = 'none';
        if (typeof restoreTrayAfterModal === 'function') restoreTrayAfterModal();
        if (godRefreshTimer) clearInterval(godRefreshTimer);
    });

    if (godRefreshPlayersBtn) {
        godRefreshPlayersBtn.addEventListener('click', () => {
            godRefreshPlayersBtn.style.transform = 'rotate(180deg)';
            godRefreshPlayersBtn.style.transition = 'transform 0.3s ease';
            setTimeout(() => {
                godRefreshPlayersBtn.style.transform = 'none';
                godRefreshPlayersBtn.style.transition = 'none';
            }, 300);
            requestGodOnlinePlayers();
        });
    }

    if (godPlayerSearch) {
        godPlayerSearch.addEventListener('input', () => {
            renderGodOnlinePlayers();
        });
    }

    if (godClearTargetBtn) {
        godClearTargetBtn.addEventListener('click', () => {
            clearGodTarget();
        });
    }

    godPointerBtn.addEventListener('click', () => {
        godPointerActive = !godPointerActive;
        if (godPointerActive) {
            godPointerBtn.style.background = "#e74c3c";
            godPointerBtn.innerText = "ðŸ”´ Puntero Activado";
            const c = document.getElementById('gameCanvas');
            if (c) c.style.cursor = 'crosshair';
        } else {
            godPointerBtn.style.background = "#34495e";
            godPointerBtn.innerText = "ðŸª„ Activar Puntero MÃ¡gico";
            const c = document.getElementById('gameCanvas');
            if (c) c.style.cursor = 'default';
        }
    });

    if (adminSummonBtn) adminSummonBtn.addEventListener('click', () => sendAdminCommand('admin_summon'));
    if (adminTeleportBtn) adminTeleportBtn.addEventListener('click', () => sendAdminCommand('admin_teleport'));
    if (adminKickBtn) adminKickBtn.addEventListener('click', () => sendAdminCommand('admin_kick'));
    if (adminRespawnBtn) adminRespawnBtn.addEventListener('click', () => sendAdminCommand('admin_respawn'));

// JAIL LOGIC
const adminFreezeBtn = document.getElementById('admin-freeze-btn');
const adminJailBtn = document.getElementById('admin-jail-btn');

const adminJailModal = document.getElementById('admin-jail-modal');
const closeJailModal = document.getElementById('close-jail-modal');
const jailTargetId = document.getElementById('jail-target-id');
const jailCategoryBtns = document.querySelectorAll('.jail-category-btn');
const jailDuration = document.getElementById('jail-duration');
const jailDescription = document.getElementById('jail-description');
const submitJailBtn = document.getElementById('submit-jail-btn');

if (adminFreezeBtn) {
    adminFreezeBtn.addEventListener('click', () => {
        sendAdminCommand('admin_freeze');
        if (adminFreezeBtn.innerText.includes('Unfreeze')) {
            adminFreezeBtn.innerHTML = '❄️ Freeze';
        } else {
            adminFreezeBtn.innerHTML = '❄️ Unfreeze';
        }
    });
}
if (adminTargetIdInput) {
    adminTargetIdInput.addEventListener('input', () => {
        if (adminFreezeBtn) adminFreezeBtn.innerHTML = '❄️ Freeze';
    });
}

if (adminJailBtn) {
    adminJailBtn.addEventListener('click', () => {
        const tid = adminTargetIdInput.value.trim();
        if (!tid) return alert("Ingresa un Target ID primero.");
        jailTargetId.value = tid;
        adminJailModal.style.display = 'flex';
    });
}

if (closeJailModal) {
    closeJailModal.addEventListener('click', () => adminJailModal.style.display = 'none');
}

jailCategoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        jailCategoryBtns.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'rgba(0,0,0,0.5)';
            b.style.borderColor = 'rgba(255,255,255,0.2)';
            b.style.color = '#aaa';
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(142, 68, 173, 0.2)';
        btn.style.borderColor = '#9b59b6';
        btn.style.color = 'white';
    });
});

if (submitJailBtn) {
    submitJailBtn.addEventListener('click', () => {
        const activeBtn = Array.from(jailCategoryBtns).find(b => b.classList.contains('active'));
        const reason = activeBtn ? activeBtn.getAttribute('data-category') : 'Otro';
        const durationMins = parseInt(jailDuration.value) || 15;
        const desc = jailDescription.value.trim();
        
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({
                type: 'admin_jail',
                targetGameId: jailTargetId.value,
                reason: reason,
                duration: durationMins,
                desc: desc
            }));
            if (typeof showRetroDialog === "function") showRetroDialog("?? Sentencia enviada a los servidores centrales.");
            else alert("Sentencia enviada.");
            adminJailModal.style.display = 'none';
            jailDescription.value = "";
        }
    });
}

    if (adminAnnounceBtn && adminAnnounceInput) {
        adminAnnounceBtn.addEventListener('click', () => {
            const msg = adminAnnounceInput.value.trim();
            if (!msg) return;
            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'admin_announce', message: msg }));
                adminAnnounceInput.value = "";
            }
        });
    }

    // --- ADMIN TOOLS TOGGLES ---
    if (adminInvisBtn) {
        adminInvisBtn.addEventListener('click', () => {
            window.adminInvisible = !window.adminInvisible;
            adminInvisBtn.innerText = `Toggle Invisible (${window.adminInvisible ? 'ON' : 'OFF'})`;
            adminInvisBtn.style.background = window.adminInvisible ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.1)';
            adminInvisBtn.style.borderColor = window.adminInvisible ? '#2ecc71' : '#aaa';

            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'admin_invisible', enabled: window.adminInvisible }));
            }
        });
    }

    if (adminNoclipBtn) {
        adminNoclipBtn.addEventListener('click', () => {
            window.adminNoclip = !window.adminNoclip;
            adminNoclipBtn.innerText = `Toggle Noclip (${window.adminNoclip ? 'ON' : 'OFF'})`;
            adminNoclipBtn.style.background = window.adminNoclip ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.1)';
            adminNoclipBtn.style.borderColor = window.adminNoclip ? '#2ecc71' : '#aaa';

            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'admin_noclip', enabled: window.adminNoclip }));
            }
        });
    }

    if (adminClearArenasBtn) {
        adminClearArenasBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to nuke all minigame arenas? This will clear all ghost minigames.")) {
                if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'admin_clearenas' }));
                }
            }
        });
    }
}

// Interceptar clics en el juego cuando el god mode esta abierto
const canvasElem = document.getElementById('gameCanvas');
if (canvasElem) {
    canvasElem.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        // 1. Si el puntero magico esta activo (Event Maker)
        if (godPointerActive && typeof player !== 'undefined' && player && (player.role || '').toLowerCase() === 'admin') {
            e.stopPropagation();
            if (typeof getWorldGridXY === 'function') {
                const gridPos = getWorldGridXY(e.clientX, e.clientY);

                if (typeof worldMap !== 'undefined') {
                    for (let l = 15; l >= 0; l--) {
                        const key = `${gridPos.x},${gridPos.y},${l}`;
                        if (worldMap[key]) {
                            const newCollisionState = !worldMap[key].hasCollision;
                            worldMap[key].hasCollision = newCollisionState;

                            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(MessagePack.encode({
                                    type: 'update_tile_metadata',
                                    x: gridPos.x, y: gridPos.y, layer: l,
                                    hasCollision: newCollisionState, isSit: worldMap[key].isSit
                                }));
                            }

                            if (typeof spawnDamageText === 'function') {
                                spawnDamageText(gridPos.x * TILE_SIZE, gridPos.y * TILE_SIZE, newCollisionState ? "LOCKED" : "OPEN", newCollisionState);
                            }
                            break;
                        }
                    }
                }
            }
            return;
        }

        // 2. Si el panel de dios esta abierto y hacemos click normal, detectar jugador
        if (godModal && godModal.style.display !== 'none' && typeof player !== 'undefined' && player && (player.role || '').toLowerCase() === 'admin') {
            const screenCenterX = window.innerWidth / 2;
            const screenCenterY = window.innerHeight / 2;

            if (typeof otherPlayers !== 'undefined') {
                for (let id in otherPlayers) {
                    const enemy = otherPlayers[id];
                    if (!enemy || enemy.worldX === undefined) continue;

                    const zoom = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
                    const eScreenX = screenCenterX + ((enemy.worldX - player.worldX) * zoom);
                    const eScreenY = screenCenterY + ((enemy.worldY - player.worldY) * zoom);

                    const dist = Math.hypot(e.clientX - eScreenX, e.clientY - eScreenY);
                    if (dist < 40 * zoom) {
                        selectGodTarget(enemy);
                        if (typeof spawnDamageText === 'function') {
                            spawnDamageText(enemy.worldX, enemy.worldY, "TARGET ACQUIRED", true);
                        }
                        break;
                    }
                }
            }
        }
    }, true);
}

// --- LÃ“GICA DE ARRASTRE, REDIMENSIÃ“N Y PERSISTENCIA (LOCALSTORAGE) PARA LA VENTANA DE DIOS ---
const minGodBtn = document.getElementById('min-god-modal');
const godModalContent = document.getElementById('god-modal-content');
const godResizeHandle = document.getElementById('god-resize-handle');

let isDraggingGod = false;
let isResizingGod = false;
let godOffsetX = 0;
let godOffsetY = 0;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 420;
let resizeStartH = 500;
let isGodMinimized = false;
let savedExpandedWidth = 420;
let savedExpandedHeight = 500;

const GOD_STORAGE_KEY = 'god_modal_layout_v1';

function saveGodModalLayout() {
    if (!godModal) return;
    try {
        const rect = godModal.getBoundingClientRect();
        const curLeft = parseFloat(godModal.style.left) || rect.left;
        const curTop = parseFloat(godModal.style.top) || rect.top;
        
        let curW = savedExpandedWidth;
        let curH = savedExpandedHeight;
        
        if (!isGodMinimized) {
            curW = Math.round(godModal.offsetWidth || parseFloat(godModal.style.width) || savedExpandedWidth);
            curH = Math.round(godModal.offsetHeight || parseFloat(godModal.style.height) || savedExpandedHeight);
            savedExpandedWidth = curW;
            savedExpandedHeight = curH;
        }

        const layout = {
            left: Math.round(curLeft),
            top: Math.round(curTop),
            width: curW,
            height: curH,
            isMinimized: !!isGodMinimized
        };

        localStorage.setItem(GOD_STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
        console.warn('Could not save god modal layout:', e);
    }
}

function loadGodModalLayout() {
    if (!godModal) return;
    try {
        const raw = localStorage.getItem(GOD_STORAGE_KEY);
        if (!raw) return;
        const layout = JSON.parse(raw);
        if (!layout || typeof layout !== 'object') return;

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const w = Math.min(Math.max(Number(layout.width) || 420, 320), Math.max(320, winW - 16));
        const h = Math.min(Math.max(Number(layout.height) || 500, 200), Math.max(200, winH - 16));

        savedExpandedWidth = w;
        savedExpandedHeight = h;

        let left = Number(layout.left);
        let top = Number(layout.top);

        if (isNaN(left) || left < 0) left = 20;
        if (isNaN(top) || top < 0) top = 100;

        if (left + w > winW) left = Math.max(0, winW - w - 8);
        if (top + (layout.isMinimized ? 40 : h) > winH) top = Math.max(0, winH - (layout.isMinimized ? 40 : h) - 8);

        godModal.style.left = left + 'px';
        godModal.style.top = top + 'px';
        godModal.style.width = w + 'px';
        godModal.setAttribute('data-custom-size', 'true');

        if (layout.isMinimized) {
            isGodMinimized = true;
            if (godModalContent) godModalContent.style.display = 'none';
            if (godResizeHandle) godResizeHandle.style.display = 'none';
            godModal.style.height = 'auto';
            if (minGodBtn) minGodBtn.innerText = 'âž•';
        } else {
            isGodMinimized = false;
            if (godModalContent) godModalContent.style.display = 'flex';
            if (godResizeHandle) godResizeHandle.style.display = 'flex';
            godModal.style.height = h + 'px';
            if (minGodBtn) minGodBtn.innerText = 'âž–';
        }
    } catch (e) {
        console.warn('Could not load god modal layout:', e);
    }
}

// Clamp modal to visible viewport on window resize
function clampGodModalToViewport() {
    if (!godModal || godModal.style.display === 'none') return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let curLeft = parseFloat(godModal.style.left) || godModal.offsetLeft;
    let curTop = parseFloat(godModal.style.top) || godModal.offsetTop;
    let curW = parseFloat(godModal.style.width) || godModal.offsetWidth;
    let curH = isGodMinimized ? 40 : (parseFloat(godModal.style.height) || godModal.offsetHeight);

    if (curW > winW - 16) {
        curW = Math.max(320, winW - 16);
        godModal.style.width = curW + 'px';
    }
    if (!isGodMinimized && curH > winH - 16) {
        curH = Math.max(200, winH - 16);
        godModal.style.height = curH + 'px';
    }

    if (curLeft + curW > winW) curLeft = Math.max(0, winW - curW - 8);
    if (curTop + curH > winH) curTop = Math.max(0, winH - curH - 8);
    if (curLeft < 0) curLeft = 0;
    if (curTop < 0) curTop = 0;

    godModal.style.left = curLeft + 'px';
    godModal.style.top = curTop + 'px';
}

window.addEventListener('resize', clampGodModalToViewport);

if (godDragHandle && godModal) {

    // 1. Minimizar / Restaurar
    if (minGodBtn && godModalContent) {
        minGodBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isGodMinimized = !isGodMinimized;
            if (isGodMinimized) {
                // Save current expanded dimensions first
                savedExpandedWidth = Math.round(godModal.offsetWidth || parseFloat(godModal.style.width) || savedExpandedWidth);
                savedExpandedHeight = Math.round(godModal.offsetHeight || parseFloat(godModal.style.height) || savedExpandedHeight);
                
                godModalContent.style.display = 'none';
                if (godResizeHandle) godResizeHandle.style.display = 'none';
                godModal.style.height = 'auto';
                minGodBtn.innerText = 'âž•';
            } else {
                godModalContent.style.display = 'flex';
                if (godResizeHandle) godResizeHandle.style.display = 'flex';
                godModal.style.height = savedExpandedHeight + 'px';
                godModal.style.width = savedExpandedWidth + 'px';
                minGodBtn.innerText = 'âž–';
            }
            saveGodModalLayout();
        });
    }

    // 2. Arrastre de Ventana con Pointer Events
    godDragHandle.addEventListener('pointerdown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        
        isDraggingGod = true;
        godModal.classList.add('god-is-dragging');
        const rect = godModal.getBoundingClientRect();
        godOffsetX = e.clientX - rect.left;
        godOffsetY = e.clientY - rect.top;
        godDragHandle.style.cursor = 'grabbing';
        godDragHandle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    godDragHandle.addEventListener('pointermove', (e) => {
        if (!isDraggingGod) return;
        let newX = e.clientX - godOffsetX;
        let newY = e.clientY - godOffsetY;

        const maxW = window.innerWidth - godModal.offsetWidth;
        const maxH = window.innerHeight - godModal.offsetHeight;

        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX > maxW) newX = Math.max(0, maxW);
        if (newY > maxH) newY = Math.max(0, maxH);

        godModal.style.left = newX + 'px';
        godModal.style.top = newY + 'px';
    });

    const stopDragging = (e) => {
        if (!isDraggingGod) return;
        isDraggingGod = false;
        godModal.classList.remove('god-is-dragging');
        godDragHandle.style.cursor = 'grab';
        try {
            godDragHandle.releasePointerCapture(e.pointerId);
        } catch (err) {}
        saveGodModalLayout();
    };

    godDragHandle.addEventListener('pointerup', stopDragging);
    godDragHandle.addEventListener('pointercancel', stopDragging);

    // Double click header to reset default position & size
    godDragHandle.addEventListener('dblclick', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        godModal.style.left = '20px';
        godModal.style.top = '100px';
        savedExpandedWidth = 420;
        savedExpandedHeight = 500;
        godModal.style.width = savedExpandedWidth + 'px';
        if (!isGodMinimized) {
            godModal.style.height = savedExpandedHeight + 'px';
        }
        godModal.removeAttribute('data-custom-size');
        saveGodModalLayout();
    });

    // 3. RedimensiÃ³n de Ventana (Resize Handle en la esquina)
    if (godResizeHandle) {
        godResizeHandle.addEventListener('pointerdown', (e) => {
            if (isGodMinimized) return;
            isResizingGod = true;
            godModal.classList.add('god-is-resizing');
            
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            resizeStartW = godModal.offsetWidth;
            resizeStartH = godModal.offsetHeight;

            godResizeHandle.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        });

        godResizeHandle.addEventListener('pointermove', (e) => {
            if (!isResizingGod) return;
            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;

            const modalLeft = godModal.offsetLeft;
            const modalTop = godModal.offsetTop;

            const minW = 320;
            const minH = 200;
            const maxW = window.innerWidth - modalLeft - 10;
            const maxH = window.innerHeight - modalTop - 10;

            const newW = Math.max(minW, Math.min(maxW, resizeStartW + deltaX));
            const newH = Math.max(minH, Math.min(maxH, resizeStartH + deltaY));

            godModal.style.width = newW + 'px';
            godModal.style.height = newH + 'px';
            savedExpandedWidth = newW;
            savedExpandedHeight = newH;
            godModal.setAttribute('data-custom-size', 'true');
        });

        const stopResizing = (e) => {
            if (!isResizingGod) return;
            isResizingGod = false;
            godModal.classList.remove('god-is-resizing');
            try {
                godResizeHandle.releasePointerCapture(e.pointerId);
            } catch (err) {}
            saveGodModalLayout();
        };

        godResizeHandle.addEventListener('pointerup', stopResizing);
        godResizeHandle.addEventListener('pointercancel', stopResizing);
    }

    // Inicializar posiciÃ³n y tamaÃ±o guardado
    loadGodModalLayout();
}

