var isDiscoveryOpen = false;
var lastDiscoveryTile = null;
function drawModularCharacter(ctx, p, drawX, drawY, zoom) {
    // ==========================================================
    // ?? SISTEMA DE MONTURAS DESDE HOTBAR ??
    // ==========================================================
    let equippedMount = null;
    let actualWeapon = p.equippedWeapon;
    const originalEquippedWeapon = p.equippedWeapon;
    
    // Verificamos si el arma equipada es en realidad una montura
    let itemInfo = null;
    if (actualWeapon && actualWeapon !== "none" && !p.isSwimming) { // en agua: desmontado visual (se restaura al salir)
        itemInfo = window.getCatalogData ? window.getCatalogData(actualWeapon) : null;
        if (itemInfo && itemInfo.category === 'mount') {
            equippedMount = actualWeapon;
            p.equippedWeapon = "none"; // Fingimos que no tiene arma para que no anime los brazos
        }
    }
    
    const dynMountImg = (equippedMount && window.loadedItemSprites) ? window.loadedItemSprites[equippedMount] : null;
    let pYOffset = -12; // Cuanto se levanta el jugador (default -12)
    let mYOffset = 16;  // Cuanto baja la montura (default +16)
    let pXOffset = 0;   // Cuanto se mueve en X el jugador
    
    if (itemInfo && itemInfo.category === 'mount') {
        const dir = p.frameY % 4; // 0=Abajo, 1=Izq, 2=Der, 3=Arriba
        const config = itemInfo.dirStats && itemInfo.dirStats[dir] ? itemInfo.dirStats[dir] : null;
        
        // Usar estrictamente las estadísticas direccionales
        if (config) {
            if (config.pY !== undefined) pYOffset = Number(config.pY);
            if (config.mY !== undefined) mYOffset = Number(config.mY);
            if (config.pX !== undefined) pXOffset = Number(config.pX);
        }
    }

    const currentlyMovingForMount = p.isVisuallyMoving !== undefined ? p.isVisuallyMoving : p.isMoving;
    let drawMount = null;
    let isMountAbove = (p.frameY === 0); // Si mira hacia abajo, la dibujaremos SOBRE el jugador

    if (dynMountImg && dynMountImg.complete && dynMountImg.naturalWidth > 0) {
        const MOUNT_FRAME_SIZE = 96;
        let mountFrameX = 0;
        
        if (currentlyMovingForMount) {
            const syncFrame = Math.floor(Date.now() / 150) % 4; 
            const animMap = [1, 2, 1, 0];
            mountFrameX = animMap[syncFrame] || 0;
        } else {
            mountFrameX = 0; // Idle
        }
        
        const mountDrawW = MOUNT_FRAME_SIZE * zoom;
        const mountDrawH = MOUNT_FRAME_SIZE * zoom;
        
        const mountDrawX = drawX - (mountDrawW / 2);
        const mountDrawY = drawY - (mountDrawH / 2) + (mYOffset * zoom); 
        
        drawMount = () => {
            ctx.drawImage(
                dynMountImg,
                mountFrameX * MOUNT_FRAME_SIZE, p.frameY * MOUNT_FRAME_SIZE, MOUNT_FRAME_SIZE, MOUNT_FRAME_SIZE,
                mountDrawX, mountDrawY, mountDrawW, mountDrawH
            );
        };
        
        p.isSitting = true; 
        drawY += (pYOffset * zoom);
        drawX += (pXOffset * zoom);
    }

    if (drawMount && !isMountAbove) {
        drawMount();
    }

    // ==========================================================
    // ???? NUEVO SISTEMA DE ROPA (GUARDARROPA DIN�MICO) ????
    // ==========================================================
    const equippedBody = (p.equipped && p.equipped.body) ? p.equipped.body : 'body_default';
    const equippedHead = (p.equipped && p.equipped.head) ? p.equipped.head : 'head_default';

    const dynBodyImg = (window.loadedItemSprites && window.loadedItemSprites[equippedBody]) ? window.loadedItemSprites[equippedBody] : bodyImg;
    const dynHeadImg = (window.loadedItemSprites && window.loadedItemSprites[equippedHead]) ? window.loadedItemSprites[equippedHead] : headImg;
    // ==========================================================

    const dirIdx = p.frameY;
    let state = "idle";
    let maxFrames = 4;
    let displayFrameX = p.frameX;

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
    
    // --- NUEVO: WOBBLE GLOBAL (CABEZA, MANOS, ARMAS) ---
    const WOBBLE_PATTERN = [0, 1, 0, -1, 0, 1, 0, -1];
    let wobbleY = 0;
    
    // RESTAURACI�N DEL COMPORTAMIENTO ORIGINAL: Sincronizado estrictamente con los p�xeles del cuerpo
    if (p.isSitting) {
        // Montura
        const simulatedFrame = Math.floor(Date.now() / 250) % 8;
        wobbleY = WOBBLE_PATTERN[simulatedFrame] || 0;
    } else if (displayFrameX === 0 && !p.isMoving && !p.isVisuallyMoving && p.equippedWeapon !== "none") {
        // Si tiene arma y est� quieto, maxFrames de l�gica se congela a 1. p.frameX nunca avanza de 0.
        // As� que usamos tambi�n el reloj interno global para que el personaje respire m�gicamente.
        const simulatedFrame = Math.floor(Date.now() / 250) % 8;
        wobbleY = WOBBLE_PATTERN[simulatedFrame] || 0;
    } else {
        // Para caminar o estar Idle sin armas, empatamos 1:1 con el frame dibujado del torso.
        wobbleY = WOBBLE_PATTERN[displayFrameX % 8] || 0;
    }

    // ILUSION NADAR: sin cuerpo, cabeza 14px mas abajo (sumergido)
    const swimDrop = (p.isSwimming ? 14 : 0) * zoom;
    const hideBody = !!p.isSwimming;
    const handX = drawX + (handAnc[0] * zoom);
    const handY = drawY + ((handAnc[1] + wobbleY) * zoom);

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

            if (d.wTileX !== undefined && d.wTileX !== null) {
                // Editor logic: draws 16x16 icon accessory from the sprite
                ctx.drawImage(wSprite, d.wTileX * 16, (d.wTileY || 0) * 16, 16, 16, -(16 * zoom) / 2, -(16 * zoom) / 2, 16 * zoom, 16 * zoom);
            } else {
                // Legacy logic: Columna 1 (X = 48) de 48x64
                const wW = 48;
                const wH = 64;
                let srcY = dirIdx * wH;
                ctx.drawImage(wSprite, 48, srcY, wW, wH, -(wW * zoom) / 2, -(wH * zoom) / 2, wW * zoom, wH * zoom);
            }
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
            if (window.showGaniGizmos && document.getElementById('skeleton-editor') && document.getElementById('skeleton-editor').style.display !== 'none' && p.id === player.id) {
                ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
            }
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
            if (window.showGaniGizmos && document.getElementById('skeleton-editor') && document.getElementById('skeleton-editor').style.display !== 'none' && p.id === player.id) {
                ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
            }
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
    // (naturalWidth>0: imagen rota por CORS/red no debe tumbar el loop)
    if (!hideBody && dynBodyImg && dynBodyImg.complete && dynBodyImg.naturalWidth > 0) {
        ctx.drawImage(
            dynBodyImg,
            safeFrameX * FRAME_WIDTH, (baseRow + dirIdx) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
            offsetX, offsetY, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom
        );
    }

    

    // ==========================================================
    // 🧠 EL WOBBLE (BAMBOLEO) MATEMÁTICO: Cabeza y Sombrero
    // ==========================================================
    // Secuencia: Centro(0), Abajo(1), Centro(0), Arriba(-1)
    

    // Calculamos la coordenada FINAL una sola vez para ambos
    const finalHeadX = offsetX + (headAnc[0] * zoom);
    const finalHeadY = offsetY + ((headAnc[1] + wobbleY) * zoom) + swimDrop;

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
    // SNAPSHOT para DUST 1:1 (rects exactos del frame dibujado; viaja en p)
    try {
        const _snap = { parts: [] };
        if (dynBodyImg && dynBodyImg.complete && dynBodyImg.naturalWidth > 0) _snap.parts.push({ img: dynBodyImg, sx: safeFrameX * FRAME_WIDTH, sy: (baseRow + dirIdx) * FRAME_HEIGHT, sw: FRAME_WIDTH, sh: FRAME_HEIGHT, ox: -(FRAME_WIDTH / 2), oy: -(FRAME_HEIGHT / 2) });
        if (dynHeadImg && dynHeadImg.complete && dynHeadImg.naturalWidth > 0) { const _hfh = dynHeadImg.height / 4; _snap.parts.push({ img: dynHeadImg, sx: 0, sy: dirIdx * _hfh, sw: FRAME_WIDTH, sh: _hfh, ox: headAnc[0], oy: headAnc[1] + wobbleY }); }
        if (typeof dynHatImg !== 'undefined' && dynHatImg && dynHatImg.complete && dynHatImg.naturalWidth > 0) { const _thfh = dynHatImg.height / 4; _snap.parts.push({ img: dynHatImg, sx: 0, sy: dirIdx * _thfh, sw: FRAME_WIDTH, sh: _thfh, ox: headAnc[0], oy: headAnc[1] + wobbleY }); }
        if (_snap.parts.length) p.__dustSnap = _snap;
    } catch (e) {}
    // ===========================================================

    if (aZ === 1 && !isSitting) drawAccessory();
    
    // Si miramos hacia abajo, la montura se dibuja al final para tapar las piernas del jugador
    if (drawMount && isMountAbove) {
        drawMount();
    }
    if (wZ === 1 && !isSitting) drawWeapon();
    if (hZ === 1 && !isSitting) drawHand();

    // ⚔�  GIZMOS DE HITBOX / MUZZLE
    if (window.showGaniGizmos && document.getElementById('skeleton-editor') && document.getElementById('skeleton-editor').style.display !== 'none' && p.id === player.id && p.equippedWeapon && weaponsDB[p.equippedWeapon]) {
        const wStats = weaponsDB[p.equippedWeapon];
        const isRanged = wStats.type === 'ranged';
        
        ctx.save();
        ctx.translate(drawX + ((d.hitX || 0) * zoom), drawY + ((d.hitY || 0) * zoom));
        
        if (isRanged) {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = "yellow"; ctx.fill();
            ctx.strokeStyle = "orange"; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "white"; ctx.font = "10px sans-serif";
            ctx.fillText("Bala", 6, 4);
        } else {
            const hitRotRad = (d.hitRot || 0) * Math.PI / 180;
            const trueHitAngle = baseAimAngle + (hitRotRad * dirM);
            const halfWidRad = ((d.hitWid || 60) / 2) * Math.PI / 180;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.arc(0, 0, (d.hitLen || 40) * zoom, trueHitAngle - halfWidRad, trueHitAngle + halfWidRad);
            ctx.fillStyle = "rgba(231, 76, 60, 0.4)"; ctx.fill(); 
            ctx.strokeStyle = "#e74c3c"; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
    }

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

    // --- RESTORE ORIGINAL STATE ---
    p.equippedWeapon = originalEquippedWeapon;
    if (equippedMount) p.isSitting = false;
} // <--- Fin de la función drawModularCharacter

// 🎬 Inicia la cinemática de guía (zoom al jugador + Boba mirándolo)
window.guide = window.guide || { phase: 'idle', t0: 0, baseZoom: 2, targetZoom: 4 };
window.startGuideCinematic = function () {
    window.guide.phase = 'zoom';
    window.guide.t0 = performance.now();
    window.guide.baseZoom = (typeof zoomLevel !== 'undefined') ? zoomLevel : 2;
    window._guideNormalZoom = window.guide.baseZoom; // recordar zoom normal para restaurar al final
    window.guide.targetZoom = Math.min(6, window.guide.baseZoom * 2);
    window.guide.answered = false;
    window.cinematicLock = true;
};

// Marca el guide como terminado (deja de aparecer la elección de idioma / cinemática)
window.finishGuide = function () {
    try { localStorage.setItem('aargon_guide_done', '1'); } catch (e) {}
    if (window.guide) { window.guide.phase = 'idle'; window.guide.itemGlow = null; }
    window._guideNormalZoom = undefined;
    window.cinematicLock = false;
    const box = document.getElementById('guide-dialog');
    if (box) box.style.display = 'none';
};

// =========================================================
// 🎓 TUTORIAL VISUAL DE EQUIPAR (Boba Tip flotante + puntero)
// =========================================================
function _bobaDrawPortrait() {
    const cvs = document.getElementById('boba-tip-canvas');
    if (!cvs) return;
    const cx = cvs.getContext('2d');
    const id = (typeof player !== 'undefined' && player && player.companions && player.companions[0]) || 'companion_boba';
    const img = window.loadedItemSprites && window.loadedItemSprites[id];
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, cvs.width, cvs.height);
    if (img && img.complete && img.naturalWidth > 0) {
        cx.drawImage(img, 0, 0, 32, 32, 0, 0, cvs.width, cvs.height); // frame 0 = mirando abajo
    }
}
function _positionBobaTip(rect) {
    const tip = document.getElementById('boba-tip');
    if (!tip || tip.style.display === 'none') return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tip.offsetWidth || 260;
    const th = tip.offsetHeight || 60;
    // Centrar horizontalmente bajo el objetivo, sin salirse de la pantalla
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, vw - tw - 8));
    // Debajo del objetivo; si no cabe, encima
    let top = rect.bottom + 14;
    if (top + th > vh - 8) top = rect.top - th - 14;
    if (top < 8) top = 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.bottom = 'auto';
    tip.style.transform = 'none';
}
// Coloca el tip a la izquierda, centrado verticalmente (para la fase de basura)
function guideTipLeftCenter() {
    const tip = document.getElementById('boba-tip');
    if (!tip) return;
    tip.style.left = '16px';
    tip.style.top = '50%';
    tip.style.bottom = 'auto';
    tip.style.transform = 'translateY(-50%)';
}
function guidePointerTo(sel) {
    const el = sel ? document.querySelector(sel) : null;
    const ptr = document.getElementById('guide-pointer');
    const spot = document.getElementById('guide-spotlight');
    if (!ptr) return;
    if (!el) { ptr.style.display = 'none'; if (spot) spot.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { ptr.style.display = 'none'; if (spot) spot.style.display = 'none'; return; }
    ptr.style.display = 'block';
    ptr.style.left = (r.left - 6) + 'px';
    ptr.style.top = (r.top - 6) + 'px';
    ptr.style.width = (r.width + 12) + 'px';
    ptr.style.height = (r.height + 12) + 'px';
    if (spot) {
        spot.style.display = 'block';
        spot.style.left = (r.left - 4) + 'px';
        spot.style.top = (r.top - 4) + 'px';
        spot.style.width = (r.width + 8) + 'px';
        spot.style.height = (r.height + 8) + 'px';
    }
    _positionBobaTip(r);
}
function guideTip(text, sel, icon, next) {
    const el = document.getElementById('boba-tip');
    const tx = document.getElementById('boba-tip-text');
    if (tx) tx.textContent = text;
    if (el) {
        el.style.display = 'flex';
        // ✨ leve glow cada vez que cambia el texto (para que se note dinámico)
        el.classList.remove('boba-tip-flash');
        void el.offsetWidth;
        el.classList.add('boba-tip-flash');
        clearTimeout(window._bobaTipFlashT);
        window._bobaTipFlashT = setTimeout(function () { el.classList.remove('boba-tip-flash'); }, 700);
    }
    _bobaDrawPortrait();
    // Icono opcional (ej. el sprite de basura 16x16)
    const ic = document.getElementById('boba-tip-icon');
    if (ic) {
        if (icon && icon.sheet === 'trash' && typeof trashSpritesheet !== 'undefined' && typeof CLIENT_TRASH_CATALOG !== 'undefined' && CLIENT_TRASH_CATALOG.length) {
            const t0 = CLIENT_TRASH_CATALOG[0];
            const cx = ic.getContext('2d');
            cx.imageSmoothingEnabled = false;
            cx.clearRect(0, 0, ic.width, ic.height);
            if (trashSpritesheet.complete && trashSpritesheet.naturalWidth > 0) {
                cx.drawImage(trashSpritesheet, t0.sx, t0.sy, 16, 16, 0, 0, ic.width, ic.height);
            }
            ic.style.display = 'inline-block';
        } else {
            ic.style.display = 'none';
        }
    }
    // Botón "Siguiente" opcional dentro del tip (para avanzar pasos)
    const nextBtn = document.getElementById('boba-tip-next');
    if (nextBtn) {
        if (next && typeof next.onClick === 'function') {
            nextBtn.style.display = 'inline-block';
            nextBtn.textContent = next.text || ((typeof t === 'function') ? t('guide.next') : 'Next');
            nextBtn.onclick = function (ev) { if (ev) ev.stopPropagation(); next.onClick(); };
        } else {
            nextBtn.style.display = 'none';
            nextBtn.onclick = null;
        }
    }
    if (sel) guidePointerTo(sel);
}
function guideTipHide() {
    const el = document.getElementById('boba-tip');
    if (el) el.style.display = 'none';
    const p = document.getElementById('guide-pointer');
    if (p) p.style.display = 'none';
    const s = document.getElementById('guide-spotlight');
    if (s) s.style.display = 'none';
    const nb = document.getElementById('boba-tip-next');
    if (nb) { nb.style.display = 'none'; nb.onclick = null; }
}
// ------- 🧪 Helpers de prueba (consola) -------
window.testGuideReset = function () {
    try { localStorage.removeItem('aargon_guide_done'); } catch (e) { }
    window.guide = { phase: 'idle', t0: 0, baseZoom: (typeof zoomLevel !== 'undefined' ? zoomLevel : 2), targetZoom: 4, answered: false, walk: null, waitingForItem: null, startWalkAfter: false };
    window.camFocus = { active: false };
    window.camReturn = false;
    if (typeof guideTipHide === 'function') guideTipHide();
    const box = document.getElementById('guide-dialog'); if (box) box.style.display = 'none';
    console.log('[guide] reset');
};
// Deja el trash_picker en inventario pero SIN equipar (para probar el tutorial visual)
window._guideEnsurePickerUnequipped = function () {
    if (typeof player === 'undefined' || !player) return;
    if (!Array.isArray(player.inventory)) player.inventory = [];
    if (!player.inventory.some(i => ((typeof i === 'object' && i) ? i.id : i) === 'trash_picker')) player.inventory.push('trash_picker');
    if (Array.isArray(player.hotbar)) player.hotbar = player.hotbar.map(x => (x === 'trash_picker' ? 'none' : x));
    if (player.equippedWeapon === 'trash_picker') player.equippedWeapon = 'none';
};
// Probar SOLO el tutorial de equipar (rápido)
window.testGuideEquip = function () {
    window._guideEnsurePickerUnequipped();
    if (typeof window.startEquipTutorial === 'function') window.startEquipTutorial();
    console.log('[guide] test equip');
};
// Probar el guide COMPLETO desde el inicio (cinemática -> caminar -> yonke -> equipar)
window.testGuideFromStart = function () {
    window.testGuideReset();
    window._guideEnsurePickerUnequipped();
    if (typeof window.startGuideCinematic === 'function') window.startGuideCinematic();
    console.log('[guide] test desde el inicio');
};

// Saltar directo al diálogo de llegada (yonke) sin caminar
window.testGuideArrival = function () {
    window.testGuideReset();
    window._guideEnsurePickerUnequipped();
    const box = document.getElementById('guide-dialog'); if (box) box.style.display = 'block';
    if (typeof window.playGuideLine === 'function') window.playGuideLine('arrival');
    console.log('[guide] test arrival');
};

window._equipTut = { active: false, step: 0, done: false };
window.startEquipTutorial = function () {
    window._equipTut = { active: true, step: 0, done: false };
    const tray = document.getElementById('app-tray');
    const trayOpen = !!(tray && tray.classList.contains('open'));
    if (trayOpen) {
        // Ya está abierta: saltar directo al paso de la mochila
        window._equipTut.step = 1;
        guideTip((typeof t === 'function') ? t('tut.openBag') : 'Open your bag', '#app-inventory');
    } else {
        // Paso nuevo: abrir el menú (menu-toggle) para que aparezca la bandeja
        guideTip((typeof t === 'function') ? t('tut.openMenu') : 'Tap the menu button (☰) to open your apps.', '#menu-toggle');
    }
};
window._equipTutTick = function () {
    const tut = window._equipTut;
    if (!tut || !tut.active) return;
    if (typeof player === 'undefined' || !player) return;

    const equipped = (player.equippedWeapon === 'trash_picker') || (Array.isArray(player.hotbar) && player.hotbar.includes('trash_picker'));
    if (equipped) {
        tut.active = false;
        guideTipHide();
        if (!tut.done) {
            tut.done = true;
            const box = document.getElementById('guide-dialog');
            if (box) box.style.display = 'block';
            if (typeof window.playGuideLine === 'function') window.playGuideLine('trash_hunt');
        }
        return;
    }

    const isOpen = (id) => { const e = document.getElementById(id); return e && e.style.display !== 'none'; };
    // Si el tip se ocultó (p. ej. detrás de una celebración), reintentarlo
    const tipShown = () => { const e = document.getElementById('boba-tip'); return !!(e && e.style.display !== 'none'); };
    if (isOpen('item-detail-modal')) {
        if (tut.step !== 4 || !tipShown()) { tut.step = 4; guideTip((typeof t === 'function') ? t('tut.equip') : 'Equip it', '#btn-equip-item'); }
        else guidePointerTo('#btn-equip-item');
    } else if (isOpen('inventory-modal')) {
        const slotSel = '#inventory-grid [data-item-id="trash_picker"]';
        if (tut.step !== 3 || !tipShown()) { tut.step = 3; guideTip((typeof t === 'function') ? t('tut.select') : 'Select your Trash Picker', slotSel); }
        else guidePointerTo(slotSel);
    } else if (isOpen('equip-modal')) {
        if (tut.step !== 2 || !tipShown()) { tut.step = 2; guideTip((typeof t === 'function') ? t('tut.slot') : 'Choose a slot', '#equip-slots-container'); }
        else guidePointerTo('#equip-slots-container');
    } else {
        const tray = document.getElementById('app-tray');
        const trayOpen = !!(tray && tray.classList.contains('open'));
        if (!trayOpen) {
            // PASO NUEVO: tocar el botón de menú para abrir la bandeja
            if (tut.step !== 0 || !tipShown()) { tut.step = 0; guideTip((typeof t === 'function') ? t('tut.openMenu') : 'Tap the menu button (☰) to open your apps.', '#menu-toggle'); }
            else guidePointerTo('#menu-toggle');
        } else {
            // Bandeja abierta: tocar la mochila
            if (tut.step !== 1 || !tipShown()) { tut.step = 1; guideTip((typeof t === 'function') ? t('tut.openBag') : 'Open your bag', '#app-inventory'); }
            else guidePointerTo('#app-inventory');
        }
    }
};

// =========================================================
// 🗑️ FASE: RECOLECTAR BASURA (guía a la más cercana) + regreso a vender
// =========================================================
window._trashCount = function () {
    if (typeof player === 'undefined' || !player || !Array.isArray(player.inventory)) return 0;
    let n = 0;
    for (const it of player.inventory) {
        const id = (typeof it === 'object' && it) ? it.id : it;
        if (typeof id === 'string' && id.indexOf('trash_') === 0) {
            n += (typeof it === 'object' && it && it.quantity) ? it.quantity : 1;
        }
    }
    return n;
};
window._findNearestTrash = function () {
    if (typeof groundItems === 'undefined' || typeof player === 'undefined' || !player) return null;
    const planet = player.currentPlanet || 'main';
    let best = null, bestD = Infinity;
    for (const id in groundItems) {
        const g = groundItems[id];
        if (!g || g.type !== 'trash') continue;
        if ((g.planetId || 'main') !== planet) continue;
        const d = Math.hypot(g.x - player.worldX, g.y - player.worldY);
        if (d < bestD) { bestD = d; best = { x: g.x, y: g.y, id: id }; }
    }
    return best;
};
window._trashHuntRetarget = function () {
    const g = window.guide;
    if (!g || !g.trashActive) return;
    g.hold = null;
    const near = window._findNearestTrash();
    if (!near) return; // sin basura visible ahora mismo
    g.trashTargetId = near.id;
    window.startGuideWalk({ x: near.x, y: near.y }, function () {
        // Llegó a la basura: quedarse FIJO ahí hasta que la recoja
        if (window.guide && window.guide.trashActive) window.guide.hold = { x: near.x, y: near.y };
    });
};
function _guideTrashTip(count) {
    const txt = (typeof t === 'function')
        ? t('guide.trashProgress').replace('{n}', count)
        : ('Follow me to collect trash (' + count + '/10)');
    guideTip(txt, null, { sheet: 'trash' });
    guideTipLeftCenter();
}
window.startTrashHunt = function () {
    window.guide = window.guide || {};
    window.guide.trashActive = true;
    window.guide.trashReturning = false;
    window.guide.junkyardTipped = false;
    window.guide.trashShown = -1;
    window.guide.trashTargetId = null;
    window.guide.hold = null;
    _guideTrashTip(window._trashCount ? window._trashCount() : 0);
    setTimeout(function () { window._trashHuntRetarget(); }, 1200);
};
window._trashTick = function () {
    const g = window.guide;
    if (!g) return;
    // Si abrió el modal del yonke al regresar, Boba explica sus funciones
    const jm = document.getElementById('junkyard-modal');
    if (jm && jm.style.display !== 'none' && g.trashReturning && !g.junkyardTipped) {
        g.junkyardTipped = true;
        // ⛔ NO liberar a Boba aquí: se queda plantado durante la venta (evita free-roam raro)
        window.startSellTutorial();
    }
    if (!g.trashActive) return;

    // Si la basura objetivo desapareció (fue recogida) -> soltar hold y buscar otra
    if (g.trashTargetId && typeof groundItems !== 'undefined' && !groundItems[g.trashTargetId]) {
        g.trashTargetId = null;
        g.hold = null;
        setTimeout(function () { if (window.guide && window.guide.trashActive) window._trashHuntRetarget(); }, 400);
    }

    // Contador X/10
    const count = window._trashCount();
    if (g.trashShown !== count && count < 10) {
        g.trashShown = count;
        _guideTrashTip(count);
    }

    if (count >= 10 && !g.trashReturning) {
        g.trashActive = false;
        g.trashReturning = true;
        g.junkyardTipped = false;
        g.hold = null;
        // 🎉 Celebración + felicitación
        const doneTxt = (typeof t === 'function') ? t('guide.trashDone') : 'Great job! 10/10';
        guideTip(doneTxt, null, { sheet: 'trash' });
        const tip = document.getElementById('boba-tip');
        if (tip) { tip.classList.add('boba-celebrate'); setTimeout(function () { tip.classList.remove('boba-celebrate'); }, 1600); }
        setTimeout(function () {
            guideTipHide();
            const box = document.getElementById('guide-dialog');
            if (box) box.style.display = 'block';
            // Solo muestra el diálogo. El caminar se dispara al dar Next (en _guideEndDialogue)
            if (typeof window.playGuideLine === 'function') window.playGuideLine('trash_return');
        }, 1600);
    }
};

// =========================================================
// 🏪 FASE: VENDER en el yonke -> ir a la tienda de armas -> comprar melee
// =========================================================
window.startSellTutorial = function () {
    window.guide = window.guide || {};
    // Paso 0: presentar la ventana de venta del yonke (con botón Next)
    window.guide.sellTut = { active: true, step: 0 };
    guideTip(
        (typeof t === 'function') ? t('guide.sellWindow') : 'This is the junkyard sell window.',
        '#junkyard-modal', null,
        {
            text: (typeof t === 'function') ? t('guide.next') : 'Next',
            onClick: function () {
                const tut = window.guide && window.guide.sellTut;
                if (!tut) return;
                tut.step = 1;
                guideTip((typeof t === 'function') ? t('guide.sellIntro') : "Here you can sell items individually or all. Today we'll sell everything.", '#row-all');
            }
        }
    );
};
window._sellTutTick = function () {
    const g = window.guide;
    const tut = g && g.sellTut;
    if (!tut || !tut.active) return;
    const jm = document.getElementById('junkyard-modal');
    if (!jm || jm.style.display === 'none') {
        // El modal se cerró: si ya vendió (sin basura), continuar a la tienda de armas
        const sold = (window._trashCount ? window._trashCount() : 0) === 0;
        tut.active = false;
        guideTipHide();
        if (sold && window.guide && !window.guide.gunshopPhase) window.startGunshopIntro();
        else if (window.guide) window.guide.junkyardTipped = false; // cerró sin vender: reintentar al reabrir
        return;
    }

    const sellBtn = document.getElementById('btn-sell-action');
    const isLiquidate = sellBtn && /liquidar/i.test(sellBtn.textContent || '');
    if (tut.step === 0) {
        // Esperando que el jugador pulse "Next" en el tip de la ventana de venta
        return;
    } else if (tut.step === 1) {
        if (isLiquidate) {
            tut.step = 2;
            guideTip((typeof t === 'function') ? t('guide.sellLiquidate') : "Now press 'Liquidate Entire Backpack'.", '#btn-sell-action');
        } else {
            const tipEl = document.getElementById('boba-tip');
            if (!tipEl || tipEl.style.display === 'none') {
                guideTip((typeof t === 'function') ? t('guide.sellIntro') : "Here you can sell items individually or all. Today we'll sell everything.", '#row-all');
            } else {
                guidePointerTo('#row-all');
            }
        }
    } else if (tut.step === 2) {
        const _sb = document.getElementById('btn-sell-action');
        if (_sb && _sb.disabled) {
            // Al presionar "Liquidar" se cierra el modal solo
            try { jm.style.display = 'none'; } catch (e) { }
            try { isJunkyardOpen = false; } catch (e) { }
        } else {
            guidePointerTo('#btn-sell-action');
        }
        if ((window._trashCount ? window._trashCount() : 0) === 0) {
            tut.active = false;
            guideTipHide();
            try { jm.style.display = 'none'; } catch (e) { }
            try { isJunkyardOpen = false; } catch (e) { }
            window.startGunshopIntro();
        }
    }
};
window._guideFlowTick = function () {
    const g = window.guide;
    if (!g) return;
    // Tras vender en el yonke -> ir a la tienda de armas
    if (g.trashReturning && !g.gunshopPhase) {
        const jm = document.getElementById('junkyard-modal');
        const modalOpen = jm && jm.style.display !== 'none';
        const count = (window._trashCount ? window._trashCount() : 0);
        const reachedLiquidate = !!(g.sellTut && g.sellTut.step >= 2);
        if (!modalOpen && (count === 0 || reachedLiquidate)) {
            guideTipHide();
            window.startGunshopIntro();
        }
    }
};
// Se llama desde el handler sell_success (venta confirmada por el server)
window._onSellSuccess = function () {
    const g = window.guide;
    if (g && g.trashReturning && !g.gunshopPhase) {
        guideTipHide();
        window.startGunshopIntro();
    }
};
// Diálogo retro tras vender: "tienes dinero, sígueme a la tienda"
window.startGunshopIntro = function () {
    window.guide = window.guide || {};
    if (window.guide.gunshopPhase) return;
    window.guide.gunshopPhase = 'intro';
    guideTipHide();
    const box = document.getElementById('guide-dialog');
    if (box) box.style.display = 'block';
    if (typeof window.playGuideLine === 'function') window.playGuideLine('gunshop_intro');
};
window.startGunshopDoor = function () {
    window.guide = window.guide || {};
    window.guide.hold = null; // ahora sí puede caminar
    window.guide.gunshopPhase = 'walkDoor';
    // Fase 1: sígueme a encontrar la tienda
    guideTip((typeof t === 'function') ? t('guide.gunshopFind') : 'Follow me to find the gun shop.');
    guideTipLeftCenter();
    // Boba se coloca junto a la puerta de la tienda (tile -108, -20)
    window.startGuideWalk({ x: -108 * 16 + 8, y: -20 * 16 + 8 }, function () {
        // Fase 2: llegamos -> entra por la puerta
        guideTip((typeof t === 'function') ? t('guide.gunshopArrived') : "We've arrived — enter through the door.");
        guideTipLeftCenter();
    }, true);
};
window._guideTeleportTick = function () {
    const g = window.guide;
    if (!g || typeof player === 'undefined' || !player) return;
    const px = player.worldX, py = player.worldY;
    if (window._gLastPX === undefined) { window._gLastPX = px; window._gLastPY = py; return; }
    const jump = Math.hypot(px - window._gLastPX, py - window._gLastPY);
    window._gLastPX = px; window._gLastPY = py;
    if (jump > 200 && g.gunshopPhase === 'walkDoor') {
        g.gunshopPhase = 'inside';
        g.hold = null; g.walk = null;
        if (player._compStates) player._compStates = []; // Boba aparece contigo dentro
        guideTipHide();
        setTimeout(function () {
            // Zoom al ítem melee (coordenadas de TILE) mientras se muestra el diálogo retro
            if (typeof window.guideFocusTo === 'function') window.guideFocusTo(50992, 50995, 3);
            const box = document.getElementById('guide-dialog');
            if (box) box.style.display = 'block';
            if (typeof window.playGuideLine === 'function') window.playGuideLine('buy_melee');
        }, 800);
    }

    // 🎉 Celebración de compra — SOLO dentro de la tienda de armas.
    // (Antes corría en cualquier fase y con la celebración del trash_picker
    // ocultaba el tip del tutorial de equipar y dejaba _celebSeen pegado.)
    const celeb = document.getElementById('purchase-celebration');
    const celebOpen = !!(celeb && celeb.style.display !== 'none');
    if (g.gunshopPhase === 'inside') {
        if (celebOpen) {
            g._celebSeen = true;
            g.buyTipped = false;
            guideTipHide(); // oculta el aro/tip del botón comprar mientras se ve la celebración
        } else if (g._celebSeen) {
            // Celebración cerrada -> arranca el TOUR FINAL
            g._celebSeen = false;
            g.buyTipped = false;
            g.gunshopPhase = 'tour';
            guideTipHide();
            if (typeof window.startFinalTour === 'function') window.startFinalTour();
        }

        // 🛒 Spotlight al botón de comprar mientras la tienda está abierta
        if (g.gunshopPhase === 'inside' && !celebOpen) {
            const sm = document.getElementById('shop-modal');
            const smOpen = sm && sm.style.display !== 'none';
            if (smOpen) {
                if (!g.buyTipped) {
                    g.buyTipped = true;
                    guideTip((typeof t === 'function') ? t('guide.buyMeleeBtn') : 'Press Buy to purchase your melee.', '#buy-item-btn');
                } else {
                    guidePointerTo('#buy-item-btn');
                }
            } else if (g.buyTipped) {
                g.buyTipped = false;
                guideTipHide();
            }
        }
    }
};

// =========================================================
// 🏁 TOUR FINAL (tras comprar el melee)
// =========================================================
window.GUIDE_BASE_LOOP = [[60001, 59975], [-169, -83], [-203, 152], [78, 139], [72, -80]];
window.GUIDE_FINAL = [
    { key: 'guide.finalCongrats' },
    { key: 'guide.finalJob', focus: [51999, 51994] },
    { key: 'guide.finalShops', focus: [-107, 29] },
    { key: 'guide.finalMount', focus: [53000, 52985] },
    { key: 'guide.finalWar1', loop: true },
    { key: 'guide.finalWar2' },
    { key: 'guide.finalWar3' },
    { key: 'guide.finalWar4' },
    { key: 'guide.finalWar5' },
    { key: 'guide.finalAccount' },
    { key: 'guide.finalEnd' }
];
function _applyBaseLoopFocus() {
    const f = window.guide && window.guide.final;
    if (!f || !f.loopActive) return;
    const coords = window.GUIDE_BASE_LOOP || [];
    if (!coords.length) return;
    const c = coords[f.loopIdx % coords.length];
    if (typeof window.guideFocusTo === 'function') window.guideFocusTo(c[0], c[1], 3);
}
window.startFinalTour = function () {
    window.guide = window.guide || {};
    window.guide.final = { active: true, idx: 0, loopActive: false, loopIdx: 0, loopNextAt: 0 };
    if (typeof window.guideFocusClear === 'function') window.guideFocusClear();
    _playFinalStep();
};
function _playFinalStep() {
    const f = window.guide && window.guide.final;
    if (!f || !f.active) return;
    const steps = window.GUIDE_FINAL || [];
    if (f.idx >= steps.length) { _endFinalTour(); return; }
    const step = steps[f.idx];
    const isLast = (f.idx === steps.length - 1);

    if (isLast) {
        // 🏁 Último diálogo (Boba se presenta): dejar el loop de coords
        // y hacer zoom sobre el jugador/Boba; al terminarlo se vuelve a la normalidad.
        f.loopActive = false;
        if (typeof player !== 'undefined' && player && typeof window.guideFocusWorld === 'function') {
            window.guideFocusWorld(player.worldX, player.worldY, 2.6);
        }
    } else if (step.loop) {
        f.loopActive = true;
        f.loopIdx = 0;
        f.loopNextAt = Date.now() + 3000;
        _applyBaseLoopFocus();
    } else if (step.focus) {
        if (typeof window.guideFocusTo === 'function') window.guideFocusTo(step.focus[0], step.focus[1], 3);
    }

    const box = document.getElementById('guide-dialog');
    if (box) box.style.display = 'block';
    typeGuideText((typeof t === 'function') ? t(step.key) : step.key);
    const wrap = document.getElementById('guide-options');
    if (wrap) {
        wrap.innerHTML = '';
        const b = document.createElement('button');
        b.textContent = (typeof t === 'function') ? t('guide.next') : 'Next';
        b.style.cssText = 'background: linear-gradient(135deg,#d1383b,#c7734a); border:none; color:#fff; font-family:inherit; font-size:19px; padding:8px 24px; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow:0 3px 0 rgba(0,0,0,0.4);';
        b.onclick = () => window._finalNext();
        wrap.appendChild(b);
    }
}
window._finalNext = function () {
    const f = window.guide && window.guide.final;
    if (!f || !f.active) return;
    f.idx++;
    _playFinalStep();
};
function _endFinalTour() {
    const f = window.guide && window.guide.final;
    if (f) { f.active = false; f.loopActive = false; }
    const box = document.getElementById('guide-dialog');
    if (box) box.style.display = 'none';
    if (typeof window.guideFocusClear === 'function') window.guideFocusClear();
    if (typeof window.finishGuide === 'function') window.finishGuide();

    // 🎉 Celebraciones finales: Boba (nuevo compañero) y luego 1000 Argons
    setTimeout(function () {
        if (typeof window.showCelebration !== 'function') return;
        const compTitle = (typeof t === 'function') ? t('guide.compTitle') : 'TU NUEVO COMPAÑERO';
        const compName = (typeof t === 'function') ? t('guide.compName') : 'Boba';
        window.showCelebration(compTitle, compName, 'items/companions/boba.png', function () {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                try { window.ws.send(MessagePack.encode({ type: 'claim_guide_reward' })); } catch (e) { }
            }
            setTimeout(function () {
                const rwTitle = (typeof t === 'function') ? t('guide.rewardTitle') : 'REGALO POR COMPLETAR LA GUÍA';
                window.showCelebration(rwTitle, '1000 Argons', 'items/icons/aargon-green.png', null);
            }, 500);
        });
    }, 700);
}
window._guideFinalTick = function () {
    const f = window.guide && window.guide.final;
    if (!f || !f.active || !f.loopActive) return;
    const now = Date.now();
    if (!f.loopNextAt) f.loopNextAt = now + 3000;
    if (now >= f.loopNextAt) {
        f.loopIdx++;
        f.loopNextAt = now + 3000;
        _applyBaseLoopFocus();
    }
};

// 🗨️ Caja de diálogo retro (Boba). text = frase; audioUrl = opcional para voz/sonido.
let _guideTypeTimer = null;
function typeGuideText(text, audioUrl) {
    const el = document.getElementById('guide-text');
    if (!el) return;
    if (_guideTypeTimer) clearInterval(_guideTypeTimer);
    if (audioUrl && typeof playSound === 'function') playSound(audioUrl, 0.8);
    el.textContent = '';
    let i = 0;
    _guideTypeTimer = setInterval(() => {
        el.textContent += text[i++] || '';
        // blip retro sutil cada 2 letras
        if (i % 2 === 0 && typeof playUISound === 'function') playUISound('click');
        if (i > text.length) { clearInterval(_guideTypeTimer); _guideTypeTimer = null; }
    }, 30);
}
window._guideShowOptions = function (opts) {
    const wrap = document.getElementById('guide-options');
    if (!wrap) return;
    wrap.innerHTML = '';
    opts.forEach(o => {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.style.cssText = 'background: linear-gradient(135deg,#d1383b,#c7734a); border:none; color:#fff; font-family:inherit; font-size:19px; padding:8px 24px; border-radius:8px; cursor:pointer; font-weight:bold; box-shadow:0 3px 0 rgba(0,0,0,0.4);';
        b.onclick = () => window.guideAnswer(o.value);
        wrap.appendChild(b);
    });
};
// 📜 Líneas del guía. Encadena con `next`. Añade `audio` por línea si luego quieres voz.
window.GUIDE_LINES = window.GUIDE_LINES || {
    intro: {
        textKey: 'guide.intro', audio: null, next: 'identity',
        options: [
            { labelKey: 'guide.opt.yes', value: 'yes' },
            { labelKey: 'guide.opt.no', value: 'no' },
            { labelKey: 'guide.opt.both', value: 'both' }
        ]
    },
    identity: { textKey: 'guide.identity', audio: null, next: 'money' },
    money: { textKey: 'guide.money', audio: null, next: 'follow' },
    follow: { textKey: 'guide.follow', audio: null, next: null }, // fin del diálogo -> comienza a caminar
    arrival: { textKey: 'guide.arrival', audio: null, next: null, focus: { x: -134, y: 82, zoom: 3 }, waitItem: 'trash_picker' }, // al llegar al yonke
    trash_hunt: { textKey: 'guide.trashHunt', audio: null, next: null, startTrash: true }, // cuando ya compró el trash_picker
    trash_return: { textKey: 'guide.trashReturn', audio: null, next: null }, // al juntar 10 basuras
    junkyard_help: { textKey: 'guide.junkyardHelp', audio: null, next: null }, // al abrir el modal del yonke
    gunshop_intro: { textKey: 'guide.gunshopIntro', audio: null, next: null }, // tras vender: ir a la tienda
    buy_melee: { textKey: 'guide.buyMelee', audio: null, next: null } // al entrar a la tienda
};

// 🎥 Enfocar la cámara a una tile (para resaltar algo del mapa)
// Zoom "normal" que había antes de cualquier enfoque de la guía (para restaurarlo siempre)
function _guideNormalZoomValue() {
    if (typeof window._guideNormalZoom === 'number') return window._guideNormalZoom;
    const prev = window.camFocus;
    if (prev && prev.active && typeof prev.baseZoom === 'number') return prev.baseZoom;
    return (typeof zoomLevel !== 'undefined') ? zoomLevel : 2;
}
window.guideFocusTo = function (tileX, tileY, zoom) {
    const tx = tileX * 16 + 8, ty = tileY * 16 + 8;
    const prev = window.camFocus;
    const same = !!(prev && prev.active && prev.x === tx && prev.y === ty);
    window.camFocus = {
        active: true,
        x: tx, y: ty,
        zoom: zoom || 3,
        baseZoom: _guideNormalZoomValue() // conserva el zoom normal, NO el transitorio
    };
    if (!same) {
        // ✨ pulso de zoom cada vez que cambia el enfoque (animación)
        zoomLevel = Math.max(1.6, (zoom || 3) - 0.9);
    }
    window.camReturn = false;
};
// Foco por coordenadas de MUNDO (píxeles), para interiores/zonas lejanas
window.guideFocusWorld = function (worldX, worldY, zoom) {
    window.camFocus = { active: true, x: worldX, y: worldY, zoom: zoom || 3, baseZoom: _guideNormalZoomValue() };
    window.camReturn = false;
};
window.guideFocusClear = function () {
    window.camReturnZoom = _guideNormalZoomValue();
    if (window.camFocus) window.camFocus.active = false;
    window.camReturn = true; // regresa suave al jugador (y al zoom original)
    window.camReturnT = 0;
};

// 📍 Destino del guide en COORDENADAS DE TILE (como el coord-helper del editor).
window.GUIDE_WALK_TILE = window.GUIDE_WALK_TILE || { x: -128, y: 93 };
try { const _gt = localStorage.getItem('aargon_guide_target'); if (_gt) window.GUIDE_WALK_TILE = JSON.parse(_gt); } catch (e) { }
const _guideTileToWorld = (t) => ({ x: t.x * 16 + 8, y: t.y * 16 + 8 });
// Desde consola:  setGuideTarget(-128, 93)  -> fija el tile destino y lo recuerda
window.setGuideTarget = function (x, y) {
    window.GUIDE_WALK_TILE = { x: Number(x) || 0, y: Number(y) || 0 };
    try { localStorage.setItem('aargon_guide_target', JSON.stringify(window.GUIDE_WALK_TILE)); } catch (e) { }
    console.log('[guide] destino tile =', window.GUIDE_WALK_TILE, '-> world =', _guideTileToWorld(window.GUIDE_WALK_TILE));
};

// Arranca el caminar del guía hacia el objetivo
window.startGuideWalk = function (target, onArrive, holdAtEnd) {
    const tile = window.GUIDE_WALK_TILE || { x: -128, y: 93 };
    const tgt = target || _guideTileToWorld(tile);
    const st = (typeof player !== 'undefined' && player && player._compStates && player._compStates[0]) ? player._compStates[0] : null;
    const startX = st ? st.wx : (typeof player !== 'undefined' ? player.worldX + 22 : 0);
    const startY = st ? st.wy : (typeof player !== 'undefined' ? player.worldY : 0);
    // 🧭 Calcular ruta con A* (rodea paredes)
    let path = null;
    try { path = _guideFindPathAuto(startX, startY, tgt.x, tgt.y); } catch (e) { path = null; }
    window.guide = window.guide || {};
    window.guide.walk = {
        active: true,
        tx: tgt.x, ty: tgt.y,
        bx: startX, by: startY,
        path: path, pathIdx: 0,
        waitStart: 0,
        hurryShown: false,
        onArrive: (typeof onArrive === 'function') ? onArrive : null,
        holdAtEnd: !!holdAtEnd,
        stuckX: startX, stuckY: startY, stuckT: Date.now()
    };
    window.cinematicLock = false;
};

// Diálogo transitorio "¡oye, date prisa!"
window.showGuideHurry = function () {
    const box = document.getElementById('guide-dialog');
    if (!box) return;
    box.style.display = 'block';
    typeGuideText((typeof t === 'function') ? t('guide.hurry') : "Hey hey, let's hurry!");
    const wrap = document.getElementById('guide-options');
    if (wrap) wrap.innerHTML = '';
    clearTimeout(window._guideHurryTimer);
    window._guideHurryTimer = setTimeout(() => { if (box) box.style.display = 'none'; }, 2500);
};

window._guideCurrent = null;
window.playGuideLine = function (id) {
    const line = (window.GUIDE_LINES || {})[id];
    if (!line) { window._guideEndDialogue(); return; }
    window._guideCurrent = id;
    const tx = (line.textKey && typeof t === 'function') ? t(line.textKey) : (line.text || '');
    typeGuideText(tx, line.audio);
    if (line.focus && typeof window.guideFocusTo === 'function') window.guideFocusTo(line.focus.x, line.focus.y, line.focus.zoom);
    if (line.options && line.options.length) {
        window._guideShowOptions(line.options.map(o => ({
            label: (o.labelKey && typeof t === 'function') ? t(o.labelKey) : o.label,
            value: o.value
        })));
    } else {
        // Sin opciones -> botón Next (o Fin si es la última)
        window._guideShowOptions([{ label: (typeof t === 'function') ? t('guide.next') : 'Next', value: (line.next ? '__next' : '__end') }]);
    }
};
window._guideEndDialogue = function () {
    const box = document.getElementById('guide-dialog');
    if (box) box.style.display = 'none';
    const line = (window.GUIDE_LINES || {})[window._guideCurrent] || {};
    if (line.waitItem && window.guide) window.guide.waitingForItem = line.waitItem;
    if (typeof window.guideFocusClear === 'function') window.guideFocusClear();
    if (window.guide) {
        window.guide.answered = true; // hace zoom out (no marca "done")
        if (window._guideCurrent === 'follow') window.guide.startWalkAfter = true; // solo tras 'follow' camina
    }
    if (window._guideCurrent === 'arrival' && window.guide) window.guide.hold = null; // libera a Boba al cerrar la charla
    // Tras el diálogo de "sígueme" al yonke -> caminar a vender
    if (window._guideCurrent === 'trash_return' && window.guide) {
        window.startGuideWalk({ x: -136 * 16 + 8, y: 93 * 16 + 8 }, function () { /* el jugador debe pisar el tile */ }, true);
    }
    // Tras el diálogo de intro a la tienda -> caminar a la puerta
    if (window._guideCurrent === 'gunshop_intro') setTimeout(function () { if (typeof window.startGunshopDoor === 'function') window.startGunshopDoor(); }, 200);
    // Tras el diálogo de compra -> zoom out (ya lo hace guideFocusClear) + glow en el ítem
    if (window._guideCurrent === 'buy_melee' && window.guide) window.guide.itemGlow = { tx: 50992, ty: 50995 };
    if (line.startTrash) setTimeout(function () { if (typeof window.startTrashHunt === 'function') window.startTrashHunt(); }, 300);
};
window.showGuideDialogue = function () {
    const box = document.getElementById('guide-dialog');
    if (!box) return;
    box.style.display = 'block';
    window.playGuideLine('intro');
};
window.guideAnswer = function (val) {
    const line = (window.GUIDE_LINES || {})[window._guideCurrent] || {};
    const nextId = line.next || null;
    const wrap = document.getElementById('guide-options');

    // Opción de la intro: muestra reacción y luego avanza a la siguiente línea
    if (val === 'yes' || val === 'no' || val === 'both') {
        const reactionKey = { yes: 'guide.reply.yes', no: 'guide.reply.no', both: 'guide.reply.both' }[val];
        typeGuideText((typeof t === 'function') ? t(reactionKey) : 'Okay!');
        if (wrap) wrap.innerHTML = '';
        setTimeout(() => window.playGuideLine(nextId), 1500);
        return;
    }

    // Next / End
    if (val === '__next' && nextId) { window.playGuideLine(nextId); return; }
    window._guideEndDialogue();
};

// 🧱 Colisión para el guía (usa el worldMap + bases, igual que el jugador)
function guideCollides(x, y) {
    if (typeof worldMap === 'undefined' || typeof getMapKey !== 'function') return false;
    const gx = Math.floor(x / 16), gy = Math.floor(y / 16);
    for (let l = 0; l <= 15; l++) {
        const t = worldMap.get(getMapKey(gx, gy, l));
        if (t && t.hasCollision) return true;
    }
    const bases = (typeof getAllTurfBases === 'function') ? getAllTurfBases() : (window.centralBase ? [window.centralBase] : []);
    for (let i = 0; i < bases.length; i++) {
        const b = bases[i];
        if (!b) continue;
        const bx = b.worldX + (b.hitboxOffsetX || 0), by = b.worldY + (b.hitboxOffsetY || 0);
        const hw = (b.hitboxW || 32) / 2, hh = (b.hitboxH || 32) / 2;
        if (x >= bx - hw && x <= bx + hw && y >= by - hh && y <= by + hh) return true;
    }
    return false;
}
// 🧭 Un paso hacia el objetivo evitando obstáculos (elige el primer ángulo libre)
function guideStep(cx, cy, tx, ty, speed) {
    const baseAng = Math.atan2(ty - cy, tx - cx);
    const tries = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.5, -2.5, Math.PI];
    for (let i = 0; i < tries.length; i++) {
        const a = baseAng + tries[i];
        const nx = cx + Math.cos(a) * speed;
        const ny = cy + Math.sin(a) * speed;
        if (!guideCollides(nx, ny)) return { x: nx, y: ny, dx: nx - cx, dy: ny - cy };
    }
    return null; // bloqueado por todos lados
}

// 🧭 A* sobre el grid de tiles (ventana acotada) para rodear paredes
// ¿Hay línea libre (sin colisión) entre dos puntos de mundo? (para suavizar la ruta)
function _guideLineClear(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (guideCollides(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
}

function guideFindPath(startX, startY, goalX, goalY, maxTiles) {
    const TS = 16;
    const sx = Math.floor(startX / TS), sy = Math.floor(startY / TS);
    const gx = Math.floor(goalX / TS), gy = Math.floor(goalY / TS);
    if (sx === gx && sy === gy) return [{ x: goalX, y: goalY }];
    const R = maxTiles || 60;
    const key = (x, y) => x + ',' + y;
    const wcache = new Map();
    const walkable = (x, y) => {
        const k = x + ',' + y;
        let v = wcache.get(k);
        if (v === undefined) { v = !guideCollides(x * TS + 8, y * TS + 8); wcache.set(k, v); }
        return v;
    };

    const open = [{ x: sx, y: sy, g: 0, f: Math.abs(gx - sx) + Math.abs(gy - sy) }];
    const came = new Map(); came.set(key(sx, sy), null);
    const gScore = new Map(); gScore.set(key(sx, sy), 0);
    const closed = new Set();
    const N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let found = false, guard = 0;

    while (open.length && guard < 60000) {
        guard++;
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
        const cur = open.splice(bi, 1)[0];
        const ck = key(cur.x, cur.y);
        if (cur.x === gx && cur.y === gy) { found = true; break; }
        if (closed.has(ck)) continue;
        closed.add(ck);
        for (let n = 0; n < N.length; n++) {
            const nx = cur.x + N[n][0], ny = cur.y + N[n][1];
            if (Math.abs(nx - sx) > R || Math.abs(ny - sy) > R) continue;
            const nk = key(nx, ny);
            if (closed.has(nk)) continue;
            const isGoal = (nx === gx && ny === gy);
            if (!isGoal && !walkable(nx, ny)) continue;
            const diag = (N[n][0] !== 0 && N[n][1] !== 0);
            // no cortar esquinas en diagonal
            if (diag && (!walkable(cur.x + N[n][0], cur.y) || !walkable(cur.x, cur.y + N[n][1]))) continue;
            const stepCost = diag ? 1.4142 : 1;
            const ng = cur.g + stepCost;
            if (gScore.has(nk) && ng >= gScore.get(nk)) continue;
            gScore.set(nk, ng);
            came.set(nk, cur);
            const ddx = Math.abs(gx - nx), ddy = Math.abs(gy - ny);
            const hCost = (ddx + ddy) + (1.4142 - 2) * Math.min(ddx, ddy); // octile
            open.push({ x: nx, y: ny, g: ng, f: ng + hCost });
        }
    }
    if (!found) return null;
    const path = [];
    let cur = { x: gx, y: gy };
    while (cur) {
        path.push({ x: cur.x * TS + 8, y: cur.y * TS + 8 });
        cur = came.get(key(cur.x, cur.y));
    }
    path.reverse();
    if (path.length) path.shift(); // quitar el tile de inicio
    // Suavizado (string pulling): salta waypoints si la línea directa está libre -> diagonales suaves
    if (path.length >= 2) {
        const smoothed = [path[0]];
        let anchor = 0;
        for (let i = 1; i < path.length; i++) {
            const isLast = (i === path.length - 1);
            if (isLast || !_guideLineClear(path[anchor].x, path[anchor].y, path[i + 1].x, path[i + 1].y)) {
                smoothed.push(path[i]);
                anchor = i;
            }
        }
        return smoothed;
    }
    return path;
}

// Busca ruta probando ventanas cada vez más grandes (por si el destino está lejos)
function _guideFindPathAuto(sx, sy, gx, gy) {
    const tries = [60, 140, 260];
    for (let i = 0; i < tries.length; i++) {
        const p = guideFindPath(sx, sy, gx, gy, tries[i]);
        if (p) return p;
    }
    return null;
}

// 🐾 Compañeros: siguen detrás al dueño; si está quieto, hacen free-roam en un radio cercano.
// Soporta hasta 3. Sprite 128x128 = 4 filas (0 abajo, 1 izq, 2 der, 3 arriba) x 4 frames de 32x32.
function drawCompanionSprite(ctx, owner, ownerScreenX, ownerScreenY, zoom) {
    let list = Array.isArray(owner.companions) ? owner.companions.filter(Boolean) : [];
    if (list.length === 0 && owner.equipped && owner.equipped.companion && owner.equipped.companion !== 'none') {
        list = [owner.equipped.companion];
    }
    if (list.length === 0) return;
    if (!owner._compStates) owner._compStates = [];

    const now = Date.now();
    const offs = [[0, -24], [24, 0], [-24, 0], [0, 24]];
    const ownerDir = Math.max(0, Math.min(3, owner.frameY || 0));
    const ow = owner.worldX, oh = owner.worldY; // 🎯 todo en coordenadas de MUNDO
    const cinematic = (owner === player) && window.guide && window.guide.phase !== 'idle';
    const gw = (owner === player && window.guide) ? window.guide.walk : null;
    const walking = !!(gw && gw.active);
    const holding = (owner === player) && !!(window.guide && window.guide.hold);

    // 🚶 Movimiento del guía (solo para tu compañero): sigue la ruta A* (rodea paredes)
    if (walking) {
        const speed = 2.2;
        const distToPlayer = Math.hypot(ow - gw.bx, oh - gw.by);
        const distToTarget = Math.hypot(gw.tx - gw.bx, gw.ty - gw.by);
        const nowMs = Date.now();

        // Punto objetivo actual (waypoint de la ruta si existe)
        let wx = gw.tx, wy = gw.ty;
        if (gw.path && gw.path.length) {
            if (gw.pathIdx === undefined) gw.pathIdx = 0;
            if (gw.pathIdx < gw.path.length) {
                wx = gw.path[gw.pathIdx].x;
                wy = gw.path[gw.pathIdx].y;
                if (Math.hypot(wx - gw.bx, wy - gw.by) < 7) gw.pathIdx++;
            }
        }

        if (distToTarget < 10) {
            gw.active = false;
            // Si debe quedarse parado en el destino (hold)
            if (gw.holdAtEnd) window.guide.hold = { x: gw.tx, y: gw.ty };
            if (typeof gw.onArrive === 'function') {
                const _f = gw.onArrive; gw.onArrive = null; _f();
            } else {
                const box = document.getElementById('guide-dialog');
                if (box) box.style.display = 'block';
                if (typeof window.playGuideLine === 'function') window.playGuideLine('arrival');
            }
        } else if (distToPlayer > 220) {
            // Radio de seguimiento amplio: solo espera si te alejas MUCHO
            if (!gw.waitStart) gw.waitStart = nowMs;
            if ((nowMs - gw.waitStart) > 5000 && !gw.hurryShown) {
                gw.hurryShown = true;
                if (typeof window.showGuideHurry === 'function') window.showGuideHurry();
            }
            gw.mdx = 0; gw.mdy = 0;
        } else {
            if (gw.waitStart && distToPlayer < 170) { gw.waitStart = 0; gw.hurryShown = false; }
            if (!gw.waitStart) {
                const step = guideStep(gw.bx, gw.by, wx, wy, speed);
                if (step) {
                    gw.bx = step.x; gw.by = step.y;
                    gw.mdx = step.dx; gw.mdy = step.dy;
                } else {
                    gw.mdx = 0; gw.mdy = 0;
                }
                // 🛑 Detector de atascado -> recalcular ruta
                if (Math.hypot(gw.bx - (gw.stuckX || gw.bx), gw.by - (gw.stuckY || gw.by)) > 2) {
                    gw.stuckX = gw.bx; gw.stuckY = gw.by; gw.stuckT = nowMs;
                } else if (nowMs - (gw.stuckT || nowMs) > 2500) {
                    try {
                        const p = _guideFindPathAuto(gw.bx, gw.by, gw.tx, gw.ty);
                        gw.path = p; gw.pathIdx = 0;
                    } catch (e) { }
                    gw.stuckT = nowMs; gw.stuckX = gw.bx; gw.stuckY = gw.by;
                }
            }
        }
    }

    for (let i = 0; i < list.length; i++) {
        const img = window.loadedItemSprites && window.loadedItemSprites[list[i]];
        if (!img || !img.complete || img.naturalWidth === 0) continue;
        const st = owner._compStates[i] || (owner._compStates[i] = {});
        const spread = i * 18; // separa varios compañeros

        let twx, twy; // objetivo en mundo
        if (owner.isMoving) {
            const off = offs[ownerDir];
            const px = off[1] !== 0 ? (i % 2 === 0 ? 1 : -1) : 0;
            const py = off[0] !== 0 ? (i % 2 === 0 ? 1 : -1) : 0;
            twx = ow + off[0] + px * spread;
            twy = oh + off[1] + py * spread;
            st.idleSince = now;
            st.roamTarget = null;
        } else {
            if (!st.idleSince) st.idleSince = now;
            if (now - st.idleSince > 900) {
                if (!st.roamTarget || now > (st.roamUntil || 0)) {
                    // Elegir un destino de free-roam que NO esté en pared
                    let _tx, _ty, _tries = 0;
                    do {
                        const ang = Math.random() * Math.PI * 2;
                        const rad = 20 + Math.random() * 18;
                        _tx = ow + Math.cos(ang) * rad;
                        _ty = oh + Math.sin(ang) * rad;
                        _tries++;
                    } while (guideCollides(_tx, _ty) && _tries < 10);
                    st.roamTarget = { x: _tx, y: _ty };
                    st.roamUntil = now + 1200 + Math.random() * 1800;
                }
                twx = st.roamTarget.x; twy = st.roamTarget.y;
            } else {
                twx = (st.wx !== undefined) ? st.wx : ow;
                twy = (st.wy !== undefined) ? st.wy : (oh - 20 - i * 14);
            }
        }

        // 🎬 Durante la cinemática, Boba se coloca al lado derecho mirando al jugador
        // 🚶 Durante el walk, Boba va hacia el destino (guiando)
        let forceFace = null;
        if (holding && i === 0) {
            // 🛑 Boba se queda parado en el punto (hasta el trigger)
            twx = window.guide.hold.x; twy = window.guide.hold.y;
        }
        else if (cinematic && i === 0) { twx = ow + 22; twy = oh; forceFace = 1; }
        else if (walking && i === 0) {
            twx = gw.bx; twy = gw.by;
            const mdx = (gw.mdx !== undefined) ? gw.mdx : (gw.tx - gw.bx);
            const mdy = (gw.mdy !== undefined) ? gw.mdy : (gw.ty - gw.by);
            if (Math.abs(mdx) > 0.2 || Math.abs(mdy) > 0.2) {
                forceFace = (Math.abs(mdx) >= Math.abs(mdy)) ? (mdx >= 0 ? 2 : 1) : (mdy >= 0 ? 0 : 3);
            }
        }

        if (st.wx === undefined) { st.wx = twx; st.wy = twy; }
        const idleRoam = (!owner.isMoving && !cinematic && !walking && !holding);
        if (idleRoam) {
            // 🧱 Free-roam con colisión (sin noclip): avanza si no choca, si choca elige otro destino
            let ddx = twx - st.wx, ddy = twy - st.wy;
            const dd = Math.hypot(ddx, ddy);
            if (dd > 0.4) {
                const sl = Math.min(1.2, dd);
                const nx = st.wx + (ddx / dd) * sl;
                const ny = st.wy + (ddy / dd) * sl;
                if (!guideCollides(nx, ny)) { st.wx = nx; st.wy = ny; }
                else { st.roamTarget = null; st.roamUntil = 0; }
            }
        } else {
            const lerp = holding ? 0.3 : (cinematic ? 0.25 : (walking ? 1 : (owner.isMoving ? 0.16 : 0.06)));
            st.wx += (twx - st.wx) * lerp;
            st.wy += (twy - st.wy) * lerp;
        }

        // 🧱 El dueño es "pared": nunca atravesarlo (mínima separación en mundo)
        const minDist = 16;
        let ox = ow - st.wx, oy = oh - st.wy;
        let od = Math.hypot(ox, oy);
        if (od < minDist && od > 0.001) { st.wx = ow - (ox / od) * minDist; st.wy = oh - (oy / od) * minDist; }

        // Dirección: al caminar mira como el dueño; en free-roam mira hacia donde va
        let cdir = ownerDir;
        if (!owner.isMoving) {
            const dxv = twx - st.wx, dyv = twy - st.wy;
            if (Math.abs(dxv) > 0.5 || Math.abs(dyv) > 0.5) {
                if (Math.abs(dxv) >= Math.abs(dyv)) cdir = dxv >= 0 ? 2 : 1;
                else cdir = dyv >= 0 ? 0 : 3;
            }
        }
        if (forceFace !== null) cdir = forceFace;

        // Mundo -> pantalla (anclado al dueño, así la cámara no lo arrastra)
        const sx = Math.floor(ownerScreenX + (st.wx - ow) * zoom);
        const sy = Math.floor(ownerScreenY + (st.wy - oh) * zoom);

        const FRAME = 32;
        const cols = Math.max(1, Math.floor(img.naturalWidth / FRAME));
        const rows = Math.max(1, Math.floor(img.naturalHeight / FRAME));
        const row = Math.min(cdir, rows - 1);
        const frame = Math.floor((now + i * 180) / 120) % cols;
        const size = FRAME * zoom;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, frame * FRAME, row * FRAME, FRAME, FRAME,
            sx - Math.floor(size / 2), sy - Math.floor(size / 2), size, size);
    }
}

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
    else if (logicTile.triggerType === 'discovery') {
        if (!isDiscoveryOpen && lastDiscoveryTile !== tileKey) {
            openDiscoveryModal();
            lastDiscoveryTile = tileKey;
        }
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
    if (ws && ws.readyState === WebSocket.OPEN) {
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
const FPS_TARGET = 60;
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
        ctx.shadowBlur = blur;
        ctx.shadowColor = color || 'transparent';
    }
}

function _real_update(currentTime) {
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

    // 🎬 CINEMÁTICA DE GUÍA (Boba): zoom in -> mirada -> zoom out
    if (window.guide && window.guide.phase !== 'idle') {
        const g = window.guide;
        const gp = performance.now();
        const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        if (g.phase === 'zoom') {
            const pr = Math.min(1, (gp - g.t0) / 1200);
            zoomLevel = g.baseZoom + (g.targetZoom - g.baseZoom) * ease(pr);
            if (pr >= 1) {
                g.phase = 'hold'; g.t0 = gp; g.answered = false;
                if (typeof window.showGuideDialogue === 'function') window.showGuideDialogue();
            }
        } else if (g.phase === 'hold') {
            zoomLevel = g.targetZoom;
            if (g.answered) { g.phase = 'out'; g.t0 = gp; }
        } else if (g.phase === 'out') {
            const pr = Math.min(1, (gp - g.t0) / 1000);
            zoomLevel = g.targetZoom + (g.baseZoom - g.targetZoom) * ease(pr);
            if (pr >= 1) {
                zoomLevel = g.baseZoom; g.phase = 'idle'; window.cinematicLock = false;
                if (g.startWalkAfter) { g.startWalkAfter = false; if (typeof window.startGuideWalk === 'function') window.startGuideWalk(null, null, true); }
            }
        }
    }


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

        /* Analizar si el dispositivo se está ahogando
        if (currentTime - lastResolutionCheck > 3000 && fpsHistory.length === 3) {
            const avgFps = (fpsHistory[0] + fpsHistory[1] + fpsHistory[2]) / 3;

            // Si el promedio cae por debajo de 40 FPS, encogemos los gráficos internos
            if (avgFps < 40 && dynamicRenderScale > 0.5) {
                dynamicRenderScale -= 0.25; // Baja al 75%, luego al 50% si es necesario
                resize(); // Detonar el recálculo al instante

                spawnDamageText(player.worldX, player.worldY, "Optimizando", true);

                fpsHistory = []; // Reset para darle tiempo al celular de respirar
                lastResolutionCheck = currentTime + 2000; // Extra cooldown de gracia
            }
            lastResolutionCheck = currentTime;
        }
        */
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
        player.isSwimming = false;
        const gX = Math.floor(player.worldX / TILE_SIZE);
        const gY = Math.floor(player.worldY / TILE_SIZE);
        for (let l = 15; l >= 0; l--) {
            const t = worldMap.get(getMapKey(gX, gY, l));
            if (t && t.isSit) {
                player.isSitting = true;
                break;
            }
        }
        if (!player.isSitting) {
            for (let l = 15; l >= 0; l--) {
                const t = worldMap.get(getMapKey(gX, gY, l));
                if (t && t.isSwim) {
                    player.isSwimming = true;
                    break;
                }
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
    let renderWorldX = player.worldX;
    let renderWorldY = player.worldY;

    // 🎥 Enfoque de cámara (guide): centra la cámara EXACTO en el objetivo (ignora al jugador)
    if (window.camFocus && window.camFocus.active) {
        const cf = window.camFocus;
        renderWorldX = cf.x;   // dead center en la tile (no sigue al jugador ni a WASD)
        renderWorldY = cf.y;
        // Solo el zoom se anima (al cambiar de enfoque guideFocusTo lo baja y aquí sube suave)
        if (typeof cf.zoom === 'number') zoomLevel += (cf.zoom - zoomLevel) * 0.15;
    } else if (window.camReturn) {
        // Regreso suave al jugador + restauración del zoom (máx ~0.5s)
        renderWorldX += (player.worldX - renderWorldX) * 0.15;
        renderWorldY += (player.worldY - renderWorldY) * 0.15;
        if (typeof window.camReturnZoom === 'number') zoomLevel += (window.camReturnZoom - zoomLevel) * 0.15;
        window.camReturnT = (window.camReturnT || 0) + 1;
        if (Math.hypot(player.worldX - renderWorldX, player.worldY - renderWorldY) < 8 || window.camReturnT > 30) {
            window.camReturn = false; window.camReturnT = 0;
            renderWorldX = player.worldX; renderWorldY = player.worldY;
            if (typeof window.camReturnZoom === 'number') { zoomLevel = window.camReturnZoom; window.camReturnZoom = null; }
        }
    }

    // 🗑️ Guide: esperando que el jugador compre el ítem clave
    if (window.guide && window.guide.waitingForItem) {
        const _needed = window.guide.waitingForItem;
        if (player && Array.isArray(player.inventory) && player.inventory.some(i => ((typeof i === 'object' && i) ? i.id : i) === _needed)) {
            window.guide.waitingForItem = null;
            window.guide.buyPickerTipped = false;
            window.guide.pickerStep = 0;
            window.guide.buyPickerDone = false;
            const box = document.getElementById('guide-dialog');
            if (box) box.style.display = 'none';
            // El tutorial de equipar arranca cuando cierre la celebración de compra (ver abajo)
            window.guide.pendingEquipTutorial = true;
        } else {
            // 🛒 Tienda del ítem clave: primero presentar la ventana, luego el botón Comprar
            const _sm = document.getElementById('shop-modal');
            const _smOpen = _sm && _sm.style.display !== 'none';
            const _celeb = document.getElementById('purchase-celebration');
            const _celebOpen = _celeb && _celeb.style.display !== 'none';
            if (!window.guide.pickerStep) window.guide.pickerStep = 0;

            if (!_smOpen || _celebOpen) {
                // Tienda cerrada o comprando: limpiar
                if (window.guide.buyPickerTipped || window.guide.pickerStep || window.guide.buyPickerDone) {
                    window.guide.buyPickerTipped = false;
                    window.guide.pickerStep = 0;
                    window.guide.buyPickerDone = false;
                    guideTipHide();
                }
            } else if (!window.guide.buyPickerDone) {
                if (window.guide.pickerStep === 0) {
                    if (!window.guide.buyPickerTipped) {
                        window.guide.buyPickerTipped = true;
                        guideTip(
                            (typeof t === 'function') ? t('guide.pickerWindow') : 'This is the purchase window.',
                            '#shop-panel', null,
                            {
                                text: (typeof t === 'function') ? t('guide.next') : 'Next',
                                onClick: function () {
                                    window.guide.pickerStep = 1;
                                    window.guide.buyPickerTipped = false; // forzar el siguiente tip
                                }
                            }
                        );
                    }
                } else if (!window.guide.buyPickerTipped) {
                    window.guide.buyPickerTipped = true;
                    guideTip((typeof t === 'function') ? t('guide.buyPickerBtn') : 'Press Buy to acquire it.', '#buy-item-btn');
                } else {
                    guidePointerTo('#buy-item-btn');
                }
            }
        }
    }
    // Si hay una celebración de compra abierta, esperar a que se cierre antes del tutorial
    if (window.guide && window.guide.pendingEquipTutorial) {
        const _celeb = document.getElementById('purchase-celebration');
        const _celebOpen = _celeb && _celeb.style.display !== 'none';
        if (!_celebOpen) {
            window.guide.pendingEquipTutorial = false;
            // Ahora el tutorial VISUAL de equipar (mochila -> slot -> inventario -> equipar)
            if (typeof window.startEquipTutorial === 'function') window.startEquipTutorial();
        }
    }
    // 🎓 Avanza el tutorial visual de equipar segun los modales abiertos
    if (typeof window._equipTutTick === 'function') window._equipTutTick();
    if (typeof window._trashTick === 'function') window._trashTick();
    if (typeof window._sellTutTick === 'function') window._sellTutTick();
    if (typeof window._guideFlowTick === 'function') window._guideFlowTick();
    if (typeof window._guideTeleportTick === 'function') window._guideTeleportTick();
    if (typeof window._guideFinalTick === 'function') window._guideFinalTick();

    // Centro de pantalla en píxeles CSS enteros
    const screenCenterX = Math.floor(cachedScreenWidth / 2);
    const screenCenterY = Math.floor(cachedScreenHeight / 2);
    // --- NEW: SLIDING COLLISION CHECK ---
    const checkWall = (x, y) => {
        if (window.adminNoclip) return false;
        // 👇 NUEVO: COLISIÓN LOCAL DE LA BASE (Mismo código que en el servidor) 👇
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
    const isColliding = checkWall; // alias historico usado por el movimiento
    const playerCollides = (x, y) => {
        const hx = 5, hy = 5, oy = 3;
        return isColliding(x - hx, y - hy + oy) || isColliding(x + hx, y - hy + oy) ||
            isColliding(x - hx, y + hy + oy) || isColliding(x + hx, y + hy + oy);
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

    // 🎬 Bloqueo durante la cinemática de guía
    if (window.cinematicLock) {
        player.vx = 0; player.vy = 0; player.isMoving = false; isShooting = false;
    }

    /// --- CONTROLES HÍBRIDOS (MOUSE + TOUCH) ---
    if (!player.isDead && !window.cinematicLock) {

        // 🛑 EL FIX: SISTEMA DE HIT-STOP SUAVE (SIN JITTER) 🛑
        let speedMult = 1;
        let mountSpeedBonus = 0;
        
        if (player.equippedWeapon !== "none") {
            const mItem = window.getCatalogData ? window.getCatalogData(player.equippedWeapon) : null;
            if (mItem && mItem.category === 'mount' && !player.isSwimming) {
                mountSpeedBonus = Number(mItem.speedBonus) || 2; // +2 de velocidad base por montura
            }
        }
        
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
                    player.vx = moveX * ((player.speed + mountSpeedBonus) * speedMult) * dtScale;
                    player.vy = moveY * ((player.speed + mountSpeedBonus) * speedMult) * dtScale;
                    player.isMoving = true;
                } else {
                    player.vx = 0; player.vy = 0; player.isMoving = false;
                }
            } else {
                // 📱 MOVIMIENTO INSTANTÁNEO 1:1 (Sin aceleración ni retraso)
                player.vx = (player.joyX || 0) * ((player.speed + mountSpeedBonus) * speedMult) * dtScale;
                player.vy = (player.joyY || 0) * ((player.speed + mountSpeedBonus) * speedMult) * dtScale;
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

                if (isMouseDown && !window.__tileClickSuppress) {
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
            // 🧱 UGC: hook de tile script al ENTRAR al tile (una vez; no re-dispara parado encima)
            if (logicTile.scriptId && typeof sendTileInteract === 'function') {
                try {
                    if (window.__lastScriptTile !== currentTileKey) {
                        window.__lastScriptTile = currentTileKey;
                        sendTileInteract(currentGridX, currentGridY, 15, 'step');
                    }
                } catch (e) {}
            }
        } else {
            if (lastShopTile !== currentTileKey && !isShopOpen) lastShopTile = null;
            if (lastDiscoveryTile !== currentTileKey && !isDiscoveryOpen) lastDiscoveryTile = null;
            if (lastJunkyardTile !== currentTileKey && !isJunkyardOpen) lastJunkyardTile = null;
            if (lastJewelerTile !== currentTileKey && !isJewelerOpen) lastJewelerTile = null; // 👈 AÑADE ESTO
            // 🧱 UGC: al salir del tile con script, liberar para que re-entrar dispare de nuevo
            if (window.__lastScriptTile && window.__lastScriptTile !== currentTileKey) {
                window.__lastScriptTile = null;
            }
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

    // TEXTO DE ZONA: fade in al cambiar, 10s visible, fade out (sin pill)
    if (safeZoneUI) {
        if (window.__lastSafeState !== player.inSafeZone) {
            window.__lastSafeState = player.inSafeZone;
            const szText = document.getElementById('safezone-text');
            const szDesc = document.getElementById('safezone-desc');
            const szIcon = document.getElementById('safezone-icon');
            if (szText) {
                szText.innerText = player.inSafeZone ? 'ZONA SEGURA' : 'NO ES ZONA SEGURA';
                szText.style.color = player.inSafeZone ? '#2ecc71' : '#e74c3c';
            }
            if (szDesc) szDesc.innerText = player.inSafeZone ? 'No puedes recibir daño' : 'Puedes recibir daño aquí';
            if (szIcon) szIcon.src = player.inSafeZone ? 'items/icons/no-pvp.png' : 'items/icons/ghost_gun.png';
            safeZoneUI.style.display = 'block';
            requestAnimationFrame(() => { safeZoneUI.style.opacity = '1'; });
            if (window.__safeTimer) clearTimeout(window.__safeTimer);
            window.__safeTimer = setTimeout(() => { safeZoneUI.style.opacity = '0'; }, 10000);
        }
    }

    // 1. Try moving X first (espejo de Y)
    const oldX = player.worldX;
    player.worldX += player.vx;
    if (playerCollides(player.worldX, player.worldY)) {
        player.worldX = oldX;
        const stepX = Math.sign(player.vx);
        if (stepX !== 0) {
            let stepsX = Math.floor(Math.abs(player.vx));
            while (stepsX > 0 && !playerCollides(player.worldX + stepX, player.worldY)) {
                player.worldX += stepX;
                stepsX--;
            }
        }
    }

    // 2. Try moving Y second
    const oldY = player.worldY;
    player.worldY += player.vy;
    if (playerCollides(player.worldX, player.worldY)) {
        player.worldY = oldY;
        // 🛑 EL FIX: "Aproximación fina" en Y
        const stepY = Math.sign(player.vy);
        if (stepY !== 0) {
            let steps = Math.floor(Math.abs(player.vy));
            while (steps > 0 && !playerCollides(player.worldX, player.worldY + stepY)) {
                player.worldY += stepY;
                steps--;
            }
        }
    }

    // --- 3. SHOOTING & COMBAT PHYSICS ---
    // 🛑 EL FIX: Si el objeto no es un arma real, usamos las estadísticas de "none" (Manos vacías)
    const weaponsLookup = (typeof WEAPONS !== 'undefined' ? WEAPONS : (typeof window !== 'undefined' ? window.WEAPONS : null)) || (typeof weaponsDB !== 'undefined' ? weaponsDB : (typeof window !== 'undefined' ? window.weaponsDB : null)) || {};
    let currentWeaponStats = weaponsLookup[player.equippedWeapon] || weaponsLookup["none"] || { name: 'none', type: 'melee', fireRate: 400, reach: 24, hitW: 24, hitH: 24, damage: 0 };

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

                if (ws && ws.readyState === WebSocket.OPEN) {
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
                                if (ws && ws.readyState === WebSocket.OPEN) {
                                    ws.send(MessagePack.encode({ type: 'pickup_trash', itemId: itemId }));
                                }
                                // La borramos visualmente de inmediato para que no mandes spam de clics
                                delete groundItems[itemId];
                                break; // Salimos del loop para solo pinchar 1 a la vez
                            }
                        }
                    }
                }// 👇 NUEVO: SI EL ARMA ES UNA PALA, MANDAR EXCAVAR 👇
                else if (player.equippedWeapon === 'shovel' || (currentWeaponStats.name || '').toLowerCase().includes('pala')) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
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
                        // ?? EL FIX: Solo dibujamos la predicci�n visual si el arma NO est� controlada por AargScript
                        spawnProjectile(spawnX, spawnY, bulletAngle, myId, player.equippedWeapon);

                        // 2. Guardamos el ángulo en nuestra caja
                        anglesArray.push(bulletAngle);
                    }

                    // 3. Enviamos LA CAJA COMPLETA al servidor de forma inteligente
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        if (bulletCount > 1) {
                            // 📦 Si es escopeta, enviamos el arreglo múltiple 
                            // (NOTA: Para que otros vean la escopeta, debes actualizar tu Server Node.js para que retransmita 'shoot_shotgun')
                            ws.send(MessagePack.encode({
                                type: 'shoot_shotgun',
                                x: spawnX,
                                y: spawnY,
                                angles: anglesArray,
                                frameY: player.frameY,
                                weaponId: player.equippedWeapon
                            }));
                        } else {
                            // 🔫 EL FIX: Si es pistola normal, mandamos el paquete clásico que el servidor SÍ conoce
                            ws.send(MessagePack.encode({
                                type: 'shoot',
                                x: spawnX,
                                y: spawnY,
                                angle: finalAngle, // Mandamos el ángulo único en vez del Array
                                frameY: player.frameY,
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
                        if (ws && ws.readyState === WebSocket.OPEN) {
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
        const HITBOX_RADIUS_SQ = 14 * 14;

        // A. ¿La bala chocó contra MÍ? 
        if (p.owner !== myId && !player.isDead && ((p.x - player.worldX) ** 2 + (p.y - player.worldY) ** 2) < HITBOX_RADIUS_SQ) {
            hitSomeone = true;
        }

        // B. ¿La bala chocó contra ALGUIEN MÁS?
        if (!hitSomeone) {
            for (let id in otherPlayers) {
                let enemy = otherPlayers[id];

                if (enemy.worldX !== undefined && !enemy.isDead && p.owner !== id && ((p.x - enemy.worldX) ** 2 + (p.y - enemy.worldY) ** 2) < HITBOX_RADIUS_SQ) {
                    hitSomeone = true;
                    // 🛑 SERVER-AUTHORITATIVE COMBAT:
                    // La bala local es solo visual. Se destruirá al chocar, 
                    // pero es el SERVIDOR quien decide si bajó vida o no.
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
                            const isMount = (wSprite.naturalWidth === 384 && wSprite.naturalHeight === 384);
                              const sW = isMount ? 96 : 48;
                              const sH = isMount ? 96 : 64;
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

        const minWorldX = renderWorldX - screenWorldW / 2;
        const maxWorldX = renderWorldX + screenWorldW / 2;
        const minWorldY = renderWorldY - screenWorldH / 2;
        const maxWorldY = renderWorldY + screenWorldH / 2;

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
            const REBAKE_BUDGET = 6; // máximo de chunks a rehornar por frame (anti-stutter)
            let rebaked = 0;
            for (const chunkKey of dirtyChunks) {
                if (!activeChunkKeys.has(chunkKey)) { dirtyChunks.delete(chunkKey); continue; }
                if (rebaked >= REBAKE_BUDGET) continue;
                const [cx, cy] = chunkKey.split(',').map(Number);
                rebakeChunk(cx, cy);
                dirtyChunks.delete(chunkKey);
                rebaked++;
            }
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

                    const rawDx1 = screenCenterX + (chunkStartX - renderWorldX) * zoomLevel;
                    const rawDy1 = screenCenterY + (chunkStartY - renderWorldY) * zoomLevel;
                    const rawDx2 = screenCenterX + (chunkEndX - renderWorldX) * zoomLevel;
                    const rawDy2 = screenCenterY + (chunkEndY - renderWorldY) * zoomLevel;

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
        const l15endCol = Math.floor((renderWorldX + (l15screenW / 2)) / TILE_SIZE) + 1;
        const l15startRow = Math.floor((renderWorldY - (l15screenH / 2)) / TILE_SIZE) - 1;
        const l15endRow = Math.floor((renderWorldY + (l15screenH / 2)) / TILE_SIZE) + 1;

        const l15scaledSize = TILE_SIZE * zoomLevel;
        const l15cameraOffX = screenCenterX - (renderWorldX * zoomLevel);
        const l15cameraOffY = screenCenterY - (renderWorldY * zoomLevel);

        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.font = `900 ${6 * zoomLevel}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2 * zoomLevel;
        ctx.strokeStyle = 'black';

        for (let gy = l15startRow; gy <= l15endRow; gy++) {
            for (let gx = l15startCol; gx <= l15endCol; gx++) {
                const l15key = getMapKey(gx, gy, 15);
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
                        const tweakX = (l15tile.shelfX || 0) * zoomLevel;
                        const tweakY = (l15tile.shelfY || 0) * zoomLevel;
                        const itemRow = l15tile.itemRow || 0;
                        const isMount = (wSprite.naturalWidth === 384 && wSprite.naturalHeight === 384);
                          const sW = isMount ? 96 : 48;
                          const sH = isMount ? 96 : 64;
                        const renderScale = 0.9;
                        const scaledTile = TILE_SIZE * zoomLevel;
                        const scaledItemW = sW * renderScale * zoomLevel;
                        const scaledItemH = sH * renderScale * zoomLevel;

                        ctx.drawImage(
                            wSprite,
                            0, itemRow * sH, sW, sH,
                            l15drawX + (scaledTile / 2) - (scaledItemW / 2) + tweakX,
                            l15drawY + scaledTile - scaledItemH - (4 * zoomLevel) + tweakY,
                            scaledItemW, scaledItemH
                        );

                        // Precio debajo del tile
                        if (itemStats.price !== undefined) {
                            const priceText = `$${itemStats.price}`;
                            const textX = l15drawX + (scaledTile / 2);
                            const textY = l15drawY + scaledTile + (5 * zoomLevel);
                            ctx.strokeText(priceText, textX, textY);
                            ctx.fillStyle = '#f1c40f';
                            ctx.fillText(priceText, textX, textY);
                        }
                    }
                }

                // 🔧 Aquí puedes añadir más casos de lógica visual en el futuro
                // (NPCs, portales, puertas, etc.) siguiendo el mismo patrón
            }
        }
        ctx.restore();
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
        const dx = p.targetX - p.worldX;
        const dy = p.targetY - p.worldY;
        const distSq = dx * dx + dy * dy;

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
            if (distSq < 9) {
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
        // 🐾 Compañero DEBAJO del jugador (su sombra no queda encima)
        drawCompanionSprite(ctx, p, pDrawX, pDrawY, zoomLevel);
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

    // 🚀 EL FIX DEL JITTER: el jugador SIEMPRE dead center, salvo cuando la cámara enfoca otra zona
    const _camLocked = (window.camFocus && window.camFocus.active) || window.camReturn;
    const myDrawX = _camLocked
        ? Math.floor(screenCenterX + (player.worldX - renderWorldX) * zoomLevel)
        : screenCenterX;
    const myDrawY = _camLocked
        ? Math.floor(screenCenterY + (player.worldY - renderWorldY) * zoomLevel)
        : screenCenterY;

    // 🐾 Compañero DEBAJO del jugador
    drawCompanionSprite(ctx, player, myDrawX, myDrawY, zoomLevel);
    // 👇 DIBUJO LIMPIO DEL ENSAMBLADOR PARA TI 👇
    drawModularCharacter(ctx, player, myDrawX, myDrawY, zoomLevel);

    if (localIsHit && !player.isDead) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.beginPath(); ctx.arc(myDrawX, myDrawY, 12 * zoomLevel, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;

    // ✨ Glow del ítem objetivo del guide (para que sepa cuál comprar)
    if (window.guide && window.guide.itemGlow) {
        const _gt = window.guide.itemGlow;
        const _gwx = _gt.tx * TILE_SIZE + 8, _gwy = _gt.ty * TILE_SIZE + 8;
        const _gsx = Math.floor(screenCenterX + (_gwx - renderWorldX) * zoomLevel);
        const _gsy = Math.floor(screenCenterY + (_gwy - renderWorldY) * zoomLevel);
        const _pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        const _rad = (11 + _pulse * 6) * zoomLevel;
        ctx.save();
        ctx.globalAlpha = 0.55 + _pulse * 0.45;
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2 * zoomLevel;
        ctx.shadowBlur = 18 * zoomLevel;
        ctx.shadowColor = '#f1c40f';
        ctx.beginPath();
        ctx.arc(_gsx, _gsy, _rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

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
        // 🌟 MAGIA PURA: 1 sola instrucción en vez de miles de iteraciones
        if (isUnderRoof) ctx.globalAlpha = 0.3; // Hacer techos transparentes si estás en casa

        ctx.imageSmoothingEnabled = false;

        const screenWorldW = cachedScreenWidth / zoomLevel;
        const screenWorldH = cachedScreenHeight / zoomLevel;
        const minWorldX = renderWorldX - screenWorldW / 2;
        const maxWorldX = renderWorldX + screenWorldW / 2;
        const minWorldY = renderWorldY - screenWorldH / 2;
        const maxWorldY = renderWorldY + screenWorldH / 2;
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

                    const rawDx1 = screenCenterX + (chunkStartX - renderWorldX) * zoomLevel;
                    const rawDy1 = screenCenterY + (chunkStartY - renderWorldY) * zoomLevel;
                    const rawDx2 = screenCenterX + (chunkEndX - renderWorldX) * zoomLevel;
                    const rawDy2 = screenCenterY + (chunkEndY - renderWorldY) * zoomLevel;

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
            const dir = player.frameY;
            const d = stats.dirStats ? (stats.dirStats[dir] || {}) : {};
            const currentMuzzleX = player.worldX + (d.hitX || 0);
            const currentMuzzleY = player.worldY + (d.hitY || 0);
            const fX = Math.floor(screenCenterX + (currentMuzzleX - renderWorldX) * zoomLevel);
            const fY = Math.floor(screenCenterY + (currentMuzzleY - renderWorldY) * zoomLevel);

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
        drawDynamicBubble(p.message, p.messageTimer, p.isTyping, p.isSpeaking, pTopLeftX, pTopLeftY, scaledWidth);
        drawNametag(p, pTopLeftX, pTopLeftY, scaledWidth, scaledHeight, getColorForString(p.username));

        // ⏱️ Decrement locally so bubble fades without needing constant network updates
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

        if (spark.life <= 0) spark.active = false;
    }
    ctx.globalAlpha = 1.0;

    // === POLVO (DUST FX, pool propio en js/fx_dust.js) ===
    if (typeof updateDust === 'function') { try { updateDust(); } catch (e) { if (!window.__dustErr) { window.__dustErr = 1; console.error('[DUST-LOOP]', e); } } }
    if (typeof drawDust === 'function') { try { drawDust(ctx, screenCenterX, screenCenterY, renderWorldX, renderWorldY, zoomLevel); } catch (e) { if (!window.__dustErr) { window.__dustErr = 1; console.error('[DUST-LOOP]', e); } } }

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

        if (ws && ws.readyState === WebSocket.OPEN && player.username) {
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
                player.isSitting !== window.lastNetSitting ||
                player.isSwimming !== window.lastNetSwimming
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
                        isSwimming: player.isSwimming,
                        equippedWeapon: player.equippedWeapon
                    }
                }));

                // Actualizar la memoria rápida
                window.lastNetX = rx; window.lastNetY = ry;
                window.lastNetDir = player.frameY; window.lastNetMoving = player.isMoving;
                window.lastNetWep = player.equippedWeapon; window.lastNetMsg = player.message;
                window.lastNetTyping = player.isTyping; window.lastNetSitting = player.isSitting; window.lastNetSwimming = player.isSwimming;
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
