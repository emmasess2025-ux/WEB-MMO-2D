// =========================================================
// 🔊 SOUND & BACKGROUND MUSIC ENGINE (WEB AUDIO API)
// =========================================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();
window.audioCtx = audioCtx;
const audioBuffers = {}; // MP3s decodificados en RAM pura
window.audioBuffers = audioBuffers;

// Descargar sonido y convertirlo en buffer de audio
async function preloadSound(url) {
    if (!url || audioBuffers[url]) return;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioBuffers[url] = audioBuffer;
    } catch (e) { console.error("Error pre-cargando audio:", e); }
}
window.preloadSound = preloadSound;

function playSound(soundUrl, volume = 0.5) {
    if (!soundUrl || soundUrl === "") return;

    if (audioCtx.state === 'suspended') audioCtx.resume();

    const buffer = audioBuffers[soundUrl];
    if (!buffer) {
        preloadSound(soundUrl).then(() => {
            if (audioBuffers[soundUrl]) playSound(soundUrl, volume);
        });
        return;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
}
window.playSound = playSound;

// Helper para reproducir sonidos desde el catálogo
function playItemSound(itemId, soundType = 'use', volume = 0.5) {
    const catalogItem = (window.MASTER_CATALOG && window.MASTER_CATALOG[itemId]) || (window.WEAPONS && window.WEAPONS[itemId]);
    if (catalogItem && catalogItem.audio && catalogItem.audio[soundType]) {
        playSound(catalogItem.audio[soundType], volume);
    }
}
window.playItemSound = playItemSound;

// ==========================================
// 🎵 BACKGROUND MUSIC ENGINE (BGM)
// ==========================================
var bgmPlaylist = [];
window.bgmPlaylist = bgmPlaylist;
var currentBgmIndex = 0;
window.currentBgmIndex = currentBgmIndex;
var isBgmPlaying = false;
window.isBgmPlaying = isBgmPlaying;

const bgmPlayer = new Audio();
bgmPlayer.volume = 0.15;
bgmPlayer.loop = false;
window.bgmPlayer = bgmPlayer;

bgmPlayer.addEventListener('ended', () => {
    if (bgmPlaylist.length === 0) return;
    currentBgmIndex = (currentBgmIndex + 1) % bgmPlaylist.length;
    window.currentBgmIndex = currentBgmIndex;
    bgmPlayer.src = bgmPlaylist[currentBgmIndex];
    bgmPlayer.play().catch(e => console.warn("Auto-play bloqueado:", e));
});

function startBGM() {
    if (isBgmPlaying || bgmPlaylist.length === 0) return;
    bgmPlayer.src = bgmPlaylist[currentBgmIndex];
    bgmPlayer.play().then(() => {
        isBgmPlaying = true;
        window.isBgmPlaying = true;
    }).catch(e => {
        console.warn("BGM bloqueado por el navegador. Esperando interacción...");
    });
}
window.startBGM = startBGM;

// Desbloqueo de audio en móvil / navegador con el primer clic o toque
document.body.addEventListener('click', () => {
    if (!isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false });

document.body.addEventListener('touchstart', () => {
    if (!isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false, passive: true });
