// ==========================================
// 🎮 INPUT PC SYSTEM (WASD & MOUSE ENGINE)
// ==========================================

// Global state for PC inputs
window.keys = window.keys || { w: false, a: false, s: false, d: false };
window.mouseX = window.mouseX || window.innerWidth / 2;
window.mouseY = window.mouseY || window.innerHeight / 2;
window.isMouseDown = window.isMouseDown || false;

// Hide joysticks on PC, hide profile blocker on touch/mobile
window.addEventListener('DOMContentLoaded', () => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) {
        const leftJoy = document.getElementById('joystick-zone');
        const rightJoy = document.getElementById('aim-zone');

        if (leftJoy) leftJoy.style.display = 'none';
        if (rightJoy) rightJoy.style.display = 'none';
    } else {
        const profileBlockBtn = document.getElementById('btn-toggle-profile-block');
        if (profileBlockBtn) profileBlockBtn.style.display = 'none';
    }
});

// Tab to chat toggle
window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const chatBox = document.getElementById('chat-container');
        const chatBtn = document.getElementById('chat-toggle');
        if (chatBox && chatBox.classList.contains('expanded')) {
            if (typeof sendMessage === 'function') sendMessage();
        } else if (chatBtn) {
            chatBtn.click();
        }
    }
});

// Key listeners for WASD
window.addEventListener('keydown', (e) => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) return;

    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && typeof sendMessage === 'function') {
            const chatBox = document.getElementById('chat-container');
            if (chatBox && chatBox.classList.contains('expanded')) {
                sendMessage();
            }
        }
        return;
    }

    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
        window.keys[key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) return;

    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
        window.keys[key] = false;
    }
});

// Mouse tracking & shooting trigger
window.addEventListener('mousemove', (e) => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) return;

    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) return;

    if (e.target.tagName && e.target.tagName.toLowerCase() === 'canvas') {
        window.isMouseDown = true;
        // 🧱 UGC: click en tile con script (solo si requiere clic y está cerca; suprime el disparo)
        try {
            if (typeof editMode === 'undefined' || !editMode) {
                const ZS = (typeof zoomLevel !== 'undefined' ? zoomLevel : 1);
                const RX = (typeof renderWorldX !== 'undefined' ? renderWorldX : (window.player ? window.player.worldX : 0));
                const RY = (typeof renderWorldY !== 'undefined' ? renderWorldY : (window.player ? window.player.worldY : 0));
                const SCX = (typeof screenCenterX !== 'undefined' ? screenCenterX : window.innerWidth / 2);
                const SCY = (typeof screenCenterY !== 'undefined' ? screenCenterY : window.innerHeight / 2);
                const TS = (typeof TILE_SIZE !== 'undefined' ? TILE_SIZE : 16);
                const clickX = (e.clientX - SCX) / ZS + RX;
                const clickY = (e.clientY - SCY) / ZS + RY;
                const gx = Math.floor(clickX / TS), gy = Math.floor(clickY / TS);
                const tile = (typeof worldMap !== 'undefined' && typeof getMapKey === 'function') ? worldMap.get(getMapKey(gx, gy, 15)) : null;
                if (tile && tile.scriptId && tile.requiresClick && window.player) {
                    if (Math.hypot(window.player.worldX - clickX, window.player.worldY - clickY) < TS * 4) {
                        if (typeof sendTileInteract === 'function') sendTileInteract(gx, gy, 15, 'click');
                        if (tile.triggerType && tile.triggerType !== 'none' && typeof executeTileLogic === 'function') {
                            try { executeTileLogic(tile, gx + ',' + gy); } catch (err) {}
                        }
                        window.__tileClickSuppress = true;
                    }
                }
            }
        } catch (err) {}
    }
});

window.addEventListener('mouseup', () => {
    window.isMouseDown = false;
    window.__tileClickSuppress = false;
});
