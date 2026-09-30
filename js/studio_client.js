let editor;
let socket;
window.window.currentPlanetId = 'main';
let planetsList = [];
let currentPlanetMeta = { name: '', maxPlayers: 50, isPublished: false };
// --- UGC SCRIPT REGISTRY TABS: __world = legacy planet script, resto = Planet.scripts[scriptId] ---
let currentView = { type: 'world' };
let buffers = { __world: '' };
let scriptIds = [];
let planetSounds = [];

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' }});

require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: `// Aargon Studio - Planet Script`,
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: false }
    });

    connectToServer();
    
    // Add Ctrl+S support in Monaco
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
        saveScript();
    });
});

document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveScript(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); showProjectManager(); }
});

function connectToServer() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsUrl = isLocal ? 'ws://localhost:8080' : 'wss://my-chat-server-ihxw.onrender.com';
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        document.getElementById('connection-status').innerText = 'Connected';
        document.getElementById('connection-status').style.color = '#89d185';

        // Auth por sesion del juego: si logueaste en demo.html, gameToken ya identifica tu cuenta.
        // Fallback al token manual legacy solo si no hay sesion.
        const sessionToken = localStorage.getItem('gameToken');
        if (sessionToken) {
            socket.send(JSON.stringify({ type: 'studio_auth', token: sessionToken, via: 'session' }));
        } else {
            const token = localStorage.getItem('token') || prompt('Ingresa tu Token de Creador (Admin):');
            if (token) {
                localStorage.setItem('token', token);
                socket.send(JSON.stringify({ type: 'studio_auth', token: token, via: 'legacy' }));
            }
        }
    };

    socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return; // Ignore binary game broadcasts
        let data;
        try { data = JSON.parse(event.data); } catch(e) { return; }

        
        if (data.type === 'studio_log') {
            logToTerminal(data.message, data.isError);
        } else if (data.type === 'studio_load_planet') {
            window.window.currentPlanetId = data.planetId;
            currentPlanetMeta = {
                name: data.name || data.planetId,
                maxPlayers: data.maxPlayers || 50,
                isPublished: data.isPublished || false
            };
            
            document.getElementById('tb-planet-title').innerText = currentPlanetMeta.name;
            
            const statusEl = document.getElementById('tb-planet-status');
            if (currentPlanetMeta.isPublished) {
                statusEl.innerText = "Public";
                statusEl.style.background = "#2ea043";
            } else {
                statusEl.innerText = "Private";
                statusEl.style.background = "#444";
            }
            
            editor.setValue(data.script || `// Aargon Studio - ${data.planetId}`);
            buffers = { __world: data.script || `// Aargon Studio - ${data.planetId}` };
            scriptIds = Object.keys(data.scripts || {});
            scriptIds.forEach(sid => { buffers[sid] = (data.scripts || {})[sid] || ''; });
            currentView = { type: 'world' };
            renderTabs();
            planetSounds = data.sounds || [];
            renderSoundsList();
            logToTerminal(`Project ${data.planetId} loaded (${scriptIds.length} tile scripts).`);
            renderProjectGrid();
            hideProjectManager();
        } else if (data.type === 'studio_scripts_list') {
            if (data.planetId !== window.window.currentPlanetId) return;
            scriptIds = data.scripts || [];
            scriptIds.forEach(sid => { if (!(sid in buffers)) buffers[sid] = ''; });
            // Drop buffers de scripts eliminados (salvo el visible)
            Object.keys(buffers).forEach(k => {
                if (k !== '__world' && !scriptIds.includes(k) && (currentView.type !== 'script' || currentView.id !== k)) delete buffers[k];
            });
            renderTabs();
        } else if (data.type === 'studio_sounds_list') {
            if (data.planetId !== window.window.currentPlanetId) return;
            planetSounds = data.sounds || [];
            renderSoundsList();
        } else if (data.type === 'studio_list_planets') {
            planetsList = data.planets;
            renderProjectGrid();
            if (data.firstRun) {
                // Sin defaults: a elegir o crear. Sin planetas -> directo a crear.
                if (!planetsList.length) {
                    showProjectManager();
                    promptCreatePlanet();
                } else {
                    showProjectManager();
                }
            } else if (planetsList.length > 0 && window.currentPlanetId === 'main') {
                showProjectManager();
            }
        }
    };

    socket.onclose = () => {
        document.getElementById('connection-status').innerText = 'Disconnected';
        document.getElementById('connection-status').style.color = '#f14c4c';
        setTimeout(connectToServer, 3000);
    };
}

function renderProjectGrid() {
    const grid = document.getElementById('pm-grid');
    grid.innerHTML = `
        <div class="project-card new-project" onclick="promptCreatePlanet()">
            <div class="project-icon">+</div>
            <div class="project-name">New Project</div>
        </div>
    `;
    
    planetsList.forEach(p => {
        const div = document.createElement('div');
        div.className = 'project-card' + (p.planetId === window.currentPlanetId ? ' active' : '');
        div.style.border = p.planetId === window.currentPlanetId ? '1px solid #007acc' : '';
        div.innerHTML = `
            <div class="project-icon">🌍</div>
            <div class="project-name">${p.name || p.planetId}</div>
            <div class="project-meta">${p.isPublished ? '🟢 Public' : '⚪ Private'} | Max: ${p.maxPlayers||50}</div>
        `;
        div.onclick = () => loadPlanet(p.planetId);
        const playBtn = document.createElement('button');
        playBtn.className = 'btn-primary';
        playBtn.style.marginTop = '8px';
        playBtn.innerText = '▶ Test Play';
        playBtn.title = 'Abrir el juego directo en este planeta (funciona en desarrollo si eres owner)';
        playBtn.onclick = (e) => { e.stopPropagation(); testPlay(p.planetId); };
        div.appendChild(playBtn);
        grid.appendChild(div);
    });
}

function testPlay(planetId) {
    window.open('demo.html?planet=' + encodeURIComponent(planetId), '_blank');
}

function loadPlanet(planetId) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    buffers = { __world: '' };
    scriptIds = [];
    currentView = { type: 'world' };
    renderTabs();
    socket.send(JSON.stringify({ type: 'studio_req_planet', planetId: planetId }));
}

function showProjectManager() { document.getElementById('project-manager-modal').style.display = 'flex'; }
function hideProjectManager() { document.getElementById('project-manager-modal').style.display = 'none'; }

// CREATION
function promptCreatePlanet() {
    hideProjectManager();
    document.getElementById('create-planet-modal').style.display = 'flex';
    document.getElementById('new-planet-name').focus();
}
function hideCreatePlanet() { document.getElementById('create-planet-modal').style.display = 'none'; }
function submitCreatePlanet() {
    const pName = document.getElementById('new-planet-name').value;
    let pMax = parseInt(document.getElementById('new-planet-max').value) || 50;
    if (pMax > 100) pMax = 100;
    if (!pName) return;
    
    const pId = 'planet_' + Math.floor(Math.random()*1000000);
    
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ 
        type: 'studio_create_planet', 
        planetId: pId, 
        name: pName,
        maxPlayers: pMax
    }));
    hideCreatePlanet();
    document.getElementById('new-planet-name').value = '';
}

// SETTINGS
let pendingSettings = null;

function openProjectSettings() {
    document.getElementById('settings-planet-id').innerText = `Editing settings for ID: ${window.currentPlanetId}`;
    document.getElementById('settings-name').value = currentPlanetMeta.name;
    document.getElementById('settings-max').value = currentPlanetMeta.maxPlayers;
    document.getElementById('settings-status').value = currentPlanetMeta.isPublished ? "true" : "false";
    document.getElementById('project-settings-modal').style.display = 'flex';
}

function hideProjectSettings() { document.getElementById('project-settings-modal').style.display = 'none'; }

function submitProjectSettings() {
    const newName = document.getElementById('settings-name').value;
    let newMax = parseInt(document.getElementById('settings-max').value) || 50;
    if (newMax > 100) newMax = 100;
    const newPub = document.getElementById('settings-status').value === "true";
    
    pendingSettings = { name: newName, maxPlayers: newMax, isPublished: newPub };
    hideProjectSettings();
    
    if (newPub && !currentPlanetMeta.isPublished) {
        // Going from private to public -> ask for confirm
        document.getElementById('confirm-publish-modal').style.display = 'flex';
    } else {
        applySettingsToCloud();
    }
}

function cancelPublish() {
    document.getElementById('confirm-publish-modal').style.display = 'none';
}

function confirmPublish() {
    document.getElementById('confirm-publish-modal').style.display = 'none';
    applySettingsToCloud();
}

function applySettingsToCloud() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    socket.send(JSON.stringify({
        type: 'studio_save_settings',
        planetId: window.currentPlanetId,
        name: pendingSettings.name,
        maxPlayers: pendingSettings.maxPlayers,
        isPublished: pendingSettings.isPublished
    }));
    
    logToTerminal("Saving project settings...");
}

// EDITOR
function stashCurrentBuffer() {
    if (!editor) return;
    const key = currentView.type === 'world' ? '__world' : currentView.id;
    buffers[key] = editor.getValue();
}
function renderTabs() {
    const bar = document.getElementById('scripts-tabbar');
    if (!bar) return;
    bar.innerHTML = '';
    const mk = (label, active, onclick, title) => {
        const d = document.createElement('div');
        d.className = 'script-tab' + (active ? ' active' : '');
        d.innerText = label;
        if (title) d.title = title;
        d.onclick = onclick;
        bar.appendChild(d);
        return d;
    };
    mk('🌍 World', currentView.type === 'world', () => switchScript({ type: 'world' }), 'Script global del planeta (onTick, onPlayerJoin)');
    scriptIds.forEach(sid => {
        const tab = mk('🧱 ' + sid, currentView.type === 'script' && currentView.id === sid, () => switchScript({ type: 'script', id: sid }), 'onTileInteract para tiles con scriptId=' + sid);
        tab.ondblclick = (e) => { e.stopPropagation(); deleteScript(sid); };
    });
    const plus = document.createElement('div');
    plus.className = 'script-tab new-tab';
    plus.innerText = '+ Tile script';
    plus.title = 'Crear scriptId nuevo (luego asígnalo a tiles en el editor)';
    plus.onclick = newScript;
    bar.appendChild(plus);
}
function switchScript(view) {
    stashCurrentBuffer();
    currentView = view;
    const key = view.type === 'world' ? '__world' : view.id;
    if (!(key in buffers)) buffers[key] = view.type === 'world' ? '' : `// Tile script: ${view.id}\n// Se ejecuta con onTileInteract(e) al hacer click/pisar el tile.\n// e = { scriptId, kind, playerId, username, x, y, planetId }\n\nfunction onTileInteract(e) {\n    message(e.playerId, 'Hola desde ${view.id}');\n}\n`;
    if (editor) editor.setValue(buffers[key]);
    renderTabs();
}
function newScript() {
    const sid = prompt('Nombre del scriptId (letras, números, _). Ej: door1');
    if (!sid) return;
    const clean = sid.trim();
    if (!/^[A-Za-z0-9_]+$/.test(clean)) return alert('scriptId inválido (solo letras, números y _).');
    if (scriptIds.includes(clean)) return switchScript({ type: 'script', id: clean });
    stashCurrentBuffer();
    scriptIds.push(clean);
    buffers[clean] = `// Tile script: ${clean}\n// Se ejecuta con onTileInteract(e) al hacer click/pisar el tile.\n// e = { scriptId, kind, playerId, username, x, y, planetId }\n\nfunction onTileInteract(e) {\n    message(e.playerId, 'Hola desde ${clean}');\n}\n`;
    switchScript({ type: 'script', id: clean });
    logToTerminal(`Script ${clean} creado localmente. Guárdalo con Save (Ctrl+S).`);
}
function deleteScript(sid) {
    if (!confirm(`¿Eliminar script "${sid}" del planeta? Los tiles que lo usen quedarán sin lógica.`)) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'studio_delete_script', planetId: window.currentPlanetId, scriptId: sid }));
    scriptIds = scriptIds.filter(s => s !== sid);
    delete buffers[sid];
    if (currentView.type === 'script' && currentView.id === sid) {
        currentView = { type: 'world' };
        if (editor) editor.setValue(buffers.__world || '');
    }
    renderTabs();
    logToTerminal(`Eliminando script ${sid}...`);
}
function saveScript() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return alert("Not connected to server.");

    const code = editor.getValue();
    if (currentView.type === 'world') {
        buffers.__world = code;
        socket.send(JSON.stringify({
            type: 'studio_save_planet',
            planetId: window.currentPlanetId,
            script: code
        }));
        logToTerminal("Saving world script to cloud...");
    } else {
        buffers[currentView.id] = code;
        socket.send(JSON.stringify({
            type: 'studio_save_script',
            planetId: window.currentPlanetId,
            scriptId: currentView.id,
            script: code
        }));
        logToTerminal(`Saving tile script ${currentView.id} to cloud...`);
    }
}

function logToTerminal(msg, isError = false) {
    const term = document.getElementById('terminal');
    const time = new Date().toLocaleTimeString();
    const colorClass = isError ? 'log-error' : 'log-msg';
    term.innerHTML += `<div class="log-entry"><span class="log-time">[${time}]</span><span class="${colorClass}">${msg}</span></div>`;
    term.scrollTop = term.scrollHeight;
}

// --- UGC SOUND LIST (registro por planeta) ---
function renderSoundsList() {
    let box = document.getElementById('sound-list');
    if (!box) return;
    box.innerHTML = '';
    if (!planetSounds.length) {
        box.innerHTML = '<div style="color:#858585; font-size:12px;">Sin sonidos. Sube el primero arriba.</div>';
        return;
    }
    planetSounds.forEach(s => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.3); border:1px solid #444; border-radius:4px; padding:6px 8px; margin-bottom:6px; font-size:12px;';
        const nm = document.createElement('span');
        nm.style.cssText = 'color:#fff; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        nm.innerText = s.id;
        nm.title = s.url;
        const play = document.createElement('button');
        play.className = 'btn-secondary'; play.style.padding = '4px 8px'; play.innerText = '▶';
        play.onclick = () => { new Audio(s.url).play().catch(() => {}); };
        const use = document.createElement('button');
        use.className = 'btn-secondary'; use.style.padding = '4px 8px'; use.innerText = 'Usar';
        use.title = "Copiar snippet playSound('" + s.id + "')";
        use.onclick = () => {
            document.getElementById('sound-result').style.display = 'block';
            document.getElementById('sound-snippet').innerText = `playSound('${s.id}');`;
        };
        const del = document.createElement('button');
        del.className = 'btn-secondary'; del.style.padding = '4px 8px'; del.innerText = '✕';
        del.onclick = () => {
            if (!confirm(`¿Eliminar "${s.id}" del registro?`)) return;
            socket.send(JSON.stringify({ type: 'studio_delete_sound', planetId: window.currentPlanetId, soundId: s.id }));
        };
        row.appendChild(nm); row.appendChild(play); row.appendChild(use); row.appendChild(del);
        box.appendChild(row);
    });
}

// --- UGC SOUND UPLOAD (ventana propia, separada de Assets de imagen) ---
function openSoundModal() {
    document.getElementById('sound-modal').style.display = 'flex';
    document.getElementById('sound-result').style.display = 'none';
}
(function initSoundModal() {
    const bind = () => {
        const fileInput = document.getElementById('sound-file');
        const preview = document.getElementById('sound-preview');
        const btn = document.getElementById('btn-upload-sound');
        if (!fileInput || !btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        let currentFile = null;
        fileInput.addEventListener('change', () => {
            const f = fileInput.files[0];
            currentFile = f || null;
            if (f && preview) {
                preview.src = URL.createObjectURL(f);
                preview.style.display = 'block';
            } else if (preview) {
                preview.style.display = 'none';
            }
        });
        btn.addEventListener('click', async () => {
            const nameEl = document.getElementById('sound-name');
            const name = (nameEl.value || '').trim();
            if (!currentFile) return alert('Elige un .mp3/.wav/.ogg primero.');
            if (!name) return alert('Dale un nombre al sonido.');
            if (currentFile.size > 1024 * 1024) return alert('Muy pesado (max 1MB). Recorta o exporta a mp3.');
            const fd = new FormData();
            fd.append('sound', currentFile);
            fd.append('soundName', name);
            fd.append('itemId', ((document.getElementById('sound-item') || {}).value || '').trim());
            fd.append('planetId', window.currentPlanetId || 'main');
            fd.append('ownerId', localStorage.getItem('token') || 'system');
            btn.innerText = 'Uploading...';
            btn.disabled = true;
            try {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const apiUrl = isLocal ? 'http://localhost:8080/api/upload_sound' : 'https://my-chat-server-ihxw.onrender.com/api/upload_sound';
                const res = await fetch(apiUrl, { method: 'POST', body: fd });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('sound-result').style.display = 'block';
                    document.getElementById('sound-snippet').innerText = `playSound('${data.soundId || data.url}');`;
                    if (data.soundId) {
                        planetSounds = planetSounds.filter(s => s.id !== data.soundId);
                        planetSounds.push({ id: data.soundId, url: data.url });
                        renderSoundsList();
                    }
                    logToTerminal(`Sound subido: ${data.soundName} (${Math.round(currentFile.size / 1024)}KB)`);
                } else {
                    alert('Upload failed: ' + (data.error || '?'));
                }
            } catch (e) {
                console.error(e);
                alert('Upload crashed.');
            } finally {
                btn.innerText = 'Upload Sound';
                btn.disabled = false;
            }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
})();
