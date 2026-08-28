// --- SEPARAMOS EL ANCHO Y EL ALTO ---
const FRAME_SIZE = 48; // Regresamos a 48 porque es el tamaÃ±o real de cada celda de tu sprite
// --- SEPARAMOS EL ANCHO Y EL ALTO ---
const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 64;
let centralBase = null;
let RANKS = [];
let unreadGlobalMessages = 0;
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

function updateLoadingBar(text) {
    const fill = document.getElementById('loading-bar-fill');
    const txt = document.getElementById('loading-text');
    if (txt && text) txt.innerText = text;

    if (fill && totalAssetsToLoad > 0) {
        const pct = (assetsLoaded / totalAssetsToLoad) * 100;
        fill.style.width = pct + '%';
    }

    // Si ya cargÃ³ todo, quitamos la barra de carga Y ENTRAMOS DIRECTO AL JUEGO
    if (totalAssetsToLoad > 0 && assetsLoaded >= totalAssetsToLoad) {
        if (txt) txt.innerText = "Â¡Mundo Listo!";
        setTimeout(() => {
            const screen = document.getElementById('loading-screen');
            if (screen) screen.style.opacity = '0';

            setTimeout(() => {
                if (screen) screen.style.display = 'none';

                // ðŸ‘‡ LA MAGIA: Apagamos el dron y devolvemos el control al instante ðŸ‘‡
                isCinematicLoading = false;
                floorDirty = false;

                // Asegurarnos de que la ventana de Login estÃ© escondida
                if (authOverlay) {
                    authOverlay.style.display = 'none';
                    authOverlay.style.opacity = '0';
                    authOverlay.style.pointerEvents = 'none';
                }
            }, 800);
        }, 1000);
    }
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

// ==========================================
// ðŸ”Š SOUND ENGINE (WEB AUDIO API - ZERO LAG)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
const audioBuffers = {}; // AquÃ­ guardamos los MP3 ya decodificados en RAM pura

// FunciÃ³n para descargar el sonido y convertirlo en datos crudos
async function preloadSound(url) {
    if (!url || audioBuffers[url]) return;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioBuffers[url] = audioBuffer;
    } catch (e) { console.error("Error pre-cargando audio:", e); }
}

function playSound(soundUrl, volume = 0.5) {
    if (!soundUrl || soundUrl === "") return;

    // Los navegadores duermen el audio hasta que el jugador hace el primer clic
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const buffer = audioBuffers[soundUrl];
    if (!buffer) {
        // Si disparas y aÃºn no bajaba de internet, lo baja y luego suena
        preloadSound(soundUrl).then(() => {
            if (audioBuffers[soundUrl]) playSound(soundUrl, volume);
        });
        return;
    }

    // ReproducciÃ³n ultrarrÃ¡pida nivel C++
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}

// Helper to grab sounds directly from the Catalog
function playItemSound(itemId, soundType = 'use', volume = 0.5) {
    const catalogItem = window.MASTER_CATALOG[itemId] || WEAPONS[itemId];
    if (catalogItem && catalogItem.audio && catalogItem.audio[soundType]) {
        playSound(catalogItem.audio[soundType], volume);
    }
}

// ==========================================
// ðŸ’¿ BACKGROUND MUSIC ENGINE (BGM)
// ==========================================
let bgmPlaylist = [];
let currentBgmIndex = 0;
let isBgmPlaying = false;

const bgmPlayer = new Audio();
bgmPlayer.volume = 0.15; // Volumen bajo de fondo (Ajusta al gusto)
bgmPlayer.loop = false;  // False para que pase a la siguiente al terminar

// Cuando la canciÃ³n termina, pasa a la siguiente
bgmPlayer.addEventListener('ended', () => {
    if (bgmPlaylist.length === 0) return;
    currentBgmIndex = (currentBgmIndex + 1) % bgmPlaylist.length;
    bgmPlayer.src = bgmPlaylist[currentBgmIndex];
    bgmPlayer.play().catch(e => console.warn("Auto-play bloqueado:", e));
});

function startBGM() {
    if (isBgmPlaying || bgmPlaylist.length === 0) return;

    bgmPlayer.src = bgmPlaylist[currentBgmIndex];

    // Los navegadores bloquean el audio si no hay interacciÃ³n, manejamos la promesa
    bgmPlayer.play().then(() => {
        isBgmPlaying = true;
    }).catch(e => {
        console.warn("BGM bloqueado por el navegador. Esperando interacciÃ³n...");
    });
}

// ðŸ›‘ EL FIX DEL NAVEGADOR: El audio inicia con el primer toque o clic del jugador en la pantalla
document.body.addEventListener('click', () => {
    if (!isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false });

document.body.addEventListener('touchstart', () => {
    if (!isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false, passive: true });


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

// =========================================================
//  SISTEMA DE CONFIGURACIÃ“N LOCAL (LOCALSTORAGE)
// =========================================================
let gameSettings = {
    joySize: 120,
    joyX: 30,
    joyY: 30,
    showNametags: true,
    nameOpacity: 0.85,
    showPerformance: true,
    perfOpacity: 0.85,
    timeMode: 'auto',
    rainEnabled: false,
    fxBloom: 0,
    fxGloom: 0,
    fxVignette: 0,
    bgmEnabled: true,
    bgmVolume: 15,
    // âš¡ NUEVAS OPCIONES DE RENDIMIENTO
    renderPreset: 'high',    // ultra | high | medium | low | potato
    renderScale: 100,        // 50â€“100 (% del DPR nativo)
    fpsCap: 60,              // 30 | 60 (frames per second cap)
    disableShadows: false,   // apaga sombras CSS y canvas
    nametag3D: true,         // avatares 3D en nametags (pesados en mÃ³vil)
};

function loadSettings() {
    const saved = localStorage.getItem('mmoargon_settings');
    if (saved) {
        gameSettings = { ...gameSettings, ...JSON.parse(saved) };
    }

    // Sync HTML elements to loaded settings
    const slJoySize = document.getElementById('sl-joy-size');
    if (slJoySize) {
        slJoySize.value = gameSettings.joySize;
        document.getElementById('sl-joy-x').value = gameSettings.joyX;
        document.getElementById('sl-joy-y').value = gameSettings.joyY;
        document.getElementById('chk-show-nametags').checked = gameSettings.showNametags;
        document.getElementById('sl-name-opacity').value = Math.round(gameSettings.nameOpacity * 100);

        // Sync Labels
        document.getElementById('val-joy-size').innerText = gameSettings.joySize;
        document.getElementById('val-joy-x').innerText = gameSettings.joyX;
        document.getElementById('val-joy-y').innerText = gameSettings.joyY;
        document.getElementById('val-name-opacity').innerText = Math.round(gameSettings.nameOpacity * 100);
        // Sync Labels (PÃ©galo debajo de los otros)
        document.getElementById('chk-show-perf').checked = gameSettings.showPerformance;
        document.getElementById('sl-perf-opacity').value = Math.round(gameSettings.perfOpacity * 100);
        document.getElementById('val-perf-opacity').innerText = Math.round(gameSettings.perfOpacity * 100);

        // â›… SYNC WEATHER UI
        const selTime = document.getElementById('sel-time-mode');
        if (selTime) selTime.value = gameSettings.timeMode || 'auto';
        const chkRain = document.getElementById('chk-rain');
        if (chkRain) chkRain.checked = gameSettings.rainEnabled || false;
        const selGraphic = document.getElementById('sel-graphic-filter');
        if (selGraphic) selGraphic.value = gameSettings.graphicFilter || 'none';

        // (Put this right under the other label syncs)
        const slBloom = document.getElementById('sl-fx-bloom');
        if (slBloom) {
            slBloom.value = gameSettings.fxBloom;
            document.getElementById('sl-fx-gloom').value = gameSettings.fxGloom;
            document.getElementById('sl-fx-vignette').value = gameSettings.fxVignette;

            document.getElementById('val-fx-bloom').innerText = gameSettings.fxBloom;
            document.getElementById('val-fx-gloom').innerText = gameSettings.fxGloom;
            document.getElementById('val-fx-vignette').innerText = gameSettings.fxVignette;
        }
        // Sync Labels del Audio
        const slBgmVolume = document.getElementById('sl-bgm-volume');
        if (slBgmVolume) {
            slBgmVolume.value = gameSettings.bgmVolume;
            document.getElementById('val-bgm-volume').innerText = gameSettings.bgmVolume;
            document.getElementById('chk-bgm-enabled').checked = gameSettings.bgmEnabled;
        }

        // âš¡ SYNC RENDIMIENTO UI
        const selPresetEl = document.getElementById('sel-render-preset');
        if (selPresetEl) selPresetEl.value = gameSettings.renderPreset || 'high';
        const slScaleEl = document.getElementById('sl-render-scale');
        if (slScaleEl) { slScaleEl.value = gameSettings.renderScale || 100; }
        const valScaleEl = document.getElementById('val-render-scale');
        if (valScaleEl) valScaleEl.innerText = gameSettings.renderScale || 100;
        const selFpsEl = document.getElementById('sel-fps-cap');
        if (selFpsEl) selFpsEl.value = gameSettings.fpsCap || 60;
        const chkShadEl = document.getElementById('chk-disable-shadows');
        if (chkShadEl) chkShadEl.checked = gameSettings.disableShadows || false;

        // Aplicar escala al canvas desde el principio
        if (typeof dynamicRenderScale !== 'undefined') {
            dynamicRenderScale = (gameSettings.renderScale || 100) / 100;
        }
    }

    applySettingsToGame();
}

function saveSettings() {
    localStorage.setItem('mmoargon_settings', JSON.stringify(gameSettings));
    applySettingsToGame();
}

function applySettingsToGame() {

    const leftJoy = document.getElementById('joystick-zone');
    const rightJoy = document.getElementById('aim-zone');

    // Apply synchronized offsets and sizes to both joysticks
    if (leftJoy && rightJoy) {
        leftJoy.style.width = `${gameSettings.joySize}px`;
        leftJoy.style.height = `${gameSettings.joySize}px`;
        leftJoy.style.left = `${gameSettings.joyX}px`;
        leftJoy.style.bottom = `${gameSettings.joyY}px`;

        rightJoy.style.width = `${gameSettings.joySize}px`;
        rightJoy.style.height = `${gameSettings.joySize}px`;
        rightJoy.style.right = `${gameSettings.joyX}px`;
        rightJoy.style.bottom = `${gameSettings.joyY}px`;
    }

    // ðŸ‘‡ EL MEZCLADOR GRÃFICO (HARDWARE ACCELERATED) ðŸ‘‡
    const canvasEl = document.getElementById('gameCanvas');
    const fxVignette = document.getElementById('fx-vignette');
    const fxGloom = document.getElementById('fx-gloom');

    if (canvasEl && fxVignette && fxGloom) {
        // 1. Bloom Engine (Mapea el slider de 0-100 a valores CSS)
        const bloomPct = gameSettings.fxBloom / 100;
        const contrast = 1.0 + (0.4 * bloomPct); // Max 1.4x Contrast
        const saturate = 1.0 + (0.8 * bloomPct); // Max 1.8x Saturation
        const brightness = 1.0 + (0.2 * bloomPct); // Max 1.2x Brightness

        // Si estÃ¡ en 0%, quitamos el filtro para ahorrar baterÃ­a
        if (bloomPct === 0) {
            canvasEl.style.filter = 'none';
        } else {
            canvasEl.style.filter = `contrast(${contrast}) saturate(${saturate}) brightness(${brightness})`;
        }

        // 2. Gloom Engine (Ajusta la opacidad del div de neÃ³n/haze)
        const gloomPct = gameSettings.fxGloom / 100;
        fxGloom.style.opacity = gloomPct;

        // 3. Vignette Engine (Escala la fuerza de la sombra interna)
        const vigPct = gameSettings.fxVignette / 100;
        const vigSpread = 50 + (100 * vigPct); // De 50px a 150px de grosor

        if (vigPct === 0) {
            fxVignette.style.boxShadow = 'none';
        } else {
            fxVignette.style.boxShadow = `inset 0 0 ${vigSpread}px rgba(0,0,0,${vigPct * 0.9})`;
        }
    }
    // ðŸ‘‡ APLICAR VOLUMEN Y REPRODUCCIÃ“N EN VIVO ðŸ‘‡
    if (typeof bgmPlayer !== 'undefined') {
        bgmPlayer.volume = gameSettings.bgmVolume / 100; // HTML Audio usa de 0.0 a 1.0

        if (!gameSettings.bgmEnabled) {
            bgmPlayer.pause();
            isBgmPlaying = false;
        } else if (gameSettings.bgmEnabled && !isBgmPlaying && bgmPlaylist.length > 0) {
            // Si lo prendieron desde el menÃº, como fue un clic explÃ­cito, el navegador nos dejarÃ¡ arrancar
            startBGM();
        }
    }// ðŸ‘‡ APLICAR VOLUMEN Y REPRODUCCIÃ“N EN VIVO ðŸ‘‡
    if (typeof bgmPlayer !== 'undefined') {
        bgmPlayer.volume = gameSettings.bgmVolume / 100; // HTML Audio usa de 0.0 a 1.0

        if (!gameSettings.bgmEnabled) {
            bgmPlayer.pause();
            isBgmPlaying = false;
        } else if (gameSettings.bgmEnabled && !isBgmPlaying && bgmPlaylist.length > 0) {
            // Si lo prendieron desde el menÃº, como fue un clic explÃ­cito, el navegador nos dejarÃ¡ arrancar
            startBGM();
        }
    }

    // ðŸ‘‡ APLICAR TRANSPARENCIA DEL MONITOR DE RENDIMIENTO ðŸ‘‡
    if (uiPerfMonitor) {
        // Modificamos el fondo para que acepte la opacidad dictada
        uiPerfMonitor.style.background = `rgba(15, 15, 20, ${gameSettings.perfOpacity})`;
    }
}

// --- Event Listeners for the Sliders ---
window.addEventListener('DOMContentLoaded', () => {
    const bindSlider = (id, settingKey, labelId, isPercentage = false) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                document.getElementById(labelId).innerText = val;
                gameSettings[settingKey] = isPercentage ? val / 100 : val;
                applySettingsToGame(); // Update instantly while dragging
            });
            el.addEventListener('change', saveSettings); // Save when they let go
        }
    };

    bindSlider('sl-joy-size', 'joySize', 'val-joy-size');
    bindSlider('sl-joy-x', 'joyX', 'val-joy-x');
    bindSlider('sl-joy-y', 'joyY', 'val-joy-y');
    bindSlider('sl-name-opacity', 'nameOpacity', 'val-name-opacity', true);
    // (Put this right below your joystick bindings)
    bindSlider('sl-fx-bloom', 'fxBloom', 'val-fx-bloom');
    bindSlider('sl-fx-gloom', 'fxGloom', 'val-fx-gloom');
    bindSlider('sl-fx-vignette', 'fxVignette', 'val-fx-vignette');

    const chkName = document.getElementById('chk-show-nametags');
    if (chkName) {
        chkName.addEventListener('change', (e) => {
            gameSettings.showNametags = e.target.checked;
            saveSettings();
        });
    }

    // Bind the Weather Controls
    const selTime = document.getElementById('sel-time-mode');
    if (selTime) {
        selTime.addEventListener('change', (e) => {
            gameSettings.timeMode = e.target.value;
            saveSettings();
        });
    }

    const chkRain = document.getElementById('chk-rain');
    if (chkRain) {
        chkRain.addEventListener('change', (e) => {
            gameSettings.rainEnabled = e.target.checked;
            saveSettings();
        });
    }

    const selGraphic = document.getElementById('sel-graphic-filter');
    if (selGraphic) {
        selGraphic.addEventListener('change', (e) => {
            gameSettings.graphicFilter = e.target.value;
            saveSettings(); // Esto llamarÃ¡ a applySettingsToGame automÃ¡ticamente
        });
    }
    // Enlazar los nuevos inputs
    bindSlider('sl-bgm-volume', 'bgmVolume', 'val-bgm-volume');

    const chkBgm = document.getElementById('chk-bgm-enabled');
    if (chkBgm) {
        chkBgm.addEventListener('change', (e) => {
            gameSettings.bgmEnabled = e.target.checked;
            saveSettings(); // Esto llamarÃ¡ a applySettings automÃ¡ticamente y apagarÃ¡ la mÃºsica
        });
    }

    // (Pon esto junto a los otros bindSlider)
    bindSlider('sl-perf-opacity', 'perfOpacity', 'val-perf-opacity', true);

    const chkPerf = document.getElementById('chk-show-perf');
    if (chkPerf) {
        chkPerf.addEventListener('change', (e) => {
            gameSettings.showPerformance = e.target.checked;
            saveSettings();
        });
    }

    // âš¡ BINDINGS DE RENDIMIENTO
    const PRESET_CONFIGS = {
        ultra: { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true, info: null },
        high: { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true, info: null },
        medium: { renderScale: 75, fpsCap: 60, disableShadows: false, nametag3D: true, info: 'ðŸŸ¡ ResoluciÃ³n al 75%.' },
        low: { renderScale: 60, fpsCap: 30, disableShadows: true, nametag3D: false, info: 'ðŸŸ  60% res, cap 30fps, sin sombras.' },
        potato: { renderScale: 50, fpsCap: 30, disableShadows: true, nametag3D: false, info: 'ðŸ¥” Modo Patata: mÃ­nimo absoluto para correr en cualquier telÃ©fono.' },
    };

    function applyRenderPreset(preset) {
        const cfg = PRESET_CONFIGS[preset];
        if (!cfg) return;
        gameSettings.renderPreset = preset;
        gameSettings.renderScale = cfg.renderScale;
        gameSettings.fpsCap = cfg.fpsCap;
        gameSettings.disableShadows = cfg.disableShadows;
        gameSettings.nametag3D = cfg.nametag3D;

        // Actualizar sliders/checks de la UI para reflejar el preset
        const slScale = document.getElementById('sl-render-scale');
        const valScale = document.getElementById('val-render-scale');
        const selFps = document.getElementById('sel-fps-cap');
        const chkShad = document.getElementById('chk-disable-shadows');
        const infoDiv = document.getElementById('perf-preset-info');

        if (slScale) slScale.value = cfg.renderScale;
        if (valScale) valScale.innerText = cfg.renderScale;
        if (selFps) selFps.value = cfg.fpsCap;
        if (chkShad) chkShad.checked = cfg.disableShadows;
        if (infoDiv) {
            infoDiv.style.display = cfg.info ? 'block' : 'none';
            infoDiv.innerText = cfg.info || '';
        }

        // Aplicar escala dinÃ¡mica al canvas
        dynamicRenderScale = cfg.renderScale / 100;
        resize();
        saveSettings();
    }

    const selPreset = document.getElementById('sel-render-preset');
    if (selPreset) {
        selPreset.addEventListener('change', (e) => applyRenderPreset(e.target.value));
    }

    // Slider de escala manual (override del preset)
    bindSlider('sl-render-scale', 'renderScale', 'val-render-scale', false);
    const slRenderScale = document.getElementById('sl-render-scale');
    if (slRenderScale) {
        slRenderScale.addEventListener('input', () => {
            dynamicRenderScale = gameSettings.renderScale / 100;
            resize();
        });
    }

    // Select FPS cap
    const selFpsCap = document.getElementById('sel-fps-cap');
    if (selFpsCap) {
        selFpsCap.addEventListener('change', (e) => {
            gameSettings.fpsCap = parseInt(e.target.value);
            saveSettings();
        });
    }

    // Checkbox sombras
    const chkShadows = document.getElementById('chk-disable-shadows');
    if (chkShadows) {
        chkShadows.addEventListener('change', (e) => {
            gameSettings.disableShadows = e.target.checked;
            saveSettings();
        });
    }

    loadSettings(); // Call on boot
});

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
let dynamicRenderScale = 1.0;
let fpsHistory = [];
let lastResolutionCheck = performance.now();

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
setTimeout(renderHudHotbar, 500); // Slight delay ensures images load first

// Shop logic moved to ui_shop.js
// Skeleton Editor logic moved to ui_editor.js
// Game engine and update loop moved to engine_loop.js
// ðŸŒŸ SISTEMA DE LOGROS Y TAREAS (LOGICA UI) ðŸŒŸ
if (typeof globalTasks === 'undefined') {
    window.globalTasks = {};
    window.myTaskProgress = {};
    window.myClaimedTasks = {};
}
// Variables existentes
const tasksBtn = document.getElementById('tasks-btn');
const tasksModal = document.getElementById('tasks-modal');
const closeTasksBtn = document.getElementById('close-tasks-modal');
const tasksBadge = document.getElementById('tasks-badge');
const tasksList = document.getElementById('tasks-list');

// ðŸ‘‡ NUEVA VARIABLE PARA EL RELOJ
let activeTasksInterval = null;

tasksBtn.addEventListener('click', () => {
    if (!player || !player.accountId) return alert("âš ï¸ You must log in to view achievements.");
    tasksModal.style.display = 'flex';
    renderTasksModal();
});

// ðŸ‘‡ ACTUALIZAR EL BOTÃ“N DE CERRAR
closeTasksBtn.addEventListener('click', () => {
    tasksModal.style.display = 'none';
    if (activeTasksInterval) {
        clearInterval(activeTasksInterval);
        activeTasksInterval = null;
    }
});

function checkTaskBadge() {
    if (!tasksBadge) return;
    let hasUnclaimed = false;
    const now = Date.now();

    for (let taskId in globalTasks) {
        const task = globalTasks[taskId];

        // Misma lÃ³gica a prueba de fallos
        let isClaimed = false;
        if (Array.isArray(myClaimedTasks)) {
            isClaimed = myClaimedTasks.includes(taskId);
        } else if (myClaimedTasks && typeof myClaimedTasks === 'object') {
            if (myClaimedTasks[taskId]) {
                const lastClaimedTime = Number(myClaimedTasks[taskId]);
                if (!task.isRepeatable) isClaimed = true;
                else isClaimed = (now - lastClaimedTime) < (task.resetIntervalMs || 86400000);
            }
        }

        if (isClaimed) continue; // Si ya la reclamÃ³, la saltamos

        let completed = false;
        if (task.requirementType === 'login') completed = true;
        else if (task.requirementType === 'kills') completed = (player.kills >= task.requirementValue);
        else if (task.requirementType === 'elo') completed = (player.elo >= task.requirementValue);
        else if (task.requirementType === 'play_hours') completed = ((myTaskProgress[taskId] || 0) >= task.requirementValue);
        else if (task.requirementType === 'squad_base_minutes') {
            if (window.mySquadData && window.mySquadData.territoryTimeMinutes >= task.requirementValue) {
                const isLeader = window.mySquadData.leader && window.mySquadData.leader.accountId === player.accountId;
                let lockedByAntiCheat = false;
                if (!isLeader && window.mySquadData.members) {
                    const memberInfo = window.mySquadData.members.find(m => m.accountId === player.accountId);
                    if (memberInfo && memberInfo.joinedAt) {
                        const joinedTime = new Date(memberInfo.joinedAt).getTime();
                        let milestoneDate = null;
                        if (window.mySquadData.milestonesAchieved && window.mySquadData.milestonesAchieved[taskId]) {
                            milestoneDate = new Date(window.mySquadData.milestonesAchieved[taskId]).getTime();
                        }

                        if (milestoneDate && joinedTime > milestoneDate) {
                            lockedByAntiCheat = true;
                        } else {
                            const daysInSquad = (Date.now() - joinedTime) / (1000 * 60 * 60 * 24);
                            if (daysInSquad < 15 && !milestoneDate) {
                                lockedByAntiCheat = true;
                            }
                        }
                    }
                }
                completed = !lockedByAntiCheat;
            }
        }

        if (completed) {
            hasUnclaimed = true;
            break;
        }
    }

    tasksBadge.style.display = hasUnclaimed ? 'flex' : 'none';
}

let currentTaskCategory = 'daily';

document.querySelectorAll('.task-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.task-tab-btn').forEach(b => {
            b.style.borderBottom = "2px solid transparent";
            b.style.opacity = "0.5";
        });
        e.target.style.borderBottom = "2px solid #2ecc71";
        e.target.style.opacity = "1";
        currentTaskCategory = e.target.getAttribute('data-category');
        renderTasksModal();
    });
});

function renderTasksModal() {
    if (!tasksList) return;
    tasksList.innerHTML = "";

    if (activeTasksInterval) clearInterval(activeTasksInterval);

    const now = Date.now();

    for (let taskId in globalTasks) {
        const task = globalTasks[taskId];
        if (task.category !== currentTaskCategory) continue;

        const isRepeatable = task.isRepeatable || task.category === "daily";
        const cooldownMs = task.resetIntervalMs || 86400000;

        let isClaimed = false;
        let lastClaimedTime = null;
        let timeRemainingMs = 0;

        if (Array.isArray(myClaimedTasks)) {
            isClaimed = myClaimedTasks.includes(taskId);
            if (isClaimed && isRepeatable) {
                timeRemainingMs = 1;
            }
        } else if (myClaimedTasks && typeof myClaimedTasks === "object") {
            if (myClaimedTasks[taskId]) {
                lastClaimedTime = Number(myClaimedTasks[taskId]);
                if (!isRepeatable) {
                    isClaimed = true;
                } else {
                    timeRemainingMs = (lastClaimedTime + cooldownMs) - now;
                    isClaimed = timeRemainingMs > 0;
                }
            }
        }

        let currentVal = 0;
        let lockedByAntiCheat = false;
        let antiCheatMsg = "";
        if (task.requirementType === "login") currentVal = 1;
        else if (task.requirementType === "kills") currentVal = player.kills;
        else if (task.requirementType === "elo") currentVal = player.elo;
        else if (task.requirementType === "play_hours") currentVal = myTaskProgress[taskId] || 0;
        else if (task.requirementType === "squad_base_minutes") {
            currentVal = (window.mySquadData && window.mySquadData.territoryTimeMinutes) ? window.mySquadData.territoryTimeMinutes : 0;
            if (window.mySquadData && window.mySquadData.members) {
                const isLeader = window.mySquadData.leader && window.mySquadData.leader.accountId === player.accountId;
                if (!isLeader) {
                    const memberInfo = window.mySquadData.members.find(m => m.accountId === player.accountId);
                    if (memberInfo && memberInfo.joinedAt) {
                        const joinedTime = new Date(memberInfo.joinedAt).getTime();
                        let milestoneDate = null;
                        if (window.mySquadData.milestonesAchieved && window.mySquadData.milestonesAchieved[taskId]) {
                            milestoneDate = new Date(window.mySquadData.milestonesAchieved[taskId]).getTime();
                        }

                        if (milestoneDate && joinedTime > milestoneDate) {
                            continue;
                        } else {
                            const daysInSquad = (Date.now() - joinedTime) / (1000 * 60 * 60 * 24);
                            if (daysInSquad < 15 && !milestoneDate) {
                                lockedByAntiCheat = true;
                                antiCheatMsg = `Y"' Disponible en ${Math.ceil(15 - daysInSquad)} días`;
                            }
                        }
                    }
                }
            }
        }

        const progressPercent = Math.min(100, Math.floor((currentVal / task.requirementValue) * 100));
        const canClaim = (currentVal >= task.requirementValue) && !isClaimed && !lockedByAntiCheat;

        const card = document.createElement("div");
        card.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; display: flex; flex-direction: column; gap: 10px; transition: 0.3s;";

        if (isClaimed) {
            card.style.opacity = "0.5";
            card.style.filter = "grayscale(100%)";
            card.style.webkitFilter = "grayscale(100%)";
        }

        let rewardDisplay = "";
        if (task.rewardType === "coins") {
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">Y'</span> <span style="color: gold; font-weight: bold;">+${task.rewardValue}</span>`;
        } else if (task.rewardType === "bp_xp") {
            rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">⭐</span> <span style="color: #00ffcc; font-weight: bold;">+${task.rewardValue} BP XP</span>`;
        } else {
            rewardDisplay = `<span style="color: #2ecc71; font-weight: bold;">Item: ${task.rewardValue}</span>`;
        }

        if (task.bpXpReward && task.rewardType !== "bp_xp") {
            rewardDisplay += ` | <span style="font-size: 14px; margin-left: 4px; vertical-align: middle;">⭐</span> <span style="color: #00ffcc; font-weight: bold;">+${task.bpXpReward} BP XP</span>`;
        }

        let btnHtml = "";
        if (isClaimed && isRepeatable) {
            if (lastClaimedTime) {
                const expireTime = lastClaimedTime + cooldownMs;
                btnHtml = `<button class="claim-btn task-timer" data-expire="${expireTime}" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ --:--:--
                        </button>`;
            } else {
                btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ En enfriamiento (Vuelve más tarde)
                        </button>`;
            }
        } else if (isClaimed && !isRepeatable) {
            btnHtml = `<button class="claim-btn" disabled style="background: #555; color: #888; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
                        CLAIMED
                    </button>`;
        } else if (lockedByAntiCheat) {
            btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #e74c3c; border: 1px solid #e74c3c; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                        ${antiCheatMsg}
                    </button>`;
        } else {
            btnHtml = `<button class="claim-btn" ${canClaim ? "" : "disabled"} style="background: ${canClaim ? "#2ecc71" : "#555"}; color: ${canClaim ? "black" : "#888"}; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: ${canClaim ? "pointer" : "not-allowed"}; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
                        CLAIM REWARD
                    </button>`;
        }

        card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="color: white; font-weight: bold; font-family: sans-serif; font-size: 14px;">${task.title}</div>
                            <div style="color: #aaa; font-family: sans-serif; font-size: 11px; margin-top: 4px;">${task.description}</div>
                        </div>
                        <div style="text-align: right; background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 5px;">
                            ${rewardDisplay}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="flex-grow: 1; background: rgba(0,0,0,0.5); height: 8px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="background: ${canClaim ? "#2ecc71" : "#3498db"}; width: ${progressPercent}%; height: 100%; transition: width 0.3s;"></div>
                        </div>
                        <div style="color: white; font-size: 10px; font-weight: bold; min-width: 40px; text-align: right;">${Math.min(currentVal, task.requirementValue)} / ${task.requirementValue}</div>
                    </div>
                    ${btnHtml}
                `;

        if (canClaim) {
            const btn = card.querySelector(".claim-btn");
            btn.addEventListener("click", (e) => {
                e.target.innerText = "Procesando...";
                e.target.style.background = "#f1c40f";
                e.target.disabled = true;
                ws.send(MessagePack.encode({ type: "claim_task", taskId: taskId }));
            });
        }

        tasksList.appendChild(card);
    }

    if (activeTasksInterval) clearInterval(activeTasksInterval);
    activeTasksInterval = setInterval(updateTaskTimers, 1000);
    updateTaskTimers();
}

function updateTaskTimers() {
    const timers = document.querySelectorAll(".task-timer");
    const now = Date.now();

    timers.forEach(timerEl => {
        const expireTime = Number(timerEl.getAttribute("data-expire"));
        const diffMs = expireTime - now;

        if (diffMs <= 0) {
            renderTasksModal();
            if (typeof checkTaskBadge === "function") checkTaskBadge();
        } else {
            const totalSeconds = Math.floor(diffMs / 1000);
            const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
            const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
            const seconds = (totalSeconds % 60).toString().padStart(2, "0");
            timerEl.innerText = `⏳ Disponible en ${hours}:${minutes}:${seconds}`;
        }
    });
}

update();


// Battle Pass logic has been modularized into js/ui_battlepass.js