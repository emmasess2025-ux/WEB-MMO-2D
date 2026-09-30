// =========================================================
// DUST FX — pulverizado en pixeles de 1px con gravedad y reposo.
// Módulo autónomo: no toca render del jugador, física ni movimiento.
// Uso: DustBurst(x, y, opts) + drawDust() desde el loop.
// =========================================================
const MAX_DUST = 300;
const dustPool = Array.from({ length: MAX_DUST }, () => ({ active: false }));
window.dustPool = dustPool;

// Asignador con desalojo: si el pool se llena, recicla la más vieja (menor life).
// Sin esto, muertes seguidas (260 c/u) dejaban al resto de efectos con 0-1 slots.
function dustAlloc() {
    for (let i = 0; i < MAX_DUST; i++) {
        if (!dustPool[i].active) return dustPool[i];
    }
    let oldest = dustPool[0];
    for (let i = 1; i < MAX_DUST; i++) {
        if ((dustPool[i].life || 0) < (oldest.life || 0)) oldest = dustPool[i];
    }
    return oldest;
}
window.dustAlloc = dustAlloc;

const DUST_DEFAULTS = {
    colors: ['#c9a06a', '#8a6f4d', '#e8dcc8', '#6b5b45'],
    count: 50,
    gravity: 0.12,
    life: 300, // 5s @60fps
    spread: 2.2,
    up: 2.6,
    mode: 'burst', // 'burst' = explosion radial | 'rain' = llueve desde arriba y cae al piso
    width: 32, // rain: ancho de la franja de spawn (px)
    height: 64, // rain: altura sobre y desde donde cae (px)
};

// Escanea hacia abajo (una sola vez por partícula) el primer tile sólido.
function dustGroundY(x, y) {
    try {
        if (typeof worldMap === 'undefined' || typeof getMapKey !== 'function') return y + 48;
        const TS = (typeof TILE_SIZE !== 'undefined' ? TILE_SIZE : 16);
        const gx = Math.floor(x / TS);
        let gy = Math.floor(y / TS);
        for (let i = 0; i < 12; i++) {
            for (let l = 0; l <= 15; l++) {
                const t = worldMap.get(getMapKey(gx, gy, l));
                if (t && t.hasCollision) return gy * TS - 1;
            }
            gy++;
        }
        return y + 48;
    } catch (e) { return y + 48; }
}

function DustBurst(x, y, opts) {
    const o = Object.assign({}, DUST_DEFAULTS, opts || {});
    // Object.assign copia keys con undefined -> sanitizar contra defaults
    if (!o.count) o.count = DUST_DEFAULTS.count;
    if (!o.life) o.life = DUST_DEFAULTS.life;
    if (!o.gravity && o.gravity !== 0) o.gravity = DUST_DEFAULTS.gravity;
    if (!o.spread) o.spread = DUST_DEFAULTS.spread;
    if (!o.up) o.up = DUST_DEFAULTS.up;
    if (o.mode !== 'rain' && o.mode !== 'burst') o.mode = 'burst';
    if (!o.width) o.width = DUST_DEFAULTS.width;
    if (!o.height) o.height = DUST_DEFAULTS.height;
    if (!o.mode) o.mode = DUST_DEFAULTS.mode;
    const colors = Array.isArray(o.colors) ? o.colors : [o.colors || '#c9a06a'];
    let spawned = 0;
    for (let n = 0; n < o.count; n++) {
        const p = dustAlloc();
        if (!p) break;
        if (o.mode === 'rain') {
            p.active = true;
            p.x = x + (Math.random() * o.width - o.width / 2);
            p.y = y - o.height + (Math.random() * 8 - 4);
            p.vx = (Math.random() - 0.5) * 0.3;
            p.vy = Math.random() * 0.8 + 0.2;
        } else {
            const a = Math.random() * Math.PI * 2;
            const sp = Math.random() * o.spread;
            p.active = true;
            p.x = x + (Math.random() * 16 - 8);
            p.y = y + (Math.random() * 20 - 14);
            p.vx = Math.cos(a) * sp;
            p.vy = -Math.random() * o.up - 0.4;
        }
        p.groundY = dustGroundY(p.x, p.y);
        p.color = colors[(Math.random() * colors.length) | 0];
        p.life = o.life;
        p.maxLife = o.life;
        p.gravity = o.gravity;
        p.rest = false;
        spawned++;
    }
    return spawned;
}
window.DustBurst = DustBurst;

// Pulverizado 1:1 REAL: muestrea los pixeles opacos del frame dibujado
// (snapshot de drawModularCharacter). Max ~260 pixeles (stride adaptativo).
// Devuelve spawned; 0 = sin snapshot o canvas tainted (usar DustBurst paleta).
const _dustCanvas = document.createElement('canvas');
function samplePart(part, budget) {
    const c = _dustCanvas;
    const sw = Math.max(1, Math.floor(part.sw)), sh = Math.max(1, Math.floor(part.sh));
    c.width = sw; c.height = sh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, sw, sh);
    g.drawImage(part.img, part.sx, part.sy, sw, sh, 0, 0, sw, sh);
    const data = g.getImageData(0, 0, sw, sh).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
    if (!opaque) return [];
    const stride = Math.max(1, Math.ceil(Math.sqrt(opaque / Math.max(1, budget))));
    const out = [];
    for (let y = 0; y < sh; y += stride) {
        for (let x = 0; x < sw; x += stride) {
            const idx = (y * sw + x) * 4;
            if (data[idx + 3] > 128) {
                out.push({
                    dx: part.ox + x, dy: part.oy + y,
                    color: `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`
                });
                if (out.length >= budget) return out;
            }
        }
    }
    return out;
}

function DustBurstFromPlayer(wx, wy, snap, opts) {
    try {
        if (!snap || !snap.parts || !snap.parts.length) { console.log('[DUST] sin snapshot, fallback paleta'); return 0; }
        const o = Object.assign({ gravity: 0.12, life: 300 }, opts || {});
        const per = Math.max(20, Math.floor(260 / snap.parts.length));
        const px = [];
        snap.parts.forEach((part, pi) => {
            try {
                const got = samplePart(part, per);
                console.log(`[DUST] parte${pi} ${part.sw}x${part.sh} -> ${got.length}px`);
                got.forEach(s => px.push(s));
            } catch (e) { console.log('[DUST] parte' + pi + ' ERROR: ' + (e && e.message)); }
        });
        if (!px.length) return 0;
        let spawned = 0;
        for (let i = 0; i < px.length; i++) {
            const s = px[i];
            const p = dustAlloc();
            if (!p) break;
            p.active = true;
            p.x = wx + s.dx; p.y = wy + s.dy;
            p.vx = (Math.random() - 0.5) * 1.6;
            p.vy = -Math.random() * 2.2 - 0.3;
            p.groundY = dustGroundY(p.x, p.y);
            p.color = s.color;
            p.life = o.life; p.maxLife = o.life;
            p.gravity = o.gravity;
            p.rest = false;
            spawned++;
        }
        return spawned;
    } catch (e) { return 0; } // canvas tainted (CORS) -> fallback a paleta
}
window.DustBurstFromPlayer = DustBurstFromPlayer;

function updateDust() {
    for (let i = 0; i < MAX_DUST; i++) {
        const p = dustPool[i];
        if (!p.active) continue;
        p.life--;
        if (p.life <= 0) { p.active = false; continue; }
        if (!p.rest) {
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.985;
            if (p.y >= p.groundY) {
                p.y = p.groundY;
                p.rest = true;
            }
        }
    }
}
window.updateDust = updateDust;

function drawDust(ctx, screenCenterX, screenCenterY, renderWorldX, renderWorldY, zoomLevel) {
    for (let i = 0; i < MAX_DUST; i++) {
        const p = dustPool[i];
        if (!p.active) continue;
        const fadeStart = p.maxLife * 0.4;
        const alpha = p.life < fadeStart ? Math.max(0, p.life / fadeStart) : 1;
        const dx = Math.floor(screenCenterX + (p.x - renderWorldX) * zoomLevel);
        const dy = Math.floor(screenCenterY + (p.y - renderWorldY) * zoomLevel);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        const s = Math.max(1, Math.round(1 * zoomLevel));
        ctx.fillRect(dx, dy, s, s);
    }
    ctx.globalAlpha = 1.0;
}
window.drawDust = drawDust;
