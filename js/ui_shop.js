// --- SHOP MODAL LOGIC ---
const shopModal = document.getElementById('shop-modal');
const closeShopModal = document.getElementById('close-shop-modal'); // <--- Â¡ESTA ES LA QUE FALTABA!
const buyItemBtn = document.getElementById('buy-item-btn');

let isShopOpen = false;
let currentShopItemId = null;
let lastShopTile = null;

// --- NUEVO: CONTROL DEL GIRADOR (SPINNER) ---
let shopPreviewRotationInterval = null; // GuardarÃ¡ el timer del giro
let shopPreviewFacingRow = 0; // GuardarÃ¡ hacia dÃ³nde mira (0=Down, 1=Left, 2=Right, 3=Up)

// =========================================================================
// --- ðŸ›ï¸ VISUALIZADOR UNIVERSAL DE TIENDA (CORRECCIÃ“N DE POSTURAS) ---
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

    // 1. ðŸ” DETECCIÃ“N INTELIGENTE DEL TIPO DE OBJETO
    const catalogData = window.MASTER_CATALOG ? window.MASTER_CATALOG[currentShopItemId] : null;
    const weaponData = weaponsDB[currentShopItemId] || WEAPONS[currentShopItemId];
    const itemData = weaponData || catalogData || {};

    // Â¿Es estrictamente un arma o es ropa cosmÃ©tica?
    const category = itemData.category || (weaponData ? 'weapon' : 'unknown');
    const isWeapon = (category === 'weapon' || weaponData !== undefined);
    const isClothing = !isWeapon;

    // 2. LÃ“GICA DE ESTADO: Correr armado (4) vs Caminar normal (8)
    const stateKey = isWeapon ? "walk_armed" : "walk_unarmed";
    const baseRow = SKELETON_DATA.states[stateKey] !== undefined ? SKELETON_DATA.states[stateKey] : (isWeapon ? 4 : 8);
    const maxFrames = isWeapon ? 6 : 8;

    // Avanzamos el frame de animaciÃ³n de las piernas
    shopAnimFrame = (shopAnimFrame + 0.1) % maxFrames;
    const frameX = Math.floor(shopAnimFrame);

    // 3. VESTIR AL MANIQUÃ
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

    // 5. DIBUJAR CAPAS (Z-INDEX BÃSICO)

    // A. DIBUJAR CUERPO (Este sÃ­ usa frameX para mover las piernas por la hoja de sprites)
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

    // 6. ðŸ”« LÃ“GICA EXCLUSIVA SI SE ESTÃ VENDIENDO UN ARMA
    if (isWeapon) {
        const wData = weaponData || {};
        const wSprite = loadedWeaponSprites[currentShopItemId];

        // Disparo AutomÃ¡tico
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
// --- ðŸ¤– MOTOR MVVM: TRANSFORMADOR DE ESTADÃSTICAS PARA LA TIENDA ---
// =========================================================================
function buildItemViewModel(itemId) {
    const rawData = WEAPONS[itemId] || window.MASTER_CATALOG[itemId];
    if (!rawData) return null;

    const viewModel = {
        name: rawData.name || "Objeto Desconocido",
        price: rawData.price || 0,
        uiStats: [] // AquÃ­ se guardarÃ¡ la lista procesada para el Modal
    };

    // ðŸ›‘ EL FIX: Quitamos el "Alcance" para ahorrar espacio
    const rules = {
        damage: { label: "DaÃ±o", icon: "âš”ï¸", suffix: "" },
        fireRate: { label: "Cadencia", icon: "âš¡", suffix: "ms" },
        magSize: { label: "Cargador", icon: "ðŸ”‹", suffix: " bls" },
        reloadTime: { label: "Recarga", icon: "ðŸ”„", suffix: "ms" }
    };

    // LÃ“GICA RETROCOMPATIBLE: 
    // Busca adentro de .stats (nueva BD) o directamente en la raÃ­z (vieja BD)
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
    // 1. Usamos nuestro transformador mÃ¡gico
    const viewData = buildItemViewModel(itemId);
    if (!viewData) return;

    currentShopItemId = itemId;
    const shopItemIsClothing = window.MASTER_CATALOG && window.MASTER_CATALOG[itemId];

    // 2. Llenar los datos bÃ¡sicos
    document.getElementById('shop-item-name').innerText = viewData.name;

    // 3. ðŸ›‘ EL FIX: RENDERIZADO DINÃMICO VERTICAL
    const statsContainer = document.getElementById('shop-item-stats-container');
    statsContainer.innerHTML = "";

    if (viewData.uiStats.length > 0) {
        statsContainer.style.display = 'flex'; // Activamos el CSS Flexbox vertical del HTML

        viewData.uiStats.forEach(stat => {
            // Genera una "mini tarjeta horizontal" por cada estadÃ­stica
            statsContainer.innerHTML += `
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
                            <span style="color: #aaa; font-size: 11px; text-transform: uppercase; display: flex; align-items: center; gap: 6px;">${stat.icon} ${stat.label}</span> 
                            <span style="color: white; font-weight: bold; font-size: 14px;">${stat.value}</span>
                        </div>
                    `;
        });
    } else {
        statsContainer.style.display = 'none'; // Ocultar la caja si es ropa cosmÃ©tica
    }

    // 4. Gestionar el Ãcono Agrandado
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

    // 5. CONFIGURAR EL GIRADOR (SPINNER) AUTOMÃTICO
    isShopOpen = true;
    shopPreviewFacingRow = 0;

    if (shopPreviewRotationInterval) clearInterval(shopPreviewRotationInterval);
    shopPreviewRotationInterval = setInterval(() => {
        shopPreviewFacingRow = (shopPreviewFacingRow + 1) % 4;
    }, 1000);

    // 6. Congelar al jugador mientras ve la tienda
    player.vx = 0; player.vy = 0; player.isMoving = false;

    // 7. Configurar BotÃ³n de Compra
    const buyItemBtn = document.getElementById('buy-item-btn');
    buyItemBtn.innerHTML = ` <span style="font-size: 20px;">ðŸª™</span> <span id="shop-item-price">${viewData.price}</span>`;
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
        // Cambiar visualmente el botÃ³n para dar feedback
        buyItemBtn.innerText = "Procesando...";
        buyItemBtn.style.background = "#f1c40f";

        // Pedirle al servidor que ejecute el cobro
        ws.send(MessagePack.encode({ type: 'buy_item', itemId: currentShopItemId }));
    }
});

// --- RECARGA TÃCTICA (MANUAL) ---
const ammoDisplayBox = document.getElementById('ammo-display');

const triggerReload = (e) => {
    e.preventDefault(); // Evita que la pantalla haga zoom accidental
    if (player.equippedWeapon !== "none" && !player.isReloading) {
        const stats = WEAPONS[player.equippedWeapon];

        // Solo recargar si nos faltan balas
        if (stats && player.ammo < stats.magSize) {
            player.isReloading = true;

            // ðŸ”Š NUEVO: Play Reload Sound
            playItemSound(player.equippedWeapon, 'reload', 0.6)

            if (player.reloadTimeout) clearTimeout(player.reloadTimeout);

            player.reloadTimeout = setTimeout(() => {
                player.ammo = stats.magSize;
                if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                player.isReloading = false;
            }, stats.reloadTime);
        }
    }
};

ammoDisplayBox.addEventListener('mousedown', triggerReload);
ammoDisplayBox.addEventListener('touchstart', triggerReload, { passive: false });

// Social Modals & Squads logic has been modularized into js/ui_phone.js
