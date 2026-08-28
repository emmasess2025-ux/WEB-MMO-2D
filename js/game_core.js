// --- SEPARAMOS EL ANCHO Y EL ALTO ---
const FRAME_SIZE = 48; // Regresamos a 48 porque es el tamaÃ±o real de cada celda de tu sprite
// --- SEPARAMOS EL ANCHO Y EL ALTO ---
const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 64;
let centralBase = null;

// FIX: Función global para que el motor lea todas las bases del mapa
window.getAllTurfBases = function() {
    return window.turfBases ? Object.values(window.turfBases) : [];
};
let RANKS = [];
let unreadGlobalMessages = 0;

let fpsHistory = [];
let lastResolutionCheck = 0;
let dynamicRenderScale = 1.0;
// --- MEMORIA DE NAVEGACIÃ“N DE MODALES ---
let lastProfileSource = 'game'; // Puede ser 'game', 'friends', 'squad'
let lastPmSource = 'inbox';     // Puede ser 'inbox', 'profile'

// Le dice al cÃ³digo en quÃ© FILA empieza cada animaciÃ³n
const SKELETON_DATA = {
    states: {
        "idle": 0,           // Filas 0 a 3
        "walk_armed": 4,     // Filas 4 a 7
        "walk_unarmed": 8,   // Filas 8 a 11
        "sit": 12            // Filas 12 a 15
    },
    anchors: {}
};

// FunciÃ³n para obtener la llave de un anclaje especÃ­fico
function getFrameKey(state, dir, frameX) {
    return `${state}_${dir}_${frameX}`;
}
// ðŸš€ EL FIX DE RENDIMIENTO: Lluvia reciclable (Object Pool)
const MAX_RAIN = 150;
window.rainParticles = Array.from({ length: MAX_RAIN }, () => ({
    active: false, x: 0, y: 0, targetY: 0, len: 0, vx: 0, vy: 0, isSplashing: false, splashLife: 0
}));
var canvas = window.canvas || document.getElementById('gameCanvas');
var ctx = window.ctx || (canvas ? canvas.getContext('2d') : null);
window.canvas = canvas;
window.ctx = ctx;

// --- NUEVO: LIENZO INVISIBLE PARA EL FLASH DE DAÃ‘O ---
const flashCanvas = document.createElement('canvas');
const flashCtx = flashCanvas.getContext('2d');
const safeZoneUI = document.getElementById('safezone-ui'); // <--- PEGA ESTA LÃ NEA AQUÃ 

// --- VARIABLES DE LA PANTALLA DE CARGA ---
let isCinematicLoading = true;
let cinematicTimer = 0;
let totalAssetsToLoad = 0;
let assetsLoaded = 0;


let visualProgress = 0;
let isVisualDone = false;

function animateLoadingBar() {
    if (isVisualDone) return;
    const fill = document.getElementById('loading-bar-fill');
    const targetPct = (totalAssetsToLoad > 0) ? ((assetsLoaded / totalAssetsToLoad) * 100) : 0;
    
    visualProgress += (targetPct - visualProgress) * 0.08;
    if (visualProgress < 95 && targetPct > 0) visualProgress += 0.3;
    if (visualProgress > targetPct && targetPct < 100) visualProgress = targetPct;
    if (visualProgress >= 99.5 && targetPct === 100) visualProgress = 100;

    if (fill) fill.style.width = visualProgress + '%';

    if (visualProgress >= 100 && targetPct === 100) {
        isVisualDone = true;
        const txt = document.getElementById('loading-text');
        if (txt) txt.innerText = "¡Mundo Listo!";
        setTimeout(() => {
            const screen = document.getElementById('loading-screen');
            if (screen) screen.style.opacity = '0';
            setTimeout(() => {
                if (screen) screen.style.display = 'none';
                isCinematicLoading = false;
                floorDirty = false;
                if (typeof authOverlay !== 'undefined' && authOverlay) {
                    authOverlay.style.display = 'none';
                    authOverlay.style.opacity = '0';
                    authOverlay.style.pointerEvents = 'none';
                }
            }, 800);
        }, 800);
    } else {
        requestAnimationFrame(animateLoadingBar);
    }
}
requestAnimationFrame(animateLoadingBar);

function updateLoadingBar(text) {
    const txt = document.getElementById('loading-text');
    if (txt && text) txt.innerText = text;
}

// --- 0. MULTI-TILESET & MAP EDITOR SHARED STATE (Initialized in js/ui_admin.js) ---
const floorChunks = new Map();
const overheadChunks = new Map();
const dirtyChunks = new Set();

let chunksBakedZoom = 0; // Track zoom level

function markChunkDirty(tileX, tileY) {
    const cx = Math.floor(tileX / CHUNK_SIZE);
    const cy = Math.floor(tileY / CHUNK_SIZE);
    dirtyChunks.add(`${cx},${cy}`);
}

function rebakeChunk(cx, cy) {
    const chunkKey = `${cx},${cy}`;
    let fCanvas = floorChunks.get(chunkKey);
    let fCtx;
    let oCanvas = overheadChunks.get(chunkKey);
    let oCtx;

    const chunkPixelSize = CHUNK_SIZE * TILE_SIZE;

    // ðŸ›‘ OPTIMIZACIÃ“N: Solo crear oCanvas si de verdad hay tiles aÃ©reos en este chunk
    let hasOverhead = false;
    const startX = cx * CHUNK_SIZE;
    const startY = cy * CHUNK_SIZE;

    for (let r = startY; r < startY + CHUNK_SIZE; r++) {
        for (let c = startX; c < startX + CHUNK_SIZE; c++) {
            for (let l = 8; l <= 11; l++) {
                if (worldMap.has(`${c},${r},${l}`)) {
                    hasOverhead = true;
                    break;
                }
            }
            if (hasOverhead) break;
        }
        if (hasOverhead) break;
    }

    if (!fCanvas) {
        fCanvas = document.createElement('canvas');
        fCanvas.width = chunkPixelSize;
        fCanvas.height = chunkPixelSize;
        fCtx = fCanvas.getContext('2d', { alpha: true });
        fCtx.imageSmoothingEnabled = false;
        floorChunks.set(chunkKey, fCanvas);

        if (hasOverhead) {
            oCanvas = document.createElement('canvas');
            oCanvas.width = chunkPixelSize;
            oCanvas.height = chunkPixelSize;
            oCtx = oCanvas.getContext('2d', { alpha: true });
            oCtx.imageSmoothingEnabled = false;
            overheadChunks.set(chunkKey, oCanvas);
        } else {
            overheadChunks.delete(chunkKey);
        }
    } else {
        fCtx = fCanvas.getContext('2d');
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        if (oCanvas) {
            oCtx = oCanvas.getContext('2d');
            oCtx.clearRect(0, 0, oCanvas.width, oCanvas.height);
        }
    }

    // Dibujar solo los tiles que pertenecen a este chunk en escala 1:1 (PERFECT PIXEL)
    for (let r = startY; r < startY + CHUNK_SIZE; r++) {
        for (let c = startX; c < startX + CHUNK_SIZE; c++) {
            for (let l = 0; l <= 14; l++) {
                const tileData = worldMap.get(`${c},${r},${l}`);
                if (!tileData) continue;

                let targetCtx = (l >= 8 && l <= 11) ? oCtx : fCtx;
                if (!targetCtx) continue;

                const tsData = getTilesetData(tileData.tileId);
                if (!tsData || !tsData.img) continue;

                const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;

                const drawX = (c - startX) * TILE_SIZE;
                const drawY = (r - startY) * TILE_SIZE;

                const tileRot = tileData.rotation || 0;

                if (tileRot !== 0) {
                    targetCtx.save();
                    targetCtx.translate(drawX + TILE_SIZE / 2, drawY + TILE_SIZE / 2);
                    targetCtx.rotate(tileRot * Math.PI / 180);
                    targetCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE,
                        -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
                    targetCtx.restore();
                } else {
                    targetCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE,
                        drawX, drawY, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }
}

// ðŸš€ EL FIX FÃSICO: Map() y Claves NumÃ©ricas
const worldMap = new Map();

function getMapKey(x, y, l) {
    return `${x},${y},${l}`;
}
let safeZones = [];   // <--- NUEVO: MEMORIA DE ZONAS SEGURAS
// 1. PRIMERO declaramos la variable para saber si es celular
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
// ðŸš€ EL FIX DE RENDIMIENTO MÃXIMO: OFFSCREEN CANVAS (CACHE DEL SUELO)
const floorCanvas = document.createElement('canvas');
const floorCtx = floorCanvas.getContext('2d');
const overheadCanvas = document.createElement('canvas'); // ðŸŒŸ NUEVO
const overheadCtx = overheadCanvas.getContext('2d');     // ðŸŒŸ NUEVO
let floorDirty = true; // Nos dice si necesitamos tomar una nueva "foto"
let floorBufferBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
// ðŸš€ FIX JITTER MÃ“VIL: currentBufferMargin dinÃ¡mico calculado segÃºn la VRAM
let currentBufferMargin = isTouchDevice ? 6 : 12;

// ðŸ“± PRE-BAKED ZOOM: the floor canvas is drawn at zoomLevel resolution so the main
// ctx.drawImage is always 1:1 (no scaling) â€” this is the Safari/iOS killer fix.
let floorBakedZoom = 0; // Track what zoom the buffer was baked at

function updateFloorBuffer() {
    const screenWidthWorld = cachedScreenWidth / zoomLevel;
    const screenHeightWorld = cachedScreenHeight / zoomLevel;
    const centerCol = Math.floor(player.worldX / TILE_SIZE);
    const centerRow = Math.floor(player.worldY / TILE_SIZE);
    const halfCols = Math.ceil(screenWidthWorld / TILE_SIZE / 2);
    const halfRows = Math.ceil(screenHeightWorld / TILE_SIZE / 2);

    floorBufferBox.minX = centerCol - halfCols - currentBufferMargin;
    floorBufferBox.maxX = centerCol + halfCols + currentBufferMargin;
    floorBufferBox.minY = centerRow - halfRows - currentBufferMargin;
    floorBufferBox.maxY = centerRow + halfRows + currentBufferMargin;

    // ðŸ“± PRE-BAKE AT ZOOM: canvas is sized in screen pixels, not world pixels.
    // This makes the final drawImage a 1:1 blit (zero scaling cost on Safari).
    const bakeZoom = zoomLevel;
    const tilesW = (floorBufferBox.maxX - floorBufferBox.minX);
    const tilesH = (floorBufferBox.maxY - floorBufferBox.minY);
    const newW = Math.ceil(tilesW * TILE_SIZE * bakeZoom);
    const newH = Math.ceil(tilesH * TILE_SIZE * bakeZoom);

    if (floorCanvas.width !== newW || floorCanvas.height !== newH) {
        floorCanvas.width = newW; floorCanvas.height = newH;
        overheadCanvas.width = newW; overheadCanvas.height = newH;
    }

    floorBakedZoom = bakeZoom;

    floorCtx.clearRect(0, 0, newW, newH);
    overheadCtx.clearRect(0, 0, newW, newH);
    floorCtx.imageSmoothingEnabled = false;
    overheadCtx.imageSmoothingEnabled = false;

    const tileDrawSize = TILE_SIZE * bakeZoom;

    for (let l = 0; l <= 14; l++) {
        const targetCtx = (l <= 7) ? floorCtx : overheadCtx;

        for (let r = floorBufferBox.minY; r <= floorBufferBox.maxY; r++) {
            for (let c = floorBufferBox.minX; c <= floorBufferBox.maxX; c++) {
                const tileData = worldMap.get(getMapKey(c, r, l));
                if (!tileData) continue;

                const tsData = getTilesetData(tileData.tileId);
                if (!tsData || !tsData.img) continue;

                const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;
                // ðŸ§± THE WOBBLE FIX: Calculate pixels anchored to the Absolute World, not the Buffer.
                // This guarantees tile widths NEVER oscillate when the buffer moves.
                const exactX = c * tileDrawSize;
                const exactY = r * tileDrawSize;
                const bufferStartX = Math.floor(floorBufferBox.minX * tileDrawSize);
                const bufferStartY = Math.floor(floorBufferBox.minY * tileDrawSize);

                const drawX = Math.floor(exactX) - bufferStartX;
                const drawY = Math.floor(exactY) - bufferStartY;

                // Width is exactly the difference to the next world-anchored tile
                const drawW = Math.floor((c + 1) * tileDrawSize) - Math.floor(exactX);
                const drawH = Math.floor((r + 1) * tileDrawSize) - Math.floor(exactY);

                const tileRot = tileData.rotation || 0;

                if (tileRot !== 0) {
                    targetCtx.save();
                    targetCtx.translate(drawX + drawW / 2, drawY + drawH / 2);
                    targetCtx.rotate(tileRot * Math.PI / 180);
                    targetCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE,
                        -drawW / 2, -drawH / 2, drawW, drawH);
                    targetCtx.restore();
                } else {
                    targetCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE,
                        drawX, drawY, drawW, drawH);
                }
            }
        }
    }
    floorDirty = false;
}

// Disable the right-click / long-press context menu everywhere
window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
}, false);

// --- ZOOM LOGIC ---
let zoomLevel = 2;
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 2.9;     // Increased maximum zoom
const ZOOM_STEP = 0.23;  // Allows half-steps for finer zooming
let initialPinchDistance = null;

canvas.addEventListener('touchstart', (e) => {
    // Kills the iOS double-tap magnifier bubble instantly
    e.preventDefault();

    // Detect two fingers for pinching
    if (e.touches.length === 2) {
        initialPinchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance) {
        e.preventDefault(); // Stop the whole browser page from zooming

        const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );

        const pinchDiff = currentDistance - initialPinchDistance;

        // Snap the zoom in or out if fingers moved more than 40 pixels
        if (pinchDiff > 40 && zoomLevel < MAX_ZOOM) {
            zoomLevel += ZOOM_STEP;
            initialPinchDistance = currentDistance;
        } else if (pinchDiff < -40 && zoomLevel > MIN_ZOOM) {
            zoomLevel -= ZOOM_STEP;
            initialPinchDistance = currentDistance;
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }
});

// (PC Inputs handled in js/input_pc.js)
const player = {
    worldX: 0,
    worldY: 0,
    speed: 4,
    vx: 0,
    vy: 0,
    message: "",
    messageTimer: 0,
    isTyping: false,

    frameX: 0,
    frameY: 0,
    tickCount: 0,
    ticksPerFrame: 5,
    isMoving: false,
    isTeleporting: false,
    currentImage: null,

    hotbar: ["none", "none", "none"],
    activeSlot: 0,
    equippedWeapon: "none",

    quickSwaps: [],

    // --- THE FIX: Give guests an inventory so the bag doesn't crash! ---
    inventory: ["ghost_gun"],

    // --- NUEVOS STATS DE COMBATE ---
    hp: 100,
    maxHp: 100,
    coins: 0, // <--- NUEVO
    ammo: 0,
    weaponAmmo: {}, // ðŸ’¾ Â¡NUEVO! Memoria de los cargadores
    isReloading: false,
    lastShotX: 0,
    lastShotY: 0,
    lastHitTime: 0, // <--- Â¡NUEVO!
    isDead: false // <--- Â¡NUEVO ESTADO!

};

// --- NEW: PROJECTILE DATA & WEAPONS DB ---
let WEAPONS = {}; // Â¡El servidor llenarÃ¡ esto mÃ¡gicamente al conectar!
// ðŸš€ EL FIX DE RENDIMIENTO: Pool de 100 Balas pre-fabricadas
const MAX_PROJECTILES = 100;
const projectiles = Array.from({ length: MAX_PROJECTILES }, () => ({
    active: false, // Â¡La bandera mÃ¡gica!
    x: 0, y: 0, vx: 0, vy: 0, life: 0, owner: null, weapon: null, color: "#f1c40f"
}));
// ðŸš€ EL FIX DE RENDIMIENTO (OBJECT POOLS): Textos y Chispas reciclables
const MAX_FX = 30;
const damageTexts = Array.from({ length: MAX_FX }, () => ({
    active: false, x: 0, y: 0, text: "", color: "", life: 0, maxLife: 0
}));
const hitSparks = Array.from({ length: MAX_FX }, () => ({
    active: false, x: 0, y: 0, life: 0, maxLife: 0, color: ""
}));

// ðŸ’¥ NUEVA FUNCIÃ“N PARA RECICLAR CHISPAS
function spawnSpark(x, y, life, color) {
    for (let i = 0; i < MAX_FX; i++) {
        if (!hitSparks[i].active) {
            hitSparks[i].active = true;
            hitSparks[i].x = x; hitSparks[i].y = y;
            hitSparks[i].life = life; hitSparks[i].maxLife = life;
            hitSparks[i].color = color;
            return;
        }
    }
}
let isShooting = false;
let shootAngle = 0;
let lastShotTime = 0;
// (Borramos el FIRE_RATE fijo, ahora viene de la tabla WEAPONS)
const metalsSpritesheet = new Image();
metalsSpritesheet.src = "items/jobs/metals/metals.png"; // Tu PNG de 128x32

let digHoles = []; // Memoria temporal para los hoyos en el piso
let CLIENT_METALS_CATALOG = [];

let groundItems = {};
const baseSpriteCache = {}; // <--- ðŸŒŸ CACHÃ‰ DE LA BASE MÃGICA ðŸŒŸ
const trashSpritesheet = new Image();
trashSpritesheet.src = "items/jobs/junkyard/trash.png"; // Tu PNG custom de 128x32
// Este arreglo asume que la animaciÃ³n tiene 8 frames.

const bodyImg = new Image();
bodyImg.src = 'items/players/body/B_D.png'; // Tu archivo de cuerpo

const headImg = new Image();
headImg.src = 'items/players/head/H_D.png'; // Tu archivo de cabezas

// --- DICCIONARIO DINÃMICO DE ARMAS ---
const loadedWeaponSprites = {};

// Add equipped weapon to local player state
player.equippedWeapon = "none";

// --- MULTIPLAYER LOGIC ---
const otherPlayers = {};
let myId = null;
// --- BASE DE DATOS DE ARMAS EN EL CLIENTE ---
let weaponsDB = {};

// ðŸŒŸ SISTEMA DE LOGROS Y TAREAS ðŸŒŸ

// (Auth UI Elements handled in js/net_client.js)
// ==========================================
// ðŸš€ CACHÃ‰ DE ELEMENTOS PARA RENDIMIENTO ðŸš€
// ==========================================
const uiLoadingScreen = document.getElementById('loading-screen');
const uiFadeOverlay = document.getElementById('fade-overlay');
const uiShopPreviewCanvas = document.getElementById('shop-player-preview');
const uiSkelEditor = document.getElementById('skeleton-editor');

// (Opcional, si usas mucho el editor de animaciones)
const editSkelState = document.getElementById('edit-skel-state');
const editSkelDir = document.getElementById('edit-skel-dir');
const editSkelFrame = document.getElementById('edit-skel-frame');
// UI Elements
const menuToggle = document.getElementById('menu-toggle');
const appTray = document.getElementById('app-tray');
const appAuth = document.getElementById('app-auth'); // The Login App Icon
const closeAuthBtn = document.getElementById('close-auth-btn'); // The X on the card
let isLoggedIn = false; // Tracks if we should log in or log out
const authLoginView = document.getElementById('auth-login-view');
const authSignoutView = document.getElementById('auth-signout-view');
const confirmSignoutBtn = document.getElementById('confirm-signout-btn');
const cancelSignoutBtn = document.getElementById('cancel-signout-btn');

if (appAuth) {
    appAuth.addEventListener('click', () => {
        if (typeof hideTrayForModal === 'function') hideTrayForModal();
        const overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'auto';
        }

        if (!isLoggedIn) {
            if (authLoginView) authLoginView.style.display = 'block';
            if (authSignoutView) authSignoutView.style.display = 'none';
        } else {
            if (authLoginView) authLoginView.style.display = 'none';
            if (authSignoutView) authSignoutView.style.display = 'block';
        }
    });
}


// (Feedback & Tutorial handled in js/ui_island.js)
// === NUEVO: ARGEMS PREMIUM STORE LOGIC ===
const appArgemsBtn = document.getElementById('app-argems');
const argemsModal = document.getElementById('argems-modal');
const closeArgemsModalBtn = document.getElementById('close-argems-modal');
const argemsBalanceDisplay = document.getElementById('argems-balance-display');
const argemsStoreGrid = document.getElementById('argems-store-grid');

if (appArgemsBtn) {
    appArgemsBtn.addEventListener('click', () => {
        if (!player || !player.accountId) return alert("âš ï¸ You must log in to buy Argems.");
        hideTrayForModal();
        argemsModal.style.display = 'flex';

        // Update header balance
        argemsBalanceDisplay.innerHTML = `${player.gems || 0} <img src="items/icons/argem.png" alt="Argem" style="height: 1.2em; vertical-align: text-bottom; filter: drop-shadow(0 0 5px rgba(241,196,15,0.5)); image-rendering: pixelated; image-rendering: crisp-edges;">`;
        argemsStoreGrid.innerHTML = '<div style="color: white; text-align: center; width: 100%; grid-column: 1 / -1;">Loading packages...</div>';

        // Fetch packages from server
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'get_argem_packages' }));
        }
    });
}
if (closeArgemsModalBtn) {
    closeArgemsModalBtn.addEventListener('click', () => {
        argemsModal.style.display = 'none';
        restoreTrayAfterModal();
    });
}
// ==========================================

// --- Sign Out Confirmation Buttons ---
confirmSignoutBtn.addEventListener('click', () => {
    // FIX: Destroy the correct token name!
    localStorage.removeItem('gameToken');

    // Refresh the page to drop back in as a Guest
    window.location.reload();
});

cancelSignoutBtn.addEventListener('click', () => {
    // They changed their mind. Just close the glass card!
    authOverlay.style.display = 'none';
    authOverlay.style.opacity = '0';
    authOverlay.style.pointerEvents = 'none';
    restoreTrayAfterModal();
});

// 3. Close Auth screen if they click the 'X'
closeAuthBtn.addEventListener('click', () => {
    authOverlay.style.display = 'none';
    authOverlay.style.opacity = '0';
    authOverlay.style.pointerEvents = 'none';
    // ðŸ‘‡ NUEVO: Aterrizar el dron si entras como invitado ðŸ‘‡
    isCinematicLoading = false;
    restoreTrayAfterModal();
});

// (Optional but nice) Close the app tray if they click the canvas
canvas.addEventListener('touchstart', (e) => {
    if (appTray.classList.contains('open') && e.touches.length === 1) {
        appTray.classList.remove('open');
    }
}, { passive: false });


// Connect to the live cloud server
//const ws = new WebSocket('wss://my-chat-server-ihxw.onrender.com');

// Connect locally for testing the database
//const ws = new WebSocket('ws://localhost:8080');

// (Network Client & Packet Router handled in js/net_client.js)

let lastNetworkString = "";

function spawnDamageText(x, y, amount, isHeal = false) {
    let textToShow;

    // Si es un nÃºmero puro (ej. daÃ±o o curaciÃ³n), hacemos la matemÃ¡tica normal
    if (typeof amount === 'number') {
        textToShow = isHeal ? "+" + Math.abs(amount) : Math.abs(amount).toString();
    } else {
        // Si ya es un texto con letras (ej. "+1 Kill"), lo dejamos exactamente como viene
        textToShow = amount;
    }

    // Elegimos el color: Verde si es "isHeal" (recompensas/curaciÃ³n), Amarillo para daÃ±o
    let textColor = isHeal ? '#2ecc71' : '#f1c40f';

    // ðŸ›‘ EL FIX: En lugar de .push(), reciclamos un texto inactivo
    for (let i = 0; i < MAX_FX; i++) {
        if (!damageTexts[i].active) {
            damageTexts[i].active = true;
            damageTexts[i].x = x + (Math.random() * 20 - 10);
            damageTexts[i].y = y - 20;
            damageTexts[i].text = textToShow;
            damageTexts[i].color = textColor;
            damageTexts[i].life = 50;
            damageTexts[i].maxLife = 50;
            return; // Listo, salimos
        }
    }
}

// ðŸ›¡ï¸ ESCUDO ANTI-XSS: Convierte cÃ³digo malicioso en texto inofensivo
function escapeHTML(str) {
    if (!str) return "";
    return str.toString().replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

// --- BULLET SPAWNER DINÃMICO (OBJECT POOLING) ---
// lagMs: milisegundos de red transcurridos â†’ avanzamos la bala ese tiempo
// para compensar el delay y que visualmente aparezca donde deberÃ­a estar.
function spawnProjectile(startX, startY, angle, ownerId, weaponId, lagMs = 0) {
    const stats = WEAPONS[weaponId];
    if (!stats) return;

    // Busca la primera bala que estÃ© "apagada" en el cargador
    for (let i = 0; i < MAX_PROJECTILES; i++) {
        if (!projectiles[i].active) {
            const vx = Math.cos(angle) * stats.speed;
            const vy = Math.sin(angle) * stats.speed;

            // Pasos de extrapolaciÃ³n: avanzamos la bala N ms de tiempo de red
            // usando el mismo dtScale=1 base para consistencia
            const lagSteps = Math.min(lagMs / 16.67, 18); // max ~300ms = ~18 frames

            projectiles[i].active = true;
            projectiles[i].x = startX + vx * lagSteps;
            projectiles[i].y = startY + vy * lagSteps;
            projectiles[i].vx = vx;
            projectiles[i].vy = vy;
            projectiles[i].life = stats.range - lagSteps; // tambiÃ©n consume vida
            projectiles[i].owner = ownerId;
            projectiles[i].weapon = weaponId;
            projectiles[i].color = stats.color || "#f1c40f";
            return; // TerminÃ³ de disparar
        }
    }
    // Si pasas de 100 balas al mismo tiempo, el arma simplemente se encasquilla.
}

// Mobile Joystick logic moved to ui_joystick.js
// --- NEW: Helper to pick a consistent color based on a player's name ---
function getColorForString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 80%, 65%)`; // Returns a nice, bright, readable color!
}

// ðŸš€ EL FIX DE RENDIMIENTO: CachÃ© de Nombres
const nametagCache = {};

function getCachedNametagText(name, squadText, textColor, nameOpacity) {
    const key = `${name}_${squadText}_${textColor}_${nameOpacity}_${zoomLevel}`;

    if (nametagCache[key]) return nametagCache[key];

    const tCanvas = document.createElement('canvas');
    const tCtx = tCanvas.getContext('2d');
    const fontSize = 7 * zoomLevel;
    tCtx.font = `bold ${fontSize}px Arial`;

    // Medir
    const nameW = tCtx.measureText(name).width;
    const squadW = squadText ? tCtx.measureText(squadText).width : 0;
    const totalW = nameW + squadW + (10 * zoomLevel); // 10px padding extra
    const totalH = fontSize + (10 * zoomLevel);

    tCanvas.width = totalW;
    tCanvas.height = totalH;

    // Volver a aplicar la fuente porque cambiar el width resetea el ctx
    tCtx.font = `bold ${fontSize}px Arial`;
    tCtx.textBaseline = "middle";
    tCtx.lineJoin = "round";
    tCtx.lineWidth = 2.5 * zoomLevel;

    let currentX = 5 * zoomLevel; // Padding izquierdo
    const textY = totalH / 2;

    // Dibujar Nombre
    tCtx.globalAlpha = Math.max(0.1, nameOpacity - 0.4);
    tCtx.strokeStyle = "black";
    tCtx.strokeText(name, currentX, textY);

    tCtx.globalAlpha = nameOpacity;
    tCtx.fillStyle = textColor;
    tCtx.fillText(name, currentX, textY);
    currentX += nameW;

    // Dibujar Squad
    if (squadText) {
        tCtx.globalAlpha = Math.max(0.1, nameOpacity - 0.4);
        tCtx.strokeStyle = "black";
        tCtx.strokeText(squadText, currentX, textY);

        tCtx.globalAlpha = Math.max(0.1, nameOpacity - 0.15);
        tCtx.fillStyle = "white";
        tCtx.fillText(squadText, currentX, textY);
        currentX += squadW;
    }

    // Guardar info Ãºtil en el objeto canvas
    tCanvas.actualWidth = currentX;
    nametagCache[key] = tCanvas;
    return tCanvas;
}

// --- SQUAD LOGOS CACHE ---
const squadLogosCache = {}; // Guarda imÃ¡genes para no laguear

function drawNametag(playerObj, x, y, scaledWidth, scaledHeight, textColor) {
    if (!playerObj.username || !gameSettings.showNametags) return;

    const name = playerObj.username;
    const hasSquad = !!playerObj.squadName;
    const squadText = hasSquad ? ` [${playerObj.squadName}]` : "";

    // 1. Obtener la imagen ya fabricada
    const nameCanvas = getCachedNametagText(name, squadText, textColor, gameSettings.nameOpacity);

    // 2. Calcular logo
    const logoSize = 10 * zoomLevel;
    const logoGap = 4 * zoomLevel;
    const hasLogo = hasSquad && !!playerObj.squadLogo;
    const logoTotalWidth = hasLogo ? (logoGap + logoSize) : 0;

    const totalCombinedWidth = nameCanvas.actualWidth + logoTotalWidth;
    const centerX = x + (scaledWidth / 2);
    let currentX = centerX - (totalCombinedWidth / 2);

    // La Y original menos la mitad de la altura de nuestro canvas cacheado para alinearlo perfecto
    const tagY = y + scaledHeight + (-12 * zoomLevel) - (nameCanvas.height / 2);

    // 3. Pintar el nombre de 1 solo golpe
    ctx.drawImage(nameCanvas, currentX, tagY);
    currentX += nameCanvas.actualWidth;

    // 4. Dibujar Logo del Squad
    if (hasLogo) {
        currentX += logoGap;
        if (!squadLogosCache[playerObj.squadLogo]) {
            const img = new Image();
            img.src = playerObj.squadLogo;
            squadLogosCache[playerObj.squadLogo] = img;
        }
        const img = squadLogosCache[playerObj.squadLogo];
        if (img.complete && img.naturalWidth > 0) {
            ctx.globalAlpha = Math.max(0.1, gameSettings.nameOpacity - 0.1);
            // Alineamos el logo con el texto matemÃ¡ticamente
            ctx.drawImage(img, currentX, tagY + (nameCanvas.height / 2) - (logoSize * 0.85), logoSize, logoSize);
            ctx.globalAlpha = 1.0;
        }
    }
}
// Admin Tools logic moved to ui_admin.js
// --- UPGRADED: MAP UI & PHYSICS ---
const mapToggle = document.getElementById('map-toggle');
const mapModal = document.getElementById('map-modal');
const closeMap = document.getElementById('close-map');
const minimapCanvas = document.getElementById('minimap-canvas');
const mapPlayerCount = document.getElementById('map-player-count');
const mCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

let isMapOpen = false;

// Map Camera Variables
let minimapZoom = 4; // Acts as our MINI_TILE size
let mapOffsetX = 0;
let mapOffsetY = 0;
let isDraggingMap = false;
let lastMapTouchX = 0;
let lastMapTouchY = 0;

mapToggle.addEventListener('click', () => {
    isMapOpen = true;
    mapModal.style.display = 'flex';
    // Auto-center the map when opening
    mapOffsetX = 0; mapOffsetY = 0;
});

closeMap.addEventListener('click', () => {
    isMapOpen = false;
    mapModal.style.display = 'none';
});

// Zoom Controls
document.getElementById('map-zoom-in').onclick = () => { if (minimapZoom < 12) minimapZoom += 2; };
document.getElementById('map-zoom-out').onclick = () => { if (minimapZoom > 2) minimapZoom -= 1; };
document.getElementById('map-recenter').onclick = () => { mapOffsetX = 0; mapOffsetY = 0; };

// Swiping/Panning the Map
minimapCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        isDraggingMap = true;
        lastMapTouchX = e.touches[0].clientX;
        lastMapTouchY = e.touches[0].clientY;
    }
}, { passive: false });

minimapCanvas.addEventListener('touchmove', (e) => {
    if (isDraggingMap && e.touches.length === 1) {
        e.preventDefault(); // Stop screen scrolling
        const dx = e.touches[0].clientX - lastMapTouchX;
        const dy = e.touches[0].clientY - lastMapTouchY;

        // Move the camera offset (scaled to feel 1:1 with your finger)
        mapOffsetX -= dx * (TILE_SIZE / minimapZoom);
        mapOffsetY -= dy * (TILE_SIZE / minimapZoom);

        lastMapTouchX = e.touches[0].clientX;
        lastMapTouchY = e.touches[0].clientY;
    }
}, { passive: false });

minimapCanvas.addEventListener('touchend', () => isDraggingMap = false);

// (Notifications handled in js/ui_island.js)
// (Map & Level Editor UI handled in js/ui_map_editor.js)

// --- UPGRADED MINIMAP DRAW ENGINE (OFFSCREEN CANVAS + DIRTY FLAG) ---

// 1. Variables de Memoria RAM para el Minimapa
const minimapBgCanvas = document.createElement('canvas');
const minimapBgCtx = minimapBgCanvas.getContext('2d');
let minimapDirty = true;
let mmLastCameraX = -999999;
let mmLastCameraY = -999999;
let mmLastZoom = -1;

function drawMinimap() {
    if (!mCtx) return;

    // El nÃºmero de jugadores ahora se actualiza automÃ¡ticamente vÃ­a red (type: 'player_count')

    const cameraX = player.worldX + mapOffsetX;
    const cameraY = player.worldY + mapOffsetY;
    const scale = minimapZoom / TILE_SIZE;

    // 2. Â¿NECESITAMOS TOMAR UNA NUEVA FOTO? (Dirty Flag)
    // Si construyeron algo, cambiaste el zoom, o te moviste mÃ¡s de 16 pÃ­xeles (1 bloque)
    if (minimapDirty || mmLastZoom !== minimapZoom || Math.abs(cameraX - mmLastCameraX) > TILE_SIZE || Math.abs(cameraY - mmLastCameraY) > TILE_SIZE) {

        // Limpiamos el lienzo invisible
        minimapBgCanvas.width = minimapCanvas.width;
        minimapBgCanvas.height = minimapCanvas.height;
        minimapBgCtx.clearRect(0, 0, minimapBgCanvas.width, minimapBgCanvas.height);
        minimapBgCtx.imageSmoothingEnabled = false;

        const mapRadiusX = (minimapBgCanvas.width / 2) / scale;
        const mapRadiusY = (minimapBgCanvas.height / 2) / scale;

        const startX = Math.floor((cameraX - mapRadiusX) / TILE_SIZE);
        const endX = Math.ceil((cameraX + mapRadiusX) / TILE_SIZE);
        const startY = Math.floor((cameraY - mapRadiusY) / TILE_SIZE);
        const endY = Math.ceil((cameraY + mapRadiusY) / TILE_SIZE);

        // DIBUJAMOS TODAS LAS 16 CAPAS EN LA FOTO INVISIBLE (OperaciÃ³n Pesada)
        for (let currentLayer = 0; currentLayer <= 15; currentLayer++) {
            for (let tx = startX; tx <= endX; tx++) {
                for (let ty = startY; ty <= endY; ty++) {
                    const key = getMapKey(tx, ty, currentLayer);
                    const tileData = worldMap.get(key);
                    if (!tileData) continue;

                    const drawX = (tx * TILE_SIZE - cameraX) * scale + (minimapBgCanvas.width / 2);
                    const drawY = (ty * TILE_SIZE - cameraY) * scale + (minimapBgCanvas.height / 2);

                    const tsData = getTilesetData(tileData.tileId);
                    if (!tsData || !tsData.img) continue;

                    const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                    const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                    const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;
                    const tileRotation = tileData.rotation || 0;

                    if (tileRotation !== 0) {
                        minimapBgCtx.save();
                        const exactSize = minimapZoom;
                        minimapBgCtx.translate(drawX + (exactSize / 2), drawY + (exactSize / 2));
                        minimapBgCtx.rotate(tileRotation * Math.PI / 180);
                        minimapBgCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, -exactSize / 2, -exactSize / 2, exactSize, exactSize);
                        minimapBgCtx.restore();
                    } else {
                        minimapBgCtx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, minimapZoom, minimapZoom);
                    }
                }
            }
        }

        // Guardamos las coordenadas de donde se tomÃ³ la foto
        mmLastCameraX = cameraX;
        mmLastCameraY = cameraY;
        mmLastZoom = minimapZoom;
        minimapDirty = false;
    }

    // 3. PLASMAR LA FOTO EN LA PANTALLA REAL (Costo de CPU = 0%)
    mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    mCtx.imageSmoothingEnabled = false;

    // ðŸ”¥ El truco maestro: Si caminaste medio bloque, no tomamos una foto nueva.
    // Simplemente desplazamos la foto vieja los pÃ­xeles exactos.
    const subPixelX = (mmLastCameraX - cameraX) * scale;
    const subPixelY = (mmLastCameraY - cameraY) * scale;
    mCtx.drawImage(minimapBgCanvas, subPixelX, subPixelY);

    // 4. DIBUJAR LOS JUGADORES ENCIMA DE LA FOTO (Gente moviÃ©ndose en vivo)
    function drawMinimapPlayer(pX, pY, pFrameY, headId, color, targetAccountId) {
        const mX = (pX - cameraX) * scale + (minimapCanvas.width / 2);
        const mY = (pY - cameraY) * scale + (minimapCanvas.height / 2);

        const safeSprites = window.loadedItemSprites || {};
        const dHead = safeSprites[headId] || headImg;
        const drawSizeW = 20;
        const isFriend = (player.friends && player.friends.includes(targetAccountId));

        if (isFriend || color === "#f1c40f") {
            mCtx.fillStyle = color;
            mCtx.beginPath(); mCtx.arc(mX, mY, 14, 0, Math.PI * 2); mCtx.fill();
        }

        if (dHead && dHead.complete && dHead.naturalWidth > 0) {
            const headFrameH = dHead.height / 4;
            const drawSizeH = drawSizeW * (headFrameH / FRAME_WIDTH);
            mCtx.drawImage(dHead, 0, pFrameY * headFrameH, FRAME_WIDTH, headFrameH, mX - (drawSizeW / 2), mY - (drawSizeH / 2) - 4, drawSizeW, drawSizeH);
        }
    }

    for (let id in otherPlayers) {
        const p = otherPlayers[id];
        if (!p || p.worldX === undefined || !p.username || p.invisibleEnabled) continue;
        const hId = p.equipped ? p.equipped.head : 'head_default';
        drawMinimapPlayer(p.worldX, p.worldY, p.frameY, hId, getColorForString(p.username), p.accountId);
    }

    const myHId = player.equipped ? player.equipped.head : 'head_default';
    drawMinimapPlayer(player.worldX, player.worldY, player.frameY, myHId, "#f1c40f", player.accountId);
}

// ðŸš€ EL FIX DEL SANTO GRIAL: RESOLUCIÃ“N DINÃMICA




function resize() {
    // ðŸ“± FIX BLUR iPHONE 15 PRO:
    // Antes limitÃ¡bamos el DPR a 2 en mÃ³vil para ahorrar GPU, pero en pantallas
    // de 3x (iPhone 15 Pro, Pixel 8 Pro...) el browser upscaleaba 2xâ†’3x
    // y eso desenfocaba los pÃ­xeles del juego. Usamos el DPR real completo.
    // El dynamicRenderScale (0.5â€“1.0) ya se encarga de bajar resoluciÃ³n si
    // el celular se calienta o no llega a 60fps.
    const dpr = window.devicePixelRatio || 1;

    cachedScreenWidth = window.innerWidth;
    cachedScreenHeight = window.innerHeight;

    // 1. El canvas CSS ocupa siempre el 100% de la pantalla fÃ­sica real
    canvas.style.width = cachedScreenWidth + 'px';
    canvas.style.height = cachedScreenHeight + 'px';

    // 2. El canvas interno en pÃ­xeles fÃ­sicos reales del dispositivo
    const finalScale = dpr * dynamicRenderScale;
    canvas.width = Math.floor(cachedScreenWidth * finalScale);
    canvas.height = Math.floor(cachedScreenHeight * finalScale);

    // 3. Reiniciar y aplicar la nueva escala de renderizado
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(finalScale, finalScale);

    // Avisamos a las cÃ¡maras que tomen foto nueva
    if (typeof floorDirty !== 'undefined') floorDirty = true;
    if (typeof minimapDirty !== 'undefined') minimapDirty = true;
}

window.addEventListener('resize', resize);
resize();


// --- ENLAZAR EVENTOS TÃCTILES ---
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;

    if (editMode && coordHelper && e.touches.length > 0) {
        const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
        updateCoordHelper(gridPos);
    }

    // Si estamos en modo ediciÃ³n, pintar o seleccionar
    if (editMode) {
        handleEditStart(e.touches[0].clientX, e.touches[0].clientY);
        return;
    }

    // Si NO estamos en ediciÃ³n, calcular toque normal
    const touch = e.touches[0];
    const clickX = (touch.clientX - (window.innerWidth / 2)) / zoomLevel + player.worldX;
    const clickY = (touch.clientY - (window.innerHeight / 2)) / zoomLevel + player.worldY;

    const gridClickX = Math.floor(clickX / TILE_SIZE);
    const gridClickY = Math.floor(clickY / TILE_SIZE);
    const clickedLogicTile = worldMap.get(getMapKey(gridClickX, gridClickY, 15));

    if (clickedLogicTile && clickedLogicTile.requiresClick) {
        const distToTile = Math.hypot(player.worldX - clickX, player.worldY - clickY);
        if (distToTile < TILE_SIZE * 3) {
            executeTileLogic(clickedLogicTile, `${gridClickX},${gridClickY}`);
            return; // Detenemos la ejecuciÃ³n
        }
    }

    // Detectar si tocamos un jugador
    const HIT_RADIUS = 20;
    if (Math.abs(clickX - player.worldX) < HIT_RADIUS && Math.abs(clickY - player.worldY) < HIT_RADIUS) {
        openProfile('self', player.username); return;
    }
    for (let id in otherPlayers) {
        if (Math.abs(clickX - otherPlayers[id].worldX) < HIT_RADIUS && Math.abs(clickY - otherPlayers[id].worldY) < HIT_RADIUS) {
            openProfile(id, otherPlayers[id].username, otherPlayers[id]); return;
        }
    }
}, { passive: false });
// Profile, Inbox & Settings logic has been modularized into js/ui_phone.js

// Inventory logic moved to ui_inventory.js

// Render it once when the game loads
setTimeout(() => { if (typeof renderHudHotbar === "function") renderHudHotbar(); }, 500); // Slight delay ensures images load first


// Shop logic moved to ui_shop.js
// Skeleton Editor logic moved to ui_editor.js
// Game engine and update loop moved to engine_loop.js
// Tasks & Achievements system moved to js/ui_tasks.js
// Battle Pass logic has been modularized into js/ui_battlepass.js

window.player = player;
window.otherPlayers = otherPlayers;
window.damageTexts = damageTexts;
window.WEAPONS = WEAPONS;
