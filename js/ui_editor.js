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

// FunciÃ³n auxiliar para cambiar UI
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

    // Cargar datos al entrar a la pestaÃ±a Melee
    if (tab === 'melee') {
        const wId = player.equippedWeapon;
        const stats = weaponsDB[wId];

        // --- MOSTRAR/OCULTAR BOTÃ“N DE HOJA DE ARMA ---
        const tBtn = document.getElementById('btn-toggle-sheet');
        if (tBtn) {
            if (tab === 'melee') {
                tBtn.style.display = 'inline-block';
            } else {
                tBtn.style.display = 'none';
                isPickingAccessory = false; // Resetear al cuerpo por seguridad
                tBtn.innerText = "âš”ï¸ Ver Hoja de Arma";
            }
        }

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
const tBtn = document.getElementById('btn-toggle-sheet');
if (tBtn) {
    if (currentGaniTab === 'melee') { // ðŸ›‘ EL FIX: Usar currentGaniTab
        tBtn.style.display = 'inline-block';
    } else {
        tBtn.style.display = 'none';
        isPickingAccessory = false; // Resetear siempre al cuerpo
        tBtn.innerText = "âš”ï¸  Ver Hoja de Arma";
    }
}
document.getElementById('tab-skel-body').onclick = () => switchGaniTab('body', '#9b59b6', 'ðŸ’¾ Guardar Esqueleto', "Arrastra el <b>Punto Azul</b> a la mano del jugador.");
document.getElementById('tab-skel-weapon').onclick = () => switchGaniTab('weapon', '#e74c3c', 'ðŸ’¾ Guardar Pivote de Arma', "Arrastra el <b>Punto Rojo</b> al mango de la pistola.");
document.getElementById('tab-skel-melee').onclick = () => switchGaniTab('melee', '#e67e22', 'ðŸ’¾ Guardar Hitbox y AnimaciÃ³n', "Ajusta los <b>Slidres</b> para definir el Ã¡rea de daÃ±o (Rojo).");

// 1. Añadimos sl-wz, sl-hz, sl-az, sl-kb, sl-bullet-kb, sl-freeze
const sliders = [
    'sl-hitx', 'sl-hity', 'sl-hitrot', 'sl-hitlen', 'sl-hitwid',
    'sl-wz', 'sl-wx', 'sl-wy', 'sl-wrot', 'sl-wswg',
    'sl-hz', 'sl-hx', 'sl-hy', 'sl-hrot',
    'sl-az', 'sl-ax', 'sl-ay', 'sl-arot',
    'sl-kb', 'sl-bullet-kb', 'sl-freeze'
];

sliders.forEach(id => {
    const sliderEl = document.getElementById(id);

    // 🛡️ EL ESCUDO: Si el slider no existe en el HTML, lo ignoramos silenciosamente
    if (!sliderEl) return;

    sliderEl.addEventListener('input', () => {
        const val = sliderEl.value;
        const labelEl = document.getElementById('val-' + id.replace('sl-', ''));

        // 🛡️ EL ESCUDO 2: Actualizamos el texto solo si la etiqueta visual existe
        if (labelEl) labelEl.innerText = val;

        const wId = player.equippedWeapon;
        if (wId !== "none" && weaponsDB[wId]) {
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
// 2. Cargar datos al cambiar de lado (WASD)
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
    if (!skelCtx) return;
    const zoom = 3;
    const centerX = 128 - ((FRAME_WIDTH / 2) * zoom);
    const centerY = 128 - ((FRAME_HEIGHT / 2) * zoom);

    // Fondo y cuadrÃ­cula
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

        // --- DIBUJAR ARMA DE PREVISUALIZACIÃ“N EN LA MANO ---
        if (testWeapon !== "none" && loadedWeaponSprites[testWeapon]) {
            const wSprite = loadedWeaponSprites[testWeapon];
            const wStats = weaponsDB[testWeapon] || {};
            const pX = (wStats.pivotX || 0) * zoom;
            const pY = (wStats.pivotY || 0) * zoom;
            const wW = wSprite.width / 8; const wH = wSprite.height / 6;

            skelCtx.save();
            // ðŸ›‘ EL FIX: Usar exactamente la posiciÃ³n calculada del Gizmo Azul para anclar el arma
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
            skelCtx.fillStyle = "white"; skelCtx.fillText("EquÃ­pate un arma primero", 100, 128);
        }
    }
    // --- MODO 3: MELEE HITBOX (CAPAS Z-INDEX) ---
    else if (currentGaniTab === 'melee') {
        if (testWeapon === "none" || !loadedWeaponSprites[testWeapon]) {
            skelCtx.fillStyle = "white"; skelCtx.fillText("EquÃ­pate un arma primero", 100, 128); return;
        }

        const dir = player.frameY; const frame = player.frameX;
        const state = player.isMoving ? 'walk_armed' : 'walk_armed';

        if (dir !== currentEditDir) loadMeleeSlidersForDirection(dir);

        // ðŸ”¥ FIX A PRUEBA DE BALAS PARA ANCLAS EN EL EDITOR ðŸ”¥
        const fKey = getFrameKey(state, dir, frame);
        const rawAnchors = SKELETON_DATA.anchors[fKey] || {};
        const headAnc = rawAnchors.head || [0, 0];
        const handAnc = rawAnchors.handR || [12, 12];
        const safeFrame = frame % 6;

        const handX = centerX + (handAnc[0] * zoom) + ((FRAME_WIDTH / 2) * zoom);
        const handY = centerY + (handAnc[1] * zoom) + ((FRAME_HEIGHT / 2) * zoom);

        const d = weaponsDB[testWeapon].dirStats ? (weaponsDB[testWeapon].dirStats[dir] || {}) : {};
        const wSprite = loadedWeaponSprites[testWeapon];

        // --- ROTACIÃ“N MATEMÃTICA AUTOMÃTICA (SOLO PARA MELEE) ---
        let aimAngle = 0; let dirMult = 1;

        // Si NO es ranged (ej. es una espada), aplicamos la rotaciÃ³n forzada
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

        // --- ðŸ• DIBUJAR HITBOX O PUNTA DEL CAÃ‘Ã“N ---
        skelCtx.save();

        // ðŸ›‘ EL FIX: Usamos 128 (El pecho) en lugar de centerX/Y (La esquina superior)
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
            // Si es Melee, dibujamos el cono de daÃ±o
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
                        // ðŸ›‘ EL FIX: Se resta directo. Â¡Ya no multiplicamos por dirMult para que no salte al revÃ©s!
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
                        // ðŸ›‘ EL FIX: Extraer el Ã¡ngulo de forma segura
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

                let srcY = dir * frameH; // CÃ³digo limpio y estandarizado
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

        // ðŸ”¥ SISTEMA Z-INDEX (ORDEN DE RENDERIZADO) ðŸ”¥
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

// --- EVENTOS DEL RATÃ“N INTELIGENTES ---
if (skelCanvas) {
    const canvasContainer = document.getElementById('skel-canvas-container');

    // --- DETECCIÃ“N DE CLIC EN EL CANVAS DEL EDITOR ---
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
                // ðŸ›‘ EL FIX: Agregar '|| 0' para evitar errores si el arma es nueva
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

                // ðŸ›‘ EL ESCUDO: Actualizar solo si las cajitas existen en el HTML
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

    // --- BOTÃ“N MAESTRO DE GUARDADO ---
    document.getElementById('save-skel-btn').onclick = () => {
        const btn = document.getElementById('save-skel-btn');
        const originalText = btn.innerText;
        btn.innerText = "Guardando...";

        // 1. SI ESTAMOS EN LA PESTAÃ‘A "CUERPO" (BODY)
        if (currentGaniTab === 'body') {
            ws.send(MessagePack.encode({
                type: 'save_skeleton_data',
                anchors: SKELETON_DATA.anchors
            }));
            btn.style.background = "#2ecc71";
            btn.innerText = "Â¡Cuerpo Guardado!";
        }

        // 2. SI ESTAMOS EN LA PESTAÃ‘A "PIVOTE" (WEAPON)
        else if (currentGaniTab === 'weapon') {
            const wId = player.equippedWeapon;
            if (wId !== "none" && weaponsDB[wId]) {
                ws.send(MessagePack.encode({
                    type: 'update_weapon_pivot',
                    weaponId: wId,
                    // ðŸ›‘ EL FIX: Leemos directo de la memoria RAM, no del HTML
                    pivotX: weaponsDB[wId].pivotX || 0,
                    pivotY: weaponsDB[wId].pivotY || 0
                }));
                btn.style.background = "#2ecc71";
                btn.innerText = "Â¡Pivote Guardado!";
            }
        }

        // 3. SI ESTAMOS EN LA PESTAÑA "MELEE" / STATS
        else if (currentGaniTab === 'melee') {
            const wId = player.equippedWeapon;

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
                    wZ: parseInt(document.getElementById('sl-wz').value) === 0 ? 0 : 1,
                    wX: parseInt(document.getElementById('sl-wx').value) || 0,
                    wY: parseInt(document.getElementById('sl-wy').value) || 0,
                    wRot: parseInt(document.getElementById('sl-wrot').value) || 0,
                    wSwg: parseInt(document.getElementById('sl-wswg').value) || 90,

                    // Mano
                    hZ: parseInt(document.getElementById('sl-hz').value) === 0 ? 0 : 1,
                    hX: parseInt(document.getElementById('sl-hx').value) || 0,
                    hY: parseInt(document.getElementById('sl-hy').value) || 0,
                    hRot: parseInt(document.getElementById('sl-hrot').value) || 0,

                    // Accesorio
                    aZ: parseInt(document.getElementById('sl-az').value) === 0 ? 0 : 1,
                    aX: parseInt(document.getElementById('sl-ax').value) || 0,
                    aY: parseInt(document.getElementById('sl-ay').value) || 0,
                    aRot: parseInt(document.getElementById('sl-arot').value) || 0,

                    // Tiles del Sprite Picker
                    tX: safeDirStats.tX !== undefined ? safeDirStats.tX : 13,
                    tY: safeDirStats.tY !== undefined ? safeDirStats.tY : 0,
                    wTileX: safeDirStats.wTileX !== undefined ? safeDirStats.wTileX : null,
                    wTileY: safeDirStats.wTileY !== undefined ? safeDirStats.wTileY : null,

                    // Empuje y Freeze
                    kb: parseInt(document.getElementById('sl-kb') ? document.getElementById('sl-kb').value : 0),
                    bulletKb: parseInt(document.getElementById('sl-bullet-kb') ? document.getElementById('sl-bullet-kb').value : 0),
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
                alert("⚠️ Equipa un arma para guardar estas estadísticas.");
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


// --- NUEVA LÓGICA DE ARRASTRE Y MINIMIZAR PARA EL SKEL EDITOR ---
const skelModal = document.getElementById('skeleton-editor');
const skelDragHandle = document.getElementById('skel-drag-handle');
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
                skelModal.style.height = '45px'; skelModal.style.minHeight = '45px'; // Just the header
                minSkelBtn.innerText = '➕';
            } else {
                skelModalContent.style.display = 'flex'; // It was flex originally
                skelModal.style.height = originalSkelHeight;
                minSkelBtn.innerText = '➖';
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
