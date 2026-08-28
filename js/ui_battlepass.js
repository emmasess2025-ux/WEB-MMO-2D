// --- BATTLE PASS SYSTEM ---
let bpActiveSeason = null;
let bpXP = 0;
let bpPremium = false;
let bpClaimedFree = [];
let bpClaimedPremium = [];

const bpBtn = document.getElementById("app-battlepass");

// Showcase UI
const bpShowcaseImg = document.getElementById("bp-showcase-img");
const bpShowcaseName = document.getElementById("bp-showcase-name");
const bpShowcaseType = document.getElementById("bp-showcase-type");
const bpShowcaseStatus = document.getElementById("bp-showcase-status");
const bpShowcaseClaimBtn = document.getElementById("bp-showcase-claim-btn");
let activeShowcaseReward = null;
let activeShowcaseTrack = null;

if (bpShowcaseClaimBtn) {
    bpShowcaseClaimBtn.addEventListener("click", () => {
        if (activeShowcaseReward && activeShowcaseTrack) {
            ws.send(MessagePack.encode({
                type: "claim_bp_reward",
                level: activeShowcaseReward.level,
                track: activeShowcaseTrack
            }));
            bpShowcaseClaimBtn.style.transform = "scale(0.95)";
            setTimeout(() => bpShowcaseClaimBtn.style.transform = "scale(1)", 100);
        }
    });
}

const bpModal = document.getElementById("bp-modal");
const closeBpBtn = document.getElementById("close-bp-btn");
const buyPremiumBtn = document.getElementById("buy-premium-btn");
const bpTrackContainer = document.getElementById("bp-track-container");
const bpXpText = document.getElementById("bp-xp-text");
const bpXpBar = document.getElementById("bp-xp-bar");

if (bpBtn) {
    bpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openBattlePass();
    });
}
if (closeBpBtn) {
    closeBpBtn.addEventListener("click", () => {
        bpModal.style.display = "none";
        isTypingOrMenu = false;
    });
}
if (buyPremiumBtn) {
    buyPremiumBtn.addEventListener("click", () => {
        if (!bpActiveSeason) return;
        if (bpPremium) return alert("You already own the Premium Pass!");
        if (confirm(`Unlock Premium Pass for ${bpActiveSeason.costArgems} Argems?`)) {
            ws.send(MessagePack.encode({ type: "buy_premium_bp" }));
        }
    });
}

function openBattlePass() {
    if (!bpActiveSeason) {
        alert("Battle Pass is not active right now.");
        return;
    }
    isTypingOrMenu = true;
    bpModal.style.display = "flex";
    renderBattlePass();
}


function updateBpShowcase(rewardObj, track) {
    if (!rewardObj) return;
    const reward = track === "free" ? rewardObj.free : rewardObj.premium;
    if (!reward) return;

    activeShowcaseReward = rewardObj;
    activeShowcaseTrack = track;

    const isUnlocked = bpXP >= rewardObj.xpRequired;
    const claimedArray = track === "free" ? bpClaimedFree : bpClaimedPremium;
    const isClaimed = claimedArray.includes(rewardObj.level);
    const lockedByPremium = track === "premium" && !bpPremium;

    // Actualizar Textos
    if(bpShowcaseType) {
        bpShowcaseType.innerText = track === "premium" ? "PREMIUM REWARD" : "FREE REWARD";
        bpShowcaseType.style.color = track === "premium" ? "#ffcc00" : "#aaaaaa";
    }

    if (reward.type === "item") {
        if (bpShowcaseName) bpShowcaseName.innerText = reward.id.toUpperCase().replace(/_/g, " ");
        let itemSrc = null;
        if (window.WEAPONS && window.WEAPONS[reward.id]) {
            itemSrc = window.WEAPONS[reward.id].srcPreview || window.WEAPONS[reward.id].src;
        } else if (window.MASTER_CATALOG && window.MASTER_CATALOG[reward.id]) {
            itemSrc = window.MASTER_CATALOG[reward.id].srcPreview || window.MASTER_CATALOG[reward.id].src;
        }
        if (bpShowcaseImg) bpShowcaseImg.src = itemSrc || "";
    } else {
        if (bpShowcaseName) bpShowcaseName.innerText = `${reward.amount} ${reward.type.toUpperCase()}`;
        if (bpShowcaseImg) bpShowcaseImg.src = reward.type === "coins" ? "items/icons/aargon.png" : "items/icons/argem.png";
    }

    // Efecto Pop de Imagen
    if (bpShowcaseImg) {
        bpShowcaseImg.style.transform = "scale(0.8)";
        setTimeout(() => { bpShowcaseImg.style.transform = "scale(1.2)"; }, 50);
    }

    // Actualizar Estado / Botón
    if (bpShowcaseClaimBtn) bpShowcaseClaimBtn.style.display = "none";
    if (bpShowcaseStatus) bpShowcaseStatus.style.display = "block";

    if (isClaimed) {
        if (bpShowcaseStatus) {
            bpShowcaseStatus.innerText = "ALREADY CLAIMED";
            bpShowcaseStatus.style.color = "#00ff00";
            bpShowcaseStatus.style.borderColor = "#00ff00";
        }
    } else if (lockedByPremium) {
        if (bpShowcaseStatus) {
            bpShowcaseStatus.innerText = "REQUIRES PREMIUM PASS";
            bpShowcaseStatus.style.color = "#ff4444";
            bpShowcaseStatus.style.borderColor = "#ff4444";
        }
    } else if (!isUnlocked) {
        if (bpShowcaseStatus) {
            bpShowcaseStatus.innerText = `REACH LEVEL ${rewardObj.level} TO UNLOCK`;
            bpShowcaseStatus.style.color = "#888";
            bpShowcaseStatus.style.borderColor = "#444";
        }
    } else {
        if (bpShowcaseStatus) bpShowcaseStatus.style.display = "none";
        if (bpShowcaseClaimBtn) bpShowcaseClaimBtn.style.display = "block";
    }
}

function renderBattlePass() {
    if (!bpActiveSeason) return;
    document.getElementById("bp-title").innerText = bpActiveSeason.name;
    bpXpText.innerText = bpXP;
    
    if (bpPremium) {
        buyPremiumBtn.innerText = "PREMIUM UNLOCKED";
        buyPremiumBtn.style.background = "linear-gradient(90deg, #00ffcc, #0066ff)";
        buyPremiumBtn.disabled = true;
    }

    bpTrackContainer.innerHTML = "";
    const sortedRewards = [...bpActiveSeason.rewards].sort((a,b) => a.level - b.level);
    
    let currentLevel = 0;
    let nextXpReq = 0;
    let firstUnclaimedBox = null;

    sortedRewards.forEach((r, index) => {
        if (bpXP >= r.xpRequired) currentLevel = r.level;
        if (bpXP < r.xpRequired && nextXpReq === 0) nextXpReq = r.xpRequired;

        const col = document.createElement("div");
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.gap = "4px";
        col.style.minWidth = "60px";
        col.style.alignItems = "center";

        const title = document.createElement("div");
        title.innerText = `Lv${r.level}`;
        title.style.fontSize = "12px";
        title.style.color = (bpXP >= r.xpRequired) ? "#00ffcc" : "#666";
        col.appendChild(title);

        const freeBox = createBpBox(r, "free");
        col.appendChild(freeBox.element);

        const premiumBox = createBpBox(r, "premium");
        col.appendChild(premiumBox.element);

        bpTrackContainer.appendChild(col);

        if (!firstUnclaimedBox) {
            if (freeBox.canClaim) firstUnclaimedBox = { r, track: "free" };
            else if (premiumBox.canClaim) firstUnclaimedBox = { r, track: "premium" };
        }
    });

    if (nextXpReq > 0) {
        const prevReq = currentLevel > 0 ? sortedRewards.find(r=>r.level===currentLevel).xpRequired : 0;
        let progress = ((bpXP - prevReq) / (nextXpReq - prevReq)) * 100;
        progress = Math.max(0, Math.min(100, progress));
        bpXpBar.style.width = progress + "%";
        const xpProgressText = document.getElementById('bp-xp-progress-text');
        if (xpProgressText) xpProgressText.innerText = `${bpXP} / ${nextXpReq} XP`;
    } else {
        bpXpBar.style.width = "100%";
        const xpProgressText = document.getElementById('bp-xp-progress-text');
        if (xpProgressText) xpProgressText.innerText = "MAX LEVEL";
    }

    if (firstUnclaimedBox) {
        updateBpShowcase(firstUnclaimedBox.r, firstUnclaimedBox.track);
    } else if (sortedRewards.length > 0) {
        updateBpShowcase(sortedRewards[currentLevel > 0 ? currentLevel-1 : 0], bpPremium ? "premium" : "free");
    }
}


function createBpBox(rewardObj, track) {
    const box = document.createElement("div");
    box.style.width = "75px";
    box.style.height = "75px";
    box.style.background = track === "premium" ? "linear-gradient(rgba(255,204,0,0.35), rgba(255,204,0,0.15)), rgba(0,0,0,0.85)" : "linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.05)), rgba(0,0,0,0.85)";
        box.style.border = track === "premium" ? "2px solid rgba(255,204,0,0.5)" : "2px solid rgba(255,255,255,0.2)";
    box.style.borderRadius = "8px";
    box.style.display = "flex";
    box.style.justifyContent = "center";
    box.style.alignItems = "center";
    box.style.position = "relative";
    box.style.cursor = "pointer";
    box.style.transition = "transform 0.1s, border-color 0.2s";

    const reward = track === "free" ? rewardObj.free : rewardObj.premium;
    const isUnlocked = bpXP >= rewardObj.xpRequired;
    const claimedArray = track === "free" ? bpClaimedFree : bpClaimedPremium;
    const isClaimed = claimedArray.includes(rewardObj.level);
    const lockedByPremium = track === "premium" && !bpPremium;

    let canClaim = false;

    if (!reward) {
        box.style.opacity = "0.2";
        box.style.border = "2px dashed #333";
        return { element: box, canClaim: false };
    }

    if (!isUnlocked || lockedByPremium) {
        box.style.opacity = "0.5";
        box.style.filter = "grayscale(100%)";
    } else if (isUnlocked && !isClaimed) {
        canClaim = true;
        box.style.border = track === "premium" ? "2px solid #ffcc00" : "2px solid #00ffcc";
        box.style.boxShadow = track === "premium" ? "0 0 10px rgba(255,204,0,0.5)" : "0 0 10px rgba(0,255,204,0.5)";
    }

    const icon = document.createElement("div");
    icon.style.width = "40px";
    icon.style.height = "40px";
    icon.style.display = "flex";
    icon.style.justifyContent = "center";
    icon.style.alignItems = "center";

    if (reward.type === "coins") {
        icon.innerHTML = '<img src="items/icons/aargon.png" style="width:100%; height:100%; object-fit:contain; image-rendering: pixelated;">';
    } else if (reward.type === "argems") {
        icon.innerHTML = '<img src="items/icons/argem.png" style="width:100%; height:100%; object-fit:contain; image-rendering: pixelated;">';
    } else if (reward.type === "item") {
        let itemSrc = null;
        if (window.WEAPONS && window.WEAPONS[reward.id]) itemSrc = window.WEAPONS[reward.id].srcPreview || window.WEAPONS[reward.id].src;
        else if (window.MASTER_CATALOG && window.MASTER_CATALOG[reward.id]) itemSrc = window.MASTER_CATALOG[reward.id].srcPreview || window.MASTER_CATALOG[reward.id].src;
        if (itemSrc) icon.innerHTML = `<img src="${itemSrc}" style="max-width:130%; max-height:130%; object-fit:contain;">`;
        else icon.innerText = "🎁";
    }
    box.appendChild(icon);

    if (isClaimed) {
        const check = document.createElement("div");
        check.innerText = "✓";
        check.style.color = "#00ff00";
        check.style.position = "absolute";
        check.style.bottom = "2px";
        check.style.right = "2px";
        check.style.fontSize = "10px";
        check.style.background = "rgba(0,0,0,0.8)";
        check.style.border = "1px solid #00ff00";
        check.style.padding = "2px 4px";
        check.style.borderRadius = "4px";
        box.appendChild(check);
        box.style.opacity = "0.6";
        box.style.filter = "grayscale(30%)";
    } else if (lockedByPremium) {
        const lock = document.createElement("div");
        lock.innerText = "🔒";
        lock.style.position = "absolute";
        lock.style.bottom = "2px";
        lock.style.right = "2px";
        lock.style.fontSize = "8px";
        lock.style.background = "rgba(0,0,0,0.8)";
        lock.style.border = "1px solid #ff4444";
        lock.style.padding = "2px 4px";
        lock.style.borderRadius = "4px";
        box.appendChild(lock);
    }

    box.addEventListener("click", () => {
        updateBpShowcase(rewardObj, track);
        const allBoxes = document.querySelectorAll('#bp-track-container > div > div');
        allBoxes.forEach(b => b.style.transform = "scale(1)");
        box.style.transform = "scale(1.1)";
    });

    return { element: box, canClaim: canClaim };
}


function showNotification(msg) {
    const notif = document.createElement('div');
    notif.innerText = msg;
    notif.style.position = 'fixed';
    notif.style.top = '20px';
    notif.style.left = '50%';
    notif.style.transform = 'translateX(-50%) translateY(-20px)';
    notif.style.background = 'linear-gradient(90deg, #ffcc00, #ff6699)';
    notif.style.color = 'black';
    notif.style.padding = '10px 20px';
    notif.style.borderRadius = '5px';
    notif.style.fontFamily = '"Press Start 2P", monospace';
    notif.style.fontSize = '12px';
    notif.style.boxShadow = '0 0 15px rgba(255,204,0,0.8)';
    notif.style.zIndex = '9999';
    notif.style.opacity = '0';
    notif.style.transition = 'all 0.3s ease';
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '1';
        notif.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// =========================================================
// ? ADMIN VOICE CHAT (MEGAPHONE / PA SYSTEM) ?
// =========================================================
let adminMediaRecorder = null;
let adminAudioStream = null;

async function getAdminMic() {
    if (!adminAudioStream) {
        adminAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    return adminAudioStream;
}

document.addEventListener('keydown', async (e) => {
    // Solo se activa con la tecla V, sin estar escribiendo en chat, y si el rol es admin
    if (e.code === 'KeyV' && !(document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) && player.role === 'admin' && !adminMediaRecorder) {
        try {
            const stream = await getAdminMic();
            
            // Usamos formato WebM con codec Opus (ligero y estándar)
            adminMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            
            adminMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                    event.data.arrayBuffer().then(buffer => {
                        ws.send(MessagePack.encode({
                            type: 'admin_voice_chunk',
                            audio: new Uint8Array(buffer)
                        }));
                    });
                }
            };
            
            // Pedazos de 200 milisegundos
            adminMediaRecorder.start(200);
            
            // Avisar que estamos hablando
            ws.send(MessagePack.encode({ type: 'admin_voice_status', isSpeaking: true }));
            player.isSpeaking = true;
            
        } catch (err) {
            console.error("Error al acceder al micrófono para Megáfono:", err);
            showNotification("Permiso de micrófono denegado.");
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV' && adminMediaRecorder) {
        adminMediaRecorder.stop();
        // NOTA: NO detenemos adminAudioStream.getTracks() para que el microfono siga encendido (sin latencia al presionar V otra vez)
        
        adminMediaRecorder = null;
        
        ws.send(MessagePack.encode({ type: 'admin_voice_status', isSpeaking: false }));
        player.isSpeaking = false;
    }
});

// --- RECEPTOR Y REPRODUCTOR DE AUDIO ---
let voiceMediaSource = null;
let voiceSourceBuffer = null;
let voiceQueue = [];

function updateSpatialAudio(adminX, adminY) {
    const audioEl = document.getElementById('admin-voice-audio');
    if (!audioEl) return;
    
    if (adminX === undefined || adminY === undefined || !player) {
        audioEl.volume = 1.0;
        return;
    }
    
    const dx = player.worldX - adminX;
    const dy = player.worldY - adminY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const minDistance = 100;
    const maxDistance = 700;
    
    if (distance <= minDistance) {
        audioEl.volume = 1.0;
    } else if (distance >= maxDistance) {
        audioEl.volume = 0.0;
    } else {
        // Atenuación lineal
        const vol = 1.0 - ((distance - minDistance) / (maxDistance - minDistance));
        audioEl.volume = Math.max(0, Math.min(1, vol));
    }
}

function resetVoiceMediaSource() {
    voiceMediaSource = null;
    voiceSourceBuffer = null;
    voiceQueue = [];
    const audioEl = document.getElementById('admin-voice-audio');
    if (audioEl) {
        audioEl.src = ""; // Stop current playback
    }
}


// ==========================================================
// 🍏 iOS MEDIASOURCE FALLBACK VARIABLES
// ==========================================================



// ==========================================================
// 🍏 iOS MEDIASOURCE FALLBACK VARIABLES
// ==========================================================
let iosVoiceFallbackActive = false;
let voiceHeader = null;
let voiceAccumulator = [];
let voiceFallbackTimer = null;

// --- iOS PERSISTENT AUDIO ELEMENT ---
let globalIosAudio = new Audio();
let globalIosAudioUnlocked = false;

function unlockGlobalIosAudio() {
    if (globalIosAudioUnlocked) return;
    try {
        // 🤫 Usamos un micro audio en blanco de 1 byte para engañar a Safari y desbloquear el reproductor
        globalIosAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        globalIosAudio.play().catch(e => {}); 
        globalIosAudioUnlocked = true;
    } catch(e) {}
}
window.addEventListener('pointerdown', unlockGlobalIosAudio, { once: false });
window.addEventListener('keydown', unlockGlobalIosAudio, { once: false });
// ------------------------------------


function initVoiceMediaSource() {
    if (voiceMediaSource || iosVoiceFallbackActive) return;
    const audioEl = document.getElementById('admin-voice-audio');
    if (!audioEl) return;
    
    // iOS Safari / Unsupported Browsers check
    if (typeof MediaSource === 'undefined' || (typeof MediaSource !== 'undefined' && !MediaSource.isTypeSupported('audio/webm;codecs=opus'))) {
        console.warn("MediaSource / WebM not supported! Enabling iOS Audio Fallback.");
        iosVoiceFallbackActive = true;
        return;
    }
    
    voiceMediaSource = new MediaSource();
    audioEl.src = URL.createObjectURL(voiceMediaSource);
    
    voiceMediaSource.addEventListener('sourceopen', () => {
        try {
            voiceSourceBuffer = voiceMediaSource.addSourceBuffer('audio/webm;codecs=opus');
            voiceSourceBuffer.addEventListener('updateend', () => {
                if (voiceQueue.length > 0 && !voiceSourceBuffer.updating) {
                    voiceSourceBuffer.appendBuffer(voiceQueue.shift());
                }
                if (audioEl.paused) {
                    audioEl.play().catch(e => console.warn("Autoplay block:", e));
                }
            });
            
            if (voiceQueue.length > 0 && !voiceSourceBuffer.updating) {
                voiceSourceBuffer.appendBuffer(voiceQueue.shift());
            }
        } catch (e) {
            console.error("Error al crear SourceBuffer:", e);
            iosVoiceFallbackActive = true;
        }
    });
}

function handleAdminVoiceChunk(uint8Array, adminX, adminY) {
    if (!voiceHeader) voiceHeader = uint8Array; // THE GOLDEN WEBM HEADER
    
    // iOS FALLBACK (WALKIE-TALKIE MODE)
    if (typeof iosVoiceFallbackActive !== 'undefined' && iosVoiceFallbackActive) {
        voiceAccumulator.push(uint8Array);
        // El audio se reproducirá cuando el admin suelte el botón (isSpeaking = false)
        return;
    }

    if (!voiceMediaSource) {
        initVoiceMediaSource();
        if (iosVoiceFallbackActive) {
            handleAdminVoiceChunk(uint8Array, adminX, adminY); // Retry with fallback
            return;
        }
    }
    
    // Actualizar Audio Espacial
    if (adminX !== undefined && adminY !== undefined) {
        if (typeof updateSpatialAudio === 'function') updateSpatialAudio(adminX, adminY);
    }
    
    if (voiceSourceBuffer && !voiceSourceBuffer.updating) {
        try {
            voiceSourceBuffer.appendBuffer(uint8Array);
        } catch (e) {
            voiceQueue.push(uint8Array);
        }
    } else {
        voiceQueue.push(uint8Array);
    }
}

// ==========================================================
// 💤 SLEEP / ABORT LOGIC
// ==========================================================
// Force disconnect if the user minimizes the tab or locks the device
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // console.log("Tab hidden / Device locked. Forcing disconnect to prevent ghost clones.");
        // if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        //     ws.close(1000, "Background");
        // }
        // 🔇 MUTE BACKGROUND AUDIO EN iOS (Para que no suene con la app cerrada)
        if (typeof bgmPlayer !== 'undefined' && bgmPlayer) bgmPlayer.pause();
        if (typeof globalIosAudio !== 'undefined' && globalIosAudio) globalIosAudio.pause();
    } else {
        // 🔊 RENOVAR AUDIO AL VOLVER
        if (typeof bgmPlayer !== 'undefined' && bgmPlayer && isBgmPlaying) bgmPlayer.play().catch(e=>{});
    }
});


// --- PAGEHIDE FADE OUT TRANSITION ---
window.addEventListener('beforeunload', () => {
    const overlay = document.createElement('div');
    overlay.id = 'demo-exit-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = '#000';
    overlay.style.zIndex = '9999999';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });
    });
});


// --- HANDLE FORWARD NAVIGATION BFCache ---
window.addEventListener('pageshow', (event) => {
    const o = document.getElementById('demo-exit-overlay');
    if (o) o.remove();

            if (event.persisted) {
                window.location.reload();
            }

});


// ==========================================================
// 🍏 iOS AUDIO AUTOPLAY UNLOCKER
// ==========================================================
let iosAudioUnlocked = false;
function unlockiOSAudio() {
    if (iosAudioUnlocked) return;
    const audioEl = document.getElementById('admin-voice-audio');
    if (audioEl) {
        audioEl.play().catch(e => {}); 
    }
    const AudioCtxt = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxt) {
        const ctx = new AudioCtxt();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.01);
    }
    iosAudioUnlocked = true;
    document.removeEventListener('pointerdown', unlockiOSAudio);
    document.removeEventListener('keydown', unlockiOSAudio);
}
document.addEventListener('pointerdown', unlockiOSAudio, { once: true });
document.addEventListener('keydown', unlockiOSAudio, { once: true });


// --- INTERACTIVE 3D SPIN LOGIC ---
let currentRotationY = 0;
let isDraggingSpin = false;
let previousMouseX = 0;
let autoSpinSpeed = 1.5; // degrees per frame

function animateSpin() {
    if (!isDraggingSpin) {
        currentRotationY += autoSpinSpeed;
    }
    const spinWrapper = document.getElementById('bp-spin-wrapper');
    if (spinWrapper) {
        spinWrapper.style.transform = `rotateY(${currentRotationY}deg)`;
    }
    requestAnimationFrame(animateSpin);
}

// Start animation loop
requestAnimationFrame(animateSpin);

function setupInteractiveSpin() {
    const interactiveArea = document.getElementById('bp-interactive-area');
    if (!interactiveArea) {
        setTimeout(setupInteractiveSpin, 500); // Retry if not yet loaded
        return;
    }

    interactiveArea.addEventListener('mousedown', (e) => {
        isDraggingSpin = true;
        previousMouseX = e.clientX;
        interactiveArea.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (isDraggingSpin) {
            const deltaX = e.clientX - previousMouseX;
            currentRotationY += deltaX * 1.5; // sensitivity
            previousMouseX = e.clientX;
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingSpin = false;
        interactiveArea.style.cursor = 'grab';
    });
    
    // Touch support for mobile
    interactiveArea.addEventListener('touchstart', (e) => {
        isDraggingSpin = true;
        previousMouseX = e.touches[0].clientX;
    }, {passive: true});

    window.addEventListener('touchmove', (e) => {
        if (isDraggingSpin) {
            const deltaX = e.touches[0].clientX - previousMouseX;
            currentRotationY += deltaX * 1.5;
            previousMouseX = e.touches[0].clientX;
        }
    }, {passive: true});

    window.addEventListener('touchend', () => {
        isDraggingSpin = false;
    });
}

// Run setup
setupInteractiveSpin();
