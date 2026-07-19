        // --- SEPARAMOS EL ANCHO Y EL ALTO ---
        const FRAME_SIZE = 48; // Regresamos a 48 porque es el tamaño real de cada celda de tu sprite
        // --- SEPARAMOS EL ANCHO Y EL ALTO ---
        const FRAME_WIDTH = 48;
        const FRAME_HEIGHT = 64;
        let centralBase = null;
        let RANKS = [];
        let unreadGlobalMessages = 0;
        // --- MEMORIA DE NAVEGACIÓN DE MODALES ---
        let lastProfileSource = 'game'; // Puede ser 'game', 'friends', 'squad'
        let lastPmSource = 'inbox';     // Puede ser 'inbox', 'profile'

        // Le dice al código en qué FILA empieza cada animación
        const SKELETON_DATA = {
            states: {
                "idle": 0,           // Filas 0 a 3
                "walk_armed": 4,     // Filas 4 a 7
                "walk_unarmed": 8,   // Filas 8 a 11
                "sit": 12            // Filas 12 a 15
            },
            anchors: {}
        };

        // Función para obtener la llave de un anclaje específico
        function getFrameKey(state, dir, frameX) {
            return `${state}_${dir}_${frameX}`;
        }
        // 🚀 EL FIX DE RENDIMIENTO: Lluvia reciclable (Object Pool)
        const MAX_RAIN = 150;
        window.rainParticles = Array.from({ length: MAX_RAIN }, () => ({
            active: false, x: 0, y: 0, targetY: 0, len: 0, vx: 0, vy: 0, isSplashing: false, splashLife: 0
        }));
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        // --- NUEVO: LIENZO INVISIBLE PARA EL FLASH DE DAÑO ---
        const flashCanvas = document.createElement('canvas');
        const flashCtx = flashCanvas.getContext('2d');
        const safeZoneUI = document.getElementById('safezone-ui'); // <--- PEGA ESTA LÍNEA AQUÍ

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

            // Si ya cargó todo, quitamos la barra de carga Y ENTRAMOS DIRECTO AL JUEGO
            if (totalAssetsToLoad > 0 && assetsLoaded >= totalAssetsToLoad) {
                if (txt) txt.innerText = "¡Mundo Listo!";
                setTimeout(() => {
                    const screen = document.getElementById('loading-screen');
                    if (screen) screen.style.opacity = '0';

                    setTimeout(() => {
                        if (screen) screen.style.display = 'none';

                        // 👇 LA MAGIA: Apagamos el dron y devolvemos el control al instante 👇
                        isCinematicLoading = false;
                        floorDirty = false;

                        // Asegurarnos de que la ventana de Login esté escondida
                        if (authOverlay) {
                            authOverlay.style.display = 'none';
                            authOverlay.style.opacity = '0';
                            authOverlay.style.pointerEvents = 'none';
                        }
                    }, 800);
                }, 1000);
            }
        }

        // --- 0. MULTI-TILESET SYSTEM (DINÁMICO DESDE MONGODB) ---
        let TILESET_CONFIG = [];
        const loadedTilesets = {};
        let currentTilesetIndex = 0;

        // El traductor mágico
        function getTilesetData(globalTileId) {
            if (globalTileId === -1 || globalTileId === undefined) return null;
            for (let i = TILESET_CONFIG.length - 1; i >= 0; i--) {
                if (globalTileId >= TILESET_CONFIG[i].startId) {
                    return {
                        img: loadedTilesets[TILESET_CONFIG[i].id],
                        localId: globalTileId - TILESET_CONFIG[i].startId
                    };
                }
            }
            return null;
        }

        // El traductor mágico: Convierte un Global ID (ej. 10005) en su imagen y su ID local (5)
        function getTilesetData(globalTileId) {
            if (globalTileId === -1 || globalTileId === undefined) return null;
            for (let i = TILESET_CONFIG.length - 1; i >= 0; i--) {
                if (globalTileId >= TILESET_CONFIG[i].startId) {
                    return {
                        img: loadedTilesets[TILESET_CONFIG[i].id],
                        localId: globalTileId - TILESET_CONFIG[i].startId
                    };
                }
            }
            return null;
        }

        let editMode = false;
        let editorMouseGridX = 0;
        let editorMouseGridY = 0;
        let showGridOverlay = false;
        let hiddenLayers = new Set();
        let selectedTileId = 0;
        const TILE_SIZE = 16; // Your tileset looks like a 16px grid
        // 🚀 EL FIX DE RENDIMIENTO MÁXIMO: TILEMAP CHUNKING ARCHITECTURE
        const CHUNK_SIZE = 32; // 32x32 tiles por chunk (512x512 píxeles de mundo)
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

            // 🛑 OPTIMIZACIÓN: Solo crear oCanvas si de verdad hay tiles aéreos en este chunk
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

        // 🚀 EL FIX FÍSICO: Map() y Claves Numéricas
        const worldMap = new Map();

        function getMapKey(x, y, l) {
            return `${x},${y},${l}`;
        }
        let safeZones = [];   // <--- NUEVO: MEMORIA DE ZONAS SEGURAS
        // 1. PRIMERO declaramos la variable para saber si es celular
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        // 🚀 EL FIX DE RENDIMIENTO MÁXIMO: OFFSCREEN CANVAS (CACHE DEL SUELO)
        const floorCanvas = document.createElement('canvas');
        const floorCtx = floorCanvas.getContext('2d');
        const overheadCanvas = document.createElement('canvas'); // 🌟 NUEVO
        const overheadCtx = overheadCanvas.getContext('2d');     // 🌟 NUEVO
        let floorDirty = true; // Nos dice si necesitamos tomar una nueva "foto"
        let floorBufferBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        // 🚀 FIX JITTER MÓVIL: currentBufferMargin dinámico calculado según la VRAM
        let currentBufferMargin = isTouchDevice ? 6 : 12;

        // 📱 PRE-BAKED ZOOM: the floor canvas is drawn at zoomLevel resolution so the main
        // ctx.drawImage is always 1:1 (no scaling) — this is the Safari/iOS killer fix.
        let floorBakedZoom = 0; // Track what zoom the buffer was baked at

        function updateFloorBuffer() {
            const screenWidthWorld  = cachedScreenWidth  / zoomLevel;
            const screenHeightWorld = cachedScreenHeight / zoomLevel;
            const centerCol = Math.floor(player.worldX / TILE_SIZE);
            const centerRow = Math.floor(player.worldY / TILE_SIZE);
            const halfCols = Math.ceil(screenWidthWorld  / TILE_SIZE / 2);
            const halfRows = Math.ceil(screenHeightWorld / TILE_SIZE / 2);

            floorBufferBox.minX = centerCol - halfCols - currentBufferMargin;
            floorBufferBox.maxX = centerCol + halfCols + currentBufferMargin;
            floorBufferBox.minY = centerRow - halfRows - currentBufferMargin;
            floorBufferBox.maxY = centerRow + halfRows + currentBufferMargin;

            // 📱 PRE-BAKE AT ZOOM: canvas is sized in screen pixels, not world pixels.
            // This makes the final drawImage a 1:1 blit (zero scaling cost on Safari).
            const bakeZoom = zoomLevel;
            const tilesW = (floorBufferBox.maxX - floorBufferBox.minX);
            const tilesH = (floorBufferBox.maxY - floorBufferBox.minY);
            const newW = Math.ceil(tilesW * TILE_SIZE * bakeZoom);
            const newH = Math.ceil(tilesH * TILE_SIZE * bakeZoom);

            if (floorCanvas.width !== newW || floorCanvas.height !== newH) {
                floorCanvas.width  = newW; floorCanvas.height = newH;
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
                        // 🧱 THE WOBBLE FIX: Calculate pixels anchored to the Absolute World, not the Buffer.
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

        // 🚀 EL FIX: Cachear la pantalla en RAM
        let cachedScreenWidth = window.innerWidth;
        let cachedScreenHeight = window.innerHeight;

        // --- SISTEMA MULTIPLATAFORMA (PC vs MÓVIL) ---
        // Variables para los controles de PC
        const keys = { w: false, a: false, s: false, d: false };
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let isMouseDown = false;

        // Ocultar los joysticks si estamos en PC
        window.addEventListener('DOMContentLoaded', () => {
            if (!isTouchDevice) {
                // AQUÍ ESTÁ LA CORRECCIÓN DE LOS IDs:
                const leftJoy = document.getElementById('joystick-zone');
                const rightJoy = document.getElementById('aim-zone');

                if (leftJoy) leftJoy.style.display = 'none';
                if (rightJoy) rightJoy.style.display = 'none';
            }
        });

        // --- ESCUCHAR TECLADO (WASD, TAB-CHAT Y ANTI-BUGS) ---
        window.addEventListener('keydown', (e) => {
            // 🛑 EL FIX 1: Usar TAB para activar el chat público
            if (e.key === 'Tab') {
                e.preventDefault(); // Evita que el navegador seleccione botones locamente

                // Si el chat ya está abierto, lo cerramos (enviamos o cancelamos)
                if (chatContainer.classList.contains('expanded')) {
                    sendMessage();
                } else {
                    // Si está cerrado, simulamos el clic en el botón de chat
                    chatToggle.click();
                }
            }
        });

        if (!isTouchDevice) {
            window.addEventListener('keydown', (e) => {
                // 🛑 EL FIX 2: Bloquear WASD si estamos escribiendo en el chat o cualquier input
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                    // Si presionamos ENTER dentro del chat, enviamos mensaje
                    if (e.key === 'Enter') sendMessage();
                    return;
                }

                const key = e.key.toLowerCase();
                if (["w", "a", "s", "d"].includes(key)) {
                    keys[key] = true;
                }
            });

            window.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                if (["w", "a", "s", "d"].includes(key)) {
                    keys[key] = false;
                }
            });
        }

        // --- ESCUCHAR RATÓN (APUNTAR Y DISPARAR) ---
        if (!isTouchDevice) {
            window.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
            });

            window.addEventListener('mousedown', (e) => {
                // Solo disparamos si hicieron clic en el juego, no en un botón de la interfaz
                if (e.target.tagName.toLowerCase() === 'canvas') {
                    isMouseDown = true;
                }
            });

            window.addEventListener('mouseup', () => {
                isMouseDown = false;
            });
        }

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
            weaponAmmo: {}, // 💾 ¡NUEVO! Memoria de los cargadores
            isReloading: false,
            lastShotX: 0,
            lastShotY: 0,
            lastHitTime: 0, // <--- ¡NUEVO!
            isDead: false // <--- ¡NUEVO ESTADO!

        };

        // ==========================================
        // 🔊 SOUND ENGINE (WEB AUDIO API - ZERO LAG)
        // ==========================================
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        const audioBuffers = {}; // Aquí guardamos los MP3 ya decodificados en RAM pura

        // Función para descargar el sonido y convertirlo en datos crudos
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
                // Si disparas y aún no bajaba de internet, lo baja y luego suena
                preloadSound(soundUrl).then(() => {
                    if (audioBuffers[soundUrl]) playSound(soundUrl, volume);
                });
                return;
            }

            // Reproducción ultrarrápida nivel C++
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
        // 💿 BACKGROUND MUSIC ENGINE (BGM)
        // ==========================================
        let bgmPlaylist = [];
        let currentBgmIndex = 0;
        let isBgmPlaying = false;

        const bgmPlayer = new Audio();
        bgmPlayer.volume = 0.15; // Volumen bajo de fondo (Ajusta al gusto)
        bgmPlayer.loop = false;  // False para que pase a la siguiente al terminar

        // Cuando la canción termina, pasa a la siguiente
        bgmPlayer.addEventListener('ended', () => {
            if (bgmPlaylist.length === 0) return;
            currentBgmIndex = (currentBgmIndex + 1) % bgmPlaylist.length;
            bgmPlayer.src = bgmPlaylist[currentBgmIndex];
            bgmPlayer.play().catch(e => console.warn("Auto-play bloqueado:", e));
        });

        function startBGM() {
            if (isBgmPlaying || bgmPlaylist.length === 0) return;

            bgmPlayer.src = bgmPlaylist[currentBgmIndex];

            // Los navegadores bloquean el audio si no hay interacción, manejamos la promesa
            bgmPlayer.play().then(() => {
                isBgmPlaying = true;
            }).catch(e => {
                console.warn("BGM bloqueado por el navegador. Esperando interacción...");
            });
        }

        // 🛑 EL FIX DEL NAVEGADOR: El audio inicia con el primer toque o clic del jugador en la pantalla
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
        let WEAPONS = {}; // ¡El servidor llenará esto mágicamente al conectar!
        // 🚀 EL FIX DE RENDIMIENTO: Pool de 100 Balas pre-fabricadas
        const MAX_PROJECTILES = 100;
        const projectiles = Array.from({ length: MAX_PROJECTILES }, () => ({
            active: false, // ¡La bandera mágica!
            x: 0, y: 0, vx: 0, vy: 0, life: 0, owner: null, weapon: null, color: "#f1c40f"
        }));
        // 🚀 EL FIX DE RENDIMIENTO (OBJECT POOLS): Textos y Chispas reciclables
        const MAX_FX = 30;
        const damageTexts = Array.from({ length: MAX_FX }, () => ({
            active: false, x: 0, y: 0, text: "", color: "", life: 0, maxLife: 0
        }));
        const hitSparks = Array.from({ length: MAX_FX }, () => ({
            active: false, x: 0, y: 0, life: 0, maxLife: 0, color: ""
        }));

        // 💥 NUEVA FUNCIÓN PARA RECICLAR CHISPAS
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
        const baseSpriteCache = {}; // <--- 🌟 CACHÉ DE LA BASE MÁGICA 🌟
        const trashSpritesheet = new Image();
        trashSpritesheet.src = "items/jobs/junkyard/trash.png"; // Tu PNG custom de 128x32
        // Este arreglo asume que la animación tiene 8 frames.

        const bodyImg = new Image();
        bodyImg.src = 'items/players/body/B_D.png'; // Tu archivo de cuerpo

        const headImg = new Image();
        headImg.src = 'items/players/head/H_D.png'; // Tu archivo de cabezas

        // =========================================================
        //  SISTEMA DE CONFIGURACIÓN LOCAL (LOCALSTORAGE)
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
            // ⚡ NUEVAS OPCIONES DE RENDIMIENTO
            renderPreset: 'high',    // ultra | high | medium | low | potato
            renderScale: 100,        // 50–100 (% del DPR nativo)
            fpsCap: 60,              // 30 | 60 (frames per second cap)
            disableShadows: false,   // apaga sombras CSS y canvas
            nametag3D: true,         // avatares 3D en nametags (pesados en móvil)
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
                // Sync Labels (Pégalo debajo de los otros)
                document.getElementById('chk-show-perf').checked = gameSettings.showPerformance;
                document.getElementById('sl-perf-opacity').value = Math.round(gameSettings.perfOpacity * 100);
                document.getElementById('val-perf-opacity').innerText = Math.round(gameSettings.perfOpacity * 100);

                // ⛅ SYNC WEATHER UI
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

                // ⚡ SYNC RENDIMIENTO UI
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

            // 👇 EL MEZCLADOR GRÁFICO (HARDWARE ACCELERATED) 👇
            const canvasEl = document.getElementById('gameCanvas');
            const fxVignette = document.getElementById('fx-vignette');
            const fxGloom = document.getElementById('fx-gloom');

            if (canvasEl && fxVignette && fxGloom) {
                // 1. Bloom Engine (Mapea el slider de 0-100 a valores CSS)
                const bloomPct = gameSettings.fxBloom / 100;
                const contrast = 1.0 + (0.4 * bloomPct); // Max 1.4x Contrast
                const saturate = 1.0 + (0.8 * bloomPct); // Max 1.8x Saturation
                const brightness = 1.0 + (0.2 * bloomPct); // Max 1.2x Brightness

                // Si está en 0%, quitamos el filtro para ahorrar batería
                if (bloomPct === 0) {
                    canvasEl.style.filter = 'none';
                } else {
                    canvasEl.style.filter = `contrast(${contrast}) saturate(${saturate}) brightness(${brightness})`;
                }

                // 2. Gloom Engine (Ajusta la opacidad del div de neón/haze)
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
            // 👇 APLICAR VOLUMEN Y REPRODUCCIÓN EN VIVO 👇
            if (typeof bgmPlayer !== 'undefined') {
                bgmPlayer.volume = gameSettings.bgmVolume / 100; // HTML Audio usa de 0.0 a 1.0

                if (!gameSettings.bgmEnabled) {
                    bgmPlayer.pause();
                    isBgmPlaying = false;
                } else if (gameSettings.bgmEnabled && !isBgmPlaying && bgmPlaylist.length > 0) {
                    // Si lo prendieron desde el menú, como fue un clic explícito, el navegador nos dejará arrancar
                    startBGM();
                }
            }// 👇 APLICAR VOLUMEN Y REPRODUCCIÓN EN VIVO 👇
            if (typeof bgmPlayer !== 'undefined') {
                bgmPlayer.volume = gameSettings.bgmVolume / 100; // HTML Audio usa de 0.0 a 1.0

                if (!gameSettings.bgmEnabled) {
                    bgmPlayer.pause();
                    isBgmPlaying = false;
                } else if (gameSettings.bgmEnabled && !isBgmPlaying && bgmPlaylist.length > 0) {
                    // Si lo prendieron desde el menú, como fue un clic explícito, el navegador nos dejará arrancar
                    startBGM();
                }
            }

            // 👇 APLICAR TRANSPARENCIA DEL MONITOR DE RENDIMIENTO 👇
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
                    saveSettings(); // Esto llamará a applySettingsToGame automáticamente
                });
            }
            // Enlazar los nuevos inputs
            bindSlider('sl-bgm-volume', 'bgmVolume', 'val-bgm-volume');

            const chkBgm = document.getElementById('chk-bgm-enabled');
            if (chkBgm) {
                chkBgm.addEventListener('change', (e) => {
                    gameSettings.bgmEnabled = e.target.checked;
                    saveSettings(); // Esto llamará a applySettings automáticamente y apagará la música
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

            // ⚡ BINDINGS DE RENDIMIENTO
            const PRESET_CONFIGS = {
                ultra:  { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true,  info: null },
                high:   { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true,  info: null },
                medium: { renderScale: 75,  fpsCap: 60, disableShadows: false, nametag3D: true,  info: '🟡 Resolución al 75%.' },
                low:    { renderScale: 60,  fpsCap: 30, disableShadows: true,  nametag3D: false, info: '🟠 60% res, cap 30fps, sin sombras.' },
                potato: { renderScale: 50,  fpsCap: 30, disableShadows: true,  nametag3D: false, info: '🥔 Modo Patata: mínimo absoluto para correr en cualquier teléfono.' },
            };

            function applyRenderPreset(preset) {
                const cfg = PRESET_CONFIGS[preset];
                if (!cfg) return;
                gameSettings.renderPreset    = preset;
                gameSettings.renderScale     = cfg.renderScale;
                gameSettings.fpsCap          = cfg.fpsCap;
                gameSettings.disableShadows  = cfg.disableShadows;
                gameSettings.nametag3D       = cfg.nametag3D;

                // Actualizar sliders/checks de la UI para reflejar el preset
                const slScale = document.getElementById('sl-render-scale');
                const valScale = document.getElementById('val-render-scale');
                const selFps  = document.getElementById('sel-fps-cap');
                const chkShad = document.getElementById('chk-disable-shadows');
                const infoDiv = document.getElementById('perf-preset-info');

                if (slScale)  slScale.value   = cfg.renderScale;
                if (valScale) valScale.innerText = cfg.renderScale;
                if (selFps)   selFps.value    = cfg.fpsCap;
                if (chkShad)  chkShad.checked = cfg.disableShadows;
                if (infoDiv) {
                    infoDiv.style.display = cfg.info ? 'block' : 'none';
                    infoDiv.innerText = cfg.info || '';
                }

                // Aplicar escala dinámica al canvas
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

        // --- DICCIONARIO DINÁMICO DE ARMAS ---
        const loadedWeaponSprites = {};

        // Add equipped weapon to local player state
        player.equippedWeapon = "none";

        // --- MULTIPLAYER LOGIC ---
        const otherPlayers = {};
        let myId = null;
        // --- BASE DE DATOS DE ARMAS EN EL CLIENTE ---
        let weaponsDB = {};
        
        // 🌟 SISTEMA DE LOGROS Y TAREAS 🌟

        // Auth UI Elements
        const authOverlay = document.getElementById('auth-overlay');
        const authEmail = document.getElementById('auth-email'); // <--- NEW: Grab the email box
        const authUsername = document.getElementById('auth-username');
        const authPassword = document.getElementById('auth-password');
        const authMessage = document.getElementById('auth-message');
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        // ==========================================
        // 🚀 CACHÉ DE ELEMENTOS PARA RENDIMIENTO 🚀
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

        // --- FEEDBACK UI ELEMENTS ---
        const appFeedbackBtn = document.getElementById('app-feedback');
        const feedbackModal = document.getElementById('feedback-modal');
        const closeFeedbackModalBtn = document.getElementById('close-feedback-modal');
        const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
        const feedbackInput = document.getElementById('feedback-input');
        const feedbackCategoryBtns = document.querySelectorAll('.feedback-category-btn');
        const feedbackSuccessModal = document.getElementById('feedback-success-modal');
        const closeFeedbackSuccessBtn = document.getElementById('close-feedback-success-btn');
        const feedbackSuccessMsg = document.getElementById('feedback-success-msg');
        
        let selectedFeedbackCategory = "Ideas"; // default

        // --- 🧠 MEMORIA INTELIGENTE DEL APP TRAY ---
        let isTrayWaitingInBg = false;

        function hideTrayForModal() {
            if (appTray.classList.contains('open')) {
                isTrayWaitingInBg = true;
                appTray.classList.remove('open'); // Lo ocultamos suavemente
            }
        }

        function restoreTrayAfterModal() {
            if (isTrayWaitingInBg) {
                appTray.classList.add('open'); // Lo volvemos a mostrar
                isTrayWaitingInBg = false;     // Reiniciamos la memoria
            }
        }
        // 1. Toggle the iOS app tray (Slides out sideways)
        menuToggle.addEventListener('click', () => {
            appTray.classList.toggle('open');
        });

        // 2. Click the Login App -> Opens Card, Chooses View
        appAuth.addEventListener('click', () => {
            // Sledgehammer force the glass card to open
            hideTrayForModal();
            authOverlay.style.display = 'flex';
            authOverlay.style.opacity = '1';
            authOverlay.style.pointerEvents = 'auto';

            // Decide which text to show inside the card!
            if (!isLoggedIn) {
                authLoginView.style.display = 'block';
                authSignoutView.style.display = 'none';
            } else {
                authLoginView.style.display = 'none';
                authSignoutView.style.display = 'block';
            }
        });

        // 2.5 Click Feedback App -> Opens Feedback Modal
        if (appFeedbackBtn) {
            appFeedbackBtn.addEventListener('click', () => {
                hideTrayForModal();
                if (!isLoggedIn) {
                    alert("You must be logged in to submit feedback!");
                    restoreTrayAfterModal();
                    return;
                }
                feedbackModal.style.display = 'flex';
            });
        }

        // --- FEEDBACK CATEGORY TOGGLES ---
        feedbackCategoryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Reset all
                feedbackCategoryBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'rgba(0,0,0,0.5)';
                    b.style.border = '1px solid rgba(255,255,255,0.2)';
                    b.style.color = '#aaa';
                });
                // Set active
                btn.classList.add('active');
                btn.style.background = 'rgba(255,154,158,0.2)';
                btn.style.border = '1px solid #ff9a9e';
                btn.style.color = 'white';
                selectedFeedbackCategory = btn.getAttribute('data-category');
            });
        });

        if (closeFeedbackModalBtn) {
            closeFeedbackModalBtn.addEventListener('click', () => {
                feedbackModal.style.display = 'none';
                feedbackInput.value = ''; // clear input
                restoreTrayAfterModal();
            });
        }

        // --- CLOSE SUCCESS MODAL ---
        if (closeFeedbackSuccessBtn) {
            closeFeedbackSuccessBtn.addEventListener('click', () => {
                feedbackSuccessModal.style.display = 'none';
                restoreTrayAfterModal();
            });
        }

        if (submitFeedbackBtn) {
            submitFeedbackBtn.addEventListener('click', () => {
                const text = feedbackInput.value.trim();
                if (!text) return;
                
                // Efecto visual
                submitFeedbackBtn.innerText = "Sending...";
                submitFeedbackBtn.disabled = true;

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ 
                        type: 'submit_feedback', 
                        category: selectedFeedbackCategory,
                        message: text 
                    }));
                }
            });
        }

        // --- TUTORIAL LOGIC ---
        const tutorialSteps = [
            {
                title: "Welcome to the Game",
                desc: "Welcome! Survive, build, and fight in a persistent world. Here is how you can get started.",
                icon: "items/icons/Info.png"
            },
            {
                title: "Movement & Combat",
                desc: "Use the on-screen joysticks (or WASD/Mouse) to move and aim. Click or tap the aim joystick to attack.",
                icon: "items/icons/ghost_gun.png"
            },
            {
                title: "Economy & Loot",
                desc: "Find loot in the world! Visit the Jeweler or the Junkyard NPCs to sell your items and earn coins.",
                icon: "items/icons/bag.png"
            },
            {
                title: "Build & Socialize",
                desc: "Use your coins to buy weapons and building materials. Team up with other players by joining a Squad and take down and held bases for rewards on the long run!",
                icon: "items/icons/squads.png"
            }
        ];
        
        let currentTutorialStep = 0;
        const tutorialModal = document.getElementById('tutorial-modal');
        const tutorialTitle = document.getElementById('tutorial-title');
        const tutorialContent = document.getElementById('tutorial-content');
        const tutorialDots = document.getElementById('tutorial-dots');
        const tutorialNextBtn = document.getElementById('tutorial-next-btn');
        const tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
        const appGuideBtn = document.getElementById('app-guide');

        function renderTutorialStep() {
            const step = tutorialSteps[currentTutorialStep];
            tutorialTitle.innerText = step.title;
            
            tutorialContent.innerHTML = `
                <img src="${step.icon}" style="width: 64px; height: 64px; margin-bottom: 15px; image-rendering: pixelated;">
                <p style="font-size: 15px; line-height: 1.5; color: #ccc; margin: 0;">${step.desc}</p>
            `;
            
            // Draw Dots
            tutorialDots.innerHTML = '';
            for (let i = 0; i < tutorialSteps.length; i++) {
                const dot = document.createElement('div');
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.borderRadius = '50%';
                dot.style.background = (i === currentTutorialStep) ? '#38ef7d' : 'rgba(255,255,255,0.3)';
                tutorialDots.appendChild(dot);
            }
            
            if (currentTutorialStep === tutorialSteps.length - 1) {
                tutorialNextBtn.innerText = "Finish ➔";
            } else {
                tutorialNextBtn.innerText = "Next ➔";
            }
        }

        function closeTutorial() {
            tutorialModal.style.display = 'none';
            restoreTrayAfterModal();
            // Send flag to server
            if (ws.readyState === WebSocket.OPEN && isLoggedIn) {
                ws.send(MessagePack.encode({ type: 'tutorial_completed' }));
                player.hasSeenTutorial = true; // Update local state so it doesn't pop up again
            }
        }

        if (tutorialNextBtn) {
            tutorialNextBtn.addEventListener('click', () => {
                if (currentTutorialStep < tutorialSteps.length - 1) {
                    currentTutorialStep++;
                    renderTutorialStep();
                } else {
                    closeTutorial();
                }
            });
        }

        if (tutorialSkipBtn) {
            tutorialSkipBtn.addEventListener('click', closeTutorial);
        }

        if (appGuideBtn) {
            appGuideBtn.addEventListener('click', () => {
                hideTrayForModal();
                currentTutorialStep = 0;
                renderTutorialStep();
                tutorialModal.style.display = 'flex';
            });
        }

        // === NUEVO: ARGEMS PREMIUM STORE LOGIC ===
        const appArgemsBtn = document.getElementById('app-argems');
        const argemsModal = document.getElementById('argems-modal');
        const closeArgemsModalBtn = document.getElementById('close-argems-modal');
        const argemsBalanceDisplay = document.getElementById('argems-balance-display');
        const argemsStoreGrid = document.getElementById('argems-store-grid');

        if (appArgemsBtn) {
            appArgemsBtn.addEventListener('click', () => {
                if (!player || !player.accountId) return alert("⚠️ You must log in to buy Argems.");
                hideTrayForModal();
                argemsModal.style.display = 'flex';
                
                // Update header balance
                argemsBalanceDisplay.innerText = `${player.gems || 0} 💎`;
                argemsStoreGrid.innerHTML = '<div style="color: white; text-align: center; width: 100%; grid-column: 1 / -1;">Loading packages...</div>';

                // Fetch packages from server
                if (ws.readyState === WebSocket.OPEN) {
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
            // 👇 NUEVO: Aterrizar el dron si entras como invitado 👇
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

        // --- CONEXIÓN INTELIGENTE (LOCAL vs PRODUCCIÓN) ---
        // Si estás en tu PC (localhost), usa tu servidor local. 
        // Si estás en GitHub Pages o LirosMusic, usa el servidor de la nube (Render).
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // RECUERDA: Cambia la URL de Render por la de tu servidor real cuando lo subas
        const wsUrl = isLocal ? 'ws://localhost:8080' : 'wss://my-chat-server-ihxw.onrender.com';

        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer"; // ⚡ THIS IS CRITICAL FOR MESSAGEPACK

        // --- WEBSOCKET CONNECTION STATE ---
        authMessage.style.color = '#f1c40f'; // Yellow
        authMessage.innerText = "Connecting to server...";

        ws.onopen = () => {
            authMessage.style.color = 'white';
            authMessage.innerText = "Server connected! Please log in.";

            // Check if we have a saved session token!
            const savedToken = localStorage.getItem('gameToken');
            if (savedToken) {
                authMessage.style.color = '#f1c40f';
                authMessage.innerText = "Resuming session...";
                ws.send(MessagePack.encode({ type: 'auto_login', token: savedToken }));
            } else {
                authMessage.innerText = ""; // Clear the "connecting" message
            }
        };

        // --- CONTROL DE LA ISLA DINÁMICA ---
        let islandTimeout = null;

        function wakeUpIsland(duration) {
            const island = document.getElementById('dynamic-island');
            if (!island) return;

            // 1. La hacemos 100% visible
            island.classList.add('active');

            // 2. Cancelamos cualquier temporizador viejo
            if (islandTimeout) clearTimeout(islandTimeout);

            // 3. Programamos que se vuelva a dormir
            islandTimeout = setTimeout(() => {
                island.classList.remove('active');
            }, duration);
        }

        let islandGlowTimeout = null;
        function triggerIslandGlow(color) {
            const island = document.getElementById('dynamic-island');
            if (!island) return;
            island.style.boxShadow = `0 0 15px ${color}, inset 0 0 10px ${color}`;
            if (islandGlowTimeout) clearTimeout(islandGlowTimeout);
            islandGlowTimeout = setTimeout(() => {
                island.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(255, 255, 255, 0.1)';
            }, 3500);
        }

        // --- SISTEMA DE BANDEJA DE ENTRADA (ISLA DINÁMICA) ---
        let unreadPMs = []; // Guarda los nombres de quienes nos escriben

        window.addEventListener('DOMContentLoaded', () => {
            const island = document.getElementById('dynamic-island');
            if (island) {
                island.addEventListener('mousedown', () => wakeUpIsland(5000));
                island.addEventListener('touchstart', () => wakeUpIsland(5000));
            }

            const notifBtn = document.getElementById('island-notif-btn');
            const notifBadge = document.getElementById('notif-badge');
            
            const announceBtn = document.getElementById('island-announce-btn');
            const announceBadge = document.getElementById('announce-badge');
            const closeAnnounceBtn = document.getElementById('close-announcement-btn');

            if (announceBtn) {
                const openAnnouncements = (e) => {
                    e.stopPropagation();
                    wakeUpIsland(5000);
                    
                    if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                        const msg = window.serverAnnouncementsQueue[0];
                        const banner = document.getElementById('global-announcement-banner');
                        const textEl = document.getElementById('global-announcement-text');
                        if (banner && textEl) {
                            textEl.innerText = msg;
                            banner.style.animation = 'none';
                            banner.offsetHeight;
                            banner.style.display = 'block';
                            banner.style.animation = 'slideDownFade 0.5s ease-out forwards';
                        }
                    }
                };
                announceBtn.addEventListener('mousedown', openAnnouncements);
                announceBtn.addEventListener('touchstart', openAnnouncements, { passive: false });
            }

            if (closeAnnounceBtn) {
                closeAnnounceBtn.addEventListener('click', () => {
                    const banner = document.getElementById('global-announcement-banner');
                    
                    if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                        window.serverAnnouncementsQueue.shift(); // Remove the one we just read
                    }
                    
                    if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                        // Show next immediately
                        const msg = window.serverAnnouncementsQueue[0];
                        const textEl = document.getElementById('global-announcement-text');
                        if (textEl) textEl.innerText = msg;
                        
                        if (announceBadge) announceBadge.innerText = window.serverAnnouncementsQueue.length;
                    } else {
                        // Close banner and hide button
                        if (banner) banner.style.display = 'none';
                        if (announceBtn) announceBtn.style.display = 'none';
                    }
                });
            }

            // Ocultar el puntito rojo al inicio
            if (notifBadge) notifBadge.style.display = 'none';

            if (notifBtn) {
                const openInbox = (e) => {
                    e.stopPropagation();
                    wakeUpIsland(5000);

                    // Ya no abrimos un chat random, abrimos el INBOX
                    document.getElementById('inbox-modal').style.display = 'flex';

                    // Le pedimos al servidor nuestra lista de chats
                    ws.send(MessagePack.encode({ type: 'get_inbox' }));

                    // Borramos la notificación roja
                    unreadPMs = [];
                    if (notifBadge) notifBadge.style.display = 'none';
                };
                notifBtn.addEventListener('mousedown', openInbox);
                notifBtn.addEventListener('touchstart', openInbox);
            }
        });

        // 👇 NUEVO: DETECTOR DE CIERRE DE CONEXIÓN 👇
        ws.onclose = () => {
            console.error('El servidor ha cerrado la conexión (Render Sleep Mode).');
            document.getElementById('disconnect-screen').style.display = 'flex';
        };

        ws.onmessage = (event) => {
            const data = MessagePack.decode(new Uint8Array(event.data));
            // --- NUEVO: SISTEMA UNIFICADO DE REPOSICIÓN (KNOCKBACK Y ANTI-HACK) ---
            if (data.type === 'force_position') {
                if (data.reason === 'knockback') {
                    player.kbX = (data.x - player.worldX) / 3;
                    player.kbY = (data.y - player.worldY) / 3;

                    // 🛑 EL FIX 1: Arrancamos el cronómetro de tambaleo
                    player.staggerTimer = Date.now();
                    return;
                }
                // 1. Regresar físicamente al personaje
                player.worldX = data.x;
                player.worldY = data.y;

                // 2. Detener cualquier inercia de movimiento
                player.vx = 0;
                player.vy = 0;
                lastNetworkString = ""; // Obliga al navegador a sincronizarse de golpe

                // 3. Flash rojo y penalti SOLO si es anti-hack real, NO por colisiones con paredes
                if (data.reason === 'antihack' || (!data.reason)) {
                    player.speed = 4; // Matar posible speedhack
                    if (uiFadeOverlay) {
                        uiFadeOverlay.style.background = 'red';
                        uiFadeOverlay.style.opacity = '0.5';
                        setTimeout(() => {
                            uiFadeOverlay.style.opacity = '0';
                            setTimeout(() => { uiFadeOverlay.style.background = 'black'; }, 200);
                        }, 100);
                    }
                }
                // reason:'wall' = colisión limpia, sin flash ni penalti
                return; // Detenemos la ejecución
            }

            // --- NEW: BLUEPRINTS (PREFABS) ---
            if (data.type === 'blueprint_list') {
                const listDiv = document.getElementById('prefabs-list');
                if (listDiv) {
                    listDiv.innerHTML = '';
                    if (!data.blueprints || data.blueprints.length === 0) {
                        listDiv.innerHTML = '<div style="color: #aaa; text-align: center; padding: 10px;">No hay prefabs guardados.</div>';
                    } else {
                        data.blueprints.forEach(bp => {
                            const btn = document.createElement('button');
                            btn.style.background = '#222';
                            btn.style.border = '1px solid #444';
                            btn.style.color = 'white';
                            btn.style.padding = '10px';
                            btn.style.borderRadius = '5px';
                            btn.style.cursor = 'pointer';
                            btn.style.display = 'flex';
                            btn.style.justifyContent = 'space-between';
                            btn.innerHTML = `<span><b>${bp.name}</b></span> <span style="color:#aaa;">(${bp.w}x${bp.h})</span>`;
                            btn.onclick = () => {
                                // Cargar en el pincel
                                selectedGrid = {
                                    w: bp.w,
                                    h: bp.h,
                                    isMultiLayer: bp.isMultiLayer,
                                    multiTiles: bp.multiTiles,
                                    tiles: []
                                };
                                document.getElementById('prefabs-modal').style.display = 'none';
                                
                                // Auto-cambiar a Paint
                                worldMode = 'paint';
                                mapSelectionBox = null; // ELIMINA EL CUADRO MORADO DESPUES DE EQUIPAR
                                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                                document.getElementById('world-paint-btn').classList.add('active');
                            };
                            listDiv.appendChild(btn);
                        });
                    }
                }
                return;
            }

            // --- NEW: AUTHENTICATION RESPONSES ---
            if (data.type === 'auth_error') {
                authMessage.style.color = '#ff6b6b'; // Red
                authMessage.innerText = data.message;
            } // --- RECIBIR RESPUESTA DE LA TIENDA ---
            else if (data.type === 'soccer_update') {
                if (window.soccerMinigame) {
                    window.soccerMinigame.updateBall(data.bx, data.by, data.s1, data.s2);
                    
                    // Show scoreboard UI if not already visible
                    const sb = document.getElementById('soccer-scoreboard');
                    if (sb && sb.style.display === 'none') {
                        sb.style.display = 'block';
                    }
                }
            }
            else if (data.type === 'delete_minigame') {
                if (window.soccerMinigame) {
                    window.soccerMinigame.ball.active = false;
                }
                const sb = document.getElementById('soccer-scoreboard');
                if (sb) {
                    sb.style.display = 'none';
                }
            }
            else if (data.type === 'inventory_update') {
                player.inventory = data.inventory;
                updateInventoryUI();
            }else if (data.type === 'task_claimed') {
                myClaimedTasks = data.claimedTasks;
                if(typeof renderTasksModal === 'function') renderTasksModal();
                if(typeof checkTaskBadge === 'function') checkTaskBadge();
                
                // Texto flotante de éxito
                spawnDamageText(player.worldX, player.worldY, "¡RECOMPENSA!", true);
            } else if (data.type === 'coins_update') {
                player.coins = data.coins;
                const coinsDisplay = document.getElementById('profile-coins-display');
                if (coinsDisplay) coinsDisplay.innerText = player.coins;
            } else if (data.type === 'claim_error') {
                // NUNCA silencies un error en desarrollo. Si falla, el jugador debe saber por qué.
                alert("❌ No se pudo reclamar: " + (data.message || "Error desconocido"));
                // Forzamos a repintar para quitar el estado de "Procesando..."
                if(typeof renderTasksModal === 'function') renderTasksModal();
            } else if (data.type === 'argem_packages_data') {
                const grid = document.getElementById('argems-store-grid');
                if (!grid) return;
                grid.innerHTML = '';
                
                data.packages.forEach(pkg => {
                    const card = document.createElement('div');
                    card.style.cssText = `background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; padding: 20px; text-align: center; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; transition: 0.2s; box-shadow: 0 5px 15px rgba(0,0,0,0.3);`;
                    card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.boxShadow = `0 10px 25px ${pkg.color}33, inset 0 0 15px ${pkg.color}33`; card.style.borderColor = pkg.color; };
                    card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)'; card.style.borderColor = 'rgba(255,255,255,0.1)'; };

                    if (pkg.badge) {
                        const badge = document.createElement('div');
                        badge.innerText = pkg.badge;
                        badge.style.cssText = `position: absolute; top: -10px; right: -10px; background: ${pkg.color}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5);`;
                        card.appendChild(badge);
                    }

                    card.innerHTML += `
                        <div style="font-size: 48px; margin-bottom: 10px; filter: drop-shadow(0 0 10px ${pkg.color}88);">💎</div>
                        <h3 style="color: white; margin: 0 0 5px 0; font-size: 16px;">${pkg.title}</h3>
                        <div style="color: #f1c40f; font-weight: bold; font-size: 24px; margin-bottom: 15px; text-shadow: 0 0 5px rgba(241,196,15,0.5);">${pkg.gemsAmount}</div>
                    `;

                    const btn = document.createElement('button');
                    btn.innerText = pkg.priceString + ' USD';
                    btn.style.cssText = `background: ${pkg.color}; border: none; color: white; padding: 10px 0; width: 100%; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.3);`;
                    btn.onmouseover = () => { btn.style.filter = 'brightness(1.2)'; };
                    btn.onmouseout = () => { btn.style.filter = 'brightness(1)'; };
                    
                    btn.onclick = () => {
                        if (ws.readyState === WebSocket.OPEN) {
                            btn.innerText = "Processing...";
                            ws.send(MessagePack.encode({ type: 'request_purchase_gems', packageId: pkg.id }));
                        }
                    };
                    card.appendChild(btn);
                    grid.appendChild(card);
                });

            } else if (data.type === 'stripe_checkout_url') {
                // Open the Stripe Checkout page in a new secure tab
                window.open(data.url, '_blank');
                
                // Refetch packages to reset the buttons back from "Processing..."
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'get_argem_packages' }));
                }

            } else if (data.type === 'gems_purchase_success') {
                player.gems = data.newGems;
                const balanceDisplay = document.getElementById('argems-balance-display');
                if (balanceDisplay) {
                    balanceDisplay.innerText = `${player.gems} 💎`;
                    // Animación de flash visual
                    balanceDisplay.style.color = '#fff';
                    balanceDisplay.style.transform = 'scale(1.5)';
                    setTimeout(() => {
                        balanceDisplay.style.color = '#f1c40f';
                        balanceDisplay.style.transform = 'scale(1)';
                    }, 300);
                }
                
                // Show floating text
                damageTexts.push({
                    x: player.worldX + (Math.random() * 20 - 10),
                    y: player.worldY - 20,
                    text: data.message,
                    color: '#f1c40f',
                    life: 80,
                    maxLife: 80,
                    scale: 1,
                    velY: -0.5
                });
                
                // Refetch packages to reset the buttons from "Processing..."
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'get_argem_packages' }));
                }
                
            } else if (data.type === 'buy_success') {
                // Actualizar billetera e inventario localmente
                player.coins = data.newCoins;
                player.inventory = data.newInventory;

                // Efectos visuales de éxito
                shopModal.style.display = 'none';
                isShopOpen = false;

                spawnDamageText(player.worldX, player.worldY, "¡COMPRADO!", true); // Texto verde flotante

                // Actualizar el perfil y la UI
                const coinsDisplay = document.getElementById('profile-coins-display');
                if (coinsDisplay) coinsDisplay.innerText = player.coins;

                // Resetear el botón
                const rawData = weaponsDB[currentShopItemId] || window.MASTER_CATALOG[currentShopItemId];
                buyItemBtn.innerHTML = ` <span style="font-size: 18px;">🪙</span> <span id="shop-item-price">${rawData.price}</span>`;
                buyItemBtn.style.background = "#2ecc71";
            }
            else if (data.type === 'buy_error') {
                // Resetear el botón y mostrar el error (ej: No tienes dinero)
                const rawData = weaponsDB[currentShopItemId] || window.MASTER_CATALOG[currentShopItemId];
                buyItemBtn.innerHTML = ` <span style="font-size: 18px;">🪙</span> <span id="shop-item-price">${rawData.price}</span>`;
                buyItemBtn.style.background = "#2ecc71";

                // Usamos una alerta rápida (o puedes cambiarlo por tu sistema de notificaciones en el futuro)
                alert("❌ " + data.message);
            } else if (data.type === 'register_success') {
                authMessage.style.color = '#4cd137'; // Green
                authMessage.innerText = data.message;
            } else if (data.type === 'trigger_tutorial') {
                // If they haven't seen the tutorial, open it automatically!
                setTimeout(() => {
                    if (tutorialModal) {
                        currentTutorialStep = 0;
                        renderTutorialStep();
                        tutorialModal.style.display = 'flex';
                    }
                }, 500); // Pequeño retraso para que no sea súper agresivo
            } else if (data.type === 'feedback_success') {
                // Restaurar botón
                if (submitFeedbackBtn) {
                    submitFeedbackBtn.innerText = "Submit";
                    submitFeedbackBtn.disabled = false;
                }
                if (feedbackModal) feedbackModal.style.display = 'none';
                if (feedbackInput) feedbackInput.value = '';
                
                // Mostrar el nuevo Modal de Éxito en lugar de alert()
                if (feedbackSuccessMsg) feedbackSuccessMsg.innerText = data.message;
                if (feedbackSuccessModal) feedbackSuccessModal.style.display = 'flex';
                
                spawnDamageText(player.worldX, player.worldY, "Feedback Sent!", true);
            }// --- RECIBIR LISTA DE TODOS MIS SQUADS ---
            else if (data.type === 'my_squads_list_data') {
                squadsListContainer.innerHTML = "";

                data.squads.forEach(sq => {
                    const row = document.createElement('div');
                    row.style.background = "rgba(255,255,255,0.05)";
                    row.style.border = sq.isLeader ? "1px solid #f1c40f" : "1px solid rgba(255,255,255,0.2)";
                    row.style.borderRadius = "10px"; row.style.padding = "15px"; row.style.cursor = "pointer";
                    row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center";

                    // Si tiene logo lo dibujamos, si no, ponemos la bandera
                    const logoHtml = sq.logo
                        ? `<img src="${sq.logo}" style="width: 45px; height: 45px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.3);">`
                        : `<div style="width: 45px; height: 45px; background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%); border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 20px;">🏴‍☠️</div>`;

                    row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 15px;">
                            ${logoHtml}
                            <div>
                                <div style="color: ${sq.isLeader ? '#f1c40f' : 'white'}; font-weight: bold; font-family: sans-serif; font-size: 16px;">
                                    ${sq.isLeader ? '' : ''}${escapeHTML(sq.name)}
                                </div>
                                <div style="color: #aaa; font-size: 12px; font-family: sans-serif; margin-top: 4px;">${sq.memberCount} Miembros</div>
                            </div>
                        </div>
                        <span style="color: #777; font-size: 20px;">➔</span>
                    `;

                    row.onclick = () => {
                        lastSquadMenu = 'list'; // <--- 🌟 ¡NUEVO! Memorizamos que vinimos de Mis Squads
                        ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq.id }));
                    }; squadsListContainer.appendChild(row);
                });
                squadListModal.style.display = 'flex';
            } else if (data.type === 'squad_search_results') {
                renderSquadSearchResults(data.results);
            }
            // --- RECIBIR DETALLES DE UN SQUAD AL HACER CLIC ---
            else if (data.type === 'my_squad_data') {
                const sq = data.squad;
                window.mySquadData = sq; // Save for tasks menu
                document.getElementById('my-squad-title').innerText = sq.name;
                document.getElementById('my-squad-member-count').innerText = `${sq.members.length + 1} / 25 Miembros`;

                // Poner el Logo en Grande
                const logoContainer = document.getElementById('my-squad-logo-container');
                if (sq.logo) {
                    logoContainer.innerHTML = `<img src="${sq.logo}" style="width: 100%; height: 100%; object-fit: cover;">`;
                } else {
                    logoContainer.innerHTML = `🏴‍☠️`;
                }

                // Mostrar botón de "Editar" SOLO si soy el líder
                const editBtn = document.getElementById('edit-squad-btn');
                if (sq.leader.name === player.username) {
                    editBtn.style.display = 'block';
                    editBtn.onclick = () => {
                        originalSquadName = sq.name;
                        currentEditSquadId = sq.id;
                        editSquadNameInput.value = sq.name;
                        editSquadLogoInput.value = sq.logo || "";
                        squadEditMsg.innerText = "";
                        confirmEditSquad.innerText = "Guardar Logo (Gratis)";
                        mySquadModal.style.display = 'none';
                        squadEditModal.style.display = 'flex';
                    };
                } else {
                    editBtn.style.display = 'none';
                }

                // --- NUEVO: LÓGICA DEL BOTÓN DE TAG ---
                const toggleTagBtn = document.getElementById('toggle-squad-tag-btn');
                toggleTagBtn.style.display = 'block';

                // ¿El ID de este clan es igual al que tengo en mi memoria RAM?
                const isTagEquipped = (player.squad === sq.id);

                if (isTagEquipped) {
                    toggleTagBtn.innerText = "Tag Equipado";
                    toggleTagBtn.style.background = "rgba(46, 204, 113, 0.2)";
                    toggleTagBtn.style.color = "#2ecc71";
                    toggleTagBtn.style.border = "1px solid #2ecc71";
                } else {
                    toggleTagBtn.innerText = "Equipar este Tag";
                    toggleTagBtn.style.background = "rgba(255, 255, 255, 0.1)";
                    toggleTagBtn.style.color = "white";
                    toggleTagBtn.style.border = "1px solid rgba(255, 255, 255, 0.3)";
                }

                toggleTagBtn.onclick = () => {
                    toggleTagBtn.innerText = "Procesando...";
                    ws.send(MessagePack.encode({ type: 'toggle_squad_tag', squadId: sq.id }));
                };

                // Y PON ESTA:
                renderSquadGrid(sq);


            }// --- RECIBIR DATOS DEL LEADERBOARD ---
            else if (data.type === 'squad_leaderboard_data') {
                currentLeaderboardData = {
                    squads: data.squads,
                    liveBases: data.liveBases
                };
                renderLeaderboard(); // Dibuja la pestaña actualmente seleccionada
            }// --- RESPUESTA: TAG EQUIPADO / DESEQUIPADO ---
            else if (data.type === 'toggle_squad_success') {
                if (document.getElementById('island-squad-chat-btn')) {
                    document.getElementById('island-squad-chat-btn').style.display = player.squad ? 'flex' : 'none';
                }
                // Actualizar mi propia memoria RAM
                player.squad = data.isActive ? data.squadId : null;
                player.squadName = data.squadName;
                player.squadLogo = data.squadLogo;

                // Recargar los detalles del squad para que el botón se redibuje con el color correcto
                ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
                updateSquadChatButton();
            }
            else if (data.type === 'edit_squad_success') {
                if (data.newCoins !== undefined) {
                    player.coins = data.newCoins;
                    const coinsDisplay = document.getElementById('profile-coins-display');
                    if (coinsDisplay) coinsDisplay.innerText = player.coins;
                }
                player.squadName = data.squadName;
                player.squadLogo = data.squadLogo;

                // 🛑 EL FIX: Sin alert(). El botón muta a verde por 1 segundo y cierra.
                const btnEdit = document.getElementById('confirm-edit-squad');
                if (btnEdit) {
                    btnEdit.innerText = "¡Guardado con Éxito!";
                    btnEdit.style.background = "#2ecc71";
                    setTimeout(() => {
                        squadEditModal.style.display = 'none';
                        btnEdit.style.background = "#f1c40f";
                        btnEdit.innerText = "Guardar Cambios";
                    }, 1200);
                }

                // Volvemos a pedir los detalles para que la imagen se actualice mágicamente
                ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
            }
            else if (data.type === 'edit_squad_error') {
                document.getElementById('squad-edit-msg').innerText = data.message;
                document.getElementById('confirm-edit-squad').innerText = "Reintentar";
            }
            // --- NO TIENE SQUADS ---
            else if (data.type === 'no_squads_found') {
                alert("Aún no perteneces a ningún Squad. ¡Crea uno o busca uno al cual unirte!");
            }
            else if (data.type === 'no_squad') {
                alert("Aún no perteneces a ningún Squad. ¡Crea uno o busca uno al cual unirte!");
            }// --- ÉXITO DE CLAN (CREAR, ACEPTAR O INVITAR) ---
            else if (data.type === 'squad_success') {
                if (data.newCoins !== undefined) {
                    player.coins = data.newCoins;
                    const coinsDisplay = document.getElementById('profile-coins-display');
                    if (coinsDisplay) coinsDisplay.innerText = player.coins;
                }

                if (data.squadName !== undefined) {
                    player.squadName = data.squadName;
                    player.squadLogo = data.squadLogo;
                    player.squad = data.squadId;
                }

                // 1. ¿Viene del botón de invitar en el perfil?
                const inviteBtn = document.getElementById('invite-squad-btn');
                if (inviteBtn && inviteBtn.innerText === "⏳ Enviando...") {
                    inviteBtn.innerText = "✓ Invitación Enviada";
                    inviteBtn.style.background = "#2ecc71";
                    inviteBtn.style.borderColor = "#27ae60";
                    inviteBtn.style.color = "black";
                    return;
                }

                // 2. 🛑 EL FIX: ¿Viene de fundar un clan nuevo? Mutamos el botón.
                const createBtn = document.getElementById('confirm-create-squad');
                if (createBtn && createBtn.innerText === "Creando...") {
                    createBtn.style.display = "none"; // Adiós botón azul

                    const goBtn = document.getElementById('go-to-new-squad-btn');
                    if (goBtn) {
                        goBtn.style.display = "block"; // Hola botón verde
                        goBtn.onclick = () => {
                            // Al hacer clic, cerramos la creación y abrimos el clan
                            document.getElementById('squad-create-modal').style.display = 'none';

                            // Reseteamos botones para la próxima vez
                            createBtn.style.display = "block";
                            createBtn.innerText = "2000 Argons";
                            goBtn.style.display = "none";

                            lastSquadMenu = 'main'; // Miga de pan
                            ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
                        };
                    }
                    return;
                }

                // 3. Fallback silencioso (Ej. Aceptaste un invite de la Isla Dinámica)
                spawnDamageText(player.worldX, player.worldY, "¡Clan Actualizado!", true);
                updateSquadChatButton();
            }
            else if (data.type === 'squad_error') {
                // 1. Mensajes del creador de Squads (Ya usaba texto rojo, sin alert)
                const createMsg = document.getElementById('squad-create-msg');
                if (createMsg) {
                    createMsg.style.color = "#ff6b6b";
                    createMsg.innerText = data.message;
                }
                const confirmBtn = document.getElementById('confirm-create-squad');
                if (confirmBtn) confirmBtn.innerText = "2000 Argons";

                // 2. 🛑 EL FIX: Botón de Invitación de Perfil (Inyectar el error en el botón)
                const inviteBtn = document.getElementById('invite-squad-btn');
                if (inviteBtn && inviteBtn.innerText === "⏳ Enviando...") {

                    inviteBtn.innerText = "❌ " + data.message; // Ej: "❌ El jugador no está en línea"
                    inviteBtn.style.fontSize = "12px"; // Achicamos letra por si el error es largo
                    inviteBtn.style.background = "#e74c3c"; // Rojo fallo
                    inviteBtn.style.borderColor = "#c0392b";

                    // Restaurarlo a su forma normal en 2.5 segundos
                    setTimeout(() => {
                        inviteBtn.innerText = "🏴‍☠️ Invitar al Clan";
                        inviteBtn.style.fontSize = "15px";
                        inviteBtn.style.background = "rgba(155, 89, 182, 0.2)";
                        inviteBtn.style.borderColor = "#9b59b6";
                        inviteBtn.disabled = false;
                    }, 2500);
                }
            }// 🛑 NUEVO: Si el admin me da/quita permisos en vivo
            else if (data.type === 'update_permissions') {
                player.squadCanInvite = data.canInvite;
            }
            // 🛑 NUEVO: Actualizar permisos al ponerme/quitarme la placa
            else if (data.type === 'toggle_squad_success') {
                player.squad = data.isActive ? data.squadId : null;
                player.squadName = data.squadName;
                player.squadLogo = data.squadLogo;
                player.squadCanInvite = data.squadCanInvite; // <-- Agregamos esta línea
                ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
            }/// --- RECIBIR HISTORIAL DE PM ---
            else if (data.type === 'pm_history') {
                if (currentChatTargetId === data.targetAccountId) {
                    pmTargetName.innerText = data.targetUsername;
                    currentChatTargetName = data.targetUsername;

                    // Extraemos la cabeza de forma segura
                    currentChatTargetHead = (data.targetEquipped && data.targetEquipped.head) ? data.targetEquipped.head : 'head_default';

                    // 👇 NUEVO: Dibujar el Avatar del encabezado (Header) con la cabeza correcta
                    const pmHeaderAvatar = document.getElementById('pm-header-avatar');
                    if (pmHeaderAvatar) {
                        pmHeaderAvatar.innerHTML = "";
                        pmHeaderAvatar.appendChild(createAvatarCanvas(36, data.targetAccountId, currentChatTargetHead));
                    }

                    renderPMHistory(data.history);
                }
            }// --- RECIBIR LISTA DE AMIGOS ---
            else if (data.type === 'friends_list_data') {
                renderFriendsList(data.friends);
            }
            // 👇 PEGA ESTO NUEVO AQUÍ 👇
            // --- RESPUESTA: AMIGO ELIMINADO ---
            else if (data.type === 'friend_removed') {
                if (player.friends) {
                    // Lo borramos de la memoria RAM local
                    player.friends = player.friends.filter(id => id !== data.targetId);
                }
                alert("Amigo eliminado de tu lista.");
                // Actualizamos la ventana gráfica pidiéndole la nueva lista al servidor
                ws.send(MessagePack.encode({ type: 'get_friends_list' }));
            }// --- RECIBIR RESULTADOS DE LA BÚSQUEDA ---
            else if (data.type === 'search_players_results') {
                renderSearchResults(data.results);
            }
            // 👆 HASTA AQUÍ 👆// --- RECIBIR LISTA DEL INBOX ---
            else if (data.type === 'inbox_data') {
                renderInbox(data.inbox);
            }
            // --- RECIBIR NUEVO PM (NOTIFICACIÓN) ---
            else if (data.type === 'receive_pm') {
                if (currentChatTargetId === data.senderAccountId && document.getElementById('pm-modal').style.display === 'flex') {
                    renderPMHistory(data.history);
                } else {
                    if (!unreadPMs.includes(data.senderAccountId)) {
                        unreadPMs.push(data.senderAccountId);
                    }
                    const badge = document.getElementById('notif-badge');
                    if (badge) {
                        badge.style.display = 'flex';
                        // 🛠️ EL FIX: El Badge ahora dice CUÁNTAS personas distintas te han hablado (O suma con peticiones pendientes)
                        badge.innerText = unreadPMs.length + pendingRequests.length;
                    }
                    const notifBtn = document.getElementById('island-notif-btn');
                    if (notifBtn) {
                        notifBtn.classList.remove('icon-pop-anim');
                        void notifBtn.offsetWidth; // Trigger reflow
                        notifBtn.classList.add('icon-pop-anim');
                    }
                    if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);
                    if (typeof triggerIslandGlow === 'function') triggerIslandGlow('#3498db'); // Blue glow for PM
                }
            }// --- SQUAD CHAT (RADIO) ---
            else if (data.type === 'squad_chat_history') {
                const sqHistoryContainer = document.getElementById('squad-chat-history-container');
                sqHistoryContainer.innerHTML = "";
                if (data.history.length === 0) {
                    sqHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px; font-style:italic;">Radio silenciosa.</div>';
                } else {
                    data.history.forEach(msg => sqHistoryContainer.appendChild(buildSquadChatBubble(msg)));
                    sqHistoryContainer.scrollTop = sqHistoryContainer.scrollHeight;
                }
            }
            else if (data.type === 'new_squad_chat') {
                const sqHistoryContainer = document.getElementById('squad-chat-history-container');
                const sqChatModal = document.getElementById('squad-chat-modal');
                const sqBadge = document.getElementById('squad-notif-badge');

                // 1. Detectar la prioridad de la mención
                const textLower = data.message.text.toLowerCase();
                let incomingMention = 'none';

                if (textLower.includes(`@${player.username.toLowerCase()}`)) incomingMention = 'personal';
                else if (textLower.includes('@important')) incomingMention = 'important';
                else if (textLower.includes('@everyone')) incomingMention = 'everyone';

                // Si la ventana está abierta, lo añadimos a la plática
                if (sqChatModal.style.display === 'flex') {
                    if (sqHistoryContainer.innerHTML.includes("Radio silenciosa")) sqHistoryContainer.innerHTML = "";
                    sqHistoryContainer.appendChild(buildSquadChatBubble(data.message));
                    sqHistoryContainer.scrollTop = sqHistoryContainer.scrollHeight;
                }
                // Si la ventana está cerrada, gestionamos el Badge Dinámico
                else {
                    unreadSquadMessages++;

                    // Solo actualiza el color si viene una mención (o si ya había una, la sobreescribe)
                    if (incomingMention !== 'none') {
                        squadMentionType = incomingMention;
                    }

                    if (sqBadge) {
                        sqBadge.style.display = 'flex';

                        // Mutar color y texto según la última mención recibida
                        if (squadMentionType === 'personal') {
                            sqBadge.innerText = `@${unreadSquadMessages}`;
                            sqBadge.style.background = "#f1c40f"; // Amarillo brillante
                            sqBadge.style.color = "black";
                        }
                        else if (squadMentionType === 'important') {
                            sqBadge.innerText = `!${unreadSquadMessages}`;
                            sqBadge.style.background = "#e67e22"; // Naranja de alerta
                            sqBadge.style.color = "white";
                        }
                        else if (squadMentionType === 'everyone') {
                            sqBadge.innerText = `*${unreadSquadMessages}`;
                            sqBadge.style.background = "#9b59b6"; // Morado global
                            sqBadge.style.color = "white";
                        }
                        else {
                            sqBadge.innerText = unreadSquadMessages;
                            sqBadge.style.background = "#e74c3c"; // Rojo normal sin mención
                            sqBadge.style.color = "white";
                        }
                    }
                    if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);
                }
            }
            else if (data.type === 'init') {
                // 🚨 ACTUALIZA EL BOTÓN TAN PRONTO COMO ENTRA EL JUGADOR
                updateSquadChatButton();
                authOverlay.style.pointerEvents = 'none';
                // 💿 GUARDAR LA PLAYLIST
                bgmPlaylist = data.playlist || [];
                authOverlay.style.opacity = '0';
                window.PATCH_NOTES = data.patchNotes || []; // Guarda las noticias en la memoria local
                // 👇 NUEVO: GUARDAR DICCIONARIO Y CONSTRUIR LA UI 👇
                window.ZONE_CONFIG = data.zoneConfig || {};
                buildZoneUI();
                window.RANKS = data.ranksDB || [];
                // --- NUEVO: CONTADOR DE CARGA Y DESCARGA DEL CATÁLOGO MÁGICO ---
                window.MASTER_CATALOG = data.masterCatalog || {};
                window.loadedItemSprites = window.loadedItemSprites || {};
                
                // 🌟 ASIGNAR TAREAS Y LOGROS GLOBALES 🌟
                globalTasks = data.globalTasks || {};
                if (!player || !player.accountId) {
                    myTaskProgress = data.taskProgress || {};
                    myClaimedTasks = data.claimedTasks || {}; 
                }
                console.log(`[DEBUG] Updated myClaimedTasks from ${data.type}:`, myClaimedTasks);
                if(typeof checkTaskBadge === 'function') checkTaskBadge();

                CLIENT_TRASH_CATALOG = data.trashCatalog || [];
                CLIENT_METALS_CATALOG = Object.values(data.masterCatalog || {})
                    .filter(i => i.category === 'metal')
                    .map(m => ({ ...m, value: m.price || 0 })); // 👈 EL FIX: Clonamos el objeto y le creamos la variable 'value' copiando su 'price'
                // 🛡️ ESCUDO ANTI-CRASH: Si llega vacío, lee un objeto en blanco en lugar de crashear
                let weaponCount = Object.values(data.weaponsDB || {}).filter(w => w.src).length;
                let catalogCount = Object.values(window.MASTER_CATALOG || {}).filter(i => i.src).length;

                totalAssetsToLoad = weaponCount + data.tilesetsDB.length + catalogCount;
                assetsLoaded = 0;

                // 🛑 EL FIX: Descargar tooooooda la ropa e ítems del Catálogo Maestro
                for (let itemId in window.MASTER_CATALOG) {
                    const item = window.MASTER_CATALOG[itemId];
                    if (item.src) {
                        const img = new Image();
                        img.onload = () => {
                            assetsLoaded++;
                            updateLoadingBar();
                        };
                        img.src = item.src;
                        window.loadedItemSprites[itemId] = img;
                    }
                }
                updateLoadingBar("Descargando mapas y armas...");

                // GUARDAR DB DE ARMAS Y PRECARGAR SUS SONIDOS A LA RAM
                WEAPONS = data.weaponsDB;
                for (let wId in WEAPONS) {
                    // Cargar imagen
                    if (WEAPONS[wId].src) {
                        const img = new Image();
                        img.onload = () => {
                            assetsLoaded++; updateLoadingBar(); renderHudHotbar();
                        };
                        img.src = WEAPONS[wId].src;
                        loadedWeaponSprites[wId] = img;
                    }
                    // 🔊 EL FIX: Pre-cargar los sonidos de disparo a la RAM del celular
                    if (WEAPONS[wId].audio) {
                        if (WEAPONS[wId].audio.use) preloadSound(WEAPONS[wId].audio.use);
                        if (WEAPONS[wId].audio.reload) preloadSound(WEAPONS[wId].audio.reload);
                    }
                }

                // GUARDAR DB DE TILESETS Y DESCARGAR IMÁGENES
                TILESET_CONFIG = data.tilesetsDB;
                TILESET_CONFIG.forEach(ts => {
                    const img = new Image();
                    img.onload = () => {
                        assetsLoaded++;
                        updateLoadingBar();
                        if (assetsLoaded >= totalAssetsToLoad) {
                            floorChunks.clear();
                            overheadChunks.clear();
                            dirtyChunks.clear();
                        }
                    };
                    img.src = ts.src;
                    loadedTilesets[ts.id] = img;
                });

                // 👇 AÑADE ESTA LÍNEA AQUÍ 👇
                weaponsDB = data.weaponsDB;

                // (Esto ya lo tenías)
                if (data.skeleton) {
                    SKELETON_DATA.anchors = data.skeleton;
                }

                // Escudo por si no hay nada que descargar
                if (totalAssetsToLoad === 0) {
                    assetsLoaded = 1; totalAssetsToLoad = 1; updateLoadingBar("¡Listo!");
                }

                myId = data.id;
                player.worldX = data.players[myId].worldX;
                player.worldY = data.players[myId].worldY;
                player.username = data.players[myId].username;
                player.accountId = data.players[myId].accountId;
                player.coins = data.players[myId].coins || 0; // <--- ¡AÑADE ESTA LÍNEA!
                player.gems = data.players[myId].gems || 0;
                player.squadName = data.players[myId].squadName;
                player.squadLogo = data.players[myId].squadLogo;
                player.squad = data.players[myId].squad;
                player.elo = data.players[myId].elo || 1000;
                // 👇 AÑADE ESTA LÍNEA AQUÍ 👇
                player.quickSwaps = data.players[myId].quickSwaps || [];

                // 🛑 EL FIX: Asegurarnos de que el cliente guarda toda la info de la zona, incluyendo su Tipo
                safeZones = data.safeZones || [];

                // 👇 NUEVO: SINCRONIZAR SALUD AL APARECER 👇
                player.hp = data.players[myId].hp !== undefined ? data.players[myId].hp : 100;
                player.isDead = data.players[myId].isDead || false;

                // 🛑 EL FIX: LEER KILLS Y LOSSES AL RECARGAR LA PÁGINA 🛑
                player.kills = data.players[myId].kills || 0;
                player.losses = data.players[myId].losses || 0;
                centralBase = data.centralBase; // Guardar la base inicial
                // 🛑 EL FIX: Cargar la basura que ya estaba tirada cuando entraste
                groundItems = data.groundItems || {};
                // 🛑 EL FIX: Guardamos el catálogo dinámico
                CLIENT_TRASH_CATALOG = data.trashCatalog || [];

                // Actualizar la Isla Dinámica visualmente
                const islandFill = document.getElementById('island-hp-fill');
                const islandText = document.getElementById('island-hp-text');
                if (islandText && islandFill) {
                    islandText.innerText = `${player.hp} / 100`;
                    islandFill.style.width = `${player.hp}%`;
                    if (player.hp > 50) islandFill.style.backgroundColor = '#2ecc71';
                    else if (player.hp > 25) islandFill.style.backgroundColor = '#f1c40f';
                    else islandFill.style.backgroundColor = '#e74c3c';
                }
                for (let id in data.players) {
                    if (id !== myId) {
                        otherPlayers[id] = data.players[id];
                        otherPlayers[id].targetX = data.players[id].worldX || 0;
                        otherPlayers[id].targetY = data.players[id].worldY || 0;
                    }
                }
                // 🔄 NEW: Store tiles as objects with layer and collision data!
                if (data.worldMap) {
                    data.worldMap.forEach(t => {
                        const l = t.l || 0;
                        worldMap.set(getMapKey(t.x, t.y, l), {
                            tileId: t.tileId, l: l, hasCollision: t.hasCollision || false, isSit: t.isSit || false,
                            triggerType: t.triggerType, destX: t.destX, destY: t.destY,
                            itemId: t.itemId,
                            rotation: t.rotation || 0,
                            requiresClick: t.requiresClick || false,
                            npcMessage: t.npcMessage || "",
                            itemRow: t.itemRow || 0,
                            shelfX: t.shelfX || 0,
                            shelfY: t.shelfY || 0,
                        });
                    });
                    // 📸 EL FIX: ¡El mapa ya llegó, toma una foto nueva!
                    floorDirty = true;
                }
            } else if (data.type === 'spawn_hole') {
                digHoles.push({
                    x: data.x,
                    y: data.y,
                    life: 200, // Durará unos segundos en pantalla
                    maxLife: 200
                });
            }// 🗣️ NUEVO: ESCUCHAR MENSAJES DEL SISTEMA (SERVER ALERTAS)
            else if (data.type === 'system_message') {
                if (data.isAlert) alert("System: " + data.text);
                // Inyectamos el texto directamente en el sistema de daño flotante
                let dt = {
                    x: player.worldX + (Math.random() * 20 - 10),
                    y: player.worldY - 20,
                    text: data.text,
                    color: data.color || "#3498db", // Usa el color que manda el server
                    life: 80,
                    maxLife: 80
                };
                damageTexts.push(dt);
            }// (Pon esto junto a tus otros else if, por ejemplo debajo de 'shoot' o 'hp_update')
            else if (data.type === 'global_announcement') {
                window.serverAnnouncementsQueue = window.serverAnnouncementsQueue || [];
                window.serverAnnouncementsQueue.push(data.message);
                
                const announceBtn = document.getElementById('island-announce-btn');
                const announceBadge = document.getElementById('announce-badge');
                
                if (announceBtn) {
                    announceBtn.style.display = 'flex';
                    // Trigger animation
                    announceBtn.classList.remove('icon-pop-anim');
                    void announceBtn.offsetWidth; // Trigger reflow
                    announceBtn.classList.add('icon-pop-anim');
                    
                    if (announceBadge) {
                        announceBadge.style.display = 'flex';
                        announceBadge.innerText = window.serverAnnouncementsQueue.length;
                    }
                }
                
                // Wake up the island to make sure it's visible
                if (typeof wakeUpIsland === 'function') {
                    wakeUpIsland(5000);
                }
                if (typeof triggerIslandGlow === 'function') {
                    triggerIslandGlow('#f1c40f'); // Gold glow for server announcements
                }
            }
            else if (data.type === 'spawn_item') {
                groundItems[data.id] = data.item;
            }
            else if (data.type === 'remove_item') {
                delete groundItems[data.id];
            } else if (data.type === 'sell_success') {
                player.inventory = data.newInventory;
                if (data.newCoins !== undefined) player.coins = data.newCoins;

                // 1. Cierra el Yonke (si estaba abierto)
                const junkyard = document.getElementById('junkyard-modal');
                if (junkyard) junkyard.style.display = 'none';
                isJunkyardOpen = false;
                lastJunkyardTile = null;

                //  2. EL FIX: Cierra también la Joyería (si estaba abierta)
                const jeweler = document.getElementById('jeweler-modal');
                if (jeweler) jeweler.style.display = 'none';
                if (typeof isJewelerOpen !== 'undefined') isJewelerOpen = false;
                if (typeof lastJewelerTile !== 'undefined') lastJewelerTile = null;

                // 3. Actualizamos las monedas en el perfil (por si acaso)
                const coinsDisplay = document.getElementById('profile-coins-display');
                if (coinsDisplay) coinsDisplay.innerText = player.coins;

                // 4. Texto flotante de ganancia
                let dt = { x: player.worldX, y: player.worldY, text: `+${data.earned} 🪙`, color: "#f1c40f", life: 100, maxLife: 100 };
                damageTexts.push(dt);
            } else if (data.type === 'inventory_update') {
                // 🛑 EL FIX: Tu juego guarda en su memoria local lo que envíe el servidor
                if (player) {
                    player.inventory = data.inventory;
                }
            }// Recibir daño a la base en vivo
            else if (data.type === 'base_update') {
                centralBase = data.base;
            } else if (data.type === 'new_safezone') {
                // 👇 NUEVO: AGREGAR ZONA NUEVA EN TIEMPO REAL 👇
                safeZones.push(data.zone);
            }// 👇 AÑADE ESTO 👇
            else if (data.type === 'safezone_deleted') {
                // Filtramos la lista para quitar la que el servidor nos ordenó borrar
                safeZones = safeZones.filter(z => z._id !== data.id);
            }// Recibir info del letrero
            else if (data.type === 'arena_info_update') {
                if (document.getElementById('arena-modal').style.display !== 'none' && window.currentViewingArenaId === data.arenaId) {

                    document.getElementById('arena-modal-title').innerText = `🥊 ${data.name}`;

                    const fightersEl = document.getElementById('arena-current-fighters');
                    if (data.fighter1 && data.fighter2) {
                        fightersEl.innerHTML = `<span style="color:#3498db">${data.fighter1}</span> <span style="color:white; font-size:12px;">vs</span> <span style="color:#e74c3c">${data.fighter2}</span>`;
                    } else {
                        fightersEl.innerHTML = "El Ring está Vacío";
                    }

                    const queueEl = document.getElementById('arena-queue-list');
                    if (data.queue.length === 0) {
                        queueEl.innerHTML = "<div style='text-align:center; color:#777; margin-top: 10px;'>No hay nadie en fila.</div>";
                    } else {
                        queueEl.innerHTML = data.queue.map((name, index) =>
                            `<div style="padding: 5px; border-bottom: 1px solid rgba(255,255,255,0.05);"><b>#${index + 1}</b> - ${name}</div>`
                        ).join('');
                    }

                    const joinBtn = document.getElementById('arena-join-btn');
                    if (data.inQueue) {
                        joinBtn.innerText = "Salir de la Fila";
                        joinBtn.style.background = "#7f8c8d";
                        joinBtn.style.boxShadow = "0 4px 0 #34495e";
                        joinBtn.onclick = () => ws.send(MessagePack.encode({ type: 'leave_arena_queue', arenaId: data.arenaId }));
                    } else {
                        joinBtn.innerText = "Entrar a la Fila";
                        joinBtn.style.background = "#e74c3c";
                        joinBtn.style.boxShadow = "0 4px 0 #c0392b";
                        joinBtn.onclick = () => {
                            ws.send(MessagePack.encode({ type: 'join_arena_queue', arenaId: data.arenaId }));
                        };
                    }
                }
            }

            // Si el servidor avisa que alguien entró a la fila mientras tú estabas viendo el letrero
            else if (data.type === 'refresh_arena_ui') {
                if (document.getElementById('arena-modal').style.display !== 'none' && window.currentViewingArenaId === data.arenaId) {
                    ws.send(MessagePack.encode({ type: 'get_arena_info', arenaId: data.arenaId }));
                }
            }

            // El teletransporte cinemático a la arena
            else if (data.type === 'match_found') {
                document.getElementById('arena-modal').style.display = 'none';

                player.isTeleporting = true;
                const fade = document.getElementById('fade-overlay');
                fade.style.background = 'white'; // Flashazo blanco de pelea
                fade.style.opacity = '1';

                setTimeout(() => {
                    player.worldX = data.targetX;
                    player.worldY = data.targetY;
                    lastNetworkString = "";
                    setTimeout(() => {
                        fade.style.opacity = '0';
                        fade.style.background = 'black';
                        player.isTeleporting = false;
                        spawnDamageText(player.worldX, player.worldY, "¡FIGHT!", true);
                    }, 200);
                }, 250);
            }
            // 👇 AÑADE ESTE BLOQUE COMPLETO 👇
            else if (data.type === 'match_finished') {
                if (data.newElo !== undefined) player.elo = data.newElo;

                // 🔧 FIX: Limpiar el arenaId para que el modal pueda reabrir después del match
                window.currentViewingArenaId = null;

                // Al terminar la pelea, volver a donde estabas
                player.isTeleporting = true;
                const fade = document.getElementById('fade-overlay');
                fade.style.background = 'black';
                fade.style.opacity = '1';

                setTimeout(() => {
                    player.worldX = data.returnX;
                    player.worldY = data.returnY;
                    lastNetworkString = "";
                    setTimeout(() => {
                        fade.style.opacity = '0';
                        player.isTeleporting = false;

                        // Mostrar un letreo épico flotante sobre tu personaje
                        spawnDamageText(player.worldX, player.worldY, data.result, true);
                    }, 200);
                }, 250);
            }
            else if (data.type === 'tile_update') {
                const key = getMapKey(data.x, data.y, data.l);
                if (data.tileId === -1) {
                    worldMap.delete(key);
                } else {
                    const existing = worldMap.get(key) || { hasCollision: false, isSit: false };
                    worldMap.set(key, {
                        tileId: data.tileId, l: data.l, hasCollision: existing.hasCollision, isSit: existing.isSit
                    });
                }
                markChunkDirty(data.x, data.y);
                minimapDirty = true; // 📸 AVISAR AL MINIMAPA QUE ALGO SE CONSTRUYÓ
            }
            else if (data.type === 'tile_update_bulk') {
                data.tiles.forEach(t => {
                    const key = getMapKey(t.x, t.y, t.l);
                    if (t.tileId === -1) {
                        worldMap.delete(key);
                    } else {
                        const existing = worldMap.get(key) || { hasCollision: false, isSit: false };
                        worldMap.set(key, {
                            tileId: t.tileId, l: t.l, hasCollision: existing.hasCollision, isSit: existing.isSit,
                            rotation: t.rotation || 0,
                            shelfX: t.shelfX || 0, shelfY: t.shelfY || 0
                        });
                    }
                });
                data.tiles.forEach(t => markChunkDirty(t.x, t.y));
                minimapDirty = true; // 📸 AVISAR AL MINIMAPA
            }
            else if (data.type === 'tile_meta_update') {
                const key = `${data.x},${data.y},${data.layer}`;
                if (worldMap[key]) {
                    worldMap[key].layer = data.layer;
                    worldMap[key].hasCollision = data.hasCollision;
                    worldMap[key].isSit = data.isSit;
                    if (data.triggerType) {
                        worldMap[key].triggerType = data.triggerType;
                        worldMap[key].destX = data.destX;
                        worldMap[key].destY = data.destY;
                        worldMap[key].itemId = data.itemId;
                        // 🛑 LOS 2 NUEVOS FIX:
                        worldMap[key].requiresClick = data.requiresClick;
                        worldMap[key].npcMessage = data.npcMessage;
                        worldMap[key].itemRow = data.itemRow;
                    }
                }
            } // Restore missing brace
            else if (data.type === 'shoot') {
                let spawnX = data.x;
                let spawnY = data.y;

                if (otherPlayers[data.id]) {
                    otherPlayers[data.id].lastShotTime = Date.now(); // 🛑 EL FIX: Levanta el arma del enemigo

                    // 🔫 EL FIX VISUAL: Sincronizar bala con el cañón interpolado
                    const enemy = otherPlayers[data.id];
                    const wStats = window.loadedWeaponsDB ? window.loadedWeaponsDB[data.weaponId] : null;
                    if (wStats) {
                        const dir = enemy.frameY || 0;
                        const d = wStats.dirStats ? (wStats.dirStats[dir] || {}) : {};
                        spawnX = enemy.worldX + (d.hitX || 0);
                        spawnY = enemy.worldY + (d.hitY || 0);
                    }
                }
                // ⚡ LAG COMPENSATION: avanzar la bala los ms que tardó en llegar
                const bulletLag = data.t ? Math.min(Date.now() - data.t, 200) : 0;
                spawnProjectile(spawnX, spawnY, data.angle, data.id, data.weaponId, bulletLag);
                // 🔊 NUEVO: Play the sound!
                const isMe = (data.id === myId);
                playItemSound(data.weaponId, 'use', isMe ? 0.8 : 0.3);
            }// 👇 NUEVO: RECIBIR ESCOPETAZO (ARRAY DE BALAS) 👇
            else if (data.type === 'shoot_shotgun') {
                let spawnX = data.x;
                let spawnY = data.y;

                if (otherPlayers[data.id]) {
                    otherPlayers[data.id].lastShotTime = Date.now(); // Levanta el arma del enemigo

                    // 🔫 EL FIX VISUAL: Sincronizar perdigones con el cañón interpolado
                    const enemy = otherPlayers[data.id];
                    const wStats = window.loadedWeaponsDB ? window.loadedWeaponsDB[data.weaponId] : null;
                    if (wStats) {
                        const dir = enemy.frameY || 0;
                        const d = wStats.dirStats ? (wStats.dirStats[dir] || {}) : {};
                        spawnX = enemy.worldX + (d.hitX || 0);
                        spawnY = enemy.worldY + (d.hitY || 0);
                    }
                }

                // ⚡ LAG COMPENSATION: avanzar cada pellet los ms de lag
                const shotgunLag = data.t ? Math.min(Date.now() - data.t, 200) : 0;
                data.angles.forEach(ang => {
                    spawnProjectile(spawnX, spawnY, ang, data.id, data.weaponId, shotgunLag);
                });

                // 🔊 THE FIX: Trigger the sound!
                const isMe = (data.id === myId);
                playItemSound(data.weaponId, 'use', isMe ? 0.8 : 0.3);
            }// --- VER QUE OTROS DAN ESPADAZOS ---
            else if (data.type === 'player_swing') {
                if (otherPlayers[data.id]) {
                    otherPlayers[data.id].isSwinging = true;
                    otherPlayers[data.id].swingStartTime = Date.now();
                }

                // 🔊 THE FIX: Escuchar los espadazos de otros jugadores
                playItemSound(data.weaponId, 'use', 0.3);
            }

            // =======================================================================
            // 💥 RECEPCIÓN MAESTRA DE VIDA, DAÑO, INTERFAZ, KILLS Y LOSSES 💥
            // =======================================================================
            else if (data.type === 'hp_update') {

                // --- 1. SI YO RECIBÍ EL DAÑO O LA CURACIÓN ---
                if (data.targetId === myId) {
                    player.hp = data.newHp;
                    player.health = data.newHp; // 🛑 EL FIX: Sincroniza la barra de vida sobre tu cabeza
                    player.isDead = data.isDead;
                    player.lastHpUpdateTime = Date.now();
                    // 🛡️ Respawn shield: store when it expires so we can draw it
                    if (data.shieldUntil) player.shieldUntil = data.shieldUntil;

                    if (data.damageDealt > 0) {
                        player.lastHitTime = Date.now();
                        spawnDamageText(player.worldX, player.worldY, data.damageDealt, false);

                        // Efecto de Pantalla Roja (Sangre)
                        const overlay = document.getElementById('damage-overlay');
                        if (overlay) {
                            overlay.style.opacity = '1';
                            setTimeout(() => { overlay.style.opacity = '0'; }, 150);
                        }
                        if (typeof wakeUpIsland === 'function') wakeUpIsland(3000);

                    } else if (data.damageDealt < 0) {
                        // Curación (Texto Verde)
                        spawnDamageText(player.worldX, player.worldY, data.damageDealt, true);
                        if (typeof wakeUpIsland === 'function') wakeUpIsland(2000);
                    }

                    // Actualizar la "Isla Dinámica" (UI)
                    const islandFill = document.getElementById('island-hp-fill');
                    const islandText = document.getElementById('island-hp-text');
                    if (islandText) islandText.innerText = `${player.hp} / 100`;

                    if (islandFill) {
                        islandFill.style.width = `${player.hp}%`;
                        if (player.hp > 50) islandFill.style.backgroundColor = '#2ecc71'; // Verde
                        else if (player.hp > 25) islandFill.style.backgroundColor = '#f1c40f'; // Amarillo
                        else islandFill.style.backgroundColor = '#e74c3c'; // Rojo
                    }
                }

                // --- 2. SI OTRO JUGADOR RECIBIÓ EL DAÑO O LA CURACIÓN ---
                else if (otherPlayers[data.targetId]) {
                    let enemy = otherPlayers[data.targetId];
                    enemy.hp = data.newHp;
                    enemy.health = data.newHp; // 🛑 EL FIX: Sincroniza la barra de vida del enemigo
                    enemy.isDead = data.isDead;
                    enemy.lastHpUpdateTime = Date.now();
                    // 🛡️ Respawn shield
                    if (data.shieldUntil) enemy.shieldUntil = data.shieldUntil;

                    if (data.damageDealt > 0) {
                        enemy.lastHitTime = Date.now();
                        spawnDamageText(enemy.worldX, enemy.worldY, data.damageDealt, false);
                    } else if (data.damageDealt < 0) {
                        spawnDamageText(enemy.worldX, enemy.worldY, data.damageDealt, true);
                    }
                }

                // --- 3. ACTUALIZAR KILLS Y LOSSES EN LA PANTALLA ---
                if (data.isDead) {

                    // Actualizar al Tirador (El que hizo la kill)
                    if (data.shooterId === myId) {
                        player.kills = data.shooterKills;
                        spawnDamageText(player.worldX, player.worldY, "+1 Kill", true); // Flota texto verde en ti
                    } else if (otherPlayers[data.shooterId]) {
                        otherPlayers[data.shooterId].kills = data.shooterKills;
                    }

                    // Actualizar a la Víctima (El que murió)
                    if (data.targetId === myId) {
                        player.losses = data.targetLosses;
                        spawnDamageText(player.worldX, player.worldY, "+1 Loss", false); // Flota texto rojo en ti
                    } else if (otherPlayers[data.targetId]) {
                        otherPlayers[data.targetId].losses = data.targetLosses;
                    }
                }

                // 🏴 TURF RESPAWN: teletransportar al spawn con fade
                // isTeleporting=true INMEDIATO para congelar movimiento desde el primer frame
                if (!data.isDead && data.targetId === myId && data.respawnX != null && data.respawnY != null) {
                    player.isTeleporting = true; // ← congela input de movimiento al instante

                    const fade = document.getElementById('fade-overlay');
                    if (fade) {
                        fade.style.background = 'black';
                        fade.style.opacity = '0.9';
                        setTimeout(() => {
                            // Mover al spawn exactamente cuando la pantalla está negra
                            player.worldX = data.respawnX;
                            player.worldY = data.respawnY;
                            player.vx = 0; player.vy = 0;
                            lastNetworkString = '';
                            spawnDamageText(player.worldX, player.worldY, '🏴 Respawn', true);
                            // Desvanecer Y soltar el congelamiento solo al terminar el fade
                            setTimeout(() => {
                                fade.style.opacity = '0';
                                player.isTeleporting = false; // ← movimiento habilitado de nuevo
                            }, 220);
                        }, 320);
                    } else {
                        // Fallback sin fade: mover y liberar inmediatamente
                        player.worldX = data.respawnX;
                        player.worldY = data.respawnY;
                        player.vx = 0; player.vy = 0;
                        lastNetworkString = '';
                        player.isTeleporting = false;
                    }
                }
            }
            else if (data.type === 'joined' || data.type === 'update') {
                // Ignore messages about our own character!
                if (data.id === myId) return;

                // 🛑 FAILSAFE 1: Ignorar si el servidor manda un paquete vacío
                if (!data.player) return;

                if (!otherPlayers[data.id]) {
                    // First time seeing this player
                    otherPlayers[data.id] = data.player;
                    otherPlayers[data.id].targetX = data.player.worldX;
                    otherPlayers[data.id].targetY = data.player.worldY;
                } else {
                    const op = otherPlayers[data.id];

                    // 🛑 FAILSAFE 2: Si el jugador localmente es un fantasma (null), borrar y abortar
                    if (!op) {
                        delete otherPlayers[data.id];
                        return;
                    }

                    // 1. Update identity and state
                    op.username = data.player.username;
                    op.frameY = data.player.frameY;
                    op.isMoving = data.player.isMoving;
                    op.isSitting = data.player.isSitting;

                    // 🛑 THE JITTER FIX: We DELETED `op.frameX = data.player.frameX`
                    // The client will animate the legs locally!

                    // 🛑 THE TELEPORT FIX: ONLY update the target destination. 
                    // Never overwrite op.worldX/Y directly here!
                    op.targetX = data.player.worldX;
                    op.targetY = data.player.worldY;

                    // Update wardrobe and stats
                    op.equippedWeapon = data.player.equippedWeapon;
                    op.isDead = data.player.isDead; op.invisibleEnabled = data.player.invisibleEnabled;
                    op.equipped = data.player.equipped || { head: 'head_default', body: 'body_default', hands: 'none' };
                    op.squadName = data.player.squadName;
                    op.squadLogo = data.player.squadLogo;
                    op.elo = data.player.elo || 1000;
                    op.lastUpdateTick = Date.now(); // Feed the garbage collector

                    // 💬 Chat bubble: only reset timer when it's a NEW message
                    if (data.player.message && data.player.message !== op.message) {
                        op.message = data.player.message;
                        op.messageTimer = data.player.messageTimer > 0 ? data.player.messageTimer : 420;
                    } else if (!data.player.message) {
                        // Sender cleared their message (timer hit 0 on their side)
                        op.message = '';
                        op.messageTimer = 0;
                    }
                    op.isTyping = data.player.isTyping;
                }
            } else if (data.type === 'player_count') {
                const mapPlayerCount = document.getElementById('map-player-count');
                if (mapPlayerCount) mapPlayerCount.innerText = `Players: ${data.count}`;
            } else if (data.type === 'left') {
                delete otherPlayers[data.id];
            } else if (data.type === 'login_success') {
                // SLEDGEHAMMER HIDE THE LOGIN SCREEN
                authOverlay.style.display = 'none';
                authOverlay.style.opacity = '0';
                authOverlay.style.pointerEvents = 'none';
                // 👇 NUEVO: Aterrizar el dron tras loguearse 👇
                isCinematicLoading = false;

                // Si player.squad existe (no es null), muestra el botón como 'flex', si no, 'none'
                if (document.getElementById('island-squad-chat-btn')) {
                    document.getElementById('island-squad-chat-btn').style.display = player.squad ? 'flex' : 'none';
                }

                // SAVE THE TOKEN TO BROWSER MEMORY!
                if (data.token) {
                    localStorage.setItem('gameToken', data.token);
                }
                // --- THE FIX: Load the friends array from the server into your local player! ---
                player.friends = data.friends || [];

                // --- THE FIX: Load the inventory from the server! ---
                player.inventory = data.player.inventory || [];
                // --- THE PERSISTENCE FIX: Apply the loaded weapon! ---
                player.equippedWeapon = data.player.equippedWeapon || "none";

                // --- THE HOTBAR PERSISTENCE FIX ---
                player.hotbar = data.player.hotbar || ["none", "none", "none"];
                player.quickSwaps = data.player.quickSwaps || [];
                player.accountId = data.player.accountId;
                
                // --- 🌟 NUEVO: CARGAR TAREAS DEL SERVIDOR TRAS LOGIN 🌟 ---
                globalTasks = data.globalTasks || {};
                myTaskProgress = data.taskProgress || {};
                myClaimedTasks = data.claimedTasks || {}; console.log(`[DEBUG] Updated myClaimedTasks from ${data.type}:`, myClaimedTasks);
                if(typeof checkTaskBadge === 'function') checkTaskBadge();

                // 🌟 NUEVO: Pedir datos del squad si pertenece a uno, para las recompensas de Squad
                if (data.player.squad) {
                    ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.player.squad }));
                }

                // 🛑 EL FIX 3: Cargar tu ropa desde el servidor al entrar
                player.equipped = data.player.equipped || { head: 'head_default', body: 'body_default', hands: 'none' };
                // --- NUEVO: RECIBIR TU ROL ---
                player.role = data.player.role;

                // EL FIX: Comprobamos si los botones existen antes de intentar cambiarles el 'style'
                const appEditModeBtn = document.getElementById('app-edit-mode');
                const appGodPanelBtn = document.getElementById('app-god-panel');
                const appSkelBtn = document.getElementById('app-skel'); // <--- AÑADE ESTO

                // Ocultar o Mostrar el botón del Editor según tu rol
                if (player.role === 'admin') {
                    if (appEditModeBtn) appEditModeBtn.style.display = 'flex';
                    if (appGodPanelBtn) appGodPanelBtn.style.display = 'flex';
                    if (appSkelBtn) appSkelBtn.style.display = 'flex'; // <--- AÑADE ESTO
                } else {
                    if (appEditModeBtn) appEditModeBtn.style.display = 'none';
                    if (appGodPanelBtn) appGodPanelBtn.style.display = 'none';
                    if (appSkelBtn) appSkelBtn.style.display = 'none'; // <--- AÑADE ESTO
                    editMode = false; // Por si acaso un hacker intenta forzarlo
                }
                // Set the active highlight to match the equipped weapon
                const slotIndex = player.hotbar.indexOf(player.equippedWeapon);
                if (slotIndex !== -1) {
                    player.activeSlot = slotIndex;
                }

                // Redraw the HUD so it shows your saved items!
                renderHudHotbar();

                // MORPH THE TRAY BUTTON INTO "SIGN OUT"
                isLoggedIn = true;
                const authBg = appAuth.querySelector('.app-bg');
                const authText = appAuth.querySelector('span');

                authBg.innerHTML = '<img src="items/icons/door.png" class="pixel-icon" alt="Sign Out">';
                authBg.style.background = 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'; // Red logout gradient
                authText.innerText = 'Sign Out';

                // Update our local character with the DB memory
                player.username = data.player.username;
                player.worldX = data.player.worldX;
                player.worldY = data.player.worldY;
                player.coins = data.player.coins || 0;
                player.gems = data.player.gems || 0;
                player.kills = data.player.kills || 0;
                player.losses = data.player.losses || 0;
                player.elo = data.player.elo || 1000;
                player.squadName = data.player.squadName;
                player.squadLogo = data.player.squadLogo;
                player.squad = data.player.squad;

                // 🛑 EL FIX 1: Guardar tus permisos de reclutador al entrar al juego
                player.squadCanInvite = data.player.squadCanInvite || false;
                // 🚨 ACTUALIZAR EL BOTÓN DE RADIO AL LOGUEARSE
                updateSquadChatButton();
                // Force an immediate camera update
                lastNetworkString = "";
            }// --- NEW: RECEIVE A FRIEND REQUEST ---
            else if (data.type === 'friend_request') {
                pendingRequests.push(data);

                document.getElementById('notif-btn-container').style.display = 'block';
                document.getElementById('notif-badge').style.display = 'flex';
                document.getElementById('notif-badge').innerText = pendingRequests.length; // 🛑 EL FIX

                wakeUpIsland(5000);

                if (nCtx && headImg && headImg.complete) {
                    nCtx.clearRect(0, 0, notifCanvas.width, notifCanvas.height);
                    const headFrameH = headImg.height / 4;
                    const drawW = 32;
                    const drawH = 32 * (headFrameH / FRAME_WIDTH);
                    nCtx.drawImage(headImg, 0, 0, FRAME_WIDTH, headFrameH, (notifCanvas.width - drawW) / 2, (notifCanvas.height - drawH) / 2, drawW, drawH);
                }
            }// --- RECIBIR INVITACIÓN A UN CLAN ---
            else if (data.type === 'squad_invite') {
                pendingRequests.push(data);

                document.getElementById('notif-btn-container').style.display = 'block';
                document.getElementById('notif-badge').style.display = 'flex';
                document.getElementById('notif-badge').innerText = pendingRequests.length; // 🛑 EL FIX
                wakeUpIsland(5000);

                if (nCtx && headImg && headImg.complete) {
                    nCtx.clearRect(0, 0, notifCanvas.width, notifCanvas.height);
                    const headFrameH = headImg.height / 4;
                    const drawW = 32;
                    const drawH = 32 * (headFrameH / FRAME_WIDTH);
                    nCtx.drawImage(headImg, 0, 0, FRAME_WIDTH, headFrameH, (notifCanvas.width - drawW) / 2, (notifCanvas.height - drawH) / 2, drawW, drawH);
                }
            }
            // --- RECIBIR ACTUALIZACIÓN DEL GANI EDITOR ---
            else if (data.type === 'sync_skeleton') {
                SKELETON_DATA.anchors = data.anchors;
            } else if (data.type === 'sync_melee_stats') {
                if (weaponsDB[data.weaponId]) {
                    // Aseguramos que el objeto exista
                    if (!weaponsDB[data.weaponId].dirStats) {
                        weaponsDB[data.weaponId].dirStats = {};
                    }
                    // Sobreescribimos solo la configuración del lado que se editó
                    weaponsDB[data.weaponId].dirStats[data.direction] = data.stats;
                }
            }
        };

        // =========================================================
        //  CONSTRUCTOR DINÁMICO DE LA INTERFAZ DE ZONAS
        // =========================================================
        let activeZoneFilter = 'all'; // 'all' muestra todo. Si es 'trash', solo muestra basureros.
        let showSafeZoneVisuals = false; // Memoria del interruptor principal

        function buildZoneUI() {
            const selectEl = document.getElementById('zone-type-select');
            const filterContainer = document.getElementById('zone-filter-buttons');
            if (!selectEl || !filterContainer) return;

            selectEl.innerHTML = '';
            filterContainer.innerHTML = '';

            // Botón "Todos" para la barra de filtros
            filterContainer.innerHTML += `<button class="tool-btn active zone-filter-btn" data-target="all" style="background: #3498db;">🌟 Todo</button>`;

            // Llenar basado en el servidor
            for (const [key, config] of Object.entries(window.ZONE_CONFIG)) {
                // Llenar Select de Creación
                selectEl.innerHTML += `<option value="${key}">${config.icon} ${config.name}</option>`;

                // Crear botón de Filtro
                filterContainer.innerHTML += `<button class="tool-btn zone-filter-btn" data-target="${key}" style="background: rgba(255,255,255,0.1);">${config.icon} ${config.name}</button>`;
            }

            // Lógica de los botones de filtro
            document.querySelectorAll('.zone-filter-btn').forEach(btn => {
                btn.onclick = (e) => {
                    document.querySelectorAll('.zone-filter-btn').forEach(b => {
                        b.style.background = 'rgba(255,255,255,0.1)';
                        b.classList.remove('active');
                    });

                    e.target.style.background = '#3498db';
                    e.target.classList.add('active');
                    activeZoneFilter = e.target.getAttribute('data-target');
                };
            });
        }

        // --- UPDATED LOGIN BUTTON ---
        loginBtn.addEventListener('click', () => {
            if (ws.readyState !== WebSocket.OPEN) {
                authMessage.style.color = '#f1c40f';
                authMessage.innerText = "Still connecting... please wait.";
                return;
            }

            if (authEmail.value && authPassword.value) {
                ws.send(MessagePack.encode({
                    type: 'login',
                    email: authEmail.value.trim().toLowerCase(), // Send email instead of username
                    password: authPassword.value
                }));
            } else {
                authMessage.innerText = "Please enter your email and password.";
            }
        });

        // --- UPDATED REGISTER BUTTON ---
        registerBtn.addEventListener('click', () => {
            if (ws.readyState !== WebSocket.OPEN) {
                authMessage.style.color = '#f1c40f';
                authMessage.innerText = "Still connecting... please wait.";
                return;
            }

            if (authEmail.value && authUsername.value && authPassword.value) {
                ws.send(MessagePack.encode({
                    type: 'register',
                    email: authEmail.value.trim().toLowerCase(), // Add email
                    username: authUsername.value.trim(),         // Add display name
                    password: authPassword.value
                }));
            } else {
                authMessage.style.color = '#ff6b6b';
                authMessage.innerText = "Please fill out Email, Display Name, and Password to sign up.";
            }
        });

        // Send our state to the server ONLY when something changes
        let lastNetworkString = "";

        function spawnDamageText(x, y, amount, isHeal = false) {
            let textToShow;

            // Si es un número puro (ej. daño o curación), hacemos la matemática normal
            if (typeof amount === 'number') {
                textToShow = isHeal ? "+" + Math.abs(amount) : Math.abs(amount).toString();
            } else {
                // Si ya es un texto con letras (ej. "+1 Kill"), lo dejamos exactamente como viene
                textToShow = amount;
            }

            // Elegimos el color: Verde si es "isHeal" (recompensas/curación), Amarillo para daño
            let textColor = isHeal ? '#2ecc71' : '#f1c40f';

            // 🛑 EL FIX: En lugar de .push(), reciclamos un texto inactivo
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

        // 🛡️ ESCUDO ANTI-XSS: Convierte código malicioso en texto inofensivo
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

        // --- BULLET SPAWNER DINÁMICO (OBJECT POOLING) ---
        // lagMs: milisegundos de red transcurridos → avanzamos la bala ese tiempo
        // para compensar el delay y que visualmente aparezca donde debería estar.
        function spawnProjectile(startX, startY, angle, ownerId, weaponId, lagMs = 0) {
            const stats = WEAPONS[weaponId];
            if (!stats) return;

            // Busca la primera bala que esté "apagada" en el cargador
            for (let i = 0; i < MAX_PROJECTILES; i++) {
                if (!projectiles[i].active) {
                    const vx = Math.cos(angle) * stats.speed;
                    const vy = Math.sin(angle) * stats.speed;

                    // Pasos de extrapolación: avanzamos la bala N ms de tiempo de red
                    // usando el mismo dtScale=1 base para consistencia
                    const lagSteps = Math.min(lagMs / 16.67, 18); // max ~300ms = ~18 frames

                    projectiles[i].active = true;
                    projectiles[i].x     = startX + vx * lagSteps;
                    projectiles[i].y     = startY + vy * lagSteps;
                    projectiles[i].vx    = vx;
                    projectiles[i].vy    = vy;
                    projectiles[i].life  = stats.range - lagSteps; // también consume vida
                    projectiles[i].owner = ownerId;
                    projectiles[i].weapon = weaponId;
                    projectiles[i].color = stats.color || "#f1c40f";
                    return; // Terminó de disparar
                }
            }
            // Si pasas de 100 balas al mismo tiempo, el arma simplemente se encasquilla.
        }

        // --- TWIN STICK LOGIC ---
        const joystickZone = document.getElementById('joystick-zone');
        const joystickKnob = document.getElementById('joystick-knob');
        const aimZone = document.getElementById('aim-zone');
        const aimKnob = document.getElementById('aim-knob');

        // A reusable function to handle moving the visual knob and calculating the math
        function processJoystick(e, zoneElement, knobElement, maxDist) {
            const rect = zoneElement.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // We loop through e.changedTouches instead of e.touches[0] 
            // to handle true multitouch properly
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];

                let dx = touch.clientX - centerX;
                let dy = touch.clientY - centerY;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > maxDist) {
                    dx = (dx / distance) * maxDist;
                    dy = (dy / distance) * maxDist;
                }

                knobElement.style.transform = `translate(${dx}px, ${dy}px)`;

                // Return normalized values (-1.0 to 1.0) so you can apply them to movement or aiming
                return { x: dx / maxDist, y: dy / maxDist };
            }
        }

        // --- LEFT JOYSTICK (MOVEMENT) LISTENERS ---
        joystickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
            e.stopPropagation(); // PREVENTS ZOOM CONFLICT
            const vectors = processJoystick(e, joystickZone, joystickKnob, 35);
            // 🛑 EL FIX: Guardamos la "intención" del joystick, no la velocidad final
            player.joyX = vectors.x;
            player.joyY = vectors.y;
        }, { passive: false });

        joystickZone.addEventListener('touchmove', (e) => {
            e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
            e.stopPropagation(); // PREVENTS ZOOM CONFLICT
            const vectors = processJoystick(e, joystickZone, joystickKnob, 35);
            // 🛑 EL FIX: Guardamos la "intención" del joystick, no la velocidad final
            player.joyX = vectors.x;
            player.joyY = vectors.y;
        }, { passive: false });

        joystickZone.addEventListener('touchend', (e) => {
            e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
            e.stopPropagation();
            joystickKnob.style.transform = `translate(0px, 0px)`;
            // 🛑 EL FIX: Resetear intención al soltar
            player.joyX = 0;
            player.joyY = 0;
        });

        // --- RIGHT JOYSTICK (AIMING) LISTENERS ---
        aimZone.addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            const vectors = processJoystick(e, aimZone, aimKnob, 35);

            // Only shoot if they push the stick far enough (creates a deadzone)
            if (Math.hypot(vectors.x, vectors.y) > 0.3) {
                isShooting = true;
                shootAngle = Math.atan2(vectors.y, vectors.x);
            }
        }, { passive: false });

        aimZone.addEventListener('touchmove', (e) => {
            e.preventDefault(); e.stopPropagation();
            const vectors = processJoystick(e, aimZone, aimKnob, 35);

            if (Math.hypot(vectors.x, vectors.y) > 0.3) {
                isShooting = true;
                shootAngle = Math.atan2(vectors.y, vectors.x);
            } else {
                isShooting = false;
            }
        }, { passive: false });

        aimZone.addEventListener('touchend', (e) => {
            e.preventDefault(); e.stopPropagation();
            aimKnob.style.transform = `translate(0px, 0px)`;
            isShooting = false;
        });

        // --- CHAT LOGIC ---
        const chatContainer = document.getElementById('chat-container');
        const chatToggle = document.getElementById('chat-toggle');
        const chatInput = document.getElementById('chat-input');
        // Detect when the user opens/closes their keyboard
        chatInput.addEventListener('focus', () => { player.isTyping = true; });
        chatInput.addEventListener('blur', () => { player.isTyping = false; });
        const sendBtn = document.getElementById('send-btn');

        // Open the chat bar and trigger keyboard
        chatToggle.addEventListener('click', () => {
            chatContainer.classList.add('expanded');
            chatToggle.style.display = 'none'; // Hide the chat icon

            // Slight delay ensures the CSS animation starts before pulling up the keyboard
            setTimeout(() => {
                chatInput.focus();
            }, 100);
        });

        function closeChat() {
            chatInput.value = "";
            chatInput.blur(); // Hides the keyboard
            chatContainer.classList.remove('expanded');

            // Wait for the collapse animation before showing the icon again
            setTimeout(() => {
                chatToggle.style.display = 'block';
            }, 300);
        }

        function sendMessage() {
            const text = chatInput.value.trim();
            if (text !== "") {

                // 👇 NUEVO: COMANDO DE RESCATE /fix (ANTI-ABUSO) 👇
                if (text.toLowerCase() === '/fix' || text.toLowerCase() === '/unstuck') {
                    // Limpiamos todos los estados físicos y de interfaz locales
                    player.isTeleporting = false;
                    player.isReloading = false;
                    player.isSwinging = false;
                    player.isMoving = false;

                    // 🛡️ EL FIX: Solo te cura si de verdad estabas en estado de muerte
                    if (player.hp <= 0 || player.isDead) {
                        player.hp = 100;
                        player.isDead = false;
                    }

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(MessagePack.encode({ type: 'force_unstuck' }));
                    }

                    // Si tienes el arma bugueada, la forzamos a recargar visualmente
                    renderHudHotbar();
                    closeChat();
                    return; // Detenemos la ejecución
                }

                // --- COMANDO DE ADMIN: TELETRANSPORTE INSTANTÁNEO ---
                // ¡EL FIX!: Ahora verifica si tienes el rol de admin
                if (text.startsWith('/tp ') && player.role === 'admin') {
                    const parts = text.split(' ');
                    if (parts.length === 3) {
                        const tx = parseInt(parts[1]);
                        const ty = parseInt(parts[2]);
                        if (!isNaN(tx) && !isNaN(ty)) {
                            player.worldX = (tx * TILE_SIZE) + (TILE_SIZE / 2);
                            player.worldY = (ty * TILE_SIZE) + (TILE_SIZE / 2);
                            lastNetworkString = "";
                        }
                    }
                }
                // --- MENSAJE DE CHAT NORMAL ---
                else {
                    player.message = text;
                    player.messageTimer = 420;
                }
            }
            closeChat();
        }

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // If the user taps the game screen while chat is open, close it
        canvas.addEventListener('touchstart', (e) => {
            if (chatContainer.classList.contains('expanded') && e.touches.length === 1) {
                // Only close if they didn't tap inside the chat box
                if (e.touches[0].clientY > 80) {
                    closeChat();
                }
            }
        }, { passive: false });

        // --- GAME LOOP ---
        function drawGrid(offsetX, offsetY) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
            ctx.lineWidth = 1;

            // Scale the grid up by our zoom level
            const gridSize = 50 * zoomLevel;

            // Scale the movement offset so the floor slides at the correct speed
            const scaledOffsetX = offsetX * zoomLevel;
            const scaledOffsetY = offsetY * zoomLevel;

            const startX = scaledOffsetX % gridSize;
            const startY = scaledOffsetY % gridSize;

            // Draw lines (starting slightly off-screen to prevent popping)
            for (let x = startX - gridSize; x < window.innerWidth; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, window.innerHeight); ctx.stroke();
            }
            for (let y = startY - gridSize; y < window.innerHeight; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(window.innerWidth, y); ctx.stroke();
            }
        }

        function updatePlayerDirection() {
            const currentlyMoving = (player.vx !== 0 || player.vy !== 0);

            if (currentlyMoving !== player.isMoving) {
                player.frameX = 0; player.tickCount = 0; player.isMoving = currentlyMoving;
            }

            // --- 1. MIRADA (NUEVO ORDEN: 0=Abajo, 1=Derecha, 2=Izquierda, 3=Arriba) ---
            let faceAngle;
            if (isShooting) {
                faceAngle = shootAngle;
            } else if (player.isMoving) {
                faceAngle = Math.atan2(player.vy, player.vx);
            }

            if (faceAngle !== undefined) {
                const deg = faceAngle * (180 / Math.PI);
                // RESTAURADO: Tu lógica original que funciona perfecto
                if (deg > 45 && deg <= 135) player.frameY = 0;
                else if (deg > 135 || deg <= -135) player.frameY = 1;
                else if (deg > -45 && deg <= 45) player.frameY = 2;
                else if (deg > -135 && deg <= -45) player.frameY = 3;
            }

            // --- 2. ANIMACIÓN DE LAS PIERNAS (DINÁMICA) ---
            player.tickCount++;

            const speedMod = player.isMoving ? 1 : 2;

            // 🛑 LÍMITES EXACTOS DE TU IMAGEN
            let maxFrames = 4;
            if (player.equippedWeapon && player.equippedWeapon !== "none") {
                maxFrames = player.isMoving ? 6 : 1;
            } else {
                maxFrames = player.isMoving ? 8 : 4;
            }

            if (player.tickCount > player.ticksPerFrame * speedMod) {
                player.tickCount = 0;
                player.frameX = (player.frameX + 1) % maxFrames;
            }
        }

        // A helper function to draw perfectly scaled chat bubbles
        function drawDynamicBubble(text, timer, isTyping, x, y, scaledWidth) {
            // If they aren't chatting and aren't typing, do nothing
            if (timer <= 0 && !isTyping) return;

            // 1. Scale the font size to be a bit smaller (changed from 14 to 12)
            const fontSize = 7 * zoomLevel;
            ctx.font = `bold ${fontSize}px Arial`;

            // 2. Scale the outline thickness slightly down for the smaller text
            ctx.lineJoin = "round";
            ctx.lineWidth = 2.5 * zoomLevel;
            ctx.strokeStyle = "black";

            // 3. Anchor it perfectly above the head
            const bubbleY = y + (15 * zoomLevel);
            const centerX = x + (scaledWidth / 2);

            if (timer > 0) {
                // --- ACTUAL CHAT MESSAGE ---
                // Keep standard messages centered
                ctx.textAlign = "center";

                ctx.strokeText(text, centerX, bubbleY);
                ctx.fillStyle = "white";
                ctx.fillText(text, centerX, bubbleY);

            } else if (isTyping) {
                // --- TYPING INDICATOR ---
                // Lock alignment to the left so the dots don't wiggle back and forth
                ctx.textAlign = "left";

                // Animate the dots (1 to 3)
                const dotCount = (Math.floor(Date.now() / 400) % 3) + 1;
                const displayText = ".".repeat(dotCount);

                // Pre-measure the maximum width of "..." so we can center the whole block
                const maxTextWidth = ctx.measureText("...").width;
                const startX = centerX - (maxTextWidth / 2);

                ctx.strokeText(displayText, startX, bubbleY);
                ctx.fillStyle = "white";
                ctx.fillText(displayText, startX, bubbleY);
            }
        }

        // --- NEW: Helper to pick a consistent color based on a player's name ---
        function getColorForString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash) % 360;
            return `hsl(${hue}, 80%, 65%)`; // Returns a nice, bright, readable color!
        }

        // 🚀 EL FIX DE RENDIMIENTO: Caché de Nombres
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

            // Guardar info útil en el objeto canvas
            tCanvas.actualWidth = currentX;
            nametagCache[key] = tCanvas;
            return tCanvas;
        }

        // --- SQUAD LOGOS CACHE ---
        const squadLogosCache = {}; // Guarda imágenes para no laguear

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
                    // Alineamos el logo con el texto matemáticamente
                    ctx.drawImage(img, currentX, tagY + (nameCanvas.height / 2) - (logoSize * 0.85), logoSize, logoSize);
                    ctx.globalAlpha = 1.0;
                }
            }
        }
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

        tabSearchInput.addEventListener('input', (e) => {
            // Convertimos lo que escribes a minúsculas para que no importe si usas mayúsculas
            const query = e.target.value.toLowerCase().trim();

            // Obtenemos todos los botones de los tabs generados
            const tabs = tilesetTabsContainer.querySelectorAll('button');

            tabs.forEach(tab => {
                // Obtenemos el texto del botón (ej. "🔫 Weapons" o "🧱 Walls")
                const tabName = tab.innerText.toLowerCase();

                // Si el nombre del tab incluye lo que escribiste, lo mostramos. Si no, lo ocultamos.
                if (tabName.includes(query)) {
                    tab.style.display = 'block'; // o 'inline-block' dependiendo de tu flexbox original
                } else {
                    tab.style.display = 'none';
                }
            });
        });
        // --- LÓGICA DEL BOTÓN DE EDIT MODE ---
        appEditMode.addEventListener('click', () => {
            appTray.classList.remove('open'); // Cerrar el menú de apps

            editMode = !editMode; // Alternar estado (Prender/Apagar)

            if (editMode) {
                editorToolbar.style.display = 'flex';
                tilePalette.style.display = 'flex';
                if (coordHelper) coordHelper.style.display = 'block'; // <--- SHOW RADAR

                if (!pCanvas) {
                    pCanvas = document.getElementById('palette-canvas');
                    pCtx = pCanvas.getContext('2d');
                    PALETTE_SCALE = 2;
                    attachPaletteListeners();

                    // --- NUEVO: CREAR BOTONES DE PESTAÑAS AL ABRIR ---
                    const tabsContainer = document.getElementById('tileset-tabs');
                    tabsContainer.innerHTML = ''; // Limpiar

                    TILESET_CONFIG.forEach((ts, index) => {
                        const btn = document.createElement('button');
                        btn.innerText = ts.name;
                        btn.className = `tool-btn ${index === 0 ? 'active' : ''}`;
                        btn.style.whiteSpace = 'nowrap';
                        btn.style.flexShrink = '0';

                        btn.onclick = () => {
                            // Cambiar estilos de los botones
                            tabsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');

                            // Cambiar la imagen activa
                            switchTileset(index);
                        };
                        tabsContainer.appendChild(btn);
                    });

                    // Cargar la primera imagen por defecto
                    switchTileset(0);
                }

                document.getElementById('tool-select').click();
                appEditMode.querySelector('.app-bg').style.boxShadow = "0 0 15px #f5576c";
            } else {
                editorToolbar.style.display = 'none';
                tilePalette.style.display = 'none';
                tileInspector.style.display = 'none';
                isPainting = false;
                appEditMode.querySelector('.app-bg').style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
                if (coordHelper) coordHelper.style.display = 'none'; // <--- HIDE RADAR

                // 👇 NUEVO: APAGAR TODO LO DE LAS ZONAS AL CERRAR EL EDITOR 👇
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

                showSafeZoneVisuals = false; // Apagar los rayos X del mapa
            }
        });

        function switchTileset(index) {
            currentTilesetIndex = index;
            const activeTs = TILESET_CONFIG[index];
            const img = loadedTilesets[activeTs.id];

            // Ajustar el canvas al tamaño de la NUEVA imagen
            const scaledSize = TILE_SIZE * PALETTE_SCALE;
            cols = Math.floor(img.width / TILE_SIZE);
            const rows = Math.floor(img.height / TILE_SIZE);
            pCanvas.width = cols * scaledSize;
            pCanvas.height = rows * scaledSize;

            // Resetear la selección para evitar bugs visuales
            selectStart = null;
            selectEnd = null;
            isDraggingBox = false;

            drawPalette();
        }

        // Botón de la "X" para cerrar la paleta lateral
        closePalette.addEventListener('click', () => {
            if (editMode) appEditMode.click(); // Simula un clic en la app para apagar todo limpio
        });

        // 👆 HASTA AQUÍ 👆

        // --- LÓGICA DE LA APP DE ACTUALIZACIONES ---
        const appUpdates = document.getElementById('app-updates');
        const updatesModal = document.getElementById('updates-modal');
        const closeUpdatesModal = document.getElementById('close-updates-modal');
        const updatesListContainer = document.getElementById('updates-list-container');

        if (appUpdates) {
            appUpdates.addEventListener('click', () => {
                hideTrayForModal();
                renderPatchNotes();
                updatesModal.style.display = 'flex';
            });
        }

        if (closeUpdatesModal) {
            closeUpdatesModal.addEventListener('click', () => {
                updatesModal.style.display = 'none';
                restoreTrayAfterModal();
            });
        }

        function renderPatchNotes() {
            updatesListContainer.innerHTML = "";

            if (!window.PATCH_NOTES || window.PATCH_NOTES.length === 0) {
                updatesListContainer.innerHTML = '<div style="text-align:center; color:#777; font-style:italic;">No hay noticias recientes.</div>';
                return;
            }

            window.PATCH_NOTES.forEach((note, index) => {
                // Formatear la fecha
                const dateObj = new Date(note.date);
                const dateString = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

                // Destacar el parche más reciente
                const isNewest = index === 0;
                const borderColor = isNewest ? 'rgba(0, 198, 255, 0.5)' : 'rgba(255,255,255,0.1)';
                const bg = isNewest ? 'rgba(0, 198, 255, 0.05)' : 'rgba(255,255,255,0.02)';
                const badge = isNewest ? `<span style="background: #00c6ff; color: black; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">¡NUEVO!</span>` : '';

                const noteDiv = document.createElement('div');
                noteDiv.style.background = bg;
                noteDiv.style.border = `1px solid ${borderColor}`;
                noteDiv.style.borderRadius = "10px";
                noteDiv.style.padding = "15px";

                noteDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <h4 style="margin: 0; color: ${isNewest ? '#00c6ff' : 'white'}; font-family: sans-serif; font-size: 16px;">
                            ${escapeHTML(note.title)} ${badge}
                        </h4>
                        <span style="color: #777; font-size: 11px; font-family: monospace;">v${escapeHTML(note.version)}</span>
                    </div>
                    <div style="color: #aaa; font-size: 10px; margin-bottom: 10px;">📅 ${dateString}</div>
                    <div style="color: #ddd; font-size: 13px; line-height: 1.5; font-family: sans-serif; white-space: pre-wrap;">${escapeHTML(note.description)}</div>
                `;

                updatesListContainer.appendChild(noteDiv);
            });
        }

        // --- LÓGICA DEL GOD PANEL Y PUNTERO MÁGICO ---
        const appGodPanel = document.getElementById('app-god-panel');
        const godModal = document.getElementById('god-modal');
        const closeGodModal = document.getElementById('close-god-modal');
        const godPointerBtn = document.getElementById('god-pointer-btn');
        const godDragHandle = document.getElementById('god-drag-handle');

        let godPointerActive = false;

        // EL FIX: Envolver en un "if" gigante para que no crashee si te falta el HTML
        if (appGodPanel && godModal && closeGodModal && godPointerBtn) {

            appGodPanel.addEventListener('click', () => {
                hideTrayForModal();
                godModal.style.display = 'flex';
            });

            closeGodModal.addEventListener('click', () => {
                godModal.style.display = 'none';
                restoreTrayAfterModal();
            });

            godPointerBtn.addEventListener('click', () => {
                godPointerActive = !godPointerActive;
                if (godPointerActive) {
                    godPointerBtn.style.background = "#e74c3c";
                    godPointerBtn.innerText = "🔴 Puntero Activado";
                    canvas.style.cursor = 'crosshair';
                } else {
                    godPointerBtn.style.background = "#34495e";
                    godPointerBtn.innerText = "🪄 Activar Puntero Mágico";
                    canvas.style.cursor = 'default';
                }
            });

            // --- ADMIN TOOLS LOGIC ---
            const adminTargetIdInput = document.getElementById('admin-target-id');
            const adminSummonBtn = document.getElementById('admin-summon-btn');
            const adminTeleportBtn = document.getElementById('admin-teleport-btn');
            const adminKickBtn = document.getElementById('admin-kick-btn');
            const adminRespawnBtn = document.getElementById('admin-respawn-btn');

            const adminAnnounceBtn = document.getElementById('admin-announce-btn');
            const adminAnnounceInput = document.getElementById('admin-announce-input');

            function sendAdminCommand(type) {
                if (!adminTargetIdInput) return;
                const targetGameId = adminTargetIdInput.value.trim().toUpperCase();
                if (!targetGameId) {
                    alert("Please enter a target Player ID.");
                    return;
                }
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: type, targetGameId: targetGameId }));
                }
            }

            if (adminSummonBtn) adminSummonBtn.addEventListener('click', () => sendAdminCommand('admin_summon'));
            if (adminTeleportBtn) adminTeleportBtn.addEventListener('click', () => sendAdminCommand('admin_teleport'));
            if (adminKickBtn) adminKickBtn.addEventListener('click', () => sendAdminCommand('admin_kick'));
            if (adminRespawnBtn) adminRespawnBtn.addEventListener('click', () => sendAdminCommand('admin_respawn'));

            if (adminAnnounceBtn && adminAnnounceInput) {
                adminAnnounceBtn.addEventListener('click', () => {
                    const msg = adminAnnounceInput.value.trim();
                    if (!msg) return;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(MessagePack.encode({ type: 'admin_announce', message: msg }));
                        adminAnnounceInput.value = "";
                    }
                });
            }

            // --- ADMIN TOOLS TOGGLES ---
            const adminInvisBtn = document.getElementById('admin-invis-btn');
            const adminNoclipBtn = document.getElementById('admin-noclip-btn');

            if (adminInvisBtn) {
                adminInvisBtn.addEventListener('click', () => {
                    window.adminInvisible = !window.adminInvisible;
                    adminInvisBtn.innerText = `Toggle Invisible (${window.adminInvisible ? 'ON' : 'OFF'})`;
                    adminInvisBtn.style.background = window.adminInvisible ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.1)';
                    adminInvisBtn.style.borderColor = window.adminInvisible ? '#2ecc71' : '#aaa';
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
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
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(MessagePack.encode({ type: 'admin_noclip', enabled: window.adminNoclip }));
                    }
                });
            }

            const adminClearArenasBtn = document.getElementById('admin-clearenas-btn');
            if (adminClearArenasBtn) {
                adminClearArenasBtn.addEventListener('click', () => {
                    if (confirm("Are you sure you want to nuke all minigame arenas? This will clear all ghost minigames.")) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({ type: 'admin_clearenas' }));
                        }
                    }
                });
            }
        }

        // Interceptar clics en el juego cuando el god mode esta abierto
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            // 1. Si el puntero magico esta activo (Event Maker)
            if (godPointerActive && (player.role || '').toLowerCase() === 'admin') {
                e.stopPropagation();
                const gridPos = getWorldGridXY(e.clientX, e.clientY);

                for (let l = 15; l >= 0; l--) {
                    const key = `${gridPos.x},${gridPos.y},${l}`;
                    if (worldMap[key]) {
                        const newCollisionState = !worldMap[key].hasCollision;
                        worldMap[key].hasCollision = newCollisionState;

                        ws.send(MessagePack.encode({
                            type: 'update_tile_metadata',
                            x: gridPos.x, y: gridPos.y, layer: l,
                            hasCollision: newCollisionState, isSit: worldMap[key].isSit
                        }));

                        spawnDamageText(gridPos.x * TILE_SIZE, gridPos.y * TILE_SIZE, newCollisionState ? "LOCKED" : "OPEN", newCollisionState);
                        break;
                    }
                }
                return; // Stop here if pointer is active
            }

            // 2. Si el panel de dios esta abierto y hacemos click normal, detectar jugador
            if (godModal && godModal.style.display !== 'none' && (player.role || '').toLowerCase() === 'admin') {
                const screenCenterX = window.innerWidth / 2;
                const screenCenterY = window.innerHeight / 2;

                for (let id in otherPlayers) {
                    const enemy = otherPlayers[id];
                    if (!enemy || enemy.worldX === undefined) continue;

                    const eScreenX = screenCenterX + ((enemy.worldX - player.worldX) * zoomLevel);
                    const eScreenY = screenCenterY + ((enemy.worldY - player.worldY) * zoomLevel);

                    const dist = Math.hypot(e.clientX - eScreenX, e.clientY - eScreenY);
                    if (dist < 40 * zoomLevel) { // 40px hit radius
                        const adminTargetInput = document.getElementById('admin-target-id');
                        if (adminTargetInput && enemy.gameId) {
                            adminTargetInput.value = enemy.gameId;
                            spawnDamageText(enemy.worldX, enemy.worldY, "TARGET ACQUIRED", true);
                        }
                        break;
                    }
                }
            }
        }, true);

        // --- LÓGICA DE ARRASTRE PARA LA VENTANA DE DIOS ---
        let isDraggingGod = false;
        let godOffsetX = 0;
        let godOffsetY = 0;

        function startDragGod(clientX, clientY, e) {
            isDraggingGod = true;
            if (!godModal) return;
            const rect = godModal.getBoundingClientRect();
            godOffsetX = clientX - rect.left;
            godOffsetY = clientY - rect.top;
            if (godDragHandle) godDragHandle.style.cursor = 'grabbing';
            if (e && e.preventDefault) e.preventDefault();
        }

        function moveGod(clientX, clientY) {
            if (!isDraggingGod || !godModal) return;
            let newX = clientX - godOffsetX;
            let newY = clientY - godOffsetY;

            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + godModal.offsetWidth > window.innerWidth) newX = window.innerWidth - godModal.offsetWidth;
            if (newY + godModal.offsetHeight > window.innerHeight) newY = window.innerHeight - godModal.offsetHeight;

            godModal.style.left = newX + 'px';
            godModal.style.top = newY + 'px';
        }

        // EL FIX: Envolver los detectores de arrastre
        if (godDragHandle) {
            godDragHandle.addEventListener('touchstart', (e) => startDragGod(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
            window.addEventListener('touchmove', (e) => { if (e.touches.length > 0) moveGod(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
            window.addEventListener('touchend', () => { isDraggingGod = false; godDragHandle.style.cursor = 'grab'; });

            godDragHandle.addEventListener('mousedown', (e) => startDragGod(e.clientX, e.clientY, e));
            window.addEventListener('mousemove', (e) => moveGod(e.clientX, e.clientY));
            window.addEventListener('mouseup', () => { isDraggingGod = false; godDragHandle.style.cursor = 'grab'; });
        }

        // --- LÓGICA DE ARRASTRE PARA EL SKEL EDITOR ---
        const skelModal = document.getElementById('skeleton-editor');
        const skelDragHandle = document.getElementById('skel-drag-handle');
        let isDraggingSkel = false;
        let skelOffsetX = 0, skelOffsetY = 0;

        function startDragSkel(clientX, clientY, e) {
            isDraggingSkel = true;
            if (!skelModal) return;
            const rect = skelModal.getBoundingClientRect();
            skelOffsetX = clientX - rect.left;
            skelOffsetY = clientY - rect.top;
            if (skelDragHandle) skelDragHandle.style.cursor = 'grabbing';
            if (e && e.preventDefault) e.preventDefault();
        }

        function moveSkel(clientX, clientY) {
            if (!isDraggingSkel || !skelModal) return;
            let newX = clientX - skelOffsetX;
            let newY = clientY - skelOffsetY;
            skelModal.style.left = newX + 'px';
            skelModal.style.top = newY + 'px';
        }

        if (skelDragHandle) {
            skelDragHandle.addEventListener('mousedown', (e) => startDragSkel(e.clientX, e.clientY, e));
            window.addEventListener('mousemove', (e) => moveSkel(e.clientX, e.clientY));
            window.addEventListener('mouseup', () => { isDraggingSkel = false; if (skelDragHandle) skelDragHandle.style.cursor = 'grab'; });

            skelDragHandle.addEventListener('touchstart', (e) => startDragSkel(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
            window.addEventListener('touchmove', (e) => { if (e.touches.length > 0) moveSkel(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
            window.addEventListener('touchend', () => { isDraggingSkel = false; if (skelDragHandle) skelDragHandle.style.cursor = 'grab'; });
        }

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

        // --- NEW: NOTIFICATION SYSTEM GRABBERS ---
        const notifBtnContainer = document.getElementById('notif-btn-container');
        const notifToggle = document.getElementById('notif-toggle');
        const notifBadge = document.getElementById('notif-badge');
        const notifCanvas = document.getElementById('notif-canvas');
        const nCtx = notifCanvas ? notifCanvas.getContext('2d') : null;
        const notifModal = document.getElementById('notif-modal');
        const notifText = document.getElementById('notif-text');
        const notifYesBtn = document.getElementById('notif-yes-btn');
        const notifNoBtn = document.getElementById('notif-no-btn');

        const pendingRequests = []; // A queue for incoming friend requests  

        // --- UPGRADED: NOTIFICATION BUTTON ACTIONS ---
        const modalAvatarCanvas = document.getElementById('modal-avatar-canvas');
        const modalCtx = modalAvatarCanvas ? modalAvatarCanvas.getContext('2d') : null;

        // --- UPGRADED: NOTIFICATION BUTTON ACTIONS ---
        notifToggle.addEventListener('click', () => {
            if (pendingRequests.length > 0) {
                const req = pendingRequests[0]; // Solo miramos, no la sacamos aún

                // LA MAGIA BLINDADA (ANTI-XSS): Cambiar texto y color según el tipo
                if (req.type === 'friend_request') {
                    notifText.innerHTML = `<span id="safe-notif-name" style="color:#3498db; font-weight:bold;"></span> te ha enviado una solicitud de amistad. ¿Aceptas?`;
                    document.getElementById('safe-notif-name').innerText = req.senderUsername; // Inserta el nombre como texto puro
                } else if (req.type === 'squad_invite') {
                    notifText.innerHTML = `<span id="safe-notif-name" style="color:#9b59b6; font-weight:bold;"></span> te invita a unirte a su clan: <span id="safe-notif-squad" style="color:#f1c40f; font-weight:bold;"></span>. ¿Aceptas?`;
                    document.getElementById('safe-notif-name').innerText = req.senderUsername;
                    document.getElementById('safe-notif-squad').innerText = `[${req.squadName}]`;
                }

                // ... (El código de dibujar el avatar déjalo igual) ...
                if (modalCtx && headImg && headImg.complete) {
                    modalCtx.clearRect(0, 0, modalAvatarCanvas.width, modalAvatarCanvas.height);
                    const headFrameH = headImg.height / 4;
                    const drawW = 40;
                    const drawH = 40 * (headFrameH / FRAME_WIDTH);
                    modalCtx.drawImage(headImg, 0, 0, FRAME_WIDTH, headFrameH, (modalAvatarCanvas.width - drawW) / 2, modalAvatarCanvas.height - drawH, drawW, drawH);
                }
                notifModal.style.display = 'flex';
            }
        });

        // SI PRESIONAS YES
        notifYesBtn.addEventListener('click', () => {
            if (pendingRequests.length > 0) {
                const req = pendingRequests.shift(); // Sacamos la petición

                if (req.type === 'friend_request') {
                    ws.send(MessagePack.encode({ type: 'add_friend', friendAccountId: req.senderAccountId, isReply: true }));
                    if (!player.friends) player.friends = [];
                    if (!player.friends.includes(req.senderAccountId)) player.friends.push(req.senderAccountId);
                }
                else if (req.type === 'squad_invite') {
                    // Si aceptó el clan, enviarlo al servidor
                    ws.send(MessagePack.encode({ type: 'accept_squad_invite', squadId: req.squadId }));
                }

                checkPendingRequests();
            }
        });

        // SI PRESIONAS NO
        notifNoBtn.addEventListener('click', () => {
            if (pendingRequests.length > 0) {
                pendingRequests.shift(); // Simplemente la borramos sin hacer nada
                checkPendingRequests();
            }
        });

        function checkPendingRequests() {
            if (pendingRequests.length === 0) {
                notifBtnContainer.style.display = 'none';
                notifModal.style.display = 'none';
            } else {
                document.getElementById('friend-notif-badge').innerText = pendingRequests.length;
                notifModal.style.display = 'none';
            }
        }

        // --- 2. PALETTE RESIZING LOGIC ---
        paletteResizer.addEventListener('touchstart', (e) => {
            isResizingPalette = true; e.preventDefault();
        }, { passive: false });
        paletteResizer.addEventListener('mousedown', (e) => {
            isResizingPalette = true; e.preventDefault();
        });

        function handlePaletteDrag(clientX) {
            if (!isResizingPalette) return;
            let newWidth = window.innerWidth - clientX;
            if (newWidth < 150) newWidth = 150;
            if (newWidth > window.innerWidth - 60) newWidth = window.innerWidth - 60;
            tilePalette.style.width = newWidth + 'px';
        }

        window.addEventListener('touchmove', (e) => { if (isResizingPalette) handlePaletteDrag(e.touches[0].clientX); });
        window.addEventListener('mousemove', (e) => { if (isResizingPalette) handlePaletteDrag(e.clientX); });
        window.addEventListener('touchend', () => isResizingPalette = false);
        window.addEventListener('mouseup', () => isResizingPalette = false);

        // --- 3. LAYER & TOOL LOGIC ---
        let activeLayer = 0;
        let paletteTool = 'select';
        let worldMode = 'paint'; // 'paint' or 'select'

        let selectStart = null, selectEnd = null, isDraggingBox = false;
        let selectedGrid = { w: 1, h: 1, tiles: [[0]] };

        // --- NUEVO: VARIABLES PARA ARRASTRAR Y ROTAR SELECCIONES ---
        let isDraggingSelection = false;
        let dragOffsetX = 0, dragOffsetY = 0;
        let dragOriginalMinX = 0, dragOriginalMinY = 0;
        let draggedTilesBuffer = [];

        // FUNCIÓN MAESTRA 1: Recoger bloques del piso
        function captureSelection(keepOnMap = false) {
            let captured = [];
            let deleteOps = [];
            for (let r = mapSelectionBox.minY; r <= mapSelectionBox.maxY; r++) {
                for (let c = mapSelectionBox.minX; c <= mapSelectionBox.maxX; c++) {
                    for (let l = 0; l <= 15; l++) {
                        const key = getMapKey(c, r, l);
                        const tile = worldMap.get(key);
                        if (tile && tile.tileId !== -1) {
                            captured.push({
                                x: c, y: r, l: l, tileId: tile.tileId,
                                hasCollision: tile.hasCollision, isSit: tile.isSit, triggerType: tile.triggerType,
                                destX: tile.destX, destY: tile.destY, itemId: tile.itemId,
                                rotation: tile.rotation || 0
                            });
                            if (!keepOnMap) {
                                deleteOps.push({ x: c, y: r, l: l, prevId: tile.tileId, newId: -1 });
                                worldMap.delete(key);
                            }
                        } else {
                            // Capture air so paste overwrites destination trees!
                            captured.push({
                                x: c, y: r, l: l, tileId: -1,
                                hasCollision: false, isSit: false, triggerType: 'none',
                                rotation: 0
                            });
                        }
                    }
                }
            }
            if (!keepOnMap && deleteOps.length > 0) {
                const bulkNetwork = deleteOps.map(op => ({ x: op.x, y: op.y, l: op.l, tileId: -1 }));
                ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetwork }));
                recordHistory(deleteOps);
            }
            return captured;
        }

        // FUNCIÓN MAESTRA 2: Pegar bloques arrastrados
        function pasteSelectionBuffer(tilesArray, offsetX, offsetY) {
            let placeOps = [];
            let bulkNetwork = [];
            tilesArray.forEach(t => {
                const nx = t.x + offsetX;
                const ny = t.y + offsetY;
                const key = getMapKey(nx, ny, t.l);
                const prevTile = worldMap.get(key);
                const prevId = prevTile ? prevTile.tileId : -1;

                if (t.tileId === -1) {
                    worldMap.delete(key);
                } else {
                    worldMap.set(key, {
                        tileId: t.tileId, l: t.l, hasCollision: t.hasCollision, isSit: t.isSit,
                        triggerType: t.triggerType, destX: t.destX, destY: t.destY, itemId: t.itemId,
                        rotation: t.rotation || 0
                    });
                }

                placeOps.push({ x: nx, y: ny, l: t.l, prevId: prevId, newId: t.tileId, rotation: t.rotation || 0 });
                bulkNetwork.push({ 
                    x: nx, y: ny, l: t.l, tileId: t.tileId, rotation: t.rotation || 0,
                    hasCollision: t.hasCollision, isSit: t.isSit, triggerType: t.triggerType,
                    destX: t.destX, destY: t.destY, itemId: t.itemId
                });
            });

            if (placeOps.length > 0) {
                ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetwork }));
                recordHistory(placeOps);
            }
        }

        // NEW: Map Selection Memory
        let mapSelectStart = null, mapSelectEnd = null, isDraggingMapBox = false;
        let mapSelectionBox = null;

        document.querySelectorAll('.layer-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                activeLayer = parseInt(e.target.dataset.layer);

                // --- NUEVO: Actualizar el texto del Inspector al vuelo ---
                const copyLayerNum = document.getElementById('copy-layer-num');
                const delLayerNum = document.getElementById('del-layer-num');
                if (copyLayerNum) copyLayerNum.innerText = activeLayer;
                if (delLayerNum) delLayerNum.innerText = activeLayer;
            };

            // Toggle visibility on Right Click
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const l = parseInt(e.target.dataset.layer);
                if (hiddenLayers.has(l)) {
                    hiddenLayers.delete(l);
                    e.target.style.opacity = "1";
                    e.target.style.textDecoration = "none";
                } else {
                    hiddenLayers.add(l);
                    e.target.style.opacity = "0.5";
                    e.target.style.textDecoration = "line-through";
                }
            });

            // Solo Mode on Double Click
            btn.addEventListener('dblclick', (e) => {
                const targetL = parseInt(e.target.dataset.layer);
                document.querySelectorAll('.layer-btn').forEach(b => {
                    const l = parseInt(b.dataset.layer);
                    if (l !== targetL) {
                        hiddenLayers.add(l);
                        b.style.opacity = "0.5";
                        b.style.textDecoration = "line-through";
                    } else {
                        hiddenLayers.delete(l);
                        b.style.opacity = "1";
                        b.style.textDecoration = "none";
                    }
                });
            });
        });

        document.getElementById('tool-select').onclick = (e) => {
            paletteTool = 'select';
            e.target.classList.add('active');
            document.getElementById('tool-pan').classList.remove('active');
            if (pCanvas) pCanvas.style.touchAction = 'none';
            document.getElementById('tile-grid').style.touchAction = 'none';
        };

        // --- 3. LÓGICA DE HERRAMIENTAS PRINCIPALES (PAINT, SELECT, ERASE) ---
        const worldPaintBtn = document.getElementById('world-paint-btn');
        const worldFillBtn = document.getElementById('world-fill-btn');
        const worldSelectBtn = document.getElementById('world-select-btn');
        const inspectCopyBtn = document.getElementById('inspect-copy-btn');

        function clearModes() {
            worldPaintBtn.style.background = 'rgba(255,255,255,0.1)';
            if (worldFillBtn) worldFillBtn.style.background = 'rgba(255,255,255,0.1)';
            worldSelectBtn.style.background = 'rgba(255,255,255,0.1)';
            tileInspector.style.display = 'none';
            mapSelectionBox = null;
            if (selectedTileId === -1) {
                selectedTileId = selectedGrid.tiles[0][0] !== undefined ? selectedGrid.tiles[0][0] : 0;
                eraserBtn.style.borderColor = "transparent";
            }
        }

        worldPaintBtn.onclick = () => {
            clearModes();
            worldMode = 'paint';
            worldPaintBtn.style.background = '#27ae60';
        };

        if (worldFillBtn) {
            worldFillBtn.onclick = () => {
                clearModes();
                worldMode = 'fill';
                worldFillBtn.style.background = '#3498db'; // Blue
            };
        }

        worldSelectBtn.onclick = () => {
            clearModes();
            worldMode = 'select';
            worldSelectBtn.style.background = '#8e44ad'; // Purple
        };

        // Usamos .onclick en lugar de addEventListener para evitar duplicados
        eraserBtn.onclick = () => {
            // Preserve fill mode if active, otherwise default to paint
            if (worldMode !== 'fill') {
                clearModes();
                worldMode = 'paint';
                worldPaintBtn.style.background = '#27ae60';
            }

            if (selectedTileId === -1) {
                // APAGAR BORRADOR (Volver al bloque anterior)
                selectedTileId = selectedGrid.tiles[0][0] !== undefined ? selectedGrid.tiles[0][0] : 0;
                eraserBtn.style.borderColor = "transparent";
            } else {
                // ENCENDER BORRADOR (-1 significa "vacío")
                selectedTileId = -1;
                eraserBtn.style.borderColor = "red";
            }
        };

        // Mostrar/Ocultar el menú de creación y filtros al cambiar de herramientas
        const btnToggleZoneFilters = document.getElementById('btn-toggle-zone-filters');
        const zoneFilterToolbar = document.getElementById('zone-filter-toolbar');

        // Overlay flags and logic
        let showCollisionOverlay = false;
        let showLogicOverlay = false;
        
        const btnOverlayCollisions = document.getElementById('overlay-collisions-btn');
        const btnOverlayLogic = document.getElementById('overlay-logic-btn');

        if (btnOverlayCollisions) {
            btnOverlayCollisions.addEventListener('click', () => {
                showCollisionOverlay = !showCollisionOverlay;
                if (showCollisionOverlay) {
                    btnOverlayCollisions.style.background = 'rgba(255, 0, 0, 0.4)';
                    btnOverlayCollisions.style.color = 'black';
                } else {
                    btnOverlayCollisions.style.background = 'rgba(255, 0, 0, 0.1)';
                    btnOverlayCollisions.style.color = 'white';
                }
            });
        }

        if (btnOverlayLogic) {
            btnOverlayLogic.addEventListener('click', () => {
                showLogicOverlay = !showLogicOverlay;
                if (showLogicOverlay) {
                    btnOverlayLogic.style.background = 'rgba(155, 89, 182, 0.6)';
                    btnOverlayLogic.style.color = 'black';
                } else {
                    btnOverlayLogic.style.background = 'rgba(155, 89, 182, 0.1)';
                    btnOverlayLogic.style.color = 'white';
                }
            });
        }

        const btnOverlayGrid = document.getElementById('overlay-grid-btn');
        if (btnOverlayGrid) {
            btnOverlayGrid.addEventListener('click', () => {
                showGridOverlay = !showGridOverlay;
                if (showGridOverlay) {
                    btnOverlayGrid.style.background = 'rgba(255, 255, 255, 0.4)';
                    btnOverlayGrid.style.color = 'black';
                } else {
                    btnOverlayGrid.style.background = 'rgba(255, 255, 255, 0.1)';
                    btnOverlayGrid.style.color = 'white';
                }
            });
        }

        const btnPrefabs = document.getElementById('prefabs-btn');
        const prefabsModal = document.getElementById('prefabs-modal');
        if (btnPrefabs) {
            btnPrefabs.addEventListener('click', () => {
                prefabsModal.style.display = 'flex';
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'load_blueprints' }));
                }
            });
        }

        const btnSavePrefab = document.getElementById('btn-save-prefab');
        const prefabSaveName = document.getElementById('prefab-save-name');
        if (btnSavePrefab) {
            btnSavePrefab.addEventListener('click', () => {
                const name = prefabSaveName.value.trim();
                if (!name) return alert("Ingresa un nombre para el Prefab");
                if (!mapSelectionBox) return alert("Debes seleccionar un área en el mapa primero con la herramienta de selección");
                
                const w = (mapSelectionBox.maxX - mapSelectionBox.minX) + 1;
                const h = (mapSelectionBox.maxY - mapSelectionBox.minY) + 1;
                
                const captured = captureSelection(true); // true = Keep on map
                
                // Normalizar coordenadas al 0,0 local de este prefab
                const normalizedTiles = captured.map(t => ({
                    ...t,
                    x: t.x - mapSelectionBox.minX,
                    y: t.y - mapSelectionBox.minY
                }));

                const blueprintData = {
                    name: name,
                    w: w,
                    h: h,
                    isMultiLayer: true,
                    multiTiles: normalizedTiles
                };

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'save_blueprint', blueprint: blueprintData }));
                    prefabSaveName.value = '';
                    mapSelectionBox = null; // ELIMINA EL CUADRO MORADO DESPUES DE GUARDAR
                }
            });
        }

        worldSelectBtn.addEventListener('click', () => {
            btnMakeSafeZone.style.display = 'inline-block';
            document.getElementById('zone-type-select').style.display = 'inline-block';
            btnToggleZoneFilters.style.display = 'inline-block';
        });

        const hideZoneTools = () => {
            btnMakeSafeZone.style.display = 'none';
            document.getElementById('zone-type-select').style.display = 'none';
            btnToggleZoneFilters.style.display = 'none';
            zoneFilterToolbar.style.display = 'none';
            showSafeZoneVisuals = false;
            btnToggleZoneFilters.style.background = "transparent";
            btnToggleZoneFilters.style.color = "#2ecc71";
        };

        worldPaintBtn.addEventListener('click', hideZoneTools);
        eraserBtn.addEventListener('click', hideZoneTools);

        // Lógica del botón 👁️ Ver Zonas
        btnToggleZoneFilters.addEventListener('click', () => {
            showSafeZoneVisuals = !showSafeZoneVisuals;
            if (showSafeZoneVisuals) {
                zoneFilterToolbar.style.display = 'flex';
                btnToggleZoneFilters.style.background = "#2ecc71";
                btnToggleZoneFilters.style.color = "black";
            } else {
                zoneFilterToolbar.style.display = 'none';
                btnToggleZoneFilters.style.background = "transparent";
                btnToggleZoneFilters.style.color = "#2ecc71";
            }
        });

        // 👇 NUEVO: LÓGICA DEL BOTÓN "CREAR ZONA SEGURA" Y CHECKBOX 👇
        const btnMakeSafeZone = document.getElementById('btn-make-safezone');
        const zoneTypeSelect = document.getElementById('zone-type-select'); // <--- NUEVO

        // --- 🛡️ LÓGICA DEL MINI INSPECTOR DE ZONAS SEGURAS 🛡️ ---
        const szInspectorModal = document.getElementById('safezone-inspector-modal');
        const closeSzInspector = document.getElementById('close-sz-inspector');
        const deleteSzBtn = document.getElementById('delete-sz-btn');
        let currentInspectingZoneId = null;

        // Cerrar el modal
        if (closeSzInspector) {
            closeSzInspector.onclick = () => {
                szInspectorModal.style.display = 'none';
                currentInspectingZoneId = null;
            };
        }

        // Ejecutar el borrado
        if (deleteSzBtn) {
            deleteSzBtn.onclick = () => {
                if (currentInspectingZoneId && ws.readyState === WebSocket.OPEN) {
                    // Enviamos la orden al servidor
                    ws.send(MessagePack.encode({ type: 'delete_safezone', id: currentInspectingZoneId }));

                    // Efecto visual en el botón
                    deleteSzBtn.innerText = "Borrando...";
                    deleteSzBtn.style.background = "#c0392b";

                    // Ocultamos de nuestra pantalla inmediatamente para que se sienta rápido
                    safeZones = safeZones.filter(z => z._id !== currentInspectingZoneId);

                    setTimeout(() => {
                        szInspectorModal.style.display = 'none';
                        deleteSzBtn.innerText = "🗑️ Eliminar Zona"; // Resetear botón
                        deleteSzBtn.style.background = "#e74c3c";
                    }, 300);
                }
            };
        }

        // 🏴 TURF SPAWN FIELDS: show/hide depending on zone type
        const turfSpawnFields = document.getElementById('turf-spawn-fields');
        const turfSpawnX     = document.getElementById('turf-spawn-x');
        const turfSpawnY     = document.getElementById('turf-spawn-y');
        const turfUsePosBtn  = document.getElementById('turf-use-pos-btn');

        function updateTurfFieldsVisibility() {
            const val = document.getElementById('zone-type-select').value;
            if (turfSpawnFields) {
                turfSpawnFields.style.display = (val === 'turf') ? 'flex' : 'none';
            }
        }

        // Trigger visibility update when zone type changes
        document.getElementById('zone-type-select').addEventListener('change', updateTurfFieldsVisibility);

        // "📌 Mi pos" — fill with current player TILE coords (same as radar display)
        if (turfUsePosBtn) {
            turfUsePosBtn.addEventListener('click', () => {
                // Radar shows: Math.floor(worldX / TILE_SIZE) — match exactly
                turfSpawnX.value = Math.floor(player.worldX / TILE_SIZE);
                turfSpawnY.value = Math.floor(player.worldY / TILE_SIZE);
            });
        }

        btnMakeSafeZone.addEventListener('click', () => {
            if (!mapSelectionBox) {
                alert("⚠️ Primero usa la herramienta 'Select' para arrastrar y marcar un área en el mapa.");
                return;
            }

            const zType = document.getElementById('zone-type-select').value;

            // 🏴 VALIDACIÓN TURF: requiere coords de spawn (en tiles, como el radar)
            let spawnX = null;
            let spawnY = null;
            if (zType === 'turf') {
                const tileX = parseFloat(turfSpawnX.value);
                const tileY = parseFloat(turfSpawnY.value);
                if (isNaN(tileX) || isNaN(tileY)) {
                    alert("⚠️ Zona Turf requiere un punto de Spawn.\nIngresa las coordenadas de Tile (X, Y), o usa '📌 Mi pos' para usar tu posición actual.");
                    return;
                }
                // Convertir tile → píxeles de mundo (centrado en el tile)
                spawnX = (tileX * TILE_SIZE) + (TILE_SIZE / 2);
                spawnY = (tileY * TILE_SIZE) + (TILE_SIZE / 2);
            }

            const zoneName = prompt("Nombra esta Zona (ej. 'Turf Norte', 'Zona A'):");
            if (!zoneName) return;

            const xMin = mapSelectionBox.minX * TILE_SIZE;
            const yMin = mapSelectionBox.minY * TILE_SIZE;
            const xMax = (mapSelectionBox.maxX + 1) * TILE_SIZE;
            const yMax = (mapSelectionBox.maxY + 1) * TILE_SIZE;

            const payload = {
                type: 'create_safezone',
                name: zoneName,
                zoneType: zType,
                xMin, xMax, yMin, yMax
            };
            // Solo añadir spawn si es turf
            if (zType === 'turf') {
                payload.spawnX = spawnX;
                payload.spawnY = spawnY;
            }

            ws.send(MessagePack.encode(payload));

            alert(`✅ Zona '${zoneName}' (${zType}) creada con éxito.${zType === 'turf' ? `\n📍 Spawn: X=${spawnX}, Y=${spawnY}` : ''}`);
            mapSelectionBox = null;
            // Limpiar campos turf para la próxima zona
            if (turfSpawnX) turfSpawnX.value = '';
            if (turfSpawnY) turfSpawnY.value = '';
            worldPaintBtn.click();
        });
        // 👆 FIN DE LA LÓGICA DE ZONA SEGURA 👆


        // --- NEW: UNDO & REDO HISTORY STACKS ---
        const undoStack = [];
        const redoStack = [];
        const MAX_HISTORY = 50; // Remembers your last 50 actions

        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        function updateHistoryButtons() {
            undoBtn.style.opacity = undoStack.length > 0 ? '1' : '0.3';
            undoBtn.disabled = undoStack.length === 0;

            redoBtn.style.opacity = redoStack.length > 0 ? '1' : '0.3';
            redoBtn.disabled = redoStack.length === 0;
        }

        // ↩️ UNDO ACTION (100% MASIVO - CERO LAG)
        undoBtn.addEventListener('click', () => {
            if (undoStack.length === 0) return;
            const action = undoStack.pop();
            redoStack.push(action);

            let bulkNetworkData = [];

            action.slice().reverse().forEach(change => {
                const key = getMapKey(change.x, change.y, change.l);
                if (change.prevId === -1) {
                    worldMap.delete(key);
                } else {
                    const existing = worldMap.get(key);
                    const hasCol = existing ? existing.hasCollision : false;
                    const isSitVal = existing ? existing.isSit : false;
                    worldMap.set(key, { tileId: change.prevId, l: change.l, hasCollision: hasCol, isSit: isSitVal });
                }
                bulkNetworkData.push({ x: change.x, y: change.y, l: change.l, tileId: change.prevId });
            });

            ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
            updateHistoryButtons();
        });

        // ↪️ REDO ACTION (100% MASIVO - CERO LAG)
        redoBtn.addEventListener('click', () => {
            if (redoStack.length === 0) return;
            const action = redoStack.pop();
            undoStack.push(action);

            let bulkNetworkData = [];

            action.forEach(change => {
                const key = getMapKey(change.x, change.y, change.l);
                if (change.newId === -1) {
                    worldMap.delete(key);
                } else {
                    const existing = worldMap.get(key);
                    const hasCol = existing ? existing.hasCollision : false;
                    const isSitVal = existing ? existing.isSit : false;
                    worldMap.set(key, { tileId: change.newId, l: change.l, hasCollision: hasCol, isSit: isSitVal });
                }
                bulkNetworkData.push({ x: change.x, y: change.y, l: change.l, tileId: change.newId });
            });

            ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
            updateHistoryButtons();
        });

        // Helper function to save an action to memory
        function recordHistory(actionArray) {
            if (actionArray.length > 0) {
                undoStack.push(actionArray);
                if (undoStack.length > MAX_HISTORY) undoStack.shift(); // Forget oldest memory if we hit 50
                redoStack.length = 0; // Branching timelines! Clear the redo stack.
                updateHistoryButtons();
            }
        }

        // --- 4. MULTI-SELECT PALETTE (CON PAN PARA PC) ---
        let isPanningPalette = false;
        let panStartX = 0, panStartY = 0;
        let scrollStartX = 0, scrollStartY = 0;
        const tileGridDiv = document.getElementById('tile-grid');

        // Botones de Herramientas de la Paleta (Con Cursores)
        document.getElementById('tool-pan').onclick = (e) => {
            paletteTool = 'pan';
            e.target.classList.add('active');
            document.getElementById('tool-select').classList.remove('active');
            if (pCanvas) {
                pCanvas.style.touchAction = 'pan-x pan-y';
                pCanvas.style.cursor = 'grab'; // Manita abierta
            }
            tileGridDiv.style.touchAction = 'pan-x pan-y';
        };

        document.getElementById('tool-select').onclick = (e) => {
            paletteTool = 'select';
            e.target.classList.add('active');
            document.getElementById('tool-pan').classList.remove('active');
            if (pCanvas) {
                pCanvas.style.touchAction = 'none';
                pCanvas.style.cursor = 'crosshair'; // Cruz de selección
            }
            tileGridDiv.style.touchAction = 'none';
        };

        function getPaletteGridXY(e) {
            const rect = pCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const scaledSize = TILE_SIZE * PALETTE_SCALE;
            return {
                c: Math.floor((clientX - rect.left) / scaledSize),
                r: Math.floor((clientY - rect.top) / scaledSize)
            };
        }

        function handlePaletteDown(e) {
            if (paletteTool === 'select') {
                isDraggingBox = true;
                selectStart = getPaletteGridXY(e);
                selectEnd = selectStart;
                drawPalette();
            }
            // NUEVO: Iniciar Paneo en PC
            else if (paletteTool === 'pan' && e.clientX !== undefined) {
                isPanningPalette = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                scrollStartX = tileGridDiv.scrollLeft;
                scrollStartY = tileGridDiv.scrollTop;
                pCanvas.style.cursor = 'grabbing'; // Manita cerrada
            }
        }

        function handlePaletteMove(e) {
            if (paletteTool === 'select' && isDraggingBox) {
                e.preventDefault();
                const newEnd = getPaletteGridXY(e);

                // --- EL FIX DE RENDIMIENTO (ANTI-LAG) ---
                // Solo redibujamos la paleta si cruzamos a un tile DIFERENTE
                if (newEnd.c !== selectEnd.c || newEnd.r !== selectEnd.r) {
                    selectEnd = newEnd;
                    drawPalette();
                }
            }
            // Arrastrar Paneo en PC
            else if (paletteTool === 'pan' && isPanningPalette && e.clientX !== undefined) {
                const dx = e.clientX - panStartX;
                const dy = e.clientY - panStartY;
                tileGridDiv.scrollLeft = scrollStartX - dx;
                tileGridDiv.scrollTop = scrollStartY - dy;
            }
        }

        function handlePaletteUp(e) {
            // Soltar Paneo SIEMPRE que soltemos el clic
            if (paletteTool === 'pan') {
                isPanningPalette = false;
                if (pCanvas) pCanvas.style.cursor = 'grab'; // Vuelve la manita abierta
            }

            if (!isDraggingBox || paletteTool !== 'select') return;
            isDraggingBox = false;

            const minC = Math.min(selectStart.c, selectEnd.c);
            const maxC = Math.max(selectStart.c, selectEnd.c);
            const minR = Math.min(selectStart.r, selectEnd.r);
            const maxR = Math.max(selectStart.r, selectEnd.r);

            selectedGrid.w = (maxC - minC) + 1;
            selectedGrid.h = (maxR - minR) + 1;

            // EL FIX: Le decimos a la brocha que esto es un bloque normal de 1 capa, no un edificio 3D
            selectedGrid.isMultiLayer = false;
            selectedGrid.tiles = [];

            for (let r = 0; r < selectedGrid.h; r++) {
                let rowArray = [];
                for (let c = 0; c < selectedGrid.w; c++) {
                    // Calcula qué cuadrito de tu All_Tilesets.png tocaste
                    rowArray.push((minR + r) * cols + (minC + c));
                }
                selectedGrid.tiles.push(rowArray);
            }

            if (eraserBtn) eraserBtn.style.borderColor = "transparent";
            selectedTileId = selectedGrid.tiles[0][0];
        }

        function attachPaletteListeners() {
            pCanvas.onmousedown = handlePaletteDown;
            pCanvas.onmousemove = handlePaletteMove;

            // EL FIX: Antes tenía un 'if(isDraggingBox)'. Ahora escucha siempre 
            // que levantas el dedo o el clic para detener cualquier acción (pan o select).
            window.addEventListener('mouseup', handlePaletteUp);

            pCanvas.ontouchstart = handlePaletteDown;
            pCanvas.ontouchmove = handlePaletteMove;
            window.addEventListener('touchend', handlePaletteUp);
        }

        function drawPalette() {
            if (!pCtx) return;
            const img = loadedTilesets[TILESET_CONFIG[currentTilesetIndex].id];

            pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
            pCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);
            pCtx.imageSmoothingEnabled = false;

            if (img.complete && img.naturalWidth > 0) {
                pCtx.drawImage(img, 0, 0, pCanvas.width, pCanvas.height);
            }

            if (selectStart && selectEnd && paletteTool === 'select') {
                const scaledSize = TILE_SIZE * PALETTE_SCALE;
                const minC = Math.min(selectStart.c, selectEnd.c);
                const maxC = Math.max(selectStart.c, selectEnd.c);
                const minR = Math.min(selectStart.r, selectEnd.r);
                const maxR = Math.max(selectStart.r, selectEnd.r);

                const w = (maxC - minC + 1) * scaledSize;
                const h = (maxR - minR + 1) * scaledSize;

                pCtx.strokeStyle = '#f1c40f';
                pCtx.lineWidth = 2;
                pCtx.strokeRect(minC * scaledSize, minR * scaledSize, w, h);
                pCtx.fillStyle = 'rgba(241, 196, 15, 0.3)';
                pCtx.fillRect(minC * scaledSize, minR * scaledSize, w, h);
            }
        }

        function handlePaletteUp(e) {
            if (paletteTool === 'pan') {
                isPanningPalette = false;
                if (pCanvas) pCanvas.style.cursor = 'grab';
            }

            if (!isDraggingBox || paletteTool !== 'select') return;
            isDraggingBox = false;

            const minC = Math.min(selectStart.c, selectEnd.c);
            const maxC = Math.max(selectStart.c, selectEnd.c);
            const minR = Math.min(selectStart.r, selectEnd.r);
            const maxR = Math.max(selectStart.r, selectEnd.r);

            selectedGrid.w = (maxC - minC) + 1;
            selectedGrid.h = (maxR - minR) + 1;
            selectedGrid.isMultiLayer = false;
            selectedGrid.tiles = [];

            const activeTs = TILESET_CONFIG[currentTilesetIndex];

            for (let r = 0; r < selectedGrid.h; r++) {
                let rowArray = [];
                for (let c = 0; c < selectedGrid.w; c++) {
                    // --- LA MAGIA: Sumamos el StartID de la imagen actual (ej. 10,000) ---
                    rowArray.push(activeTs.startId + ((minR + r) * cols + (minC + c)));
                }
                selectedGrid.tiles.push(rowArray);
            }

            if (eraserBtn) eraserBtn.style.borderColor = "transparent";
            selectedTileId = selectedGrid.tiles[0][0];
        }

        // --- EVENTOS DEL TOOLBAR (TÁCTIL Y RATÓN) ---
        // --- EVENTOS DEL TOOLBAR (TÁCTIL Y RATÓN) ---
        const editorToolbar = document.getElementById('editor-toolbar');
        const toolbarDragHandle = document.getElementById('toolbar-drag-handle');

        let isDraggingToolbar = false;
        let toolbarOffsetX = 0;
        let toolbarOffsetY = 0;

        function startDragToolbar(clientX, clientY, e) {
            isDraggingToolbar = true;
            const rect = editorToolbar.getBoundingClientRect();
            toolbarOffsetX = clientX - rect.left;
            toolbarOffsetY = clientY - rect.top;
            editorToolbar.style.transform = 'none';
            if (e && e.preventDefault) e.preventDefault();
        }

        function moveToolbar(clientX, clientY) {
            if (!isDraggingToolbar) return;
            let newX = clientX - toolbarOffsetX;
            let newY = clientY - toolbarOffsetY;

            if (newX < 0) newX = 0;
            if (newY < 0) newY = 0;
            if (newX + editorToolbar.offsetWidth > window.innerWidth) newX = window.innerWidth - editorToolbar.offsetWidth;
            if (newY + editorToolbar.offsetHeight > window.innerHeight) newY = window.innerHeight - editorToolbar.offsetHeight;

            editorToolbar.style.left = newX + 'px';
            editorToolbar.style.top = newY + 'px';
            editorToolbar.style.bottom = 'auto';
        }

        // Táctil
        toolbarDragHandle.addEventListener('touchstart', (e) => startDragToolbar(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
        window.addEventListener('touchmove', (e) => { if (e.touches.length > 0) moveToolbar(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        window.addEventListener('touchend', () => isDraggingToolbar = false);

        // Ratón (PC)
        toolbarDragHandle.addEventListener('mousedown', (e) => startDragToolbar(e.clientX, e.clientY, e));
        window.addEventListener('mousemove', (e) => moveToolbar(e.clientX, e.clientY));
        window.addEventListener('mouseup', () => isDraggingToolbar = false);

        // --- 6. GAME CANVAS SELECTOR ---
        function getWorldGridXY(clientX, clientY) {
            const worldClickX = (clientX - (window.innerWidth / 2)) / zoomLevel + player.worldX;
            const worldClickY = (clientY - (window.innerHeight / 2)) / zoomLevel + player.worldY;
            return {
                x: Math.floor(worldClickX / TILE_SIZE),
                y: Math.floor(worldClickY / TILE_SIZE)
            };
        }

        // --- 6. GAME CANVAS SELECTOR & PAINTING (MOUSE & TOUCH) ---
        let isPainting = false;
        let currentStrokeHistory = []; // Memoria para agrupar trazos largos

        function handleEditStart(clientX, clientY) {
            if (!editMode) return;

            // 👇 DETECTAR CLIC PARA INSPECCIONAR ZONAS UNIVERSALES 👇
            if (showSafeZoneVisuals) {
                // Calculamos en qué pixel del mundo hiciste clic
                const worldClickX = (clientX - (window.innerWidth / 2)) / zoomLevel + player.worldX;
                const worldClickY = (clientY - (window.innerHeight / 2)) / zoomLevel + player.worldY;

                // Buscamos si ese pixel cae dentro de alguna Zona
                const clickedZoneIndex = safeZones.findIndex(z =>
                    worldClickX >= z.xMin && worldClickX <= z.xMax &&
                    worldClickY >= z.yMin && worldClickY <= z.yMax
                );

                if (clickedZoneIndex !== -1) {
                    const zone = safeZones[clickedZoneIndex];
                    currentInspectingZoneId = zone._id;

                    // Ponerle el ícono correcto al título del inspector
                    let icon = "🛡️";
                    if (zone.zoneType === 'trash') icon = "🗑️";
                    if (zone.zoneType === 'npc') icon = "🤖";
                    if (zone.zoneType === 'indoor') icon = "🏠";

                    document.getElementById('sz-inspector-name').innerText = `${icon} ${zone.name}`;

                    // Calculamos cuánto mide
                    const width = Math.round((zone.xMax - zone.xMin) / TILE_SIZE);
                    const height = Math.round((zone.yMax - zone.yMin) / TILE_SIZE);
                    document.getElementById('sz-inspector-size').innerText = `Área: ${width}x${height} bloques`;

                    szInspectorModal.style.display = 'flex'; // Mostrar Modal
                    return; // Detenemos el código aquí
                }
            }
            // 👆 FIN DEL CÓDIGO DE INSPECCIÓN 👆

            const gridPos = getWorldGridXY(clientX, clientY);
            const centerKey = getMapKey(gridPos.x, gridPos.y, activeLayer);

            if (worldMode === 'select') {
                isDraggingMapBox = true;
                mapSelectStart = gridPos;
                mapSelectEnd = gridPos;
                mapSelectionBox = null;
                tileInspector.style.display = 'none';
                updateCoordHelper(gridPos);
                return;
            }

            isPainting = true;
            currentStrokeHistory = [];

            // --- PAINT BUCKET (FILL) ---
            if (worldMode === 'fill') {
                isPainting = false; // Turn off dragging for fill mode
                tileInspector.style.display = 'none';

                // Solo permitimos Fill con un tile de 1x1 o el borrador
                if (selectedGrid.w > 1 || selectedGrid.h > 1) return;

                const startTile = worldMap.get(centerKey);
                const targetId = startTile ? startTile.tileId : -1;

                if (targetId === selectedTileId) return; // Nada que hacer

                // BFS Flood Fill
                const queue = [gridPos];
                const visited = new Set();
                visited.add(`${gridPos.x},${gridPos.y}`);

                const bulkNetworkData = [];
                const currentAction = [];

                let count = 0;
                const MAX_FILL = 3000;

                while (queue.length > 0 && count < MAX_FILL) {
                    const curr = queue.shift();
                    const k = getMapKey(curr.x, curr.y, activeLayer);

                    const t = worldMap.get(k);
                    const tId = t ? t.tileId : -1;

                    // Si no es del mismo tipo que clickeamos originalmente, stop
                    if (tId !== targetId) continue;

                    // Modificar este tile
                    currentAction.push({ x: curr.x, y: curr.y, l: activeLayer, prevId: targetId, newId: selectedTileId });
                    bulkNetworkData.push({ x: curr.x, y: curr.y, l: activeLayer, tileId: selectedTileId });

                    if (selectedTileId === -1) {
                        worldMap.delete(k);
                    } else {
                        // Respetamos hasCollision antiguo si existía, o false por defecto
                        const collision = t ? t.hasCollision : false;
                        worldMap.set(k, { tileId: selectedTileId, l: activeLayer, hasCollision: collision });
                    }

                    count++;

                    // Expandir a vecinos
                    const neighbors = [
                        {x: curr.x + 1, y: curr.y},
                        {x: curr.x - 1, y: curr.y},
                        {x: curr.x, y: curr.y + 1},
                        {x: curr.x, y: curr.y - 1}
                    ];

                    for (const n of neighbors) {
                        const nKey = `${n.x},${n.y}`;
                        if (!visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push(n);
                        }
                    }
                }

                if (currentAction.length > 0) {
                    recordHistory(currentAction);
                    if (bulkNetworkData.length > 0) {
                        ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
                    }
                }
                
                // AUTO-REVERT TO PAINT MODE TO PREVENT ACCIDENTAL MASSIVE FILLS
                worldMode = 'paint';
                const worldPaintBtn = document.getElementById('world-paint-btn');
                const worldFillBtn = document.getElementById('world-fill-btn');
                const worldSelectBtn = document.getElementById('world-select-btn');
                if (worldFillBtn) worldFillBtn.style.background = 'rgba(255,255,255,0.1)';
                if (worldSelectBtn) worldSelectBtn.style.background = 'rgba(255,255,255,0.1)';
                if (worldPaintBtn) worldPaintBtn.style.background = '#27ae60';
                
                return;
            }

            // --- SINGLE ERASER ---
            if (selectedTileId === -1) {
                tileInspector.style.display = 'none';
                const prevTile = worldMap.get(centerKey);
                const prevId = prevTile ? prevTile.tileId : -1;

                if (prevId !== -1) {
                    recordHistory([{ x: gridPos.x, y: gridPos.y, l: activeLayer, prevId: prevId, newId: -1 }]);
                    worldMap.delete(centerKey);
                    markChunkDirty(gridPos.x, gridPos.y);
                    ws.send(MessagePack.encode({ type: 'place_tile', x: gridPos.x, y: gridPos.y, l: activeLayer, tileId: -1 }));
                }
                return;
            }

            // --- INSPECTING TILE ---
            if (worldMap.has(centerKey) && selectedGrid.w === 1 && selectedGrid.h === 1) {
                inspectingCoord = `${gridPos.x},${gridPos.y},${activeLayer}`;
                mapSelectionBox = null;
                const inspectedTile = worldMap.get(centerKey);

                tpDestX.value = inspectedTile.destX || "";
                tpDestY.value = inspectedTile.destY || "";
                document.getElementById('shop-item-id').value = inspectedTile.itemId || "";
                document.getElementById('shop-item-row').value = inspectedTile.itemRow || 0;
                document.getElementById('shop-item-sx').value = inspectedTile.shelfX || 0;
                document.getElementById('shop-item-sy').value = inspectedTile.shelfY || 0;

                document.getElementById('logic-type-select').value = inspectedTile.triggerType || "none";
                document.getElementById('logic-requires-click').checked = inspectedTile.requiresClick || false;
                document.getElementById('npc-message-input').value = inspectedTile.npcMessage || "";

                if (centralBase && centralBase.gridX === gridPos.x && centralBase.gridY === gridPos.y) {
                    document.getElementById('ins-turf-name').value = centralBase.name || "";
                    document.getElementById('ins-turf-hp').value = centralBase.maxHp || 5000;
                    document.getElementById('ins-turf-ox').value = centralBase.spriteOffsetX || 0;
                    document.getElementById('ins-turf-oy').value = centralBase.spriteOffsetY || 0;
                    document.getElementById('ins-turf-hx').value = centralBase.hitboxOffsetX || 0;
                    document.getElementById('ins-turf-hy').value = centralBase.hitboxOffsetY || 0;
                    document.getElementById('ins-turf-hw').value = centralBase.hitboxW || 32;
                    document.getElementById('ins-turf-hh').value = centralBase.hitboxH || 32;
                }

                document.getElementById('ins-arena-name').value = inspectedTile.arenaName || "";
                document.getElementById('ins-minigame-type').value = inspectedTile.gameType || "spar";
                document.getElementById('ins-arena-t1-size').value = inspectedTile.team1Size || 1;
                document.getElementById('ins-arena-t2-size').value = inspectedTile.team2Size || 1;
                document.getElementById('ins-arena-max-players').value = inspectedTile.maxPlayers || 2;
                
                // Spar fields
                document.getElementById('ins-arena-p1x').value = inspectedTile.arenaP1X ?? "";
                document.getElementById('ins-arena-p1y').value = inspectedTile.arenaP1Y ?? "";
                document.getElementById('ins-arena-p2x').value = inspectedTile.arenaP2X ?? "";
                document.getElementById('ins-arena-p2y').value = inspectedTile.arenaP2Y ?? "";
                
                // Soccer fields
                document.getElementById('ins-soccer-bx').value = inspectedTile.ballX ?? "";
                document.getElementById('ins-soccer-by').value = inspectedTile.ballY ?? "";
                document.getElementById('ins-soccer-g1x1').value = inspectedTile.goal1X1 ?? "";
                document.getElementById('ins-soccer-g1x2').value = inspectedTile.goal1X2 ?? "";
                document.getElementById('ins-soccer-g1y').value = inspectedTile.goal1Y ?? "";
                document.getElementById('ins-soccer-g2x1').value = inspectedTile.goal2X1 ?? "";
                document.getElementById('ins-soccer-g2x2').value = inspectedTile.goal2X2 ?? "";
                document.getElementById('ins-soccer-g2y').value = inspectedTile.goal2Y ?? "";
                
                // BR fields
                document.getElementById('ins-br-minx').value = inspectedTile.brMinX ?? "";
                document.getElementById('ins-br-maxx').value = inspectedTile.brMaxX ?? "";
                document.getElementById('ins-br-miny').value = inspectedTile.brMinY ?? "";
                document.getElementById('ins-br-maxy').value = inspectedTile.brMaxY ?? "";

                document.getElementById('ins-arena-ranked').checked = inspectedTile.isRanked || false;
                
                // Trigger visibility update
                if (inspectedTile.triggerType === 'arena') {
                    document.getElementById('ins-minigame-type').dispatchEvent(new Event('change'));
                }

                document.getElementById('logic-type-select').onchange();

                if (inspectCopyBtn) inspectCopyBtn.style.display = 'none';
                if (inspectCopyBelowBtn) inspectCopyBelowBtn.style.display = 'none';
                if (inspectCopyAboveBtn) inspectCopyAboveBtn.style.display = 'none';
                if (inspectCopyAllBtn) inspectCopyAllBtn.style.display = 'none';

                if (delLayerNum) delLayerNum.innerText = activeLayer;
                document.getElementById('teleport-settings').style.display = (activeLayer === 15) ? 'flex' : 'none';

                tileInspector.style.display = 'flex';
                inspectCollision.checked = inspectedTile.hasCollision || false;
                inspectIsSit.checked = inspectedTile.isSit || false;

                isPainting = false;
                return;
            }

            tileInspector.style.display = 'none';
            paintAt(gridPos);
        }

        function paintAt(gridPos) {
            let currentAction = [];
            let bulkNetworkData = [];

            if (selectedGrid.isMultiLayer) {
                selectedGrid.multiTiles.forEach(t => {
                    const paintX = gridPos.x + t.x;
                    const paintY = gridPos.y + t.y;
                    const l = t.layer !== undefined ? t.layer : t.l;
                    const key = getMapKey(paintX, paintY, l);
                    
                    const tId = t.tileId !== undefined ? t.tileId : (t.id !== undefined ? t.id : -1);
                    const rot = t.rotation !== undefined ? t.rotation : (t.rot || 0);
                    const hasCol = t.hasCollision || false;

                    const prevTile = worldMap.get(key);
                    const prevId = prevTile ? prevTile.tileId : -1;

                    if (prevId !== tId || (prevTile && prevTile.rotation !== rot)) {
                        currentAction.push({ x: paintX, y: paintY, l: l, prevId: prevId, newId: tId });
                        bulkNetworkData.push({ x: paintX, y: paintY, l: l, tileId: tId, rotation: rot });
                        
                        if (tId === -1) {
                            worldMap.delete(key);
                        } else {
                            worldMap.set(key, { tileId: tId, l: l, hasCollision: hasCol, rotation: rot });
                        }
                        markChunkDirty(paintX, paintY);
                    }
                });
            } else {
                for (let r = 0; r < selectedGrid.h; r++) {
                    for (let c = 0; c < selectedGrid.w; c++) {
                        const paintX = gridPos.x + c;
                        const paintY = gridPos.y + r;
                        const key = getMapKey(paintX, paintY, activeLayer);
                        const cellData = selectedGrid.tiles[r][c];
                        // Compatibilidad hacia atrás si era un número directo en vez de un objeto
                        const tId = typeof cellData === 'object' ? cellData.id : cellData;
                        const rot = typeof cellData === 'object' ? cellData.rot : 0;

                        const prevTile = worldMap.get(key);
                        const prevId = prevTile ? prevTile.tileId : -1;

                        if (prevId !== tId || (prevTile && prevTile.rotation !== rot)) {
                            currentAction.push({ x: paintX, y: paintY, l: activeLayer, prevId: prevId, newId: tId });
                            bulkNetworkData.push({ x: paintX, y: paintY, l: activeLayer, tileId: tId, rotation: rot });

                            if (tId === -1) {
                                worldMap.delete(key);
                            } else {
                                worldMap.set(key, { tileId: tId, l: activeLayer, hasCollision: false, rotation: rot });
                            }
                            markChunkDirty(paintX, paintY);
                        }
                    }
                }
            }
            if (currentAction.length > 0) {
                if (isPainting) currentStrokeHistory.push(...currentAction);
                else recordHistory(currentAction);
                ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
            }
        }

        function updateCoordHelper(gridPos) {
            const coordHelper = document.getElementById('coord-helper');
            if (!coordHelper) return;

            let text = `X: ${gridPos.x} | Y: ${gridPos.y}`;

            if (worldMode === 'select') {
                let box = mapSelectionBox;
                if (isDraggingMapBox && mapSelectStart && mapSelectEnd) {
                    box = {
                        minX: Math.min(mapSelectStart.x, mapSelectEnd.x),
                        maxX: Math.max(mapSelectStart.x, mapSelectEnd.x),
                        minY: Math.min(mapSelectStart.y, mapSelectEnd.y),
                        maxY: Math.max(mapSelectStart.y, mapSelectEnd.y)
                    };
                }
                
                if (box) {
                    const cols = (box.maxX - box.minX) + 1;
                    const rows = (box.maxY - box.minY) + 1;
                    const totalTiles = cols * rows;
                    text += `<br><span style="color: #f1c40f;">Selection: ${cols} cols x ${rows} rows</span>`;
                    text += `<br><span style="color: #3498db;">Total Tiles: ${totalTiles}</span>`;
                }
            }
            coordHelper.innerHTML = text;
        }

        function handleEditMove(clientX, clientY, e) {
            if (!editMode) return;

            if (worldMode === 'select' && isDraggingMapBox) {
                if (e && e.preventDefault) e.preventDefault();
                mapSelectEnd = getWorldGridXY(clientX, clientY);
                updateCoordHelper(mapSelectEnd);
            }
            // FUNCIÓN DE BROCHA: Arrastrar para pintar/borrar continuamente
            else if (worldMode === 'paint' && isPainting) {
                if (e && e.preventDefault) e.preventDefault();
                const gridPos = getWorldGridXY(clientX, clientY);

                // Borrador continuo
                if (selectedTileId === -1) {
                    const centerKey = `${gridPos.x},${gridPos.y},${activeLayer}`;
                    const prevId = worldMap[centerKey] ? worldMap[centerKey].tileId : -1;
                    if (prevId !== -1) {
                        // --- EL FIX: Agrupar el borrado en vez de enviarlo al stack suelto ---
                        currentStrokeHistory.push({ x: gridPos.x, y: gridPos.y, l: activeLayer, prevId: prevId, newId: -1 });
                        delete worldMap[centerKey];
                        markChunkDirty(gridPos.x, gridPos.y);
                        ws.send(MessagePack.encode({ type: 'place_tile', x: gridPos.x, y: gridPos.y, l: activeLayer, tileId: -1 }));
                    }
                }
                // Pintado continuo (Solo aplica con bloques sueltos de 1x1, si copiaste una casa enorme no queremos lag)
                else if (selectedGrid.w === 1 && selectedGrid.h === 1 && !inspectingCoord) {
                    paintAt(gridPos);
                }
            }
        }

        function handleEditEnd(clientX, clientY) {
            if (!editMode) return;
            isPainting = false;

            // --- EL FIX: Guardar TODO el trazo como 1 solo paso de Undo ---
            if (currentStrokeHistory.length > 0) {
                recordHistory([...currentStrokeHistory]);
                currentStrokeHistory = [];
            }

            if (isDraggingMapBox && worldMode === 'select') {
                isDraggingMapBox = false;
                if (!mapSelectStart || !mapSelectEnd) return; // Evitar crashes de clicks rápidos

                mapSelectionBox = {
                    minX: Math.min(mapSelectStart.x, mapSelectEnd.x),
                    maxX: Math.max(mapSelectStart.x, mapSelectEnd.x),
                    minY: Math.min(mapSelectStart.y, mapSelectEnd.y),
                    maxY: Math.max(mapSelectStart.y, mapSelectEnd.y)
                };
                updateCoordHelper(getWorldGridXY(clientX, clientY));

                // Mostramos TODOS los botones cuando tienes una caja grande seleccionada
                if (inspectCopyBtn) inspectCopyBtn.style.display = 'block';
                if (inspectCopyBelowBtn) inspectCopyBelowBtn.style.display = 'block';
                if (inspectCopyAboveBtn) inspectCopyAboveBtn.style.display = 'block';
                if (inspectCopyAllBtn) inspectCopyAllBtn.style.display = 'block'; // <--- NUEVO

                // Actualizamos los textos para que sepas en qué capa estás
                if (copyLayerNum) copyLayerNum.innerText = activeLayer;
                if (delLayerNum) delLayerNum.innerText = activeLayer;

                document.getElementById('teleport-settings').style.display = 'none'; // No se puede poner TP a una caja entera 

                tileInspector.style.display = 'flex'; // Enciende la barra horizontal

                let areaHasCollision = false;
                let areaIsSit = false;
                for (let r = mapSelectionBox.minY; r <= mapSelectionBox.maxY; r++) {
                    for (let c = mapSelectionBox.minX; c <= mapSelectionBox.maxX; c++) {
                        // 🛑 EL FIX: Escanear la memoria correctamente
                        const key = getMapKey(c, r, activeLayer);
                        const tile = worldMap.get(key);
                        if (tile && tile.hasCollision) {
                            areaHasCollision = true;
                        }
                        if (tile && tile.isSit) {
                            areaIsSit = true;
                        }
                    }
                }
                inspectCollision.checked = areaHasCollision;
                inspectIsSit.checked = areaIsSit;
            }
        }

        // --- ENLAZAR EVENTOS TÁCTILES ---
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;

            // --- FIX: Actualizar Radar con un solo toque en Móvil ---
            if (editMode && coordHelper && e.touches.length > 0) {
                const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
                updateCoordHelper(gridPos);
            }

            handleEditStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            // --- NUEVO: Update Radar HUD for Mobile ---
            if (editMode && coordHelper && e.touches.length > 0) {
                const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
                updateCoordHelper(gridPos);
            }
            handleEditMove(e.touches[0].clientX, e.touches[0].clientY, e);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length > 0) {
                handleEditEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }
        });

        // --- ENLAZAR EVENTOS DE RATÓN (PC) ---
        canvas.addEventListener('mousedown', (e) => {
            if (e.target.id !== 'gameCanvas') return;

            // 1. DRAG DE SELECCIÓN CON CLICK DERECHO
            if (editMode && e.button === 2 && worldMode === 'select' && mapSelectionBox) {
                const gridPos = getWorldGridXY(e.clientX, e.clientY);
                if (gridPos.x >= mapSelectionBox.minX && gridPos.x <= mapSelectionBox.maxX &&
                    gridPos.y >= mapSelectionBox.minY && gridPos.y <= mapSelectionBox.maxY) {

                    isDraggingSelection = true;
                    dragOriginalMinX = mapSelectionBox.minX;
                    dragOriginalMinY = mapSelectionBox.minY;
                    dragOffsetX = gridPos.x - mapSelectionBox.minX;
                    dragOffsetY = gridPos.y - mapSelectionBox.minY;

                    draggedTilesBuffer = captureSelection(false);
                    return;
                }
            }

            // --- NUEVO: HERRAMIENTA EYEDROPPER (Pipette) ---
            if (editMode && (e.button === 1 || (e.button === 0 && e.altKey))) {
                e.preventDefault();
                const gridPos = getWorldGridXY(e.clientX, e.clientY);
                const tileKey = getMapKey(gridPos.x, gridPos.y, activeLayer);
                const tileData = worldMap.get(tileKey);

                if (tileData && tileData.tileId !== undefined && tileData.tileId !== -1) {
                    const tId = tileData.tileId;
                    const c = tId % 30; // cols = 30
                    const r = Math.floor(tId / 30);
                    selectStart = { c, r };
                    selectEnd = { c, r };
                    selectedGrid.w = 1;
                    selectedGrid.h = 1;
                    selectedGrid.isMultiLayer = false;
                    selectedGrid.tiles = [[tId]];
                    selectedTileId = tId;
                    
                    if (tileData.rotation) {
                        currentRotation = tileData.rotation;
                        inspectRotateBtn.innerText = `🔄 Rot: ${currentRotation}`;
                    } else {
                        currentRotation = 0;
                        inspectRotateBtn.innerText = `🔄 Rotate`;
                    }
                } else {
                    // Clic en vacío = Goma
                    selectedGrid.w = 1;
                    selectedGrid.h = 1;
                    selectedGrid.isMultiLayer = false;
                    selectedGrid.tiles = [[-1]];
                    selectedTileId = -1;
                }
                
                drawPalette();
                if (eraserBtn) eraserBtn.style.borderColor = "transparent";
                
                // Cambiar a Paint
                worldMode = 'paint';
                document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
                document.getElementById('world-paint-btn').classList.add('active');
                return;
            }

            if (e.button !== 0) return;

            if (editMode) {
                handleEditStart(e.clientX, e.clientY);
                return;
            }

            // Calcular el clic en el mundo real
            const clickX = (e.clientX - (window.innerWidth / 2)) / zoomLevel + player.worldX;
            const clickY = (e.clientY - (window.innerHeight / 2)) / zoomLevel + player.worldY;

            const gridClickX = Math.floor(clickX / TILE_SIZE);
            const gridClickY = Math.floor(clickY / TILE_SIZE);
            const clickedLogicTile = worldMap.get(getMapKey(gridClickX, gridClickY, 15));

            // Si es un bloque con lógica y requiere clic
            if (clickedLogicTile && clickedLogicTile.requiresClick) {
                // Validar que el jugador no esté muy lejos (rango de interacción)
                const distToTile = Math.hypot(player.worldX - clickX, player.worldY - clickY);
                if (distToTile < TILE_SIZE * 3) {
                    executeTileLogic(clickedLogicTile, `${gridClickX},${gridClickY}`);
                    return; // Detenemos la ejecución para que no dispare ni abra perfiles
                }
            }

            // Revisar si le dimos a un jugador (Perfiles)
            const HIT_RADIUS = 20;
            if (Math.abs(clickX - player.worldX) < HIT_RADIUS && Math.abs(clickY - player.worldY) < HIT_RADIUS) {
                openProfile('self', player.username); return;
            }
            for (let id in otherPlayers) {
                if (Math.abs(clickX - otherPlayers[id].worldX) < HIT_RADIUS && Math.abs(clickY - otherPlayers[id].worldY) < HIT_RADIUS) {
                    openProfile(id, otherPlayers[id].username); return;
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (editMode && coordHelper && e.target.id === 'gameCanvas') {
                const gridPos = getWorldGridXY(e.clientX, e.clientY);
                updateCoordHelper(gridPos);
                editorMouseGridX = gridPos.x;
                editorMouseGridY = gridPos.y;
            }

            // 2. ACTUALIZAR CAJA MIENTRAS ARRASTRAMOS
            if (editMode && isDraggingSelection && mapSelectionBox) {
                const gridPos = getWorldGridXY(e.clientX, e.clientY);
                const w = mapSelectionBox.maxX - mapSelectionBox.minX;
                const h = mapSelectionBox.maxY - mapSelectionBox.minY;

                mapSelectionBox.minX = gridPos.x - dragOffsetX;
                mapSelectionBox.maxX = mapSelectionBox.minX + w;
                mapSelectionBox.minY = gridPos.y - dragOffsetY;
                mapSelectionBox.maxY = mapSelectionBox.minY + h;
                return;
            }

            handleEditMove(e.clientX, e.clientY, e);
        });

        window.addEventListener('mouseup', (e) => {
            // 3. SOLTAR EL CLICK DERECHO Y PEGAR LOS BLOQUES
            if (editMode && isDraggingSelection && e.button === 2) {
                isDraggingSelection = false;
                const finalOffsetX = mapSelectionBox.minX - dragOriginalMinX;
                const finalOffsetY = mapSelectionBox.minY - dragOriginalMinY;
                pasteSelectionBuffer(draggedTilesBuffer, finalOffsetX, finalOffsetY);
                return;
            }

            if (e.button === 0) handleEditEnd(e.clientX, e.clientY);
        });

        // --- 7. INSPECTOR ACTIONS (Handles Single & Bulk) ---

        // Grabbers de los nuevos botones
        const inspectCopyBelowBtn = document.getElementById('inspect-copy-below-btn');
        const inspectCopyAboveBtn = document.getElementById('inspect-copy-above-btn');
        const inspectDeleteBtn = document.getElementById('inspect-delete-btn');
        const inspectDeleteBelowBtn = document.getElementById('inspect-delete-below-btn');
        const inspectDeleteAboveBtn = document.getElementById('inspect-delete-above-btn');
        const copyLayerNum = document.getElementById('copy-layer-num');
        const delLayerNum = document.getElementById('del-layer-num');
        const inspectCopyAllBtn = document.getElementById('inspect-copy-all-btn');
        const inspectDeleteAllBtn = document.getElementById('inspect-delete-all-btn');

        // --- NUEVO: TABS DEL INSPECTOR ---
        const tabBtnLogic = document.getElementById('tab-btn-logic');
        const tabBtnCopy = document.getElementById('tab-btn-copy');
        const tabBtnDelete = document.getElementById('tab-btn-delete');
        const tabLogic = document.getElementById('tab-logic');
        const tabCopy = document.getElementById('tab-copy');
        const tabDelete = document.getElementById('tab-delete');

        function switchInspectorTab(tabName) {
            tabBtnLogic.style.background = tabName === 'logic' ? 'rgba(255,255,255,0.1)' : 'transparent';
            tabBtnLogic.style.color = tabName === 'logic' ? 'white' : 'rgba(255,255,255,0.6)';
            tabBtnCopy.style.background = tabName === 'copy' ? 'rgba(255,255,255,0.1)' : 'transparent';
            tabBtnCopy.style.color = tabName === 'copy' ? 'white' : 'rgba(255,255,255,0.6)';
            tabBtnDelete.style.background = tabName === 'delete' ? 'rgba(255,255,255,0.1)' : 'transparent';
            tabBtnDelete.style.color = tabName === 'delete' ? 'white' : 'rgba(255,255,255,0.6)';

            tabLogic.style.display = tabName === 'logic' ? 'flex' : 'none';
            tabCopy.style.display = tabName === 'copy' ? 'flex' : 'none';
            tabDelete.style.display = tabName === 'delete' ? 'flex' : 'none';
        }

        if (tabBtnLogic) tabBtnLogic.onclick = () => switchInspectorTab('logic');
        if (tabBtnCopy) tabBtnCopy.onclick = () => switchInspectorTab('copy');
        if (tabBtnDelete) tabBtnDelete.onclick = () => switchInspectorTab('delete');
        function copyMultiLayer(startL, endL) {
            if (!mapSelectionBox) return;
            selectedGrid.isMultiLayer = true; // ALWAYS treat copied structures as blueprints so Ghost Preview works
            selectedGrid.w = (mapSelectionBox.maxX - mapSelectionBox.minX) + 1;
            selectedGrid.h = (mapSelectionBox.maxY - mapSelectionBox.minY) + 1;
            selectedGrid.multiTiles = [];
            selectedGrid.tiles = [];

            for (let r = 0; r < selectedGrid.h; r++) {
                let singleRowArray = [];
                for (let c = 0; c < selectedGrid.w; c++) {
                    for (let l = startL; l <= endL; l++) {
                        const key = getMapKey(mapSelectionBox.minX + c, mapSelectionBox.minY + r, l);
                        const tile = worldMap.get(key);
                        if (tile && tile.tileId !== -1) {
                            selectedGrid.multiTiles.push({ 
                                x: c, y: r, l: l, 
                                id: tile.tileId, 
                                rot: tile.rotation || 0,
                                hasCollision: tile.hasCollision || false
                            });
                        } else {
                            selectedGrid.multiTiles.push({ x: c, y: r, l: l, id: -1, rot: 0, hasCollision: false });
                        }
                    }

                    // Llenar tiles clásicos por si es solo 1 capa
                    const singleKey = getMapKey(mapSelectionBox.minX + c, mapSelectionBox.minY + r, startL);
                    const singleTile = worldMap.get(singleKey);
                    singleRowArray.push(singleTile ? { id: singleTile.tileId, rot: singleTile.rotation || 0 } : { id: -1, rot: 0 });
                }
                selectedGrid.tiles.push(singleRowArray);
            }

            selectedTileId = selectedGrid.isMultiLayer ? "MULTI" : selectedGrid.tiles[0][0];
            worldMode = 'paint'; // Activar brocha
            worldPaintBtn.style.background = '#27ae60';
            worldSelectBtn.style.background = 'rgba(255,255,255,0.1)';
            tileInspector.style.display = 'none';
            mapSelectionBox = null;
        }

        // --- NUEVO: LÓGICA DE ROTACIÓN (90 GRADOS) ---
        const inspectRotateBtn = document.getElementById('inspect-rotate-btn');
        if (inspectRotateBtn) {
            inspectRotateBtn.onclick = () => {
                if (!mapSelectionBox) return;

                // 1. Recogemos los bloques actuales
                const tiles = captureSelection(false);

                const oldW = (mapSelectionBox.maxX - mapSelectionBox.minX) + 1;
                const oldH = (mapSelectionBox.maxY - mapSelectionBox.minY) + 1;

                let rotatedTiles = [];
                tiles.forEach(t => {
                    // Convertimos a coordenadas locales (0,0)
                    const lx = t.x - mapSelectionBox.minX;
                    const ly = t.y - mapSelectionBox.minY;

                    // Fórmula de Rotación 90° a la derecha
                    const nx = oldH - 1 - ly;
                    const ny = lx;

                    rotatedTiles.push({
                        ...t,
                        x: mapSelectionBox.minX + nx,
                        y: mapSelectionBox.minY + ny,
                        rotation: ((t.rotation || 0) + 90) % 360 // <-- Girar la imagen 90 grados
                    });
                });

                // 2. Ajustamos la caja de selección a sus nuevas dimensiones
                mapSelectionBox.maxX = mapSelectionBox.minX + oldH - 1;
                mapSelectionBox.maxY = mapSelectionBox.minY + oldW - 1;

                // 3. Pegamos los bloques rotados
                pasteSelectionBuffer(rotatedTiles, 0, 0);
            };
        }

        // Conectar Botones de Copiado
        if (inspectCopyBtn) inspectCopyBtn.onclick = () => copyMultiLayer(activeLayer, activeLayer);
        if (inspectCopyBelowBtn) inspectCopyBelowBtn.onclick = () => copyMultiLayer(0, 7);
        if (inspectCopyAboveBtn) inspectCopyAboveBtn.onclick = () => copyMultiLayer(8, 15);
        if (inspectCopyAllBtn) inspectCopyAllBtn.onclick = () => copyMultiLayer(0, 15); // <--- NUEVO

        // FUNCIÓN MAESTRA 3: Borrar Capas
        function deleteLayers(startL, endL) {
            let currentAction = [];
            let bulkNetworkData = [];

            if (mapSelectionBox) {
                for (let r = mapSelectionBox.minY; r <= mapSelectionBox.maxY; r++) {
                    for (let c = mapSelectionBox.minX; c <= mapSelectionBox.maxX; c++) {
                        for (let l = startL; l <= endL; l++) {
                            const key = getMapKey(c, r, l);
                            const prevTile = worldMap.get(key);
                            const prevId = prevTile ? prevTile.tileId : -1;
                            if (prevId !== -1) {
                                currentAction.push({ x: c, y: r, l: l, prevId: prevId, newId: -1 });
                                bulkNetworkData.push({ x: c, y: r, l: l, tileId: -1 });
                                worldMap.delete(key);
                            }
                        }
                    }
                }
            } else if (inspectingCoord) {
                const [gx, gy, _] = inspectingCoord.split(',').map(Number);
                for (let l = startL; l <= endL; l++) {
                    const key = getMapKey(gx, gy, l);
                    const prevTile = worldMap.get(key);
                    const prevId = prevTile ? prevTile.tileId : -1;
                    if (prevId !== -1) {
                        currentAction.push({ x: gx, y: gy, l: l, prevId: prevId, newId: -1 });
                        bulkNetworkData.push({ x: gx, y: gy, l: l, tileId: -1 });
                        worldMap.delete(key);
                    }
                }
            }

            if (currentAction.length > 0) {
                recordHistory(currentAction);
                ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
            }
            tileInspector.style.display = 'none';
            inspectingCoord = null;
            mapSelectionBox = null;
        }

        // Conectar Botones de Borrado
        if (inspectDeleteBtn) inspectDeleteBtn.onclick = () => deleteLayers(activeLayer, activeLayer);
        if (inspectDeleteBelowBtn) inspectDeleteBelowBtn.onclick = () => deleteLayers(0, 7);
        if (inspectDeleteAboveBtn) inspectDeleteAboveBtn.onclick = () => deleteLayers(8, 15);
        if (inspectDeleteAllBtn) inspectDeleteAllBtn.onclick = () => deleteLayers(0, 15); // <--- NUEVO

        function handleInspectorCheckboxChange() {
            if (mapSelectionBox) {
                let bulkNetworkData = [];
                for (let r = mapSelectionBox.minY; r <= mapSelectionBox.maxY; r++) {
                    for (let c = mapSelectionBox.minX; c <= mapSelectionBox.maxX; c++) {
                        const key = getMapKey(c, r, activeLayer);
                        let tile = worldMap.get(key);
                        if (tile) {
                            tile.hasCollision = inspectCollision.checked;
                            tile.isSit = inspectIsSit.checked;
                            worldMap.set(key, tile);
                            bulkNetworkData.push({ x: c, y: r, l: activeLayer, tileId: tile.tileId, rotation: tile.rotation || 0, hasCollision: tile.hasCollision, isSit: tile.isSit });
                        }
                    }
                }
                if (bulkNetworkData.length > 0) {
                    ws.send(MessagePack.encode({ type: 'place_tiles_bulk', tiles: bulkNetworkData }));
                }
            } else if (inspectingCoord) {
                const [gx, gy, gl] = inspectingCoord.split(',').map(Number);
                const key = getMapKey(gx, gy, gl);
                let tile = worldMap.get(key);
                if (tile) {
                    tile.hasCollision = inspectCollision.checked;
                    tile.isSit = inspectIsSit.checked;
                    worldMap.set(key, tile);
                    ws.send(MessagePack.encode({
                        type: 'update_tile_metadata', x: gx, y: gy, layer: gl, hasCollision: inspectCollision.checked, isSit: inspectIsSit.checked
                    }));
                }
            }
        }

        inspectCollision.onchange = handleInspectorCheckboxChange;
        inspectIsSit.onchange = handleInspectorCheckboxChange;

        // --- LÓGICA DEL MENÚ DESPLEGABLE DEL EDITOR ---
        const logicSelect = document.getElementById('logic-type-select');
        const tpDestX = document.getElementById('tp-dest-x');
        const tpDestY = document.getElementById('tp-dest-y');
        const shopItemIdInput = document.getElementById('shop-item-id');
        const shopItemRowInput = document.getElementById('shop-item-row'); // <--- NUEVO
        const saveTpBtn = document.getElementById('save-tp-btn');
        const npcMessageInput = document.getElementById('npc-message-input');
        const logicRequiresClick = document.getElementById('logic-requires-click');
        // Variables (Añade estas 2)
        const shopItemSxInput = document.getElementById('shop-item-sx');
        const shopItemSyInput = document.getElementById('shop-item-sy');
        const insMinigameType = document.getElementById('ins-minigame-type'); // <--- NUEVO

        insMinigameType.onchange = () => {
            const type = insMinigameType.value;
            document.getElementById('arena-fields-spar').style.display = (type === 'spar' || type === 'soccer') ? 'flex' : 'none';
            document.getElementById('arena-fields-soccer').style.display = (type === 'soccer') ? 'flex' : 'none';
            document.getElementById('arena-fields-br').style.display = (type === 'battle_royale') ? 'flex' : 'none';
            document.getElementById('ins-arena-max-players').style.display = (type !== 'spar') ? 'inline-block' : 'none';
        };

        logicSelect.onchange = () => {
            tpDestX.style.display = (logicSelect.value === 'teleport') ? 'block' : 'none';
            tpDestY.style.display = (logicSelect.value === 'teleport') ? 'block' : 'none';
            shopItemIdInput.style.display = (logicSelect.value === 'shop') ? 'block' : 'none';
            shopItemRowInput.style.display = (logicSelect.value === 'shop') ? 'block' : 'none'; // <--- NUEVO
            document.getElementById('base-settings').style.display = (logicSelect.value === 'base') ? 'flex' : 'none';
            document.getElementById('arena-settings').style.display = (logicSelect.value === 'arena') ? 'flex' : 'none';
            npcMessageInput.style.display = (logicSelect.value === 'npc') ? 'block' : 'none';
            shopItemSxInput.style.display = (logicSelect.value === 'shop') ? 'block' : 'none'; // <--- Mostrar X
            shopItemSyInput.style.display = (logicSelect.value === 'shop') ? 'block' : 'none'; // <--- Mostrar Y
        };

        saveTpBtn.onclick = () => {
            if (inspectingCoord) {
                // 1. Extraer las coordenadas que tocaste (ej. x:10, y:15, capa:2)
                const [gx, gy, gl] = inspectingCoord.split(',').map(Number);
                const key = getMapKey(gx, gy, gl); // ¡Usar la nueva llave matemática!

                // 2. Leer todos los valores de las cajitas del menú HTML
                const tType = logicSelect.value === 'none' ? null : logicSelect.value;
                const dx = parseInt(tpDestX.value);
                const dy = parseInt(tpDestY.value);
                const itemId = shopItemIdInput.value.trim();
                const requiresClick = logicRequiresClick.checked;
                const npcMessage = npcMessageInput.value.trim();
                const itemRow = parseInt(shopItemRowInput.value) || 0;
                const shelfX = parseInt(shopItemSxInput.value) || 0;
                const shelfY = parseInt(shopItemSyInput.value) || 0;

                // Datos de Bases (Turf)
                const tName = document.getElementById('ins-turf-name').value || "Base Central";
                const tHp = parseInt(document.getElementById('ins-turf-hp').value) || 5000;
                const tOx = parseInt(document.getElementById('ins-turf-ox').value) || 0;
                const tOy = parseInt(document.getElementById('ins-turf-oy').value) || 0;
                const tHx = parseInt(document.getElementById('ins-turf-hx').value) || 0;
                const tHy = parseInt(document.getElementById('ins-turf-hy').value) || 0;
                const tHw = parseInt(document.getElementById('ins-turf-hw').value) || 32;
                const tHh = parseInt(document.getElementById('ins-turf-hh').value) || 32;

                // Datos de Minigames / Arena
                const aName = document.getElementById('ins-arena-name').value || "Sala Minijuego";
                const gType = document.getElementById('ins-minigame-type').value || "spar";
                const t1Size = parseInt(document.getElementById('ins-arena-t1-size').value) || 1;
                const t2Size = parseInt(document.getElementById('ins-arena-t2-size').value) || 1;
                const maxP = parseInt(document.getElementById('ins-arena-max-players').value) || 2;
                
                // Spar fields
                const ap1x = parseInt(document.getElementById('ins-arena-p1x').value) || 0;
                const ap1y = parseInt(document.getElementById('ins-arena-p1y').value) || 0;
                const ap2x = parseInt(document.getElementById('ins-arena-p2x').value) || 0;
                const ap2y = parseInt(document.getElementById('ins-arena-p2y').value) || 0;
                
                // Soccer fields
                const bX = parseInt(document.getElementById('ins-soccer-bx').value) || 0;
                const bY = parseInt(document.getElementById('ins-soccer-by').value) || 0;
                const g1X1 = parseInt(document.getElementById('ins-soccer-g1x1').value) || 0;
                const g1X2 = parseInt(document.getElementById('ins-soccer-g1x2').value) || 0;
                const g1Y = parseInt(document.getElementById('ins-soccer-g1y').value) || 0;
                const g2X1 = parseInt(document.getElementById('ins-soccer-g2x1').value) || 0;
                const g2X2 = parseInt(document.getElementById('ins-soccer-g2x2').value) || 0;
                const g2Y = parseInt(document.getElementById('ins-soccer-g2y').value) || 0;
                
                // BR fields
                const brMinX = parseInt(document.getElementById('ins-br-minx').value) || 0;
                const brMaxX = parseInt(document.getElementById('ins-br-maxx').value) || 0;
                const brMinY = parseInt(document.getElementById('ins-br-miny').value) || 0;
                const brMaxY = parseInt(document.getElementById('ins-br-maxy').value) || 0;

                const isRanked = document.getElementById('ins-arena-ranked').checked;

                // 3. GUARDAR EN LA MEMORIA RAM LOCAL (NUEVO FORMATO MAP)
                let tile = worldMap.get(key);
                if (tile) {
                    tile.triggerType = tType;
                    tile.destX = isNaN(dx) ? null : dx;
                    tile.destY = isNaN(dy) ? null : dy;
                    tile.itemId = itemId;
                    tile.requiresClick = requiresClick;
                    tile.npcMessage = npcMessage;
                    tile.itemRow = itemRow;
                    tile.shelfX = shelfX;
                    tile.shelfY = shelfY;
                    tile.arenaName = aName;
                    tile.gameType = gType;
                    tile.team1Size = t1Size;
                    tile.team2Size = t2Size;
                    tile.maxPlayers = maxP;
                    tile.arenaP1X = ap1x; tile.arenaP1Y = ap1y; tile.arenaP2X = ap2x; tile.arenaP2Y = ap2y;
                    tile.ballX = bX; tile.ballY = bY; 
                    tile.goal1X1 = g1X1; tile.goal1X2 = g1X2; tile.goal1Y = g1Y; 
                    tile.goal2X1 = g2X1; tile.goal2X2 = g2X2; tile.goal2Y = g2Y;
                    tile.brMinX = brMinX; tile.brMaxX = brMaxX; tile.brMinY = brMinY; tile.brMaxY = brMaxY;
                    tile.isRanked = isRanked;

                    worldMap.set(key, tile); // Volvemos a meter el bloque actualizado a la memoria
                }

                // 4. ENVIAR AL SERVIDOR PARA GUARDAR EN MONGODB
                ws.send(MessagePack.encode({
                    type: 'update_tile_metadata',
                    x: gx, y: gy, layer: gl,
                    hasCollision: inspectCollision.checked,
                    isSit: inspectIsSit.checked,
                    triggerType: tType,
                    destX: isNaN(dx) ? null : dx,
                    destY: isNaN(dy) ? null : dy,
                    itemId: itemId,
                    requiresClick: requiresClick,
                    npcMessage: npcMessage,
                    itemRow: itemRow,
                    shelfX: shelfX,
                    shelfY: shelfY,
                    turfName: tName, turfHp: tHp,
                    turfOffsetX: tOx, turfOffsetY: tOy,
                    turfHitX: tHx, turfHitY: tHy,
                    turfHitW: tHw, turfHitH: tHh,
                    arenaName: aName, gameType: gType, maxPlayers: maxP, team1Size: t1Size, team2Size: t2Size,
                    arenaP1X: ap1x, arenaP1Y: ap1y, arenaP2X: ap2x, arenaP2Y: ap2y,
                    ballX: bX, ballY: bY, 
                    goal1X1: g1X1, goal1X2: g1X2, goal1Y: g1Y, 
                    goal2X1: g2X1, goal2X2: g2X2, goal2Y: g2Y,
                    brMinX: brMinX, brMaxX: brMaxX, brMinY: brMinY, brMaxY: brMaxY,
                    isRanked: isRanked
                }));

                // 5. Animación bonita del botón
                saveTpBtn.innerText = "¡Guardado!";
                saveTpBtn.style.background = "#27ae60";
                setTimeout(() => {
                    saveTpBtn.innerText = "Guardar";
                    saveTpBtn.style.background = "#2ecc71";
                }, 1500);
            }
        };

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

            // El número de jugadores ahora se actualiza automáticamente vía red (type: 'player_count')

            const cameraX = player.worldX + mapOffsetX;
            const cameraY = player.worldY + mapOffsetY;
            const scale = minimapZoom / TILE_SIZE;

            // 2. ¿NECESITAMOS TOMAR UNA NUEVA FOTO? (Dirty Flag)
            // Si construyeron algo, cambiaste el zoom, o te moviste más de 16 píxeles (1 bloque)
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

                // DIBUJAMOS TODAS LAS 16 CAPAS EN LA FOTO INVISIBLE (Operación Pesada)
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

                // Guardamos las coordenadas de donde se tomó la foto
                mmLastCameraX = cameraX;
                mmLastCameraY = cameraY;
                mmLastZoom = minimapZoom;
                minimapDirty = false;
            }

            // 3. PLASMAR LA FOTO EN LA PANTALLA REAL (Costo de CPU = 0%)
            mCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
            mCtx.imageSmoothingEnabled = false;

            // 🔥 El truco maestro: Si caminaste medio bloque, no tomamos una foto nueva.
            // Simplemente desplazamos la foto vieja los píxeles exactos.
            const subPixelX = (mmLastCameraX - cameraX) * scale;
            const subPixelY = (mmLastCameraY - cameraY) * scale;
            mCtx.drawImage(minimapBgCanvas, subPixelX, subPixelY);

            // 4. DIBUJAR LOS JUGADORES ENCIMA DE LA FOTO (Gente moviéndose en vivo)
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

        // 🚀 EL FIX DEL SANTO GRIAL: RESOLUCIÓN DINÁMICA
        let dynamicRenderScale = 1.0;
        let fpsHistory = [];
        let lastResolutionCheck = performance.now();

        function resize() {
            // 📱 FIX BLUR iPHONE 15 PRO:
            // Antes limitábamos el DPR a 2 en móvil para ahorrar GPU, pero en pantallas
            // de 3x (iPhone 15 Pro, Pixel 8 Pro...) el browser upscaleaba 2x→3x
            // y eso desenfocaba los píxeles del juego. Usamos el DPR real completo.
            // El dynamicRenderScale (0.5–1.0) ya se encarga de bajar resolución si
            // el celular se calienta o no llega a 60fps.
            const dpr = window.devicePixelRatio || 1;

            cachedScreenWidth = window.innerWidth;
            cachedScreenHeight = window.innerHeight;

            // 1. El canvas CSS ocupa siempre el 100% de la pantalla física real
            canvas.style.width  = cachedScreenWidth  + 'px';
            canvas.style.height = cachedScreenHeight + 'px';

            // 2. El canvas interno en píxeles físicos reales del dispositivo
            const finalScale = dpr * dynamicRenderScale;
            canvas.width  = Math.floor(cachedScreenWidth  * finalScale);
            canvas.height = Math.floor(cachedScreenHeight * finalScale);

            // 3. Reiniciar y aplicar la nueva escala de renderizado
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(finalScale, finalScale);

            // Avisamos a las cámaras que tomen foto nueva
            if (typeof floorDirty !== 'undefined') floorDirty = true;
            if (typeof minimapDirty !== 'undefined') minimapDirty = true;
        }

        window.addEventListener('resize', resize);
        resize();

        // --- PROFILE MODAL LOGIC ---
        const profileModal = document.getElementById('profile-modal');
        const closeProfile = document.getElementById('close-profile');
        // --- CONECTADO AL CANVAS CLÁSICO GIGANTE ---
        const profileCanvas = document.getElementById('profile-canvas');
        const prCtx = profileCanvas.getContext('2d');
        const profileNameDisplay = document.getElementById('profile-name-display');

        // Nuevas variables para el botón de opciones
        const profileOptionsBtn = document.getElementById('profile-options-btn');
        const profileOtherControls = document.getElementById('profile-other-controls');
        const addFriendBtn = document.getElementById('add-friend-btn');

        // Variables del Modal de Opciones
        const optionsModal = document.getElementById('options-modal');
        const closeOptionsModal = document.getElementById('close-options-modal');
        const editNameInput = document.getElementById('edit-name-input');
        const saveNameBtn = document.getElementById('save-name-btn');

        let isProfileOpen = false;
        let profileTargetId = null;
        let profileAnimFrame = 0;
        let currentProfileData = null; // 👈 Guarda toda la data del jugador inspeccionado

        // --- ENLAZAR EVENTOS TÁCTILES ---
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;

            if (editMode && coordHelper && e.touches.length > 0) {
                const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
                updateCoordHelper(gridPos);
            }

            // Si estamos en modo edición, pintar o seleccionar
            if (editMode) {
                handleEditStart(e.touches[0].clientX, e.touches[0].clientY);
                return;
            }

            // Si NO estamos en edición, calcular toque normal
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
                    return; // Detenemos la ejecución
                }
            }

            // Detectar si tocamos un jugador
            const HIT_RADIUS = 20;
            if (Math.abs(clickX - player.worldX) < HIT_RADIUS && Math.abs(clickY - player.worldY) < HIT_RADIUS) {
                openProfile('self', player.username); return;
            }
            for (let id in otherPlayers) {
                if (Math.abs(clickX - otherPlayers[id].worldX) < HIT_RADIUS && Math.abs(clickY - otherPlayers[id].worldY) < HIT_RADIUS) {
                    openProfile(id, otherPlayers[id].username); return;
                }
            }
        }, { passive: false });

        // =========================================================
        // 🗣️ SISTEMA DE DIÁLOGOS RPG (A PRUEBA DE FALLOS v3)
        // =========================================================
        let dialogFullText = "";
        let dialogCurrentIndex = 0;
        let dialogTimer = null;
        let isDialogTyping = false;

        function showRetroDialog(texto) {
            if (!texto) return; // Escudo por si el texto viene vacío

            const box = document.getElementById('retro-dialog-box');
            const textEl = document.getElementById('retro-dialog-text');
            const indicator = document.getElementById('retro-dialog-indicator');

            if (!box || !textEl) {
                console.error("No se encontró el HTML de la caja de diálogo.");
                return;
            }

            // 1. Congelar al jugador MIENTRAS LEE (Cortamos toda inercia)
            player.vx = 0;
            player.vy = 0;
            player.isMoving = false;

            // 🛑 EL FIX: También detenemos al jugador hacia donde haya estado caminando
            keys.w = false; keys.a = false; keys.s = false; keys.d = false;

            // 2. Reiniciar la caja (Asegurar que la flechita se oculte al iniciar nuevo diálogo)
            box.style.display = 'block';
            if (indicator) indicator.style.display = 'none';

            // 3. Preparar las variables del texto
            dialogFullText = String(texto); // Forzar a que sea cadena de texto
            dialogCurrentIndex = 0;
            textEl.innerText = "";
            isDialogTyping = true;

            // 4. Limpiar timers viejos por si acaso
            if (dialogTimer) clearInterval(dialogTimer);

            // 5. Iniciar el efecto de máquina de escribir (1 letra cada 35ms)
            dialogTimer = setInterval(() => {
                textEl.innerText += dialogFullText.charAt(dialogCurrentIndex);
                dialogCurrentIndex++;

                if (dialogCurrentIndex >= dialogFullText.length) {
                    finishTypingDialog();
                }
            }, 35);
        }

        // Función para rellenar de golpe cuando se completa o el jugador se salta la animación
        function finishTypingDialog() {
            if (dialogTimer) clearInterval(dialogTimer);
            const textEl = document.getElementById('retro-dialog-text');
            const indicator = document.getElementById('retro-dialog-indicator');

            if (textEl) textEl.innerText = dialogFullText;
            isDialogTyping = false;

            // Mostrar la flechita
            if (indicator) indicator.style.display = 'block';
        }

        // --- Lógica de Interacción (Hacer Clic en la caja) ---
        window.handleDialogClick = function (e) {
            // Evitar que el clic en la caja de diálogo se propague al mapa detrás
            if (e && e.preventDefault) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();

            const box = document.getElementById('retro-dialog-box');

            if (isDialogTyping) {
                // Si está escribiendo y das clic, muestra todo el texto de golpe (Fast-Forward)
                finishTypingDialog();
            } else {
                // Si ya terminó de escribir y das clic, cerramos la caja y eres libre
                if (box) {
                    box.style.display = 'none';
                    // 🛑 EL FIX: Limpiamos la flechita para que no aparezca parpadeando la próxima vez que se abra de golpe
                    const indicator = document.getElementById('retro-dialog-indicator');
                    if (indicator) indicator.style.display = 'none';
                }
            }
        };
        function openProfile(targetId, username, offlineData = null) {
            isProfileOpen = true;
            profileTargetId = targetId;
            profileNameDisplay.innerText = username;

            // 🛑 EL FIX ESTRUCTURAL DEFINITIVO PARA LA ROPA 🛑
            let targetPlayer;

            if (targetId === 'self') {
                targetPlayer = player;
            } else if (targetId === 'offline') {
                // Creamos un "maniquí" blindado fusionando los datos que llegaron del buscador
                targetPlayer = {
                    accountId: offlineData ? offlineData.accountId : null,
                    username: username,
                    role: offlineData ? offlineData.role : 'player',
                    elo: offlineData ? (offlineData.elo || 1000) : 1000,
                    kills: offlineData ? (offlineData.kills || 0) : 0,
                    losses: offlineData ? (offlineData.losses || 0) : 0,
                    coins: offlineData ? (offlineData.coins || 0) : 0,
                    squadName: offlineData ? offlineData.squadName : null,
                    squadLogo: offlineData ? offlineData.squadLogo : null,

                    // 🧠 AQUÍ ESTÁ LA MAGIA: Garantizamos que tenga body, head y hat
                    equipped: {
                        head: (offlineData && offlineData.equipped && offlineData.equipped.head)
                            ? offlineData.equipped.head : (offlineData && offlineData.headId ? offlineData.headId : 'head_default'),
                        body: (offlineData && offlineData.equipped && offlineData.equipped.body)
                            ? offlineData.equipped.body : 'body_default',
                        hat: (offlineData && offlineData.equipped && offlineData.equipped.hat)
                            ? offlineData.equipped.hat : 'none'
                    }
                };
            } else {
                targetPlayer = otherPlayers[targetId] || player;
                // Escudo extra por si el jugador conectado aún no ha enviado su ropa por la red
                if (!targetPlayer.equipped) targetPlayer.equipped = { head: 'head_default', body: 'body_default', hat: 'none' };
            }

            // Guardamos el jugador estructurado en la memoria global para la animación 3D
            currentProfileData = targetPlayer;

            // ... (el resto de la función openProfile se queda igual a partir del Rango)
            // 👇 LUEGO ya podemos leer sus puntos de Elo de forma segura 👇
            const targetElo = targetPlayer.elo || 1000;
            const rank = getPlayerRank(targetElo);

            const rankImgEl = document.getElementById('profile-rank-badge');
            const eloDisplay = document.getElementById('profile-elo-display'); // <-- Capturamos el texto del Elo

            if (rank) {
                rankImgEl.src = rank.src;
                rankImgEl.style.display = 'block';
                rankImgEl.title = `${rank.name} (${targetElo} Pts)`;

                // Mostrar el numerito justo debajo
                if (eloDisplay) {
                    eloDisplay.innerText = targetElo;
                    eloDisplay.style.display = 'block';
                }
            } else {
                rankImgEl.style.display = 'none';
                if (eloDisplay) eloDisplay.style.display = 'none';
            }

            // --- MOSTRAR EL TAG DEL CLAN EN EL PERFIL ---
            const tagContainer = document.getElementById('profile-squad-tag-container');

            // FIX: Escudo Anti-Crash para el contenedor del Tag
            if (tagContainer) {
                if (targetPlayer && targetPlayer.squadName) {
                    tagContainer.style.display = 'flex';
                    const nameSpan = document.getElementById('profile-squad-name');
                    if (nameSpan) nameSpan.innerText = `(${targetPlayer.squadName})`;

                    const logoImg = document.getElementById('profile-squad-logo');
                    if (logoImg) {
                        if (targetPlayer.squadLogo) {
                            logoImg.src = targetPlayer.squadLogo;
                            logoImg.style.display = 'block';
                        } else {
                            logoImg.style.display = 'none';
                        }
                    }
                } else {
                    tagContainer.style.display = 'none';
                }
            }

            // Actualizar monedas de forma segura
            const coinsDisplay = document.getElementById('profile-coins-display');
            if (coinsDisplay) {
                if (targetId === 'self') {
                    coinsDisplay.innerText = player.coins || 0;
                } else {
                    // Ahora usa los datos reales enviados por el servidor si está offline
                    coinsDisplay.innerText = targetPlayer.coins || 0;
                }
            }

            // Actualizar Kills, Losses y Calcular el KR
            const killsDisplay = document.getElementById('profile-kills-display');
            const lossesDisplay = document.getElementById('profile-losses-display');
            const krDisplay = document.getElementById('profile-kr-display');

            if (killsDisplay && lossesDisplay && krDisplay) {
                let k = targetPlayer.kills || 0;
                let l = targetPlayer.losses || 0;

                killsDisplay.innerText = k;
                lossesDisplay.innerText = l;

                let kr = l === 0 ? k.toFixed(2) : (k / l).toFixed(2);
                krDisplay.innerText = kr;
            }

            // Validar que el modal exista antes de abrirlo
            if (typeof profileModal !== 'undefined' && profileModal) {
                profileModal.style.display = 'flex';
            }

            // --- ACTUALIZACIÓN DE VISIBILIDAD REDISEÑO ---
            const mainActionsDiv = document.getElementById('profile-main-actions');

            // 👇 EL FIX: Declarar todas las variables ANTES de usarlas 👇
            const moreOptionsBtn = document.getElementById('toggle-more-options-btn');
            const moreOptionsModal = document.getElementById('more-options-modal');
            const backFromMoreOptions = document.getElementById('back-from-more-options');
            const inviteSquadBtn = document.getElementById('invite-squad-btn');

            if (targetId === 'self') {
                if (typeof profileOptionsBtn !== 'undefined' && profileOptionsBtn) profileOptionsBtn.style.display = 'block';
                if (mainActionsDiv) mainActionsDiv.style.display = 'none'; // Ocultar botones principales en ti
                if (moreOptionsBtn) moreOptionsBtn.style.display = 'none'; // Ocultar "Más Opciones" en ti
            } else {
                if (typeof profileOptionsBtn !== 'undefined' && profileOptionsBtn) profileOptionsBtn.style.display = 'none';

                // ENCENDER LOS NUEVOS CONTENEDORES
                if (mainActionsDiv) mainActionsDiv.style.display = 'flex';
                if (moreOptionsBtn) moreOptionsBtn.style.display = 'block';

                if (typeof addFriendBtn !== 'undefined' && addFriendBtn) addFriendBtn.style.display = 'block';

                // =========================================================
                // 🛠️ EL FIX DEFINITIVO: DATOS SEGUROS PARA LOS BOTONES
                // =========================================================
                // Sacamos el ID y Nombre exacto de nuestra nueva memoria segura
                const targetAccId = currentProfileData.accountId;
                const targetName = currentProfileData.username;
                const isFriend = player.friends && player.friends.includes(targetAccId);

                // --- BOTÓN DE AGREGAR / ELIMINAR AMIGO ---
                if (typeof addFriendBtn !== 'undefined' && addFriendBtn) {
                    addFriendBtn.style.background = "#3498db";
                    addFriendBtn.style.border = "none";
                    addFriendBtn.style.color = "white";

                    // Usamos .onclick en lugar de addEventListener para que no se dupliquen los clics
                    if (isFriend) {
                        addFriendBtn.innerText = "❌ Unfriend";
                        addFriendBtn.onclick = () => {
                            ws.send(MessagePack.encode({ type: 'remove_friend', targetId: targetAccId }));
                            if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';
                        };
                    } else {
                        addFriendBtn.innerText = "➕ Add Friend";
                        addFriendBtn.onclick = () => {
                            ws.send(MessagePack.encode({ type: 'add_friend', friendAccountId: targetAccId }));
                            addFriendBtn.innerText = "✓ Sent";
                            if (!player.friends) player.friends = [];
                            player.friends.push(targetAccId);
                        };
                    }
                }

                // --- BOTÓN DE ENVIAR MENSAJE (CHAT) ---
                if (typeof profileMessageBtn !== 'undefined' && profileMessageBtn) {
                    profileMessageBtn.onclick = () => {
                        if (!targetAccId) {
                            alert("No puedes enviar mensajes a un Invitado.");
                            return;
                        }
                        if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';

                        lastPmSource = 'profile'; // 💾 ¡AÑADE ESTA LÍNEA! Memorizamos que venimos del perfil
                        openPMModal(targetAccId, targetName);
                    };
                }

                // --- LÓGICA DE MÁS OPCIONES (INVITAR AL SQUAD) ---
                if (moreOptionsBtn && moreOptionsModal) {
                    moreOptionsBtn.onclick = () => {
                        if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';
                        moreOptionsModal.style.display = 'flex';

                        if (inviteSquadBtn) {
                            // 🛑 EL FIX: Ocultar el botón si no tienes squad O si no tienes permisos
                            if (!player.squad || !player.squadCanInvite) {
                                inviteSquadBtn.style.display = 'none';
                            } else {
                                inviteSquadBtn.style.display = 'block';

                                // Reiniciar visualmente el botón
                                inviteSquadBtn.innerText = "🏴‍☠️ Invitar al Clan";
                                inviteSquadBtn.style.background = "rgba(155, 89, 182, 0.2)";
                                inviteSquadBtn.style.borderColor = "#9b59b6";
                                inviteSquadBtn.style.color = "white";
                                inviteSquadBtn.disabled = false;

                                // Conectamos el botón de invitar
                                inviteSquadBtn.onclick = () => {
                                    ws.send(MessagePack.encode({ type: 'send_squad_invite', targetAccountId: targetAccId }));

                                    // ⏳ FEEDBACK INMEDIATO
                                    inviteSquadBtn.innerText = "⏳ Enviando...";
                                    inviteSquadBtn.style.background = "#7f8c8d";
                                    inviteSquadBtn.style.borderColor = "#555";
                                    inviteSquadBtn.disabled = true; // Bloquea el spam de clics
                                };
                            }
                        }
                    };
                }

                if (backFromMoreOptions) {
                    backFromMoreOptions.onclick = () => {
                        moreOptionsModal.style.display = 'none';
                        if (typeof profileModal !== 'undefined') profileModal.style.display = 'flex';
                    };
                }

            } // Fin del 'else' (es otro jugador)

            // Finalmente, dibujamos la animación 3D
            drawProfileAnimation();
        } // <--- FIN DE LA FUNCIÓN openProfile

        closeProfile.addEventListener('click', () => {
            isProfileOpen = false;
            profileModal.style.display = 'none';

            if (lastProfileSource === 'friends') {
                document.getElementById('friends-modal').style.display = 'flex';
                lastProfileSource = 'game';
            } else if (lastProfileSource === 'squad') {
                document.getElementById('my-squad-modal').style.display = 'flex';
                lastProfileSource = 'game';
            } else if (lastProfileSource === 'squad_member') {
                // 🛑 EL FIX: Si veníamos de editar a un miembro, abrimos AMBAS ventanas
                document.getElementById('my-squad-modal').style.display = 'flex'; // Fondo
                document.getElementById('squad-member-modal').style.display = 'flex'; // Frente
                lastProfileSource = 'game'; // Reseteamos
            }
        });

        profileOptionsBtn.addEventListener('click', () => {
            editNameInput.value = player.username;
            openWardrobe();
            profileModal.style.display = 'none'; // 🛑 HIDE PROFILE MODAL
            optionsModal.style.display = 'flex';
        });

        // =========================================================
        // ---  SISTEMA DEL MODAL DE OPCIONES ---
        // =========================================================

        // 1. Lógica de Pestañas (Tabs)
        const opTabBtns = document.querySelectorAll('.op-tab-btn');
        const opTabContents = document.querySelectorAll('.op-tab-content');

        opTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Apagar todas
                opTabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = '#aaa';
                    b.style.fontWeight = 'normal';
                });
                opTabContents.forEach(c => c.style.display = 'none');

                // Encender la presionada
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.borderBottomColor = '#3498db'; // Color activo
                btn.style.color = 'white';
                btn.style.fontWeight = 'bold';

                const targetId = btn.getAttribute('data-target');
                document.getElementById(targetId).style.display = 'block';
            });
        });

        // 2. Cerrar Modal y AUTO-GUARDAR Todo (Nombre + Ropa)
        closeOptionsModal.addEventListener('click', () => {

            // --- AUTO-GUARDAR NOMBRE ---
            const nameInput = document.getElementById('edit-name-input');
            if (nameInput) {
                const newName = nameInput.value.trim();
                // Verificamos que no esté vacío y que sea diferente al actual
                if (newName.length > 0 && newName !== player.username) {
                    player.username = newName; // Actualizamos localmente

                    // Si tienes un texto en la pantalla que muestra el nombre, lo actualizamos de una vez
                    const profileNameDisplay = document.getElementById('profile-name-display');
                    if (profileNameDisplay) profileNameDisplay.innerText = newName;

                    if (ws.readyState === WebSocket.OPEN) {
                        // Enviamos el formato EXACTO que tu servidor espera:
                        ws.send(MessagePack.encode({ type: 'change_username', newUsername: newName }));
                    }
                }
            }

            // --- AUTO-GUARDAR ROPA ---
            const headId = ownedHeads[currentHeadIdx];
            const bodyId = ownedBodies[currentBodyIdx];
            const hatId = ownedHats[currentHatIdx];

            const isDifferent = (
                player.equipped.head !== headId ||
                player.equipped.body !== bodyId ||
                player.equipped.hat !== hatId
            );

            if (isDifferent) {
                player.equipped.head = headId;
                player.equipped.body = bodyId;
                player.equipped.hat = hatId;

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'update_wardrobe', head: headId, body: bodyId, hat: hatId }));
                }
            }

            // Ocultamos la ventana
            optionsModal.style.display = 'none';
            // 🛑 RETURN TO PROFILE MODAL
            if (isProfileOpen) {
                profileModal.style.display = 'flex';
            }
        });

        // 3. The Isolated Walking Animation for the UI (CON ROPA Y SOMBRERO DINÁMICO)
        function drawProfileAnimation() {
            prCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
            prCtx.imageSmoothingEnabled = false;

            // 1. ¿A quién estamos inspeccionando? Usamos la memoria exacta que guardó openProfile
            const targetP = currentProfileData || player;

            // 2. Obtener la ropa que lleva puesta
            const eq = targetP.equipped || { head: 'head_default', body: 'body_default', hat: 'none' };
            const safeSprites = window.loadedItemSprites || {};
            const dynBody = safeSprites[eq.body] || window.bodyImg || window.walkSprite;
            const dynHead = safeSprites[eq.head] || window.headImg;
            const dynHat = safeSprites[eq.hat]; // 🎩 Extraemos el sombrero

            if (!dynBody || !dynBody.complete) {
                requestAnimationFrame(drawProfileAnimation);
                return;
            }

            profileAnimFrame = (profileAnimFrame + 0.1) % 8;
            const fX = Math.floor(profileAnimFrame);

            // Fila 8: Caminar desarmado (Hacia abajo = Dirección 0)
            const bodyRow = SKELETON_DATA.states["walk_unarmed"] || 8;
            const headRow = 0;

            // Usar FRAME_WIDTH y FRAME_HEIGHT fijos para no deformar spritesheets grandes
            const pFrameW = FRAME_WIDTH;
            const pFrameH = FRAME_HEIGHT;

            const drawScale = 4.5;
            const drawW = pFrameW * drawScale;
            const drawH = pFrameH * drawScale;

            const drawX = (profileCanvas.width - drawW) / 2;
            const drawY = (profileCanvas.height - drawH) / 2;

            // 3. Dibujar CUERPO
            prCtx.drawImage(
                dynBody,
                fX * pFrameW, bodyRow * pFrameH, pFrameW, pFrameH,
                drawX, drawY,
                drawW, drawH
            );

            // Extraer el bamboleo de la cabeza para el cuadro exacto de la animación
            const fKey = `walk_unarmed_0_${fX}`;
            const rawAnchors = (SKELETON_DATA.anchors && SKELETON_DATA.anchors[fKey]) ? SKELETON_DATA.anchors[fKey] : {};
            const headAnc = rawAnchors.head || [0, 0];

            // ==========================================================
            // 🧠 EL WOBBLE (BAMBOLEO) MATEMÁTICO PARA EL PERFIL
            // ==========================================================
            const WOBBLE_PATTERN = [0, 1, 0, -1, 0, 1, 0, -1];
            const currentWalkFrame = fX % 8;
            const wobbleY = WOBBLE_PATTERN[currentWalkFrame] || 0;

            // Calculamos la coordenada FINAL para el perfil
            const finalHeadX = drawX + (headAnc[0] * drawScale);
            const finalHeadY = drawY + ((headAnc[1] + wobbleY) * drawScale);

            // 4. Dibujar CABEZA
            if (dynHead && dynHead.complete && dynHead.naturalWidth > 0) {
                const headFrameH = dynHead.height / 4;
                prCtx.drawImage(
                    dynHead,
                    0, headRow * headFrameH, pFrameW, headFrameH, // X es 0, igual que el sombrero
                    finalHeadX, finalHeadY, drawW, headFrameH * drawScale
                );
            }

            // 5. 🎩 Dibujar SOMBRERO
            if (dynHat && dynHat.complete && dynHat.naturalWidth > 0) {
                const hatFrameH = dynHat.height / 4;
                prCtx.drawImage(
                    dynHat,
                    0, 0, pFrameW, hatFrameH,
                    finalHeadX, finalHeadY, drawW, hatFrameH * drawScale
                );
            }
            // ==========================================================

            // 🛑 EL FIX: Solo pedir el siguiente frame si la ventana sigue abierta
            if (isProfileOpen) {
                requestAnimationFrame(drawProfileAnimation);
            }
        }
        // --- LÓGICA DEL INBOX Y CHAT PRIVADO ---
        const inboxModal = document.getElementById('inbox-modal');
        const closeInboxModal = document.getElementById('close-inbox-modal');
        const inboxListContainer = document.getElementById('inbox-list-container');

        const pmModal = document.getElementById('pm-modal');
        const backToInboxBtn = document.getElementById('back-to-inbox-btn');
        const pmTargetName = document.getElementById('pm-target-name');
        const pmHistoryContainer = document.getElementById('pm-history-container');
        const pmInput = document.getElementById('pm-input');
        const pmSendBtn = document.getElementById('pm-send-btn');
        const profileMessageBtn = document.getElementById('profile-message-btn');

        let currentChatTargetId = ""; // AHORA USAMOS EL ID
        let currentChatTargetName = "";
        let currentChatTargetHead = "head_default"; // 👈 NUEVA VARIABLE
        // =========================================================
        // 👕 SISTEMA DE GUARDARROPA (CARRUSEL)
        // =========================================================
        let ownedHeads = [];
        let ownedBodies = [];
        let ownedHats = []; // 🎩 NUEVO
        let currentHeadIdx = 0;
        let currentBodyIdx = 0;
        let currentHatIdx = 0;

        function openWardrobe() {
            ownedHeads = ['head_default'];
            ownedBodies = ['body_default'];
            ownedHats = ['none']; // 🎩 Por defecto puedes no llevar sombrero

            const safeCatalog = window.MASTER_CATALOG || {};

            if (player.inventory) {
                player.inventory.forEach(item => {
                    const itemId = typeof item === 'object' ? item.id : item;
                    const catalogItem = safeCatalog[itemId];

                    if (catalogItem) {
                        if (catalogItem.category === 'head' && !ownedHeads.includes(itemId)) ownedHeads.push(itemId);
                        if (catalogItem.category === 'body' && !ownedBodies.includes(itemId)) ownedBodies.push(itemId);
                        if (catalogItem.category === 'hat' && !ownedHats.includes(itemId)) ownedHats.push(itemId); // 🎩
                    }
                });
            }

            if (!player.equipped) player.equipped = { head: 'head_default', body: 'body_default', hat: 'none' };
            currentHeadIdx = Math.max(0, ownedHeads.indexOf(player.equipped.head));
            currentBodyIdx = Math.max(0, ownedBodies.indexOf(player.equipped.body));
            currentHatIdx = Math.max(0, ownedHats.indexOf(player.equipped.hat));

            updateWardrobePreview();
        }

        function updateWardrobePreview() {
            const headId = ownedHeads[currentHeadIdx];
            const bodyId = ownedBodies[currentBodyIdx];
            const hatId = ownedHats[currentHatIdx];

            const safeCatalog = window.MASTER_CATALOG || {};
            //document.getElementById('head-name-display').innerText = safeCatalog[headId]?.name || "Cabeza";
            //document.getElementById('body-name-display').innerText = safeCatalog[bodyId]?.name || "Cuerpo";
            //document.getElementById('hat-name-display').innerText = safeCatalog[hatId]?.name || "Sin Sombrero";

            const canvas = document.getElementById('wardrobe-preview-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;

            const safeSprites = window.loadedItemSprites || {};
            const bImg = safeSprites[bodyId] || window.bodyImg;
            const hImg = safeSprites[headId] || window.headImg;
            const hatImg = safeSprites[hatId]; // 🎩

            const frameW = 48; const frameH = 64;
            const zoom = 2;
            const drawX = (canvas.width - (frameW * zoom)) / 2;
            const drawY = (canvas.height - (frameH * zoom)) / 2 + 10;

            if (bImg && bImg.complete && bImg.naturalWidth > 0) ctx.drawImage(bImg, 0, 0, frameW, frameH, drawX, drawY, frameW * zoom, frameH * zoom);
            if (hImg && hImg.complete && hImg.naturalWidth > 0) ctx.drawImage(hImg, 0, 0, frameW, frameH, drawX, drawY, frameW * zoom, frameH * zoom);

            // 🎩 Dibujar Sombrero en el Carrusel (Fila 0 = Hacia abajo)
            if (hatImg && hatImg.complete && hatImg.naturalWidth > 0) {
                const hHeight = hatImg.height / 4;
                ctx.drawImage(hatImg, 0, 0, frameW, hHeight, drawX, drawY, frameW * zoom, hHeight * zoom);
            }
        }

        document.getElementById('head-prev').onclick = () => { currentHeadIdx = (currentHeadIdx - 1 + ownedHeads.length) % ownedHeads.length; updateWardrobePreview(); };
        document.getElementById('head-next').onclick = () => { currentHeadIdx = (currentHeadIdx + 1) % ownedHeads.length; updateWardrobePreview(); };
        document.getElementById('body-prev').onclick = () => { currentBodyIdx = (currentBodyIdx - 1 + ownedBodies.length) % ownedBodies.length; updateWardrobePreview(); };
        document.getElementById('body-next').onclick = () => { currentBodyIdx = (currentBodyIdx + 1) % ownedBodies.length; updateWardrobePreview(); };

        // 🎩 Botones del sombrero
        document.getElementById('hat-prev').onclick = () => { currentHatIdx = (currentHatIdx - 1 + ownedHats.length) % ownedHats.length; updateWardrobePreview(); };
        document.getElementById('hat-next').onclick = () => { currentHatIdx = (currentHatIdx + 1) % ownedHats.length; updateWardrobePreview(); };

        // Conectar botones del Carrusel
        document.getElementById('head-prev').onclick = () => { currentHeadIdx = (currentHeadIdx - 1 + ownedHeads.length) % ownedHeads.length; updateWardrobePreview(); };
        document.getElementById('head-next').onclick = () => { currentHeadIdx = (currentHeadIdx + 1) % ownedHeads.length; updateWardrobePreview(); };
        document.getElementById('body-prev').onclick = () => { currentBodyIdx = (currentBodyIdx - 1 + ownedBodies.length) % ownedBodies.length; updateWardrobePreview(); };
        document.getElementById('body-next').onclick = () => { currentBodyIdx = (currentBodyIdx + 1) % ownedBodies.length; updateWardrobePreview(); };

        // CERRAR INBOX
        closeInboxModal.addEventListener('click', () => {
            inboxModal.style.display = 'none';
        });

        // BOTÓN "ATRÁS" EN EL CHAT
        backToInboxBtn.addEventListener('click', () => {
            pmModal.style.display = 'none';

            currentChatTargetId = "";
            currentChatTargetName = "";

            // 🛑 EL FIX: ¿A dónde regresamos?
            if (lastPmSource === 'profile') {
                // Si vinimos del perfil, reabrimos el perfil
                profileModal.style.display = 'flex';
                lastPmSource = 'inbox'; // Reseteamos por seguridad
            } else {
                // Si vinimos del Inbox normal, reabrimos el Inbox
                inboxModal.style.display = 'flex';
                ws.send(MessagePack.encode({ type: 'get_inbox' }));
            }
        });

        // ABRIR UN CHAT ESPECÍFICO
        function openPMModal(targetAccountId, fallbackName) {
            inboxModal.style.display = 'none';
            currentChatTargetId = targetAccountId;
            currentChatTargetName = fallbackName || "Cargando...";
            pmTargetName.innerText = currentChatTargetName;

            const pmHeaderAvatar = document.getElementById('pm-header-avatar');
            // Ponemos un cuadrito gris cargando mientras esperamos al servidor
            pmHeaderAvatar.innerHTML = '<div style="width:36px; height:36px; background:rgba(0,0,0,0.5);"></div>';

            pmModal.style.display = 'flex';
            pmHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">Cargando mensajes...</div>';

            // Pedimos el historial usando el ID
            ws.send(MessagePack.encode({ type: 'get_pm_history', targetAccountId: targetAccountId }));
            setTimeout(() => pmInput.focus(), 100);
        }

        // ENVIAR MENSAJE
        function sendPM() {
            const text = pmInput.value.trim();
            if (text && currentChatTargetId) {
                ws.send(MessagePack.encode({ type: 'send_pm', targetAccountId: currentChatTargetId, targetUsername: currentChatTargetName, text: text }));
                pmInput.value = "";
            }
        }
        pmSendBtn.addEventListener('click', sendPM);
        pmInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendPM(); });

        // =========================================================
        // 🏭 FÁBRICA UNIVERSAL DE TARJETAS DE JUGADORES (DRY)
        // =========================================================
        function createPlayerCard(playerData, onClickCallback, inboxData = null) {
            const isAdmin = (playerData.role === 'admin');
            const rowBg = isAdmin ? "rgba(231, 76, 60, 0.15)" : "rgba(255,255,255,0.05)";
            const rowBorder = isAdmin ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.1)";
            const nameColor = isAdmin ? "#e74c3c" : "#f1c40f";
            const adminBadge = isAdmin ? `<span style="background: #e74c3c; color: white; font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: bold; margin-left: 6px; box-shadow: 0 0 5px rgba(231,76,60,0.5);">ADMIN</span>` : "";

            const row = document.createElement('div');
            row.style.padding = "10px";
            row.style.background = rowBg;
            row.style.borderRadius = "10px";
            row.style.border = rowBorder;
            row.style.cursor = "pointer";
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "12px";
            row.style.transition = "0.2s";

            row.onmouseenter = () => row.style.transform = "scale(1.02)";
            row.onmouseleave = () => row.style.transform = "scale(1)";

            const avatarDiv = document.createElement('div');
            avatarDiv.style.width = "40px"; avatarDiv.style.height = "40px";
            avatarDiv.style.borderRadius = "10px";
            avatarDiv.style.overflow = "hidden";
            avatarDiv.style.background = "rgba(0,0,0,0.3)";
            avatarDiv.style.flexShrink = "0";

            // 🛑 EL FIX DE LA CABEZA: Buscar de forma segura en cualquier formato
            const headToDraw = (playerData.equipped && playerData.equipped.head)
                ? playerData.equipped.head
                : (playerData.targetHeadId || playerData.headId || 'head_default');

            const safeSprites = window.loadedItemSprites || {};
            const headImgForAvatar = safeSprites[headToDraw] || window.headImg;

            const aCanvas = document.createElement('canvas');
            aCanvas.width = 40; aCanvas.height = 40;
            const aCtx = aCanvas.getContext('2d');
            aCtx.imageSmoothingEnabled = false;

            if (headImgForAvatar && headImgForAvatar.complete) {
                const hH = headImgForAvatar.height / 4;
                const zoom = 40 / 30;
                setTimeout(() => {
                    aCtx.drawImage(headImgForAvatar, 0, 0, 48, hH, (40 - (48 * zoom)) / 2, (40 - (hH * zoom)) / 2 + (4 * zoom), 48 * zoom, hH * zoom);
                }, 10);
            }
            avatarDiv.appendChild(aCanvas);

            const textDiv = document.createElement('div');
            textDiv.style.flex = "1"; textDiv.style.display = "flex"; textDiv.style.flexDirection = "column";

            if (inboxData) {
                textDiv.style.overflow = "hidden";
                textDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: ${nameColor}; font-weight: bold; font-family: sans-serif; font-size: 15px;">${escapeHTML(playerData.username)} ${adminBadge}</span>
                        <span style="color: #777; font-family: sans-serif; font-size: 11px;">${formatPMTime(inboxData.time)}</span>
                    </div>
                    <span style="color: #aaa; font-family: sans-serif; font-size: 13px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(inboxData.lastMessage)}</span>
                `;
            } else {
                const statusHtml = playerData.isOnline ? `<span style="color: #2ecc71; font-size: 11px;">● Online</span>` : `<span style="color: #777; font-size: 11px;">○ Offline</span>`;
                textDiv.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <span style="color: ${nameColor}; font-weight: bold; font-family: sans-serif; font-size: 15px;">${escapeHTML(playerData.username)}</span>
                        ${adminBadge}
                    </div>
                    <div style="margin-top: 4px; font-family: sans-serif;">${statusHtml}</div>
                `;
            }

            row.appendChild(avatarDiv);
            row.appendChild(textDiv);
            row.addEventListener('click', onClickCallback);

            return row;
        }

        // 1. INBOX MINIMALISTA (OPTIMIZADO CON FRAGMENT)
        function renderInbox(inboxData) {
            inboxListContainer.innerHTML = "";
            if (inboxData.length === 0) {
                inboxListContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 14px; margin-top:20px;">No tienes mensajes activos.</div>';
                return;
            }

            // 📦 LA CAJA INVISIBLE
            const fragment = document.createDocumentFragment();

            inboxData.forEach(chat => {
                const pData = { username: chat.targetUser, targetHeadId: chat.targetHeadId, role: 'player' };
                const card = createPlayerCard(pData, () => openPMModal(chat.targetAccountId, chat.targetUser), chat);
                fragment.appendChild(card); // Meter a la caja invisible
            });

            // 💥 Pegar la caja de golpe a la pantalla
            inboxListContainer.appendChild(fragment);
        }

        // --- HELPERS PARA AVATARES (AHORA USA CABEZAS DINÁMICAS) ---
        function createAvatarCanvas(size = 36, targetAccountId = null) {
            const tCanvas = document.createElement('canvas');
            tCanvas.width = size;
            tCanvas.height = size;
            const tCtx = tCanvas.getContext('2d');
            tCtx.imageSmoothingEnabled = false;

            // 1. Buscar qué cabeza tiene equipada el jugador
            let headId = 'head_default';
            if (targetAccountId === player.accountId) {
                headId = player.equipped?.head || 'head_default';
            } else if (targetAccountId) {
                for (let id in otherPlayers) {
                    if (otherPlayers[id].accountId === targetAccountId) {
                        headId = otherPlayers[id].equipped?.head || 'head_default';
                        break;
                    }
                }
            }

            // 2. Cargar la imagen del catálogo
            const safeSprites = window.loadedItemSprites || {};
            const dHead = safeSprites[headId] || headImg;

            // 3. Dibujar la cabeza centrada
            if (dHead && dHead.complete && dHead.naturalWidth > 0) {
                const frameW = FRAME_WIDTH;
                const headFrameH = dHead.height / 4;
                const zoom = size / 30; // Escala dinámica según el tamaño de la burbuja

                const drawW = frameW * zoom;
                const drawH = headFrameH * zoom;

                tCtx.drawImage(
                    dHead,
                    0, 0, frameW, headFrameH, // Fila 0 (Mirando al frente)
                    (size - drawW) / 2,
                    (size - drawH) / 2 + (4 * zoom), // Bajarla un poquito para centrar la cara
                    drawW, drawH
                );
            }
            return tCanvas;
        }

        function formatPMTime(dateString) {
            if (!dateString) return "";
            const d = new Date(dateString);
            // Convierte la fecha del servidor en hora local (ej: "02:15 PM")
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // DIBUJAR LAS BURBUJAS (Con Avatar a un lado y Hora abajo)
        function renderPMHistory(history) {
            pmHistoryContainer.innerHTML = "";
            if (history.length === 0) {
                pmHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">No hay mensajes. ¡Di hola!</div>';
                return;
            }

            history.forEach(msg => {
                const isMe = (msg.senderId === player.accountId);

                // Contenedor invisible para acomodar la burbuja a la izquierda o derecha
                const row = document.createElement('div');
                row.style.width = "100%";
                row.style.display = "flex";
                row.style.justifyContent = isMe ? "flex-end" : "flex-start";
                row.style.alignItems = "flex-end"; // Alinea la burbuja y el avatar por la base
                row.style.gap = "8px";
                row.style.marginBottom = "8px";

                // --- 1. MINI AVATAR ---
                // 👇 EL FIX: Si soy yo, usa mi cabeza. Si es el otro, usa la cabeza que mandó el server.
                const headToUse = isMe ? (player.equipped?.head || 'head_default') : currentChatTargetHead;
                const avatar = createAvatarCanvas(28, msg.senderId, headToUse);
                avatar.style.borderRadius = "50%"; // Avatar circular para los chats
                avatar.style.background = "rgba(0,0,0,0.3)";
                avatar.style.flexShrink = "0";
                avatar.style.border = "1px solid rgba(255,255,255,0.1)";

                // --- 2. CONTENEDOR DE BURBUJA + HORA ---
                const bubbleGroup = document.createElement('div');
                bubbleGroup.style.display = "flex";
                bubbleGroup.style.flexDirection = "column";
                bubbleGroup.style.maxWidth = "75%"; // Limita el ancho del texto
                bubbleGroup.style.alignItems = isMe ? "flex-end" : "flex-start";

                const bubble = document.createElement('div');
                bubble.style.padding = "10px 14px";
                bubble.style.fontFamily = "sans-serif";
                bubble.style.fontSize = "14px";
                bubble.style.lineHeight = "1.4";
                bubble.style.wordBreak = "break-word";

                if (isMe) {
                    bubble.style.background = "#2ecc71";
                    bubble.style.color = "black";
                    bubble.style.borderRadius = "15px 15px 0 15px";
                } else {
                    bubble.style.background = "rgba(255,255,255,0.15)";
                    bubble.style.color = "white";
                    bubble.style.borderRadius = "15px 15px 15px 0";
                }
                bubble.innerText = msg.text;

                // Hora bajo la burbuja
                const timeSpan = document.createElement('span');
                timeSpan.style.fontSize = "10px";
                timeSpan.style.color = "#777";
                timeSpan.style.marginTop = "4px";
                timeSpan.style.fontFamily = "sans-serif";
                timeSpan.innerText = formatPMTime(msg.timestamp);

                bubbleGroup.appendChild(bubble);
                bubbleGroup.appendChild(timeSpan);

                // Ensamblar la fila: [Burbuja] + [Avatar] si eres tú, o [Avatar] + [Burbuja] si es el otro
                if (isMe) {
                    row.appendChild(bubbleGroup);
                    row.appendChild(avatar);
                } else {
                    row.appendChild(avatar);
                    row.appendChild(bubbleGroup);
                }

                pmHistoryContainer.appendChild(row);
            });

            pmHistoryContainer.scrollTop = pmHistoryContainer.scrollHeight;
        }

        // 🟢 FUNCIÓN MAESTRA DEL BOTÓN DE RADIO
        function updateSquadChatButton() {
            const btn = document.getElementById('island-squad-chat-btn');
            if (btn) {
                // Si player.squad tiene un ID (no es nulo ni vacío), muestra el botón. Si no, lo oculta.
                btn.style.display = (player.squad && player.squad !== "null") ? 'flex' : 'none';
            }
        }

        // ==========================================
        // 🟢 LÓGICA DEL SQUAD CHAT (RADIO, MENCIONES Y AVATARES)
        // ==========================================
        const islandSquadChatBtn = document.getElementById('island-squad-chat-btn');
        const squadNotifBadge = document.getElementById('squad-notif-badge');

        const squadChatModal = document.getElementById('squad-chat-modal');
        const closeSquadChatBtn = document.getElementById('close-squad-chat-btn');
        const sqChatHistoryContainer = document.getElementById('squad-chat-history-container');
        const sqChatInput = document.getElementById('sq-chat-input');
        const sqChatSendBtn = document.getElementById('sq-chat-send-btn');
        const sqChatHeaderLogo = document.getElementById('sq-chat-header-logo');
        const sqChatHeaderName = document.getElementById('sq-chat-header-name');
        const sqChatOnlineCount = document.getElementById('sq-chat-online-count');

        let unreadSquadMessages = 0;
        let squadMentionType = 'none'; // 🛑 NUEVO: Guarda si es personal, everyone, important o none

        // Función para contar jugadores del clan en vivo
        function updateSquadOnlineCount() {
            if (!player.squad) return;
            let count = 1; // Tú siempre estás conectado
            for (let id in otherPlayers) {
                if (otherPlayers[id].squad === player.squad) count++;
            }
            if (sqChatOnlineCount) sqChatOnlineCount.innerText = `${count} Online`;
        }

        // Construir Burbujas (Con Avatar y Menciones)
        function buildSquadChatBubble(msg) {
            const isMe = (msg.senderId === player.accountId);
            const senderColor = isMe ? "#f1c40f" : getColorForString(msg.senderName);

            const row = document.createElement('div');
            row.style.width = "100%";
            row.style.display = "flex";
            row.style.justifyContent = isMe ? "flex-end" : "flex-start";
            row.style.alignItems = "flex-end"; // Alinear por abajo como WhatsApp
            row.style.gap = "8px";
            row.style.marginBottom = "8px";

            // 1. DIBUJAR EL AVATAR DE QUIEN ENVÍA
            const avatarCanvas = document.createElement('canvas');
            avatarCanvas.width = 28; avatarCanvas.height = 28;
            avatarCanvas.style.borderRadius = "50%";
            avatarCanvas.style.background = "rgba(0,0,0,0.3)";
            avatarCanvas.style.border = "1px solid rgba(255,255,255,0.1)";
            avatarCanvas.style.flexShrink = "0";

            const aCtx = avatarCanvas.getContext('2d');
            aCtx.imageSmoothingEnabled = false;
            const headImg = window.loadedItemSprites[msg.senderHead] || window.headImg;

            if (headImg && headImg.complete) {
                const hH = headImg.height / 4;
                const zoom = 28 / 30; // Escalar al tamaño de la burbuja
                setTimeout(() => {
                    aCtx.imageSmoothingEnabled = false;
                    aCtx.drawImage(headImg, 0, 0, 48, hH, (28 - 48 * zoom) / 2, (28 - hH * zoom) / 2 + 4 * zoom, 48 * zoom, hH * zoom);
                }, 10);
            }

            // 2. PARSEAR MENCIONES (@Usuario, @everyone, @important)
            let safeText = escapeHTML(msg.text);

            // A) Resaltar Tags Globales (@everyone, @important) en color ROJO/NARANJA
            safeText = safeText.replace(/@(everyone|important)\b/gi, `<span style="background: rgba(231, 76, 60, 0.4); color: #ff7675; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #e74c3c; box-shadow: 0 0 5px rgba(231,76,60,0.5);">$&</span>`);

            // B) Resaltar mi nombre (@Lero) en color AMARILLO BRILLANTE
            const mentionRegex = new RegExp(`@${player.username}\\b`, 'gi');
            safeText = safeText.replace(mentionRegex, `<span style="background: rgba(241, 196, 15, 0.4); color: #f1c40f; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #f1c40f; box-shadow: 0 0 5px rgba(241,196,15,0.5);">$&</span>`);

            // Si encuentra tu nombre, lo resalta en amarillo brillante dentro del texto
            safeText = safeText.replace(mentionRegex, `<span style="background: rgba(241, 196, 15, 0.4); color: #f1c40f; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #f1c40f;">$&</span>`);

            // 3. ENSAMBLAR LA BURBUJA
            const bubbleGroup = document.createElement('div');
            bubbleGroup.style.display = "flex";
            bubbleGroup.style.flexDirection = "column";
            bubbleGroup.style.maxWidth = "75%";
            bubbleGroup.style.alignItems = isMe ? "flex-end" : "flex-start";

            const div = document.createElement('div');
            div.style.background = isMe ? "rgba(46, 204, 113, 0.15)" : "rgba(255,255,255,0.05)";
            div.style.borderLeft = `3px solid ${senderColor}`;
            div.style.padding = "8px 10px";
            div.style.borderRadius = isMe ? "10px 10px 0 10px" : "10px 10px 10px 0";
            div.style.fontFamily = "sans-serif";

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 10px;">
                    <span style="font-weight: bold; font-size: 11px; color: ${senderColor};">${escapeHTML(msg.senderName)}</span>
                </div>
                <div style="color: white; font-size: 13px; line-height: 1.3; word-wrap: break-word;">${safeText}</div>
            `;

            const timeSpan = document.createElement('span');
            timeSpan.style.fontSize = "9px";
            timeSpan.style.color = "#777";
            timeSpan.style.marginTop = "4px";
            timeSpan.style.fontFamily = "sans-serif";
            timeSpan.innerText = formatPMTime(msg.timestamp);

            bubbleGroup.appendChild(div);
            bubbleGroup.appendChild(timeSpan);

            // Si soy yo, avatar a la derecha. Si es otro, avatar a la izquierda.
            if (isMe) {
                row.appendChild(bubbleGroup);
                row.appendChild(avatarCanvas);
            } else {
                row.appendChild(avatarCanvas);
                row.appendChild(bubbleGroup);
            }
            return row;
        }

        // Abrir Chat
        const openSquadChat = (e) => {
            if (e) e.stopPropagation();
            if (!player.squad) return;

            wakeUpIsland(5000);

            unreadSquadMessages = 0;
            squadMentionType = 'none';
            squadNotifBadge.style.display = 'none';

            updateSquadOnlineCount(); // Calcular conectados

            sqChatHeaderName.innerText = player.squadName || "Mi Clan";
            if (player.squadLogo) {
                sqChatHeaderLogo.innerHTML = `<img src="${player.squadLogo}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }

            squadChatModal.style.display = 'flex';
            sqChatHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">Conectando a la frecuencia...</div>';

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'get_squad_chat' }));
            }

            setTimeout(() => sqChatInput.focus(), 100);
        };

        if (islandSquadChatBtn) {
            islandSquadChatBtn.addEventListener('mousedown', openSquadChat);
            islandSquadChatBtn.addEventListener('touchstart', openSquadChat, { passive: false });
        }

        if (closeSquadChatBtn) {
            closeSquadChatBtn.addEventListener('click', () => {
                squadChatModal.style.display = 'none';
            });
        }

        // Enviar Mensaje
        function executeSquadChatSend() {
            const txt = sqChatInput.value.trim();
            if (txt && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'send_squad_chat', text: txt }));
                sqChatInput.value = "";
            }
        }
        if (sqChatSendBtn) sqChatSendBtn.addEventListener('click', executeSquadChatSend);
        if (sqChatInput) sqChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSquadChatSend(); });

        // ==========================================
        // 🧠 MOTOR DE AUTOCOMPLETADO DE MENCIONES
        // ==========================================
        const sqMentionDropdown = document.getElementById('sq-mention-dropdown');

        // Vigilar cuando el usuario escribe en el chat
        if (sqChatInput) {
            sqChatInput.addEventListener('input', (e) => {
                const val = sqChatInput.value;
                const cursorStart = sqChatInput.selectionStart;

                // Cortar el texto hasta donde está el cursor y buscar si la última palabra empieza con @
                const textBeforeCursor = val.substring(0, cursorStart);
                const match = textBeforeCursor.match(/@(\w*)$/); // Busca @ seguido de cualquier letra

                if (match) {
                    const searchStr = match[1].toLowerCase();
                    showMentionDropdown(searchStr, match.index, cursorStart);
                } else {
                    sqMentionDropdown.style.display = 'none';
                }
            });

            // Si el jugador da clic fuera, ocultar el menú con un micro-retraso para permitir el clic
            sqChatInput.addEventListener('blur', () => {
                setTimeout(() => { sqMentionDropdown.style.display = 'none'; }, 200);
            });
        }

        // Construir y Mostrar la Lista Dinámica
        function showMentionDropdown(searchStr, startIndex, endIndex) {
            sqMentionDropdown.innerHTML = '';

            // 1. Tags Globales del Sistema
            let candidates = [
                { name: 'everyone', color: '#e74c3c', desc: 'Notifica a todos', icon: '📢' },
                { name: 'important', color: '#f39c12', desc: 'Aviso urgente', icon: '⚠️' }
            ];

            // 2. Jugadores del Clan Online (Escaneando tu mapa local)
            if (player.squad) {
                for (let id in otherPlayers) {
                    if (otherPlayers[id].squad === player.squad) {
                        candidates.push({
                            name: otherPlayers[id].username,
                            color: '#3498db',
                            desc: 'Online',
                            icon: '🟢'
                        });
                    }
                }
            }

            // 3. Filtrar según lo que escribió el usuario (ej: "@lu" muestra a "Luis")
            const filtered = candidates.filter(c => c.name.toLowerCase().includes(searchStr));

            if (filtered.length === 0) {
                sqMentionDropdown.style.display = 'none';
                return;
            }

            // 4. Dibujar la lista
            filtered.forEach(c => {
                const item = document.createElement('div');
                item.style.padding = "10px 15px";
                item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                item.style.display = "flex";
                item.style.justifyContent = "space-between";
                item.style.alignItems = "center";
                item.style.cursor = "pointer";
                item.style.fontFamily = "sans-serif";

                // Efecto Hover
                item.onmouseenter = () => item.style.background = "rgba(255,255,255,0.1)";
                item.onmouseleave = () => item.style.background = "transparent";

                item.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:14px;">${c.icon}</span>
                        <span style="color:white; font-weight:bold; font-size:14px;">@${c.name}</span>
                    </div>
                    <span style="color:#777; font-size:10px; font-weight:bold;">${c.desc}</span>
                `;

                // Acción al dar clic (Inyectar el nombre al input)
                item.onmousedown = (e) => {
                    e.preventDefault(); // Evita perder el foco
                    const val = sqChatInput.value;
                    const textBefore = val.substring(0, startIndex);
                    const textAfter = val.substring(endIndex);

                    // Ensamblar texto (Agregamos un espacio al final para seguir escribiendo)
                    sqChatInput.value = textBefore + '@' + c.name + ' ' + textAfter;
                    sqMentionDropdown.style.display = 'none';
                    sqChatInput.focus();
                };

                sqMentionDropdown.appendChild(item);
            });

            sqMentionDropdown.style.display = 'flex';
        }

        // --- INVENTORY & HOTBAR LOGIC ---
        const appInventory = document.getElementById('app-inventory');
        const inventoryModal = document.getElementById('inventory-modal');
        const closeInventory = document.getElementById('close-inventory');
        const inventoryGrid = document.getElementById('inventory-grid');

        const equipModal = document.getElementById('equip-modal');
        const closeEquipModal = document.getElementById('close-equip-modal');
        const equipSlotsContainer = document.getElementById('equip-slots-container');

        let equippingSlotIndex = 0; // Remembers which slot you are assigning an item to

        // 1. App Icon opens the Chooser Modal first!
        appInventory.addEventListener('click', () => {
            hideTrayForModal();
            renderEquipModal();
            equipModal.style.display = 'flex';
        });

        closeEquipModal.addEventListener('click', () => {
            equipModal.style.display = 'none';
            restoreTrayAfterModal();
        });
        closeInventory.addEventListener('click', () => {
            inventoryModal.style.display = 'none';
            restoreTrayAfterModal();
        });

        function renderEquipModal() {
            equipSlotsContainer.innerHTML = "";
            for (let i = 0; i < 3; i++) {
                const slot = document.createElement('div');
                slot.style.width = "75px";  // 🔥 CAJA MÁS GRANDE
                slot.style.height = "75px"; // 🔥 CAJA MÁS GRANDE
                slot.style.background = "rgba(0,0,0,0.3)";
                slot.style.border = "2px solid rgba(255,255,255,0.3)";
                slot.style.borderRadius = "12px";
                slot.style.display = "flex";
                slot.style.justifyContent = "center";
                slot.style.alignItems = "center";
                slot.style.cursor = "pointer";

                // Show what is currently in that slot (DINÁMICO)
                const currentSlotItem = player.hotbar[i];
                if (currentSlotItem && currentSlotItem !== "none") {
                    const iconElement = getWeaponIcon(currentSlotItem);
                    if (iconElement) {
                        iconElement.style.width = "100%"; // 🔥 LLENAR LA CAJA
                        iconElement.style.transform = "scale(1.3)"; // 🔥 APLICAR SUPER ZOOM
                        slot.appendChild(iconElement);
                    }
                } else {
                    slot.innerText = "🔫";
                    slot.style.fontSize = "35px"; // Emoji más grande si está vacío
                }

                // Click a slot -> Open the full backpack to fill it!
                slot.onclick = () => {
                    equippingSlotIndex = i; // Remember the slot!
                    equipModal.style.display = 'none';
                    renderInventory();
                    inventoryModal.style.display = 'flex';
                };
                equipSlotsContainer.appendChild(slot);
            }
        }

        // --- CREADOR DE ÍCONOS DINÁMICO (CUADRADO PERFECTO 64x64) ---
        function getWeaponIcon(itemId) {
            const stats = weaponsDB[itemId] || WEAPONS[itemId];
            if (!stats) return null;

            const wSprite = loadedWeaponSprites[itemId];

            if (wSprite && wSprite.complete && wSprite.naturalWidth > 0) {
                const tCanvas = document.createElement('canvas');

                const frameW = 48;
                const frameH = 64;

                // 🛑 EL FIX: Hacemos el lienzo CUADRADO y más grande (64x64)
                // Esto nos da espacio libre ("padding") para mover la imagen 
                // sin cortarle la punta a la espada o a la pistola.
                tCanvas.width = 64;
                tCanvas.height = 64;

                tCanvas.style.width = "100%";
                tCanvas.style.height = "100%";
                tCanvas.style.objectFit = "contain";
                tCanvas.style.imageRendering = "pixelated";

                const tCtx = tCanvas.getContext('2d');

                let srcX = 0;
                let srcY = 0;
                let destX = 0;
                let destY = 0;

                if (stats.type === 'ranged') {
                    // 🔫 AJUSTES PARA PISTOLAS / ESCOPETAS
                    srcY = frameH; // Fila 2 de tu PNG
                    destX = 15;    // Empuja a la derecha
                    destY = -2;    // Empuja hacia arriba
                } else {
                    // 🗡️ AJUSTES PARA CUERPO A CUERPO (Melee)
                    srcY = 0;      // Fila 1 de tu PNG
                    destX = 8;    // 👉 Empuja a la derecha (Cámbialo si le falta más)
                    destY = -8;   // 👆 Empuja hacia arriba (Cámbialo si le falta más)
                }

                setTimeout(() => {
                    tCtx.imageSmoothingEnabled = false;
                    // Dibujamos el recorte original de 48x64 dentro de la nueva caja de 64x64
                    tCtx.drawImage(wSprite, srcX, srcY, frameW, frameH, destX, destY, frameW, frameH);
                }, 0);

                return tCanvas;
            } else {
                const div = document.createElement('div');
                div.style.width = "100%"; div.style.height = "100%";
                div.style.display = "flex"; div.style.justifyContent = "center"; div.style.alignItems = "center";
                div.style.color = stats.color || "white";
                div.style.fontWeight = "900"; div.style.fontSize = "14px"; div.style.textShadow = "1px 1px 2px black";
                div.innerText = stats.name.substring(0, 3).toUpperCase();
                return div;
            }
        }
        function renderInventory() {
            inventoryGrid.innerHTML = "";

            // --- THE "EMPTY" TOOL ---
            const noneSlot = document.createElement('div');
            noneSlot.style.width = "100%"; noneSlot.style.aspectRatio = "1/1";
            noneSlot.style.background = "rgba(255, 107, 107, 0.15)";
            noneSlot.style.border = "1px dashed rgba(255, 255, 255, 0.3)";
            noneSlot.style.borderRadius = "8px"; noneSlot.style.display = "flex";
            noneSlot.style.justifyContent = "center"; noneSlot.style.alignItems = "center";
            noneSlot.style.cursor = "pointer";
            noneSlot.innerHTML = "<span style='font-size: 9px; font-weight: bold; opacity: 0.7; color: #ff6b6b;'>EMPTY</span>";

            noneSlot.onclick = () => {
                const previousWeapon = player.equippedWeapon;

                // 💾 GUARDAR ESTADO AL VACIAR LAS MANOS
                if (previousWeapon !== "none" && WEAPONS[previousWeapon] && WEAPONS[previousWeapon].type === 'ranged') {
                    player.weaponAmmo[previousWeapon] = player.ammo;
                }

                player.hotbar[equippingSlotIndex] = "none";

                if (player.activeSlot === equippingSlotIndex) {
                    player.equippedWeapon = "none";
                    playItemSound(previousWeapon, 'equip', 0.5);
                }

                renderHudHotbar();
                inventoryModal.style.display = 'none';

                if (ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'update_hotbar', slotIndex: equippingSlotIndex, weaponId: "none" }));
            };
            inventoryGrid.appendChild(noneSlot);

            // --- DRAW YOUR ACTUAL ITEMS ---
            const safeInventory = player.inventory || [];

            for (let i = 0; i < 11; i++) {
                const slot = document.createElement('div');
                slot.style.width = "100%"; slot.style.aspectRatio = "1/1";
                slot.style.background = "rgba(0,0,0,0.26)"; slot.style.border = "1px solid rgba(255,255,255,0.1)";
                slot.style.borderRadius = "8px"; slot.style.display = "flex";
                slot.style.justifyContent = "center"; slot.style.alignItems = "center"; slot.style.cursor = "pointer";
                slot.style.position = "relative";

                const rawItem = safeInventory[i];

                if (rawItem) {
                    const itemId = (typeof rawItem === 'object') ? rawItem.id : rawItem;
                    const qty = (typeof rawItem === 'object') ? (rawItem.quantity || 1) : 1;

                    if (itemId && itemId !== "none") {
                        // 1. EL TRUCO MAESTRO: Un solo canvas de tamaño fijo (48x64) para TODOS los items
                        const canvas = document.createElement('canvas');
                        canvas.width = 48;  // Ancho estándar
                        canvas.height = 64; // Alto estándar (Formato de arma)
                        canvas.style.width = "auto";
                        canvas.style.height = "85%"; // Margen para que respire dentro del slot
                        canvas.style.objectFit = "contain";
                        canvas.style.imageRendering = "pixelated";
                        // 👇 EL NUEVO SCALE: Para que se vea igual de grande que en el HUD 👇
                        canvas.style.transform = "scale(1.45)";
                        const ctx = canvas.getContext('2d');
                        const isWeapon = weaponsDB[itemId];
                        const catalogItem = window.MASTER_CATALOG[itemId];
                        const img = isWeapon ? loadedWeaponSprites[itemId] : window.loadedItemSprites[itemId];

                        if (img && img.complete) {
                            setTimeout(() => {
                                ctx.imageSmoothingEnabled = false;

                                if (isWeapon) {
                                    // LÓGICA ARMAS: Ocupan todo el canvas de 48x64
                                    const frameH = img.height / 6; // 64
                                    let srcY = 0;
                                    let destX = 0;
                                    let destY = -6;

                                    // Si es pistola (ranged), cambiamos la fila y aplicamos el empuje
                                    if (isWeapon.type === 'ranged') {
                                        srcY = frameH;
                                        destX = 8;  // Empuja a la derecha
                                        destY = -18;  // Sube el arma
                                    }

                                    // Dibujamos usando las variables dinámicas
                                    ctx.drawImage(img, 0, srcY, 48, 64, destX, destY, 48, 64);
                                }
                                else if (catalogItem) {
                                    // LÓGICA ITEMS (Basura/Metales): Miden 16x16. 
                                    // Los dibujamos exactamente en el centro del canvas de 48x64.
                                    const sx = catalogItem.drawConfig?.sx ?? catalogItem.sx ?? 0;
                                    const sy = catalogItem.drawConfig?.sy ?? catalogItem.sy ?? 0;

                                    // (48-16)/2 = 16 de margen X. (64-16)/2 = 24 de margen Y.
                                    ctx.drawImage(img, sx, sy, 16, 16, 16, 24, 16, 16);
                                }
                            }, 0);
                        }
                        slot.appendChild(canvas);

                        // 3. ETIQUETA DE CANTIDAD (Sin cambios, funciona perfecto)
                        if (qty > 1) {
                            const badge = document.createElement('div');
                            badge.style.position = 'absolute'; badge.style.bottom = '2px'; badge.style.right = '2px';
                            badge.style.background = 'rgba(0,0,0,0.8)'; badge.style.color = 'white';
                            badge.style.fontSize = '10px'; badge.style.padding = '2px 4px';
                            badge.style.borderRadius = '4px'; badge.style.fontWeight = 'bold';
                            badge.innerText = `x${qty}`;
                            slot.appendChild(badge);
                        }

                        // 4. ABRIR INSPECTOR
                        slot.onclick = () => {
                            openItemInspector(itemId, qty);
                        };
                    }
                }
                inventoryGrid.appendChild(slot);
            }
        }
        // =========================================================
        // 🔍 SISTEMA DE INSPECCIÓN DE OBJETOS
        // =========================================================

        function openItemInspector(itemId, quantity) {
            currentInspectingItemId = itemId;
            const modal = document.getElementById('item-detail-modal');
            const title = document.getElementById('item-detail-name');
            const qtyTxt = document.getElementById('item-detail-qty');
            const statsBox = document.getElementById('item-detail-stats');
            const btnEquip = document.getElementById('btn-equip-item');
            const canvas = document.getElementById('item-detail-canvas');
            const ctx = canvas.getContext('2d');

            // 🛑 EL FIX: LIMPIEZA INICIAL DE SEGURIDAD
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            title.innerText = "Cargando..."; // Reset de texto
            statsBox.innerHTML = "";        // Reset de stats
            btnEquip.style.display = 'none'; // Esconder botón por seguridad
            btnEquip.disabled = false;
            btnEquip.style.background = "#27ae60";

            // Solo muestra el multiplicador
            qtyTxt.innerText = `x${quantity}`;

            // 🛑 EL FIX: Ajuste de posición para armas a distancia en el Inspector
            if (weaponsDB[itemId]) {
                const w = weaponsDB[itemId];
                title.innerText = w.name;
                title.style.color = '#e74c3c';

                let typeIcon = w.type === 'ranged' ? 'Ranged' : 'Melee';

                // Inyectamos las píldoras (Badges) con flexbox para que se acomoden solas
                statsBox.innerHTML = `
                    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
                        <div style="background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); color: #aaa; font-size: 12px;">
                            <b>${typeIcon}</b>
                        </div>
                        <div style="background: rgba(231, 76, 60, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(231, 76, 60, 0.3); color: #e74c3c; font-size: 12px;">
                            <b>${w.damage || 0} DMG</b>
                        </div>
                        <div style="background: rgba(241, 196, 15, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(241, 196, 15, 0.3); color: #f39c12; font-size: 12px;">
                            <b>${w.speed || w.fireRate} SPD</b>
                        </div>
                    </div>
                `;

                // (Este es tu código actual)
                btnEquip.style.display = 'block';
                btnEquip.innerText = (player.equippedWeapon === itemId) ? "Equipada" : "Equipar";
                if (player.equippedWeapon === itemId) btnEquip.disabled = true;

                // 👇 PEGA ESTE BLOQUE NUEVO JUSTO AQUÍ 👇
                const btnQuickSwap = document.getElementById('btn-quickswap-item');
                if (btnQuickSwap) {
                    btnQuickSwap.style.display = 'block';
                    if (player.quickSwaps && player.quickSwaps.includes(itemId)) {
                        btnQuickSwap.innerText = "En Hotkey";
                        btnQuickSwap.style.background = "#7f8c8d";
                        btnQuickSwap.style.boxShadow = "0 4px 0 #34495e";
                    } else {
                        btnQuickSwap.innerText = "Hotkey";
                        btnQuickSwap.style.background = "#9b59b6";
                        btnQuickSwap.style.boxShadow = "0 4px 0 #8e44ad";
                    }
                }
                // 👆 HASTA AQUÍ 👆

                if (loadedWeaponSprites[itemId]) {
                    const ws = loadedWeaponSprites[itemId];
                    const frameW = 48;
                    const frameH = 64;

                    let srcY = 0;
                    let destX = 0;
                    let destY = 0;

                    // Si es una pistola, aplicamos el empuje proporcional al zoom del modal
                    if (w.type === 'ranged') {
                        srcY = frameH; // Segunda fila
                        destX = 16;    // Empuja a la derecha (Doble del inventario)
                        destY = -8;   // Sube la imagen (Doble del inventario)
                    }

                    // Mantenemos la resolución alta para que se vea nítido
                    canvas.width = frameW * 2;
                    canvas.height = frameH * 2;

                    canvas.style.width = "auto";
                    canvas.style.height = "96px";
                    canvas.style.objectFit = "contain";

                    setTimeout(() => {
                        ctx.imageSmoothingEnabled = false;
                        // Dibujamos usando destX y destY para centrar
                        ctx.drawImage(ws, 0, srcY, frameW, frameH, destX, destY, canvas.width, canvas.height);
                    }, 0);
                }
            }
            // 📦 INSPECTOR UNIVERSAL PARA CUALQUIER OTRO OBJETO
            else if (window.MASTER_CATALOG[itemId]) {
                const btnQuickSwap = document.getElementById('btn-quickswap-item');
                if (btnQuickSwap) btnQuickSwap.style.display = 'none';

                // 🛑 EL FIX: Sacar el item del catálogo antes de intentar leer su nombre
                const item = window.MASTER_CATALOG[itemId];

                title.innerText = item.name;
                title.style.color = '#00d2d3'; // Color genérico brillante

                // Texto dinámico de ambientación según la categoría
                let loreText = "Un objeto misterioso de este mundo.";
                if (item.category === 'junk') loreText = "Material de desecho recolectado en el mapa.";
                if (item.category === 'metal') loreText = "Mineral valioso extraído del subsuelo.";
                if (item.category === 'food') loreText = "Parece comestible. Recupera salud.";

                const itemValue = item.value || item.price || 0;

                statsBox.innerHTML = `
                    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
                        <div style="background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); color: #f39c12; font-size: 12px; text-transform: uppercase;">
                            <b>${item.category}</b>
                        </div>
                        <div style="background: rgba(46, 204, 113, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(46, 204, 113, 0.3); color: #2ecc71; font-size: 12px;">
                            Value: <b>${itemValue} 🪙</b>
                        </div>
                    </div>
                    <div style="color:#95a5a6; font-size: 11px; font-style: italic; line-height: 1.3;">"${loreText}"</div>
                `;

                const img = window.loadedItemSprites[itemId];
                if (img && img.complete) {
                    canvas.width = 64;
                    canvas.height = 64;
                    canvas.style.width = "auto";
                    canvas.style.height = "96px";
                    canvas.style.objectFit = "contain";

                    const sx = item.drawConfig?.sx ?? item.sx ?? 0;
                    const sy = item.drawConfig?.sy ?? item.sy ?? 0;

                    setTimeout(() => {
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(img, sx, sy, 16, 16, 0, 0, 64, 64);
                    }, 0);
                }
            } else {
                // 👇 PEGA ESTA LÍNEA AQUÍ 👇
                const btnQuickSwap = document.getElementById('btn-quickswap-item');
                if (btnQuickSwap) btnQuickSwap.style.display = 'none';
                // Si no es ninguna de las dos
                title.innerText = "Objeto Desconocido";
                statsBox.innerHTML = `<div style="color:orange;">ID: ${itemId}<br>No se encontró en la base de datos local.</div>`;
            }

            modal.style.display = 'flex';
        }
        // Eventos de los Botones del Inspector
        document.getElementById('btn-close-item-detail').onclick = () => {
            document.getElementById('item-detail-modal').style.display = 'none';
        };

        // --- EL BOTÓN VERDE DEL INSPECTOR AHORA SE CONECTA A TU HOTBAR ---
        document.getElementById('btn-equip-item').onclick = () => {
            if (ws.readyState === WebSocket.OPEN && currentInspectingItemId) {

                // 1. Asignar el arma a tu Hotbar activo
                player.hotbar[equippingSlotIndex] = currentInspectingItemId;
                if (player.activeSlot === equippingSlotIndex) player.equippedWeapon = currentInspectingItemId;

                // 2. Actualizar la interfaz (El HUD de abajo)
                renderHudHotbar();

                // 3. Avisar al servidor del cambio
                ws.send(MessagePack.encode({
                    type: 'update_hotbar',
                    slotIndex: equippingSlotIndex,
                    weaponId: currentInspectingItemId
                }));

                // 4. Cerrar ambos menús (El inspector flotante y la cuadrícula grande)
                document.getElementById('item-detail-modal').style.display = 'none';
                inventoryModal.style.display = 'none';
            }
        };

        function renderHudHotbar() {
            for (let i = 0; i < 3; i++) {
                const slot = document.getElementById('hud-slot-' + i);
                slot.innerHTML = "";

                // --- THE FIX: Only glow if Active AND a weapon is equipped ---
                if (player.activeSlot === i && player.equippedWeapon !== "none") {
                    slot.style.border = "2px solid #f1c40f";
                    slot.style.boxShadow = "0 0 15px rgba(241, 196, 15, 0.6)";
                } else {
                    slot.style.border = "2px solid rgba(255, 255, 255, 0.2)";
                    slot.style.boxShadow = "none";
                }

                // --- HUD DINÁMICO ---
                const hudItem = player.hotbar[i];
                if (hudItem && hudItem !== "none") {
                    const iconElement = getWeaponIcon(hudItem);
                    if (iconElement) {
                        iconElement.style.transform = "scale(1.3)"; // 🔥 Súper Zoom del 150%
                        iconElement.style.opacity = (player.activeSlot === i && player.equippedWeapon === "none") ? "0.3" : "1";
                        slot.appendChild(iconElement);
                    }
                }

                // 👇 LA MAGIA MULTI-TOUCH 👇
                slot.onpointerdown = (e) => {
                    if (e) e.preventDefault(); // Evita que el navegador cancele el toque

                    const qsMenu = document.getElementById('quickswap-menu');
                    if (qsMenu && qsMenu.style.display !== 'none') {
                        qsMenu.style.display = 'none';
                    }

                    // 🔊 Memorize what we are holding BEFORE we change it
                    const previousWeapon = player.equippedWeapon;

                    // 💾 GUARDAR EL ESTADO DE LAS BALAS ANTES DE GUARDAR EL ARMA
                    if (previousWeapon !== "none" && WEAPONS[previousWeapon] && WEAPONS[previousWeapon].type === 'ranged') {
                        player.weaponAmmo[previousWeapon] = player.ammo;
                    }

                    if (player.activeSlot === i) {
                        player.equippedWeapon = (player.equippedWeapon === "none") ? player.hotbar[i] : "none";
                    } else {
                        player.activeSlot = i;
                        player.equippedWeapon = player.hotbar[i] || "none";
                    }

                    const soundToPlay = player.equippedWeapon !== "none" ? player.equippedWeapon : previousWeapon;
                    playItemSound(soundToPlay, 'equip', 0.5);

                    if (player.reloadTimeout) clearTimeout(player.reloadTimeout);

                    const stats = WEAPONS[player.equippedWeapon];
                    if (stats) {
                        if (stats.type === 'melee') {
                            player.ammo = Infinity;
                            player.isReloading = false;
                        } else {
                            // 💾 CARGAR EL ESTADO DE LAS BALAS (Si es un arma nueva, viene llena)
                            if (player.weaponAmmo[player.equippedWeapon] === undefined) {
                                player.weaponAmmo[player.equippedWeapon] = stats.magSize;
                            }
                            player.ammo = player.weaponAmmo[player.equippedWeapon];

                            // Solo recargamos si el arma se guardó vacía
                            if (player.ammo <= 0) {
                                player.isReloading = true;
                                playItemSound(player.equippedWeapon, 'reload', 0.6);
                                player.reloadTimeout = setTimeout(() => {
                                    player.ammo = stats.magSize;
                                    if (ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                                    player.weaponAmmo[player.equippedWeapon] = stats.magSize; // 💾 Sincronizar memoria
                                    player.isReloading = false;
                                }, stats.reloadTime);
                            } else {
                                player.isReloading = false; // ¡Lista para disparar al instante!
                            }
                        }
                    } else {
                        player.ammo = 0;
                        player.isReloading = false;
                    }

                    renderHudHotbar();

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(MessagePack.encode({ type: 'equip_weapon', weaponId: player.equippedWeapon }));
                    }
                };
            }
        }

        // Render it once when the game loads
        setTimeout(renderHudHotbar, 500); // Slight delay ensures images load first

        // --- SHOP MODAL LOGIC ---
        const shopModal = document.getElementById('shop-modal');
        const closeShopModal = document.getElementById('close-shop-modal'); // <--- ¡ESTA ES LA QUE FALTABA!
        const buyItemBtn = document.getElementById('buy-item-btn');

        let isShopOpen = false;
        let currentShopItemId = null;
        let lastShopTile = null;

        // --- NUEVO: CONTROL DEL GIRADOR (SPINNER) ---
        let shopPreviewRotationInterval = null; // Guardará el timer del giro
        let shopPreviewFacingRow = 0; // Guardará hacia dónde mira (0=Down, 1=Left, 2=Right, 3=Up)

        // =========================================================================
        // --- 🛍️ VISUALIZADOR UNIVERSAL DE TIENDA (CORRECCIÓN DE POSTURAS) ---
        // =========================================================================

        let shopShotTimer = null;
        let lastShopShotTime = 0;
        let shopAnimFrame = 0;

        function drawShopPlayerPreview() {
            if (!isShopOpen) return;

            if (!uiShopPreviewCanvas) return;
            const pCtx = uiShopPreviewCanvas.getContext('2d');
            pCtx.imageSmoothingEnabled = false;
            pCtx.clearRect(0, 0, uiShopPreviewCanvas.width, uiShopPreviewCanvas.height);

            const centerX = uiShopPreviewCanvas.width / 2;
            const centerY = uiShopPreviewCanvas.height / 2 + 30;
            const previewZoom = 3;
            let dir = shopPreviewFacingRow;

            // 1. 🔍 DETECCIÓN INTELIGENTE DEL TIPO DE OBJETO
            const catalogData = window.MASTER_CATALOG ? window.MASTER_CATALOG[currentShopItemId] : null;
            const weaponData = weaponsDB[currentShopItemId] || WEAPONS[currentShopItemId];
            const itemData = weaponData || catalogData || {};

            // ¿Es estrictamente un arma o es ropa cosmética?
            const category = itemData.category || (weaponData ? 'weapon' : 'unknown');
            const isWeapon = (category === 'weapon' || weaponData !== undefined);
            const isClothing = !isWeapon;

            // 2. LÓGICA DE ESTADO: Correr armado (4) vs Caminar normal (8)
            const stateKey = isWeapon ? "walk_armed" : "walk_unarmed";
            const baseRow = SKELETON_DATA.states[stateKey] !== undefined ? SKELETON_DATA.states[stateKey] : (isWeapon ? 4 : 8);
            const maxFrames = isWeapon ? 6 : 8;

            // Avanzamos el frame de animación de las piernas
            shopAnimFrame = (shopAnimFrame + 0.1) % maxFrames;
            const frameX = Math.floor(shopAnimFrame);

            // 3. VESTIR AL MANIQUÍ
            const eq = player.equipped || { head: 'head_default', body: 'body_default', hat: 'none' };
            const safeSprites = window.loadedItemSprites || {};

            const previewBodyId = (category === 'body') ? currentShopItemId : eq.body;
            const previewHeadId = (category === 'head') ? currentShopItemId : eq.head;
            const previewHatId = (category === 'hat') ? currentShopItemId : eq.hat;

            const dynBody = safeSprites[previewBodyId] || window.bodyImg;
            const dynHead = safeSprites[previewHeadId] || window.headImg;
            const dynHat = safeSprites[previewHatId];

            const bW = FRAME_WIDTH;
            const bH = FRAME_HEIGHT;
            const offsetX = centerX - ((bW / 2) * previewZoom);
            const offsetY = centerY - ((bH / 2) * previewZoom);

            // 4. ANCLAS EXACTAS (Sincronizado con Gani Editor)
            const fKey = `${stateKey}_${dir}_${frameX}`;
            const rawAnchors = SKELETON_DATA.anchors[fKey] || {};
            const headAnc = rawAnchors.head || [0, 0];
            const handAnc = rawAnchors.handR || [12, 12];

            const handX = centerX + (handAnc[0] * previewZoom);
            const handY = centerY + (handAnc[1] * previewZoom);

            // EL WOBBLE (BAMBOLEO): Solo se activa si estamos vendiendo ropa
            const WOBBLE_PATTERN = [0, 1, 0, -1, 0, 1, 0, -1];
            const wobbleY = isClothing ? (WOBBLE_PATTERN[frameX % 8] || 0) : 0;

            const headX = offsetX + (headAnc[0] * previewZoom);
            const headY = offsetY + ((headAnc[1] + wobbleY) * previewZoom);

            // 5. DIBUJAR CAPAS (Z-INDEX BÁSICO)

            // A. DIBUJAR CUERPO (Este sí usa frameX para mover las piernas por la hoja de sprites)
            if (dynBody && dynBody.complete && dynBody.naturalWidth > 0) {
                pCtx.drawImage(dynBody, frameX * bW, (baseRow + dir) * bH, bW, bH, offsetX, offsetY, bW * previewZoom, bH * previewZoom);
            }

            // B. DIBUJAR CABEZA (Siempre columna 0)
            if (dynHead && dynHead.complete && dynHead.naturalWidth > 0) {
                const headFrameH = dynHead.height / 4;
                pCtx.drawImage(dynHead, 0, dir * headFrameH, bW, headFrameH, headX, headY, bW * previewZoom, headFrameH * previewZoom);
            }

            // C. DIBUJAR SOMBRERO (Siempre columna 0)
            if (dynHat && dynHat.complete && dynHat.naturalWidth > 0) {
                const hatFrameH = dynHat.height / 4;
                pCtx.drawImage(dynHat, 0, dir * hatFrameH, bW, hatFrameH, headX, headY, bW * previewZoom, hatFrameH * previewZoom);
            }

            // 6. 🔫 LÓGICA EXCLUSIVA SI SE ESTÁ VENDIENDO UN ARMA
            if (isWeapon) {
                const wData = weaponData || {};
                const wSprite = loadedWeaponSprites[currentShopItemId];

                // Disparo Automático
                const now = Date.now();
                if (now - lastShopShotTime > 1500) {
                    lastShopShotTime = now;
                    shopShotTimer = { x: 0, y: 0, alpha: 1.0 };
                }

                if (wSprite && wSprite.complete && dir !== 3) {
                    const gW = 48; // FIJO: Ya no dividimos entre 8
                    const gH = 64; // FIJO: Ya no dividimos entre 6
                    const d = wData.dirStats ? (wData.dirStats[dir] || wData.dirStats[0] || {}) : {};

                    let aimAngle = 0; let dirM = 1;
                    if (wData.type !== 'ranged') {
                        if (dir === 0) aimAngle = Math.PI / 2;
                        else if (dir === 1) { aimAngle = Math.PI; dirM = -1; }
                        else if (dir === 3) { aimAngle = -Math.PI / 2; dirM = -1; }
                    }

                    const totalWeaponRot = aimAngle + ((d.wRot || 0) * dirM * Math.PI / 180);
                    const pivotX = (wData.pivotX || 0) * previewZoom;
                    const pivotY = (wData.pivotY || 0) * previewZoom;

                    let srcY = dir * gH; // Ahora lee directamente la fila correcta para todo

                    // Dibujar Arma
                    pCtx.save();
                    pCtx.translate(handX + ((d.wX || 0) * previewZoom), handY + ((d.wY || 0) * previewZoom));
                    pCtx.rotate(totalWeaponRot);
                    pCtx.drawImage(wSprite, 0, srcY, gW, gH, -pivotX - ((gW * previewZoom) / 2), -pivotY - ((gH * previewZoom) / 2), gW * previewZoom, gH * previewZoom);
                    pCtx.restore();

                    // Dibujar Mano sobre el arma
                    if (dynBody && dynBody.complete) {
                        pCtx.save();
                        pCtx.translate(handX + ((d.wX || 0) * previewZoom), handY + ((d.wY || 0) * previewZoom));
                        pCtx.rotate(totalWeaponRot);
                        pCtx.translate(((d.hX || 0) * previewZoom), ((d.hY || 0) * previewZoom));
                        pCtx.rotate((d.hRot || 0) * Math.PI / 180);
                        pCtx.drawImage(dynBody, (d.tX !== undefined ? d.tX : 13) * 16, (d.tY || 0) * 16, 16, 16, -(16 * previewZoom) / 2, -(16 * previewZoom) / 2, 16 * previewZoom, 16 * previewZoom);
                        pCtx.restore();
                    }

                    // Dibujar Bala Visual
                    if (shopShotTimer && wData.type === 'ranged') {
                        const mX = d.hitX || 0; const mY = d.hitY || 0;
                        const bX = centerX + (mX * previewZoom);
                        const bY = centerY + (mY * previewZoom) - (5 * previewZoom);

                        pCtx.fillStyle = wData.color || `rgba(241, 196, 15, ${shopShotTimer.alpha})`;
                        pCtx.shadowBlur = 10; pCtx.shadowColor = wData.color || "#f1c40f";

                        const bVel = 8; const bSize = 6;
                        if (dir === 0) { shopShotTimer.y += bVel; pCtx.fillRect(bX - bSize / 2, bY + shopShotTimer.y, bSize, bSize * 2); }
                        else if (dir === 1) { shopShotTimer.x -= bVel; pCtx.fillRect(bX + shopShotTimer.x - bSize * 2, bY - bSize / 2, bSize * 2, bSize); }
                        else if (dir === 2) { shopShotTimer.x += bVel; pCtx.fillRect(bX + shopShotTimer.x, bY - bSize / 2, bSize * 2, bSize); }

                        pCtx.shadowBlur = 0;
                        shopShotTimer.alpha -= 0.05;
                        if (shopShotTimer.alpha <= 0) shopShotTimer = null;
                    }
                }
            }
        }

        // =========================================================================
        // --- 🤖 MOTOR MVVM: TRANSFORMADOR DE ESTADÍSTICAS PARA LA TIENDA ---
        // =========================================================================
        function buildItemViewModel(itemId) {
            const rawData = WEAPONS[itemId] || window.MASTER_CATALOG[itemId];
            if (!rawData) return null;

            const viewModel = {
                name: rawData.name || "Objeto Desconocido",
                price: rawData.price || 0,
                uiStats: [] // Aquí se guardará la lista procesada para el Modal
            };

            // 🛑 EL FIX: Quitamos el "Alcance" para ahorrar espacio
            const rules = {
                damage: { label: "Daño", icon: "⚔️", suffix: "" },
                fireRate: { label: "Cadencia", icon: "⚡", suffix: "ms" },
                magSize: { label: "Cargador", icon: "🔋", suffix: " bls" },
                reloadTime: { label: "Recarga", icon: "🔄", suffix: "ms" }
            };

            // LÓGICA RETROCOMPATIBLE: 
            // Busca adentro de .stats (nueva BD) o directamente en la raíz (vieja BD)
            const statsSource = rawData.stats ? rawData.stats : rawData;

            for (const [key, rule] of Object.entries(rules)) {
                if (statsSource[key] !== undefined) {
                    viewModel.uiStats.push({
                        icon: rule.icon,
                        label: rule.label,
                        value: `${statsSource[key]}${rule.suffix}`
                    });
                }
            }

            return viewModel;
        }

        function openShopModal(itemId) {
            // 1. Usamos nuestro transformador mágico
            const viewData = buildItemViewModel(itemId);
            if (!viewData) return;

            currentShopItemId = itemId;
            const shopItemIsClothing = window.MASTER_CATALOG && window.MASTER_CATALOG[itemId];

            // 2. Llenar los datos básicos
            document.getElementById('shop-item-name').innerText = viewData.name;

            // 3. 🛑 EL FIX: RENDERIZADO DINÁMICO VERTICAL
            const statsContainer = document.getElementById('shop-item-stats-container');
            statsContainer.innerHTML = "";

            if (viewData.uiStats.length > 0) {
                statsContainer.style.display = 'flex'; // Activamos el CSS Flexbox vertical del HTML

                viewData.uiStats.forEach(stat => {
                    // Genera una "mini tarjeta horizontal" por cada estadística
                    statsContainer.innerHTML += `
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
                            <span style="color: #aaa; font-size: 11px; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">${stat.icon} ${stat.label}</span> 
                            <span style="color: white; font-weight: bold; font-size: 14px;">${stat.value}</span>
                        </div>
                    `;
                });
            } else {
                statsContainer.style.display = 'none'; // Ocultar la caja si es ropa cosmética
            }

            // 4. Gestionar el Ícono Agrandado
            const iconContainer = document.getElementById('shop-icon-container');
            iconContainer.innerHTML = "";

            let iconElement;
            if (!shopItemIsClothing) {
                iconElement = getWeaponIcon(itemId);
            } else {
                iconElement = document.createElement('canvas');
                iconElement.width = 48; iconElement.height = 64;
                iconElement.style.width = "auto"; iconElement.style.height = "80%";
                iconElement.style.objectFit = "contain";
                iconElement.style.imageRendering = "pixelated";

                const img = window.loadedItemSprites[itemId];
                if (img && img.complete) {
                    const rawData = window.MASTER_CATALOG[itemId];
                    const h = rawData.category === 'hat' ? img.height / 4 : 64;
                    setTimeout(() => {
                        iconElement.getContext('2d').imageSmoothingEnabled = false;
                        iconElement.getContext('2d').drawImage(img, 0, 0, 48, h, 0, 0, 48, h);
                    }, 10);
                }
            }

            if (iconElement) {
                iconElement.style.width = "100%";
                iconElement.style.height = "100%";
                iconElement.style.transform = "scale(1.5)";
                iconElement.style.filter = "drop-shadow(0px 5px 5px rgba(0,0,0,0.5))"; // Sombra 3D
                iconContainer.appendChild(iconElement);
            }

            // 5. CONFIGURAR EL GIRADOR (SPINNER) AUTOMÁTICO
            isShopOpen = true;
            shopPreviewFacingRow = 0;

            if (shopPreviewRotationInterval) clearInterval(shopPreviewRotationInterval);
            shopPreviewRotationInterval = setInterval(() => {
                shopPreviewFacingRow = (shopPreviewFacingRow + 1) % 4;
            }, 1000);

            // 6. Congelar al jugador mientras ve la tienda
            player.vx = 0; player.vy = 0; player.isMoving = false;

            // 7. Configurar Botón de Compra
            const buyItemBtn = document.getElementById('buy-item-btn');
            buyItemBtn.innerHTML = ` <span style="font-size: 20px;">🪙</span> <span id="shop-item-price">${viewData.price}</span>`;
            buyItemBtn.style.background = "#2ecc71";

            shopModal.style.display = 'flex';
        }
        closeShopModal.addEventListener('click', () => {
            shopModal.style.display = 'none';
            isShopOpen = false;

            // --- NUEVO: APAGAR EL GIRADOR (Por rendimiento) ---
            if (shopPreviewRotationInterval) {
                clearInterval(shopPreviewRotationInterval); // Matamos el timer
                shopPreviewRotationInterval = null; // Limpiamos la variable
            }
        });

        buyItemBtn.addEventListener('click', () => {
            if (currentShopItemId && ws.readyState === WebSocket.OPEN) {
                // Cambiar visualmente el botón para dar feedback
                buyItemBtn.innerText = "Procesando...";
                buyItemBtn.style.background = "#f1c40f";

                // Pedirle al servidor que ejecute el cobro
                ws.send(MessagePack.encode({ type: 'buy_item', itemId: currentShopItemId }));
            }
        });

        // --- RECARGA TÁCTICA (MANUAL) ---
        const ammoDisplayBox = document.getElementById('ammo-display');

        const triggerReload = (e) => {
            e.preventDefault(); // Evita que la pantalla haga zoom accidental
            if (player.equippedWeapon !== "none" && !player.isReloading) {
                const stats = WEAPONS[player.equippedWeapon];

                // Solo recargar si nos faltan balas
                if (stats && player.ammo < stats.magSize) {
                    player.isReloading = true;

                    // 🔊 NUEVO: Play Reload Sound
                    playItemSound(player.equippedWeapon, 'reload', 0.6)

                    if (player.reloadTimeout) clearTimeout(player.reloadTimeout);

                    player.reloadTimeout = setTimeout(() => {
                        player.ammo = stats.magSize;
                        if (ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                        player.isReloading = false;
                    }, stats.reloadTime);
                }
            }
        };

        ammoDisplayBox.addEventListener('mousedown', triggerReload);
        ammoDisplayBox.addEventListener('touchstart', triggerReload, { passive: false });
        // --- LÓGICA DE LAS PESTAÑAS DEL MODAL SOCIAL ---
        const frTabBtns = document.querySelectorAll('.fr-tab-btn');
        const frTabContents = document.querySelectorAll('.fr-tab-content');

        frTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                frTabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = '#aaa';
                    b.style.fontWeight = 'normal';
                });
                frTabContents.forEach(c => c.style.display = 'none');

                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.borderBottomColor = '#3498db';
                btn.style.color = 'white';
                btn.style.fontWeight = 'bold';

                const targetId = btn.getAttribute('data-target');
                document.getElementById(targetId).style.display = 'flex';
            });
        });

        // --- LÓGICA DE LA BÚSQUEDA GLOBAL ---
        const searchPlayersInput = document.getElementById('search-players-input');
        const searchResultsContainer = document.getElementById('search-results-container');
        let searchTimeout = null;

        if (searchPlayersInput) {
            searchPlayersInput.addEventListener('input', (e) => {
                const text = e.target.value;
                if (searchTimeout) clearTimeout(searchTimeout);

                if (text.length >= 3) {
                    searchResultsContainer.innerHTML = '<div style="text-align:center; color:#aaa; font-size: 13px; margin-top:10px;">Buscando...</div>';
                    // Esperamos medio segundo después de que deje de escribir para no hacer spam al servidor
                    searchTimeout = setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({ type: 'search_players', query: text }));
                        }
                    }, 500);
                } else {
                    searchResultsContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 13px; margin-top:10px; font-style: italic;">Ingresa al menos 3 letras.</div>';
                }
            });
        }

        // 3. BUSCADOR GLOBAL MINIMALISTA
        function renderSearchResults(results) {
            searchResultsContainer.innerHTML = "";
            if (results.length === 0) {
                searchResultsContainer.innerHTML = '<div style="text-align:center; color:#e74c3c; font-size: 13px; margin-top:10px;">No se encontró a nadie con ese nombre.</div>';
                return;
            }

            results.forEach(res => {
                let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === res.accountId);
                if (res.accountId === player.accountId) onlineId = 'self';

                if (onlineId && onlineId !== 'self' && otherPlayers[onlineId].equipped) {
                    res.equipped = otherPlayers[onlineId].equipped;
                } else if (onlineId === 'self') {
                    res.equipped = player.equipped;
                }

                res.isOnline = !!onlineId;
                const card = createPlayerCard(res, () => {
                    lastProfileSource = 'friends'; // 💾 ¡AÑADE ESTA LÍNEA AQUÍ TAMBIÉN!
                    document.getElementById('friends-modal').style.display = 'none';
                    if (onlineId && onlineId !== 'offline') openProfile(onlineId, res.username);
                    else {
                        offlineFriendAccountId = res.accountId;
                        openProfile('offline', res.username, res);
                    }
                });
                searchResultsContainer.appendChild(card);
            });
        }

        // --- LÓGICA DE LA APP DE AMIGOS ---
        const appFriends = document.getElementById('app-friends');
        const friendsModal = document.getElementById('friends-modal');
        const closeFriendsModal = document.getElementById('close-friends-modal');
        const friendsListContainer = document.getElementById('friends-list-container');

        let offlineFriendAccountId = null; // Memoria temporal para poder enviarle PMs a alguien offline

        // Abrir la app desde el Menú
        appFriends.addEventListener('click', () => {
            hideTrayForModal();
            friendsListContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 14px; margin-top:20px;">Cargando amigos...</div>';
            friendsModal.style.display = 'flex';

            // Le pedimos al servidor nuestra lista fresca
            ws.send(MessagePack.encode({ type: 'get_friends_list' }));
        });

        closeFriendsModal.addEventListener('click', () => {
            friendsModal.style.display = 'none';
            restoreTrayAfterModal();
        });

        // 2. LISTA DE AMIGOS MINIMALISTA (OPTIMIZADO CON FRAGMENT)
        function renderFriendsList(friendsData) {
            const container = document.getElementById('friends-list-container');
            if (!container) return;
            container.innerHTML = "";

            if (friendsData.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:#777; font-size: 13px; margin-top:20px; font-style:italic;">Tu lista de amigos está vacía.</div>';
                return;
            }

            // 📦 LA CAJA INVISIBLE
            const fragment = document.createDocumentFragment();

            friendsData.forEach(friend => {
                let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === friend.accountId);

                if (onlineId && otherPlayers[onlineId].equipped) {
                    friend.equipped = otherPlayers[onlineId].equipped;
                }

                friend.isOnline = !!onlineId;
                const card = createPlayerCard(friend, () => {
                    lastProfileSource = 'friends';
                    document.getElementById('friends-modal').style.display = 'none';
                    if (onlineId) openProfile(onlineId, friend.username);
                    else openProfile('offline', friend.username, friend);
                });
                fragment.appendChild(card); // Meter a la caja invisible
            });

            // 💥 Pegar la caja de golpe a la pantalla
            container.appendChild(fragment);
        }

        // --- LÓGICA DE SQUADS (FRONTEND) ---
        const openSquadsBtn = document.getElementById('open-squads-btn');
        const squadMainModal = document.getElementById('squad-main-modal');
        const closeSquadMain = document.getElementById('close-squad-main');

        const btnCreateSquad = document.getElementById('btn-create-squad');
        const squadCreateModal = document.getElementById('squad-create-modal');
        const closeCreateSquad = document.getElementById('close-create-squad');
        const confirmCreateSquad = document.getElementById('confirm-create-squad');
        const newSquadNameInput = document.getElementById('new-squad-name');
        const squadCreateMsg = document.getElementById('squad-create-msg');

        // --- LÓGICA DEL LEADERBOARD ---
        const btnSquadLeaderboard = document.getElementById('btn-squad-leaderboard');
        const leaderboardModal = document.getElementById('leaderboard-modal');
        const closeLeaderboardModal = document.getElementById('close-leaderboard-modal');
        const lbTabBtns = document.querySelectorAll('.lb-tab-btn');
        const leaderboardContent = document.getElementById('leaderboard-content');

        let currentLeaderboardData = { squads: [], liveBases: [] };
        let activeLbTab = 'live';

        // 1. Abrir Modal y pedir datos al servidor
        if (btnSquadLeaderboard) {
            btnSquadLeaderboard.addEventListener('click', () => {
                squadMainModal.style.display = 'none';
                leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Cargando clasificaciones...</div>';
                leaderboardModal.style.display = 'flex';
                ws.send(MessagePack.encode({ type: 'get_squad_leaderboard' }));
            });
        }

        if (closeLeaderboardModal) {
            closeLeaderboardModal.addEventListener('click', () => {
                leaderboardModal.style.display = 'none';
                squadMainModal.style.display = 'flex'; // Volver al menú de Squads
            });
        }

        // 2. Lógica de Pestañas
        lbTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                lbTabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.borderBottomColor = 'transparent';
                    b.style.color = '#aaa';
                    b.style.fontWeight = 'normal';
                });

                btn.style.background = 'rgba(241, 196, 15, 0.1)';
                btn.style.borderBottomColor = '#f1c40f';
                btn.style.color = '#f1c40f';
                btn.style.fontWeight = 'bold';

                activeLbTab = btn.getAttribute('data-target');
                renderLeaderboard(); // Redibujar con la nueva categoría
            });
        });

        // 3. Renderizador Maestro de Clasificaciones
        function renderLeaderboard() {
            leaderboardContent.innerHTML = "";

            // --- PESTAÑA: EN VIVO (ESTADO DE LAS BASES) ---
            if (activeLbTab === 'live') {
                if (currentLeaderboardData.liveBases.length === 0) {
                    leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">No hay bases activas en el servidor.</div>';
                    return;
                }

                currentLeaderboardData.liveBases.forEach(base => {
                    const hpPct = Math.max(0, base.hp / base.maxHp) * 100;
                    const hpColor = hpPct > 50 ? '#2ecc71' : hpPct > 20 ? '#f1c40f' : '#e74c3c';

                    const logoHtml = base.ownerLogo
                        ? `<img src="${base.ownerLogo}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);">`
                        : `<div style="width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 8px; display: flex; justify-content: center; align-items: center; font-size: 20px;">🏴‍☠️</div>`;

                    leaderboardContent.innerHTML += `
                        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 15px;">
                            <div style="color: #3498db; font-weight: bold; font-size: 16px; margin-bottom: 10px;">🏰 ${base.name}</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                ${logoHtml}
                                <div style="flex: 1;">
                                    <div style="color: #f1c40f; font-weight: bold; font-size: 15px; margin-bottom: 4px;">👑 ${base.owner}</div>
                                    <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden;">
                                        <div style="width: ${hpPct}%; height: 100%; background: ${hpColor};"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                });
                return;
            }

            // --- PESTAÑAS: DIARIO, SEMANAL, HISTÓRICO ---
            // Decidir qué campo de la base de datos usar para ordenar
            let sortField = 'territoryTimeMinutes';
            if (activeLbTab === 'daily') sortField = 'dailyTimeMinutes';
            if (activeLbTab === 'weekly') sortField = 'weeklyTimeMinutes';

            // Clonar y ordenar el array de mayor a menor
            let sortedSquads = [...currentLeaderboardData.squads].sort((a, b) => b[sortField] - a[sortField]);

            // Filtrar los que tienen 0 minutos para que no aparezca basura
            sortedSquads = sortedSquads.filter(sq => sq[sortField] > 0);

            if (sortedSquads.length === 0) {
                leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Nadie ha puntuado en esta categoría aún.</div>';
                return;
            }

            sortedSquads.forEach((sq, index) => {
                let rankColor = "rgba(255,255,255,0.1)";
                let rankText = `#${index + 1}`;
                if (index === 0) { rankColor = "rgba(241, 196, 15, 0.2)"; rankText = "🥇 1"; }
                else if (index === 1) { rankColor = "rgba(189, 195, 199, 0.2)"; rankText = "🥈 2"; }
                else if (index === 2) { rankColor = "rgba(211, 84, 0, 0.2)"; rankText = "🥉 3"; }

                const logoHtml = sq.logo ? `<img src="${sq.logo}" style="width: 36px; height: 36px; border-radius: 8px; object-fit: cover;">` : `🏴‍☠️`;

                // Creamos el elemento en lugar de usar += para poder añadirle el onclick
                const row = document.createElement('div');
                row.style.cssText = `background: rgba(255,255,255,0.05); border: 1px solid ${rankColor}; border-radius: 8px; padding: 10px 15px; display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 8px;`;
                row.innerHTML = `
                    <div style="width: 30px; font-weight: bold; color: ${index < 3 ? '#fff' : '#888'}; font-size: 14px;">${rankText}</div>
                    ${logoHtml}
                    <div style="flex: 1; font-weight: bold; color: white; font-size: 15px;">${escapeHTML(sq.name)}</div>
                    <div style="color: #2ecc71; font-family: monospace; font-weight: bold; font-size: 14px;">${sq[sortField]} min</div>
                `;

                // (dentro de renderLeaderboard)
                row.onclick = () => {
                    lastSquadMenu = 'leaderboard';
                    leaderboardModal.style.display = 'none';
                    // 🛑 EL FIX: Pantalla de carga instantánea
                    document.getElementById('my-squad-title').innerText = "Cargando...";
                    document.getElementById('squad-members-list').innerHTML = "";
                    document.getElementById('my-squad-modal').style.display = 'flex';

                    ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq._id }));
                };
                leaderboardContent.appendChild(row);
            });
        }

        // --- LÓGICA DE BÚSQUEDA DE SQUADS ---
        const btnOpenSearch = document.getElementById('btn-search-squads');
        const searchModal = document.getElementById('squad-search-modal');
        const closeSearchBtn = document.getElementById('close-search-squads');
        const searchInput = document.getElementById('search-squads-input');
        const resultsContainer = document.getElementById('squad-search-results-container');

        // Abrir el buscador y cargar la lista inicial (vacía = todos)
        btnOpenSearch.onclick = () => {
            document.getElementById('squad-main-modal').style.display = 'none';
            searchModal.style.display = 'flex';
            ws.send(MessagePack.encode({ type: 'search_squads', query: "" }));
        };

        closeSearchBtn.onclick = () => {
            searchModal.style.display = 'none';
            document.getElementById('squad-main-modal').style.display = 'flex';
        };

        // Búsqueda en tiempo real al escribir
        searchInput.oninput = (e) => {
            ws.send(MessagePack.encode({ type: 'search_squads', query: e.target.value }));
        };

        function renderSquadSearchResults(results) {
            resultsContainer.innerHTML = "";

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">No se encontraron clanes.</div>';
                return;
            }

            results.forEach(sq => {
                const row = document.createElement('div');
                row.style.background = "rgba(255,255,255,0.05)";
                row.style.border = "1px solid rgba(255,255,255,0.1)";
                row.style.borderRadius = "10px";
                row.style.padding = "12px";
                row.style.cursor = "pointer";
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.gap = "12px";

                const logoHtml = sq.logo
                    ? `<img src="${sq.logo}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">`
                    : `<div style="width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; justify-content: center; align-items: center;">🏴‍☠️</div>`;

                row.innerHTML = `
            ${logoHtml}
            <div style="flex: 1;">
                <div style="color: #f1c40f; font-weight: bold; font-size: 15px;">${escapeHTML(sq.name)}</div>
                <div style="color: #777; font-size: 11px;">${sq.memberCount} miembros | ${sq.infamia} min</div>
            </div>
            <span style="color: #555;">➔</span>
        `;

                // (dentro de renderSquadSearchResults)
                row.onclick = () => {
                    lastSquadMenu = 'search';
                    document.getElementById('squad-search-modal').style.display = 'none';
                    // 🛑 EL FIX: Pantalla de carga instantánea
                    document.getElementById('my-squad-title').innerText = "Cargando...";
                    document.getElementById('squad-members-list').innerHTML = "";
                    document.getElementById('my-squad-modal').style.display = 'flex';

                    ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq.id }));
                };

                resultsContainer.appendChild(row);
            });
        }

        // --- VARIABLES DE SQUADS (LISTA Y DETALLES) ---
        let lastSquadMenu = 'main';
        const btnMySquads = document.getElementById('btn-my-squads');
        const squadListModal = document.getElementById('squad-list-modal');
        const squadsListContainer = document.getElementById('squads-list-container');
        const backToSquadMain = document.getElementById('back-to-squad-main');

        const mySquadModal = document.getElementById('my-squad-modal');
        const closeMySquad = document.getElementById('close-my-squad');
        const mySquadTitle = document.getElementById('my-squad-title');
        const mySquadMemberCount = document.getElementById('my-squad-member-count');
        const squadMembersList = document.getElementById('squad-members-list');

        // 1. Clic en "Mis Squads" -> Pide la LISTA
        btnMySquads.addEventListener('click', () => {
            squadMainModal.style.display = 'none';
            // 🛑 EL FIX: Pantalla de carga instantánea
            squadsListContainer.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Cargando...</div>';
            squadListModal.style.display = 'flex';
            ws.send(MessagePack.encode({ type: 'get_my_squads_list' }));
        });

        // 2. Botón Atrás de la lista
        backToSquadMain.addEventListener('click', () => {
            squadListModal.style.display = 'none';
            squadMainModal.style.display = 'flex';
        });

        // 3. Cerrar el modal de detalles
        closeMySquad.addEventListener('click', () => {
            mySquadModal.style.display = 'none';

            if (lastSquadMenu === 'search') {
                document.getElementById('squad-search-modal').style.display = 'flex';
            } else if (lastSquadMenu === 'list') {
                squadListModal.style.display = 'flex';
            } else if (lastSquadMenu === 'leaderboard') {
                // 🛑 EL FIX: Regresar al Leaderboard
                document.getElementById('leaderboard-modal').style.display = 'flex';
            } else {
                squadMainModal.style.display = 'flex';
            }
        });
        // =========================================================
        // --- 🛡️ DIBUJAR CUADRÍCULA DE MIEMBROS DEL SQUAD ---
        // =========================================================
        function renderSquadGrid(sq) {
            const container = document.getElementById('squad-members-list');
            if (!container) return;
            container.innerHTML = '';

            container.style.gridTemplateColumns = 'repeat(5, 1fr)';
            container.style.gap = '4px';

            const safeSprites = window.loadedItemSprites || {};
            const defaultHead = window.headImg;

            const allMembers = [
                { ...sq.leader, isLeader: true, title: "👑 Líder" },
                ...sq.members
            ];

            // 📦 LA CAJA INVISIBLE
            const fragment = document.createDocumentFragment();

            allMembers.forEach(member => {
                const card = document.createElement('div');
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.alignItems = 'center';
                card.style.width = '100%';
                card.style.minWidth = '0';
                card.style.gap = '2px';

                const canvas = document.createElement('canvas');
                canvas.width = 144;
                canvas.height = 144;
                canvas.style.width = '100%';
                canvas.style.maxWidth = '65px';
                canvas.style.aspectRatio = '1 / 1';
                canvas.style.background = 'transparent';
                canvas.style.border = 'none';
                canvas.style.imageRendering = 'pixelated';

                const nameLabel = document.createElement('span');
                nameLabel.innerText = member.name || member.username || "Desconocido";

                if (member.isLeader) {
                    nameLabel.style.color = '#f1c40f';
                    nameLabel.style.fontWeight = 'bold';
                    canvas.style.filter = 'drop-shadow(0 0 5px rgba(241, 196, 15, 0.5))';
                } else {
                    nameLabel.style.color = 'white';
                    nameLabel.style.fontWeight = 'normal';
                    canvas.style.filter = 'none';
                }

                nameLabel.style.fontSize = '9px';
                nameLabel.style.fontFamily = 'sans-serif';
                nameLabel.style.width = '100%';
                nameLabel.style.textAlign = 'center';
                nameLabel.style.whiteSpace = 'nowrap';
                nameLabel.style.overflow = 'hidden';
                nameLabel.style.textOverflow = 'ellipsis';

                card.appendChild(canvas);
                card.appendChild(nameLabel);

                // 🔥 En lugar de mandarlo al DOM real, lo metemos al Fragment
                fragment.appendChild(card);

                const ctx = canvas.getContext('2d');
                let headId = 'head_default';

                if (member.equipped && member.equipped.head) {
                    headId = member.equipped.head;
                } else if (member.head) {
                    headId = member.head;
                }

                if (member.name === player.username || member.accountId === player.accountId) {
                    headId = player.equipped?.head || 'head_default';
                }

                const hImg = safeSprites[headId] || defaultHead;

                const drawHead = (img) => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = false;
                    ctx.webkitImageSmoothingEnabled = false;
                    const sourceX = 12;
                    const sourceY = 12;
                    const cropSize = 24;
                    ctx.drawImage(img, sourceX, sourceY, cropSize, cropSize, 0, 0, 144, 144);
                };

                if (hImg && hImg.complete && hImg.naturalWidth > 0) {
                    drawHead(hImg);
                } else if (hImg) {
                    hImg.addEventListener('load', () => drawHead(hImg), { once: true });
                }

                card.style.cursor = 'pointer';
                card.onclick = () => {
                    if (player.squad !== sq.id) {
                        lastProfileSource = 'squad';
                        document.getElementById('my-squad-modal').style.display = 'none';
                        if (member.accountId === player.accountId) {
                            openProfile('self', player.username);
                        } else {
                            let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === member.accountId);
                            if (onlineId) openProfile(onlineId, nameLabel.innerText);
                            else openProfile('offline', nameLabel.innerText, member);
                        }
                    } else {
                        openSquadMemberModal(member, sq);
                    }
                };
            });

            // 💥 Pegar la cuadrícula entera con sus 25 cabezas de 1 solo golpe
            container.appendChild(fragment);
        }
        function createSquadMemberRow(name, title, isLeader) {
            const row = document.createElement('div');
            row.style.background = isLeader ? "rgba(241, 196, 15, 0.1)" : "rgba(255,255,255,0.05)";
            row.style.border = isLeader ? "1px solid rgba(241, 196, 15, 0.3)" : "1px solid rgba(255,255,255,0.1)";
            row.style.padding = "12px 15px";
            row.style.borderRadius = "10px";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.alignItems = "center";

            const nameSpan = document.createElement('span');
            nameSpan.style.color = isLeader ? "#f1c40f" : "white";
            nameSpan.style.fontWeight = "bold";
            nameSpan.style.fontFamily = "sans-serif";
            nameSpan.innerText = name;

            const titleSpan = document.createElement('span');
            titleSpan.style.color = isLeader ? "#f39c12" : "#3498db";
            titleSpan.style.fontSize = "12px";
            titleSpan.style.fontFamily = "sans-serif";
            titleSpan.style.background = "rgba(0,0,0,0.5)";
            titleSpan.style.padding = "4px 8px";
            titleSpan.style.borderRadius = "6px";
            titleSpan.innerText = title;

            row.appendChild(nameSpan);
            row.appendChild(titleSpan);
            return row;
        }

        // Abrir/Cerrar Menú Principal
        if (openSquadsBtn) {
            openSquadsBtn.addEventListener('click', () => {
                hideTrayForModal();
                squadMainModal.style.display = 'flex';
                player.vx = 0; player.vy = 0; player.isMoving = false;
            });
        }
        if (closeSquadMain) closeSquadMain.addEventListener('click', () => {
            squadMainModal.style.display = 'none';
            restoreTrayAfterModal();
        });

        // Abrir/Cerrar Ventana de "Crear"
        btnCreateSquad.addEventListener('click', () => {
            squadMainModal.style.display = 'none';
            squadCreateModal.style.display = 'flex';
            squadCreateMsg.innerText = ""; // Limpiar errores pasados
            newSquadNameInput.value = "";
        });
        // Cerrar Ventana de "Crear" y regresar al Menú Principal
        closeCreateSquad.addEventListener('click', () => {
            squadCreateModal.style.display = 'none';
            squadMainModal.style.display = 'flex'; // <--- 🌟 ESTA ES LA LÍNEA MÁGICA
        });

        // Botón de Confirmar Creación
        confirmCreateSquad.addEventListener('click', () => {
            const squadName = newSquadNameInput.value.trim();
            const squadLogo = document.getElementById('new-squad-logo').value.trim(); // <--- ATRAPA EL LOGO
            if (squadName.length < 3) {
                squadCreateMsg.style.color = "#ff6b6b";
                squadCreateMsg.innerText = "El nombre es muy corto.";
                return;
            }
            confirmCreateSquad.innerText = "Creando...";
            // SE LO ENVÍA AL SERVIDOR
            ws.send(MessagePack.encode({ type: 'create_squad', squadName: squadName, logo: squadLogo }));
        });

        // --- LÓGICA DE EDITAR SQUAD ---
        const squadEditModal = document.getElementById('squad-edit-modal');
        const closeEditSquad = document.getElementById('close-edit-squad');
        const confirmEditSquad = document.getElementById('confirm-edit-squad');
        const editSquadNameInput = document.getElementById('edit-squad-name');
        const editSquadLogoInput = document.getElementById('edit-squad-logo');
        const squadEditMsg = document.getElementById('squad-edit-msg');
        let currentEditSquadId = null;
        let originalSquadName = ""; // Para saber si le cobramos o no

        closeEditSquad.addEventListener('click', () => squadEditModal.style.display = 'none');

        // Efecto visual: si cambia el nombre, el botón cambia de texto
        editSquadNameInput.addEventListener('input', () => {
            if (editSquadNameInput.value.trim() !== originalSquadName) {
                confirmEditSquad.innerText = "Guardar Cambios (Cuesta 350 🪙)";
            } else {
                confirmEditSquad.innerText = "Guardar Logo (Gratis)";
            }
        });

        confirmEditSquad.addEventListener('click', () => {
            confirmEditSquad.innerText = "Procesando...";
            ws.send(MessagePack.encode({
                type: 'edit_squad',
                squadId: currentEditSquadId,
                newName: editSquadNameInput.value.trim(),
                newLogo: editSquadLogoInput.value.trim()
            }));
        });

        function createSquadMemberRow(name, title, isLeader) {
            const row = document.createElement('div');
            row.style.background = isLeader ? "rgba(241, 196, 15, 0.1)" : "rgba(255,255,255,0.05)";
            row.style.border = isLeader ? "1px solid rgba(241, 196, 15, 0.3)" : "1px solid rgba(255,255,255,0.1)";
            row.style.padding = "12px 15px";
            row.style.borderRadius = "10px";
            row.style.display = "flex";
            row.style.justifyContent = "space-between";
            row.style.alignItems = "center";

            const nameSpan = document.createElement('span');
            nameSpan.style.color = isLeader ? "#f1c40f" : "white";
            nameSpan.style.fontWeight = "bold";
            nameSpan.style.fontFamily = "sans-serif";
            nameSpan.innerText = name;

            const titleSpan = document.createElement('span');
            titleSpan.style.color = isLeader ? "#f39c12" : "#3498db";
            titleSpan.style.fontSize = "12px";
            titleSpan.style.fontFamily = "sans-serif";
            titleSpan.style.background = "rgba(0,0,0,0.5)";
            titleSpan.style.padding = "4px 8px";
            titleSpan.style.borderRadius = "6px";
            titleSpan.innerText = title;

            row.appendChild(nameSpan);
            row.appendChild(titleSpan);
            return row;
        }

        let currentEditingMember = null;
        const squadMemberModal = document.getElementById('squad-member-modal');

        function openSquadMemberModal(member, squad) {
            currentEditingMember = member; // Guardamos TODO el objeto del miembro

            const amILeader = squad.leader.id === player.accountId;
            let myMemberData = squad.members.find(m => m.accountId === player.accountId);
            const iCanAssignRoles = amILeader || (myMemberData && myMemberData.canAssignRoles);
            const iCanKick = amILeader || (myMemberData && myMemberData.canKick);

            document.getElementById('sm-name').innerText = member.name || "Desconocido";
            // ✅ EL FIX CORRECTO (Usando tu Catálogo Maestro):
            const headId = (member.equipped && member.equipped.head) ? member.equipped.head : 'head_default';
            const headItem = MASTER_CATALOG[headId];
            const canvas = document.getElementById('sm-head-canvas');
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;

            // Extraer la imagen precargada en la RAM del juego
            const safeSprites = window.loadedItemSprites || {};
            const hImg = safeSprites[headId] || window.headImg;

            const drawHead = (img) => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.imageSmoothingEnabled = false;

                // El recorte maestro (Igual que en la cuadrícula del Squad)
                const sourceX = 12;
                const sourceY = 12;
                const cropSize = 24;

                // Dibujamos el recorte ocupando los 64x64 píxeles del Canvas
                ctx.drawImage(
                    img,
                    sourceX, sourceY, cropSize, cropSize,
                    0, 0, 64, 64
                );
            };

            // Dibujar si ya descargó, o esperar a que cargue
            if (hImg && hImg.complete && hImg.naturalWidth > 0) {
                drawHead(hImg);
            } else if (hImg) {
                hImg.addEventListener('load', () => drawHead(hImg), { once: true });
            }
            const titleInput = document.getElementById('sm-title');
            const chkInvite = document.getElementById('sm-can-invite');
            const chkKick = document.getElementById('sm-can-kick');
            const chkAssign = document.getElementById('sm-can-assign');
            const kickBtn = document.getElementById('sm-kick-btn');

            // 1. Cargar datos
            titleInput.value = member.title || "Miembro";
            chkInvite.checked = member.canInvite || false;
            chkKick.checked = member.canKick || false;
            chkAssign.checked = member.canAssignRoles || false;

            // 2. Bloquear inputs si no tengo permisos o si es el líder
            const isEditingLeader = member.isLeader || (squad.leader.id === member.accountId);
            const canIEditThisPerson = iCanAssignRoles && !isEditingLeader;

            titleInput.disabled = !canIEditThisPerson;
            chkInvite.disabled = !canIEditThisPerson;
            chkKick.disabled = !canIEditThisPerson;
            chkAssign.disabled = !canIEditThisPerson;

            // 3. Botón de Expulsar
            kickBtn.style.display = (iCanKick && !isEditingLeader && member.accountId !== player.accountId) ? 'block' : 'none';

            squadMemberModal.style.display = 'flex';
        }

        // ==========================================
        // 💾 FUNCIÓN DE AUTO-GUARDADO (SIN BOTÓN)
        // ==========================================
        function autoSaveSquadMember() {
            // Solo guarda si el modal está abierto y tenemos a alguien seleccionado
            if (!currentEditingMember || squadMemberModal.style.display === 'none') return;

            ws.send(MessagePack.encode({
                type: 'update_squad_member',
                targetAccountId: currentEditingMember.accountId,
                title: document.getElementById('sm-title').value.trim(),
                canInvite: document.getElementById('sm-can-invite').checked,
                canKick: document.getElementById('sm-can-kick').checked,
                canAssignRoles: document.getElementById('sm-can-assign').checked
            }));
        }

        // Los "Triggers": Guardan al hacer clic en un checkbox, o al terminar de escribir el Título
        document.getElementById('sm-title').addEventListener('change', autoSaveSquadMember);
        document.getElementById('sm-can-invite').addEventListener('change', autoSaveSquadMember);
        document.getElementById('sm-can-kick').addEventListener('change', autoSaveSquadMember);
        document.getElementById('sm-can-assign').addEventListener('change', autoSaveSquadMember);

        // ==========================================
        // 👁️ BOTÓN DE VER PERFIL (CON NAVEGACIÓN)
        // ==========================================
        document.getElementById('sm-profile-btn').onclick = () => {
            if (!currentEditingMember) return;

            squadMemberModal.style.display = 'none';
            document.getElementById('my-squad-modal').style.display = 'none';

            lastProfileSource = 'squad_member';

            // 🛑 EL FIX DEFINITIVO DE IDENTIDAD
            if (currentEditingMember.accountId === player.accountId) {
                openProfile('self', player.username);
            } else {
                let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === currentEditingMember.accountId);
                if (onlineId) {
                    openProfile(onlineId, currentEditingMember.name);
                } else {
                    openProfile('offline', currentEditingMember.name, currentEditingMember);
                }
            }
        };

        // ==========================================
        // ❌ CERRAR MODAL
        // ==========================================
        document.getElementById('close-squad-member').onclick = () => {
            // Forzamos un último autoguardado rápido por si editó texto y le dio rápido a la X sin deseleccionar la caja
            autoSaveSquadMember();
            squadMemberModal.style.display = 'none';
            currentEditingMember = null;
        };

        // --- LÓGICA DE LA APP SKELETON (SKEL) ---
        const appSkelIcon = document.getElementById('app-skel');
        if (appSkelIcon) {
            appSkelIcon.addEventListener('click', () => {
                // 2. Abre el editor y actualiza la previsualización
                document.getElementById('skeleton-editor').style.display = 'flex';
                updateSkelPreview();
            });
        }
        const closeSkelBtn = document.querySelector('#skel-drag-handle button');
        if (closeSkelBtn) {
            closeSkelBtn.onclick = () => {
                document.getElementById('skeleton-editor').style.display = 'none';
                restoreTrayAfterModal(); // 🌟 MAGIA
            };
        }

        // --- MOTOR GANI (BODY, WEAPON, MELEE) ---
        const skelCanvas = document.getElementById('edit-preview-canvas');
        const skelCtx = skelCanvas ? skelCanvas.getContext('2d') : null;
        let draggingAnchor = null;
        let currentGaniTab = 'body'; // Puede ser 'body', 'weapon' o 'melee'
        let isPreviewSwinging = false;
        let previewSwingStart = 0;
        // --- VARIABLES DEL SPRITE PICKER ---
        let isPickingAccessory = false; // false = Mano (Cuerpo), true = Accesorio (Arma)

        // Lógica del botón Toggle
        const btnToggleSheet = document.getElementById('btn-toggle-sheet');
        if (btnToggleSheet) {
            btnToggleSheet.onclick = () => {
                isPickingAccessory = !isPickingAccessory;
                btnToggleSheet.innerText = isPickingAccessory ? "🦴 Ver Hoja de Cuerpo" : "⚔️ Ver Hoja de Arma";
                drawSpriteSheetGrid();
            };
        }

        // 1. DIBUJAR LA CUADRÍCULA (INTELIGENTE)
        function drawSpriteSheetGrid() {
            const ssCanvas = document.getElementById('spritesheet-canvas');
            if (!ssCanvas) return;
            const ctx = ssCanvas.getContext('2d');
            const wId = player.equippedWeapon;

            let activeImg = bodyImg;
            let isWeaponSheet = false;

            // Decidir si mostramos el Cuerpo o el Arma
            if (currentGaniTab === 'melee' && isPickingAccessory && wId !== "none" && loadedWeaponSprites[wId]) {
                activeImg = loadedWeaponSprites[wId];
                isWeaponSheet = true;
                document.getElementById('grid-coord-label').innerText = "Seleccionando Accesorio";
            } else {
                if (!bodyImg || !bodyImg.complete) return;
                document.getElementById('grid-coord-label').innerText = "Seleccionando Mano";
            }

            const zoom = 2;
            ssCanvas.width = activeImg.width * zoom;
            ssCanvas.height = activeImg.height * zoom;

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(activeImg, 0, 0, ssCanvas.width, ssCanvas.height);

            const tileSize = 16 * zoom;

            // Dibujar la malla (Grid)
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1;
            for (let x = 0; x <= ssCanvas.width; x += tileSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ssCanvas.height); ctx.stroke(); }
            for (let y = 0; y <= ssCanvas.height; y += tileSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ssCanvas.width, y); ctx.stroke(); }

            // Resaltar el recuadro correcto
            let selX = 0, selY = 0;
            if (wId !== "none" && weaponsDB[wId] && weaponsDB[wId].dirStats && weaponsDB[wId].dirStats[currentEditDir]) {
                const d = weaponsDB[wId].dirStats[currentEditDir];
                if (isWeaponSheet) {
                    selX = (d.wTileX || 0) * tileSize;
                    selY = (d.wTileY || 0) * tileSize;
                } else {
                    selX = (d.tX !== undefined ? d.tX : 13) * tileSize;
                    selY = (d.tY !== undefined ? d.tY : 0) * tileSize;
                }
            }

            ctx.strokeStyle = "#e67e22"; ctx.lineWidth = 3;
            ctx.strokeRect(selX, selY, tileSize, tileSize);
            ctx.fillStyle = "rgba(230, 126, 34, 0.3)";
            ctx.fillRect(selX, selY, tileSize, tileSize);
        }

        // 2. GUARDAR EL CLIC EN LA BASE DE DATOS LOCAL
        const ssCanvasEl = document.getElementById('spritesheet-canvas');
        if (ssCanvasEl) {
            ssCanvasEl.addEventListener('mousedown', (e) => {
                const wId = player.equippedWeapon;
                if (wId === "none" || !weaponsDB[wId]) return;

                const rect = ssCanvasEl.getBoundingClientRect();
                const zoom = 2; const tileSize = 16 * zoom;

                if (!weaponsDB[wId].dirStats) weaponsDB[wId].dirStats = {};
                if (!weaponsDB[wId].dirStats[currentEditDir]) weaponsDB[wId].dirStats[currentEditDir] = {};

                const gridX = Math.floor((e.clientX - rect.left) / tileSize);
                const gridY = Math.floor((e.clientY - rect.top) / tileSize);

                // Si estamos en la hoja del arma, guardamos en wTile. Si es cuerpo, en tTile (Mano).
                if (currentGaniTab === 'melee' && isPickingAccessory) {
                    weaponsDB[wId].dirStats[currentEditDir].wTileX = gridX;
                    weaponsDB[wId].dirStats[currentEditDir].wTileY = gridY;
                } else {
                    weaponsDB[wId].dirStats[currentEditDir].tX = gridX;
                    weaponsDB[wId].dirStats[currentEditDir].tY = gridY;
                }

                drawSpriteSheetGrid();
                updateSkelPreview();
            });
        }

        // Función auxiliar para cambiar UI
        function switchGaniTab(tab, color, title, instructions) {
            currentGaniTab = tab;
            document.getElementById('tab-skel-body').style.background = tab === 'body' ? '#9b59b6' : 'rgba(0,0,0,0.5)';
            document.getElementById('tab-skel-body').style.color = tab === 'body' ? 'white' : '#aaa';
            document.getElementById('tab-skel-weapon').style.background = tab === 'weapon' ? '#e74c3c' : 'rgba(0,0,0,0.5)';
            document.getElementById('tab-skel-weapon').style.color = tab === 'weapon' ? 'white' : '#aaa';
            document.getElementById('tab-skel-melee').style.background = tab === 'melee' ? '#e67e22' : 'rgba(0,0,0,0.5)';
            document.getElementById('tab-skel-melee').style.color = tab === 'melee' ? 'white' : '#aaa';

            document.getElementById('skel-anim-controls').style.display = tab === 'body' ? 'flex' : 'none';
            document.getElementById('skel-melee-controls').style.display = tab === 'melee' ? 'flex' : 'none';

            document.getElementById('skel-instructions').innerHTML = instructions;
            document.getElementById('save-skel-btn').innerText = title;
            document.getElementById('save-skel-btn').style.background = color;
            document.getElementById('save-skel-btn').style.boxShadow = `0 4px 0 ${color}`;

            // Cargar datos al entrar a la pestaña Melee
            if (tab === 'melee') {
                const wId = player.equippedWeapon;
                const stats = weaponsDB[wId];

                // --- MOSTRAR/OCULTAR BOTÓN DE HOJA DE ARMA ---
                const tBtn = document.getElementById('btn-toggle-sheet');
                if (tBtn) {
                    if (tab === 'melee') {
                        tBtn.style.display = 'inline-block';
                    } else {
                        tBtn.style.display = 'none';
                        isPickingAccessory = false; // Resetear al cuerpo por seguridad
                        tBtn.innerText = "⚔️ Ver Hoja de Arma";
                    }
                }

                // Si es melee, cargamos los datos basados en la dirección actual
                loadMeleeSlidersForDirection(player.frameY);
            }
            // 👇 AÑADE ESTO: Para que dibuje la cuadrícula grande del cuerpo
            if (tab === 'body') {
                setTimeout(drawSpriteSheetGrid, 50); // El setTimeout le da tiempo al HTML de abrirse
            }
            updateSkelPreview();
        }
        // Ocultar o mostrar el botón Toggle de la hoja de sprites
        const tBtn = document.getElementById('btn-toggle-sheet');
        if (tBtn) {
            if (currentGaniTab === 'melee') { // 🛑 EL FIX: Usar currentGaniTab
                tBtn.style.display = 'inline-block';
            } else {
                tBtn.style.display = 'none';
                isPickingAccessory = false; // Resetear siempre al cuerpo
                tBtn.innerText = "⚔️ Ver Hoja de Arma";
            }
        }
        document.getElementById('tab-skel-body').onclick = () => switchGaniTab('body', '#9b59b6', '💾 Guardar Esqueleto', "Arrastra el <b>Punto Azul</b> a la mano del jugador.");
        document.getElementById('tab-skel-weapon').onclick = () => switchGaniTab('weapon', '#e74c3c', '💾 Guardar Pivote de Arma', "Arrastra el <b>Punto Rojo</b> al mango de la pistola.");
        document.getElementById('tab-skel-melee').onclick = () => switchGaniTab('melee', '#e67e22', '💾 Guardar Hitbox y Animación', "Ajusta los <b>Slidres</b> para definir el área de daño (Rojo).");

        // 1. Añadimos sl-wz, sl-hz, sl-az
        const sliders = [
            'sl-hitx', 'sl-hity', 'sl-hitrot', 'sl-hitlen', 'sl-hitwid',
            'sl-wz', 'sl-wx', 'sl-wy', 'sl-wrot', 'sl-wswg',
            'sl-hz', 'sl-hx', 'sl-hy', 'sl-hrot',
            'sl-az', 'sl-ax', 'sl-ay', 'sl-arot'
        ];

        sliders.forEach(id => {
            const sliderEl = document.getElementById(id);

            // 🛑 EL ESCUDO: Si el slider no existe en el HTML, lo ignoramos silenciosamente
            if (!sliderEl) return;

            sliderEl.addEventListener('input', () => {
                const val = sliderEl.value;
                const labelEl = document.getElementById('val-' + id.split('-')[1]);

                // 🛑 EL ESCUDO 2: Actualizamos el texto solo si la etiqueta visual existe
                if (labelEl) labelEl.innerText = val;

                const wId = player.equippedWeapon;
                if (wId !== "none" && weaponsDB[wId]) {
                    if (!weaponsDB[wId].dirStats) weaponsDB[wId].dirStats = {};
                    if (!weaponsDB[wId].dirStats[currentEditDir]) weaponsDB[wId].dirStats[currentEditDir] = {};

                    const d = weaponsDB[wId].dirStats[currentEditDir];
                    const numVal = parseInt(val);

                    if (id === 'sl-hitx') d.hitX = numVal; if (id === 'sl-hity') d.hitY = numVal;
                    if (id === 'sl-hitrot') d.hitRot = numVal; if (id === 'sl-hitlen') d.hitLen = numVal; if (id === 'sl-hitwid') d.hitWid = numVal;

                    if (id === 'sl-wz') d.wZ = numVal; if (id === 'sl-wx') d.wX = numVal; if (id === 'sl-wy') d.wY = numVal;
                    if (id === 'sl-wrot') d.wRot = numVal; if (id === 'sl-wswg') d.wSwg = numVal;

                    if (id === 'sl-hz') d.hZ = numVal; if (id === 'sl-hx') d.hX = numVal; if (id === 'sl-hy') d.hY = numVal; if (id === 'sl-hrot') d.hRot = numVal;

                    if (id === 'sl-az') d.aZ = numVal; if (id === 'sl-ax') d.aX = numVal; if (id === 'sl-ay') d.aY = numVal; if (id === 'sl-arot') d.aRot = numVal;
                }
                updateSkelPreview();
            });
        });

        function updateMeleeLabels() {
            document.getElementById('val-rot').innerText = document.getElementById('sl-rot').value;
            document.getElementById('val-swg').innerText = document.getElementById('sl-swg').value; // NUEVO
            document.getElementById('val-len').innerText = document.getElementById('sl-len').value;
            document.getElementById('val-wid').innerText = document.getElementById('sl-wid').value;
            document.getElementById('val-hx').innerText = document.getElementById('sl-hx').value;
            document.getElementById('val-hy').innerText = document.getElementById('sl-hy').value;
            document.getElementById('val-wx').innerText = document.getElementById('sl-wx').value;
            document.getElementById('val-wy').innerText = document.getElementById('sl-wy').value;
            document.getElementById('val-ax').innerText = document.getElementById('sl-ax').value;
            document.getElementById('val-ay').innerText = document.getElementById('sl-ay').value;
            document.getElementById('val-arot').innerText = document.getElementById('sl-arot').value;
        }

        // 3. RECARGAR SLIDERS Y ACTUALIZAR ETIQUETA DE DIRECCIÓN
        let currentEditDir = 0;
        // 2. Cargar datos al cambiar de lado (WASD)
        function loadMeleeSlidersForDirection(dir) {
            currentEditDir = dir;
            // 🛑 EL FIX: Nuevo orden de los textos en el editor
            const dirNames = { 0: "ABAJO (0)", 1: "IZQUIERDA (1)", 2: "DERECHA (2)", 3: "ARRIBA (3)" };
            const dirIndicator = document.getElementById('dir-indicator');
            if (dirIndicator) dirIndicator.innerText = `Modificando: ${dirNames[dir]}`;

            const wId = player.equippedWeapon;
            if (wId !== "none" && weaponsDB[wId] && weaponsDB[wId].dirStats) {
                const d = weaponsDB[wId].dirStats[dir] || weaponsDB[wId].dirStats[0] || {};

                // 🛑 EL ESCUDO ANTI-CRASH 🛑
                const setVal = (id, val) => {
                    const slider = document.getElementById('sl-' + id);
                    const label = document.getElementById('val-' + id);
                    if (slider) slider.value = val;
                    if (label) label.innerText = val;
                };

                setVal('hitx', d.hitX || 0); setVal('hity', d.hitY || 0); setVal('hitrot', d.hitRot || 0);
                setVal('hitlen', d.hitLen || 40); setVal('hitwid', d.hitWid || 60);

                setVal('wz', d.wZ !== undefined ? d.wZ : 1); setVal('wx', d.wX || 0); setVal('wy', d.wY || 0); setVal('wrot', d.wRot || 0); setVal('wswg', d.wSwg || 90);
                setVal('hz', d.hZ !== undefined ? d.hZ : 1); setVal('hx', d.hX || 0); setVal('hy', d.hY || 0); setVal('hrot', d.hRot || 0);
                setVal('az', d.aZ !== undefined ? d.aZ : 1); setVal('ax', d.aX || 0); setVal('ay', d.aY || 0); setVal('arot', d.aRot || 0);
                setVal('kb', d.kb || 0);
                setVal('freeze', d.freeze || 0);
                let tileText = isPickingAccessory ? `[ wX: ${d.wTileX || 0}, wY: ${d.wTileY || 0} ]` : `[ tX: ${d.tX || 13}, tY: ${d.tY || 0} ]`;
                const coordLabel = document.getElementById('grid-coord-label');
                if (coordLabel) coordLabel.innerText = `${tileText} (Dir: ${dir})`;
            }
        }

        // --- BOTÓN DE PROBAR ANIMACIÓN INTELIGENTE ---
        // 🛑 EL FIX: Usar el nombre original de tu botón (btn-preview-swing)
        document.getElementById('btn-preview-swing').onclick = () => {
            const wId = player.equippedWeapon;
            if (wId !== "none" && weaponsDB[wId]) {

                if (weaponsDB[wId].type === 'ranged') {
                    // Si es pistola: El brazo no hace swing, solo el arma hace Tilt
                    testAnimPlaying = true;
                    testAnimStart = Date.now();
                } else {
                    // Si es espada: El brazo y el arma hacen el Swing completo
                    isPreviewSwinging = true;
                    previewSwingStart = Date.now();
                }

                if (typeof animatePreview === 'function') animatePreview();
            }
        };

        function animatePreview() {
            if (!isPreviewSwinging) return;
            updateSkelPreview();
            if (Date.now() - previewSwingStart < 200) {
                requestAnimationFrame(animatePreview);
            } else {
                isPreviewSwinging = false;
                updateSkelPreview(); // Reset a postura normal
            }
        }
        // 💥 VARIABLES GLOBALES PARA EL PREVIEW DE ANIMACIONES 💥
        let testAnimPlaying = false;
        let testAnimStart = 0;

        function updateSkelPreview() {
            if (!skelCtx) return;
            const zoom = 3;
            const centerX = 128 - ((FRAME_WIDTH / 2) * zoom);
            const centerY = 128 - ((FRAME_HEIGHT / 2) * zoom);

            // Fondo y cuadrícula
            skelCtx.fillStyle = "#1a1a1a"; skelCtx.fillRect(0, 0, 256, 256);
            skelCtx.strokeStyle = "#333"; skelCtx.lineWidth = 1;
            for (let i = 0; i < 256; i += 12) {
                skelCtx.beginPath(); skelCtx.moveTo(i, 0); skelCtx.lineTo(i, 256); skelCtx.stroke();
                skelCtx.beginPath(); skelCtx.moveTo(0, i); skelCtx.lineTo(256, i); skelCtx.stroke();
            }
            skelCtx.imageSmoothingEnabled = false;

            const testWeapon = player.equippedWeapon;

            // --- MODO 1: CUERPO ---
            if (currentGaniTab === 'body') {
                const state = editSkelState ? editSkelState.value : 'idle';
                const dir = editSkelDir ? parseInt(editSkelDir.value) : 0;
                const frame = editSkelFrame ? parseInt(editSkelFrame.value) : 0;

                const fKey = getFrameKey(state, dir, frame);
                if (!SKELETON_DATA.anchors[fKey]) SKELETON_DATA.anchors[fKey] = { handR: [12, 12], head: [0, 0] };
                const anchors = SKELETON_DATA.anchors[fKey];

                const baseRow = SKELETON_DATA.states[state] || 0;
                let maxFrames = 4;
                if (state === "walk_unarmed") maxFrames = 8;
                else if (state === "walk_armed") maxFrames = 6;
                const safeFrame = frame % maxFrames;

                if (bodyImg && bodyImg.complete) skelCtx.drawImage(bodyImg, safeFrame * FRAME_WIDTH, (baseRow + dir) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, centerX, centerY, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);
                if (headImg && headImg.complete) skelCtx.drawImage(headImg, (frame % 4) * FRAME_WIDTH, dir * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, centerX + ((anchors.head ? anchors.head[0] : 0) * zoom), centerY + ((anchors.head ? anchors.head[1] : 0) * zoom), FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);

                const handGizmoX = centerX + (anchors.handR[0] * zoom) + ((FRAME_WIDTH / 2) * zoom);
                const handGizmoY = centerY + (anchors.handR[1] * zoom) + ((FRAME_HEIGHT / 2) * zoom);
                drawGizmo(handGizmoX, handGizmoY, '#3498db');

                // --- DIBUJAR ARMA DE PREVISUALIZACIÓN EN LA MANO ---
                if (testWeapon !== "none" && loadedWeaponSprites[testWeapon]) {
                    const wSprite = loadedWeaponSprites[testWeapon];
                    const wStats = weaponsDB[testWeapon] || {};
                    const pX = (wStats.pivotX || 0) * zoom;
                    const pY = (wStats.pivotY || 0) * zoom;
                    const wW = wSprite.width / 8; const wH = wSprite.height / 6;

                    skelCtx.save();
                    // 🛑 EL FIX: Usar exactamente la posición calculada del Gizmo Azul para anclar el arma
                    skelCtx.translate(handGizmoX, handGizmoY);
                    skelCtx.globalAlpha = 0.7;
                    skelCtx.drawImage(wSprite, 0, 0, wW, wH, -pX - (wW * zoom / 2), -pY - (wH * zoom / 2), wW * zoom, wH * zoom);
                    skelCtx.restore();
                }
            }
            // --- MODO 2: ARMA PIVOTE ---
            else if (currentGaniTab === 'weapon') {
                if (testWeapon !== "none" && loadedWeaponSprites[testWeapon]) {
                    const wSprite = loadedWeaponSprites[testWeapon];
                    const wW = wSprite.width / 8; const wH = wSprite.height / 6;
                    skelCtx.drawImage(wSprite, 0, 0, wW, wH, 128 - ((wW * zoom) / 2), 128 - ((wH * zoom) / 2), wW * zoom, wH * zoom);
                    const stats = weaponsDB[testWeapon] || {};
                    const pivotX = stats.pivotX || 0; const pivotY = stats.pivotY || 0;
                    drawGizmo(128 + (pivotX * zoom), 128 + (pivotY * zoom), '#e74c3c');
                } else {
                    skelCtx.fillStyle = "white"; skelCtx.fillText("Equípate un arma primero", 100, 128);
                }
            }
            // --- MODO 3: MELEE HITBOX (CAPAS Z-INDEX) ---
            else if (currentGaniTab === 'melee') {
                if (testWeapon === "none" || !loadedWeaponSprites[testWeapon]) {
                    skelCtx.fillStyle = "white"; skelCtx.fillText("Equípate un arma primero", 100, 128); return;
                }

                const dir = player.frameY; const frame = player.frameX;
                const state = player.isMoving ? 'walk_armed' : 'walk_armed';

                if (dir !== currentEditDir) loadMeleeSlidersForDirection(dir);

                // 🔥 FIX A PRUEBA DE BALAS PARA ANCLAS EN EL EDITOR 🔥
                const fKey = getFrameKey(state, dir, frame);
                const rawAnchors = SKELETON_DATA.anchors[fKey] || {};
                const headAnc = rawAnchors.head || [0, 0];
                const handAnc = rawAnchors.handR || [12, 12];
                const safeFrame = frame % 6;

                const handX = centerX + (handAnc[0] * zoom) + ((FRAME_WIDTH / 2) * zoom);
                const handY = centerY + (handAnc[1] * zoom) + ((FRAME_HEIGHT / 2) * zoom);

                const d = weaponsDB[testWeapon].dirStats ? (weaponsDB[testWeapon].dirStats[dir] || {}) : {};
                const wSprite = loadedWeaponSprites[testWeapon];

                // --- ROTACIÓN MATEMÁTICA AUTOMÁTICA (SOLO PARA MELEE) ---
                let aimAngle = 0; let dirMult = 1;

                // Si NO es ranged (ej. es una espada), aplicamos la rotación forzada
                if (weaponsDB[testWeapon] && weaponsDB[testWeapon].type !== 'ranged') {
                    if (dir === 0) aimAngle = Math.PI / 2;
                    else if (dir === 1) { aimAngle = Math.PI; dirMult = -1; }
                    else if (dir === 2) { aimAngle = 0; }
                    else if (dir === 3) { aimAngle = -Math.PI / 2; dirMult = -1; }
                }
                // (Si ES ranged, aimAngle se queda en 0 y dirMult en 1, respetando el dibujo original)

                // Capas
                const aZ = d.aZ !== undefined ? d.aZ : 1;
                const wZ = d.wZ !== undefined ? d.wZ : 1;
                const hZ = d.hZ !== undefined ? d.hZ : 1;

                let currentAnimRot = d.wRot || 0;
                if (isPreviewSwinging) currentAnimRot += (d.wSwg || 90) * ((Date.now() - previewSwingStart) / 200);
                const totalWeaponRot = aimAngle + (currentAnimRot * dirMult * Math.PI / 180);

                // --- 🍕 DIBUJAR HITBOX O PUNTA DEL CAÑÓN ---
                skelCtx.save();

                // 🛑 EL FIX: Usamos 128 (El pecho) en lugar de centerX/Y (La esquina superior)
                skelCtx.translate(128 + ((d.hitX || 0) * zoom), 128 + ((d.hitY || 0) * zoom));

                if (weaponsDB[testWeapon] && weaponsDB[testWeapon].type === 'ranged') {
                    // Si es pistola, dibujamos un punto amarillo (Muzzle)
                    skelCtx.beginPath();
                    skelCtx.arc(0, 0, 4, 0, Math.PI * 2);
                    skelCtx.fillStyle = "yellow"; skelCtx.fill();
                    skelCtx.strokeStyle = "orange"; skelCtx.lineWidth = 2; skelCtx.stroke();
                    skelCtx.fillStyle = "white"; skelCtx.font = "10px sans-serif";
                    skelCtx.fillText("Bala", 6, 4);
                } else {
                    // Si es Melee, dibujamos el cono de daño
                    const trueHitAngle = aimAngle + ((d.hitRot || 0) * dirMult * Math.PI / 180);
                    const halfWidRad = ((d.hitWid || 60) / 2) * Math.PI / 180;
                    skelCtx.beginPath(); skelCtx.moveTo(0, 0);
                    skelCtx.arc(0, 0, (d.hitLen || 40) * zoom, trueHitAngle - halfWidRad, trueHitAngle + halfWidRad);
                    skelCtx.fillStyle = "rgba(231, 76, 60, 0.4)"; skelCtx.fill(); skelCtx.strokeStyle = "#e74c3c"; skelCtx.stroke();
                }
                skelCtx.restore();

                // --- FUNCIONES DE DIBUJO MODULARES ---
                const drawAccessory = () => {
                    if (d.wTileX !== undefined && d.wTileX !== null && wSprite && wSprite.complete) {
                        skelCtx.save();
                        skelCtx.translate(centerX + ((d.aX || 0) * zoom), centerY + ((d.aY || 0) * zoom));
                        skelCtx.rotate((d.aRot || 0) * Math.PI / 180);
                        skelCtx.drawImage(wSprite, d.wTileX * 16, d.wTileY * 16, 16, 16, -(16 * zoom) / 2, -(16 * zoom) / 2, 16 * zoom, 16 * zoom);
                        skelCtx.restore();
                    }
                };

                const drawWeapon = () => {
                    skelCtx.save();
                    skelCtx.translate(handX + ((d.wX || 0) * zoom), handY + ((d.wY || 0) * zoom));

                    let currentEditorRot = d.wRot || 0;

                    if (weaponsDB[testWeapon]) {
                        // 1. PISTOLAS (TILT / RECOIL)
                        if (weaponsDB[testWeapon].type === 'ranged' && testAnimPlaying) {
                            const elapsed = Date.now() - testAnimStart;
                            const recoilDuration = 150;
                            if (elapsed < recoilDuration) {
                                const progress = elapsed / recoilDuration;
                                const tiltAmount = Math.sin(progress * Math.PI) * (d.wSwg !== undefined ? d.wSwg : 0);
                                // 🛑 EL FIX: Se resta directo. ¡Ya no multiplicamos por dirMult para que no salte al revés!
                                currentEditorRot -= tiltAmount;
                            } else {
                                testAnimPlaying = false;
                            }
                        }
                        // 2. ESPADAS (SWING)
                        else if (weaponsDB[testWeapon].type !== 'ranged' && isPreviewSwinging) {
                            const elapsed = Date.now() - previewSwingStart;
                            if (elapsed < 200) {
                                const progress = elapsed / 200;
                                // 🛑 EL FIX: Extraer el ángulo de forma segura
                                const swingArc = d.wSwg !== undefined ? d.wSwg : 90;
                                currentEditorRot += swingArc * progress;
                            }
                        }
                    }

                    const finalPreviewRot = aimAngle + (currentEditorRot * dirMult * Math.PI / 180);
                    skelCtx.rotate(finalPreviewRot);

                    if (wSprite && wSprite.complete) {
                        const pX = (weaponsDB[testWeapon].pivotX || 0) * zoom;
                        const pY = (weaponsDB[testWeapon].pivotY || 0) * zoom;

                        const frameW = 48; // FIJO
                        const frameH = 64; // FIJO

                        let srcY = dir * frameH; // Código limpio y estandarizado
                        skelCtx.drawImage(wSprite, 0, srcY, frameW, frameH, -pX - (frameW * zoom / 2), -pY - (frameH * zoom / 2), frameW * zoom, frameH * zoom);
                    }
                    skelCtx.restore();
                };

                const drawHand = () => {
                    if (bodyImg && bodyImg.complete) {
                        skelCtx.save();
                        skelCtx.translate(handX + ((d.wX || 0) * zoom), handY + ((d.wY || 0) * zoom));
                        skelCtx.rotate(totalWeaponRot);
                        skelCtx.translate(((d.hX || 0) * zoom), ((d.hY || 0) * zoom));
                        skelCtx.rotate((d.hRot || 0) * Math.PI / 180);
                        skelCtx.drawImage(bodyImg, (d.tX || 13) * 16, (d.tY || 0) * 16, 16, 16, -(16 * zoom) / 2, -(16 * zoom) / 2, 16 * zoom, 16 * zoom);
                        skelCtx.restore();
                    }
                };

                // 🔥 SISTEMA Z-INDEX (ORDEN DE RENDERIZADO) 🔥
                if (aZ === 0) drawAccessory();
                if (wZ === 0) drawWeapon();
                if (hZ === 0) drawHand();

                // DIBUJAR CUERPO
                if (bodyImg && bodyImg.complete) {
                    const baseR = SKELETON_DATA.states[state] || 0;
                    skelCtx.drawImage(bodyImg, safeFrame * FRAME_WIDTH, (baseR + dir) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, centerX, centerY, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);
                }

                // DIBUJAR CABEZA (AHORA USA headAnc SEGURO)
                if (headImg && headImg.complete) {
                    skelCtx.drawImage(headImg, (frame % 4) * FRAME_WIDTH, dir * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT, centerX + (headAnc[0] * zoom), centerY + (headAnc[1] * zoom), FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);
                }

                // DIBUJAR LOS DEL FRENTE
                if (aZ === 1) drawAccessory();
                if (wZ === 1) drawWeapon();
                if (hZ === 1) drawHand();
            }
        }

        // --- EVENTOS DEL RATÓN INTELIGENTES ---
        if (skelCanvas) {
            const canvasContainer = document.getElementById('skel-canvas-container');

            // --- DETECCIÓN DE CLIC EN EL CANVAS DEL EDITOR ---
            skelCanvas.onmousedown = (e) => {
                const rect = skelCanvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const zoom = 3;

                if (currentGaniTab === 'body') {
                    // Buscar el punto azul (Mano)
                    const state = document.getElementById('edit-skel-state').value;
                    const dir = parseInt(document.getElementById('edit-skel-dir').value);
                    const frame = parseInt(document.getElementById('edit-skel-frame').value);
                    const fKey = getFrameKey(state, dir, frame);
                    const anchors = SKELETON_DATA.anchors[fKey] || { handR: [12, 12] };

                    const handX = 128 + (anchors.handR[0] * zoom);
                    const handY = 128 + (anchors.handR[1] * zoom);

                    if (Math.hypot(mx - handX, my - handY) < 20) draggingAnchor = 'handR';
                }
                else if (currentGaniTab === 'weapon') {
                    // Buscar el punto rojo (Pivote)
                    const wId = player.equippedWeapon;
                    if (wId !== "none" && weaponsDB[wId]) {
                        // 🛑 EL FIX: Agregar '|| 0' para evitar errores si el arma es nueva
                        const px = 128 + ((weaponsDB[wId].pivotX || 0) * zoom);
                        const py = 128 + ((weaponsDB[wId].pivotY || 0) * zoom);

                        if (Math.hypot(mx - px, my - py) < 20) draggingAnchor = 'pivot';
                    }
                }
            };

            // --- ARRASTRAR EL PUNTO ---
            window.addEventListener('mousemove', (e) => {
                if (!draggingAnchor) return;

                const rect = skelCanvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const zoom = 3;

                if (draggingAnchor === 'handR' && currentGaniTab === 'body') {
                    const state = document.getElementById('edit-skel-state').value;
                    const dir = parseInt(document.getElementById('edit-skel-dir').value);
                    const frame = parseInt(document.getElementById('edit-skel-frame').value);
                    const fKey = getFrameKey(state, dir, frame);

                    SKELETON_DATA.anchors[fKey].handR[0] = Math.round((mx - 128) / zoom);
                    SKELETON_DATA.anchors[fKey].handR[1] = Math.round((my - 128) / zoom);
                }
                else if (draggingAnchor === 'pivot' && currentGaniTab === 'weapon') {
                    const wId = player.equippedWeapon;
                    if (wId !== "none" && weaponsDB[wId]) {
                        const newPx = Math.round((mx - 128) / zoom);
                        const newPy = Math.round((my - 128) / zoom);
                        weaponsDB[wId].pivotX = newPx;
                        weaponsDB[wId].pivotY = newPy;

                        // 🛑 EL ESCUDO: Actualizar solo si las cajitas existen en el HTML
                        const pXInput = document.getElementById('edit-pivot-x');
                        const pYInput = document.getElementById('edit-pivot-y');
                        if (pXInput) pXInput.value = newPx;
                        if (pYInput) pYInput.value = newPy;
                    }
                }
                updateSkelPreview();
            });

            window.addEventListener('mouseup', () => {
                draggingAnchor = null;
                if (canvasContainer) canvasContainer.style.cursor = 'grab';
            });

            // --- BOTÓN MAESTRO DE GUARDADO ---
            document.getElementById('save-skel-btn').onclick = () => {
                const btn = document.getElementById('save-skel-btn');
                const originalText = btn.innerText;
                btn.innerText = "Guardando...";

                // 1. SI ESTAMOS EN LA PESTAÑA "CUERPO" (BODY)
                if (currentGaniTab === 'body') {
                    ws.send(MessagePack.encode({
                        type: 'save_skeleton_data',
                        anchors: SKELETON_DATA.anchors
                    }));
                    btn.style.background = "#2ecc71";
                    btn.innerText = "¡Cuerpo Guardado!";
                }

                // 2. SI ESTAMOS EN LA PESTAÑA "PIVOTE" (WEAPON)
                else if (currentGaniTab === 'weapon') {
                    const wId = player.equippedWeapon;
                    if (wId !== "none" && weaponsDB[wId]) {
                        ws.send(MessagePack.encode({
                            type: 'update_weapon_pivot',
                            weaponId: wId,
                            // 🛑 EL FIX: Leemos directo de la memoria RAM, no del HTML
                            pivotX: weaponsDB[wId].pivotX || 0,
                            pivotY: weaponsDB[wId].pivotY || 0
                        }));
                        btn.style.background = "#2ecc71";
                        btn.innerText = "¡Pivote Guardado!";
                    }
                }

                // 3. SI ESTAMOS EN LA PESTAÑA "MELEE"
                else if (currentGaniTab === 'melee') {
                    const wId = player.equippedWeapon;

                    // 🛑 EL FIX: Quitamos la regla "&& weaponsDB[wId].type === 'melee'"
                    if (wId !== "none" && weaponsDB[wId]) {

                        const safeDirStats = (weaponsDB[wId].dirStats && weaponsDB[wId].dirStats[currentEditDir])
                            ? weaponsDB[wId].dirStats[currentEditDir] : {};

                        const updatedDirStats = {
                            // Hitbox
                            hitX: parseInt(document.getElementById('sl-hitx').value) || 0,
                            hitY: parseInt(document.getElementById('sl-hity').value) || 0,
                            hitRot: parseInt(document.getElementById('sl-hitrot').value) || 0,
                            hitLen: parseInt(document.getElementById('sl-hitlen').value) || 40,
                            hitWid: parseInt(document.getElementById('sl-hitwid').value) || 60,

                            // Arma
                            wZ: parseInt(document.getElementById('sl-wz').value) === 0 ? 0 : 1, // 🔥 NUEVO Z-INDEX
                            wX: parseInt(document.getElementById('sl-wx').value) || 0,
                            wY: parseInt(document.getElementById('sl-wy').value) || 0,
                            wRot: parseInt(document.getElementById('sl-wrot').value) || 0,
                            wSwg: parseInt(document.getElementById('sl-wswg').value) || 90,

                            // Mano
                            hZ: parseInt(document.getElementById('sl-hz').value) === 0 ? 0 : 1, // 🔥 NUEVO Z-INDEX
                            hX: parseInt(document.getElementById('sl-hx').value) || 0,
                            hY: parseInt(document.getElementById('sl-hy').value) || 0,
                            hRot: parseInt(document.getElementById('sl-hrot').value) || 0,

                            // Accesorio
                            aZ: parseInt(document.getElementById('sl-az').value) === 0 ? 0 : 1, // 🔥 NUEVO Z-INDEX
                            aX: parseInt(document.getElementById('sl-ax').value) || 0,
                            aY: parseInt(document.getElementById('sl-ay').value) || 0,
                            aRot: parseInt(document.getElementById('sl-arot').value) || 0,

                            // Tiles del Sprite Picker
                            tX: safeDirStats.tX !== undefined ? safeDirStats.tX : 13,
                            tY: safeDirStats.tY !== undefined ? safeDirStats.tY : 0,
                            wTileX: safeDirStats.wTileX !== undefined ? safeDirStats.wTileX : null,
                            wTileY: safeDirStats.wTileY !== undefined ? safeDirStats.wTileY : null,
                            kb: parseInt(document.getElementById('sl-kb') ? document.getElementById('sl-kb').value : 0),
                            freeze: parseInt(document.getElementById('sl-freeze') ? document.getElementById('sl-freeze').value : 0),
                        };

                        ws.send(MessagePack.encode({
                            type: 'update_melee_stats',
                            weaponId: wId,
                            direction: currentEditDir,
                            stats: updatedDirStats
                        }));

                        btn.style.background = "#2ecc71";
                        btn.innerText = "¡Dirección Guardada!";
                    } else {
                        alert("⚠️ Equipa un arma tipo 'melee' para guardar estas estadísticas.");
                        btn.innerText = originalText;
                    }
                }

                // Devolver el botón a su estado normal después de 2 segundos
                setTimeout(() => {
                    btn.style.background = "#0e639c";
                    btn.innerText = "💾 Guardar Esqueleto";
                }, 2000);
            };
        }

        function drawGizmo(x, y, color) {
            skelCtx.fillStyle = color;
            skelCtx.beginPath(); skelCtx.arc(x, y, 6, 0, Math.PI * 2); skelCtx.fill();
            skelCtx.strokeStyle = "white"; skelCtx.stroke();
        }

        function drawModularCharacter(ctx, p, drawX, drawY, zoom) {
            // ==========================================================
            // 🛑 NUEVO SISTEMA DE ROPA (GUARDARROPA DINÁMICO) 🛑
            // ==========================================================
            const equippedBody = (p.equipped && p.equipped.body) ? p.equipped.body : 'body_default';
            const equippedHead = (p.equipped && p.equipped.head) ? p.equipped.head : 'head_default';

            // Sacamos la imagen del catálogo. Si no existe o no ha cargado, usamos la global por defecto
            const dynBodyImg = (window.loadedItemSprites && window.loadedItemSprites[equippedBody]) ? window.loadedItemSprites[equippedBody] : bodyImg;
            const dynHeadImg = (window.loadedItemSprites && window.loadedItemSprites[equippedHead]) ? window.loadedItemSprites[equippedHead] : headImg;
            // ==========================================================

            const dirIdx = p.frameY;
            let state = "idle";
            let maxFrames = 4;
            let displayFrameX = p.frameX;

            // --- LÓGICA DE ESTADOS Y ARMAS ---
            
            // 🪑 CHEQUEO DE SILLA Y ESTADO DE MOVIMIENTO
            let isSitting = p.isSitting || false;
            
            // 🚀 FIX ANIMACIONES: Usamos isVisuallyMoving para los otros (suavizado) y isMoving para el local (instantáneo)
            const currentlyMoving = p.isVisuallyMoving !== undefined ? p.isVisuallyMoving : p.isMoving;

            if (isSitting) {
                state = "sit";
                maxFrames = 1; // Solo 1 frame (estático)
                displayFrameX = 0;
            } else if (p.equippedWeapon && p.equippedWeapon !== "none") {
                state = "walk_armed";
                if (currentlyMoving) {
                    maxFrames = 6;
                } else {
                    maxFrames = 6;
                    displayFrameX = 0;
                }
            } else {
                state = currentlyMoving ? "walk_unarmed" : "idle";
                maxFrames = currentlyMoving ? 8 : 4;
            }

            const safeFrameX = displayFrameX % maxFrames;
            const baseRow = SKELETON_DATA.states[state] || 0;
            const offsetX = drawX - ((FRAME_WIDTH / 2) * zoom);
            const offsetY = drawY - ((FRAME_HEIGHT / 2) * zoom);

            // --- ANCLAS Y POSICIONES BASE (SEGURO) ---
            const fKey = getFrameKey(state, dirIdx, safeFrameX);
            const rawAnchors = SKELETON_DATA.anchors[fKey] || {};

            const headAnc = rawAnchors.head || [0, 0];
            const handAnc = rawAnchors.handR || [12, 12];

            const handX = drawX + (handAnc[0] * zoom);
            const handY = drawY + (handAnc[1] * zoom);

            // --- EXTRAER ESTADÍSTICAS Y CAPAS (Z-INDEX) ---
            let stats = {}; let d = {};
            let aZ = 1, wZ = 1, hZ = 1;

            if (p.equippedWeapon && p.equippedWeapon !== "none" && weaponsDB[p.equippedWeapon]) {
                stats = weaponsDB[p.equippedWeapon];
                d = stats.dirStats ? (stats.dirStats[dirIdx] || stats.dirStats[0] || {}) : {};
                aZ = d.aZ !== undefined ? d.aZ : 1;
                wZ = d.wZ !== undefined ? d.wZ : 1;
                hZ = d.hZ !== undefined ? d.hZ : 1;
            }

            // --- ROTACIÓN MATEMÁTICA AUTOMÁTICA (SOLO PARA MELEE) ---
            let baseAimAngle = 0; let dirM = 1;

            // Si NO es ranged, aplicamos la rotación forzada
            if (stats.type !== 'ranged') {
                if (dirIdx === 0) baseAimAngle = Math.PI / 2;
                else if (dirIdx === 1) { baseAimAngle = Math.PI; dirM = -1; }
                else if (dirIdx === 3) { baseAimAngle = -Math.PI / 2; dirM = -1; }
            }

            // 🔥 LA ANIMACIÓN DINÁMICA DEL JUEGO REAL 🔥
            let currentAnimRot = d.wRot || 0;

            // 🛑 NUEVAS VARIABLES PARA EL EMPUJE (STAB)
            let stabOffsetX = 0;
            let stabOffsetY = 0;

            // 1. Animación de Ataque Melee (Swing o Stab)
            if (p.isSwinging && stats.type !== 'ranged') {
                const elapsed = Date.now() - (p.swingStartTime || 0);
                if (elapsed < (p.swingDuration || 200)) {
                    const progress = elapsed / (p.swingDuration || 200);

                    // 🛑 BIFURCACIÓN: ¿Es el recogedor de basura u otra arma?
                    if (stats.id === 'trash_picker') {
                        // Animación STAB: Efecto resorte (Math.sin) para ir hacia adelante y regresar
                        const stabDistance = 14; // Píxeles que se estira el brazo
                        const stabProgress = Math.sin(progress * Math.PI);

                        // Empujamos en la dirección a la que mira
                        if (dirIdx === 0) stabOffsetY = stabProgress * stabDistance;
                        else if (dirIdx === 1) stabOffsetX = -stabProgress * stabDistance;
                        else if (dirIdx === 2) stabOffsetX = stabProgress * stabDistance;
                        else if (dirIdx === 3) stabOffsetY = -stabProgress * stabDistance;
                    } else {
                        // Animación SWING NORMAL (Giro de espada)
                        currentAnimRot += (d.wSwg || 90) * progress;
                    }
                } else {
                    p.isSwinging = false;
                }
            }
            // 2. Animación de Pistola (Recoil / Tilt)
            else if (stats.type === 'ranged') {
                const timeSinceShot = Date.now() - (p.lastShotTime || 0);
                const recoilDuration = Math.min(150, (stats.fireRate || 300) / 2);
                if (timeSinceShot < recoilDuration) {
                    const progress = timeSinceShot / recoilDuration;
                    const tiltAmount = Math.sin(progress * Math.PI) * (d.wSwg || 0);
                    currentAnimRot -= (tiltAmount * dirM);
                }
            }

            const totalWeaponRot = baseAimAngle + (currentAnimRot * dirM * Math.PI / 180);

            // ==========================================================
            // 🔥 MINI-FUNCIONES DE DIBUJO MODULAR (SINCRONIZADAS AL 100%) 🔥
            // ==========================================================
            const drawAccessory = () => {
                if (p.equippedWeapon && loadedWeaponSprites[p.equippedWeapon]) {
                    const wSprite = loadedWeaponSprites[p.equippedWeapon];

                    ctx.save();
                    ctx.translate(offsetX + ((d.aX || 0) * zoom), offsetY + ((d.aY || 0) * zoom));
                    if (d.aRot) ctx.rotate(d.aRot * Math.PI / 180);

                    const wW = 48; // FIJO
                    const wH = 64; // FIJO
                    let srcY = dirIdx * wH;
                    // Columna 1 (X = 48) para el Accesorio
                    ctx.drawImage(wSprite, 48, srcY, wW, wH, -(wW * zoom) / 2, -(wH * zoom) / 2, wW * zoom, wH * zoom);
                    ctx.restore();
                }
            };

            const drawWeapon = () => {
                if (p.equippedWeapon && loadedWeaponSprites[p.equippedWeapon]) {
                    const wSprite = loadedWeaponSprites[p.equippedWeapon];
                    const pivotX = (stats.pivotX || 0) * zoom;
                    const pivotY = (stats.pivotY || 0) * zoom;

                    ctx.save();
                    ctx.translate(handX + ((d.wX || 0) * zoom) + (stabOffsetX * zoom), handY + ((d.wY || 0) * zoom) + (stabOffsetY * zoom));
                    ctx.rotate(totalWeaponRot);

                    const wW = 48; // FIJO
                    const wH = 64; // FIJ0

                    let srcY = dirIdx * wH;
                    // Columna 0 (X = 0) para el Arma Principal
                    ctx.drawImage(wSprite, 0, srcY, wW, wH, -pivotX - ((wW * zoom) / 2), -pivotY - ((wH * zoom) / 2), wW * zoom, wH * zoom);
                    ctx.restore();
                }
            };

            const drawHand = () => {
                // 🛑 EL FIX DE ROPA DINÁMICA: Usamos dynBodyImg para asegurar que recorta la piel correcta
                if (p.equippedWeapon && loadedWeaponSprites[p.equippedWeapon] && dynBodyImg && dynBodyImg.complete) {
                    ctx.save();
                    ctx.translate(handX + ((d.wX || 0) * zoom) + (stabOffsetX * zoom), handY + ((d.wY || 0) * zoom) + (stabOffsetY * zoom));
                    ctx.rotate(totalWeaponRot);
                    ctx.translate(((d.hX || 0) * zoom), ((d.hY || 0) * zoom));
                    ctx.rotate((d.hRot || 0) * Math.PI / 180);

                    ctx.drawImage(dynBodyImg, (d.tX || 13) * 16, (d.tY || 0) * 16, 16, 16, -(16 * zoom) / 2, -(16 * zoom) / 2, 16 * zoom, 16 * zoom);
                    ctx.restore();
                }
            };

            // ==========================================================
            // 🔥 RENDERIZADO POR CAPAS (Z-INDEX) 🔥
            // ==========================================================
            if (aZ === 0 && !isSitting) drawAccessory();
            if (wZ === 0 && !isSitting) drawWeapon();
            if (hZ === 0 && !isSitting) drawHand();

            // 🛑 EL FIX DE ROPA DINÁMICA: Dibujamos el cuerpo con la textura del jugador actual
            if (dynBodyImg && dynBodyImg.complete) {
                ctx.drawImage(
                    dynBodyImg,
                    safeFrameX * FRAME_WIDTH, (baseRow + dirIdx) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
                    offsetX, offsetY, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom
                );
            }

            // 🛑 EL FIX DE ROPA DINÁMICA: Dibujamos la cabeza con la textura del jugador actual
            if (dynHeadImg && dynHeadImg.complete) {
                const headSafeFrame = displayFrameX % 4;
                ctx.drawImage(
                    dynHeadImg,
                    headSafeFrame * FRAME_WIDTH, dirIdx * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
                    offsetX + (headAnc[0] * zoom), offsetY + (headAnc[1] * zoom), FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom
                );
            }

            // ==========================================================
            // 🧠 EL WOBBLE (BAMBOLEO) MATEMÁTICO: Cabeza y Sombrero
            // ==========================================================
            // Secuencia: Centro(0), Abajo(1), Centro(0), Arriba(-1)
            const WOBBLE_PATTERN = [0, 1, 0, -1, 0, 1, 0, -1];
            const currentWalkFrame = displayFrameX % 8; // Sincronizado con las piernas
            const wobbleY = WOBBLE_PATTERN[currentWalkFrame] || 0;

            // Calculamos la coordenada FINAL una sola vez para ambos
            const finalHeadX = offsetX + (headAnc[0] * zoom);
            const finalHeadY = offsetY + ((headAnc[1] + wobbleY) * zoom);

            // 1. Dibujar CABEZA (Ahora usa X=0 siempre, porque es de 1 columna)
            if (dynHeadImg && dynHeadImg.complete && dynHeadImg.naturalWidth > 0) {
                const headFrameH = dynHeadImg.height / 4;
                ctx.drawImage(
                    dynHeadImg,
                    0, dirIdx * headFrameH, FRAME_WIDTH, headFrameH,
                    finalHeadX, finalHeadY, FRAME_WIDTH * zoom, headFrameH * zoom
                );
            }

            // 2. Dibujar SOMBRERO (Pegado a la cabeza matemáticamente)
            const equippedHat = (p.equipped && p.equipped.hat) ? p.equipped.hat : 'none';
            const dynHatImg = (window.loadedItemSprites && window.loadedItemSprites[equippedHat]);

            if (dynHatImg && dynHatImg.complete && dynHatImg.naturalWidth > 0) {
                const hatFrameH = dynHatImg.height / 4;
                ctx.drawImage(
                    dynHatImg,
                    0, dirIdx * hatFrameH, FRAME_WIDTH, hatFrameH,
                    finalHeadX, finalHeadY, FRAME_WIDTH * zoom, hatFrameH * zoom
                );
            }
            // ===========================================================

            if (aZ === 1 && !isSitting) drawAccessory();
            if (wZ === 1 && !isSitting) drawWeapon();
            if (hZ === 1 && !isSitting) drawHand();

            // 🛡️ RESPAWN SHIELD: Blue pulsing circle while invulnerable
            if (p.shieldUntil && Date.now() < p.shieldUntil) {
                const shieldRemaining = p.shieldUntil - Date.now();
                const shieldTotal = 2000;
                const pulse = Math.abs(Math.sin(Date.now() / 150));
                const alpha = (shieldRemaining / shieldTotal) * 0.55 * pulse;
                const radius = (FRAME_WIDTH / 2 + 4) * zoom;

                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.globalAlpha = Math.max(0.08, alpha);
                ctx.strokeStyle = '#00cfff';
                ctx.lineWidth = 2.5 * zoom;
                ctx.shadowColor = '#00cfff';
                ctx.shadowBlur = 10 * zoom;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.globalAlpha = Math.max(0.02, alpha * 0.4);
                ctx.fillStyle = '#00cfff';
                ctx.fill();
                ctx.restore();
            }
        } // <--- Fin de la función drawModularCharacter

        function executeTileLogic(logicTile, tileKey) {
            if (logicTile.triggerType === 'teleport') {
                player.isTeleporting = true;
                player.vx = 0; player.vy = 0; player.isMoving = false;
                const fade = document.getElementById('fade-overlay');
                fade.style.opacity = '1';
                setTimeout(() => {
                    player.worldX = (logicTile.destX * TILE_SIZE) + (TILE_SIZE / 2);
                    player.worldY = (logicTile.destY * TILE_SIZE) + (TILE_SIZE / 2);
                    lastNetworkString = "";
                    setTimeout(() => { fade.style.opacity = '0'; player.isTeleporting = false; }, 200);
                }, 250);
            }
            else if (logicTile.triggerType === 'shop' && logicTile.itemId) {
                if (!isShopOpen && lastShopTile !== tileKey) {
                    openShopModal(logicTile.itemId);
                    lastShopTile = tileKey;
                }
            }
            else if (logicTile.triggerType === 'junkyard') {
                if (!isJunkyardOpen && lastJunkyardTile !== tileKey) {
                    openJunkyardModal();
                    isJunkyardOpen = true;
                    lastJunkyardTile = tileKey;
                }
            }
            else if (logicTile.triggerType === 'npc' && logicTile.npcMessage) {
                // 👇 EL FIX: Evitar que el juego intente abrir el mensaje 60 veces por segundo 👇
                const box = document.getElementById('retro-dialog-box');
                const isBoxOpen = box && box.style.display === 'block';

                // Solo actuamos si la caja de texto NO está abierta en este momento
                if (!isBoxOpen) {
                    // Si es un NPC de "pisar", verificamos que no lo hayamos leído ya
                    if (!logicTile.requiresClick && lastNpcTile === tileKey) return;

                    showRetroDialog(logicTile.npcMessage);

                    // Si fue por pisar, guardamos el bloque en la memoria para no repetirlo
                    if (!logicTile.requiresClick) {
                        lastNpcTile = tileKey;
                    }
                }
            }
            else if (logicTile.triggerType === 'arena') {
                // 🔧 FIX DE ID: El servidor guarda arenas como "arena_X_Y" (guiones bajos)
                // El tileKey puede venir como "X,Y" o "X,Y,15" — lo parseamos para extraer X e Y
                const parts = tileKey.toString().split(',');
                const arenaGridX = parseInt(parts[0]);
                const arenaGridY = parseInt(parts[1]);
                const correctArenaId = `arena_${arenaGridX}_${arenaGridY}`;

                // Guard: solo abrir/consultar si no está ya abierto con este mismo arenaId
                if (window.currentViewingArenaId !== correctArenaId) {
                    window.currentViewingArenaId = correctArenaId;
                    ws.send(MessagePack.encode({ type: 'get_arena_info', arenaId: correctArenaId }));
                    document.getElementById('arena-modal').style.display = 'flex';
                }
            }
            else if (logicTile.triggerType === 'jeweler') {
                if (!isJewelerOpen && lastJewelerTile !== tileKey) {
                    openJewelerModal();
                    isJewelerOpen = true;
                    lastJewelerTile = tileKey;
                }
            }
        }

        const closeArenaBtn = document.getElementById('close-arena-modal');
        if (closeArenaBtn) {
            closeArenaBtn.onclick = () => {
                document.getElementById('arena-modal').style.display = 'none';
                window.currentViewingArenaId = null; // Limpiamos la memoria
            };
        }
        const rankLogosCache = {};

        function getPlayerRank(elo) {
            if (!window.RANKS || window.RANKS.length === 0) return null;
            // Ranks are sorted highest to lowest. Find the first one they qualify for.
            const rank = window.RANKS.find(r => elo >= r.minElo) || window.RANKS[window.RANKS.length - 1];

            if (rank && !rankLogosCache[rank.src]) {
                const img = new Image();
                img.src = rank.src;
                rankLogosCache[rank.src] = img;
            }
            return rank;
        }

        // =========================================================
        // ⭐ SISTEMA QUICK SWAP (HOTKEYS DESLIZABLES) ⭐
        // =========================================================
        const btnQuickSwap = document.getElementById('btn-quickswap-item');
        const quickSwapMenu = document.getElementById('quickswap-menu');
        const quickSwapList = document.getElementById('quickswap-list');

        // 1. Conectar el Botón del Inspector
        btnQuickSwap.onclick = () => {
            if (!player.quickSwaps) player.quickSwaps = [];

            // Si ya lo tiene, lo quitamos. Si no, lo agregamos.
            if (player.quickSwaps.includes(currentInspectingItemId)) {
                player.quickSwaps = player.quickSwaps.filter(id => id !== currentInspectingItemId);
                btnQuickSwap.innerText = "⭐ Hotkey";
                btnQuickSwap.style.background = "#9b59b6";
                btnQuickSwap.style.boxShadow = "0 4px 0 #8e44ad";
            } else {
                // Límite de 4 armas para que el menú no mida 3 metros
                if (player.quickSwaps.length >= 16) player.quickSwaps.shift(); // Ahora soporta hasta 16 armas favoritas
                player.quickSwaps.push(currentInspectingItemId);

                btnQuickSwap.innerText = "✅ Guardado";
                btnQuickSwap.style.background = "#7f8c8d";
                btnQuickSwap.style.boxShadow = "0 4px 0 #34495e";
            }

            // 👇 LA LÍNEA MÁGICA: Enviar al servidor en tiempo real 👇
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'update_quickswaps', quickSwaps: player.quickSwaps }));
            }
        };

        // 3. Función para Abrir el Cajón de Armas
        const openQuickSwapDrawer = () => {
            quickSwapList.innerHTML = "";

            if (!player.quickSwaps || player.quickSwaps.length === 0) {
                quickSwapList.innerHTML = "<div style='color:#aaa; font-size:10px; text-align:center;'>Vacío</div>";
            } else {
                player.quickSwaps.forEach(itemId => {
                    const btn = document.createElement('div');
                    btn.style.width = "46px";
                    btn.style.height = "46px";
                    btn.style.background = "rgba(0,0,0,0.6)";
                    btn.style.border = "1px solid rgba(255,255,255,0.2)";
                    btn.style.borderRadius = "8px";
                    btn.style.display = "flex";
                    btn.style.justifyContent = "center";
                    btn.style.alignItems = "center";
                    btn.style.cursor = "pointer";
                    btn.style.transition = "0.2s";

                    const icon = getWeaponIcon(itemId);
                    if (icon) {
                        icon.style.transform = "scale(1.3)"; // 🔥 Súper Zoom del 150%
                        btn.appendChild(icon);
                    }

                    btn.onpointerdown = (e) => {
                        if (e) e.preventDefault();

                        // 💾 GUARDAR EL ESTADO ANTES DEL SWAP
                        const previousWeapon = player.equippedWeapon;
                        if (previousWeapon !== "none" && WEAPONS[previousWeapon] && WEAPONS[previousWeapon].type === 'ranged') {
                            player.weaponAmmo[previousWeapon] = player.ammo;
                        }

                        player.hotbar[player.activeSlot] = itemId;
                        player.equippedWeapon = itemId;

                        playItemSound(player.equippedWeapon, 'equip', 0.5);

                        if (player.reloadTimeout) clearTimeout(player.reloadTimeout);

                        const stats = WEAPONS[itemId];
                        if (stats && stats.type !== 'melee') {
                            // 💾 CARGAR EL ESTADO
                            if (player.weaponAmmo[itemId] === undefined) {
                                player.weaponAmmo[itemId] = stats.magSize;
                            }
                            player.ammo = player.weaponAmmo[itemId];

                            if (player.ammo <= 0) {
                                player.isReloading = true;
                                playItemSound(itemId, 'reload', 0.6);
                                player.reloadTimeout = setTimeout(() => {
                                    player.ammo = stats.magSize;
                                    if (ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                                    player.weaponAmmo[itemId] = stats.magSize;
                                    player.isReloading = false;
                                }, stats.reloadTime);
                            } else {
                                player.isReloading = false;
                            }
                        } else {
                            player.ammo = Infinity;
                            player.isReloading = false;
                        }

                        renderHudHotbar();
                        quickSwapMenu.style.display = 'none';

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({ type: 'update_hotbar', slotIndex: player.activeSlot, weaponId: itemId }));
                            ws.send(MessagePack.encode({ type: 'equip_weapon', weaponId: itemId }));
                        }
                    };

                    quickSwapList.appendChild(btn);
                });
            }

            quickSwapMenu.style.display = 'flex';
        };

        // 4. Detección de Gestos (Swipe Left & Long Press)
        const hudHotbarEl = document.getElementById('hud-hotbar');
        let hotbarTouchStartX = 0;
        let hotbarTouchStartY = 0;
        let qsLongPressTimer = null;

        hudHotbarEl.addEventListener('touchstart', (e) => {
            hotbarTouchStartX = e.touches[0].clientX;
            hotbarTouchStartY = e.touches[0].clientY;

            // Si mantienes el dedo 400ms, se abre el menú
            qsLongPressTimer = setTimeout(() => {
                openQuickSwapDrawer();
            }, 400);
        }, { passive: true });

        hudHotbarEl.addEventListener('touchmove', (e) => {
            if (!hotbarTouchStartX) return;

            let currentX = e.touches[0].clientX;
            let currentY = e.touches[0].clientY;
            let diffX = hotbarTouchStartX - currentX; // Positivo = Swipe a la izquierda
            let diffY = Math.abs(hotbarTouchStartY - currentY);

            // Si deslizas rápido a la izquierda (más de 30px)
            if (diffX > 30 && diffY < 40) {
                clearTimeout(qsLongPressTimer); // Cancelamos el long-press
                openQuickSwapDrawer();
                hotbarTouchStartX = null; // Reset para no abrirlo 10 veces
            }
        }, { passive: true });

        hudHotbarEl.addEventListener('touchend', () => {
            clearTimeout(qsLongPressTimer); // Si sueltas el dedo rápido, no se abre
            hotbarTouchStartX = null;
        });

        // Soporte para PC: Clic Derecho en el Hotbar abre el menú
        hudHotbarEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openQuickSwapDrawer();
        });

        // Cerrar el menú si haces clic o tocas cualquier otra parte de la pantalla
        window.addEventListener('mousedown', (e) => {
            if (quickSwapMenu.style.display === 'flex' && !quickSwapMenu.contains(e.target) && !hudHotbarEl.contains(e.target)) {
                quickSwapMenu.style.display = 'none';
            }
        });
        window.addEventListener('touchstart', (e) => {
            if (quickSwapMenu.style.display === 'flex' && !quickSwapMenu.contains(e.target) && !hudHotbarEl.contains(e.target)) {
                quickSwapMenu.style.display = 'none';
            }
        });

        // ⏱️ VARIABLES DEL GAME LOOP (FPS cap dinámico segun gameSettings)
        let lastFrameTime = performance.now();
        const FPS_TARGET  = 60;
        const FRAME_MIN_TIME = 1000 / FPS_TARGET; // ~16.66ms

        // 📱 ROLLING AVERAGE DELTATIME (Absorbs single spike frames)
        const DT_HISTORY_SIZE = 4;
        const dtHistory = [FRAME_MIN_TIME, FRAME_MIN_TIME, FRAME_MIN_TIME, FRAME_MIN_TIME];
        let dtHistoryIdx = 0;

        let networkTimer = 0;
        const NETWORK_TICK_RATE = 50; // Enviar datos cada 50ms (20 veces por segundo)

        // 📊 Variables del Monitor
        let fpsFrameCount = 0;
        let fpsLastUpdate = performance.now();
        let frameTimesTotal = 0; // Acumulador para promediar el Frame Time

        const uiAmmoDisplay = document.getElementById('ammo-display');
        const uiAmmoCurrent = document.getElementById('ammo-current');
        const uiAmmoMax = document.getElementById('ammo-max');
        const uiPerfMonitor = document.getElementById('perf-monitor');

        // ⚡ HELPER: envuelve ctx.shadowBlur para respetar disableShadows.
        // Todos los draws que usaban !isTouchDevice ya no necesitan cambio,
        // solo reemplazamos la asignación directa por setShadow().
        function setShadow(blur, color) {
            if (gameSettings.disableShadows || isTouchDevice) {
                ctx.shadowBlur = 0;
            } else {
                ctx.shadowBlur  = blur;
                ctx.shadowColor = color || 'transparent';
            }
        }

        function update(currentTime) {
            // 1. Pedir el siguiente frame
            requestAnimationFrame(update);

            if (!currentTime) currentTime = performance.now();
            let rawDelta = currentTime - lastFrameTime;

            // ⚡ FPS CAP DINÁMICO
            const minFrameMs = gameSettings.fpsCap >= 60 ? 10 : (1000 / gameSettings.fpsCap) - 2;
            if (rawDelta < minFrameMs) return;

            // 📱 ROLLING AVERAGE: smooth out single spike frames
            const dtClamped = Math.min(rawDelta, 50); // hard cap 50ms to stop teleport on resume
            dtHistory[dtHistoryIdx] = dtClamped;
            dtHistoryIdx = (dtHistoryIdx + 1) % DT_HISTORY_SIZE;
            const dtMs = (dtHistory[0] + dtHistory[1] + dtHistory[2] + dtHistory[3]) / DT_HISTORY_SIZE;

            lastFrameTime = currentTime;
            
            // 🛑 THE DASH FIX: Cap dtScale so physics don't rubber-band forward during lag spikes
            let dtScale = dtMs / FRAME_MIN_TIME;
            if (dtScale > 1.2) dtScale = 1.2;
            if (dtScale < 0.8) dtScale = 0.8;

            // 📊 CALCULADORA MAESTRA DE RENDIMIENTO (Siempre activa para proteger el celular)
            fpsFrameCount++;
            frameTimesTotal += rawDelta; // Sumamos el MS real de la computadora

            if (currentTime - fpsLastUpdate >= 1000) {
                const currentFps = fpsFrameCount;
                const avgFrameTime = (frameTimesTotal / fpsFrameCount).toFixed(1);

                // =========================================================
                // 🚀 LA MAGIA DE LA RESOLUCIÓN DINÁMICA AUTÓNOMA
                // =========================================================
                fpsHistory.push(currentFps);
                if (fpsHistory.length > 3) fpsHistory.shift(); // Memoria de 3 segundos

                // Analizar si el dispositivo se está ahogando
                if (currentTime - lastResolutionCheck > 3000 && fpsHistory.length === 3) {
                    const avgFps = (fpsHistory[0] + fpsHistory[1] + fpsHistory[2]) / 3;

                    // Si el promedio cae por debajo de 40 FPS, encogemos los gráficos internos
                    if (avgFps < 40 && dynamicRenderScale > 0.5) {
                        dynamicRenderScale -= 0.25; // Baja al 75%, luego al 50% si es necesario
                        resize(); // Detonar el recálculo al instante

                        spawnDamageText(player.worldX, player.worldY, "📉 Optimizando", true);

                        fpsHistory = []; // Reset para darle tiempo al celular de respirar
                        lastResolutionCheck = currentTime + 2000; // Extra cooldown de gracia
                    }
                    lastResolutionCheck = currentTime;
                }
                // =========================================================

                // Dibujado del Monitor en Pantalla (Si el usuario lo prendió en Opciones)
                if (gameSettings.showPerformance && uiPerfMonitor) {
                    const hexColor = currentFps >= 55 ? '#2ecc71' : (currentFps >= 30 ? '#f1c40f' : '#e74c3c');
                    uiPerfMonitor.style.color = hexColor;
                    uiPerfMonitor.style.borderColor = hexColor;
                    uiPerfMonitor.innerHTML = ` ${currentFps} FPS | ${avgFrameTime} ms`;
                    uiPerfMonitor.style.display = 'block';
                } else if (uiPerfMonitor) {
                    uiPerfMonitor.style.display = 'none';
                }

                fpsFrameCount = 0;
                frameTimesTotal = 0;
                fpsLastUpdate = currentTime;
            }

            const now = Date.now();

            // 🪑 CHEQUEO GLOBAL DE SILLA PARA ESTE FRAME
            if (player) {
                player.isSitting = false;
                const gX = Math.floor(player.worldX / TILE_SIZE);
                const gY = Math.floor(player.worldY / TILE_SIZE);
                for (let l = 15; l >= 0; l--) {
                    const t = worldMap.get(getMapKey(gX, gY, l));
                    if (t && t.isSit) {
                        player.isSitting = true;
                        break;
                    }
                }
            }

            // 🧹 CLIENT-SIDE GARBAGE COLLECTOR
            // If we haven't heard from a player in 5 seconds, assume they walked out of our Zone and delete them.
            for (let id in otherPlayers) {
                // 🛑 FAILSAFE 3: Proteger contra variables nulas
                if (!otherPlayers[id]) {
                    delete otherPlayers[id];
                    continue;
                }
                if (now - (otherPlayers[id].lastUpdateTick || now) > 5000) {
                    delete otherPlayers[id];
                }
            }
            // Si por algún error el loading se queda pegado, lo forzamos a cerrar al movernos
            if (isCinematicLoading && (player.vx !== 0 || player.vy !== 0 || isMouseDown)) {
                isCinematicLoading = false;
                floorDirty = false;
                if (uiLoadingScreen) uiLoadingScreen.style.display = 'none';
            }
            // ... resto del código ...
            // 🎮 CAMERA: direct player position, no lag, no lerp.
            // Smooth camera caused 'dash and come back' jitter — the lag created
            // a rubber-band effect as the camera rushed to catch up each frame.
            // Teleport detection: if player jumped > 80 units, mark floor dirty so
            // the map redraws immediately at the new position.
            const prevRenderX = window._lastRenderX || player.worldX;
            const prevRenderY = window._lastRenderY || player.worldY;
            if (Math.hypot(player.worldX - prevRenderX, player.worldY - prevRenderY) > 80) {
                floorDirty = true;
            }
            window._lastRenderX = player.worldX;
            window._lastRenderY = player.worldY;

            // Use player position directly — no pixel-snap, just Math.floor at draw time
            const renderWorldX = player.worldX;
            const renderWorldY = player.worldY;

            // Centro de pantalla en píxeles CSS enteros
            const screenCenterX = Math.floor(cachedScreenWidth  / 2);
            const screenCenterY = Math.floor(cachedScreenHeight / 2);
            // --- NEW: SLIDING COLLISION CHECK ---
            const checkWall = (x, y) => { if (window.adminNoclip) return false;
                // 👇 NUEVO: COLISIÓN LOCAL DE LA BASE (Mismo código que en el servidor) 👇
                if (centralBase) {
                    const bx = centralBase.worldX + (centralBase.hitboxOffsetX || 0);
                    const by = centralBase.worldY + (centralBase.hitboxOffsetY || 0);
                    const hw = (centralBase.hitboxW || 32) / 2;
                    const hh = (centralBase.hitboxH || 32) / 2;

                    if (x >= bx - hw && x <= bx + hw && y >= by - hh && y <= by + hh) {
                        return true;
                    }
                }

                const gx = Math.floor(x / TILE_SIZE);
                const gy = Math.floor(y / TILE_SIZE);

                for (let l = 0; l <= 15; l++) {
                    const tile = worldMap.get(getMapKey(gx, gy, l));
                    if (tile && tile.hasCollision) return true;
                }
                return false;
            };



            // --- SI ESTOY MUERTO O VIAJANDO, NO ME PUEDO MOVER NI DISPARAR ---
            if (player.isDead || player.isTeleporting) {
                player.vx = 0;
                player.vy = 0;
                player.isMoving = false;
                isShooting = false; // 🛑 Apaga el gatillo para que no salgan balas fantasma

                // Limpiar teclas en PC por si se quedaron pegadas
                if (!isTouchDevice) {
                    keys.w = false; keys.a = false; keys.s = false; keys.d = false;
                }
            }

            // --- EL FIX: INMOVILIZAR AL RECARGAR ---
            if (player.isReloading) {
                player.vx = 0;
                player.vy = 0;
                player.isMoving = false;
            }

            /// --- CONTROLES HÍBRIDOS (MOUSE + TOUCH) ---
            if (!player.isDead) {

                // 🛑 EL FIX: SISTEMA DE HIT-STOP SUAVE (SIN JITTER) 🛑
                let speedMult = 1;
                if (player.equippedWeapon !== "none" && WEAPONS[player.equippedWeapon]) {
                    const wStats = WEAPONS[player.equippedWeapon];
                    const d = wStats.dirStats ? (wStats.dirStats[player.frameY] || wStats.dirStats[0] || {}) : {};
                    const freezeMs = Number(d.freeze) || 0;

                    if (freezeMs > 0) {
                        const timeSinceAttack = Date.now() - Math.max(player.swingStartTime || 0, player.lastShotTime || 0);
                        if (timeSinceAttack < freezeMs) {
                            // En lugar de detenerlo a 0, lo ralentizamos al 10%. 
                            // Da sensación de "impacto pesado" pero sin trabar la cámara.
                            speedMult = 0.1;
                        }
                    }
                }

                // 1. MOVIMIENTO
                if (!player.isReloading) {
                    if (!isTouchDevice) {
                        let moveX = 0; let moveY = 0;
                        if (keys.w) moveY -= 1;
                        if (keys.s) moveY += 1;
                        if (keys.a) moveX -= 1;
                        if (keys.d) moveX += 1;

                        if (moveX !== 0 || moveY !== 0) {
                            const length = Math.sqrt(moveX * moveX + moveY * moveY);
                            moveX /= length; moveY /= length;
                            // 🚀 EL FIX FÍSICO: Usamos dtScale (1.0) en vez del viejo cálculo
                            player.vx = moveX * (player.speed * speedMult) * dtScale;
                            player.vy = moveY * (player.speed * speedMult) * dtScale;
                            player.isMoving = true;
                        } else {
                            player.vx = 0; player.vy = 0; player.isMoving = false;
                        }
                    } else {
                        // 📱 MOVIMIENTO INSTANTÁNEO 1:1 (Sin aceleración ni retraso)
                        player.vx = (player.joyX || 0) * (player.speed * speedMult) * dtScale;
                        player.vy = (player.joyY || 0) * (player.speed * speedMult) * dtScale;
                        player.isMoving = (Math.abs(player.joyX || 0) > 0.02 || Math.abs(player.joyY || 0) > 0.02);
                    }
                } else {
                    player.vx = 0; player.vy = 0; player.isMoving = false;
                }

                // 💥 NUEVO: MOTOR DE INERCIA Y FRICCIÓN (KNOCKBACK) 💥
                player.kbX = player.kbX || 0;
                player.kbY = player.kbY || 0;

                player.vx += player.kbX;
                player.vy += player.kbY;

                player.kbX *= 0.8;
                player.kbY *= 0.8;
                if (Math.abs(player.kbX) < 0.2) player.kbX = 0;
                if (Math.abs(player.kbY) < 0.2) player.kbY = 0;

                // 🛑 EL FIX 3: La animación se mantiene viva mientras resbales 
                // O mientras el cronómetro de 300ms siga activo.
                if (player.kbX !== 0 || player.kbY !== 0 || (Date.now() - (player.staggerTimer || 0) < 1000)) {
                    player.isMoving = true;
                }

                // 2. APUNTADO Y DISPARO
                if (!editMode) {
                    // 💻 Si estamos en PC, el Ratón controla hacia dónde miramos SIEMPRE
                    if (!isTouchDevice) {
                        const dx = mouseX - screenCenterX;
                        const dy = mouseY - screenCenterY;
                        shootAngle = Math.atan2(dy, dx);

                        if (isMouseDown) {
                            isShooting = true;
                        } else {
                            isShooting = false;
                        }
                    }
                    // 📱 Si estamos en CELULAR, el Joystick Derecho (aimZone) ya controló 
                    // 'shootAngle' e 'isShooting' al mover el dedo, no sobreescribimos nada aquí.
                }
            }



            // --- DETECCIÓN DE LÓGICA PASIVA (CAPA 15 AL PISAR) ---
            player.inSafeZone = false;

            if (!player.isDead && !editMode && !player.isTeleporting) {
                const currentGridX = Math.floor(player.worldX / TILE_SIZE);
                const currentGridY = Math.floor(player.worldY / TILE_SIZE);

                const currentTileKey = getMapKey(currentGridX, currentGridY, 15);
                const logicTile = worldMap.get(currentTileKey);

                // 🛑 EL FIX: Solo lo activamos automáticamente si NO requiere clic
                if (logicTile && !logicTile.requiresClick) {
                    executeTileLogic(logicTile, currentTileKey);
                } else {
                    if (lastShopTile !== currentTileKey && !isShopOpen) lastShopTile = null;
                    if (lastJunkyardTile !== currentTileKey && !isJunkyardOpen) lastJunkyardTile = null;
                    if (lastJewelerTile !== currentTileKey && !isJewelerOpen) lastJewelerTile = null; // 👈 AÑADE ESTO
                    // 👇 NUEVO FIX: Liberar al NPC cuando te bajas del bloque 👇
                    const box = document.getElementById('retro-dialog-box');
                    if (lastNpcTile !== currentTileKey && (!box || box.style.display === 'none')) {
                        lastNpcTile = null;
                    }
                }
            }
            // 👇 NUEVO: ESCÁNER MATEMÁTICO DE ZONAS HÍBRIDO (Safezones + Techos) 👇
            player.inSafeZone = false;
            let isUnderRoof = false; // 🏠 Variable del techo inicializada por defecto

            for (let i = 0; i < safeZones.length; i++) {
                let z = safeZones[i];

                // Si estamos parados dentro de ESTE rectángulo específico:
                if (player.worldX >= z.xMin && player.worldX <= z.xMax && player.worldY >= z.yMin && player.worldY <= z.yMax) {

                    // ¿Es zona segura?
                    if (!z.zoneType || z.zoneType === 'safe') {
                        player.inSafeZone = true;
                    }

                    // ¿Es una zona de Techo/Interior?
                    if (z.zoneType === 'indoor') {
                        isUnderRoof = true;
                    }
                }
            }

            // MOSTRAR/OCULTAR EL TEXTO EN PANTALLA
            if (safeZoneUI) {
                safeZoneUI.style.display = player.inSafeZone ? 'block' : 'none';
            }

            // --- NUEVO FIX: EL HITBOX REAL DEL JUGADOR ---
            // Definimos el tamaño del cuerpo físico. Si el TILE_SIZE es 16, 
            // un hitbox de 10x10 píxeles evita que te atores en las esquinas.
            const hitX = 5; // Mitad del ancho (Left/Right)
            const hitY = 5; // Mitad del alto (Up/Down)

            // Esta función revisa las 4 esquinas del hitbox en lugar de solo el centro
            const isColliding = (x, y) => {
                // OffsetY: Lo bajamos un poco (+3 píxeles) para simular perspectiva 3D (RPG).
                // Esto permite que tu cabeza "tape" las paredes de arriba, pero tus pies choquen.
                const offsetY = 3;
                return checkWall(x - hitX, y - hitY + offsetY) || // Esquina Arriba-Izquierda
                    checkWall(x + hitX, y - hitY + offsetY) || // Esquina Arriba-Derecha
                    checkWall(x - hitX, y + hitY + offsetY) || // Esquina Abajo-Izquierda
                    checkWall(x + hitX, y + hitY + offsetY);   // Esquina Abajo-Derecha
            };

            // 1. Try moving X first
            const oldX = player.worldX;
            player.worldX += player.vx;
            if (isColliding(player.worldX, player.worldY)) {
                player.worldX = oldX; 
                // 🛑 EL FIX: "Aproximación fina" pixel por pixel para pegar al jugador a la pared sin rebotar
                const stepX = Math.sign(player.vx);
                if (stepX !== 0) {
                    let steps = Math.floor(Math.abs(player.vx));
                    while (steps > 0 && !isColliding(player.worldX + stepX, player.worldY)) {
                        player.worldX += stepX;
                        steps--;
                    }
                }
            }

            // 2. Try moving Y second
            const oldY = player.worldY;
            player.worldY += player.vy;
            if (isColliding(player.worldX, player.worldY)) {
                player.worldY = oldY; 
                // 🛑 EL FIX: "Aproximación fina" en Y
                const stepY = Math.sign(player.vy);
                if (stepY !== 0) {
                    let steps = Math.floor(Math.abs(player.vy));
                    while (steps > 0 && !isColliding(player.worldX, player.worldY + stepY)) {
                        player.worldY += stepY;
                        steps--;
                    }
                }
            }

            // --- 3. SHOOTING & COMBAT PHYSICS ---
            // 🛑 EL FIX: Si el objeto no es un arma real, usamos las estadísticas de "none" (Manos vacías)
            let currentWeaponStats = WEAPONS[player.equippedWeapon];
            if (!currentWeaponStats) {
                currentWeaponStats = WEAPONS["none"] || { type: 'melee', fireRate: 400, reach: 24, hitW: 24, hitH: 24, damage: 0 };
            }

            if (isShooting && !player.isReloading && !player.inSafeZone && !player.isSitting) {
                if (Date.now() - lastShotTime > (currentWeaponStats.fireRate || 300)) {
                    // 🔊 THE FIX: Play the sound locally the exact millisecond you attack!
                    playItemSound(player.equippedWeapon, 'use', 0.8);
                    // =========================================================
                    // 🔥 LÓGICA DE COMBATE MELEE (El Hitbox de Pizza) 🔥
                    // =========================================================
                    if (currentWeaponStats.type === 'melee') {
                        // 🛑 EL FIX DEL MELEE BUG: Forzar el cuerpo a mirar hacia donde apuntas INSTANTÁNEAMENTE
                        let deg = shootAngle * (180 / Math.PI);
                        if (deg > 45 && deg <= 135) player.frameY = 0;
                        else if (deg > 135 || deg <= -135) player.frameY = 1;
                        else if (deg > -45 && deg <= 45) player.frameY = 2;
                        else if (deg > -135 && deg <= -45) player.frameY = 3;

                        // 1. Activar animación visual del jugador
                        player.isSwinging = true;
                        player.swingStartTime = Date.now();
                        player.swingDuration = 200;

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({ type: 'melee_swing', weaponId: player.equippedWeapon }));
                        }

                        // 2. Extraer datos matemáticos (Ahora usa la dirección corregida al instante)
                        const dir = player.frameY;
                        let aimAngle = 0; let dirMult = 1;
                        if (dir === 0) aimAngle = Math.PI / 2;
                        else if (dir === 1) { aimAngle = Math.PI; dirMult = -1; }
                        else if (dir === 2) { aimAngle = 0; }
                        else if (dir === 3) { aimAngle = -Math.PI / 2; dirMult = -1; }

                        const d = currentWeaponStats.dirStats ? (currentWeaponStats.dirStats[dir] || {}) : {};
                        const hitRotRad = (d.hitRot || 0) * Math.PI / 180;
                        const trueHitAngle = aimAngle + (hitRotRad * dirMult);
                        const halfWidRad = ((d.hitWid || 60) / 2) * Math.PI / 180;
                        const hitRange = d.hitLen || 40;

                        const hitOriginX = player.worldX + (d.hitX || 0);
                        const hitOriginY = player.worldY + (d.hitY || 0);

                        // 3. Escanear a todos los enemigos vivos
                        for (let id in otherPlayers) {
                            let enemy = otherPlayers[id];
                            if (enemy.worldX !== undefined && !enemy.isDead) {
                                // A. ¿Está suficientemente cerca?
                                const dist = Math.hypot(enemy.worldX - hitOriginX, enemy.worldY - hitOriginY);
                                if (dist <= hitRange) {
                                    // B. ¿Está dentro del ángulo de la espada?
                                    const angleToEnemy = Math.atan2(enemy.worldY - hitOriginY, enemy.worldX - hitOriginX);
                                    let angleDiff = angleToEnemy - trueHitAngle;

                                    // Normalizar para no volvernos locos con Pi
                                    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                                    if (Math.abs(angleDiff) <= halfWidRad) {
                                        // 🛑 SERVER-AUTHORITATIVE COMBAT:
                                        // Ya no enviamos damage_player. El servidor lo calcula automáticamente
                                        // usando las físicas del melee_swing.
                                    }
                                }
                            }
                        }
                        lastShotTime = Date.now();

                        // 4. Escanear a la BASE CENTRAL (Ataque Melee)
                        if (centralBase && player.squad) {
                            // Centro del hitbox de la base
                            const bx = centralBase.worldX + (centralBase.hitboxOffsetX || 0);
                            const by = centralBase.worldY + (centralBase.hitboxOffsetY || 0);

                            // Mitad del ancho y alto
                            const hw = (centralBase.hitboxW || 32) / 2;
                            const hh = (centralBase.hitboxH || 32) / 2;

                            // 🛑 EL FIX MATEMÁTICO: Encontrar el borde exacto de la base más cercano a tu espada
                            let closestX = Math.max(bx - hw, Math.min(hitOriginX, bx + hw));
                            let closestY = Math.max(by - hh, Math.min(hitOriginY, by + hh));

                            // Distancia desde tu espada hasta ese borde de la base (No al centro)
                            const distToBaseEdge = Math.hypot(closestX - hitOriginX, closestY - hitOriginY);

                            // Si la espada alcanza a tocar ese borde...
                            if (distToBaseEdge <= hitRange) {
                                // Calculamos el ángulo hacia ese borde exacto
                                const angleToEdge = Math.atan2(closestY - hitOriginY, closestX - hitOriginX);
                                let angleDiffBase = angleToEdge - trueHitAngle;

                                // Normalizar el ángulo
                                while (angleDiffBase <= -Math.PI) angleDiffBase += Math.PI * 2;
                                while (angleDiffBase > Math.PI) angleDiffBase -= Math.PI * 2;

                                // Si el borde está dentro del "abanico" (cono) de tu espadazo
                                if (Math.abs(angleDiffBase) <= halfWidRad) {
                                    // ¡GOLPE CONFIRMADO A LA BASE!

                                    // 💥 NUEVO: CREAR CHISPA DE IMPACTO MELEE (OPTIMIZADO CON POOLING) 💥
                                    spawnSpark(
                                        closestX + (Math.random() * 12 - 6),
                                        closestY + (Math.random() * 12 - 6),
                                        10,
                                        currentWeaponStats.color || '#e67e22'
                                    );

                                    // Enviamos el daño al servidor
                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(MessagePack.encode({
                                            type: 'damage_base',
                                            weaponId: player.equippedWeapon
                                        }));
                                    }
                                }
                            }
                        }

                        // 🛑 LA PIEZA QUE FALTABA: ESCANEAR BASURA EN EL PISO
                        if (player.equippedWeapon === 'trash_picker') {
                            for (let itemId in groundItems) {
                                let item = groundItems[itemId];
                                // Distancia desde el jugador hasta la pieza de basura
                                const distToTrash = Math.hypot(item.x - hitOriginX, item.y - hitOriginY);

                                // Si está en el rango de alcance de tu recogedor...
                                if (distToTrash <= hitRange) {
                                    const angleToTrash = Math.atan2(item.y - hitOriginY, item.x - hitOriginX);
                                    let angleDiffTrash = angleToTrash - trueHitAngle;

                                    // Normalizar ángulo
                                    while (angleDiffTrash <= -Math.PI) angleDiffTrash += Math.PI * 2;
                                    while (angleDiffTrash > Math.PI) angleDiffTrash -= Math.PI * 2;

                                    // Si está justo enfrente de ti (en el ángulo del pinchazo)
                                    if (Math.abs(angleDiffTrash) <= halfWidRad) {
                                        // ¡PINCHASTE LA BASURA! Mandamos cobrar al servidor
                                        if (ws.readyState === WebSocket.OPEN) {
                                            ws.send(MessagePack.encode({ type: 'pickup_trash', itemId: itemId }));
                                        }
                                        // La borramos visualmente de inmediato para que no mandes spam de clics
                                        delete groundItems[itemId];
                                        break; // Salimos del loop para solo pinchar 1 a la vez
                                    }
                                }
                            }
                        }// 👇 NUEVO: SI EL ARMA ES UNA PALA, MANDAR EXCAVAR 👇
                        else if (player.equippedWeapon === 'shovel' || currentWeaponStats.name.toLowerCase().includes('pala')) {
                            if (ws.readyState === WebSocket.OPEN) {
                                // Enviamos la punta exacta donde pegó la pala
                                ws.send(MessagePack.encode({
                                    type: 'dig',
                                    hitX: hitOriginX,
                                    hitY: hitOriginY
                                }));
                            }
                        }
                    }
                    // =========================================================
                    // 🔫 LÓGICA DE DISPARO RANGED (Pistolas y Escopetas)
                    // =========================================================
                    else {
                        if (player.ammo > 0) {
                            player.ammo--;

                            // 🔥 LEER LA PUNTA DEL CAÑÓN DESDE EL EDITOR GANI 🔥
                            const dir = player.frameY;
                            const d = currentWeaponStats.dirStats ? (currentWeaponStats.dirStats[dir] || {}) : {};

                            // Nace del pecho + lo que hayas movido los sliders de Hit X y Hit Y
                            let spawnX = player.worldX + (d.hitX || 0);
                            let spawnY = player.worldY + (d.hitY || 0);

                            // 🔥 EL FIX DE PARALAJE PARA PC (Ratón) 🔥
                            let finalAngle = shootAngle; // Por defecto usa el del Joystick (Celular)
                            if (!isTouchDevice) {
                                // Convertir la mira del ratón a coordenadas del mapa real
                                const mouseWorldX = player.worldX + (mouseX - window.innerWidth / 2) / zoomLevel;
                                const mouseWorldY = player.worldY + (mouseY - window.innerHeight / 2) / zoomLevel;
                                // Calcular ángulo desde el cañón de la pistola hacia el ratón
                                finalAngle = Math.atan2(mouseWorldY - spawnY, mouseWorldX - spawnX);
                            }

                            player.lastShotX = spawnX; player.lastShotY = spawnY;
                            lastShotTime = Date.now();
                            player.lastShotTime = Date.now();

                            // ==========================================================
                            // 💥 NUEVO: SISTEMA DE MÚLTIPLES BALAS (ESCOPETAS / SPREAD)
                            // ==========================================================

                            // ¿Cuántas balas salen y qué tan abierto es el abanico?
                            // Si el arma no tiene estos valores, asume 1 bala y 0 grados de apertura (pistola normal)
                            const bulletCount = currentWeaponStats.pellets || 1;
                            const spreadAngleDegrees = currentWeaponStats.spread || 0;

                            // Convertir los grados de apertura a radianes para la matemática
                            const spreadAngleRads = spreadAngleDegrees * (Math.PI / 180);

                            // Creamos una "caja" vacía para guardar las balas
                            let anglesArray = [];

                            for (let i = 0; i < bulletCount; i++) {
                                let bulletAngle = finalAngle;

                                if (bulletCount > 1) {
                                    const startAngle = finalAngle - (spreadAngleRads / 2);
                                    const angleStep = spreadAngleRads / (bulletCount - 1);
                                    bulletAngle = startAngle + (angleStep * i);
                                }

                                // 1. Creamos la bala en nuestra pantalla al instante
                                spawnProjectile(spawnX, spawnY, bulletAngle, myId, player.equippedWeapon);

                                // 2. Guardamos el ángulo en nuestra caja
                                anglesArray.push(bulletAngle);
                            }

                            // 3. Enviamos LA CAJA COMPLETA al servidor de forma inteligente
                            if (ws.readyState === WebSocket.OPEN) {
                                if (bulletCount > 1) {
                                    // 📦 Si es escopeta, enviamos el arreglo múltiple 
                                    // (NOTA: Para que otros vean la escopeta, debes actualizar tu Server Node.js para que retransmita 'shoot_shotgun')
                                    ws.send(MessagePack.encode({
                                        type: 'shoot_shotgun',
                                        x: spawnX,
                                        y: spawnY,
                                        angles: anglesArray,
                                        weaponId: player.equippedWeapon
                                    }));
                                } else {
                                    // 🔫 EL FIX: Si es pistola normal, mandamos el paquete clásico que el servidor SÍ conoce
                                    ws.send(MessagePack.encode({
                                        type: 'shoot',
                                        x: spawnX,
                                        y: spawnY,
                                        angle: finalAngle, // Mandamos el ángulo único en vez del Array
                                        weaponId: player.equippedWeapon
                                    }));
                                }
                            }
                            // ==========================================================

                            /// 💥 EL FIX: RETROCESO FÍSICO SUAVE (SELF-KNOCKBACK) 💥
                            const kbForce = Number(d.kb) || 0;
                            if (kbForce > 0) {
                                player.kbX = -(Math.cos(finalAngle) * (kbForce / 2));
                                player.kbY = -(Math.sin(finalAngle) * (kbForce / 2));

                                // 🛑 EL FIX 2: Arrancamos el cronómetro de retroceso
                                player.staggerTimer = Date.now();
                            }

                        } else {
                            player.isReloading = true;
                            playItemSound(player.equippedWeapon, 'reload', 0.7);
                            setTimeout(() => {
                                player.ammo = currentWeaponStats.magSize;
                                player.weaponAmmo[player.equippedWeapon] = currentWeaponStats.magSize; // 💾 Sincronizar memoria

                                // 🚀 EL FIX MÁGICO: ¡Avisarle al servidor que el cargador está lleno de nuevo!
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                                }

                                player.isReloading = false;
                            }, currentWeaponStats.reloadTime);
                        }
                    }
                }
            }

            // --- ACTUALIZAR UI DE MUNICIÓN EN TIEMPO REAL (OPTIMIZADO DE VERDAD) ---
            if (player.equippedWeapon !== "none" && WEAPONS[player.equippedWeapon]) {

                if (WEAPONS[player.equippedWeapon].type === 'melee') {
                    if (window.lastAmmoState !== 'hidden') {
                        uiAmmoDisplay.style.display = 'none';
                        window.lastAmmoState = 'hidden';
                    }
                } else {
                    if (window.lastAmmoState !== 'visible') {
                        uiAmmoDisplay.style.display = 'flex';
                        window.lastAmmoState = 'visible';
                    }

                    // 🚀 EL FIX MÁXIMO: Mover la caja SOLO si cambiaste de slot (Adiós getBoundingClientRect por frame)
                    if (window.lastRenderedSlot !== player.activeSlot) {
                        const activeSlotElem = document.getElementById('hud-slot-' + player.activeSlot);
                        if (activeSlotElem) {
                            const rect = activeSlotElem.getBoundingClientRect();
                            uiAmmoDisplay.style.top = (rect.top + rect.height / 2) + 'px';
                            uiAmmoDisplay.style.transform = 'translateY(-50%)';
                        }
                        window.lastRenderedSlot = player.activeSlot;
                    }

                    const maxAmmo = WEAPONS[player.equippedWeapon].magSize;

                    // 🚀 EL FIX: Solo actualizar el DOM (texto HTML) si las balas o el estado de recarga realmente cambiaron
                    if (window.lastRenderedAmmo !== player.ammo || window.lastRenderedReloading !== player.isReloading) {
                        if (player.isReloading) {
                            uiAmmoCurrent.style.color = "#e74c3c";
                            uiAmmoCurrent.innerText = "↻";
                            uiAmmoMax.innerText = "RELOAD";
                            uiAmmoDisplay.style.borderColor = "#e74c3c";
                        } else {
                            uiAmmoCurrent.style.color = player.ammo > (maxAmmo * 0.3) ? "#2ecc71" : "#e74c3c";
                            uiAmmoCurrent.innerText = player.ammo;
                            uiAmmoMax.innerText = maxAmmo;
                            uiAmmoDisplay.style.borderColor = "#f1c40f";
                        }
                        window.lastRenderedAmmo = player.ammo;
                        window.lastRenderedReloading = player.isReloading;
                    }

                    // Opacidad inteligente (Fade out si no disparas, actualizado solo al cambiar de estado)
                    const timeSinceShot = Date.now() - (player.lastShotTime || 0);
                    const shouldBeOpaque = (timeSinceShot < 3000 || player.isReloading);

                    if (shouldBeOpaque !== window.lastAmmoOpacity) {
                        uiAmmoDisplay.style.opacity = shouldBeOpaque ? '1' : '0';
                        uiAmmoDisplay.style.pointerEvents = shouldBeOpaque ? 'auto' : 'none';
                        window.lastAmmoOpacity = shouldBeOpaque;
                    }
                }
            } else {
                if (window.lastAmmoState !== 'hidden') {
                    uiAmmoDisplay.style.display = 'none';
                    window.lastAmmoState = 'hidden';
                }
            }

            // --- 4. BULLET MOVEMENT & PLAYER DAMAGE (CON OBJECT POOLING) ---
            for (let i = 0; i < MAX_PROJECTILES; i++) {
                let p = projectiles[i];

                // Si la bala está apagada, la ignoramos para no gastar procesador
                if (!p.active) continue;

                // === FIX: DESINTEGRAR BALAS DE MUERTOS ===
                if (p.owner === myId) {
                    if (player.isDead) {
                        p.active = false; // 🛑 APAGAR
                        continue;
                    }
                } else {
                    const bulletOwner = otherPlayers[p.owner];
                    if (bulletOwner && bulletOwner.isDead) {
                        p.active = false; // 🛑 APAGAR
                        continue;
                    }
                }

                // Movimiento normal de la bala
                // 🚀 EL FIX FÍSICO: Balas sincronizadas con el lag (Delta Time)
                p.x += p.vx * dtScale;
                p.y += p.vy * dtScale;
                p.life -= dtScale;

                let hitSomeone = false;
                // ⚡ Hitbox ligeramente más grande (14px en vez de 12) para que el
                // hit registration sea consistente entre ambas pantallas
                const HITBOX_RADIUS = 14;

                // A. ¿La bala chocó contra MÍ? 
                if (p.owner !== myId && !player.isDead && Math.hypot(p.x - player.worldX, p.y - player.worldY) < HITBOX_RADIUS) {
                    hitSomeone = true;
                }

                // B. ¿La bala chocó contra ALGUIEN MÁS?
                if (!hitSomeone) {
                    for (let id in otherPlayers) {
                        let enemy = otherPlayers[id];

                        if (enemy.worldX !== undefined && !enemy.isDead && p.owner !== id && Math.hypot(p.x - enemy.worldX, p.y - enemy.worldY) < HITBOX_RADIUS) {
                            hitSomeone = true;
                            // 🛑 SERVER-AUTHORITATIVE COMBAT:
                            // La bala local es solo visual. Se destruirá al chocar, 
                            // pero es el SERVIDOR quien decide si bajó vida o no.
                            break;
                        }
                    }
                }

                // C. ¿La bala chocó contra la BASE CENTRAL?
                if (!hitSomeone && centralBase) {
                    const baseHitX = centralBase.worldX + (centralBase.hitboxOffsetX || 0);
                    const baseHitY = centralBase.worldY + (centralBase.hitboxOffsetY || 0);
                    const hw = (centralBase.hitboxW || 32) / 2;
                    const hh = (centralBase.hitboxH || 32) / 2;

                    if (p.x >= baseHitX - hw && p.x <= baseHitX + hw && p.y >= baseHitY - hh && p.y <= baseHitY + hh) {
                        hitSomeone = true;
                        // 💥 CHISPA DE BALA (OPTIMIZADO CON POOLING) 💥
                        spawnSpark(p.x, p.y, 12, p.color || "#f1c40f");

                        if (p.owner === myId && player.squad) {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(MessagePack.encode({
                                    type: 'damage_base', weaponId: p.weapon
                                }));
                            }
                        }
                    }
                }

                // Destruir la bala (Simplemente apagarla, NUNCA usar splice)
                if (p.life <= 0 || checkWall(p.x, p.y) || hitSomeone) {
                    p.active = false; // 🛑 LA MAGIA DE RECICLAJE
                }
            }

            // === EL HACK MAESTRO DE LA CÁMARA CINEMÁTICA ===
            let realPlayerX = player.worldX;
            let realPlayerY = player.worldY;

            if (isCinematicLoading) {
                cinematicTimer += 0.002; // Velocidad del dron (súbela a 0.005 si quieres que vuele más rápido)

                // EL FIX: Usamos realPlayerX y realPlayerY como el centro de la órbita.
                // 400 y 300 es la distancia en píxeles hacia afuera (una órbita ovalada).
                player.worldX = realPlayerX + (Math.cos(cinematicTimer) * 400);
                player.worldY = realPlayerY + (Math.sin(cinematicTimer) * 300);
            }

            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            ctx.imageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;

            // HELPER FUNCTION: Draws a specific range of layers (CON CULLING Y MULTI-TILESET)
            function drawWorldLayers(startLayer, endLayer) {
                const screenWidthWorld = cachedScreenWidth / zoomLevel;
                const screenHeightWorld = cachedScreenHeight / zoomLevel;

                const startCol = Math.floor((player.worldX - (screenWidthWorld / 2)) / TILE_SIZE) - 1;
                const endCol = Math.floor((player.worldX + (screenWidthWorld / 2)) / TILE_SIZE) + 1;
                const startRow = Math.floor((player.worldY - (screenHeightWorld / 2)) / TILE_SIZE) - 1;
                const endRow = Math.floor((player.worldY + (screenHeightWorld / 2)) / TILE_SIZE) + 1;

                const scaledSize = TILE_SIZE * zoomLevel;
                const cameraOffsetX = screenCenterX - (player.worldX * zoomLevel);
                const cameraOffsetY = screenCenterY - (player.worldY * zoomLevel);

                // 🚀 EL FIX: Dar la orden de nitidez UNA SOLA VEZ antes del bucle masivo
                ctx.imageSmoothingEnabled = false;

                // 2. RENDER ONLY WHAT IS VISIBLE
                for (let currentLayer = startLayer; currentLayer <= endLayer; currentLayer++) {
                    if (editMode) {
                        ctx.globalAlpha = (currentLayer === activeLayer) ? 1.0 : 0.3;
                    } else {
                        ctx.globalAlpha = 1.0;
                    }

                    // Iteramos exactamente los cuadros de la pantalla en lugar de todo el mapa
                    for (let gridY = startRow; gridY <= endRow; gridY++) {
                        for (let gridX = startCol; gridX <= endCol; gridX++) {

                            const key = getMapKey(gridX, gridY, currentLayer);
                            const tileData = worldMap.get(key);

                            if (!tileData) continue;

                            // 👇 LA MAGIA ANTI-GELATINA (ANCLAJE CONTINUO) 👇
                            const exactScaledSize = TILE_SIZE * zoomLevel;

                            // 🛑 EL FIX DE CUADRÍCULA UNIFICADA 🛑
                            // Calculamos la posición con decimales atados a la cámara global
                            const exactX = cameraOffsetX + (gridX * scaledSize);
                            const exactY = cameraOffsetY + (gridY * scaledSize);

                            // Anclamos al píxel más cercano
                            const drawX = Math.floor(exactX);
                            const drawY = Math.floor(exactY);

                            // Calculamos dónde empieza el vecino para saber el ancho exacto
                            const nextX = Math.floor(cameraOffsetX + ((gridX + 1) * scaledSize));
                            const nextY = Math.floor(cameraOffsetY + ((gridY + 1) * scaledSize));

                            // El "+ 0.8" es pegamento. Al estar todos colgados del mismo 
                            // 'cameraOffset', ya NO hay efecto gelatina al caminar.
                            const drawW = (nextX - drawX) + 0.7;
                            const drawH = (nextY - drawY) + 0.7;
                            // =========================================================
                            // =========================================================
                            // 🌟 NUEVO: DIBUJAR ARMAS DE TIENDA (CON AJUSTE MANUAL Y PRECIO) 🌟
                            // =========================================================
                            if (currentLayer === 15 && tileData.triggerType === 'shop' && tileData.itemId) {
                                const wSprite = window.loadedItemSprites[tileData.itemId];
                                if (wSprite && wSprite.complete) {

                                    // 1. Buscar si el ítem tiene un ajuste manual en tu Catálogo (Opcional)
                                    const itemStats = weaponsDB[tileData.itemId] || window.MASTER_CATALOG[tileData.itemId] || {};
                                    const tweakX = (tileData.shelfX || 0) * zoomLevel;
                                    const tweakY = (tileData.shelfY || 0) * zoomLevel;

                                    const itemRow = tileData.itemRow || 0;
                                    const sW = 48; // Ancho fijo del frame
                                    const sH = 64; // Alto fijo del frame
                                    const renderScale = 0.9;

                                    const scaledTile = TILE_SIZE * zoomLevel;
                                    const scaledItemW = sW * renderScale * zoomLevel;
                                    const scaledItemH = sH * renderScale * zoomLevel;

                                    ctx.save();

                                    // 3. Alinear el objeto
                                    const finalX = drawX + (scaledTile / 2) - (scaledItemW / 2) + tweakX;
                                    const finalY = drawY + scaledTile - scaledItemH - (4 * zoomLevel) + tweakY;

                                    // Dibujar el Objeto
                                    ctx.drawImage(
                                        wSprite,
                                        0, itemRow * sH, sW, sH,
                                        finalX,
                                        finalY,
                                        scaledItemW,
                                        scaledItemH
                                    );
                                    ctx.restore(); // Restauramos para no afectar el texto

                                    // 👇 NUEVO: DIBUJAR EL PRECIO DEBAJO DEL TILE (ESTÁTICO) 👇
                                    if (itemStats.price !== undefined) {
                                        ctx.save();

                                        const priceText = `$${itemStats.price}`;
                                        const fontSize = 6 * zoomLevel;

                                        ctx.font = `900 ${fontSize}px sans-serif`;
                                        ctx.textAlign = "center";

                                        // 🛑 EL FIX: Anclamos el texto al centro exacto del bloque y justo debajo de él.
                                        // Ya no usamos tweakX ni tweakY aquí, para que todos los precios estén alineados perfectamente.
                                        const textX = drawX + (scaledTile / 2);
                                        const textY = drawY + scaledTile + (5 * zoomLevel);

                                        // Borde negro (Outline)
                                        ctx.lineWidth = 2 * zoomLevel;
                                        ctx.strokeStyle = "black";
                                        ctx.lineJoin = "round";
                                        ctx.strokeText(priceText, textX, textY);

                                        // Relleno amarillo estilo oro
                                        ctx.fillStyle = "#f1c40f";
                                        ctx.fillText(priceText, textX, textY);

                                        ctx.restore();
                                    }
                                }
                            }
                            // 🛑 EL ESCUDO: Si no estamos en Modo Edición, ocultamos la "caja de color" de la capa 15
                            if (!editMode && currentLayer === 15) continue;

                            // --- LÓGICA ORIGINAL DE DIBUJO DE TILES DEL MAPA ---
                            const tsData = getTilesetData(tileData.tileId);
                            if (!tsData || !tsData.img) continue;

                            const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                            const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                            const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;

                            const tileRotation = tileData.rotation || 0;

                            if (tileRotation !== 0) {
                                ctx.save();
                                // Usamos el drawW y drawH exacto que calculamos arriba
                                ctx.translate(drawX + drawW / 2, drawY + drawH / 2);
                                ctx.rotate(tileRotation * Math.PI / 180);
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, -drawW / 2, -drawH / 2, drawW, drawH);
                                ctx.restore();
                            } else {
                                // Dibujo estándar con sellado hermético
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, drawW, drawH);
                            }
                        }
                    }
                }
                ctx.globalAlpha = 1.0;
            }
            // === 1. DRAW GROUND LAYERS (BELOW PLAYER: L0 - L7) ===
            // 🚀 EL FIX: Declaramos las variables de cámara AFUERA para que el techo también pueda usarlas
            let dX = 0, dY = 0, dW = 0, dH = 0;

            if (editMode) {
                // En Modo Editor necesitamos ver las transparencias capa por capa
                drawWorldLayers(0, 7);
            } else {
                const centerCol = Math.floor(player.worldX / TILE_SIZE);
                const centerRow = Math.floor(player.worldY / TILE_SIZE);

                const halfCols = Math.ceil((cachedScreenWidth / zoomLevel) / TILE_SIZE / 2);
                const halfRows = Math.ceil((cachedScreenHeight / zoomLevel) / TILE_SIZE / 2);

                const tileDrawSize = TILE_SIZE * zoomLevel;
                const screenWorldW = cachedScreenWidth / zoomLevel;
                const screenWorldH = cachedScreenHeight / zoomLevel;
                
                const minWorldX = player.worldX - screenWorldW / 2;
                const maxWorldX = player.worldX + screenWorldW / 2;
                const minWorldY = player.worldY - screenWorldH / 2;
                const maxWorldY = player.worldY + screenWorldH / 2;

                const minCX = Math.floor((minWorldX / TILE_SIZE) / CHUNK_SIZE);
                const maxCX = Math.floor((maxWorldX / TILE_SIZE) / CHUNK_SIZE);
                const minCY = Math.floor((minWorldY / TILE_SIZE) / CHUNK_SIZE);
                const maxCY = Math.floor((maxWorldY / TILE_SIZE) / CHUNK_SIZE);

                // 🚀 EL FIX MAXIMO DE MEMORIA (JIT BAKING & GARBAGE COLLECTION)
                // Mantén solo los chunks cercanos en la memoria RAM para no crashear iOS
                const activeChunkKeys = new Set();
                for (let cy = minCY - 1; cy <= maxCY + 1; cy++) {
                    for (let cx = minCX - 1; cx <= maxCX + 1; cx++) {
                        activeChunkKeys.add(`${cx},${cy}`);
                    }
                }

                floorChunks.forEach((canvas, chunkKey) => {
                    if (!activeChunkKeys.has(chunkKey)) {
                        canvas.width = 0; // Liberar RAM
                        floorChunks.delete(chunkKey);
                    }
                });
                overheadChunks.forEach((canvas, chunkKey) => {
                    if (!activeChunkKeys.has(chunkKey)) {
                        canvas.width = 0; // Liberar RAM
                        overheadChunks.delete(chunkKey);
                    }
                });
                
                if (dirtyChunks.size > 0) {
                    dirtyChunks.forEach(chunkKey => {
                        const [cx, cy] = chunkKey.split(',').map(Number);
                        rebakeChunk(cx, cy);
                    });
                    dirtyChunks.clear();
                }

                ctx.imageSmoothingEnabled = false;

                for (let cy = minCY; cy <= maxCY; cy++) {
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        const chunkKey = `${cx},${cy}`;
                        let fCanvas = floorChunks.get(chunkKey);
                        
                        // JIT (Just In Time) Baking!
                        if (!fCanvas) {
                            rebakeChunk(cx, cy);
                            fCanvas = floorChunks.get(chunkKey);
                        }

                        if (fCanvas) {
                            const chunkStartX = cx * CHUNK_SIZE * TILE_SIZE;
                            const chunkStartY = cy * CHUNK_SIZE * TILE_SIZE;
                            const chunkEndX = (cx + 1) * CHUNK_SIZE * TILE_SIZE;
                            const chunkEndY = (cy + 1) * CHUNK_SIZE * TILE_SIZE;
                            
                            const rawDx1 = screenCenterX + (chunkStartX - player.worldX) * zoomLevel;
                            const rawDy1 = screenCenterY + (chunkStartY - player.worldY) * zoomLevel;
                            const rawDx2 = screenCenterX + (chunkEndX - player.worldX) * zoomLevel;
                            const rawDy2 = screenCenterY + (chunkEndY - player.worldY) * zoomLevel;
                            
                            const drawX = Math.floor(rawDx1);
                            const drawY = Math.floor(rawDy1);
                            const drawW = Math.floor(rawDx2) - drawX;
                            const drawH = Math.floor(rawDy2) - drawY;
                            
                            ctx.drawImage(fCanvas, drawX, drawY, drawW, drawH);
                        }
                    }
                }
            }

            // =========================================================
            // 🌟 CAPA 15: EFECTOS VISUALES DE TILES DE LÓGICA
            // El tile de color en sí está oculto, pero dibujamos encima
            // todo lo que la lógica debe mostrar (armas de tienda, precios, etc.)
            // =========================================================
            if (!editMode) {
                const l15screenW = cachedScreenWidth / zoomLevel;
                const l15screenH = cachedScreenHeight / zoomLevel;
                const l15startCol = Math.floor((renderWorldX - (l15screenW / 2)) / TILE_SIZE) - 1;
                const l15endCol   = Math.floor((renderWorldX + (l15screenW / 2)) / TILE_SIZE) + 1;
                const l15startRow = Math.floor((renderWorldY - (l15screenH / 2)) / TILE_SIZE) - 1;
                const l15endRow   = Math.floor((renderWorldY + (l15screenH / 2)) / TILE_SIZE) + 1;

                const l15scaledSize   = TILE_SIZE * zoomLevel;
                const l15cameraOffX   = screenCenterX - (renderWorldX * zoomLevel);
                const l15cameraOffY   = screenCenterY - (renderWorldY * zoomLevel);

                ctx.imageSmoothingEnabled = false;

                for (let gy = l15startRow; gy <= l15endRow; gy++) {
                    for (let gx = l15startCol; gx <= l15endCol; gx++) {
                        const l15key  = getMapKey(gx, gy, 15);
                        const l15tile = worldMap.get(l15key);
                        if (!l15tile) continue;

                        // Posición en pantalla de este tile (igual que drawWorldLayers)
                        const l15drawX = Math.floor(l15cameraOffX + (gx * l15scaledSize));
                        const l15drawY = Math.floor(l15cameraOffY + (gy * l15scaledSize));

                        // 🏪 TIENDA: dibujar el arma expuesta y su precio
                        if (l15tile.triggerType === 'shop' && l15tile.itemId) {
                            const wSprite = window.loadedItemSprites && window.loadedItemSprites[l15tile.itemId];
                            if (wSprite && wSprite.complete) {
                                const itemStats = (window.weaponsDB && window.weaponsDB[l15tile.itemId])
                                               || (window.MASTER_CATALOG && window.MASTER_CATALOG[l15tile.itemId])
                                               || {};
                                const tweakX     = (l15tile.shelfX || 0) * zoomLevel;
                                const tweakY     = (l15tile.shelfY || 0) * zoomLevel;
                                const itemRow    = l15tile.itemRow || 0;
                                const sW = 48, sH = 64;
                                const renderScale = 0.9;
                                const scaledTile  = TILE_SIZE * zoomLevel;
                                const scaledItemW = sW * renderScale * zoomLevel;
                                const scaledItemH = sH * renderScale * zoomLevel;

                                ctx.save();
                                ctx.drawImage(
                                    wSprite,
                                    0, itemRow * sH, sW, sH,
                                    l15drawX + (scaledTile / 2) - (scaledItemW / 2) + tweakX,
                                    l15drawY + scaledTile - scaledItemH - (4 * zoomLevel) + tweakY,
                                    scaledItemW, scaledItemH
                                );
                                ctx.restore();

                                // Precio debajo del tile
                                if (itemStats.price !== undefined) {
                                    ctx.save();
                                    const priceText = `$${itemStats.price}`;
                                    const fontSize  = 6 * zoomLevel;
                                    ctx.font        = `900 ${fontSize}px sans-serif`;
                                    ctx.textAlign   = 'center';
                                    const textX = l15drawX + (scaledTile / 2);
                                    const textY = l15drawY + scaledTile + (5 * zoomLevel);
                                    ctx.lineWidth   = 2 * zoomLevel;
                                    ctx.strokeStyle = 'black';
                                    ctx.lineJoin    = 'round';
                                    ctx.strokeText(priceText, textX, textY);
                                    ctx.fillStyle   = '#f1c40f';
                                    ctx.fillText(priceText, textX, textY);
                                    ctx.restore();
                                }
                            }
                        }

                        // 🔧 Aquí puedes añadir más casos de lógica visual en el futuro
                        // (NPCs, portales, puertas, etc.) siguiendo el mismo patrón
                    }
                }
            }
            // =========================================================

            // === 🛑 DIBUJAR LA BASURA EN EL PISO ===
            for (let itemId in groundItems) {
                let item = groundItems[itemId];
                const iDrawX = Math.floor(screenCenterX + (item.x - renderWorldX) * zoomLevel);
                const iDrawY = Math.floor(screenCenterY + (item.y - renderWorldY) * zoomLevel);

                if (trashSpritesheet.complete && trashSpritesheet.naturalWidth > 0) {
                    const drawSize = 16 * zoomLevel;
                    // Extrae exactamente el cuadrito usando item.sx y item.sy que mandó el servidor
                    ctx.drawImage(
                        trashSpritesheet,
                        item.sx, item.sy, 16, 16,
                        iDrawX - (drawSize / 2), iDrawY - (drawSize / 2), drawSize, drawSize
                    );
                }
            }

            // === 🕳️ DIBUJAR HOYOS DE EXCAVACIÓN ===
            for (let i = digHoles.length - 1; i >= 0; i--) {
                let hole = digHoles[i];
                hole.life--;

                const hDrawX = Math.floor(screenCenterX + (hole.x - renderWorldX) * zoomLevel);
                const hDrawY = Math.floor(screenCenterY + (hole.y - renderWorldY) * zoomLevel);

                // El hoyo se desvanece suavemente antes de desaparecer
                ctx.globalAlpha = Math.min(1, hole.life / 50);

                ctx.fillStyle = "rgba(62, 39, 35, 0.8)"; // Café oscuro tierra
                ctx.beginPath();
                // Dibujamos un óvalo para que parezca que está en perspectiva 3D
                ctx.ellipse(hDrawX, hDrawY, 12 * zoomLevel, 6 * zoomLevel, 0, 0, Math.PI * 2);
                ctx.fill();

                // Bordecito interior para darle profundidad
                ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
                ctx.lineWidth = 1 * zoomLevel;
                ctx.stroke();

                if (hole.life <= 0) digHoles.splice(i, 1);
            }
            ctx.globalAlpha = 1.0;

            // === 2. DRAW PLAYER SPRITES ===
            updatePlayerDirection();

            // SAFETY CATCH: If you equip the gun while facing a row that is blank (like row 5), snap to 0!
            if (player.equippedWeapon !== "none" && player.frameY > 3) {
                player.frameY = 0;
            }

            // === A. DRAW OTHER PLAYERS ===
            for (let id in otherPlayers) {
                const p = otherPlayers[id];
                if (!p || p.worldX === undefined || !p.username || p.invisibleEnabled) continue;

                // 🛑 THE PERFECT MOVEMENT FIX v3 (DELTA-TIME LERP) 🛑
                let dx = p.targetX - p.worldX;
                let dy = p.targetY - p.worldY;
                let dist = Math.hypot(dx, dy);

                // 1. 🚀 FIX JITTER OTROS JUGADORES: Lerp atado a dtScale.
                // Con factor fijo 0.3, en frames irregulares el jugador avanza
                // distinto cada frame → tirones. Con dtScale el movimiento es
                // proporcional al tiempo real transcurrido → suave en cualquier fps.
                // 🟢 SMOOTHER LERP: tighter factor catches up faster without overshooting
                const lerpFactor = Math.min(1.0, 0.22 * dtScale);
                p.worldX += dx * lerpFactor;
                p.worldY += dy * lerpFactor;

                // 2. Truco visual: Forzar que las piernas se muevan mientras haya deslizamiento
                if (!p.isMoving) {
                    if (dist < 3) {
                        // Ya llegó a la meta, lo clavamos y paramos las piernas
                        p.worldX = p.targetX;
                        p.worldY = p.targetY;
                        p.isVisuallyMoving = false;
                    } else {
                        // El jugador soltó el control, pero por el lag de internet aún se está deslizando.
                        // Mantenemos las piernas moviéndose para ocultar el patinaje.
                        p.isVisuallyMoving = true;
                    }
                } else {
                    p.isVisuallyMoving = true;
                }

                // 3. Animación local para otros jugadores (Usando isVisuallyMoving)
                p.tickCount = p.tickCount || 0;
                p.tickCount++;

                const speedMod = p.isVisuallyMoving ? 1 : 2;

                let maxFrames = 4;
                if (p.equippedWeapon && p.equippedWeapon !== "none") {
                    maxFrames = p.isVisuallyMoving ? 6 : 1;
                } else {
                    maxFrames = p.isVisuallyMoving ? 8 : 4;
                }

                if (p.tickCount > player.ticksPerFrame * speedMod) {
                    p.tickCount = 0;
                    p.frameX = (p.frameX + 1) % maxFrames;
                }

                if (p.frameY > 3) p.frameY = 0; // Escudo anti-crash
                // 🚀 EL FIX DEL JITTER 2: Usar Math.floor igual que el piso, NUNCA Math.round
                const pDrawX = screenCenterX + ((p.worldX - renderWorldX) * zoomLevel);
                const pDrawY = screenCenterY + ((p.worldY - renderWorldY) * zoomLevel);
                const timeSinceHit = Date.now() - (p.lastHitTime || 0);
                const isHit = (timeSinceHit < 150);

                if (p.isDead) ctx.globalAlpha = 0.3;
                else if (isHit) {
                    setShadow(20 * zoomLevel, 'red');
                    ctx.globalAlpha = 0.6;
                }
                // 👇 DIBUJO LIMPIO DEL ENSAMBLADOR 👇
                drawModularCharacter(ctx, p, pDrawX, pDrawY, zoomLevel);

                if (isHit && !p.isDead) {
                    ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                    ctx.beginPath(); ctx.arc(pDrawX, pDrawY, 12 * zoomLevel, 0, Math.PI * 2); ctx.fill();
                }
                ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
            }

            // === B. DRAW LOCAL PLAYER ===
            if (player.frameY > 3) player.frameY = 0;

            const localTimeSinceHit = Date.now() - (player.lastHitTime || 0);
            const localIsHit = (localTimeSinceHit < 150);

            const isStaggering = (Date.now() - (player.staggerTimer || 0) < 300) || Math.abs(player.kbX) > 0.2 || Math.abs(player.kbY) > 0.2;
            if (isStaggering && player.equippedWeapon !== "none") {
                player.staggerTick = (player.staggerTick || 0) + 1;
                if (player.staggerTick > 4) {
                    player.staggerTick = 0;
                    player.frameX = (player.frameX + 1) % 6;
                }
            }

            if (player.isDead) ctx.globalAlpha = 0.3;
            else if (localIsHit) {
                setShadow(20 * zoomLevel, 'red');
                ctx.globalAlpha = 0.6;
            }

            // 🚀 EL FIX DEL JITTER: Pegar el personaje a la cuadrícula del mapa!
            const myDrawX = screenCenterX + (window.camErrorX || 0);
            const myDrawY = screenCenterY + (window.camErrorY || 0);

            // 👇 DIBUJO LIMPIO DEL ENSAMBLADOR PARA TI 👇
            drawModularCharacter(ctx, player, myDrawX, myDrawY, zoomLevel);

            if (localIsHit && !player.isDead) {
                ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
                ctx.beginPath(); ctx.arc(myDrawX, myDrawY, 12 * zoomLevel, 0, Math.PI * 2); ctx.fill();
            }
            ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;

            // --- ISLA DINÁMICA AVATAR (Simplificado para evitar lag) ---
            const avatarCanvas = document.getElementById('island-avatar');
            if (avatarCanvas && headImg && headImg.complete) {
                const aCtx = avatarCanvas.getContext('2d');
                aCtx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
                if (player.isDead) aCtx.globalAlpha = 0.3;
                // Antes decía 48, 48, 48, 48
                aCtx.drawImage(headImg, player.frameX * FRAME_SIZE, player.frameY * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE, -4, -8, 24, 24);
                aCtx.globalAlpha = 1.0;
            }

            // --- ⚽ SOCCER MINIGAME DRAW ---
            if (window.soccerMinigame && window.soccerMinigame.ball.active) {
                const camOffX = screenCenterX - (renderWorldX * zoomLevel);
                const camOffY = screenCenterY - (renderWorldY * zoomLevel);
                window.soccerMinigame.draw(ctx, camOffX, camOffY, zoomLevel);
            }

            // --- NEW: DRAW PROJECTILES DINÁMICOS ---
            for (let p of projectiles) {
                if (!p.active) continue; // 🛑 IGNORAR BALAS APAGADAS
                const pDrawX = Math.floor(screenCenterX + (p.x - renderWorldX) * zoomLevel);
                const pDrawY = Math.floor(screenCenterY + (p.y - renderWorldY) * zoomLevel);

                // 🛑 EL FIX DEL COLOR: Escudo de seguridad por si p.color es null o undefined
                const safeColor = p.color ? p.color : "#f1c40f"; // Amarillo brillante por defecto

                // Brillo de bala (respeta disableShadows)
                setShadow(10 * zoomLevel, safeColor);
                ctx.fillStyle = safeColor;
                ctx.beginPath();
                ctx.arc(pDrawX, pDrawY, 3 * zoomLevel, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0; // Apagarlo siempre después de usarlo
            }
            // Reset shadows so the rest of the game doesn't glow!
            ctx.shadowBlur = 0;

            // === 3. DRAW OVERHEAD LAYERS (ABOVE PLAYER: L8 - L15) ===
            if (editMode) {
                drawWorldLayers(8, 15); // En modo editor seguimos dibujando manual para ver las transparencias
            } else {
                // 🌟 MAGIA PURA: 1 sola instrucción en vez de miles de iteraciones
                if (isUnderRoof) ctx.globalAlpha = 0.3; // Hacer techos transparentes si estás en casa

                ctx.imageSmoothingEnabled = false;
                
                const screenWorldW = cachedScreenWidth / zoomLevel;
                const screenWorldH = cachedScreenHeight / zoomLevel;
                const minWorldX = player.worldX - screenWorldW / 2;
                const maxWorldX = player.worldX + screenWorldW / 2;
                const minWorldY = player.worldY - screenWorldH / 2;
                const maxWorldY = player.worldY + screenWorldH / 2;
                const minCX = Math.floor((minWorldX / TILE_SIZE) / CHUNK_SIZE);
                const maxCX = Math.floor((maxWorldX / TILE_SIZE) / CHUNK_SIZE);
                const minCY = Math.floor((minWorldY / TILE_SIZE) / CHUNK_SIZE);
                const maxCY = Math.floor((maxWorldY / TILE_SIZE) / CHUNK_SIZE);
                const tileDrawSize = TILE_SIZE * zoomLevel;

                for (let cy = minCY; cy <= maxCY; cy++) {
                    for (let cx = minCX; cx <= maxCX; cx++) {
                        const chunkKey = `${cx},${cy}`;
                        const oCanvas = overheadChunks.get(chunkKey);
                        if (oCanvas) {
                            const chunkStartX = cx * CHUNK_SIZE * TILE_SIZE;
                            const chunkStartY = cy * CHUNK_SIZE * TILE_SIZE;
                            const chunkEndX = (cx + 1) * CHUNK_SIZE * TILE_SIZE;
                            const chunkEndY = (cy + 1) * CHUNK_SIZE * TILE_SIZE;
                            
                            const rawDx1 = screenCenterX + (chunkStartX - player.worldX) * zoomLevel;
                            const rawDy1 = screenCenterY + (chunkStartY - player.worldY) * zoomLevel;
                            const rawDx2 = screenCenterX + (chunkEndX - player.worldX) * zoomLevel;
                            const rawDy2 = screenCenterY + (chunkEndY - player.worldY) * zoomLevel;
                            
                            const drawX = Math.floor(rawDx1);
                            const drawY = Math.floor(rawDy1);
                            const drawW = Math.floor(rawDx2) - drawX;
                            const drawH = Math.floor(rawDy2) - drawY;
                            
                            ctx.drawImage(oCanvas, drawX, drawY, drawW, drawH);
                        }
                    }
                }
                ctx.globalAlpha = 1.0;
            }
            // === DIBUJAR UI Y SPRITE DE LA BASE CENTRAL ===
            if (centralBase) {
                const bDrawX = Math.floor(screenCenterX + (centralBase.worldX - renderWorldX) * zoomLevel);
                const bDrawY = Math.floor(screenCenterY + (centralBase.worldY - renderWorldY) * zoomLevel);

                // Extraemos los offsets manuales del editor
                const offsetX = (centralBase.spriteOffsetX || 0) * zoomLevel;
                const offsetY = (centralBase.spriteOffsetY || 0) * zoomLevel;

                // 1. Matemáticas de Flote Suave (Hover)
                const hoverY = Math.sin(Date.now() / 300) * 5 * zoomLevel;

                // 2. Dibujar Sombra Fija (Anclada al piso, ¡NO USA LOS OFFSETS!)
                ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                ctx.beginPath();
                ctx.ellipse(bDrawX, bDrawY + (8 * zoomLevel), 14 * zoomLevel, 5 * zoomLevel, 0, 0, Math.PI * 2);
                ctx.fill();

                // ==========================================
                // 🧠 MOTOR DE ESTADOS: IDLE vs HIT
                // ==========================================
                const timeSinceBaseHit = Date.now() - (centralBase.lastHitTime || 0);
                const isUnderAttack = timeSinceBaseHit < 30000; // 30,000 ms = 30 segundos

                let activeBaseSrc = (isUnderAttack && centralBase.srcHit) ? centralBase.srcHit : centralBase.srcIdle;

                // 3. Dibujar Spritesheet Animado del Cristal
                if (activeBaseSrc) {
                    if (!baseSpriteCache[activeBaseSrc]) {
                        const img = new Image();
                        img.src = activeBaseSrc;
                        baseSpriteCache[activeBaseSrc] = img;
                    }

                    const bImg = baseSpriteCache[activeBaseSrc];

                    if (bImg.complete && bImg.naturalWidth > 0) {
                        const frameW = 64;
                        const frameH = 64;

                        const totalFrames = Math.max(1, Math.floor(bImg.naturalWidth / frameW));
                        const animSpeed = isUnderAttack ? 100 : 150; // Gira más rápido si le disparan

                        let currentFrameX = 0;
                        if (totalFrames > 1) {
                            currentFrameX = Math.floor((Date.now() / animSpeed) % totalFrames) * frameW;
                        }

                        const renderScale = 1.0;
                        const finalW = frameW * renderScale * zoomLevel;
                        const finalH = frameH * renderScale * zoomLevel;

                        // 🌟 MAGIA: Le sumamos offsetX y offsetY SOLAMENTE al dibujo de la imagen
                        ctx.drawImage(
                            bImg,
                            currentFrameX, 0, frameW, frameH,
                            bDrawX - (finalW / 2) + offsetX,
                            bDrawY - (finalH / 2) + hoverY - (10 * zoomLevel) + offsetY,
                            finalW, finalH
                        );
                    }
                } else {
                    // Poste Gris de emergencia (también le aplicamos los offsets por si acaso)
                    ctx.fillStyle = "#555";
                    ctx.fillRect(bDrawX - (8 * zoomLevel) + offsetX, bDrawY - (20 * zoomLevel) + hoverY + offsetY, 16 * zoomLevel, 32 * zoomLevel);
                }

                // ==========================================
                // 4. DIBUJAR LA BARRA DE VIDA
                // ==========================================
                const barW = 50 * zoomLevel;
                const barH = 6 * zoomLevel;
                const barX = bDrawX - (barW / 2);
                const barY = bDrawY - (45 * zoomLevel) + hoverY;

                ctx.fillStyle = "rgba(0,0,0,0.8)";
                ctx.fillRect(barX, barY, barW, barH);

                const hpPercent = Math.max(0, centralBase.hp / centralBase.maxHp);

                if (hpPercent < 0.3) ctx.fillStyle = "#e74c3c";
                else if (isUnderAttack) ctx.fillStyle = "#e67e22";
                else ctx.fillStyle = "#3498db";

                ctx.fillRect(barX, barY, barW * hpPercent, barH);

                ctx.fillStyle = "white";
                ctx.font = `bold ${8 * zoomLevel}px sans-serif`;
                ctx.textAlign = "center";

                let baseStatus = (centralBase.name || 'Base').toUpperCase();
                if (centralBase.currentOwnerSquadId) {
                    baseStatus = `${centralBase.name || 'Base'}: ${(centralBase.currentOwnerSquadId || '').toUpperCase()}`;
                }
                baseStatus += ` - ${Math.floor(centralBase.hp)}/${centralBase.maxHp}`;
                ctx.fillText(baseStatus, bDrawX, barY - (4 * zoomLevel));
            }
            // ==========================================
            // 5. MODO DEBUG: DIBUJAR EL HITBOX REAL RECTANGULAR
            // ==========================================
            if (editMode && centralBase) {
                const hitDrawX = Math.round(screenCenterX + ((centralBase.worldX + (centralBase.hitboxOffsetX || 0)) - player.worldX) * zoomLevel);
                const hitDrawY = Math.round(screenCenterY + ((centralBase.worldY + (centralBase.hitboxOffsetY || 0)) - player.worldY) * zoomLevel);

                const drawW = (centralBase.hitboxW || 32) * zoomLevel;
                const drawH = (centralBase.hitboxH || 32) * zoomLevel;

                ctx.beginPath();
                ctx.strokeStyle = "rgba(231, 76, 60, 0.8)"; // Rojo brillante
                ctx.lineWidth = 2 * zoomLevel;
                ctx.setLineDash([5, 5]);

                // Dibujamos el RECTÁNGULO centrado
                ctx.strokeRect(hitDrawX - (drawW / 2), hitDrawY - (drawH / 2), drawW, drawH);
                ctx.setLineDash([]);

                // Cruz en el centro exacto
                ctx.fillStyle = "red";
                ctx.fillRect(hitDrawX - 2, hitDrawY - 2, 4, 4);
            }

            // === 6. DRAW EDIT MODE UI (SELECTION BOXES) ===
            if (editMode) { // <--- VOLVER A ABRIR PARA TODO EL EDITOR
                
                // === 6.1 DRAW EDITOR OVERLAYS (COLLISIONS & LOGIC) ===
                if (showCollisionOverlay || showLogicOverlay) {
                    const viewRadius = Math.ceil((Math.max(canvas.width, canvas.height) / (TILE_SIZE * zoomLevel)) / 2) + 2;
                    const cGridX = Math.floor(player.worldX / TILE_SIZE);
                    const cGridY = Math.floor(player.worldY / TILE_SIZE);
                    
                    const minX = cGridX - viewRadius;
                    const maxX = cGridX + viewRadius;
                    const minY = cGridY - viewRadius;
                    const maxY = cGridY + viewRadius;

                    for (let x = minX; x <= maxX; x++) {
                        for (let y = minY; y <= maxY; y++) {
                            // Revisamos todas las capas de 0 a 15 (o solo la activa? Mejor todas para ver los triggers)
                            for (let l = 0; l <= 15; l++) {
                                const k = getMapKey(x, y, l);
                                const t = worldMap.get(k);
                                if (!t) continue;

                                const drawX = Math.round(screenCenterX + (x * TILE_SIZE - player.worldX) * zoomLevel);
                                const drawY = Math.round(screenCenterY + (y * TILE_SIZE - player.worldY) * zoomLevel);
                                const drawSize = TILE_SIZE * zoomLevel;

                                if (showCollisionOverlay && t.hasCollision) {
                                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                                }

                                if (showLogicOverlay && (
                                    (t.triggerType && t.triggerType !== 'none') || 
                                    t.requiresClick || 
                                    (t.gameType && t.gameType !== 'none') || 
                                    (t.destX !== undefined && t.destX !== null && t.destX !== "") || 
                                    (t.itemId && t.itemId !== "")
                                )) {
                                    ctx.fillStyle = 'rgba(155, 89, 182, 0.5)';
                                    ctx.fillRect(drawX, drawY, drawSize, drawSize);
                                }
                            }
                        }
                    }
                }
                let box = mapSelectionBox;

                if (worldMode === 'select' && isDraggingMapBox && mapSelectStart && mapSelectEnd) {
                    box = {
                        minX: Math.min(mapSelectStart.x, mapSelectEnd.x), maxX: Math.max(mapSelectStart.x, mapSelectEnd.x),
                        minY: Math.min(mapSelectStart.y, mapSelectEnd.y), maxY: Math.max(mapSelectStart.y, mapSelectEnd.y)
                    };
                }

                if (box) {
                    const w = (box.maxX - box.minX + 1) * TILE_SIZE * zoomLevel;
                    const h = (box.maxY - box.minY + 1) * TILE_SIZE * zoomLevel;
                    const bx = Math.round(screenCenterX + (box.minX * TILE_SIZE - player.worldX) * zoomLevel);
                    const by = Math.round(screenCenterY + (box.minY * TILE_SIZE - player.worldY) * zoomLevel);

                    ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 2 * zoomLevel; ctx.strokeRect(bx, by, w, h);
                    ctx.fillStyle = 'rgba(142, 68, 173, 0.3)'; ctx.fillRect(bx, by, w, h);
                    // 👇 NUEVO: EFECTO FANTASMA AL ARRASTRAR 👇
                    if (isDraggingSelection) {
                        ctx.globalAlpha = 0.6; // Transparente
                        const dx = mapSelectionBox.minX - dragOriginalMinX;
                        const dy = mapSelectionBox.minY - dragOriginalMinY;

                        draggedTilesBuffer.forEach(t => {
                            const tsData = getTilesetData(t.tileId);
                            if (!tsData || !tsData.img) return;

                            const drawX = Math.round(screenCenterX + (((t.x + dx) * TILE_SIZE) - player.worldX) * zoomLevel);
                            const drawY = Math.round(screenCenterY + (((t.y + dy) * TILE_SIZE) - player.worldY) * zoomLevel);

                            const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                            const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                            const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;

                            const tileRot = t.rotation || 0;
                            const scaledDrawSize = TILE_SIZE * zoomLevel;
                            if (tileRot !== 0) {
                                ctx.save();
                                ctx.translate(drawX + scaledDrawSize / 2, drawY + scaledDrawSize / 2);
                                ctx.rotate(tileRot * Math.PI / 180);
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, -scaledDrawSize / 2, -scaledDrawSize / 2, scaledDrawSize, scaledDrawSize);
                                ctx.restore();
                            } else {
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, scaledDrawSize, scaledDrawSize);
                            }
                        });
                        ctx.globalAlpha = 1.0;
                    }
                } // END of if(box)

                // 👇 NUEVO: EFECTO FANTASMA AL PINTAR MULTIPLES TILES (BLUEPRINT PREVIEW) 👇
                if (worldMode === 'paint' && selectedGrid && (selectedGrid.w > 1 || selectedGrid.h > 1 || selectedGrid.isMultiLayer)) {
                    ctx.globalAlpha = 0.5; // Fantasma semitransparente
                    const sGridX = editorMouseGridX;
                    const sGridY = editorMouseGridY;

                    if (selectedGrid.isMultiLayer && selectedGrid.multiTiles) {
                        selectedGrid.multiTiles.forEach(t => {
                            const l = t.layer !== undefined ? t.layer : t.l;
                            if (hiddenLayers.has(l)) return; // No preview hidden layers
                            const tId = t.tileId !== undefined ? t.tileId : (t.id !== undefined ? t.id : -1);
                            if (tId === -1) return;
                            const tsData = getTilesetData(tId);
                            if (!tsData || !tsData.img) return;

                            const drawX = Math.round(screenCenterX + (((sGridX + t.x) * TILE_SIZE) - player.worldX) * zoomLevel);
                            const drawY = Math.round(screenCenterY + (((sGridY + t.y) * TILE_SIZE) - player.worldY) * zoomLevel);
                            const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                            const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                            const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;
                            const scaledDrawSize = TILE_SIZE * zoomLevel;

                            const rot = t.rotation !== undefined ? t.rotation : (t.rot || 0);
                            if (rot && rot !== 0) {
                                ctx.save();
                                ctx.translate(drawX + scaledDrawSize / 2, drawY + scaledDrawSize / 2);
                                ctx.rotate(rot * Math.PI / 180);
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, -scaledDrawSize / 2, -scaledDrawSize / 2, scaledDrawSize, scaledDrawSize);
                                ctx.restore();
                            } else {
                                ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, scaledDrawSize, scaledDrawSize);
                            }
                        });
                    } else if (selectedGrid.tiles) {
                        for (let r = 0; r < selectedGrid.h; r++) {
                            for (let c = 0; c < selectedGrid.w; c++) {
                                const cellData = selectedGrid.tiles[r][c];
                                const tileId = typeof cellData === 'object' ? cellData.id : cellData;
                                if (tileId < 0) continue;
                                const tsData = getTilesetData(tileId);
                                if (!tsData || !tsData.img) continue;

                                const drawX = Math.round(screenCenterX + (((sGridX + c) * TILE_SIZE) - player.worldX) * zoomLevel);
                                const drawY = Math.round(screenCenterY + (((sGridY + r) * TILE_SIZE) - player.worldY) * zoomLevel);
                                const tilesPerRow = Math.floor(tsData.img.width / TILE_SIZE);
                                const sx = (tsData.localId % tilesPerRow) * TILE_SIZE;
                                const sy = Math.floor(tsData.localId / tilesPerRow) * TILE_SIZE;
                                const scaledDrawSize = TILE_SIZE * zoomLevel;

                                const rot = typeof cellData === 'object' ? cellData.rot : 0;

                                if (rot !== 0) {
                                    ctx.save();
                                    ctx.translate(drawX + scaledDrawSize / 2, drawY + scaledDrawSize / 2);
                                    ctx.rotate(rot * Math.PI / 180);
                                    ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, -scaledDrawSize / 2, -scaledDrawSize / 2, scaledDrawSize, scaledDrawSize);
                                    ctx.restore();
                                } else {
                                    ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, scaledDrawSize, scaledDrawSize);
                                }
                            }
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }

                // 👇 NUEVO: GRID OVERLAY 👇
                if (showGridOverlay) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.lineWidth = 1;
                    
                    const viewRadius = Math.ceil((Math.max(canvas.width, canvas.height) / (TILE_SIZE * zoomLevel)) / 2) + 2;
                    const cGridX = Math.floor(player.worldX / TILE_SIZE);
                    const cGridY = Math.floor(player.worldY / TILE_SIZE);
                    const minX = cGridX - viewRadius;
                    const maxX = cGridX + viewRadius;
                    const minY = cGridY - viewRadius;
                    const maxY = cGridY + viewRadius;

                    ctx.beginPath();
                    for (let x = minX; x <= maxX; x++) {
                        const drawX = Math.round(screenCenterX + (x * TILE_SIZE - player.worldX) * zoomLevel);
                        ctx.moveTo(drawX, 0);
                        ctx.lineTo(drawX, canvas.height);
                    }
                    for (let y = minY; y <= maxY; y++) {
                        const drawY = Math.round(screenCenterY + (y * TILE_SIZE - player.worldY) * zoomLevel);
                        ctx.moveTo(0, drawY);
                        ctx.lineTo(canvas.width, drawY);
                    }
                    ctx.stroke();
                }

                if (inspectingCoord && !mapSelectionBox) {
                    const [gx, gy, gl] = inspectingCoord.split(',').map(Number);
                    if (gl === activeLayer) {
                        const bx = Math.round(screenCenterX + (gx * TILE_SIZE - player.worldX) * zoomLevel);
                        const by = Math.round(screenCenterY + (gy * TILE_SIZE - player.worldY) * zoomLevel);
                        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2 * zoomLevel; ctx.strokeRect(bx, by, TILE_SIZE * zoomLevel, TILE_SIZE * zoomLevel);
                    }
                }
                // --- VISUALIZAR ZONAS UNIVERSALES (CON FILTROS Y ESTILOS DINÁMICOS) ---
                if (showSafeZoneVisuals && window.ZONE_CONFIG) {
                    for (let i = 0; i < safeZones.length; i++) {
                        let z = safeZones[i];
                        const zType = z.zoneType || 'safe';

                        // 🛑 EL FIX DEL FILTRO: ¿Deberíamos dibujar esta zona?
                        if (activeZoneFilter !== 'all' && activeZoneFilter !== zType) {
                            continue; // Saltar al siguiente ciclo si no coincide con el filtro activo
                        }

                        // Buscar colores en el Diccionario Maestro (Failsafe a blanco si la zona es muy vieja)
                        const config = window.ZONE_CONFIG[zType] || { icon: "❓", colorBorder: "white", colorFill: "rgba(255,255,255,0.2)" };

                        const w = (z.xMax - z.xMin) * zoomLevel;
                        const h = (z.yMax - z.yMin) * zoomLevel;
                        const bx = Math.round(screenCenterX + (z.xMin - player.worldX) * zoomLevel);
                        const by = Math.round(screenCenterY + (z.yMin - player.worldY) * zoomLevel);

                        ctx.strokeStyle = config.colorBorder;
                        ctx.lineWidth = 2 * zoomLevel;
                        ctx.strokeRect(bx, by, w, h);

                        ctx.fillStyle = config.colorFill;
                        ctx.fillRect(bx, by, w, h);

                        ctx.fillStyle = ctx.strokeStyle; // Mismo color del borde
                        ctx.font = `bold ${10 * zoomLevel}px sans-serif`;
                        ctx.textAlign = "center";
                        ctx.lineWidth = 3 * zoomLevel;
                        ctx.strokeStyle = "black";
                        ctx.lineJoin = "round";

                        const labelText = `${config.icon} ${z.name}`;
                        ctx.strokeText(labelText, bx + (w / 2), by + (h / 2));
                        ctx.fillText(labelText, bx + (w / 2), by + (h / 2));
                    }
                }
            }

            // === DIBUJAR EL FOGONAZO (MUZZLE FLASH) ===
            // Dura solo 50 milisegundos en pantalla tras cada disparo
            if (Date.now() - lastShotTime < 50 && player.equippedWeapon !== "none") {
                const stats = WEAPONS[player.equippedWeapon];

                // 🛑 EL FIX: Solo dibujar la luz brillante si el arma es "ranged"
                if (stats && stats.type === 'ranged') {
                    const fX = Math.floor(screenCenterX + (player.lastShotX - renderWorldX) * zoomLevel);
                    const fY = Math.floor(screenCenterY + (player.lastShotY - renderWorldY) * zoomLevel);

                    ctx.fillStyle = stats.color || "#ffcc00"; // Usar el color del arma

                    // 🛡️ EL FIX DE RENDIMIENTO MÓVIL: Sombra solo en PC
                    if (!isTouchDevice) {
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = stats.color || "#ffcc00";
                    }

                    ctx.beginPath();
                    ctx.arc(fX, fY, 8 * zoomLevel, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0; // Apagarlo siempre por seguridad
                }
            }

            // --- HELPER: Dibujar Barra de Vida Dinámica ---
            function drawHealthBar(x, y, hp, maxHp, scaledWidth, lastHpUpdate) {
                // Si nunca se ha actualizado y tiene la vida llena, no dibujar
                if (!lastHpUpdate && hp === maxHp) return;

                const timeSinceUpdate = Date.now() - (lastHpUpdate || 0);

                // Si pasaron 4 segundos sin CAMBIOS de vida, ocultar
                if (timeSinceUpdate > 4000) return;

                // Fade out el último segundo
                let alpha = 1.0;
                if (timeSinceUpdate > 3000) {
                    alpha = 1.0 - ((timeSinceUpdate - 3000) / 1000);
                }

                ctx.globalAlpha = alpha;

                const barW = 24 * zoomLevel;
                const barH = 4 * zoomLevel;
                const barX = x + (scaledWidth / 2) - (barW / 2);
                const barY = y - (5 * zoomLevel); // Flotando ligeramente sobre la cabeza

                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(barX, barY, barW, barH);

                const healthPercent = Math.max(0, hp / maxHp);
                ctx.fillStyle = healthPercent > 0.3 ? "#2ecc71" : "#e74c3c";
                ctx.fillRect(barX, barY, barW * healthPercent, barH);

                ctx.globalAlpha = 1.0;
            }

            // === 5. DRAW NAMETAGS, BUBBLES & HEALTH BARS ===
            const scaledWidth = FRAME_WIDTH * zoomLevel;  // 48 px de ancho
            const scaledHeight = FRAME_HEIGHT * zoomLevel; // 64 px de alto (EL FIX PRINCIPAL)
            for (let id in otherPlayers) {
                const p = otherPlayers[id];
                if (!p || p.worldX === undefined || !p.username || p.invisibleEnabled) continue;

                // Centro exacto del otro jugador
                const pCenterX = Math.floor(screenCenterX + ((p.worldX - renderWorldX) * zoomLevel));
                const pCenterY = Math.floor(screenCenterY + ((p.worldY - renderWorldY) * zoomLevel));

                // Esquina superior izquierda (para que la barra y el nombre floten arriba de la cabeza)
                const pTopLeftX = pCenterX - (scaledWidth / 2);
                const pTopLeftY = pCenterY - (scaledHeight / 2);

                const currentHp = p.hp !== undefined ? p.hp : 100;
                drawHealthBar(pTopLeftX, pTopLeftY, currentHp, 100, scaledWidth, p.lastHpUpdateTime);
                drawDynamicBubble(p.message, p.messageTimer, p.isTyping, pTopLeftX, pTopLeftY, scaledWidth);
                drawNametag(p, pTopLeftX, pTopLeftY, scaledWidth, scaledHeight, getColorForString(p.username));

                // ⏱️ Decrement locally so bubble fades without needing constant network updates
                if (p.messageTimer > 0) p.messageTimer--;
            }

            // Dibujar TU barra de vida, nombre y clan
            const myTopLeftX = myDrawX - (scaledWidth / 2);
            const myTopLeftY = myDrawY - (scaledHeight / 2);

            drawHealthBar(myTopLeftX, myTopLeftY, player.hp, player.maxHp || 100, scaledWidth, player.lastHpUpdateTime);
            drawDynamicBubble(player.message, player.messageTimer, player.isTyping, myTopLeftX, myTopLeftY, scaledWidth);
            drawNametag(player, myTopLeftX, myTopLeftY, scaledWidth, scaledHeight, "#f1c40f");

            if (player.messageTimer > 0) {
                player.messageTimer--;
                if (player.messageTimer === 0) {
                    player.message = ''; // Clear so the network broadcasts empty → others hide bubble
                }
            }

            // === DIBUJAR NÚMEROS DE DAÑO (CON POOLING) ===
            for (let i = 0; i < MAX_FX; i++) {
                let dt = damageTexts[i];
                if (!dt.active) continue; // Ignorar los apagados

                dt.life--;
                dt.y -= 0.6; // El texto flota hacia arriba

                const dtDrawX = Math.floor(screenCenterX + (dt.x - renderWorldX) * zoomLevel);
                const dtDrawY = Math.floor(screenCenterY + (dt.y - renderWorldY) * zoomLevel);

                ctx.globalAlpha = Math.max(0, dt.life / (dt.maxLife / 2));
                const fontSize = 10 * zoomLevel;
                ctx.font = `900 ${fontSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.lineWidth = 3 * zoomLevel;
                ctx.strokeStyle = "black";
                ctx.lineJoin = "round";

                ctx.strokeText(dt.text, dtDrawX, dtDrawY);
                ctx.fillStyle = dt.color;
                ctx.fillText(dt.text, dtDrawX, dtDrawY);

                if (dt.life <= 0) dt.active = false; // 🛑 LA MAGIA: Apagar en vez de splice()
            }
            ctx.globalAlpha = 1.0;

            // === 💥 DIBUJAR EFECTOS DE IMPACTO (CON POOLING) 💥 ===
            for (let i = 0; i < MAX_FX; i++) {
                let spark = hitSparks[i];
                if (!spark.active) continue; // Ignorar apagados

                spark.life--;
                const sDrawX = Math.floor(screenCenterX + (spark.x - renderWorldX) * zoomLevel);
                const sDrawY = Math.floor(screenCenterY + (spark.y - renderWorldY) * zoomLevel);

                const radius = (1 - (spark.life / spark.maxLife)) * 12 * zoomLevel;

                // Efecto 1: Onda expansiva
                ctx.globalAlpha = spark.life / spark.maxLife;
                ctx.beginPath(); ctx.arc(sDrawX, sDrawY, radius, 0, Math.PI * 2);
                ctx.strokeStyle = "white"; ctx.lineWidth = 2 * zoomLevel; ctx.stroke();

                // Efecto 2: Núcleo brillante
                ctx.beginPath(); ctx.arc(sDrawX, sDrawY, radius * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = spark.color; ctx.fill();

                if (spark.life <= 0) spark.active = false; // 🛑 APAGAR
            }
            ctx.globalAlpha = 1.0;

            // ==========================================================
            // ⛅ AMBIENT WEATHER & DAY/NIGHT ENGINE ⛅
            // ==========================================================

            // 1. NIGHT CYCLE (With Local Player Lantern Effect)
            let isNight = false;
            if (gameSettings.timeMode === 'night') {
                isNight = true;
            } else if (gameSettings.timeMode === 'auto') {
                // Get the player's real-world physical time
                const currentHour = new Date().getHours();
                // If it is past 6:00 PM (18) or before 6:00 AM (6), it is dark.
                isNight = (currentHour >= 18 || currentHour < 6);
            }

            if (isNight) {
                // Creates a gradient that is transparent near the player and dark blue/black at the edges
                const lanternGradient = ctx.createRadialGradient(
                    screenCenterX, screenCenterY - (20 * zoomLevel), 40 * zoomLevel, // Inner light circle
                    screenCenterX, screenCenterY, 300 * zoomLevel                    // Outer darkness boundary
                );

                // You can tweak these colors if you want it darker or more purple!
                lanternGradient.addColorStop(0, "rgba(10, 15, 40, 0.05)"); // Core light
                lanternGradient.addColorStop(0.5, "rgba(10, 15, 40, 0.6)");  // Mid shadows
                lanternGradient.addColorStop(1, "rgba(5, 5, 20, 0.9)");      // Pitch black edges

                ctx.fillStyle = lanternGradient;
                ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            }

            // ==========================================================
            // ⛅ AMBIENT WEATHER & DAY/NIGHT ENGINE ⛅
            // ==========================================================
            // 2. RAIN PARTICLE SYSTEM (Screen-space) WITH SPLASHES (OBJECT POOLING)
            if (gameSettings.rainEnabled && !isUnderRoof) {

                // 1. Activar 3 gotas nuevas por frame (buscar las que estén apagadas)
                let spawned = 0;
                for (let i = 0; i < MAX_RAIN && spawned < 3; i++) {
                    if (!window.rainParticles[i].active) {
                        let r = window.rainParticles[i];
                        r.active = true;
                        r.x = (Math.random() * window.innerWidth * 1.5) - (window.innerWidth * 0.25);
                        r.y = Math.random() * -100 - 10;
                        r.targetY = (Math.random() * window.innerHeight * 0.8) + (window.innerHeight * 0.2);
                        r.len = Math.random() * 20 + 15;
                        r.vx = -2.5;
                        r.vy = Math.random() * 10 + 20;
                        r.isSplashing = false;
                        r.splashLife = 6;
                        spawned++;
                    }
                }

                ctx.lineWidth = 1 * zoomLevel;

                // 2. Mover y dibujar
                for (let i = 0; i < MAX_RAIN; i++) {
                    let r = window.rainParticles[i];
                    if (!r.active) continue; // Ignorar gotas apagadas

                    if (!r.isSplashing) {
                        r.x += (r.vx - (player.vx * 1.3)) * zoomLevel;
                        r.y += (r.vy - (player.vy * 1.3)) * zoomLevel;

                        ctx.strokeStyle = "rgba(174, 214, 241, 0.5)";
                        ctx.beginPath();
                        ctx.moveTo(r.x, r.y);
                        const visualWindX = r.vx - (player.vx * 1.6);
                        ctx.lineTo(r.x + (visualWindX * (r.len / r.vy)), r.y + r.len);
                        ctx.stroke();

                        if (r.y > r.targetY) r.isSplashing = true;
                    } else {
                        r.x -= player.vx * zoomLevel;
                        r.y -= player.vy * zoomLevel;
                        r.splashLife--;

                        const splashRadius = (6 - r.splashLife) * 0.8 * zoomLevel;
                        ctx.strokeStyle = `rgba(174, 214, 241, ${r.splashLife / 6})`;
                        ctx.beginPath();
                        ctx.ellipse(r.x, r.y, splashRadius * 2, splashRadius, 0, 0, Math.PI * 2);
                        ctx.stroke();

                        if (r.splashLife <= 0) r.active = false; // 🛑 APAGAR EN VEZ DE BORRAR
                    }
                }
            } else if (isUnderRoof) {
                // Apagar toda la lluvia instantáneamente si entras a una casa
                for (let i = 0; i < MAX_RAIN; i++) window.rainParticles[i].active = false;
            }
            // --- NEW: UPDATE THE MINIMAP IF OPEN ---
            // Afuera de tu función update()
            let lastMinimapUpdate = 0;

            // Adentro de update(), en lugar de if (isMapOpen) drawMinimap(); pon esto:
            if (isMapOpen) {
                const now = Date.now();
                if (now - lastMinimapUpdate > 1200) { // Actualiza el mapa cada 200ms (5 FPS)
                    drawMinimap();
                    lastMinimapUpdate = now;
                }
            }

            // Restaurar la posición física real para que la red y la física sigan perfectas
            if (isCinematicLoading) {
                player.worldX = realPlayerX;
                player.worldY = realPlayerY;
            }
            // --- ACTUALIZAR EL LABORATORIO MELEE EN VIVO ---
            const skelEd = document.getElementById('skeleton-editor');
            if (skelEd && skelEd.style.display !== 'none' && currentGaniTab === 'melee') {
                updateSkelPreview();
            }

            // --- ACTUALIZAR LA ANIMACIÓN DE LA TIENDA A 60 FPS ---
            if (isShopOpen) {
                drawShopPlayerPreview();
            }

            // ==========================================================
            // 🌐 7. MOTOR DE RED SINCRONIZADO (CERO JSON.STRINGIFY LAG)
            // ==========================================================
            networkTimer += dtMs;

            if (networkTimer >= NETWORK_TICK_RATE) {
                networkTimer = 0;

                if (ws.readyState === WebSocket.OPEN && player.username) {
                    const timeNow = Date.now();
                    const rx = Math.round(player.worldX);
                    const ry = Math.round(player.worldY);

                    // 🛑 EL FIX: Condicional matemático puro (Costo CPU = 0%)
                    const isDirty = (
                        rx !== window.lastNetX ||
                        ry !== window.lastNetY ||
                        player.frameY !== window.lastNetDir ||
                        player.isMoving !== window.lastNetMoving ||
                        player.equippedWeapon !== window.lastNetWep ||
                        player.message !== window.lastNetMsg ||
                        player.isTyping !== window.lastNetTyping ||
                        player.isSitting !== window.lastNetSitting
                    );

                    // Solo enviamos si algo cambió, o si pasaron 2 segundos por seguridad
                    if (isDirty || timeNow - (window.lastForceSendTime || 0) > 2000) {
                        ws.send(MessagePack.encode({
                            type: 'update',
                            player: {
                                username: player.username,
                                worldX: rx, worldY: ry, // Enviamos números enteros, ahorra datos
                                frameX: player.frameX, frameY: player.frameY,
                                isMoving: player.isMoving,
                                message: player.message, messageTimer: player.messageTimer,
                                isTyping: player.isTyping,
                                isSitting: player.isSitting,
                                equippedWeapon: player.equippedWeapon
                            }
                        }));

                        // Actualizar la memoria rápida
                        window.lastNetX = rx; window.lastNetY = ry;
                        window.lastNetDir = player.frameY; window.lastNetMoving = player.isMoving;
                        window.lastNetWep = player.equippedWeapon; window.lastNetMsg = player.message;
                        window.lastNetTyping = player.isTyping; window.lastNetSitting = player.isSitting;
                        window.lastForceSendTime = timeNow;
                    }
                }
            }
        }

        // 🌟 SISTEMA DE LOGROS Y TAREAS (LOGICA UI) 🌟
        if(typeof globalTasks === 'undefined') {
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

        // 👇 NUEVA VARIABLE PARA EL RELOJ
        let activeTasksInterval = null;

        tasksBtn.addEventListener('click', () => {
            if (!player || !player.accountId) return alert("⚠️ You must log in to view achievements.");
            tasksModal.style.display = 'flex';
            renderTasksModal();
        });

        // 👇 ACTUALIZAR EL BOTÓN DE CERRAR
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
                
                // Misma lógica a prueba de fallos
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
                
                if (isClaimed) continue; // Si ya la reclamó, la saltamos

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
            tasksList.innerHTML = '';
            
            // Limpiar cualquier reloj previo antes de redibujar
            if (activeTasksInterval) clearInterval(activeTasksInterval);

            const now = Date.now();

            for (let taskId in globalTasks) {
                const task = globalTasks[taskId];
                if (task.category !== currentTaskCategory) continue;

                // 🛑 EL FIX: Asumir que si está en 'daily', ES repetible automáticamente
                const isRepeatable = task.isRepeatable || task.category === 'daily';
                const cooldownMs = task.resetIntervalMs || 86400000; // 24 horas por defecto

                let isClaimed = false;
                let lastClaimedTime = null;
                let timeRemainingMs = 0;

                // Detectamos cómo manda el servidor los datos
                if (Array.isArray(myClaimedTasks)) {
                    isClaimed = myClaimedTasks.includes(taskId);
                    // Como es un array, no tenemos la hora exacta. Inventaremos un tiempo positivo para activar la UI amarilla.
                    if (isClaimed && isRepeatable) {
                        timeRemainingMs = 1; 
                    }
                } else if (myClaimedTasks && typeof myClaimedTasks === 'object') {
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

                // Cálculo del progreso actual
                let currentVal = 0;
                let lockedByAntiCheat = false;
                let antiCheatMsg = "";
                if (task.requirementType === 'login') currentVal = 1;
                else if (task.requirementType === 'kills') currentVal = player.kills;
                else if (task.requirementType === 'elo') currentVal = player.elo;
                else if (task.requirementType === 'play_hours') currentVal = myTaskProgress[taskId] || 0;
                else if (task.requirementType === 'squad_base_minutes') {
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
                                    // Player joined after milestone was achieved.
                                    // Completely hide the achievement so they don't feel left out.
                                    continue;
                                } else {
                                    const daysInSquad = (Date.now() - joinedTime) / (1000 * 60 * 60 * 24);
                                    if (daysInSquad < 15 && !milestoneDate) {
                                        lockedByAntiCheat = true;
                                        antiCheatMsg = `\uD83D\uDD12 Disponible en ${Math.ceil(15 - daysInSquad)} d\u00edas`;
                                    }
                                }
                            }
                        }
                    }
                }

                const progressPercent = Math.min(100, Math.floor((currentVal / task.requirementValue) * 100));
                const canClaim = (currentVal >= task.requirementValue) && !isClaimed && !lockedByAntiCheat;

                const card = document.createElement('div');
                card.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 15px; display: flex; flex-direction: column; gap: 10px; transition: 0.3s;";
                
                if (isClaimed) {
                    card.style.opacity = "0.5";
                    card.style.filter = "grayscale(100%)";
                    card.style.webkitFilter = "grayscale(100%)";
                }

                let rewardDisplay = "";
                if(task.rewardType === 'coins') {
                    rewardDisplay = `<span style="font-size: 16px; margin-right: 4px; vertical-align: middle;">💰</span> <span style="color: gold; font-weight: bold;">+${task.rewardValue}</span>`;
                } else {
                    rewardDisplay = `<span style="color: #2ecc71; font-weight: bold;">Item: ${task.rewardValue}</span>`;
                }

                // 🛑 LA MAGIA DE LA UI: Generar botón dinámico según el estado
                let btnHtml = "";
                if (isClaimed && isRepeatable) {
                    if (lastClaimedTime) {
                        // SI HAY HORA: Mostrar Temporizador Real
                        const expireTime = lastClaimedTime + cooldownMs;
                        btnHtml = `<button class="claim-btn task-timer" data-expire="${expireTime}" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ --:--:--
                        </button>`;
                    } else {
                        // NO HAY HORA (Servidor manda Array): Mostrar texto de espera sin temporizador vivo
                        btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #f1c40f; border: 1px solid #f1c40f; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                            ⏳ En enfriamiento (Vuelve más tarde)
                        </button>`;
                    }
                } else if (isClaimed && !isRepeatable) {
                    // Reclamado para siempre (Milestones)
                    btnHtml = `<button class="claim-btn" disabled style="background: #555; color: #888; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
                        CLAIMED
                    </button>`;
                } else if (lockedByAntiCheat) {
                    btnHtml = `<button class="claim-btn" disabled style="background: transparent; color: #e74c3c; border: 1px solid #e74c3c; padding: 8px; border-radius: 5px; font-weight: bold; cursor: not-allowed; font-family: monospace; font-size: 14px; transition: 0.2s; margin-top: 5px; text-shadow: 1px 1px 0px black;">
                        🔒 ${antiCheatMsg}
                    </button>`;
                } else {
                    // Botón Normal para reclamar (o bloqueado si no hay progreso suficiente)
                    btnHtml = `<button class="claim-btn" ${canClaim ? '' : 'disabled'} style="background: ${canClaim ? '#2ecc71' : '#555'}; color: ${canClaim ? 'black' : '#888'}; border: none; padding: 8px; border-radius: 5px; font-weight: bold; cursor: ${canClaim ? 'pointer' : 'not-allowed'}; font-family: sans-serif; transition: 0.2s; margin-top: 5px;">
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
                            <div style="background: ${canClaim ? '#2ecc71' : '#3498db'}; width: ${progressPercent}%; height: 100%; transition: width 0.3s;"></div>
                        </div>
                        <div style="color: white; font-size: 10px; font-weight: bold; min-width: 40px; text-align: right;">${Math.min(currentVal, task.requirementValue)} / ${task.requirementValue}</div>
                    </div>
                    ${btnHtml}
                `;

                if (canClaim) {
                    const btn = card.querySelector('.claim-btn');
                    btn.addEventListener('click', (e) => {
                        e.target.innerText = "Procesando...";
                        e.target.style.background = "#f1c40f"; 
                        e.target.disabled = true;
                        ws.send(MessagePack.encode({ type: 'claim_task', taskId: taskId }));
                    });
                }

                tasksList.appendChild(card);
            }

            // Iniciar o reiniciar el motor del reloj
            if (activeTasksInterval) clearInterval(activeTasksInterval);
            activeTasksInterval = setInterval(updateTaskTimers, 1000);
            updateTaskTimers(); // Ejecutar el primer frame de inmediato
        }

        function updateTaskTimers() {
            const timers = document.querySelectorAll('.task-timer');
            const now = Date.now();
            
            timers.forEach(timerEl => {
                const expireTime = Number(timerEl.getAttribute('data-expire'));
                const diffMs = expireTime - now;
                
                if (diffMs <= 0) {
                    // ¡El tiempo acabó! El botón amarillo desaparece y volvemos a dibujar
                    // la ventana completa para que se pinte verde
                    renderTasksModal();
                    if(typeof checkTaskBadge === 'function') checkTaskBadge();
                } else {
                    // Matemáticas simples para sacar Horas, Minutos y Segundos
                    const totalSeconds = Math.floor(diffMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
                    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
                    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
                    
                    timerEl.innerText = `⏳ Disponible en ${hours}:${minutes}:${seconds}`;
                }
            });
        }

        update();

