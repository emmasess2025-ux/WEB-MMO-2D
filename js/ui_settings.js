// =========================================================
// ⚙️ SISTEMA DE CONFIGURACIÓN LOCAL & RENDIMIENTO (UI_SETTINGS)
// =========================================================
var gameSettings = {
    joySize: 120,
    joyX: 30,
    joyY: 30,
    showNametags: true,
    nameOpacity: 0.85,
    showPerformance: true,
    perfOpacity: 0.85,
    timeMode: 'auto',
    rainEnabled: false,
    fxBloom: 0,
    fxGloom: 0,
    fxVignette: 0,
    bgmEnabled: true,
    bgmVolume: 15,
    renderPreset: 'high',    // ultra | high | medium | low | potato
    renderScale: 100,        // 50–100 (% del DPR nativo)
    fpsCap: 60,              // 30 | 60 (frames per second cap)
    disableShadows: false,   // apaga sombras CSS y canvas
    nametag3D: true,         // avatares 3D en nametags
};
window.gameSettings = gameSettings;

function loadSettings() {
    const saved = localStorage.getItem('mmoargon_settings');
    if (saved) {
        try {
            gameSettings = { ...gameSettings, ...JSON.parse(saved) };
            window.gameSettings = gameSettings;
        } catch (e) {
            console.error("Error cargando settings:", e);
        }
    }

    // Sync HTML elements to loaded settings
    const slJoySize = document.getElementById('sl-joy-size');
    if (slJoySize) {
        slJoySize.value = gameSettings.joySize;
        const slJoyX = document.getElementById('sl-joy-x');
        if (slJoyX) slJoyX.value = gameSettings.joyX;
        const slJoyY = document.getElementById('sl-joy-y');
        if (slJoyY) slJoyY.value = gameSettings.joyY;
        const chkShowNametags = document.getElementById('chk-show-nametags');
        if (chkShowNametags) chkShowNametags.checked = gameSettings.showNametags;
        const slNameOpacity = document.getElementById('sl-name-opacity');
        if (slNameOpacity) slNameOpacity.value = Math.round(gameSettings.nameOpacity * 100);

        // Sync Labels
        const valJoySize = document.getElementById('val-joy-size');
        if (valJoySize) valJoySize.innerText = gameSettings.joySize;
        const valJoyX = document.getElementById('val-joy-x');
        if (valJoyX) valJoyX.innerText = gameSettings.joyX;
        const valJoyY = document.getElementById('val-joy-y');
        if (valJoyY) valJoyY.innerText = gameSettings.joyY;
        const valNameOpacity = document.getElementById('val-name-opacity');
        if (valNameOpacity) valNameOpacity.innerText = Math.round(gameSettings.nameOpacity * 100);

        const chkShowPerf = document.getElementById('chk-show-perf');
        if (chkShowPerf) chkShowPerf.checked = gameSettings.showPerformance;
        const slPerfOpacity = document.getElementById('sl-perf-opacity');
        if (slPerfOpacity) slPerfOpacity.value = Math.round(gameSettings.perfOpacity * 100);
        const valPerfOpacity = document.getElementById('val-perf-opacity');
        if (valPerfOpacity) valPerfOpacity.innerText = Math.round(gameSettings.perfOpacity * 100);

        // ⛅ SYNC WEATHER UI
        const selTime = document.getElementById('sel-time-mode');
        if (selTime) selTime.value = gameSettings.timeMode || 'auto';
        const chkRain = document.getElementById('chk-rain');
        if (chkRain) chkRain.checked = gameSettings.rainEnabled || false;
        const selGraphic = document.getElementById('sel-graphic-filter');
        if (selGraphic) selGraphic.value = gameSettings.graphicFilter || 'none';

        const slBloom = document.getElementById('sl-fx-bloom');
        if (slBloom) {
            slBloom.value = gameSettings.fxBloom;
            const slGloom = document.getElementById('sl-fx-gloom');
            if (slGloom) slGloom.value = gameSettings.fxGloom;
            const slVignette = document.getElementById('sl-fx-vignette');
            if (slVignette) slVignette.value = gameSettings.fxVignette;

            const valBloom = document.getElementById('val-fx-bloom');
            if (valBloom) valBloom.innerText = gameSettings.fxBloom;
            const valGloom = document.getElementById('val-fx-gloom');
            if (valGloom) valGloom.innerText = gameSettings.fxGloom;
            const valVignette = document.getElementById('val-fx-vignette');
            if (valVignette) valVignette.innerText = gameSettings.fxVignette;
        }

        // Sync Labels del Audio
        const slBgmVolume = document.getElementById('sl-bgm-volume');
        if (slBgmVolume) {
            slBgmVolume.value = gameSettings.bgmVolume;
            const valBgmVolume = document.getElementById('val-bgm-volume');
            if (valBgmVolume) valBgmVolume.innerText = gameSettings.bgmVolume;
            const chkBgmEnabled = document.getElementById('chk-bgm-enabled');
            if (chkBgmEnabled) chkBgmEnabled.checked = gameSettings.bgmEnabled;
        }

        // ⚡ SYNC RENDIMIENTO UI
        const selPresetEl = document.getElementById('sel-render-preset');
        if (selPresetEl) selPresetEl.value = gameSettings.renderPreset || 'high';
        const slScaleEl = document.getElementById('sl-render-scale');
        if (slScaleEl) { slScaleEl.value = gameSettings.renderScale || 100; }
        const valScaleEl = document.getElementById('val-render-scale');
        if (valScaleEl) valScaleEl.innerText = gameSettings.renderScale || 100;
        const selFpsEl = document.getElementById('sel-fps-cap');
        if (selFpsEl) selFpsEl.value = gameSettings.fpsCap || 60;
        const chkShadEl = document.getElementById('chk-disable-shadows');
        if (chkShadEl) chkShadEl.checked = gameSettings.disableShadows || false;

        // Aplicar escala al canvas desde el principio
        if (typeof dynamicRenderScale !== 'undefined') {
            dynamicRenderScale = (gameSettings.renderScale || 100) / 100;
        }
    }

    applySettingsToGame();
}
window.loadSettings = loadSettings;

function saveSettings() {
    localStorage.setItem('mmoargon_settings', JSON.stringify(gameSettings));
    applySettingsToGame();
}
window.saveSettings = saveSettings;

function applySettingsToGame() {
    const leftJoy = document.getElementById('joystick-zone');
    const rightJoy = document.getElementById('aim-zone');

    if (leftJoy && rightJoy) {
        leftJoy.style.width = `${gameSettings.joySize}px`;
        leftJoy.style.height = `${gameSettings.joySize}px`;
        leftJoy.style.left = `${gameSettings.joyX}px`;
        leftJoy.style.bottom = `${gameSettings.joyY}px`;

        rightJoy.style.width = `${gameSettings.joySize}px`;
        rightJoy.style.height = `${gameSettings.joySize}px`;
        rightJoy.style.right = `${gameSettings.joyX}px`;
        rightJoy.style.bottom = `${gameSettings.joyY}px`;
    }

    const canvasEl = document.getElementById('gameCanvas');
    const fxVignette = document.getElementById('fx-vignette');
    const fxGloom = document.getElementById('fx-gloom');

    if (canvasEl && fxVignette && fxGloom) {
        const bloomPct = gameSettings.fxBloom / 100;
        const contrast = 1.0 + (0.4 * bloomPct);
        const saturate = 1.0 + (0.8 * bloomPct);
        const brightness = 1.0 + (0.2 * bloomPct);

        if (bloomPct === 0) {
            canvasEl.style.filter = 'none';
        } else {
            canvasEl.style.filter = `contrast(${contrast}) saturate(${saturate}) brightness(${brightness})`;
        }

        const gloomPct = gameSettings.fxGloom / 100;
        fxGloom.style.opacity = gloomPct;

        const vigPct = gameSettings.fxVignette / 100;
        const vigSpread = 50 + (100 * vigPct);

        if (vigPct === 0) {
            fxVignette.style.boxShadow = 'none';
        } else {
            fxVignette.style.boxShadow = `inset 0 0 ${vigSpread}px rgba(0,0,0,${vigPct * 0.9})`;
        }
    }

    if (typeof bgmPlayer !== 'undefined') {
        bgmPlayer.volume = gameSettings.bgmVolume / 100;

        if (!gameSettings.bgmEnabled) {
            bgmPlayer.pause();
            if (typeof isBgmPlaying !== 'undefined') isBgmPlaying = false;
        } else if (gameSettings.bgmEnabled && typeof isBgmPlaying !== 'undefined' && !isBgmPlaying && typeof bgmPlaylist !== 'undefined' && bgmPlaylist.length > 0) {
            if (typeof startBGM === 'function') startBGM();
        }
    }

    const uiPerf = document.getElementById('ui-perf-monitor');
    if (uiPerf) {
        uiPerf.style.background = `rgba(15, 15, 20, ${gameSettings.perfOpacity})`;
    }
}
window.applySettingsToGame = applySettingsToGame;

// Preset config & handler
const PRESET_CONFIGS = {
    ultra: { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true, info: null },
    high: { renderScale: 100, fpsCap: 60, disableShadows: false, nametag3D: true, info: null },
    medium: { renderScale: 75, fpsCap: 60, disableShadows: false, nametag3D: true, info: '🟡 Resolución al 75%.' },
    low: { renderScale: 60, fpsCap: 30, disableShadows: true, nametag3D: false, info: '🟠 60% res, cap 30fps, sin sombras.' },
    potato: { renderScale: 50, fpsCap: 30, disableShadows: true, nametag3D: false, info: '🥔 Modo Patata: mínimo absoluto para correr en cualquier teléfono.' },
};

function applyRenderPreset(preset) {
    const cfg = PRESET_CONFIGS[preset];
    if (!cfg) return;
    gameSettings.renderPreset = preset;
    gameSettings.renderScale = cfg.renderScale;
    gameSettings.fpsCap = cfg.fpsCap;
    gameSettings.disableShadows = cfg.disableShadows;
    gameSettings.nametag3D = cfg.nametag3D;

    const slScale = document.getElementById('sl-render-scale');
    const valScale = document.getElementById('val-render-scale');
    const selFps = document.getElementById('sel-fps-cap');
    const chkShad = document.getElementById('chk-disable-shadows');
    const infoDiv = document.getElementById('perf-preset-info');

    if (slScale) slScale.value = cfg.renderScale;
    if (valScale) valScale.innerText = cfg.renderScale;
    if (selFps) selFps.value = cfg.fpsCap;
    if (chkShad) chkShad.checked = cfg.disableShadows;
    if (infoDiv) {
        infoDiv.style.display = cfg.info ? 'block' : 'none';
        infoDiv.innerText = cfg.info || '';
    }

    if (typeof dynamicRenderScale !== 'undefined') {
        dynamicRenderScale = cfg.renderScale / 100;
    }
    if (typeof resize === 'function') resize();
    saveSettings();
}
window.applyRenderPreset = applyRenderPreset;

// Event Listeners for settings UI
window.addEventListener('DOMContentLoaded', () => {
    const bindSlider = (id, settingKey, labelId, isPercentage = false) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                const lbl = document.getElementById(labelId);
                if (lbl) lbl.innerText = val;
                gameSettings[settingKey] = isPercentage ? val / 100 : val;
                applySettingsToGame();
            });
            el.addEventListener('change', saveSettings);
        }
    };

    bindSlider('sl-joy-size', 'joySize', 'val-joy-size');
    bindSlider('sl-joy-x', 'joyX', 'val-joy-x');
    bindSlider('sl-joy-y', 'joyY', 'val-joy-y');
    bindSlider('sl-name-opacity', 'nameOpacity', 'val-name-opacity', true);
    bindSlider('sl-fx-bloom', 'fxBloom', 'val-fx-bloom');
    bindSlider('sl-fx-gloom', 'fxGloom', 'val-fx-gloom');
    bindSlider('sl-fx-vignette', 'fxVignette', 'val-fx-vignette');

    const chkName = document.getElementById('chk-show-nametags');
    if (chkName) {
        chkName.addEventListener('change', (e) => {
            gameSettings.showNametags = e.target.checked;
            saveSettings();
        });
    }

    const selTime = document.getElementById('sel-time-mode');
    if (selTime) {
        selTime.addEventListener('change', (e) => {
            gameSettings.timeMode = e.target.value;
            saveSettings();
        });
    }

    const chkRain = document.getElementById('chk-rain');
    if (chkRain) {
        chkRain.addEventListener('change', (e) => {
            gameSettings.rainEnabled = e.target.checked;
            saveSettings();
        });
    }

    const selGraphic = document.getElementById('sel-graphic-filter');
    if (selGraphic) {
        selGraphic.addEventListener('change', (e) => {
            gameSettings.graphicFilter = e.target.value;
            saveSettings();
        });
    }

    bindSlider('sl-bgm-volume', 'bgmVolume', 'val-bgm-volume');

    const chkBgm = document.getElementById('chk-bgm-enabled');
    if (chkBgm) {
        chkBgm.addEventListener('change', (e) => {
            gameSettings.bgmEnabled = e.target.checked;
            saveSettings();
        });
    }

    bindSlider('sl-perf-opacity', 'perfOpacity', 'val-perf-opacity', true);

    const chkPerf = document.getElementById('chk-show-perf');
    if (chkPerf) {
        chkPerf.addEventListener('change', (e) => {
            gameSettings.showPerformance = e.target.checked;
            saveSettings();
        });
    }

    const selPreset = document.getElementById('sel-render-preset');
    if (selPreset) {
        selPreset.addEventListener('change', (e) => applyRenderPreset(e.target.value));
    }

    bindSlider('sl-render-scale', 'renderScale', 'val-render-scale', false);
    const slRenderScale = document.getElementById('sl-render-scale');
    if (slRenderScale) {
        slRenderScale.addEventListener('input', () => {
            if (typeof dynamicRenderScale !== 'undefined') {
                dynamicRenderScale = gameSettings.renderScale / 100;
            }
            if (typeof resize === 'function') resize();
        });
    }

    const selFpsCap = document.getElementById('sel-fps-cap');
    if (selFpsCap) {
        selFpsCap.addEventListener('change', (e) => {
            gameSettings.fpsCap = parseInt(e.target.value);
            saveSettings();
        });
    }

    const chkShadows = document.getElementById('chk-disable-shadows');
    if (chkShadows) {
        chkShadows.addEventListener('change', (e) => {
            gameSettings.disableShadows = e.target.checked;
            saveSettings();
        });
    }

    loadSettings();
});
