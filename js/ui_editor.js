let pickingMode = 'body';

window.showGaniGizmos = true;
setTimeout(() => {
    const btnGizmos = document.getElementById('btn-toggle-gizmos');
    if (btnGizmos) {
        btnGizmos.onclick = () => {
            window.showGaniGizmos = !window.showGaniGizmos;
            btnGizmos.style.opacity = window.showGaniGizmos ? '1' : '0.4';
        };
    }
}, 500);

// --- LÃ“GICA DE LA APP SKELETON (SKEL) ---
const appSkelIcon = document.getElementById('app-skel');
if (appSkelIcon) {
    appSkelIcon.addEventListener('click', () => {
        // 2. Abre el editor y actualiza la previsualizaciÃ³n
        document.getElementById('skeleton-editor').style.display = 'flex';
                updateSkelPreview();
    });
}
const closeSkelBtn = document.querySelector('#skel-drag-handle button');
if (closeSkelBtn) {
    closeSkelBtn.onclick = () => {
        document.getElementById('skeleton-editor').style.display = 'none';
        restoreTrayAfterModal(); // ðŸŒŸ MAGIA
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

// LÃ³gica del botÃ³n Toggle
const btnToggleSheet = document.getElementById('btn-toggle-sheet');
if (btnToggleSheet) {
    btnToggleSheet.onclick = () => {
        isPickingAccessory = !isPickingAccessory;
        btnToggleSheet.innerText = isPickingAccessory ? "ðŸ¦´ Ver Hoja de Cuerpo" : "âš”ï¸ Ver Hoja de Arma";
        drawSpriteSheetGrid();
    };
}

// 1. DIBUJAR LA CUADRÃCULA (INTELIGENTE)

setTimeout(() => {
    const btnBody = document.getElementById('btn-sheet-body');
    const btnWeapon = document.getElementById('btn-sheet-weapon');
    if (btnBody && btnWeapon) {
        btnBody.onclick = () => {
            pickingMode = 'body';
            btnBody.style.opacity = '1';
            btnWeapon.style.opacity = '0.5';
            drawSpriteSheetGrid();
        };
        btnWeapon.onclick = () => {
            pickingMode = 'weapon';
            btnBody.style.opacity = '0.5';
            btnWeapon.style.opacity = '1';
            drawSpriteSheetGrid();
        };
    }
}, 500);

function drawSpriteSheetGrid() {
    const ssCanvas = document.getElementById('spritesheet-canvas');
    if (!ssCanvas) return;
    const ctx = ssCanvas.getContext('2d');
    const wId = player.equippedWeapon;

    let activeImg = bodyImg;
    let isWeaponSheet = false;

    // Decidir si mostramos el Cuerpo o el Arma
    if (pickingMode === 'weapon' && wId !== "none" && loadedWeaponSprites[wId]) {
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
        if (pickingMode === 'weapon') {
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

// FunciÃ³n auxiliar para cambiar UI
function switchGaniTab(tab, color, title, instructions) {
    currentGaniTab = tab;
    document.getElementById('tab-skel-body').style.background = tab === 'body' ? '#9b59b6' : 'rgba(0,0,0,0.5)';
    document.getElementById('tab-skel-body').style.color = tab === 'body' ? 'white' : '#aaa';
    
    document.getElementById('tab-skel-melee').style.background = tab === 'melee' ? '#e67e22' : 'rgba(0,0,0,0.5)';
    document.getElementById('tab-skel-melee').style.color = tab === 'melee' ? 'white' : '#aaa';

    document.getElementById('skel-anim-controls').style.display = tab === 'body' ? 'flex' : 'none';
      const bodyCtrls = document.getElementById('skel-body-controls');
      if (bodyCtrls) bodyCtrls.style.display = tab === 'body' ? 'flex' : 'none';
    document.getElementById('skel-melee-controls').style.display = tab === 'melee' ? 'flex' : 'none';
    const mountCtrls = document.getElementById('skel-mount-controls');
    if (mountCtrls) mountCtrls.style.display = tab === 'mount' ? 'flex' : 'none';
    
    if (tab === 'mount') loadMountSlidersForDirection(player.frameY);


    
    document.getElementById('save-skel-btn').innerText = title;
    document.getElementById('save-skel-btn').style.background = color;
    document.getElementById('save-skel-btn').style.boxShadow = `0 4px 0 ${color}`;

    // Cargar datos al entrar a la pestaÃ±a Melee
    if (tab === 'melee') {
        const wId = player.equippedWeapon;
        const stats = weaponsDB[wId];

        // --- MOSTRAR/OCULTAR BOTÃ“N DE HOJA DE ARMA ---
        

        // Si es melee, cargamos los datos basados en la direcciÃ³n actual
        loadMeleeSlidersForDirection(player.frameY);
    }
    // ðŸ‘‡ AÃ‘ADE ESTO: Para que dibuje la cuadrÃ­cula grande del cuerpo
    if (tab === 'body') {
        setTimeout(drawSpriteSheetGrid, 50); // El setTimeout le da tiempo al HTML de abrirse
    }
    updateSkelPreview();
}
// Ocultar o mostrar el botÃ³n Toggle de la hoja de sprites

document.getElementById('tab-skel-body').onclick = () => switchGaniTab('body', '#9b59b6', 'Guardar Esqueleto', "Ajusta los sliders base.");
document.getElementById('tab-skel-melee').onclick = () => switchGaniTab('melee', '#e67e22', 'Guardar Arma', "Ajusta pivote, hitbox y rotaciones.");
document.getElementById('tab-skel-mount').onclick = () => switchGaniTab('mount', '#2ecc71', 'Guardar Montura', "Ajusta las posiciones del jugador y montura.");

const sliders = [
    'sl-hitx', 'sl-hity', 'sl-hitrot', 'sl-hitlen', 'sl-hitwid',
    'sl-wz', 'sl-wx', 'sl-wy', 'sl-wrot', 'sl-wswg',
    'sl-hz', 'sl-hx', 'sl-hy', 'sl-hrot',
    'sl-az', 'sl-ax', 'sl-ay', 'sl-arot',
    'sl-kb', 'sl-bullet-kb', 'sl-freeze',
    'sl-pivotx', 'sl-pivoty', 'sl-basex', 'sl-basey', 'sl-pY', 'sl-mY', 'sl-pX'
];

sliders.forEach(id => {
    const sliderEl = document.getElementById(id);
    if (!sliderEl) return;
    sliderEl.addEventListener('input', (e) => {
        const val = e.target.value;
        const labelEl = document.getElementById('val-' + id.replace('sl-', ''));
        if (labelEl) labelEl.innerText = val;
        
        const wId = player.equippedWeapon;
        if (currentGaniTab === 'mount') {
            const mId = player.equippedWeapon;
            if (mId && mId !== "none" && window.MASTER_CATALOG && window.MASTER_CATALOG[mId]) {
                if (!window.MASTER_CATALOG[mId].dirStats) window.MASTER_CATALOG[mId].dirStats = {};
                if (!window.MASTER_CATALOG[mId].dirStats[currentEditDir]) window.MASTER_CATALOG[mId].dirStats[currentEditDir] = {};
                
                const numVal = Number(val);
                if (id === 'sl-pY') window.MASTER_CATALOG[mId].dirStats[currentEditDir].pY = numVal;
                if (id === 'sl-mY') window.MASTER_CATALOG[mId].dirStats[currentEditDir].mY = numVal;
                if (id === 'sl-pX') window.MASTER_CATALOG[mId].dirStats[currentEditDir].pX = numVal;
            }
        } else if (wId !== "none" && weaponsDB[wId]) {
            if (!weaponsDB[wId].dirStats) weaponsDB[wId].dirStats = {};
            if (!weaponsDB[wId].dirStats[currentEditDir]) weaponsDB[wId].dirStats[currentEditDir] = {};
            const d = weaponsDB[wId].dirStats[currentEditDir];
            const numVal = parseInt(val) || 0;

            if (id === 'sl-hitx') d.hitX = numVal; if (id === 'sl-hity') d.hitY = numVal;
            if (id === 'sl-hitrot') d.hitRot = numVal; if (id === 'sl-hitlen') d.hitLen = numVal; if (id === 'sl-hitwid') d.hitWid = numVal;
            if (id === 'sl-wz') d.wZ = numVal; if (id === 'sl-wx') d.wX = numVal; if (id === 'sl-wy') d.wY = numVal;
            if (id === 'sl-wrot') d.wRot = numVal; if (id === 'sl-wswg') d.wSwg = numVal;
            if (id === 'sl-hz') d.hZ = numVal; if (id === 'sl-hx') d.hX = numVal; if (id === 'sl-hy') d.hY = numVal; if (id === 'sl-hrot') d.hRot = numVal;
            if (id === 'sl-az') d.aZ = numVal; if (id === 'sl-ax') d.aX = numVal; if (id === 'sl-ay') d.aY = numVal; if (id === 'sl-arot') d.aRot = numVal;
            if (id === 'sl-kb') d.kb = numVal;
            
            // PIVOTE GLOBAL DEL ARMA (No depende de la direccin)
            if (id === 'sl-pivotx') weaponsDB[wId].pivotX = numVal;
            if (id === 'sl-pivoty') weaponsDB[wId].pivotY = numVal;

            // ANCLAJE BASE DEL CUERPO (Depende del State, Dir y Frame de la UI)
            if (id === 'sl-basex' || id === 'sl-basey') {
                const state = document.getElementById('edit-skel-state').value || 'idle';
                const frame = parseInt(document.getElementById('edit-skel-frame').value) || 0;
                const fKey = getFrameKey(state, currentEditDir, frame);
                if (!SKELETON_DATA.anchors[fKey]) SKELETON_DATA.anchors[fKey] = { handR: [12, 12], head: [0,0] };
                
                if (id === 'sl-basex') SKELETON_DATA.anchors[fKey].handR[0] = numVal;
                if (id === 'sl-basey') SKELETON_DATA.anchors[fKey].handR[1] = numVal;
            }
            if (id === 'sl-bullet-kb') d.bulletKb = numVal;
            if (id === 'sl-freeze') d.freeze = numVal;
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

// 3. RECARGAR SLIDERS Y ACTUALIZAR ETIQUETA DE DIRECCIÃ“N
let currentEditDir = 0;
let lastAutoSyncDir = -1;

setInterval(() => {
    const editor = document.getElementById('skeleton-editor');
    if (editor && editor.style.display !== 'none') {
        if (currentGaniTab === 'melee' || currentGaniTab === 'weapon' || currentGaniTab === 'mount') {
            const realDir = player.frameY;
            if (realDir !== lastAutoSyncDir) {
                lastAutoSyncDir = realDir;
                
if (currentGaniTab === 'mount') loadMountSlidersForDirection(realDir);
else loadMeleeSlidersForDirection(realDir);
            }
        }
    }
}, 100);

// 2. Cargar datos al cambiar de lado (WASD)

function loadMountSlidersForDirection(dir) {
    currentEditDir = dir;
    const dirNames = ["ABAJO (0)", "IZQUIERDA (1)", "DERECHA (2)", "ARRIBA (3)"];
    const dEl = document.getElementById('dir-indicator-mount');
    if (dEl) dEl.innerText = "Modificando: " + dirNames[dir];

    const mId = player.equippedWeapon;
    if (!mId || mId === "none" || !window.MASTER_CATALOG || !window.MASTER_CATALOG[mId]) return;

    if (!window.MASTER_CATALOG[mId].dirStats) window.MASTER_CATALOG[mId].dirStats = {};
    if (!window.MASTER_CATALOG[mId].dirStats[dir]) window.MASTER_CATALOG[mId].dirStats[dir] = {};
    const d = window.MASTER_CATALOG[mId].dirStats[dir];

    // Usar estrictamente los stats guardados (o defaults iniciales si nunca se ha guardado)
    const pY = d.pY !== undefined ? d.pY : -12;
    const mY = d.mY !== undefined ? d.mY : 16;
    const pX = d.pX !== undefined ? d.pX : 0;

    const setSlider = (id, val) => {
        const el = document.getElementById(id);
        const valEl = document.getElementById('val-' + id.replace('sl-', ''));
        if (el) el.value = val;
        if (valEl) valEl.innerText = val;
    };

    setSlider('sl-pY', pY);
    setSlider('sl-mY', mY);
    setSlider('sl-pX', pX);
}

function loadMeleeSlidersForDirection(dir) {
    currentEditDir = dir;
    // ðŸ›‘ EL FIX: Nuevo orden de los textos en el editor
    const dirNames = { 0: "ABAJO (0)", 1: "IZQUIERDA (1)", 2: "DERECHA (2)", 3: "ARRIBA (3)" };
    const dirIndicator = document.getElementById('dir-indicator');
    if (dirIndicator) dirIndicator.innerText = `Modificando: ${dirNames[dir]}`;

    const wId = player.equippedWeapon;
    if (wId !== "none" && weaponsDB[wId] && weaponsDB[wId].dirStats) {
        const d = weaponsDB[wId].dirStats[dir] || weaponsDB[wId].dirStats[0] || {};

        // ðŸ›‘ EL ESCUDO ANTI-CRASH ðŸ›‘
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
        setVal('bullet-kb', d.bulletKb || 0);
        setVal('freeze', d.freeze || 0);
        
        // PIVOTE GLOBAL
        setVal('pivotx', weaponsDB[wId].pivotX || 0);
        setVal('pivoty', weaponsDB[wId].pivotY || 0);
        
        // ANCLAJE BASE (Lee del state/frame seleccionado)
        const state = document.getElementById('edit-skel-state').value || 'idle';
        const frame = parseInt(document.getElementById('edit-skel-frame').value) || 0;
        const fKey = getFrameKey(state, dir, frame);
        const anchors = SKELETON_DATA.anchors[fKey] || { handR: [12, 12], head: [0,0] };
        setVal('basex', anchors.handR[0]);
        setVal('basey', anchors.handR[1]);
        

        const isRanged = weaponsDB[wId] && weaponsDB[wId].type === 'ranged';
        const lblKb = document.getElementById('lbl-kb-title');
        if (lblKb) lblKb.innerText = isRanged ? "Retroceso al Disparar (Recoil)" : "Fuerza de Empuje (Knockback Melee)";
        const rowBulletKb = document.getElementById('row-bullet-kb');
        if (rowBulletKb) rowBulletKb.style.display = isRanged ? 'block' : 'none';

        let tileText = isPickingAccessory ? `[ wX: ${d.wTileX || 0}, wY: ${d.wTileY || 0} ]` : `[ tX: ${d.tX || 13}, tY: ${d.tY || 0} ]`;
        const coordLabel = document.getElementById('grid-coord-label');
        if (coordLabel) coordLabel.innerText = `${tileText} (Dir: ${dir})`;
    }
}

// --- BOTÃ“N DE PROBAR ANIMACIÃ“N INTELIGENTE ---
// ðŸ›‘ EL FIX: Usar el nombre original de tu botÃ³n (btn-preview-swing)
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
// ðŸ’¥ VARIABLES GLOBALES PARA EL PREVIEW DE ANIMACIONES ðŸ’¥
let testAnimPlaying = false;
let testAnimStart = 0;

function updateSkelPreview() {
    loadMeleeSlidersForDirection(currentEditDir);
}

function drawGizmo(x, y, color) {
    skelCtx.fillStyle = color;
    skelCtx.beginPath(); skelCtx.arc(x, y, 6, 0, Math.PI * 2); skelCtx.fill();
    skelCtx.strokeStyle = "white"; skelCtx.stroke();
}


// --- NUEVA LÓGICA DE ARRASTRE Y MINIMIZAR PARA EL SKEL EDITOR ---
const skelModal = document.getElementById('skeleton-editor');
if (skelModal) {
    // Evitar que los clics en el editor afecten al juego (golpear, caminar)
    skelModal.addEventListener('mousedown', (e) => e.stopPropagation());
    skelModal.addEventListener('touchstart', (e) => e.stopPropagation());
}
const skelDragHandle = document.getElementById('skel-drag-handle');
document.getElementById('save-skel-btn').onclick = () => {
        const btn = document.getElementById('save-skel-btn');
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";

        if (currentGaniTab === 'body') {
            ws.send(MessagePack.encode({
                type: 'save_skeleton_data',
                anchors: SKELETON_DATA.anchors
            }));
            btn.style.background = "#2ecc71";
            btn.innerText = "Cuerpo Guardado!";
        }
        else if (currentGaniTab === 'mount') {
            const mId = player.equippedWeapon;
            if (mId && mId !== "none" && window.MASTER_CATALOG && window.MASTER_CATALOG[mId]) {
                const stats = window.MASTER_CATALOG[mId].dirStats[currentEditDir];
                if (window.ws) {
                    window.ws.send(MessagePack.encode({
                        type: 'update_item_stats',
                        itemId: mId,
                        direction: currentEditDir,
                        stats: stats
                    }));
                    btn.innerText = "Montura Guardada!";
                }
            }
        } else if (currentGaniTab === 'melee') {
            const wId = player.equippedWeapon;
            if (wId !== "none" && weaponsDB[wId]) {
                // Send Pivot
                ws.send(MessagePack.encode({
                    type: 'update_weapon_pivot',
                    weaponId: wId,
                    pivotX: weaponsDB[wId].pivotX || 0,
                    pivotY: weaponsDB[wId].pivotY || 0
                }));
                // Send Stats
                ws.send(MessagePack.encode({
                    type: 'update_melee_stats',
                    weaponId: wId,
                    direction: currentEditDir,
                    stats: weaponsDB[wId].dirStats[currentEditDir]
                }));
                
                btn.style.background = "#2ecc71";
                btn.innerText = "Arma Guardada!";
            }
        }

        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = currentGaniTab === 'body' ? '#9b59b6' : '#e67e22';
        }, 1500);
    };


setTimeout(() => {
    const btnExpand = document.getElementById('btn-expand-sheet');
    if (btnExpand) {
        btnExpand.onclick = () => {
            const rightPanel = document.getElementById('skel-right-panel');
            const modal = document.getElementById('skeleton-editor');
            if (rightPanel.style.display === 'none') {
                rightPanel.style.display = 'flex';
                modal.style.width = '750px';
                btnExpand.innerText = '◀'; // Left arrow
                btnExpand.title = 'Ocultar Hoja de Sprites';
                drawSpriteSheetGrid();
            } else {
                rightPanel.style.display = 'none';
                modal.style.width = '350px';
                btnExpand.innerText = '▶'; // Right arrow
                btnExpand.title = 'Ver Hoja de Sprites';
            }
        };
    }
}, 500);

let isDraggingSkel = false;
let skelOffsetX = 0;
let skelOffsetY = 0;
let isSkelMinimized = false;
let originalSkelHeight = '600px';

if (skelDragHandle && skelModal) {
    // Minimizar
    const minSkelBtn = document.getElementById('min-skel-modal');
    const skelModalContent = document.getElementById('skel-modal-content');
    
    if (minSkelBtn && skelModalContent) {
        minSkelBtn.addEventListener('click', () => {
            isSkelMinimized = !isSkelMinimized;
            if (isSkelMinimized) {
                skelModalContent.style.display = 'none';
                originalSkelHeight = skelModal.style.height || '600px';
                minSkelBtn.innerHTML = '<img src="items/icons/Plus.png" class="pixel-icon" style="width: 12px; height: 12px;" alt="+">';
            } else {
                skelModalContent.style.display = 'flex'; // It was flex originally
                minSkelBtn.innerHTML = '<img src="items/icons/minus.png" class="pixel-icon" style="width: 12px; height: 12px;" alt="-">';
            }
        });
    }

    // Arrastre con Pointer Events
    skelDragHandle.addEventListener('pointerdown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        
        isDraggingSkel = true;
        const rect = skelModal.getBoundingClientRect();
        skelOffsetX = e.clientX - rect.left;
        skelOffsetY = e.clientY - rect.top;
        skelDragHandle.style.cursor = 'grabbing';
        skelDragHandle.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    skelDragHandle.addEventListener('pointermove', (e) => {
        if (!isDraggingSkel) return;
        let newX = e.clientX - skelOffsetX;
        let newY = e.clientY - skelOffsetY;

        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + skelModal.offsetWidth > window.innerWidth) newX = window.innerWidth - skelModal.offsetWidth;
        if (newY + skelModal.offsetHeight > window.innerHeight) newY = window.innerHeight - skelModal.offsetHeight;

        skelModal.style.left = newX + 'px';
        skelModal.style.top = newY + 'px';
    });

    skelDragHandle.addEventListener('pointerup', (e) => {
        isDraggingSkel = false;
        skelDragHandle.style.cursor = 'grab';
        skelDragHandle.releasePointerCapture(e.pointerId);
    });
}
