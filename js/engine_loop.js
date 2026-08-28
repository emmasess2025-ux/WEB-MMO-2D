function drawModularCharacter(ctx, p, drawX, drawY, zoom) {
    // ==========================================================
    // ðŸ›‘ NUEVO SISTEMA DE ROPA (GUARDARROPA DINÃMICO) ðŸ›‘
    // ==========================================================
    const equippedBody = (p.equipped && p.equipped.body) ? p.equipped.body : 'body_default';
    const equippedHead = (p.equipped && p.equipped.head) ? p.equipped.head : 'head_default';

    // Sacamos la imagen del catÃ¡logo. Si no existe o no ha cargado, usamos la global por defecto
    const dynBodyImg = (window.loadedItemSprites && window.loadedItemSprites[equippedBody]) ? window.loadedItemSprites[equippedBody] : bodyImg;
    const dynHeadImg = (window.loadedItemSprites && window.loadedItemSprites[equippedHead]) ? window.loadedItemSprites[equippedHead] : headImg;
    // ==========================================================

    const dirIdx = p.frameY;
    let state = "idle";
    let maxFrames = 4;
    let displayFrameX = p.frameX;

    // --- LÃ“GICA DE ESTADOS Y ARMAS ---

    // ðŸª‘ CHEQUEO DE SILLA Y ESTADO DE MOVIMIENTO
    let isSitting = p.isSitting || false;

    // ðŸš€ FIX ANIMACIONES: Usamos isVisuallyMoving para los otros (suavizado) y isMoving para el local (instantÃ¡neo)
    const currentlyMoving = p.isVisuallyMoving !== undefined ? p.isVisuallyMoving : p.isMoving;

    if (isSitting) {
        state = "sit";
        maxFrames = 1; // Solo 1 frame (estÃ¡tico)
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

    // --- EXTRAER ESTADÃSTICAS Y CAPAS (Z-INDEX) ---
    let stats = {}; let d = {};
    let aZ = 1, wZ = 1, hZ = 1;

    if (p.equippedWeapon && p.equippedWeapon !== "none" && weaponsDB[p.equippedWeapon]) {
        stats = weaponsDB[p.equippedWeapon];
        d = stats.dirStats ? (stats.dirStats[dirIdx] || stats.dirStats[0] || {}) : {};
        aZ = d.aZ !== undefined ? d.aZ : 1;
        wZ = d.wZ !== undefined ? d.wZ : 1;
        hZ = d.hZ !== undefined ? d.hZ : 1;
    }

    // --- ROTACIÃ“N MATEMÃTICA AUTOMÃTICA (SOLO PARA MELEE) ---
    let baseAimAngle = 0; let dirM = 1;

    // Si NO es ranged, aplicamos la rotaciÃ³n forzada
    if (stats.type !== 'ranged') {
        if (dirIdx === 0) baseAimAngle = Math.PI / 2;
        else if (dirIdx === 1) { baseAimAngle = Math.PI; dirM = -1; }
        else if (dirIdx === 3) { baseAimAngle = -Math.PI / 2; dirM = -1; }
    }

    // ðŸ”¥ LA ANIMACIÃ“N DINÃMICA DEL JUEGO REAL ðŸ”¥
    let currentAnimRot = d.wRot || 0;

    // ðŸ›‘ NUEVAS VARIABLES PARA EL EMPUJE (STAB)
    let stabOffsetX = 0;
    let stabOffsetY = 0;

    // 1. AnimaciÃ³n de Ataque Melee (Swing o Stab)
    if (p.isSwinging && stats.type !== 'ranged') {
        const elapsed = Date.now() - (p.swingStartTime || 0);
        if (elapsed < (p.swingDuration || 200)) {
            const progress = elapsed / (p.swingDuration || 200);

            // ðŸ›‘ BIFURCACIÃ“N: Â¿Es el recogedor de basura u otra arma?
            if (stats.id === 'trash_picker') {
                // AnimaciÃ³n STAB: Efecto resorte (Math.sin) para ir hacia adelante y regresar
                const stabDistance = 14; // PÃ­xeles que se estira el brazo
                const stabProgress = Math.sin(progress * Math.PI);

                // Empujamos en la direcciÃ³n a la que mira
                if (dirIdx === 0) stabOffsetY = stabProgress * stabDistance;
                else if (dirIdx === 1) stabOffsetX = -stabProgress * stabDistance;
                else if (dirIdx === 2) stabOffsetX = stabProgress * stabDistance;
                else if (dirIdx === 3) stabOffsetY = -stabProgress * stabDistance;
            } else {
                // AnimaciÃ³n SWING NORMAL (Giro de espada)
                currentAnimRot += (d.wSwg || 90) * progress;
            }
        } else {
            p.isSwinging = false;
        }
    }
    // 2. AnimaciÃ³n de Pistola (Recoil / Tilt)
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
    // ðŸ”¥ MINI-FUNCIONES DE DIBUJO MODULAR (SINCRONIZADAS AL 100%) ðŸ”¥
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
        // ðŸ›‘ EL FIX DE ROPA DINÃMICA: Usamos dynBodyImg para asegurar que recorta la piel correcta
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
    // ðŸ”¥ RENDERIZADO POR CAPAS (Z-INDEX) ðŸ”¥
    // ==========================================================
    if (aZ === 0 && !isSitting) drawAccessory();
    if (wZ === 0 && !isSitting) drawWeapon();
    if (hZ === 0 && !isSitting) drawHand();

    // ðŸ›‘ EL FIX DE ROPA DINÃMICA: Dibujamos el cuerpo con la textura del jugador actual
    if (dynBodyImg && dynBodyImg.complete) {
        ctx.drawImage(
            dynBodyImg,
            safeFrameX * FRAME_WIDTH, (baseRow + dirIdx) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
            offsetX, offsetY, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom
        );
    }

    // ðŸ›‘ EL FIX DE ROPA DINÃMICA: Dibujamos la cabeza con la textura del jugador actual
    if (dynHeadImg && dynHeadImg.complete) {
        const headSafeFrame = displayFrameX % 4;
        ctx.drawImage(
            dynHeadImg,
            headSafeFrame * FRAME_WIDTH, dirIdx * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
            offsetX + (headAnc[0] * zoom), offsetY + (headAnc[1] * zoom), FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom
        );
    }

    // ==========================================================
    // ðŸ§  EL WOBBLE (BAMBOLEO) MATEMÃTICO: Cabeza y Sombrero
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

    // 2. Dibujar SOMBRERO (Pegado a la cabeza matemÃ¡ticamente)
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

    // ðŸ›¡ï¸ RESPAWN SHIELD: Blue pulsing circle while invulnerable
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
} // <--- Fin de la funciÃ³n drawModularCharacter

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
        // ðŸ‘‡ EL FIX: Evitar que el juego intente abrir el mensaje 60 veces por segundo ðŸ‘‡
        const box = document.getElementById('retro-dialog-box');
        const isBoxOpen = box && box.style.display === 'block';

        // Solo actuamos si la caja de texto NO estÃ¡ abierta en este momento
        if (!isBoxOpen) {
            // Si es un NPC de "pisar", verificamos que no lo hayamos leÃ­do ya
            if (!logicTile.requiresClick && lastNpcTile === tileKey) return;

            showRetroDialog(logicTile.npcMessage);

            // Si fue por pisar, guardamos el bloque en la memoria para no repetirlo
            if (!logicTile.requiresClick) {
                lastNpcTile = tileKey;
            }
        }
    }
    else if (logicTile.triggerType === 'arena') {
        // ðŸ”§ FIX DE ID: El servidor guarda arenas como "arena_X_Y" (guiones bajos)
        // El tileKey puede venir como "X,Y" o "X,Y,15" â€” lo parseamos para extraer X e Y
        const parts = tileKey.toString().split(',');
        const arenaGridX = parseInt(parts[0]);
        const arenaGridY = parseInt(parts[1]);
        const correctArenaId = `arena_${arenaGridX}_${arenaGridY}`;

        // Guard: solo abrir/consultar si no estÃ¡ ya abierto con este mismo arenaId
        if (window.currentViewingArenaId !== correctArenaId) {
            window.currentViewingArenaId = correctArenaId;
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'get_arena_info', arenaId: correctArenaId }));
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
// â­ SISTEMA QUICK SWAP (HOTKEYS DESLIZABLES) â­
// =========================================================
const btnQuickSwap = document.getElementById('btn-quickswap-item');
const quickSwapMenu = document.getElementById('quickswap-menu');
const quickSwapList = document.getElementById('quickswap-list');

// 1. Conectar el BotÃ³n del Inspector
btnQuickSwap.onclick = () => {
    if (!player.quickSwaps) player.quickSwaps = [];

    // Si ya lo tiene, lo quitamos. Si no, lo agregamos.
    if (player.quickSwaps.includes(currentInspectingItemId)) {
        player.quickSwaps = player.quickSwaps.filter(id => id !== currentInspectingItemId);
        btnQuickSwap.innerText = "â­ Hotkey";
        btnQuickSwap.style.background = "#9b59b6";
        btnQuickSwap.style.boxShadow = "0 4px 0 #8e44ad";
    } else {
        // LÃ­mite de 4 armas para que el menÃº no mida 3 metros
        if (player.quickSwaps.length >= 16) player.quickSwaps.shift(); // Ahora soporta hasta 16 armas favoritas
        player.quickSwaps.push(currentInspectingItemId);

        btnQuickSwap.innerText = "âœ… Guardado";
        btnQuickSwap.style.background = "#7f8c8d";
        btnQuickSwap.style.boxShadow = "0 4px 0 #34495e";
    }

    // ðŸ‘‡ LA LÃNEA MÃGICA: Enviar al servidor en tiempo real ðŸ‘‡
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: 'update_quickswaps', quickSwaps: player.quickSwaps }));
    }
};

// 3. FunciÃ³n para Abrir el CajÃ³n de Armas
const openQuickSwapDrawer = () => {
    quickSwapList.innerHTML = "";

    if (!player.quickSwaps || player.quickSwaps.length === 0) {
        quickSwapList.innerHTML = "<div style='color:#aaa; font-size:10px; text-align:center;'>VacÃ­o</div>";
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
                icon.style.transform = "scale(1.3)"; // ðŸ”¥ SÃºper Zoom del 150%
                btn.appendChild(icon);
            }

            btn.onpointerdown = (e) => {
                if (e) e.preventDefault();

                // ðŸ’¾ GUARDAR EL ESTADO ANTES DEL SWAP
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
                    // ðŸ’¾ CARGAR EL ESTADO
                    if (player.weaponAmmo[itemId] === undefined) {
                        player.weaponAmmo[itemId] = stats.magSize;
                    }
                    player.ammo = player.weaponAmmo[itemId];

                    if (player.ammo <= 0) {
                        player.isReloading = true;
                        playItemSound(itemId, 'reload', 0.6);
                        player.reloadTimeout = setTimeout(() => {
                            player.ammo = stats.magSize;
                            if (ws && ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
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

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'update_hotbar', slotIndex: player.activeSlot, weaponId: itemId }));
                    ws.send(MessagePack.encode({ type: 'equip_weapon', weaponId: itemId }));
                }
            };

            quickSwapList.appendChild(btn);
        });
    }

    quickSwapMenu.style.display = 'flex';
};

// 4. DetecciÃ³n de Gestos (Swipe Left & Long Press)
const hudHotbarEl = document.getElementById('hud-hotbar');
let hotbarTouchStartX = 0;
let hotbarTouchStartY = 0;
let qsLongPressTimer = null;

hudHotbarEl.addEventListener('touchstart', (e) => {
    hotbarTouchStartX = e.touches[0].clientX;
    hotbarTouchStartY = e.touches[0].clientY;

    // Si mantienes el dedo 400ms, se abre el menÃº
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

    // Si deslizas rÃ¡pido a la izquierda (mÃ¡s de 30px)
    if (diffX > 30 && diffY < 40) {
        clearTimeout(qsLongPressTimer); // Cancelamos el long-press
        openQuickSwapDrawer();
        hotbarTouchStartX = null; // Reset para no abrirlo 10 veces
    }
}, { passive: true });

hudHotbarEl.addEventListener('touchend', () => {
    clearTimeout(qsLongPressTimer); // Si sueltas el dedo rÃ¡pido, no se abre
    hotbarTouchStartX = null;
});

// Soporte para PC: Clic Derecho en el Hotbar abre el menÃº
hudHotbarEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openQuickSwapDrawer();
});

// Cerrar el menÃº si haces clic o tocas cualquier otra parte de la pantalla
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

// â±ï¸ VARIABLES DEL GAME LOOP (FPS cap dinÃ¡mico segun gameSettings)
let lastFrameTime = performance.now();
const FPS_TARGET = 60;
const FRAME_MIN_TIME = 1000 / FPS_TARGET; // ~16.66ms

// ðŸ“± ROLLING AVERAGE DELTATIME (Absorbs single spike frames)
const DT_HISTORY_SIZE = 4;
const dtHistory = [FRAME_MIN_TIME, FRAME_MIN_TIME, FRAME_MIN_TIME, FRAME_MIN_TIME];
let dtHistoryIdx = 0;

let networkTimer = 0;
const NETWORK_TICK_RATE = 50; // Enviar datos cada 50ms (20 veces por segundo)

// ðŸ“Š Variables del Monitor
let fpsFrameCount = 0;
let fpsLastUpdate = performance.now();
let frameTimesTotal = 0; // Acumulador para promediar el Frame Time

const uiAmmoDisplay = document.getElementById('ammo-display');
const uiAmmoCurrent = document.getElementById('ammo-current');
const uiAmmoMax = document.getElementById('ammo-max');
const uiPerfMonitor = document.getElementById('perf-monitor');

// âš¡ HELPER: envuelve ctx.shadowBlur para respetar disableShadows.
// Todos los draws que usaban !isTouchDevice ya no necesitan cambio,
// solo reemplazamos la asignaciÃ³n directa por setShadow().
function setShadow(blur, color) {
    if (gameSettings.disableShadows || isTouchDevice) {
        ctx.shadowBlur = 0;
    } else {
        ctx.shadowBlur = blur;
        ctx.shadowColor = color || 'transparent';
    }
}

function _real_update(currentTime) {
    // 1. Pedir el siguiente frame
    requestAnimationFrame(update);

    if (!currentTime) currentTime = performance.now();
    let rawDelta = currentTime - lastFrameTime;

    // âš¡ FPS CAP DINÃMICO
    const minFrameMs = gameSettings.fpsCap >= 60 ? 10 : (1000 / gameSettings.fpsCap) - 2;
    if (rawDelta < minFrameMs) return;

    // ðŸ“± ROLLING AVERAGE: smooth out single spike frames
    const dtClamped = Math.min(rawDelta, 50); // hard cap 50ms to stop teleport on resume
    dtHistory[dtHistoryIdx] = dtClamped;
    dtHistoryIdx = (dtHistoryIdx + 1) % DT_HISTORY_SIZE;
    const dtMs = (dtHistory[0] + dtHistory[1] + dtHistory[2] + dtHistory[3]) / DT_HISTORY_SIZE;

    lastFrameTime = currentTime;

    // ðŸ›‘ THE DASH FIX: Cap dtScale so physics don't rubber-band forward during lag spikes
    let dtScale = dtMs / FRAME_MIN_TIME;
    if (dtScale > 1.2) dtScale = 1.2;
    if (dtScale < 0.8) dtScale = 0.8;

    // ðŸ“Š CALCULADORA MAESTRA DE RENDIMIENTO (Siempre activa para proteger el celular)
    fpsFrameCount++;
    frameTimesTotal += rawDelta; // Sumamos el MS real de la computadora

    if (currentTime - fpsLastUpdate >= 1000) {
        const currentFps = fpsFrameCount;
        const avgFrameTime = (frameTimesTotal / fpsFrameCount).toFixed(1);

        // =========================================================
        // ðŸš€ LA MAGIA DE LA RESOLUCIÃ“N DINÃMICA AUTÃ“NOMA
        // =========================================================
        fpsHistory.push(currentFps);
        if (fpsHistory.length > 3) fpsHistory.shift(); // Memoria de 3 segundos

        /* Analizar si el dispositivo se estÃ¡ ahogando
        if (currentTime - lastResolutionCheck > 3000 && fpsHistory.length === 3) {
            const avgFps = (fpsHistory[0] + fpsHistory[1] + fpsHistory[2]) / 3;

            // Si el promedio cae por debajo de 40 FPS, encogemos los grÃ¡ficos internos
            if (avgFps < 40 && dynamicRenderScale > 0.5) {
                dynamicRenderScale -= 0.25; // Baja al 75%, luego al 50% si es necesario
                resize(); // Detonar el recÃ¡lculo al instante

                spawnDamageText(player.worldX, player.worldY, "ðŸ“‰ Optimizando", true);

                fpsHistory = []; // Reset para darle tiempo al celular de respirar
                lastResolutionCheck = currentTime + 2000; // Extra cooldown de gracia
            }
            lastResolutionCheck = currentTime;
        }
        */
        // =========================================================

        // Dibujado del Monitor en Pantalla (Si el usuario lo prendiÃ³ en Opciones)
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

    // ðŸª‘ CHEQUEO GLOBAL DE SILLA PARA ESTE FRAME
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

    // ðŸ§¹ CLIENT-SIDE GARBAGE COLLECTOR
    // If we haven't heard from a player in 5 seconds, assume they walked out of our Zone and delete them.
    for (let id in otherPlayers) {
        // ðŸ›‘ FAILSAFE 3: Proteger contra variables nulas
        if (!otherPlayers[id]) {
            delete otherPlayers[id];
            continue;
        }
        if (now - (otherPlayers[id].lastUpdateTick || now) > 5000) {
            delete otherPlayers[id];
        }
    }
    // Si por algÃºn error el loading se queda pegado, lo forzamos a cerrar al movernos
    if (isCinematicLoading && (player.vx !== 0 || player.vy !== 0 || isMouseDown)) {
        isCinematicLoading = false;
        floorDirty = false;
        if (uiLoadingScreen) uiLoadingScreen.style.display = 'none';
    }
    // ... resto del cÃ³digo ...
    // ðŸŽ® CAMERA: direct player position, no lag, no lerp.
    // Smooth camera caused 'dash and come back' jitter â€” the lag created
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

    // Use player position directly â€” no pixel-snap, just Math.floor at draw time
    const renderWorldX = player.worldX;
    const renderWorldY = player.worldY;

    // Centro de pantalla en pÃ­xeles CSS enteros
    const screenCenterX = Math.floor(cachedScreenWidth / 2);
    const screenCenterY = Math.floor(cachedScreenHeight / 2);
    // --- NEW: SLIDING COLLISION CHECK ---
    const checkWall = (x, y) => {
        if (window.adminNoclip) return false;
        // ðŸ‘‡ NUEVO: COLISIÃ“N LOCAL DE LA BASE (Mismo cÃ³digo que en el servidor) ðŸ‘‡
        const activeBases = (typeof getAllTurfBases === 'function') ? getAllTurfBases() : (centralBase ? [centralBase] : []);
        for (let bIdx = 0; bIdx < activeBases.length; bIdx++) {
            const base = activeBases[bIdx];
            if (!base) continue;
            const bx = base.worldX + (base.hitboxOffsetX || 0);
            const by = base.worldY + (base.hitboxOffsetY || 0);
            const hw = (base.hitboxW || 32) / 2;
            const hh = (base.hitboxH || 32) / 2;

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
        isShooting = false; // ðŸ›‘ Apaga el gatillo para que no salgan balas fantasma

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

    /// --- CONTROLES HÃBRIDOS (MOUSE + TOUCH) ---
    if (!player.isDead) {

        // ðŸ›‘ EL FIX: SISTEMA DE HIT-STOP SUAVE (SIN JITTER) ðŸ›‘
        let speedMult = 1;
        if (player.equippedWeapon !== "none" && WEAPONS[player.equippedWeapon]) {
            const wStats = WEAPONS[player.equippedWeapon];
            const d = wStats.dirStats ? (wStats.dirStats[player.frameY] || wStats.dirStats[0] || {}) : {};
            const freezeMs = Number(d.freeze) || 0;

            if (freezeMs > 0) {
                const timeSinceAttack = Date.now() - Math.max(player.swingStartTime || 0, player.lastShotTime || 0);
                if (timeSinceAttack < freezeMs) {
                    // En lugar de detenerlo a 0, lo ralentizamos al 10%. 
                    // Da sensaciÃ³n de "impacto pesado" pero sin trabar la cÃ¡mara.
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
                    // ðŸš€ EL FIX FÃSICO: Usamos dtScale (1.0) en vez del viejo cÃ¡lculo
                    player.vx = moveX * (player.speed * speedMult) * dtScale;
                    player.vy = moveY * (player.speed * speedMult) * dtScale;
                    player.isMoving = true;
                } else {
                    player.vx = 0; player.vy = 0; player.isMoving = false;
                }
            } else {
                // ðŸ“± MOVIMIENTO INSTANTÃNEO 1:1 (Sin aceleraciÃ³n ni retraso)
                player.vx = (player.joyX || 0) * (player.speed * speedMult) * dtScale;
                player.vy = (player.joyY || 0) * (player.speed * speedMult) * dtScale;
                player.isMoving = (Math.abs(player.joyX || 0) > 0.02 || Math.abs(player.joyY || 0) > 0.02);
            }
        } else {
            player.vx = 0; player.vy = 0; player.isMoving = false;
        }

        // ðŸ’¥ NUEVO: MOTOR DE INERCIA Y FRICCIÃ“N (KNOCKBACK) ðŸ’¥
        player.kbX = player.kbX || 0;
        player.kbY = player.kbY || 0;

        player.vx += player.kbX;
        player.vy += player.kbY;

        player.kbX *= 0.8;
        player.kbY *= 0.8;
        if (Math.abs(player.kbX) < 0.2) player.kbX = 0;
        if (Math.abs(player.kbY) < 0.2) player.kbY = 0;

        // ðŸ›‘ EL FIX 3: La animaciÃ³n se mantiene viva mientras resbales 
        // O mientras el cronÃ³metro de 300ms siga activo.
        if (player.kbX !== 0 || player.kbY !== 0 || (Date.now() - (player.staggerTimer || 0) < 1000)) {
            player.isMoving = true;
        }

        // 2. APUNTADO Y DISPARO
        if (!editMode) {
            // ðŸ’» Si estamos en PC, el RatÃ³n controla hacia dÃ³nde miramos SIEMPRE
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
            // ðŸ“± Si estamos en CELULAR, el Joystick Derecho (aimZone) ya controlÃ³ 
            // 'shootAngle' e 'isShooting' al mover el dedo, no sobreescribimos nada aquÃ­.
        }
    }



    // --- DETECCIÃ“N DE LÃ“GICA PASIVA (CAPA 15 AL PISAR) ---
    player.inSafeZone = false;

    if (!player.isDead && !editMode && !player.isTeleporting) {
        const currentGridX = Math.floor(player.worldX / TILE_SIZE);
        const currentGridY = Math.floor(player.worldY / TILE_SIZE);

        const currentTileKey = getMapKey(currentGridX, currentGridY, 15);
        const logicTile = worldMap.get(currentTileKey);

        // ðŸ›‘ EL FIX: Solo lo activamos automÃ¡ticamente si NO requiere clic
        if (logicTile && !logicTile.requiresClick) {
            executeTileLogic(logicTile, currentTileKey);
        } else {
            if (lastShopTile !== currentTileKey && !isShopOpen) lastShopTile = null;
            if (lastJunkyardTile !== currentTileKey && !isJunkyardOpen) lastJunkyardTile = null;
            if (lastJewelerTile !== currentTileKey && !isJewelerOpen) lastJewelerTile = null; // ðŸ‘ˆ AÃ‘ADE ESTO
            // ðŸ‘‡ NUEVO FIX: Liberar al NPC cuando te bajas del bloque ðŸ‘‡
            const box = document.getElementById('retro-dialog-box');
            if (lastNpcTile !== currentTileKey && (!box || box.style.display === 'none')) {
                lastNpcTile = null;
            }
        }
    }
    // ðŸ‘‡ NUEVO: ESCÃNER MATEMÃTICO DE ZONAS HÃBRIDO (Safezones + Techos) ðŸ‘‡
    player.inSafeZone = false;
    let isUnderRoof = false; // ðŸ  Variable del techo inicializada por defecto

    for (let i = 0; i < safeZones.length; i++) {
        let z = safeZones[i];

        // Si estamos parados dentro de ESTE rectÃ¡ngulo especÃ­fico:
        if (player.worldX >= z.xMin && player.worldX <= z.xMax && player.worldY >= z.yMin && player.worldY <= z.yMax) {

            // Â¿Es zona segura?
            if (!z.zoneType || z.zoneType === 'safe') {
                player.inSafeZone = true;
            }

            // Â¿Es una zona de Techo/Interior?
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
    // Definimos el tamaÃ±o del cuerpo fÃ­sico. Si el TILE_SIZE es 16, 
    // un hitbox de 10x10 pÃ­xeles evita que te atores en las esquinas.
    const hitX = 5; // Mitad del ancho (Left/Right)
    const hitY = 5; // Mitad del alto (Up/Down)

    // Esta funciÃ³n revisa las 4 esquinas del hitbox en lugar de solo el centro
    const isColliding = (x, y) => {
        // OffsetY: Lo bajamos un poco (+3 pÃ­xeles) para simular perspectiva 3D (RPG).
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
        // ðŸ›‘ EL FIX: "AproximaciÃ³n fina" pixel por pixel para pegar al jugador a la pared sin rebotar
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
        // ðŸ›‘ EL FIX: "AproximaciÃ³n fina" en Y
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
    const weaponsLookup = (typeof WEAPONS !== 'undefined' ? WEAPONS : (typeof window !== 'undefined' ? window.WEAPONS : null)) || (typeof weaponsDB !== 'undefined' ? weaponsDB : (typeof window !== 'undefined' ? window.weaponsDB : null)) || {};
    let currentWeaponStats = weaponsLookup[player.equippedWeapon] || weaponsLookup["none"] || { type: 'melee', fireRate: 400, reach: 24, hitW: 24, hitH: 24, damage: 0 };

    if (isShooting && !player.isReloading && !player.inSafeZone && !player.isSitting) {
        if (Date.now() - lastShotTime > (currentWeaponStats.fireRate || 300)) {
            // ðŸ”Š THE FIX: Play the sound locally the exact millisecond you attack!
            playItemSound(player.equippedWeapon, 'use', 0.8);
            // =========================================================
            // ðŸ”¥ LÃ“GICA DE COMBATE MELEE (El Hitbox de Pizza) ðŸ”¥
            // =========================================================
            if (currentWeaponStats.type === 'melee') {
                // ðŸ›‘ EL FIX DEL MELEE BUG: Forzar el cuerpo a mirar hacia donde apuntas INSTANTÃNEAMENTE
                let deg = shootAngle * (180 / Math.PI);
                if (deg > 45 && deg <= 135) player.frameY = 0;
                else if (deg > 135 || deg <= -135) player.frameY = 1;
                else if (deg > -45 && deg <= 45) player.frameY = 2;
                else if (deg > -135 && deg <= -45) player.frameY = 3;

                // 1. Activar animaciÃ³n visual del jugador
                player.isSwinging = true;
                player.swingStartTime = Date.now();
                player.swingDuration = 200;

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'melee_swing', weaponId: player.equippedWeapon }));
                }

                // 2. Extraer datos matemÃ¡ticos (Ahora usa la direcciÃ³n corregida al instante)
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
                        // A. Â¿EstÃ¡ suficientemente cerca?
                        const dist = Math.hypot(enemy.worldX - hitOriginX, enemy.worldY - hitOriginY);
                        if (dist <= hitRange) {
                            // B. Â¿EstÃ¡ dentro del Ã¡ngulo de la espada?
                            const angleToEnemy = Math.atan2(enemy.worldY - hitOriginY, enemy.worldX - hitOriginX);
                            let angleDiff = angleToEnemy - trueHitAngle;

                            // Normalizar para no volvernos locos con Pi
                            while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                            if (Math.abs(angleDiff) <= halfWidRad) {
                                // ðŸ›‘ SERVER-AUTHORITATIVE COMBAT:
                                // Ya no enviamos damage_player. El servidor lo calcula automÃ¡ticamente
                                // usando las fÃ­sicas del melee_swing.
                            }
                        }
                    }
                }
                lastShotTime = Date.now();

                // 4. Escanear a TODAS LAS BASES (Ataque Melee)
                const activeBasesMelee = (typeof getAllTurfBases === 'function') ? getAllTurfBases() : ((typeof window !== 'undefined' && window.getAllTurfBases) ? window.getAllTurfBases() : (centralBase ? [centralBase] : []));
                for (let bIdx = 0; bIdx < activeBasesMelee.length; bIdx++) {
                    const base = activeBasesMelee[bIdx];
                    if (!base) continue;

                    const bx = base.worldX + (base.hitboxOffsetX || 0);
                    const by = base.worldY + (base.hitboxOffsetY || 0);
                    const hw = (base.hitboxW || 32) / 2;
                    const hh = (base.hitboxH || 32) / 2;

                    let closestX = Math.max(bx - hw, Math.min(hitOriginX, bx + hw));
                    let closestY = Math.max(by - hh, Math.min(hitOriginY, by + hh));
                    const distToBaseEdge = Math.hypot(closestX - hitOriginX, closestY - hitOriginY);

                    if (distToBaseEdge <= hitRange) {
                        const angleToEdge = Math.atan2(closestY - hitOriginY, closestX - hitOriginX);
                        let angleDiffBase = angleToEdge - trueHitAngle;
                        while (angleDiffBase < -Math.PI) angleDiffBase += Math.PI * 2;
                        while (angleDiffBase > Math.PI) angleDiffBase -= Math.PI * 2;

                        if (Math.abs(angleDiffBase) <= halfWidRad) {
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(MessagePack.encode({
                                    type: 'damage_base',
                                    weaponId: player.equippedWeapon || 'none',
                                    turfId: base.turfId
                                }));
                            }
                            break;
                        }
                    }
                }
                // ðŸ›‘ LA PIEZA QUE FALTABA: ESCANEAR BASURA EN EL PISO
                if (player.equippedWeapon === 'trash_picker') {
                    for (let itemId in groundItems) {
                        let item = groundItems[itemId];
                        // Distancia desde el jugador hasta la pieza de basura
                        const distToTrash = Math.hypot(item.x - hitOriginX, item.y - hitOriginY);

                        // Si estÃ¡ en el rango de alcance de tu recogedor...
                        if (distToTrash <= hitRange) {
                            const angleToTrash = Math.atan2(item.y - hitOriginY, item.x - hitOriginX);
                            let angleDiffTrash = angleToTrash - trueHitAngle;

                            // Normalizar Ã¡ngulo
                            while (angleDiffTrash <= -Math.PI) angleDiffTrash += Math.PI * 2;
                            while (angleDiffTrash > Math.PI) angleDiffTrash -= Math.PI * 2;

                            // Si estÃ¡ justo enfrente de ti (en el Ã¡ngulo del pinchazo)
                            if (Math.abs(angleDiffTrash) <= halfWidRad) {
                                // Â¡PINCHASTE LA BASURA! Mandamos cobrar al servidor
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(MessagePack.encode({ type: 'pickup_trash', itemId: itemId }));
                                }
                                // La borramos visualmente de inmediato para que no mandes spam de clics
                                delete groundItems[itemId];
                                break; // Salimos del loop para solo pinchar 1 a la vez
                            }
                        }
                    }
                }// ðŸ‘‡ NUEVO: SI EL ARMA ES UNA PALA, MANDAR EXCAVAR ðŸ‘‡
                else if (player.equippedWeapon === 'shovel' || currentWeaponStats.name.toLowerCase().includes('pala')) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        // Enviamos la punta exacta donde pegÃ³ la pala
                        ws.send(MessagePack.encode({
                            type: 'dig',
                            hitX: hitOriginX,
                            hitY: hitOriginY
                        }));
                    }
                }
            }
            // =========================================================
            // ðŸ”« LÃ“GICA DE DISPARO RANGED (Pistolas y Escopetas)
            // =========================================================
            else {
                if (player.ammo > 0) {
                    player.ammo--;

                    // 🔥 LEER LA PUNTA DEL CAÑÓN DESDE EL EDITOR GANI 🔥
                    const dir = player.frameY;
                    const d = currentWeaponStats.dirStats ? (currentWeaponStats.dirStats[dir] || {}) : {};

                    // Nace del pecho + lo que hayas movido los sliders de Hit X y Hit Y
                    let spawnX = player.worldX + (d.hitX !== undefined ? d.hitX : (dir === 2 ? 16 : dir === 1 ? -16 : 0));
                    let spawnY = player.worldY + (d.hitY !== undefined ? d.hitY : (dir === 0 ? 16 : dir === 3 ? -16 : 0));

                    // 🔥 EL FIX DE PARALAJE PARA PC (Ratón) 🔥
                    let finalAngle = shootAngle; // Por defecto usa el del Joystick (Celular)
                    if (!isTouchDevice) {
                        // Convertir la mira del ratón a coordenadas del mapa real
                        const mouseWorldX = renderWorldX + (mouseX - screenCenterX) / zoomLevel;
                        const mouseWorldY = renderWorldY + (mouseY - screenCenterY) / zoomLevel;
                        // Calcular ángulo desde el cañón de la pistola hacia el ratón
                        finalAngle = Math.atan2(mouseWorldY - spawnY, mouseWorldX - spawnX);
                    }

                    player.lastShotX = spawnX; player.lastShotY = spawnY;
                    lastShotTime = Date.now();
                    player.lastShotTime = Date.now();

                    // Disparar flash visual en el cañón
                    if (typeof triggerMuzzleFlash === 'function') {
                        triggerMuzzleFlash(spawnX, spawnY, finalAngle, currentWeaponStats.color || "#f1c40f");
                    }

                    // ==========================================================
                    // 💥 NUEVO: SISTEMA DE MÚLTIPLES BALAS (ESCOPETAS / SPREAD)
                    // ==========================================================

                    // ¿Cuántas balas salen y qué tan abierto es el abanico?
                    // Si el arma no tiene estos valores, asume 1 bala y 0 grados de apertura (pistola normal)
                    const bulletCount = currentWeaponStats.pellets || 1;
                    const spreadAngleDegrees = currentWeaponStats.spread || 0;

                    // Convertir los grados de apertura a radianes para la matemÃ¡tica
                    const spreadAngleRads = spreadAngleDegrees * (Math.PI / 180);

                    // Creamos una "caja" vacÃ­a para guardar las balas
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

                        // 2. Guardamos el Ã¡ngulo en nuestra caja
                        anglesArray.push(bulletAngle);
                    }

                    // 3. Enviamos LA CAJA COMPLETA al servidor de forma inteligente
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        if (bulletCount > 1) {
                            // ðŸ“¦ Si es escopeta, enviamos el arreglo mÃºltiple 
                            // (NOTA: Para que otros vean la escopeta, debes actualizar tu Server Node.js para que retransmita 'shoot_shotgun')
                            ws.send(MessagePack.encode({
                                type: 'shoot_shotgun',
                                x: spawnX,
                                y: spawnY,
                                angles: anglesArray,
                                weaponId: player.equippedWeapon
                            }));
                        } else {
                            // ðŸ”« EL FIX: Si es pistola normal, mandamos el paquete clÃ¡sico que el servidor SÃ conoce
                            ws.send(MessagePack.encode({
                                type: 'shoot',
                                x: spawnX,
                                y: spawnY,
                                angle: finalAngle, // Mandamos el Ã¡ngulo Ãºnico en vez del Array
                                weaponId: player.equippedWeapon
                            }));
                        }
                    }
                    // ==========================================================

                    /// ðŸ’¥ EL FIX: RETROCESO FÃSICO SUAVE (SELF-KNOCKBACK) ðŸ’¥
                    const kbForce = Number(d.kb) || 0;
                    if (kbForce > 0) {
                        player.kbX = -(Math.cos(finalAngle) * (kbForce / 2));
                        player.kbY = -(Math.sin(finalAngle) * (kbForce / 2));

                        // ðŸ›‘ EL FIX 2: Arrancamos el cronÃ³metro de retroceso
                        player.staggerTimer = Date.now();
                    }

                } else {
                    player.isReloading = true;
                    playItemSound(player.equippedWeapon, 'reload', 0.7);
                    setTimeout(() => {
                        player.ammo = currentWeaponStats.magSize;
                        player.weaponAmmo[player.equippedWeapon] = currentWeaponStats.magSize; // ðŸ’¾ Sincronizar memoria

                        // ðŸš€ EL FIX MÃGICO: Â¡Avisarle al servidor que el cargador estÃ¡ lleno de nuevo!
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                        }

                        player.isReloading = false;
                    }, currentWeaponStats.reloadTime);
                }
            }
        }
    }

    // --- ACTUALIZAR UI DE MUNICIÃ“N EN TIEMPO REAL (OPTIMIZADO DE VERDAD) ---
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

            // ðŸš€ EL FIX MÃXIMO: Mover la caja SOLO si cambiaste de slot (AdiÃ³s getBoundingClientRect por frame)
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

            // ðŸš€ EL FIX: Solo actualizar el DOM (texto HTML) si las balas o el estado de recarga realmente cambiaron
            if (window.lastRenderedAmmo !== player.ammo || window.lastRenderedReloading !== player.isReloading) {
                if (player.isReloading) {
                    uiAmmoCurrent.style.color = "#e74c3c";
                    uiAmmoCurrent.innerText = "â†»";
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

        // Si la bala estÃ¡ apagada, la ignoramos para no gastar procesador
        if (!p.active) continue;

        // === FIX: DESINTEGRAR BALAS DE MUERTOS ===
        if (p.owner === myId) {
            if (player.isDead) {
                p.active = false; // ðŸ›‘ APAGAR
                continue;
            }
        } else {
            const bulletOwner = otherPlayers[p.owner];
            if (bulletOwner && bulletOwner.isDead) {
                p.active = false; // ðŸ›‘ APAGAR
                continue;
            }
        }

        // Movimiento normal de la bala
        // ðŸš€ EL FIX FÃSICO: Balas sincronizadas con el lag (Delta Time)
        p.x += p.vx * dtScale;
        p.y += p.vy * dtScale;
        p.life -= dtScale;

        let hitSomeone = false;
        // âš¡ Hitbox ligeramente mÃ¡s grande (14px en vez de 12) para que el
        // hit registration sea consistente entre ambas pantallas
        const HITBOX_RADIUS = 14;

        // A. Â¿La bala chocÃ³ contra MÃ? 
        if (p.owner !== myId && !player.isDead && Math.hypot(p.x - player.worldX, p.y - player.worldY) < HITBOX_RADIUS) {
            hitSomeone = true;
        }

        // B. Â¿La bala chocÃ³ contra ALGUIEN MÃS?
        if (!hitSomeone) {
            for (let id in otherPlayers) {
                let enemy = otherPlayers[id];

                if (enemy.worldX !== undefined && !enemy.isDead && p.owner !== id && Math.hypot(p.x - enemy.worldX, p.y - enemy.worldY) < HITBOX_RADIUS) {
                    hitSomeone = true;
                    // ðŸ›‘ SERVER-AUTHORITATIVE COMBAT:
                    // La bala local es solo visual. Se destruirÃ¡ al chocar, 
                    // pero es el SERVIDOR quien decide si bajÃ³ vida o no.
                    break;
                }
            }
        }

        // C. ¿La bala chocó contra alguna BASE?
        if (!hitSomeone) {
            const activeBasesBullet = (typeof getAllTurfBases === 'function') ? getAllTurfBases() : ((typeof window !== 'undefined' && window.getAllTurfBases) ? window.getAllTurfBases() : (centralBase ? [centralBase] : []));
            for (let bIdx = 0; bIdx < activeBasesBullet.length; bIdx++) {
                const base = activeBasesBullet[bIdx];
                if (!base) continue;
                const baseHitX = base.worldX + (base.hitboxOffsetX || 0);
                const baseHitY = base.worldY + (base.hitboxOffsetY || 0);
                const hw = (base.hitboxW || 32) / 2;
                const hh = (base.hitboxH || 32) / 2;

                if (p.x >= baseHitX - hw && p.x <= baseHitX + hw && p.y >= baseHitY - hh && p.y <= baseHitY + hh) {
                    hitSomeone = true;
                    spawnSpark(p.x, p.y, 12, p.color || "#f1c40f");
                    if (p.owner === myId) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(MessagePack.encode({
                                type: 'damage_base',
                                weaponId: p.weapon || 'none',
                                turfId: base.turfId
                            }));
                        }
                    }
                    break;
                }
            }
        }

        // Destruir la bala (Simplemente apagarla, NUNCA usar splice)
        if (p.life <= 0 || checkWall(p.x, p.y) || hitSomeone) {
            p.active = false; // ðŸ›‘ LA MAGIA DE RECICLAJE
        }
    }

    // === EL HACK MAESTRO DE LA CÃMARA CINEMÃTICA ===
    let realPlayerX = player.worldX;
    let realPlayerY = player.worldY;

    if (isCinematicLoading) {
        cinematicTimer += 0.002; // Velocidad del dron (sÃºbela a 0.005 si quieres que vuele mÃ¡s rÃ¡pido)

        // EL FIX: Usamos realPlayerX y realPlayerY como el centro de la Ã³rbita.
        // 400 y 300 es la distancia en pÃ­xeles hacia afuera (una Ã³rbita ovalada).
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

        // ðŸš€ EL FIX: Dar la orden de nitidez UNA SOLA VEZ antes del bucle masivo
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

                    // ðŸ‘‡ LA MAGIA ANTI-GELATINA (ANCLAJE CONTINUO) ðŸ‘‡
                    const exactScaledSize = TILE_SIZE * zoomLevel;

                    // ðŸ›‘ EL FIX DE CUADRÃCULA UNIFICADA ðŸ›‘
                    // Calculamos la posiciÃ³n con decimales atados a la cÃ¡mara global
                    const exactX = cameraOffsetX + (gridX * scaledSize);
                    const exactY = cameraOffsetY + (gridY * scaledSize);

                    // Anclamos al pÃ­xel mÃ¡s cercano
                    const drawX = Math.floor(exactX);
                    const drawY = Math.floor(exactY);

                    // Calculamos dÃ³nde empieza el vecino para saber el ancho exacto
                    const nextX = Math.floor(cameraOffsetX + ((gridX + 1) * scaledSize));
                    const nextY = Math.floor(cameraOffsetY + ((gridY + 1) * scaledSize));

                    // El "+ 0.8" es pegamento. Al estar todos colgados del mismo 
                    // 'cameraOffset', ya NO hay efecto gelatina al caminar.
                    const drawW = (nextX - drawX) + 0.7;
                    const drawH = (nextY - drawY) + 0.7;
                    // =========================================================
                    // =========================================================
                    // ðŸŒŸ NUEVO: DIBUJAR ARMAS DE TIENDA (CON AJUSTE MANUAL Y PRECIO) ðŸŒŸ
                    // =========================================================
                    if (currentLayer === 15 && tileData.triggerType === 'shop' && tileData.itemId) {
                        const wSprite = window.loadedItemSprites[tileData.itemId];
                        if (wSprite && wSprite.complete) {

                            // 1. Buscar si el Ã­tem tiene un ajuste manual en tu CatÃ¡logo (Opcional)
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

                            // ðŸ‘‡ NUEVO: DIBUJAR EL PRECIO DEBAJO DEL TILE (ESTÃTICO) ðŸ‘‡
                            if (itemStats.price !== undefined) {
                                ctx.save();

                                const priceText = `$${itemStats.price}`;
                                const fontSize = 6 * zoomLevel;

                                ctx.font = `900 ${fontSize}px sans-serif`;
                                ctx.textAlign = "center";

                                // ðŸ›‘ EL FIX: Anclamos el texto al centro exacto del bloque y justo debajo de Ã©l.
                                // Ya no usamos tweakX ni tweakY aquÃ­, para que todos los precios estÃ©n alineados perfectamente.
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
                    // ðŸ›‘ EL ESCUDO: Si no estamos en Modo EdiciÃ³n, ocultamos la "caja de color" de la capa 15
                    if (!editMode && currentLayer === 15) continue;

                    // --- LÃ“GICA ORIGINAL DE DIBUJO DE TILES DEL MAPA ---
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
                        // Dibujo estÃ¡ndar con sellado hermÃ©tico
                        ctx.drawImage(tsData.img, sx, sy, TILE_SIZE, TILE_SIZE, drawX, drawY, drawW, drawH);
                    }
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }
    // === 1. DRAW GROUND LAYERS (BELOW PLAYER: L0 - L7) ===
    // ðŸš€ EL FIX: Declaramos las variables de cÃ¡mara AFUERA para que el techo tambiÃ©n pueda usarlas
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

        // ðŸš€ EL FIX MAXIMO DE MEMORIA (JIT BAKING & GARBAGE COLLECTION)
        // MantÃ©n solo los chunks cercanos en la memoria RAM para no crashear iOS
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
    // ðŸŒŸ CAPA 15: EFECTOS VISUALES DE TILES DE LÃ“GICA
    // El tile de color en sÃ­ estÃ¡ oculto, pero dibujamos encima
    // todo lo que la lÃ³gica debe mostrar (armas de tienda, precios, etc.)
    // =========================================================
    if (!editMode) {
        const l15screenW = cachedScreenWidth / zoomLevel;
        const l15screenH = cachedScreenHeight / zoomLevel;
        const l15startCol = Math.floor((renderWorldX - (l15screenW / 2)) / TILE_SIZE) - 1;
        const l15endCol = Math.floor((renderWorldX + (l15screenW / 2)) / TILE_SIZE) + 1;
        const l15startRow = Math.floor((renderWorldY - (l15screenH / 2)) / TILE_SIZE) - 1;
        const l15endRow = Math.floor((renderWorldY + (l15screenH / 2)) / TILE_SIZE) + 1;

        const l15scaledSize = TILE_SIZE * zoomLevel;
        const l15cameraOffX = screenCenterX - (renderWorldX * zoomLevel);
        const l15cameraOffY = screenCenterY - (renderWorldY * zoomLevel);

        ctx.imageSmoothingEnabled = false;

        for (let gy = l15startRow; gy <= l15endRow; gy++) {
            for (let gx = l15startCol; gx <= l15endCol; gx++) {
                const l15key = getMapKey(gx, gy, 15);
                const l15tile = worldMap.get(l15key);
                if (!l15tile) continue;

                // PosiciÃ³n en pantalla de este tile (igual que drawWorldLayers)
                const l15drawX = Math.floor(l15cameraOffX + (gx * l15scaledSize));
                const l15drawY = Math.floor(l15cameraOffY + (gy * l15scaledSize));

                // ðŸª TIENDA: dibujar el arma expuesta y su precio
                if (l15tile.triggerType === 'shop' && l15tile.itemId) {
                    const wSprite = window.loadedItemSprites && window.loadedItemSprites[l15tile.itemId];
                    if (wSprite && wSprite.complete) {
                        const itemStats = (window.weaponsDB && window.weaponsDB[l15tile.itemId])
                            || (window.MASTER_CATALOG && window.MASTER_CATALOG[l15tile.itemId])
                            || {};
                        const tweakX = (l15tile.shelfX || 0) * zoomLevel;
                        const tweakY = (l15tile.shelfY || 0) * zoomLevel;
                        const itemRow = l15tile.itemRow || 0;
                        const sW = 48, sH = 64;
                        const renderScale = 0.9;
                        const scaledTile = TILE_SIZE * zoomLevel;
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
                            const fontSize = 6 * zoomLevel;
                            ctx.font = `900 ${fontSize}px sans-serif`;
                            ctx.textAlign = 'center';
                            const textX = l15drawX + (scaledTile / 2);
                            const textY = l15drawY + scaledTile + (5 * zoomLevel);
                            ctx.lineWidth = 2 * zoomLevel;
                            ctx.strokeStyle = 'black';
                            ctx.lineJoin = 'round';
                            ctx.strokeText(priceText, textX, textY);
                            ctx.fillStyle = '#f1c40f';
                            ctx.fillText(priceText, textX, textY);
                            ctx.restore();
                        }
                    }
                }

                // ðŸ”§ AquÃ­ puedes aÃ±adir mÃ¡s casos de lÃ³gica visual en el futuro
                // (NPCs, portales, puertas, etc.) siguiendo el mismo patrÃ³n
            }
        }
    }
    // =========================================================

    // === ðŸ›‘ DIBUJAR LA BASURA EN EL PISO ===
    for (let itemId in groundItems) {
        let item = groundItems[itemId];
        const iDrawX = Math.floor(screenCenterX + (item.x - renderWorldX) * zoomLevel);
        const iDrawY = Math.floor(screenCenterY + (item.y - renderWorldY) * zoomLevel);

        if (trashSpritesheet.complete && trashSpritesheet.naturalWidth > 0) {
            const drawSize = 16 * zoomLevel;
            // Extrae exactamente el cuadrito usando item.sx y item.sy que mandÃ³ el servidor
            ctx.drawImage(
                trashSpritesheet,
                item.sx, item.sy, 16, 16,
                iDrawX - (drawSize / 2), iDrawY - (drawSize / 2), drawSize, drawSize
            );
        }
    }

    // === ðŸ•³ï¸ DIBUJAR HOYOS DE EXCAVACIÃ“N ===
    for (let i = digHoles.length - 1; i >= 0; i--) {
        let hole = digHoles[i];
        hole.life--;

        const hDrawX = Math.floor(screenCenterX + (hole.x - renderWorldX) * zoomLevel);
        const hDrawY = Math.floor(screenCenterY + (hole.y - renderWorldY) * zoomLevel);

        // El hoyo se desvanece suavemente antes de desaparecer
        ctx.globalAlpha = Math.min(1, hole.life / 50);

        ctx.fillStyle = "rgba(62, 39, 35, 0.8)"; // CafÃ© oscuro tierra
        ctx.beginPath();
        // Dibujamos un Ã³valo para que parezca que estÃ¡ en perspectiva 3D
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

        // ðŸ›‘ THE PERFECT MOVEMENT FIX v3 (DELTA-TIME LERP) ðŸ›‘
        let dx = p.targetX - p.worldX;
        let dy = p.targetY - p.worldY;
        let dist = Math.hypot(dx, dy);

        // 1. ðŸš€ FIX JITTER OTROS JUGADORES: Lerp atado a dtScale.
        // Con factor fijo 0.3, en frames irregulares el jugador avanza
        // distinto cada frame â†’ tirones. Con dtScale el movimiento es
        // proporcional al tiempo real transcurrido â†’ suave en cualquier fps.
        // ðŸŸ¢ SMOOTHER LERP: tighter factor catches up faster without overshooting
        const lerpFactor = Math.min(1.0, 0.22 * dtScale);
        p.worldX += dx * lerpFactor;
        p.worldY += dy * lerpFactor;

        // 2. Truco visual: Forzar que las piernas se muevan mientras haya deslizamiento
        if (!p.isMoving) {
            if (dist < 3) {
                // Ya llegÃ³ a la meta, lo clavamos y paramos las piernas
                p.worldX = p.targetX;
                p.worldY = p.targetY;
                p.isVisuallyMoving = false;
            } else {
                // El jugador soltÃ³ el control, pero por el lag de internet aÃºn se estÃ¡ deslizando.
                // Mantenemos las piernas moviÃ©ndose para ocultar el patinaje.
                p.isVisuallyMoving = true;
            }
        } else {
            p.isVisuallyMoving = true;
        }

        // 3. AnimaciÃ³n local para otros jugadores (Usando isVisuallyMoving)
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
        // ðŸš€ EL FIX DEL JITTER 2: Usar Math.floor igual que el piso, NUNCA Math.round
        const pDrawX = screenCenterX + ((p.worldX - renderWorldX) * zoomLevel);
        const pDrawY = screenCenterY + ((p.worldY - renderWorldY) * zoomLevel);
        const timeSinceHit = Date.now() - (p.lastHitTime || 0);
        const isHit = (timeSinceHit < 150);

        if (p.isDead) ctx.globalAlpha = 0.3;
        else if (isHit) {
            setShadow(20 * zoomLevel, 'red');
            ctx.globalAlpha = 0.6;
        }
        // ðŸ‘‡ DIBUJO LIMPIO DEL ENSAMBLADOR ðŸ‘‡
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

    // ðŸš€ EL FIX DEL JITTER: Pegar el personaje a la cuadrÃ­cula del mapa!
    const myDrawX = screenCenterX + (window.camErrorX || 0);
    const myDrawY = screenCenterY + (window.camErrorY || 0);

    // 👇 DIBUJO LIMPIO DEL ENSAMBLADOR PARA TI 👇
    drawModularCharacter(ctx, player, myDrawX, myDrawY, zoomLevel);

    if (localIsHit && !player.isDead) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.beginPath(); ctx.arc(myDrawX, myDrawY, 12 * zoomLevel, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;

    // --- MUZZLE FLASHES DRAW & UPDATE ---
    if (window.muzzleFlashes && window.muzzleFlashes.length > 0) {
        for (let m = window.muzzleFlashes.length - 1; m >= 0; m--) {
            const mf = window.muzzleFlashes[m];
            mf.life -= dtScale;
            if (mf.life <= 0) {
                window.muzzleFlashes.splice(m, 1);
                continue;
            }
            const alpha = Math.max(0, mf.life / mf.maxLife);
            const mDrawX = Math.floor(screenCenterX + (mf.x - renderWorldX) * zoomLevel);
            const mDrawY = Math.floor(screenCenterY + (mf.y - renderWorldY) * zoomLevel);
            const flashRadius = (4 + (1 - alpha) * 3) * zoomLevel;

            ctx.save();
            ctx.translate(mDrawX, mDrawY);
            ctx.rotate(mf.angle);
            ctx.globalAlpha = alpha;

            // Outer glow
            ctx.fillStyle = mf.color || "#f39c12";
            ctx.beginPath();
            ctx.arc(0, 0, flashRadius, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(0, 0, flashRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Forward spark burst
            ctx.fillStyle = "rgba(255, 240, 180, 0.85)";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(flashRadius * 2.2, -flashRadius * 0.7);
            ctx.lineTo(flashRadius * 2.8, 0);
            ctx.lineTo(flashRadius * 2.2, flashRadius * 0.7);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    // --- DRAW PROJECTILES DINÁMICOS (CON TRACERS) ---
    for (let p of projectiles) {
        if (!p.active) continue; // 🛑 IGNORAR BALAS APAGADAS
        const pDrawX = Math.floor(screenCenterX + (p.x - renderWorldX) * zoomLevel);
        const pDrawY = Math.floor(screenCenterY + (p.y - renderWorldY) * zoomLevel);

        // 🛑 EL FIX DEL COLOR: Escudo de seguridad por si p.color es null o undefined
        const safeColor = p.color ? p.color : "#f1c40f"; // Amarillo brillante por defecto

        const vMag = Math.hypot(p.vx, p.vy);
        if (vMag > 0.1) {
            const dirX = p.vx / vMag;
            const dirY = p.vy / vMag;
            const trailLen = Math.min(10 * zoomLevel, vMag * 1.5 * zoomLevel);

            // Tracer line
            ctx.strokeStyle = safeColor;
            ctx.lineWidth = 2.2 * zoomLevel;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(pDrawX, pDrawY);
            ctx.lineTo(pDrawX - dirX * trailLen, pDrawY - dirY * trailLen);
            ctx.stroke();

            // Glowing head
            setShadow(8 * zoomLevel, safeColor);
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(pDrawX, pDrawY, 1.8 * zoomLevel, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            setShadow(8 * zoomLevel, safeColor);
            ctx.fillStyle = safeColor;
            ctx.beginPath();
            ctx.arc(pDrawX, pDrawY, 3 * zoomLevel, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    // Reset shadows so the rest of the game doesn't glow!
    ctx.shadowBlur = 0;

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

    // === 3. DRAW OVERHEAD LAYERS (ABOVE PLAYER: L8 - L15) ===
    if (editMode) {
        drawWorldLayers(8, 15); // En modo editor seguimos dibujando manual para ver las transparencias
    } else {
        // ðŸŒŸ MAGIA PURA: 1 sola instrucciÃ³n en vez de miles de iteraciones
        if (isUnderRoof) ctx.globalAlpha = 0.3; // Hacer techos transparentes si estÃ¡s en casa

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
    // === DIBUJAR UI Y SPRITE DE TODAS LAS BASES (TURF WARS) ===
    const activeBasesToDraw = (typeof getAllTurfBases === 'function') ? getAllTurfBases() : (centralBase ? [centralBase] : []);
    for (let bIdx = 0; bIdx < activeBasesToDraw.length; bIdx++) {
        const base = activeBasesToDraw[bIdx];
        if (!base) continue;

        const bDrawX = Math.floor(screenCenterX + (base.worldX - renderWorldX) * zoomLevel);
        const bDrawY = Math.floor(screenCenterY + (base.worldY - renderWorldY) * zoomLevel);

        const offsetX = (base.spriteOffsetX || 0) * zoomLevel;
        const offsetY = (base.spriteOffsetY || 0) * zoomLevel;

        const isHover = (base.isHover !== false && base.hasHover !== false);
        const hoverY = isHover ? Math.sin(Date.now() / 300) * 5 * zoomLevel : 0;

        // Sombra
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.ellipse(bDrawX, bDrawY + (8 * zoomLevel), 14 * zoomLevel, 5 * zoomLevel, 0, 0, Math.PI * 2);
        ctx.fill();

        const timeSinceBaseHit = Date.now() - (base.lastHitTime || 0);
        const isUnderAttack = timeSinceBaseHit < 30000;

        let activeBaseSrc = (isUnderAttack && base.srcHit) ? base.srcHit : base.srcIdle;

        if (activeBaseSrc) {
            if (!baseSpriteCache[activeBaseSrc]) {
                const img = new Image();
                img.src = activeBaseSrc;
                baseSpriteCache[activeBaseSrc] = img;
            }

            const bImg = baseSpriteCache[activeBaseSrc];

            if (bImg.complete && bImg.naturalWidth > 0) {
                let frameW = base.frameWidth || 0;
                let frameH = base.frameHeight || 0;
                let totalFrames = base.frameCount || 0;

                const nw = bImg.naturalWidth;
                const nh = bImg.naturalHeight;

                if (!frameW || !frameH) {
                    if (totalFrames > 0) {
                        frameW = Math.floor(nw / totalFrames);
                        frameH = nh;
                    } else if (nw === 768 && nh === 112) {
                        frameW = 128;
                        frameH = 112;
                        totalFrames = 6;
                    } else if (nw >= nh && nw % nh === 0) {
                        frameW = nh;
                        frameH = nh;
                        totalFrames = Math.max(1, Math.floor(nw / frameW));
                    } else {
                        frameH = nh || 64;
                        frameW = frameH;
                        totalFrames = Math.max(1, Math.floor(nw / frameW));
                    }
                } else if (!totalFrames) {
                    totalFrames = Math.max(1, Math.floor(nw / frameW));
                }

                const baseSpeed = base.animSpeed || 150;
                const animSpeed = isUnderAttack ? Math.max(50, Math.floor(baseSpeed * 0.65)) : baseSpeed;

                let currentFrameX = 0;
                if (totalFrames > 1) {
                    currentFrameX = Math.floor((Date.now() / animSpeed) % totalFrames) * frameW;
                }

                const renderScale = base.renderScale || 1.0;
                const finalW = Math.round(frameW * renderScale * zoomLevel);
                const finalH = Math.round(frameH * renderScale * zoomLevel);
                const destX = Math.round(bDrawX - (finalW / 2) + offsetX);
                const destY = Math.round(bDrawY - (finalH / 2) + hoverY - (10 * zoomLevel) + offsetY);

                ctx.drawImage(
                    bImg,
                    currentFrameX, 0, frameW, frameH,
                    destX, destY,
                    finalW, finalH
                );
            }
        } else {
            ctx.fillStyle = "#555";
            ctx.fillRect(bDrawX - (8 * zoomLevel) + offsetX, bDrawY - (20 * zoomLevel) + hoverY + offsetY, 16 * zoomLevel, 32 * zoomLevel);
        }

        // Barra de vida
        const spriteH = (base.frameHeight || (baseSpriteCache[activeBaseSrc]?.naturalHeight) || 64) * (base.renderScale || 1.0);
        const barW = Math.max(50, Math.min(100, (base.frameWidth || 64) * 0.75)) * zoomLevel;
        const barH = 6 * zoomLevel;
        const barX = bDrawX - (barW / 2);
        const barY = bDrawY - ((spriteH / 2) * zoomLevel) - (14 * zoomLevel) + hoverY + offsetY;

        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(barX, barY, barW, barH);

        const hpPercent = Math.max(0, base.hp / base.maxHp);

        if (hpPercent < 0.3) ctx.fillStyle = "#e74c3c";
        else if (isUnderAttack) ctx.fillStyle = "#e67e22";
        else ctx.fillStyle = "#3498db";

        ctx.fillRect(barX, barY, barW * hpPercent, barH);

        ctx.fillStyle = "white";
        ctx.font = `bold ${8 * zoomLevel}px sans-serif`;
        ctx.textAlign = "center";

        let baseStatus = (base.name || 'Base').toUpperCase();
        if (base.currentOwnerSquadId) {
            baseStatus = `${base.name || 'Base'}: ${(base.currentOwnerSquadId || '').toUpperCase()}`;
        }
        baseStatus += ` - ${Math.floor(base.hp)}/${base.maxHp}`;
        ctx.fillText(baseStatus, bDrawX, barY - (4 * zoomLevel));

        // MODO DEBUG: DIBUJAR HITBOX
        if (editMode) {
            const hitDrawX = Math.round(screenCenterX + ((base.worldX + (base.hitboxOffsetX || 0)) - player.worldX) * zoomLevel);
            const hitDrawY = Math.round(screenCenterY + ((base.worldY + (base.hitboxOffsetY || 0)) - player.worldY) * zoomLevel);

            const drawW = (base.hitboxW || 32) * zoomLevel;
            const drawH = (base.hitboxH || 32) * zoomLevel;

            ctx.beginPath();
            ctx.strokeStyle = "rgba(231, 76, 60, 0.8)";
            ctx.lineWidth = 2 * zoomLevel;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(hitDrawX - (drawW / 2), hitDrawY - (drawH / 2), drawW, drawH);
            ctx.setLineDash([]);
        }
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
            // ðŸ‘‡ NUEVO: EFECTO FANTASMA AL ARRASTRAR ðŸ‘‡
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

        // ðŸ‘‡ NUEVO: EFECTO FANTASMA AL PINTAR MULTIPLES TILES (BLUEPRINT PREVIEW) ðŸ‘‡
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

        // ðŸ‘‡ NUEVO: GRID OVERLAY ðŸ‘‡
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
        // --- VISUALIZAR ZONAS UNIVERSALES (CON FILTROS Y ESTILOS DINÃMICOS) ---
        if (showSafeZoneVisuals && window.ZONE_CONFIG) {
            for (let i = 0; i < safeZones.length; i++) {
                let z = safeZones[i];
                const zType = z.zoneType || 'safe';

                // ðŸ›‘ EL FIX DEL FILTRO: Â¿DeberÃ­amos dibujar esta zona?
                if (activeZoneFilter !== 'all' && activeZoneFilter !== zType) {
                    continue; // Saltar al siguiente ciclo si no coincide con el filtro activo
                }

                // Buscar colores en el Diccionario Maestro (Failsafe a blanco si la zona es muy vieja)
                const config = window.ZONE_CONFIG[zType] || { icon: "â“", colorBorder: "white", colorFill: "rgba(255,255,255,0.2)" };

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

        // ðŸ›‘ EL FIX: Solo dibujar la luz brillante si el arma es "ranged"
        if (stats && stats.type === 'ranged') {
            const dir = player.frameY;
            const d = stats.dirStats ? (stats.dirStats[dir] || {}) : {};
            const currentMuzzleX = player.worldX + (d.hitX || 0);
            const currentMuzzleY = player.worldY + (d.hitY || 0);
            const fX = Math.floor(screenCenterX + (currentMuzzleX - renderWorldX) * zoomLevel);
            const fY = Math.floor(screenCenterY + (currentMuzzleY - renderWorldY) * zoomLevel);

            ctx.fillStyle = stats.color || "#ffcc00"; // Usar el color del arma

            // ðŸ›¡ï¸ EL FIX DE RENDIMIENTO MÃ“VIL: Sombra solo en PC
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

    // --- HELPER: Dibujar Barra de Vida DinÃ¡mica ---
    function drawHealthBar(x, y, hp, maxHp, scaledWidth, lastHpUpdate) {
        // Si nunca se ha actualizado y tiene la vida llena, no dibujar
        if (!lastHpUpdate && hp === maxHp) return;

        const timeSinceUpdate = Date.now() - (lastHpUpdate || 0);

        // Si pasaron 4 segundos sin CAMBIOS de vida, ocultar
        if (timeSinceUpdate > 4000) return;

        // Fade out el Ãºltimo segundo
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
        drawDynamicBubble(p.message, p.messageTimer, p.isTyping, p.isSpeaking, pTopLeftX, pTopLeftY, scaledWidth);
        drawNametag(p, pTopLeftX, pTopLeftY, scaledWidth, scaledHeight, getColorForString(p.username));

        // â±ï¸ Decrement locally so bubble fades without needing constant network updates
        if (p.messageTimer > 0) p.messageTimer--;
    }

    // Dibujar TU barra de vida, nombre y clan
    const myTopLeftX = myDrawX - (scaledWidth / 2);
    const myTopLeftY = myDrawY - (scaledHeight / 2);

    drawHealthBar(myTopLeftX, myTopLeftY, player.hp, player.maxHp || 100, scaledWidth, player.lastHpUpdateTime);
    drawDynamicBubble(player.message, player.messageTimer, player.isTyping, player.isSpeaking, myTopLeftX, myTopLeftY, scaledWidth);
    drawNametag(player, myTopLeftX, myTopLeftY, scaledWidth, scaledHeight, "#f1c40f");

    if (player.messageTimer > 0) {
        player.messageTimer--;
        if (player.messageTimer === 0) {
            player.message = ''; // Clear so the network broadcasts empty â†’ others hide bubble
        }
    }

    // === DIBUJAR NÃšMEROS DE DAÃ‘O (CON POOLING) ===
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

        if (dt.life <= 0) dt.active = false; // ðŸ›‘ LA MAGIA: Apagar en vez de splice()
    }
    ctx.globalAlpha = 1.0;

    // === ðŸ’¥ DIBUJAR EFECTOS DE IMPACTO (CON POOLING) ðŸ’¥ ===
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

        // Efecto 2: NÃºcleo brillante
        ctx.beginPath(); ctx.arc(sDrawX, sDrawY, radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = spark.color; ctx.fill();

        if (spark.life <= 0) spark.active = false; // ðŸ›‘ APAGAR
    }
    ctx.globalAlpha = 1.0;

    // ==========================================================
    // â›… AMBIENT WEATHER & DAY/NIGHT ENGINE â›…
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
    // â›… AMBIENT WEATHER & DAY/NIGHT ENGINE â›…
    // ==========================================================
    // 2. RAIN PARTICLE SYSTEM (Screen-space) WITH SPLASHES (OBJECT POOLING)
    if (gameSettings.rainEnabled && !isUnderRoof) {

        // 1. Activar 3 gotas nuevas por frame (buscar las que estÃ©n apagadas)
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

                if (r.splashLife <= 0) r.active = false; // ðŸ›‘ APAGAR EN VEZ DE BORRAR
            }
        }
    } else if (isUnderRoof) {
        // Apagar toda la lluvia instantÃ¡neamente si entras a una casa
        for (let i = 0; i < MAX_RAIN; i++) window.rainParticles[i].active = false;
    }
    // --- NEW: UPDATE THE MINIMAP IF OPEN ---
    // Afuera de tu funciÃ³n update()
    let lastMinimapUpdate = 0;

    // Adentro de update(), en lugar de if (isMapOpen) drawMinimap(); pon esto:
    if (isMapOpen) {
        const now = Date.now();
        if (now - lastMinimapUpdate > 1200) { // Actualiza el mapa cada 200ms (5 FPS)
            drawMinimap();
            lastMinimapUpdate = now;
        }
    }

    // Restaurar la posiciÃ³n fÃ­sica real para que la red y la fÃ­sica sigan perfectas
    if (isCinematicLoading) {
        player.worldX = realPlayerX;
        player.worldY = realPlayerY;
    }
    // --- ACTUALIZAR EL LABORATORIO MELEE EN VIVO ---
    const skelEd = document.getElementById('skeleton-editor');
    if (skelEd && skelEd.style.display !== 'none' && currentGaniTab === 'melee') {
        updateSkelPreview();
    }

    // --- ACTUALIZAR LA ANIMACIÃ“N DE LA TIENDA A 60 FPS ---
    if (isShopOpen) {
        drawShopPlayerPreview();
    }

    // ==========================================================
    // ðŸŒ 7. MOTOR DE RED SINCRONIZADO (CERO JSON.STRINGIFY LAG)
    // ==========================================================
    networkTimer += dtMs;

    if (networkTimer >= NETWORK_TICK_RATE) {
        networkTimer = 0;

        if (ws && ws.readyState === WebSocket.OPEN && player.username) {
            const timeNow = Date.now();
            const rx = Math.round(player.worldX);
            const ry = Math.round(player.worldY);

            // ðŸ›‘ EL FIX: Condicional matemÃ¡tico puro (Costo CPU = 0%)
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

            // Solo enviamos si algo cambiÃ³, o si pasaron 2 segundos por seguridad
            if (isDirty || timeNow - (window.lastForceSendTime || 0) > 2000) {
                ws.send(MessagePack.encode({
                    type: 'update',
                    player: {
                        username: player.username,
                        worldX: rx, worldY: ry, // Enviamos nÃºmeros enteros, ahorra datos
                        frameX: player.frameX, frameY: player.frameY,
                        isMoving: player.isMoving,
                        message: player.message, messageTimer: player.messageTimer,
                        isTyping: player.isTyping,
                        isSitting: player.isSitting,
                        equippedWeapon: player.equippedWeapon
                    }
                }));

                // Actualizar la memoria rÃ¡pida
                window.lastNetX = rx; window.lastNetY = ry;
                window.lastNetDir = player.frameY; window.lastNetMoving = player.isMoving;
                window.lastNetWep = player.equippedWeapon; window.lastNetMsg = player.message;
                window.lastNetTyping = player.isTyping; window.lastNetSitting = player.isSitting;
                window.lastForceSendTime = timeNow;
            }
        }
    }
}

// Iniciar el bucle principal del motor
window.update = update;
if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(update);
}


function update(currentTime) {
    try {
        _real_update(currentTime);
    } catch (e) {
        console.error("FATAL UPDATE ERROR:", e);
        try {
            const canvas = document.getElementById('gameCanvas');
            const ctx = canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "red";
            ctx.font = "16px monospace";
            ctx.fillText("ENGINE CRASH: " + e.message, 20, 40);
            ctx.fillStyle = "yellow";
            let stackStr = (e.stack || "").split('\n').slice(0, 4).join('\n');
            const lines = stackStr.split('\n');
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], 20, 80 + i * 20);
            }
        } catch (e2) {
            console.error(e2);
        }
    }
}
