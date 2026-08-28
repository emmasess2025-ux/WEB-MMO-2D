let currentInspectingItemId = null;

// --- INVENTORY & HOTBAR LOGIC ---
const appInventory = document.getElementById('app-inventory');
const inventoryModal = document.getElementById('inventory-modal');
const closeInventory = document.getElementById('close-inventory');
const inventoryGrid = document.getElementById('inventory-grid');

const equipModal = document.getElementById('equip-modal');
const closeEquipModal = document.getElementById('close-equip-modal');
const equipSlotsContainer = document.getElementById('equip-slots-container');

let equippingSlotIndex = 0; // Remembers which slot you are assigning an item to

// --- HELPER UNIFICADO: Obtener Datos de Arma de cualquier fuente ---
function getWeaponData(itemId) {
    if (!itemId || itemId === 'none') return null;
    if (typeof weaponsDB !== 'undefined' && weaponsDB && weaponsDB[itemId]) return weaponsDB[itemId];
    if (typeof WEAPONS !== 'undefined' && WEAPONS && WEAPONS[itemId]) return WEAPONS[itemId];
    if (window.weaponsDB && window.weaponsDB[itemId]) return window.weaponsDB[itemId];
    if (window.WEAPONS && window.WEAPONS[itemId]) return window.WEAPONS[itemId];
    if (window.MASTER_CATALOG && window.MASTER_CATALOG[itemId]) {
        const cat = window.MASTER_CATALOG[itemId];
        if (cat.category === 'weapon' || cat.type === 'ranged' || cat.type === 'melee' || cat.damage !== undefined) {
            return cat;
        }
    }
    return null;
}

// --- HELPER UNIFICADO: Obtener Datos del Catálogo Maestro ---
function getCatalogData(itemId) {
    if (!itemId || itemId === 'none') return null;
    if (window.MASTER_CATALOG && window.MASTER_CATALOG[itemId]) return window.MASTER_CATALOG[itemId];
    return null;
}

// --- HELPER UNIFICADO: Obtener Imagen / Sprite de Cualquier Ítem ---
function getItemSprite(itemId, isWeapon) {
    if (!itemId || itemId === 'none') return null;

    // 1. Buscar en loadedWeaponSprites
    if (typeof loadedWeaponSprites !== 'undefined' && loadedWeaponSprites && loadedWeaponSprites[itemId]) {
        return loadedWeaponSprites[itemId];
    }
    if (window.loadedWeaponSprites && window.loadedWeaponSprites[itemId]) {
        return window.loadedWeaponSprites[itemId];
    }

    // 2. Buscar en loadedItemSprites
    if (typeof loadedItemSprites !== 'undefined' && loadedItemSprites && loadedItemSprites[itemId]) {
        return loadedItemSprites[itemId];
    }
    if (window.loadedItemSprites && window.loadedItemSprites[itemId]) {
        return window.loadedItemSprites[itemId];
    }

    // 3. Fallback: Si no está precargado pero tenemos su ruta src, inicializar la imagen
    const wData = isWeapon || getWeaponData(itemId);
    if (wData && wData.src) {
        const img = new Image();
        img.src = wData.src;
        if (!window.loadedWeaponSprites) window.loadedWeaponSprites = {};
        window.loadedWeaponSprites[itemId] = img;
        return img;
    }

    const cData = getCatalogData(itemId);
    if (cData && cData.src) {
        const img = new Image();
        img.src = cData.src;
        if (!window.loadedItemSprites) window.loadedItemSprites = {};
        window.loadedItemSprites[itemId] = img;
        return img;
    }

    return null;
}

// 1. App Icon opens the Chooser Modal first!
if (appInventory) {
    appInventory.addEventListener('click', () => {
        if (typeof hideTrayForModal === 'function') hideTrayForModal();
        renderEquipModal();
        if (equipModal) equipModal.style.display = 'flex';
    });
}

if (closeEquipModal) {
    closeEquipModal.addEventListener('click', () => {
        if (equipModal) equipModal.style.display = 'none';
        if (typeof restoreTrayAfterModal === 'function') restoreTrayAfterModal();
    });
}

if (closeInventory) {
    closeInventory.addEventListener('click', () => {
        if (inventoryModal) inventoryModal.style.display = 'none';
        if (typeof restoreTrayAfterModal === 'function') restoreTrayAfterModal();
    });
}

function renderEquipModal() {
    if (!equipSlotsContainer) return;
    equipSlotsContainer.innerHTML = "";
    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.style.width = "75px";
        slot.style.height = "75px";
        slot.style.background = "rgba(0,0,0,0.3)";
        slot.style.border = "2px solid rgba(255,255,255,0.3)";
        slot.style.borderRadius = "12px";
        slot.style.display = "flex";
        slot.style.justifyContent = "center";
        slot.style.alignItems = "center";
        slot.style.cursor = "pointer";
        slot.style.transition = "all 0.2s ease";

        slot.onmouseenter = () => {
            slot.style.background = "rgba(255,255,255,0.15)";
            slot.style.borderColor = "rgba(46, 204, 113, 0.8)";
            slot.style.transform = "scale(1.05)";
        };
        slot.onmouseleave = () => {
            slot.style.background = "rgba(0,0,0,0.3)";
            slot.style.borderColor = "rgba(255,255,255,0.3)";
            slot.style.transform = "scale(1)";
        };

        // Show what is currently in that slot (DINÁMICO)
        const currentSlotItem = (player.hotbar && player.hotbar[i]) || "none";
        if (currentSlotItem && currentSlotItem !== "none") {
            const iconElement = getWeaponIcon(currentSlotItem);
            if (iconElement) {
                iconElement.style.width = "100%";
                iconElement.style.transform = "scale(1.3)";
                slot.appendChild(iconElement);
            }
        } else {
            slot.innerText = "🗡️";
            slot.style.fontSize = "32px";
        }

        // Click a slot -> Open the full backpack to fill it!
        slot.onclick = () => {
            equippingSlotIndex = i; // Remember the slot!
            if (equipModal) equipModal.style.display = 'none';
            renderInventory();
            if (inventoryModal) inventoryModal.style.display = 'flex';
        };
        equipSlotsContainer.appendChild(slot);
    }
}

// --- CREADOR DE ÍCONOS DINÁMICO (CUADRADO PERFECTO 64x64) ---
function getWeaponIcon(itemId) {
    if (!itemId || itemId === 'none') return null;

    const stats = getWeaponData(itemId);
    const catItem = getCatalogData(itemId);
    const isWeapon = !!stats;
    const img = getItemSprite(itemId, isWeapon);

    const tCanvas = document.createElement('canvas');
    tCanvas.width = 64;
    tCanvas.height = 64;
    tCanvas.style.width = "100%";
    tCanvas.style.height = "100%";
    tCanvas.style.objectFit = "contain";
    tCanvas.style.imageRendering = "pixelated";
    const tCtx = tCanvas.getContext('2d');

    const drawIcon = () => {
        const sprite = getItemSprite(itemId, isWeapon);
        if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return false;

        tCtx.clearRect(0, 0, 64, 64);
        tCtx.imageSmoothingEnabled = false;

        if (isWeapon) {
            const frameW = 48;
            const frameH = 64;
            let srcY = 0;
            let destX = 8;
            let destY = -8;

            if (stats && stats.type === 'ranged') {
                srcY = frameH;
                destX = 15;
                destY = -2;
            }

            tCtx.drawImage(sprite, 0, srcY, frameW, frameH, destX, destY, frameW, frameH);
        } else if (catItem) {
            const sx = catItem.drawConfig?.sx ?? catItem.sx ?? 0;
            const sy = catItem.drawConfig?.sy ?? catItem.sy ?? 0;
            tCtx.drawImage(sprite, sx, sy, 16, 16, 16, 16, 32, 32);
        } else {
            tCtx.drawImage(sprite, 0, 0, sprite.naturalWidth, sprite.naturalHeight, 16, 16, 32, 32);
        }
        return true;
    };

    if (img) {
        if (img.complete && img.naturalWidth > 0) {
            drawIcon();
            setTimeout(drawIcon, 0);
        } else {
            img.addEventListener('load', () => { drawIcon(); }, { once: true });
        }
    }

    return tCanvas;
}

// --- HELPER: Detectar si un ítem es cosmético (Ropa, Cabezas, Cuerpos, Sombreros) ---
function isCosmeticItem(itemId) {
    if (!itemId || itemId === 'none') return false;

    // Si está definido como arma de combate en cualquier DB, NO es solo un cosmético
    if (getWeaponData(itemId)) {
        return false;
    }

    // Si está en el catálogo maestro, verificamos su categoría
    const catItem = getCatalogData(itemId);
    if (catItem) {
        const cat = (catItem.category || '').toLowerCase();
        if (['head', 'body', 'hat', 'heads', 'bodies', 'hats', 'clothing', 'clothes', 'wearable', 'cosmetic', 'skin'].includes(cat)) {
            return true;
        }
    }

    // Si no está categorizado explícitamente pero tiene prefijo o id de cabeza/cuerpo/sombrero
    const idStr = String(itemId).toLowerCase();
    if (idStr.startsWith('head_') || idStr.startsWith('body_') || idStr.startsWith('hat_') || idStr === 'head_default' || idStr === 'body_default') {
        return true;
    }

    return false;
}

function renderInventory() {
    if (!inventoryGrid) return;
    inventoryGrid.innerHTML = "";

    // --- 1. EL SLOT "EMPTY" PARA DESEQUIPAR / VACIAR MANOS ---
    const noneSlot = document.createElement('div');
    noneSlot.style.width = "100%";
    noneSlot.style.aspectRatio = "1/1";
    noneSlot.style.background = "rgba(255, 107, 107, 0.12)";
    noneSlot.style.border = "1.5px dashed rgba(255, 107, 107, 0.4)";
    noneSlot.style.borderRadius = "10px";
    noneSlot.style.display = "flex";
    noneSlot.style.flexDirection = "column";
    noneSlot.style.justifyContent = "center";
    noneSlot.style.alignItems = "center";
    noneSlot.style.cursor = "pointer";
    noneSlot.style.transition = "all 0.2s ease";
    noneSlot.title = "Vaciar manos / Desequipar";
    noneSlot.innerHTML = "<span style='font-size: 16px; margin-bottom: 2px;'>🚫</span><span style='font-size: 9px; font-weight: 900; letter-spacing: 0.5px; color: #ff6b6b;'>EMPTY</span>";

    noneSlot.onmouseenter = () => {
        noneSlot.style.background = "rgba(255, 107, 107, 0.25)";
        noneSlot.style.borderColor = "rgba(255, 107, 107, 0.8)";
        noneSlot.style.transform = "scale(1.04)";
    };
    noneSlot.onmouseleave = () => {
        noneSlot.style.background = "rgba(255, 107, 107, 0.12)";
        noneSlot.style.borderColor = "rgba(255, 107, 107, 0.4)";
        noneSlot.style.transform = "scale(1)";
    };

    noneSlot.onclick = () => {
        const previousWeapon = player.equippedWeapon;

        // 💾 GUARDAR ESTADO AL VACIAR LAS MANOS
        if (previousWeapon !== "none" && WEAPONS && WEAPONS[previousWeapon] && WEAPONS[previousWeapon].type === 'ranged') {
            player.weaponAmmo[previousWeapon] = player.ammo;
        }

        if (player.hotbar) {
            player.hotbar[equippingSlotIndex] = "none";
        }

        if (player.activeSlot === equippingSlotIndex) {
            player.equippedWeapon = "none";
            if (typeof playItemSound === 'function') playItemSound(previousWeapon, 'equip', 0.5);
        }

        renderHudHotbar();
        if (inventoryModal) inventoryModal.style.display = 'none';
        if (typeof restoreTrayAfterModal === 'function') restoreTrayAfterModal();

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'update_hotbar', slotIndex: equippingSlotIndex, weaponId: "none" }));
        }
    };
    inventoryGrid.appendChild(noneSlot);

    // --- 2. FILTRAR ITEMS REALES (EXCLUYENDO ROPA, CABEZAS, SOMBREROS) ---
    const rawList = player.inventory || [];
    const validItems = [];

    rawList.forEach(rawItem => {
        if (!rawItem) return;
        const itemId = (typeof rawItem === 'object') ? rawItem.id : rawItem;
        const qty = (typeof rawItem === 'object') ? (rawItem.quantity || 1) : 1;
        if (!itemId || itemId === "none") return;

        // Si es cosmético, se gestiona exclusivamente desde el perfil / armario
        if (isCosmeticItem(itemId)) return;

        validItems.push({ id: itemId, qty: qty, raw: rawItem });
    });

    // --- 3. GENERACIÓN DINÁMICA DE CARDS (MÍNIMO 11 SLOTS DEFAULT PARA 12 CASILLAS 3x4) ---
    const minSlots = 11;
    const totalSlotsToRender = Math.max(minSlots, validItems.length);

    for (let i = 0; i < totalSlotsToRender; i++) {
        const slot = document.createElement('div');
        slot.style.width = "100%";
        slot.style.aspectRatio = "1/1";
        slot.style.borderRadius = "10px";
        slot.style.display = "flex";
        slot.style.justifyContent = "center";
        slot.style.alignItems = "center";
        slot.style.position = "relative";
        slot.style.transition = "all 0.2s ease";
        slot.style.boxSizing = "border-box";

        const itemData = validItems[i];

        if (itemData) {
            const itemId = itemData.id;
            const qty = itemData.qty;

            slot.style.background = "rgba(255, 255, 255, 0.05)";
            slot.style.border = "1px solid rgba(255, 255, 255, 0.15)";
            slot.style.cursor = "pointer";

            // Hover effect
            slot.onmouseenter = () => {
                slot.style.background = "rgba(255, 255, 255, 0.12)";
                slot.style.borderColor = "rgba(46, 204, 113, 0.7)";
                slot.style.transform = "scale(1.04)";
                slot.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
            };
            slot.onmouseleave = () => {
                slot.style.background = "rgba(255, 255, 255, 0.05)";
                slot.style.borderColor = "rgba(255, 255, 255, 0.15)";
                slot.style.transform = "scale(1)";
                slot.style.boxShadow = "none";
            };

            // Ícono pixel-art unificado (idéntico y perfectamente alineado como en el hotbar y ranuras)
            const iconElement = getWeaponIcon(itemId);
            if (iconElement) {
                iconElement.style.transform = "scale(1.2)";
                slot.appendChild(iconElement);
            }

            // Indicador de Hotbar (H1, H2, H3) si está equipado en una ranura
            const equippedInSlot = player.hotbar ? player.hotbar.indexOf(itemId) : -1;
            if (equippedInSlot !== -1) {
                const equipBadge = document.createElement('div');
                equipBadge.style.position = 'absolute';
                equipBadge.style.top = '3px';
                equipBadge.style.left = '3px';
                equipBadge.style.background = '#2ecc71';
                equipBadge.style.color = '#000';
                equipBadge.style.fontSize = '9px';
                equipBadge.style.fontWeight = '900';
                equipBadge.style.padding = '1px 4px';
                equipBadge.style.borderRadius = '4px';
                equipBadge.innerText = `H${equippedInSlot + 1}`;
                slot.appendChild(equipBadge);
            }

            // Badge de Cantidad (x2, x3, etc.)
            if (qty > 1) {
                const badge = document.createElement('div');
                badge.style.position = 'absolute';
                badge.style.bottom = '3px';
                badge.style.right = '3px';
                badge.style.background = 'rgba(0, 0, 0, 0.85)';
                badge.style.color = '#fff';
                badge.style.fontSize = '10px';
                badge.style.padding = '2px 5px';
                badge.style.borderRadius = '5px';
                badge.style.fontWeight = 'bold';
                badge.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                badge.innerText = `x${qty}`;
                slot.appendChild(badge);
            }

            // Abrir Inspector
            slot.onclick = () => {
                openItemInspector(itemId, qty);
            };

            const isWeapon = getWeaponData(itemId);
            const catalogItem = getCatalogData(itemId);
            const itemName = (isWeapon && isWeapon.name) || (catalogItem && catalogItem.name) || itemId;
            slot.title = `${itemName} (x${qty})`;

        } else {
            // Slot vacío (placeholder de cuadrícula)
            slot.style.background = "rgba(0, 0, 0, 0.2)";
            slot.style.border = "1px dashed rgba(255, 255, 255, 0.08)";
            slot.style.cursor = "default";
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
    const btnQuickSwap = document.getElementById('btn-quickswap-item');
    const canvas = document.getElementById('item-detail-canvas');
    if (!modal || !title || !statsBox || !btnEquip || !canvas) return;

    const ctx = canvas.getContext('2d');

    // 🛑 LIMPIEZA INICIAL DE SEGURIDAD
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    title.innerText = "Cargando...";
    statsBox.innerHTML = "";
    btnEquip.style.display = 'none';
    btnEquip.disabled = false;
    btnEquip.style.background = "#27ae60";

    if (qtyTxt) qtyTxt.innerText = `x${quantity}`;

    const isWeapon = getWeaponData(itemId);
    const catalogItem = getCatalogData(itemId);

    if (isWeapon) {
        const w = isWeapon;
        title.innerText = w.name || itemId;
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
                    <b>${w.speed || w.fireRate || 1} SPD</b>
                </div>
            </div>
        `;

        btnEquip.style.display = 'block';
        btnEquip.innerText = (player.equippedWeapon === itemId) ? "Equipada" : "🗡️ Equipar";
        if (player.equippedWeapon === itemId) btnEquip.disabled = true;

        if (btnQuickSwap) {
            btnQuickSwap.style.display = 'block';
            if (player.quickSwaps && player.quickSwaps.includes(itemId)) {
                btnQuickSwap.innerText = "⭐ En Hotkey";
                btnQuickSwap.style.background = "#7f8c8d";
                btnQuickSwap.style.boxShadow = "0 4px 0 #34495e";
            } else {
                btnQuickSwap.innerText = "⭐ Hotkey";
                btnQuickSwap.style.background = "#9b59b6";
                btnQuickSwap.style.boxShadow = "0 4px 0 #8e44ad";
            }
        }

        const wsImg = getItemSprite(itemId, isWeapon);
        const frameW = 48;
        const frameH = 64;

        canvas.width = 64;
        canvas.height = 64;
        canvas.style.width = "96px";
        canvas.style.height = "96px";
        canvas.style.objectFit = "contain";
        canvas.style.imageRendering = "pixelated";

        const drawWeaponInspector = () => {
            const sprite = getItemSprite(itemId, isWeapon);
            if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return;

            let srcY = 0;
            let destX = 8;
            let destY = -8;

            if (w.type === 'ranged') {
                srcY = frameH;
                destX = 15;
                destY = -2;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, 0, srcY, frameW, frameH, destX, destY, frameW, frameH);
        };

        if (wsImg) {
            if (wsImg.complete && wsImg.naturalWidth > 0) {
                drawWeaponInspector();
                setTimeout(drawWeaponInspector, 0);
            } else {
                wsImg.addEventListener('load', () => { drawWeaponInspector(); }, { once: true });
            }
        }
    }
    // 📦 INSPECTOR UNIVERSAL PARA CUALQUIER OTRO OBJETO
    else if (catalogItem) {
        if (btnQuickSwap) btnQuickSwap.style.display = 'none';

        const item = catalogItem;

        title.innerText = item.name || itemId;
        title.style.color = '#00d2d3';

        let loreText = "Un objeto misterioso de este mundo.";
        if (item.category === 'junk') loreText = "Material de desecho recolectado en el mapa.";
        if (item.category === 'metal') loreText = "Mineral valioso extraído del subsuelo.";
        if (item.category === 'food') loreText = "Parece comestible. Recupera salud.";

        const itemValue = item.value || item.price || 0;

        statsBox.innerHTML = `
            <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
                <div style="background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); color: #f39c12; font-size: 12px; text-transform: uppercase;">
                    <b>${item.category || 'Item'}</b>
                </div>
                <div style="background: rgba(46, 204, 113, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(46, 204, 113, 0.3); color: #2ecc71; font-size: 12px;">
                    Value: <b>${itemValue} 🪙</b>
                </div>
            </div>
            <div style="color:#95a5a6; font-size: 11px; font-style: italic; line-height: 1.3;">"${loreText}"</div>
        `;

        const img = getItemSprite(itemId, false);
        canvas.width = 64;
        canvas.height = 64;
        canvas.style.width = "auto";
        canvas.style.height = "96px";
        canvas.style.objectFit = "contain";

        const drawCatInspector = () => {
            const sprite = getItemSprite(itemId, false);
            if (!sprite || !sprite.complete || sprite.naturalWidth === 0) return;

            const sx = item.drawConfig?.sx ?? item.sx ?? 0;
            const sy = item.drawConfig?.sy ?? item.sy ?? 0;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, sx, sy, 16, 16, 0, 0, 64, 64);
        };

        if (img) {
            if (img.complete && img.naturalWidth > 0) {
                drawCatInspector();
                setTimeout(drawCatInspector, 0);
            } else {
                img.addEventListener('load', () => { drawCatInspector(); }, { once: true });
            }
        }
    } else {
        if (btnQuickSwap) btnQuickSwap.style.display = 'none';
        title.innerText = "Objeto Desconocido";
        statsBox.innerHTML = `<div style="color:orange;">ID: ${itemId}<br>No se encontró en la base de datos local.</div>`;
    }

    modal.style.display = 'flex';
}

// Eventos de los Botones del Inspector
const btnCloseItemDetail = document.getElementById('btn-close-item-detail');
if (btnCloseItemDetail) {
    btnCloseItemDetail.onclick = () => {
        const modal = document.getElementById('item-detail-modal');
        if (modal) modal.style.display = 'none';
    };
}

// --- EL BOTÓN VERDE DEL INSPECTOR AHORA SE CONECTA A TU HOTBAR ---
const btnEquipItem = document.getElementById('btn-equip-item');
if (btnEquipItem) {
    btnEquipItem.onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN && currentInspectingItemId) {
            // 1. Asignar el arma a tu Hotbar activo
            if (player.hotbar) {
                player.hotbar[equippingSlotIndex] = currentInspectingItemId;
            }
            if (player.activeSlot === equippingSlotIndex) {
                player.equippedWeapon = currentInspectingItemId;
            }

            // 2. Actualizar la interfaz (El HUD de abajo)
            renderHudHotbar();

            // 3. Avisar al servidor del cambio
            ws.send(MessagePack.encode({
                type: 'update_hotbar',
                slotIndex: equippingSlotIndex,
                weaponId: currentInspectingItemId
            }));

            // 4. Cerrar ambos menús (El inspector flotante y la cuadrícula grande)
            const modal = document.getElementById('item-detail-modal');
            if (modal) modal.style.display = 'none';
            if (inventoryModal) inventoryModal.style.display = 'none';
            if (typeof restoreTrayAfterModal === 'function') restoreTrayAfterModal();
        }
    };
}

function renderHudHotbar() {
    for (let i = 0; i < 3; i++) {
        const slot = document.getElementById('hud-slot-' + i);
        if (!slot) continue;
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
        const hudItem = player.hotbar ? player.hotbar[i] : "none";
        if (hudItem && hudItem !== "none") {
            const iconElement = getWeaponIcon(hudItem);
            if (iconElement) {
                iconElement.style.transform = "scale(1.3)";
                iconElement.style.opacity = (player.activeSlot === i && player.equippedWeapon === "none") ? "0.3" : "1";
                slot.appendChild(iconElement);
            }
        }

        // 👆 LA MAGIA MULTI-TOUCH
        slot.onpointerdown = (e) => {
            if (e) e.preventDefault();

            const qsMenu = document.getElementById('quickswap-menu');
            if (qsMenu && qsMenu.style.display !== 'none') {
                qsMenu.style.display = 'none';
            }

            // 🔊 Memorize what we are holding BEFORE we change it
            const previousWeapon = player.equippedWeapon;

            // 💾 GUARDAR EL ESTADO DE LAS BALAS ANTES DE GUARDAR EL ARMA
            if (previousWeapon !== "none" && WEAPONS && WEAPONS[previousWeapon] && WEAPONS[previousWeapon].type === 'ranged') {
                player.weaponAmmo[previousWeapon] = player.ammo;
            }

            if (player.activeSlot === i) {
                player.equippedWeapon = (player.equippedWeapon === "none") ? ((player.hotbar && player.hotbar[i]) || "none") : "none";
            } else {
                player.activeSlot = i;
                player.equippedWeapon = (player.hotbar && player.hotbar[i]) || "none";
            }

            const soundToPlay = player.equippedWeapon !== "none" ? player.equippedWeapon : previousWeapon;
            if (typeof playItemSound === 'function') playItemSound(soundToPlay, 'equip', 0.5);

            if (player.reloadTimeout) clearTimeout(player.reloadTimeout);

            const stats = WEAPONS ? WEAPONS[player.equippedWeapon] : null;
            if (stats) {
                if (stats.type === 'melee') {
                    player.ammo = Infinity;
                    player.isReloading = false;
                } else {
                    // 💾 CARGAR EL ESTADO DE LAS BALAS
                    if (!player.weaponAmmo) player.weaponAmmo = {};
                    if (player.weaponAmmo[player.equippedWeapon] === undefined) {
                        player.weaponAmmo[player.equippedWeapon] = stats.magSize;
                    }
                    player.ammo = player.weaponAmmo[player.equippedWeapon];

                    // Solo recargamos si el arma se guardó vacía
                    if (player.ammo <= 0) {
                        player.isReloading = true;
                        if (typeof playItemSound === 'function') playItemSound(player.equippedWeapon, 'reload', 0.6);
                        player.reloadTimeout = setTimeout(() => {
                            player.ammo = stats.magSize;
                            if (ws && ws.readyState === WebSocket.OPEN) {
                                ws.send(MessagePack.encode({ type: 'reload_weapon', weaponId: player.equippedWeapon }));
                            }
                            player.weaponAmmo[player.equippedWeapon] = stats.magSize;
                            player.isReloading = false;
                        }, stats.reloadTime);
                    } else {
                        player.isReloading = false;
                    }
                }
            } else {
                player.ammo = 0;
                player.isReloading = false;
            }

            renderHudHotbar();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'equip_weapon', weaponId: player.equippedWeapon }));
            }
        };
    }
}

// Global exports & initialization
window.renderHudHotbar = renderHudHotbar;
window.renderInventory = renderInventory;
window.renderEquipModal = renderEquipModal;
window.openItemInspector = openItemInspector;
window.getWeaponIcon = getWeaponIcon;
window.getWeaponData = getWeaponData;
window.getCatalogData = getCatalogData;
window.getItemSprite = getItemSprite;

setTimeout(() => {
    if (typeof renderHudHotbar === 'function') renderHudHotbar();
}, 200);