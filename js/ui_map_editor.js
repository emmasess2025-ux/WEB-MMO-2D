// =========================================================
// 🗺️ MAP & LEVEL EDITOR UI SYSTEM
// =========================================================

// --- 2. PALETTE RESIZING LOGIC ---
if (typeof paletteResizer !== 'undefined' && paletteResizer) {
    paletteResizer.addEventListener('touchstart', (e) => {
        isResizingPalette = true; e.preventDefault();
    }, { passive: false });
    paletteResizer.addEventListener('mousedown', (e) => {
        isResizingPalette = true; e.preventDefault();
    });
}

function handlePaletteDrag(clientX) {
    if (typeof isResizingPalette === 'undefined' || !isResizingPalette || typeof tilePalette === 'undefined' || !tilePalette) return;
    let newWidth = window.innerWidth - clientX;
    if (newWidth < 150) newWidth = 150;
    if (newWidth > window.innerWidth - 60) newWidth = window.innerWidth - 60;
    tilePalette.style.width = newWidth + 'px';
}

window.addEventListener('touchmove', (e) => { if (typeof isResizingPalette !== 'undefined' && isResizingPalette) handlePaletteDrag(e.touches[0].clientX); });
window.addEventListener('mousemove', (e) => { if (typeof isResizingPalette !== 'undefined' && isResizingPalette) handlePaletteDrag(e.clientX); });
window.addEventListener('touchend', () => { if (typeof isResizingPalette !== 'undefined') isResizingPalette = false; });
window.addEventListener('mouseup', () => { if (typeof isResizingPalette !== 'undefined') isResizingPalette = false; });

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

// FUNCIÃ“N MAESTRA 1: Recoger bloques del piso
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

// FUNCIÃ“N MAESTRA 2: Pegar bloques arrastrados
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

// --- 3. LÃ“GICA DE HERRAMIENTAS PRINCIPALES (PAINT, SELECT, ERASE) ---
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
        // ENCENDER BORRADOR (-1 significa "vacÃ­o")
        selectedTileId = -1;
        eraserBtn.style.borderColor = "red";
    }
};

// Mostrar/Ocultar el menÃº de creaciÃ³n y filtros al cambiar de herramientas
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
        if (!mapSelectionBox) return alert("Debes seleccionar un Ã¡rea en el mapa primero con la herramienta de selecciÃ³n");

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

// LÃ³gica del botÃ³n ðŸ‘ï¸ Ver Zonas
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

// ðŸ‘‡ NUEVO: LÃ“GICA DEL BOTÃ“N "CREAR ZONA SEGURA" Y CHECKBOX ðŸ‘‡
// --- 🗺️ LÓGICA DE CREACIÓN DE ZONAS (UNIVERSAL: SAFE, TRASH, DIG, TURF, INDOOR, NPC) ---
const ZONE_DESCRIPTIONS = {
    safe: "🛡️ Sin daño PvP / Zona de paz y protección para jugadores.",
    trash: "🗑️ Basurero / Chatarra: Genera chatarra, basura y piezas reciclables periódicamente para la economía.",
    dig: "⛏️ Zona de Minería: Permite a los jugadores excavar minerales y tesoros usando pala o pico.",
    turf: "🏴 Territorio de Clan: Punto de control con respawn personalizado al morir.",
    indoor: "🏠 Interior / Techos: Zona techada que oculta la lluvia, clima e iluminación exterior.",
    npc: "🤖 Zona de NPCs: Área delimitada para aparición y patrullaje de criaturas o NPCs."
};

const btnMakeSafeZone = document.getElementById('btn-make-safezone');
const zoneTypeSelect = document.getElementById('zone-type-select');

// --- 🛡️ LÓGICA DEL INSPECTOR DE ZONAS ---
const szInspectorModal = document.getElementById('safezone-inspector-modal');
const closeSzInspector = document.getElementById('close-sz-inspector');
const deleteSzBtn = document.getElementById('delete-sz-btn');
let currentInspectingZoneId = null;

if (closeSzInspector) {
    closeSzInspector.onclick = () => {
        szInspectorModal.style.display = 'none';
        currentInspectingZoneId = null;
    };
}

if (deleteSzBtn) {
    deleteSzBtn.onclick = () => {
        if (currentInspectingZoneId && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'delete_safezone', id: currentInspectingZoneId }));

            deleteSzBtn.innerText = "Borrando...";
            deleteSzBtn.style.background = "#c0392b";

            safeZones = safeZones.filter(z => z._id !== currentInspectingZoneId);

            setTimeout(() => {
                szInspectorModal.style.display = 'none';
                deleteSzBtn.innerText = "🗑️ Eliminar Zona";
                deleteSzBtn.style.background = "#e74c3c";
            }, 300);
        }
    };
}

// --- 🗺️ MODAL DE CREACIÓN DE ZONAS ---
const createZoneModal = document.getElementById('create-zone-modal');
const closeCreateZoneModal = document.getElementById('close-create-zone-modal');
const modalCancelZoneBtn = document.getElementById('modal-cancel-zone-btn');
const modalConfirmZoneBtn = document.getElementById('modal-confirm-zone-btn');
const modalZoneName = document.getElementById('modal-zone-name');
const modalZoneTypeSelect = document.getElementById('modal-zone-type-select');
const modalZoneDesc = document.getElementById('modal-zone-desc');
const modalTurfFields = document.getElementById('modal-turf-fields');
const modalTurfX = document.getElementById('modal-turf-x');
const modalTurfY = document.getElementById('modal-turf-y');
const modalTurfMyPosBtn = document.getElementById('modal-turf-my-pos-btn');
const createZoneDimensions = document.getElementById('create-zone-dimensions');

// Toolbar Turf fields (backup)
const turfSpawnFields = document.getElementById('turf-spawn-fields');
const turfSpawnX = document.getElementById('turf-spawn-x');
const turfSpawnY = document.getElementById('turf-spawn-y');
const turfUsePosBtn = document.getElementById('turf-use-pos-btn');

function updateModalZoneTypeInfo() {
    if (!modalZoneTypeSelect) return;
    const type = modalZoneTypeSelect.value;
    if (modalZoneDesc) {
        modalZoneDesc.innerText = ZONE_DESCRIPTIONS[type] || (window.ZONE_CONFIG && window.ZONE_CONFIG[type] ? window.ZONE_CONFIG[type].name : "Configura esta zona en el mapa.");
    }
    if (modalTurfFields) {
        modalTurfFields.style.display = (type === 'turf') ? 'block' : 'none';
    }
}

if (modalZoneTypeSelect) {
    modalZoneTypeSelect.addEventListener('change', updateModalZoneTypeInfo);
}

if (modalTurfMyPosBtn) {
    modalTurfMyPosBtn.addEventListener('click', () => {
        if (modalTurfX) modalTurfX.value = Math.floor(player.worldX / TILE_SIZE);
        if (modalTurfY) modalTurfY.value = Math.floor(player.worldY / TILE_SIZE);
    });
}

function updateTurfFieldsVisibility() {
    const val = zoneTypeSelect ? zoneTypeSelect.value : 'safe';
    if (turfSpawnFields) {
        turfSpawnFields.style.display = (val === 'turf') ? 'flex' : 'none';
    }
}

if (zoneTypeSelect) {
    zoneTypeSelect.addEventListener('change', updateTurfFieldsVisibility);
}

if (turfUsePosBtn) {
    turfUsePosBtn.addEventListener('click', () => {
        if (turfSpawnX) turfSpawnX.value = Math.floor(player.worldX / TILE_SIZE);
        if (turfSpawnY) turfSpawnY.value = Math.floor(player.worldY / TILE_SIZE);
    });
}

function closeCreateZoneDialog() {
    if (createZoneModal) createZoneModal.style.display = 'none';
}

if (closeCreateZoneModal) closeCreateZoneModal.addEventListener('click', closeCreateZoneDialog);
if (modalCancelZoneBtn) modalCancelZoneBtn.addEventListener('click', closeCreateZoneDialog);

if (btnMakeSafeZone) {
    btnMakeSafeZone.addEventListener('click', () => {
        if (!mapSelectionBox) {
            alert("⚠️ Primero usa la herramienta 'Select' para arrastrar y marcar un área en el mapa.");
            return;
        }

        const width = (mapSelectionBox.maxX - mapSelectionBox.minX + 1);
        const height = (mapSelectionBox.maxY - mapSelectionBox.minY + 1);

        if (createZoneDimensions) {
            createZoneDimensions.innerText = `📐 Área seleccionada: ${width} x ${height} bloques (X: ${mapSelectionBox.minX}..${mapSelectionBox.maxX}, Y: ${mapSelectionBox.minY}..${mapSelectionBox.maxY})`;
        }

        if (modalZoneName) {
            modalZoneName.value = '';
        }

        if (modalTurfX) modalTurfX.value = '';
        if (modalTurfY) modalTurfY.value = '';

        const toolbarType = zoneTypeSelect ? zoneTypeSelect.value : 'safe';
        if (modalZoneTypeSelect && toolbarType) {
            modalZoneTypeSelect.value = toolbarType;
        }

        updateModalZoneTypeInfo();

        if (createZoneModal) {
            createZoneModal.style.display = 'flex';
            setTimeout(() => {
                if (modalZoneName) modalZoneName.focus();
            }, 100);
        }
    });
}

if (modalConfirmZoneBtn) {
    modalConfirmZoneBtn.addEventListener('click', () => {
        if (!mapSelectionBox) {
            alert("⚠️ No hay ninguna selección activa en el mapa.");
            closeCreateZoneDialog();
            return;
        }

        const zoneName = modalZoneName ? modalZoneName.value.trim() : '';
        if (!zoneName) {
            alert("⚠️ Por favor ingresa un nombre para la zona.");
            if (modalZoneName) modalZoneName.focus();
            return;
        }

        const zType = modalZoneTypeSelect ? modalZoneTypeSelect.value : 'safe';
        let spawnX = null;
        let spawnY = null;

        if (zType === 'turf') {
            const tileX = parseFloat(modalTurfX.value);
            const tileY = parseFloat(modalTurfY.value);
            if (isNaN(tileX) || isNaN(tileY)) {
                alert("⚠️ Zona Turf requiere un punto de Spawn.\nIngresa las coordenadas de Tile (X, Y), o usa '📌 Usar Mi Posición Actual'.");
                return;
            }
            spawnX = (tileX * TILE_SIZE) + (TILE_SIZE / 2);
            spawnY = (tileY * TILE_SIZE) + (TILE_SIZE / 2);
        }

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
        if (zType === 'turf') {
            payload.spawnX = spawnX;
            payload.spawnY = spawnY;
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode(payload));
        }

        closeCreateZoneDialog();
        mapSelectionBox = null;
        if (turfSpawnX) turfSpawnX.value = '';
        if (turfSpawnY) turfSpawnY.value = '';
        if (worldPaintBtn) worldPaintBtn.click();
    });
}
// ðŸ‘† FIN DE LA LÃ“GICA DE ZONA SEGURA ðŸ‘†


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

// â†©ï¸ UNDO ACTION (100% MASIVO - CERO LAG)
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

// â†ªï¸ REDO ACTION (100% MASIVO - CERO LAG)
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
        pCanvas.style.cursor = 'crosshair'; // Cruz de selecciÃ³n
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



function attachPaletteListeners() {
    pCanvas.onmousedown = handlePaletteDown;
    pCanvas.onmousemove = handlePaletteMove;

    // EL FIX: Antes tenÃ­a un 'if(isDraggingBox)'. Ahora escucha siempre 
    // que levantas el dedo o el clic para detener cualquier acciÃ³n (pan o select).
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

// --- EVENTOS DEL TOOLBAR (TÃCTIL Y RATÃ“N) ---
// --- EVENTOS DEL TOOLBAR (TÃCTIL Y RATÃ“N) ---
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

// TÃ¡ctil
toolbarDragHandle.addEventListener('touchstart', (e) => startDragToolbar(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
window.addEventListener('touchmove', (e) => { if (e.touches.length > 0) moveToolbar(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend', () => isDraggingToolbar = false);

// RatÃ³n (PC)
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
    if (!(window.editMode || (typeof editMode !== 'undefined' && editMode))) return;

    // ðŸ‘‡ DETECTAR CLIC PARA INSPECCIONAR ZONAS UNIVERSALES ðŸ‘‡
    if (showSafeZoneVisuals) {
        // Calculamos en quÃ© pixel del mundo hiciste clic
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

            // Ponerle el Ã­cono correcto al tÃ­tulo del inspector
            let icon = "ðŸ›¡ï¸";
            if (zone.zoneType === 'trash') icon = "ðŸ—‘ï¸";
            if (zone.zoneType === 'npc') icon = "ðŸ¤–";
            if (zone.zoneType === 'indoor') icon = "ðŸ ";

            document.getElementById('sz-inspector-name').innerText = `${icon} ${zone.name}`;

            // Calculamos cuÃ¡nto mide
            const width = Math.round((zone.xMax - zone.xMin) / TILE_SIZE);
            const height = Math.round((zone.yMax - zone.yMin) / TILE_SIZE);
            document.getElementById('sz-inspector-size').innerText = `Ãrea: ${width}x${height} bloques`;

            szInspectorModal.style.display = 'flex'; // Mostrar Modal
            return; // Detenemos el cÃ³digo aquÃ­
        }
    }
    // ðŸ‘† FIN DEL CÃ“DIGO DE INSPECCIÃ“N ðŸ‘†

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
                // Respetamos hasCollision antiguo si existÃ­a, o false por defecto
                const collision = t ? t.hasCollision : false;
                worldMap.set(k, { tileId: selectedTileId, l: activeLayer, hasCollision: collision });
            }

            count++;

            // Expandir a vecinos
            const neighbors = [
                { x: curr.x + 1, y: curr.y },
                { x: curr.x - 1, y: curr.y },
                { x: curr.x, y: curr.y + 1 },
                { x: curr.x, y: curr.y - 1 }
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

        const turfId = `base_${gridPos.x}_${gridPos.y}`;
        const targetTurf = (typeof turfBases === 'object' && turfBases && turfBases[turfId])
            ? turfBases[turfId]
            : (typeof getAllTurfBases === 'function' ? getAllTurfBases().find(b => b.gridX === gridPos.x && b.gridY === gridPos.y) : (centralBase && centralBase.gridX === gridPos.x && centralBase.gridY === gridPos.y ? centralBase : null));

        if (targetTurf) {
            document.getElementById('ins-turf-name').value = targetTurf.name || "";
            document.getElementById('ins-turf-hp').value = targetTurf.maxHp || 5000;
            document.getElementById('ins-turf-ox').value = targetTurf.spriteOffsetX || 0;
            document.getElementById('ins-turf-oy').value = targetTurf.spriteOffsetY || 0;
            document.getElementById('ins-turf-hx').value = targetTurf.hitboxOffsetX || 0;
            document.getElementById('ins-turf-hy').value = targetTurf.hitboxOffsetY || 0;
            document.getElementById('ins-turf-hw').value = targetTurf.hitboxW || 32;
            document.getElementById('ins-turf-hh').value = targetTurf.hitboxH || 32;
            if (document.getElementById('ins-turf-fw')) document.getElementById('ins-turf-fw').value = targetTurf.frameWidth || "";
            if (document.getElementById('ins-turf-fh')) document.getElementById('ins-turf-fh').value = targetTurf.frameHeight || "";
            if (document.getElementById('ins-turf-frames')) document.getElementById('ins-turf-frames').value = targetTurf.frameCount || "";
            if (document.getElementById('ins-turf-hover')) document.getElementById('ins-turf-hover').checked = (targetTurf.isHover !== false);
        } else {
            document.getElementById('ins-turf-name').value = "Base Central";
            document.getElementById('ins-turf-hp').value = 5000;
            document.getElementById('ins-turf-ox').value = 0;
            document.getElementById('ins-turf-oy').value = 0;
            document.getElementById('ins-turf-hx').value = 0;
            document.getElementById('ins-turf-hy').value = 0;
            document.getElementById('ins-turf-hw').value = 32;
            document.getElementById('ins-turf-hh').value = 32;
            if (document.getElementById('ins-turf-fw')) document.getElementById('ins-turf-fw').value = "";
            if (document.getElementById('ins-turf-fh')) document.getElementById('ins-turf-fh').value = "";
            if (document.getElementById('ins-turf-frames')) document.getElementById('ins-turf-frames').value = "";
            if (document.getElementById('ins-turf-hover')) document.getElementById('ins-turf-hover').checked = true;
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
                // Compatibilidad hacia atrÃ¡s si era un nÃºmero directo en vez de un objeto
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
    if (!(window.editMode || (typeof editMode !== 'undefined' && editMode))) return;

    if (worldMode === 'select' && isDraggingMapBox) {
        if (e && e.preventDefault) e.preventDefault();
        mapSelectEnd = getWorldGridXY(clientX, clientY);
        updateCoordHelper(mapSelectEnd);
    }
    // FUNCIÃ“N DE BROCHA: Arrastrar para pintar/borrar continuamente
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
                worldMap.delete(centerKey);
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
    if (!(window.editMode || (typeof editMode !== 'undefined' && editMode))) return;
    isPainting = false;

    // --- EL FIX: Guardar TODO el trazo como 1 solo paso de Undo ---
    if (currentStrokeHistory.length > 0) {
        recordHistory([...currentStrokeHistory]);
        currentStrokeHistory = [];
    }

    if (isDraggingMapBox && worldMode === 'select') {
        isDraggingMapBox = false;
        if (!mapSelectStart || !mapSelectEnd) return; // Evitar crashes de clicks rÃ¡pidos

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

        // Actualizamos los textos para que sepas en quÃ© capa estÃ¡s
        if (copyLayerNum) copyLayerNum.innerText = activeLayer;
        if (delLayerNum) delLayerNum.innerText = activeLayer;

        document.getElementById('teleport-settings').style.display = 'none'; // No se puede poner TP a una caja entera 

        tileInspector.style.display = 'flex'; // Enciende la barra horizontal

        let areaHasCollision = false;
        let areaIsSit = false;
        for (let r = mapSelectionBox.minY; r <= mapSelectionBox.maxY; r++) {
            for (let c = mapSelectionBox.minX; c <= mapSelectionBox.maxX; c++) {
                // ðŸ›‘ EL FIX: Escanear la memoria correctamente
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

// --- ENLAZAR EVENTOS TÃCTILES ---
(window.canvas || document.getElementById('gameCanvas')).addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;

    // --- FIX: Actualizar Radar con un solo toque en MÃ³vil ---
    if (editMode && coordHelper && e.touches.length > 0) {
        const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
        updateCoordHelper(gridPos);
    }

    handleEditStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });

(window.canvas || document.getElementById('gameCanvas')).addEventListener('touchmove', (e) => {
    // --- NUEVO: Update Radar HUD for Mobile ---
    if (editMode && coordHelper && e.touches.length > 0) {
        const gridPos = getWorldGridXY(e.touches[0].clientX, e.touches[0].clientY);
        updateCoordHelper(gridPos);
    }
    handleEditMove(e.touches[0].clientX, e.touches[0].clientY, e);
}, { passive: false });

(window.canvas || document.getElementById('gameCanvas')).addEventListener('touchend', (e) => {
    if (e.changedTouches.length > 0) {
        handleEditEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
});

// --- ENLAZAR EVENTOS DE RATÃ“N (PC) ---
(window.canvas || document.getElementById('gameCanvas')).addEventListener('mousedown', (e) => {
    if (e.target.id !== 'gameCanvas') return;

    // 1. DRAG DE SELECCIÃ“N CON CLICK DERECHO
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
                inspectRotateBtn.innerText = `ðŸ”„ Rot: ${currentRotation}`;
            } else {
                currentRotation = 0;
                inspectRotateBtn.innerText = `ðŸ”„ Rotate`;
            }
        } else {
            // Clic en vacÃ­o = Goma
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

    if (window.editMode || (typeof editMode !== 'undefined' && editMode)) {
        handleEditStart(e.clientX, e.clientY);
        return;
    }

    // Calcular el clic en el mundo real
    const clickX = (e.clientX - (window.innerWidth / 2)) / zoomLevel + player.worldX;
    const clickY = (e.clientY - (window.innerHeight / 2)) / zoomLevel + player.worldY;

    const gridClickX = Math.floor(clickX / TILE_SIZE);
    const gridClickY = Math.floor(clickY / TILE_SIZE);
    const clickedLogicTile = worldMap.get(getMapKey(gridClickX, gridClickY, 15));

    // Si es un bloque con lÃ³gica y requiere clic
    if (clickedLogicTile && clickedLogicTile.requiresClick) {
        // Validar que el jugador no estÃ© muy lejos (rango de interacciÃ³n)
        const distToTile = Math.hypot(player.worldX - clickX, player.worldY - clickY);
        if (distToTile < TILE_SIZE * 3) {
            executeTileLogic(clickedLogicTile, `${gridClickX},${gridClickY}`);
            return; // Detenemos la ejecuciÃ³n para que no dispare ni abra perfiles
        }
    }

    // Revisar si le dimos a un jugador (Perfiles, respetando el Bloqueador de Perfil si tenemos arma/ítem)
    const hasItemEquipped = player && player.equippedWeapon && player.equippedWeapon !== "none" && player.equippedWeapon !== "";
    const isBlockerActive = (typeof isTouchDevice === 'undefined' || !isTouchDevice) && (window.blockProfileClicks !== false);

    if (!hasItemEquipped || !isBlockerActive) {
        const HIT_RADIUS = 20;
        if (Math.abs(clickX - player.worldX) < HIT_RADIUS && Math.abs(clickY - player.worldY) < HIT_RADIUS) {
            openProfile('self', player.username); return;
        }
        for (let id in otherPlayers) {
            if (Math.abs(clickX - otherPlayers[id].worldX) < HIT_RADIUS && Math.abs(clickY - otherPlayers[id].worldY) < HIT_RADIUS) {
                openProfile(id, otherPlayers[id].username, otherPlayers[id]); return;
            }
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if ((window.editMode || (typeof editMode !== 'undefined' && editMode)) && typeof coordHelper !== 'undefined' && coordHelper && e.target && e.target.id === 'gameCanvas') {
        const gridPos = getWorldGridXY(e.clientX, e.clientY);
        updateCoordHelper(gridPos);
        editorMouseGridX = gridPos.x;
        editorMouseGridY = gridPos.y;
    }

    // 2. ACTUALIZAR CAJA MIENTRAS ARRASTRAMOS
    if ((window.editMode || (typeof editMode !== 'undefined' && editMode)) && isDraggingSelection && mapSelectionBox) {
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
    if ((window.editMode || (typeof editMode !== 'undefined' && editMode)) && isDraggingSelection && e.button === 2) {
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

            // Llenar tiles clÃ¡sicos por si es solo 1 capa
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

// --- NUEVO: LÃ“GICA DE ROTACIÃ“N (90 GRADOS) ---
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

            // FÃ³rmula de RotaciÃ³n 90Â° a la derecha
            const nx = oldH - 1 - ly;
            const ny = lx;

            rotatedTiles.push({
                ...t,
                x: mapSelectionBox.minX + nx,
                y: mapSelectionBox.minY + ny,
                rotation: ((t.rotation || 0) + 90) % 360 // <-- Girar la imagen 90 grados
            });
        });

        // 2. Ajustamos la caja de selecciÃ³n a sus nuevas dimensiones
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

// FUNCIÃ“N MAESTRA 3: Borrar Capas
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

// --- LÃ“GICA DEL MENÃš DESPLEGABLE DEL EDITOR ---
const logicSelect = document.getElementById('logic-type-select');
const tpDestX = document.getElementById('tp-dest-x');
const tpDestY = document.getElementById('tp-dest-y');
const shopItemIdInput = document.getElementById('shop-item-id');
const shopItemRowInput = document.getElementById('shop-item-row'); // <--- NUEVO
const saveTpBtn = document.getElementById('save-tp-btn');
const npcMessageInput = document.getElementById('npc-message-input');
const logicRequiresClick = document.getElementById('logic-requires-click');
// Variables (AÃ±ade estas 2)
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
        const key = getMapKey(gx, gy, gl); // Â¡Usar la nueva llave matemÃ¡tica!

        // 2. Leer todos los valores de las cajitas del menÃº HTML
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
        const tFw = parseInt(document.getElementById('ins-turf-fw')?.value) || 0;
        const tFh = parseInt(document.getElementById('ins-turf-fh')?.value) || 0;
        const tFrames = parseInt(document.getElementById('ins-turf-frames')?.value) || 0;
        const tHover = document.getElementById('ins-turf-hover') ? document.getElementById('ins-turf-hover').checked : true;

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
            turfFrameW: tFw, turfFrameH: tFh, turfFrames: tFrames, turfIsHover: tHover,
            arenaName: aName, gameType: gType, maxPlayers: maxP, team1Size: t1Size, team2Size: t2Size,
            arenaP1X: ap1x, arenaP1Y: ap1y, arenaP2X: ap2x, arenaP2Y: ap2y,
            ballX: bX, ballY: bY,
            goal1X1: g1X1, goal1X2: g1X2, goal1Y: g1Y,
            goal2X1: g2X1, goal2X2: g2X2, goal2Y: g2Y,
            brMinX: brMinX, brMaxX: brMaxX, brMinY: brMinY, brMaxY: brMaxY,
            isRanked: isRanked
        }));

        // 5. AnimaciÃ³n bonita del botÃ³n
        saveTpBtn.innerText = "Â¡Guardado!";
        saveTpBtn.style.background = "#27ae60";
        setTimeout(() => {
            saveTpBtn.innerText = "Guardar";
            saveTpBtn.style.background = "#2ecc71";
        }, 1500);
    }
};

