// =========================================================
//  SISTEMA DE LA JOYERÍA (MERCADO DE METALES)
// =========================================================
let isJewelerOpen = false;
let lastJewelerTile = null;
let currentSelectedMetalId = null;

function openJewelerModal() {
    const listDiv = document.getElementById('jeweler-list');
    listDiv.innerHTML = '';

    currentSelectedMetalId = null;
    document.getElementById('metal-visualizer').style.display = 'none';
    document.getElementById('visualizer-metal-placeholder').style.display = 'flex';

    let totalEarned = 0;
    let metalCounts = {};
    let hasItems = false;

    // 1. Contar items que sean metales
    if (player.inventory) {
        player.inventory.forEach(item => {
            let id = (typeof item === 'object') ? item.id : item;
            let qty = (typeof item === 'object') ? (item.quantity || 1) : 1;

            // Comprobamos si el ID existe en nuestro catálogo de metales
            if (CLIENT_METALS_CATALOG.some(m => m.id === id)) {
                metalCounts[id] = (metalCounts[id] || 0) + qty;
                hasItems = true;
            }
        });
    }

    // 2. Generar filas
    if (!hasItems) {
        listDiv.innerHTML = '<p style="color: #95a5a6; text-align:center; padding: 20px; font-style:italic;">No traes minerales en tu inventario.</p>';
    } else {
        CLIENT_METALS_CATALOG.forEach(m => {
            if (metalCounts[m.id]) {
                const qty = metalCounts[m.id];
                totalEarned += (qty * m.value);

                const row = document.createElement('div');
                row.className = 'trash-row';
                row.id = `row-metal-${m.id}`;
                row.onclick = () => selectMetalItemForPreview(m.id, qty);

                row.innerHTML = `
                            <div style="display:flex; align-items:center; gap:8px;">
                                <canvas id="icon-metal-${m.id}" width="16" height="16" style="width:20px; height:20px; image-rendering:pixelated;"></canvas>
                                <div style="font-weight:bold; font-size:13px;">${m.name}</div>
                            </div>
                            <div style="color:#00d2d3; font-weight:bold; font-family: monospace;">x${qty}</div>
                        `;
                listDiv.appendChild(row);

                // Dibujar Sprite
                setTimeout(() => {
                    const ctx = document.getElementById(`icon-metal-${m.id}`)?.getContext('2d');
                    const sx = m.drawConfig?.sx ?? m.sx ?? 0;
                    const sy = m.drawConfig?.sy ?? m.sy ?? 0;
                    if (ctx && metalsSpritesheet.complete) {
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(metalsSpritesheet, sx, sy, 16, 16, 0, 0, 16, 16);
                    }
                }, 10);
            }
        });

        // Botón "Vender Todo"
        const allRow = document.createElement('div');
        allRow.className = 'trash-row';
        allRow.id = 'row-metal-all';
        allRow.style.borderTop = '1px dashed rgba(0,210,211,0.2)';
        allRow.style.marginTop = '10px';
        allRow.style.background = 'rgba(0, 210, 211, 0.1)';

        allRow.onclick = () => selectAllMetalsForPreview(metalCounts, totalEarned);
        allRow.innerHTML = `
                    <div style="font-weight:bold; font-size:13px; color:#00d2d3;"> Vender Todos los Minerales</div>
                    <div style="text-align:right; color:#2ecc71; font-weight:bold;">+${totalEarned} 🪙</div>
                `;
        listDiv.appendChild(allRow);
    }

    document.getElementById('jeweler-modal').style.display = 'flex';
}

function selectMetalItemForPreview(itemId, totalOwned) {
    const oldRow = document.querySelector('#jeweler-list .trash-row.selected');
    if (oldRow) oldRow.classList.remove('selected');
    document.getElementById(`row-metal-${itemId}`).classList.add('selected');

    currentSelectedMetalId = itemId;
    document.getElementById('visualizer-metal-placeholder').style.display = 'none';
    const vis = document.getElementById('metal-visualizer');
    vis.style.display = 'flex';

    const m = CLIENT_METALS_CATALOG.find(x => x.id === itemId);
    const sx = m.drawConfig?.sx ?? m.sx ?? 0;
    const sy = m.drawConfig?.sy ?? m.sy ?? 0;

    vis.innerHTML = `
                <canvas id="metal-preview-canvas" width="64" height="64" style="background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid rgba(0,210,211,0.2); image-rendering: pixelated; margin-bottom: 5px; box-shadow: 0 0 15px rgba(0,210,211,0.2);"></canvas>
                <div style="font-weight: bold; color: #00d2d3; margin-bottom: 5px; font-size: 16px;">${m.name}</div>
                <div style="font-size: 11px; color: #bdc3c7; margin-bottom: 5px;">Valor: <span style="color: #2ecc71;">${m.value} 🪙 c/u</span></div>
                
                <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px; background:rgba(0,0,0,0.3); padding:5px; border-radius:6px;">
                    <label style="font-size: 12px; color: #7f8c8d;">Vender:</label>
                    <input type="number" id="sell-metal-qty" min="1" max="${totalOwned}" value="1" style="width:50px; text-align:center; background:rgba(0,0,0,0.8); color:white; border:1px solid #00d2d3; border-radius:4px; outline:none;">
                    <span style="font-size: 12px; color: #7f8c8d;"> / ${totalOwned}</span>
                </div>

                <div style="margin-bottom: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; width:100%; text-align:center;">
                    <span style="font-size: 11px; color:#bdc3c7">Ganancia:</span>
                    <div style="font-size: 24px; font-weight: bold; color: #2ecc71;" id="calc-metal-payout">+${m.value} 🪙</div>
                </div>
                <button class="btn-green" style="width: 100%; margin-top:auto; background: #00b894;" id="btn-sell-metal-action">Vender selección</button>
            `;

    setTimeout(() => {
        const cctx = document.getElementById('metal-preview-canvas')?.getContext('2d');
        if (cctx && metalsSpritesheet.complete) {
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(metalsSpritesheet, sx, sy, 16, 16, 0, 0, 64, 64);
        }
    }, 10);

    const sqi = document.getElementById('sell-metal-qty');
    sqi.oninput = () => {
        let val = parseInt(sqi.value) || 0;
        if (val > totalOwned) { val = totalOwned; sqi.value = val; }
        if (val < 1) val = 1;
        document.getElementById('calc-metal-payout').innerText = `+${val * m.value} 🪙`;
    };

    document.getElementById('btn-sell-metal-action').onclick = () => {
        const qty = parseInt(sqi.value) || 1;
        if (ws.readyState === WebSocket.OPEN && qty > 0) {
            ws.send(MessagePack.encode({ type: 'sell_individual_metal', itemId: itemId, quantity: qty }));
        }
    };
}

function selectAllMetalsForPreview(metalCounts, totalEarned) {
    const oldRow = document.querySelector('#jeweler-list .trash-row.selected');
    if (oldRow) oldRow.classList.remove('selected');
    document.getElementById('row-metal-all').classList.add('selected');

    currentSelectedMetalId = 'all';
    document.getElementById('visualizer-metal-placeholder').style.display = 'none';
    const vis = document.getElementById('metal-visualizer');
    vis.style.display = 'flex';

    let breakdownHTML = `<div style="width:90%; flex: 1; min-height: 0; overflow-y: auto; text-align:left; background:rgba(0,0,0,0.4); border-radius:6px; padding:10px; margin-bottom:15px; border:1px solid rgba(0,210,211,0.2);">`;

    CLIENT_METALS_CATALOG.forEach(m => {
        if (metalCounts[m.id]) {
            const qty = metalCounts[m.id];
            breakdownHTML += `
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px;">
                    <span style="color:#bdc3c7;">${m.name} <span style="color:#00d2d3;">(x${qty})</span></span>
                    <span style="color:#2ecc71; font-family:monospace;">+${qty * m.value}</span>
                </div>`;
        }
    });
    breakdownHTML += `</div>`;

    vis.innerHTML = `
                <div style="font-weight: bold; color: #00d2d3; margin-bottom: 10px; font-size: 18px; flex-shrink: 0;"> Lote de Minerales</div>
                <div style="font-size: 11px; color: #7f8c8d; margin-bottom: 5px; flex-shrink: 0;">Recibo de Venta:</div>
                ${breakdownHTML}
                <div style="margin-bottom: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; width:90%; text-align:center; flex-shrink: 0;">
                    <span style="font-size: 11px; color:#bdc3c7">Ganancia Total:</span>
                    <div style="font-size: 26px; font-weight: bold; color: #2ecc71;">+${totalEarned} 🪙</div>
                </div>
                <button class="btn-green" style="width: 100%; flex-shrink: 0; background: #00b894;" id="btn-sell-metal-action">Liquidar Todos los Minerales</button>
            `;

    document.getElementById('btn-sell-metal-action').onclick = () => {
        const btn = document.getElementById('btn-sell-metal-action');
        btn.innerText = "Procesando venta...";
        btn.style.background = "#7f8c8d";
        btn.disabled = true;

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'sell_all_metals' }));
        }
    };
}

document.getElementById('btn-close-jeweler').onclick = () => {
    document.getElementById('jeweler-modal').style.display = 'none';
    isJewelerOpen = false;
};

// Y AÑADIMOS EL DISPARADOR PARA CUANDO PISES EL BLOQUE
// Busca la función executeTileLogic() y agrega esta condición:

let isJunkyardOpen = false;
let lastJunkyardTile = null;
// 👇 AÑADE ESTA LÍNEA 👇
let lastNpcTile = null;

let CLIENT_TRASH_CATALOG = [];

// =========================================================
//  SISTEMA DEL YONKE (INTERFAZ DINÁMICA)
// =========================================================
let currentSelectedTrashId = null;

function openJunkyardModal() {
    const listDiv = document.getElementById('junkyard-list');
    listDiv.innerHTML = '';

    // Resetear la pantalla derecha
    currentSelectedTrashId = null;
    document.getElementById('trash-visualizer').style.display = 'none';
    document.getElementById('visualizer-placeholder').style.display = 'flex';

    let totalEarned = 0;
    let trashCounts = {};
    let hasItems = false;

    // 1. Contar items
    if (player.inventory) {
        player.inventory.forEach(item => {
            let id = (typeof item === 'object') ? item.id : item;
            let qty = (typeof item === 'object') ? (item.quantity || 1) : 1;

            if (id && id.startsWith('trash_')) {
                trashCounts[id] = (trashCounts[id] || 0) + qty;
                hasItems = true;
            }
        });
    }

    // 2. Generar filas
    if (!hasItems) {
        listDiv.innerHTML = '<p style="color: #95a5a6; text-align:center; padding: 20px; font-style:italic;">No traes basura en tu inventario.</p>';
    } else {
        // A. Filas individuales
        CLIENT_TRASH_CATALOG.forEach(t => {
            if (trashCounts[t.id]) {
                const qty = trashCounts[t.id];
                totalEarned += (qty * t.value);

                const row = document.createElement('div');
                row.className = 'trash-row';
                row.id = `row-${t.id}`;
                row.onclick = () => selectTrashItemForPreview(t.id, qty);

                // 🛑 EL FIX: Añadimos un pequeño <canvas> para el icono al lado del nombre
                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <canvas id="icon-${t.id}" width="16" height="16" style="width:20px; height:20px; image-rendering:pixelated;"></canvas>
                        <div style="font-weight:bold; font-size:13px;">${t.name}</div>
                    </div>
                    <div style="color:#bdc3c7; font-weight:bold; font-family: monospace;">x${qty}</div>
                `;
                listDiv.appendChild(row);

                // Dibujamos el sprite en el canvas pequeñito de la lista
                setTimeout(() => {
                    const ctx = document.getElementById(`icon-${t.id}`)?.getContext('2d');
                    if (ctx && trashSpritesheet.complete) {
                        ctx.imageSmoothingEnabled = false;
                        ctx.drawImage(trashSpritesheet, t.sx, t.sy, 16, 16, 0, 0, 16, 16);
                    }
                }, 10);
            }
        });

        // B. 🛑 EL FIX: Fila especial de "TODA LA MOCHILA" al final de la lista
        const allRow = document.createElement('div');
        allRow.className = 'trash-row';
        allRow.id = 'row-all';
        allRow.style.borderTop = '1px dashed rgba(255,255,255,0.2)';
        allRow.style.marginTop = '10px';
        allRow.style.background = 'rgba(39, 174, 96, 0.1)';

        allRow.onclick = () => selectAllTrashForPreview(trashCounts, totalEarned);
        allRow.innerHTML = `
            <div style="font-weight:bold; font-size:13px; color:#2ecc71;">📦 Vender Toda la Mochila</div>
            <div style="text-align:right; color:#2ecc71; font-weight:bold;">+${totalEarned} 🪙</div>
        `;
        listDiv.appendChild(allRow);
    }

    document.getElementById('junkyard-modal').style.display = 'flex';
}

// --- PANTALLA DERECHA: VENTA INDIVIDUAL ---
function selectTrashItemForPreview(itemId, totalOwned) {
    const oldRow = document.querySelector('.trash-row.selected');
    if (oldRow) oldRow.classList.remove('selected');
    document.getElementById(`row-${itemId}`).classList.add('selected');

    currentSelectedTrashId = itemId;
    document.getElementById('visualizer-placeholder').style.display = 'none';
    const vis = document.getElementById('trash-visualizer');
    vis.style.display = 'flex';

    const t = CLIENT_TRASH_CATALOG.find(x => x.id === itemId);

    // Inyectamos el HTML dinámico para 1 solo ítem
    vis.innerHTML = `
        <canvas id="junk-preview-canvas" width="64" height="64" style="background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); image-rendering: pixelated; margin-bottom: 5px;"></canvas>
        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 5px; font-size: 16px;">${t.name}</div>
        <div style="font-size: 11px; color: #bdc3c7; margin-bottom: 15px;">Valor: <span style="color: #2ecc71;">${t.value} 🪙 c/u</span></div>
        
        <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px; background:rgba(0,0,0,0.3); padding:5px; border-radius:6px;">
            <label style="font-size: 12px; color: #7f8c8d;">Vender:</label>
            <input type="number" id="sell-quantity-input" min="1" max="${totalOwned}" value="1" style="width:50px; text-align:center; background:rgba(0,0,0,0.8); color:white; border:1px solid #555; border-radius:4px; outline:none;">
            <span style="font-size: 12px; color: #7f8c8d;"> / ${totalOwned}</span>
        </div>

        <div style="margin-bottom: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; width:100%; text-align:center;">
            <span style="font-size: 11px; color:#bdc3c7">Ganancia:</span>
            <div style="font-size: 24px; font-weight: bold; color: #2ecc71;" id="calc-junk-payout">+${t.value} 🪙</div>
        </div>
        <button class="btn-green" style="width: 100%; margin-top:auto;" id="btn-sell-action">Sell selection</button>
    `;

    // Dibujar el icono grande
    setTimeout(() => {
        const cctx = document.getElementById('junk-preview-canvas')?.getContext('2d');
        if (cctx && trashSpritesheet.complete) {
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(trashSpritesheet, t.sx, t.sy, 16, 16, 0, 0, 64, 64);
        }
    }, 10);

    // Lógica matemática del input
    const sqi = document.getElementById('sell-quantity-input');
    sqi.oninput = () => {
        let val = parseInt(sqi.value) || 0;
        if (val > totalOwned) { val = totalOwned; sqi.value = val; } // Limitar al máximo
        if (val < 1) val = 1;
        document.getElementById('calc-junk-payout').innerText = `+${val * t.value} 🪙`;
    };

    // Botón Vender Individual
    document.getElementById('btn-sell-action').onclick = () => {
        const qty = parseInt(sqi.value) || 1;
        if (ws.readyState === WebSocket.OPEN && qty > 0) {
            ws.send(MessagePack.encode({ type: 'sell_individual_trash', itemId: itemId, quantity: qty }));
        }
    };
}

// --- PANTALLA DERECHA: DESGLOSE DE "TODO" ---
function selectAllTrashForPreview(trashCounts, totalEarned) {
    const oldRow = document.querySelector('.trash-row.selected');
    if (oldRow) oldRow.classList.remove('selected');
    document.getElementById('row-all').classList.add('selected');

    currentSelectedTrashId = 'all';
    document.getElementById('visualizer-placeholder').style.display = 'none';
    const vis = document.getElementById('trash-visualizer');
    vis.style.display = 'flex';

    // 🛑 EL FIX CSS: Agregamos flex: 1 y min-height: 0 para un scroll perfecto interno
    let breakdownHTML = `<div style="width:100%; flex: 1; min-height: 0; overflow-y: auto; text-align:left; background:rgba(0,0,0,0.4); border-radius:6px; padding:10px; margin-bottom:15px; border:1px solid rgba(255,255,255,0.05);">`;

    CLIENT_TRASH_CATALOG.forEach(t => {
        if (trashCounts[t.id]) {
            const qty = trashCounts[t.id];
            breakdownHTML += `
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px;">
                    <span style="color:#bdc3c7;">${t.name} <span style="color:#7f8c8d;">(x${qty})</span></span>
                    <span style="color:#2ecc71; font-family:monospace;">+${qty * t.value}</span>
                </div>`;
        }
    });
    breakdownHTML += `</div>`;

    // 🛑 EL FIX CSS: Agregamos flex-shrink: 0 a los textos y al botón para protegerlos del colapso
    vis.innerHTML = `
        <div style="font-weight: bold; color: #2ecc71; margin-bottom: 10px; font-size: 18px; flex-shrink: 0;">📦 Lote Completo</div>
        <div style="font-size: 11px; color: #7f8c8d; margin-bottom: 5px; flex-shrink: 0;">Recibo de Venta:</div>
        
        ${breakdownHTML}

        <div style="margin-bottom: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; width:100%; text-align:center; flex-shrink: 0;">
            <span style="font-size: 11px; color:#bdc3c7">Ganancia Total:</span>
            <div style="font-size: 26px; font-weight: bold; color: #2ecc71;">+${totalEarned} 🪙</div>
        </div>
        <button class="btn-green" style="width: 100%; flex-shrink: 0;" id="btn-sell-action">Liquidar Toda la Mochila</button>
    `;

    // Botón Vender Todo
    document.getElementById('btn-sell-action').onclick = () => {
        const btn = document.getElementById('btn-sell-action');

        // Efecto visual de que sí le diste clic
        btn.innerText = "Procesando venta...";
        btn.style.background = "#7f8c8d";
        btn.disabled = true;

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'sell_all_trash' }));
        }
    };
}

// Botón Cerrar Global
document.getElementById('btn-close-junkyard').onclick = () => {
    document.getElementById('junkyard-modal').style.display = 'none';
    isJunkyardOpen = false;
};

// --- NUEVO: FUNCIÓN DE PREVISUALIZACIÓN Y VENTA INDIVIDUAL ---
const sellQtyInput = document.getElementById('sell-quantity-input');

// --- PANTALLA DERECHA: VENTA INDIVIDUAL ---
function selectTrashItemForPreview(itemId, totalOwned) {
    // 1. Efecto visual de selección en la lista
    const oldRow = document.querySelector('.trash-row.selected');
    if (oldRow) oldRow.classList.remove('selected');
    document.getElementById(`row-${itemId}`).classList.add('selected');

    // 2. Activar pantalla derecha
    currentSelectedTrashId = itemId;
    document.getElementById('visualizer-placeholder').style.display = 'none';
    const vis = document.getElementById('trash-visualizer');
    vis.style.display = 'flex';

    // 3. Obtener los datos del ítem
    const t = CLIENT_TRASH_CATALOG.find(x => x.id === itemId);

    // 4. Inyectar TODO el HTML dinámico (Esto reemplaza a los viejos innerText)
    vis.innerHTML = `
        <canvas id="junk-preview-canvas" width="64" height="64" style="background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); image-rendering: pixelated; margin-bottom: 5px;"></canvas>
        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 5px; font-size: 16px;">${t.name}</div>
        <div style="font-size: 11px; color: #bdc3c7; margin-bottom: 5px;">Valor: <span style="color: #2ecc71;">${t.value} 🪙 c/u</span></div>
        
        <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px; background:rgba(0,0,0,0.3); padding:5px; border-radius:6px;">
            <label style="font-size: 12px; color: #7f8c8d;">Vender:</label>
            <input type="number" id="sell-quantity-input" min="1" max="${totalOwned}" value="1" style="width:50px; text-align:center; background:rgba(0,0,0,0.8); color:white; border:1px solid #555; border-radius:4px; outline:none;">
            <span style="font-size: 12px; color: #7f8c8d;"> / ${totalOwned}</span>
        </div>

        <div style="margin-bottom: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; width:100%; text-align:center;">
            <span style="font-size: 11px; color:#bdc3c7">Ganancia:</span>
            <div style="font-size: 24px; font-weight: bold; color: #2ecc71;" id="calc-junk-payout">+${t.value} 🪙</div>
        </div>
        <button class="btn-green" style="width: 100%; margin-top:auto;" id="btn-sell-action">Sell selection</button>
    `;

    // 5. Dibujar el icono grande en el nuevo Canvas inyectado
    setTimeout(() => {
        const cctx = document.getElementById('junk-preview-canvas')?.getContext('2d');
        if (cctx && trashSpritesheet.complete) {
            cctx.imageSmoothingEnabled = false;
            cctx.drawImage(trashSpritesheet, t.sx, t.sy, 16, 16, 0, 0, 64, 64);
        }
    }, 10);

    // 6. Lógica matemática del input (Al escribir la cantidad, actualiza el precio)
    const sqi = document.getElementById('sell-quantity-input');
    sqi.oninput = () => {
        let val = parseInt(sqi.value) || 0;
        if (val > totalOwned) { val = totalOwned; sqi.value = val; } // Evita que vendan más de lo que tienen
        if (val < 1) val = 1;
        document.getElementById('calc-junk-payout').innerText = `+${val * t.value} 🪙`;
    };

    // 7. Conectar el botón de venta
    document.getElementById('btn-sell-action').onclick = () => {
        const qty = parseInt(sqi.value) || 1;
        if (ws.readyState === WebSocket.OPEN && qty > 0) {
            ws.send(MessagePack.encode({ type: 'sell_individual_trash', itemId: itemId, quantity: qty }));
        }
    };
}

// Función matemática para actualizar el texto del total a ganar
function updateJunkPayoutCalculation(individualValue) {
    const qty = parseInt(sellQtyInput.value) || 0;
    const total = qty * individualValue;
    document.getElementById('calc-junk-payout').innerText = `+${total} 🪙`;
}

// --- CONECTAR LOS BOTONES DEL YONKE (VERSIÓN NUEVA) ---

// 1. Botón Cerrar
document.getElementById('btn-close-junkyard').onclick = () => {
    document.getElementById('junkyard-modal').style.display = 'none';
    isJunkyardOpen = false;
};
// Botón Cerrar
document.getElementById('btn-close-junkyard').onclick = () => {
    document.getElementById('junkyard-modal').style.display = 'none';
    isJunkyardOpen = false;
    // 🛑 BORRAMOS el lastJunkyardTile = null; de aquí.
    // El juego lo reseteará naturalmente cuando tu personaje camine fuera de la baldosa.
};

