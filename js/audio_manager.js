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
            else {
                // Fallback sin CORS: <audio> no exige CORS para reproducir
                try {
                    const el = new Audio(soundUrl);
                    el.volume = volume;
                    el.play().catch(() => {});
                } catch (e) {}
            }
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
// 🔊 UI SOUNDS (sintetizados, cero assets; canjeables por mp3 en UI_SOUNDS)
// ==========================================
const UI_SOUNDS = {
    click: { freq: 660, dur: 0.06, type: 'square', vol: 0.08 },
    open: { freq: 440, dur: 0.09, type: 'sine', vol: 0.1, slide: 880 },
    close: { freq: 880, dur: 0.09, type: 'sine', vol: 0.1, slide: 440 },
    error: { freq: 180, dur: 0.15, type: 'sawtooth', vol: 0.1 }
};
window.UI_SOUNDS = UI_SOUNDS;
// Si algún día subes mp3: UI_SOUNDS.click.url = 'https://.../click.mp3' y listo.
function playUISound(name) {
    const def = UI_SOUNDS[name];
    if (!def) return;
    try {
        if (def.url) { playSound(def.url, 0.4); return; }
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = def.type || 'sine';
        osc.frequency.setValueAtTime(def.freq || 440, t);
        if (def.slide) osc.frequency.exponentialRampToValueAtTime(def.slide, t + (def.dur || 0.08));
        g.gain.setValueAtTime(def.vol || 0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + (def.dur || 0.08));
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + (def.dur || 0.08) + 0.02);
    } catch (e) {}
}
window.playUISound = playUISound;

// Delegación global: cualquier button suena click; modales abren/cierran con open/close.
document.addEventListener('click', (e) => {
    try {
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (btn) playUISound('click');
    } catch (err) {}
}, { passive: true });

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

// ¿El usuario tiene la música activada en Ajustes?
function isBgmEnabled() {
    return !(window.gameSettings && window.gameSettings.bgmEnabled === false);
}
window.isBgmEnabled = isBgmEnabled;

bgmPlayer.addEventListener('ended', () => {
    if (!isBgmEnabled() || bgmPlaylist.length === 0) return;
    currentBgmIndex = (currentBgmIndex + 1) % bgmPlaylist.length;
    window.currentBgmIndex = currentBgmIndex;
    bgmPlayer.src = bgmPlaylist[currentBgmIndex];
    bgmPlayer.play().catch(e => console.warn("Auto-play bloqueado:", e));
});

function startBGM() {
    if (!isBgmEnabled() || isBgmPlaying || bgmPlaylist.length === 0) return;
    if (window.gameSettings && typeof window.gameSettings.bgmVolume === 'number') {
        bgmPlayer.volume = window.gameSettings.bgmVolume / 100;
    }
    bgmPlayer.src = bgmPlaylist[currentBgmIndex];
    bgmPlayer.play().then(() => {
        isBgmPlaying = true;
        window.isBgmPlaying = true;
    }).catch(e => {
        console.warn("BGM bloqueado por el navegador. Esperando interacción...");
    });
}
window.startBGM = startBGM;

// Desbloqueo WebAudio: el contexto nace suspendido y SOLO un gesto lo activa.
// Sin esto, playSound desde WebSocket (sin gesto) suena mudo sin errores.
function unlockAudioCtx() {
    try {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, unlockAudioCtx, { passive: true });
});
window.unlockAudioCtx = unlockAudioCtx;

// Desbloqueo de BGM con el primer clic o toque
document.body.addEventListener('click', () => {
    unlockAudioCtx();
    if (isBgmEnabled() && !isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false });

document.body.addEventListener('touchstart', () => {
    unlockAudioCtx();
    if (isBgmEnabled() && !isBgmPlaying && bgmPlaylist.length > 0) {
        startBGM();
    }
}, { once: false, passive: true });
