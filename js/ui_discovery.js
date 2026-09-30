var isDiscoveryOpen = false;
var lastDiscoveryTile = null;

window.isDiscoveryOpen = false;

function openDiscoveryModal() {
    isDiscoveryOpen = true;
    window.isDiscoveryOpen = true;
    const modal = document.getElementById('discovery-modal');
    const list = document.getElementById('discovery-list');
    if (modal) modal.style.display = 'flex';
    if (list) {
        list.innerHTML = '<div style="color: #888; text-align: center; grid-column: 1 / -1; padding-top: 50px; font-family: sans-serif;">Buscando universos publicos...</div>';
    }

    if (window.ws && window.ws.readyState === WebSocket.OPEN && typeof MessagePack !== 'undefined') {
        window.ws.send(MessagePack.encode({ type: 'req_discovery_planets' }));
    }
}
window.openDiscoveryModal = openDiscoveryModal;

function closeDiscoveryModal() {
    isDiscoveryOpen = false;
    window.isDiscoveryOpen = false;
    const modal = document.getElementById('discovery-modal');
    if (modal) modal.style.display = 'none';
    lastDiscoveryTile = null;
    if (window.player) window.player.movement = { up: false, down: false, left: false, right: false };
}
window.closeDiscoveryModal = closeDiscoveryModal;

document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'close-discovery-btn') closeDiscoveryModal();
});
