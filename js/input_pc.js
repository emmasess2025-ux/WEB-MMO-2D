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
    }
});

window.addEventListener('mouseup', () => {
    window.isMouseDown = false;
});
