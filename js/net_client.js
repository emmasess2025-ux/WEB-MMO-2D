// =========================================================
// 🌐 NETWORK CLIENT & PACKET ROUTER (WEBSOCKET & MSGPACK)
// =========================================================

// Auth UI Elements
var authOverlay = window.authOverlay = window.authOverlay || document.getElementById('auth-overlay');
var authEmail = window.authEmail = window.authEmail || document.getElementById('auth-email');
var authUsername = window.authUsername = window.authUsername || document.getElementById('auth-username');
var authPassword = window.authPassword = window.authPassword || document.getElementById('auth-password');
var authMessage = window.authMessage = window.authMessage || document.getElementById('auth-message');
var loginBtn = window.loginBtn = window.loginBtn || document.getElementById('login-btn');
var registerBtn = window.registerBtn = window.registerBtn || document.getElementById('register-btn');

// --- CONEXIÃ“N INTELIGENTE (LOCAL vs PRODUCCIÃ“N) ---
// Si estÃ¡s en tu PC (localhost), usa tu servidor local. 
// Si estÃ¡s en GitHub Pages o LirosMusic, usa el servidor de la nube (Render).
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// RECUERDA: Cambia la URL de Render por la de tu servidor real cuando lo subas
const wsUrl = isLocal ? 'ws://localhost:8080' : 'wss://my-chat-server-ihxw.onrender.com';

var ws = window.ws = new WebSocket(wsUrl);
ws.binaryType = "arraybuffer"; // ⚡ THIS IS CRITICAL FOR MESSAGEPACK

// --- WEBSOCKET CONNECTION STATE ---
if (authMessage) {
    authMessage.style.color = '#f1c40f'; // Yellow
    authMessage.innerText = "Connecting to server...";
}

ws.onopen = () => {
    if (authMessage) {
        authMessage.style.color = 'white';
        authMessage.innerText = "Server connected! Please log in.";
    }

    // Check if we have a saved session token!
    const savedToken = localStorage.getItem('gameToken');
    if (savedToken) {
        if (authMessage) {
            authMessage.style.color = '#f1c40f';
            authMessage.innerText = "Resuming session...";
        }
        ws.send(MessagePack.encode({ type: 'auto_login', token: savedToken }));
    } else {
        if (authMessage) {
            authMessage.innerText = ""; // Clear the "connecting" message
        }
    }
};

// (Dynamic Island handled in js/ui_island.js)
ws.onclose = () => {
    console.error('El servidor ha cerrado la conexión (Render Sleep Mode).');
    const disc = document.getElementById('disconnect-screen');
    if (disc) disc.style.display = 'flex';
};

ws.onmessage = (event) => {
    const data = MessagePack.decode(new Uint8Array(event.data));
    // --- NUEVO: SISTEMA UNIFICADO DE REPOSICIÓN (KNOCKBACK Y ANTI-HACK) ---
    if (data.type === 'force_position') {
        if (data.reason === 'knockback') {
            player.kbX = (data.x - player.worldX) / 3;
            player.kbY = (data.y - player.worldY) / 3;

            // ðŸ›‘ EL FIX 1: Arrancamos el cronÃ³metro de tambaleo
            player.staggerTimer = Date.now();
            return;
        }
        // 1. Regresar fÃ­sicamente al personaje
        player.worldX = data.x;
        player.worldY = data.y;

        // 2. Detener cualquier inercia de movimiento
        player.vx = 0;
        player.vy = 0;
        lastNetworkString = ""; // Obliga al navegador a sincronizarse de golpe

        // 3. Flash rojo y penalti SOLO si es anti-hack real, NO por colisiones con paredes
        if (data.reason === 'antihack' || (!data.reason)) {
            player.speed = 4; // Matar posible speedhack
            if (uiFadeOverlay) {
                uiFadeOverlay.style.background = 'red';
                uiFadeOverlay.style.opacity = '0.5';
                setTimeout(() => {
                    uiFadeOverlay.style.opacity = '0';
                    setTimeout(() => { uiFadeOverlay.style.background = 'black'; }, 200);
                }, 100);
            }
        }
        // reason:'wall' = colisiÃ³n limpia, sin flash ni penalti
        return; // Detenemos la ejecuciÃ³n
    }

    // --- NEW: BLUEPRINTS (PREFABS) ---
    if (data.type === 'blueprint_list') {
        const listDiv = document.getElementById('prefabs-list');
        if (listDiv) {
            listDiv.innerHTML = '';
            if (!data.blueprints || data.blueprints.length === 0) {
                listDiv.innerHTML = '<div style="color: #aaa; text-align: center; padding: 10px;">No hay prefabs guardados.</div>';
            } else {
                data.blueprints.forEach(bp => {
                    const btn = document.createElement('button');
                    btn.style.background = '#222';
                    btn.style.border = '1px solid #444';
                    btn.style.color = 'white';
                    btn.style.padding = '10px';
                    btn.style.borderRadius = '5px';
                    btn.style.cursor = 'pointer';
                    btn.style.display = 'flex';
                    btn.style.justifyContent = 'space-between';
                    btn.innerHTML = `<span><b>${bp.name}</b></span> <span style="color:#aaa;">(${bp.w}x${bp.h})</span>`;
                    btn.onclick = () => {
                        // Cargar en el pincel
                        selectedGrid = {
                            w: bp.w,
                            h: bp.h,
                            isMultiLayer: bp.isMultiLayer,
                            multiTiles: bp.multiTiles,
                            tiles: []
                        };
                        document.getElementById('prefabs-modal').style.display = 'none';

                        // Auto-cambiar a Paint
                        worldMode = 'paint';
                        mapSelectionBox = null; // ELIMINA EL CUADRO MORADO DESPUES DE EQUIPAR
                        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                        document.getElementById('world-paint-btn').classList.add('active');
                    };
                    listDiv.appendChild(btn);
                });
            }
        }
        return;
    }

    // --- NEW: AUTHENTICATION RESPONSES ---
    if (data.type === 'auth_error') {
        authMessage.style.color = '#ff6b6b'; // Red
        authMessage.innerText = data.message;
    } // --- RECIBIR RESPUESTA DE LA TIENDA ---
    else if (data.type === 'soccer_update') {
        if (window.soccerMinigame) {
            window.soccerMinigame.updateBall(data.bx, data.by, data.s1, data.s2);

            // Show scoreboard UI if not already visible
            const sb = document.getElementById('soccer-scoreboard');
            if (sb && sb.style.display === 'none') {
                sb.style.display = 'block';
            }
        }
    }
    else if (data.type === 'delete_minigame') {
        if (window.soccerMinigame) {
            window.soccerMinigame.ball.active = false;
        }
        const sb = document.getElementById('soccer-scoreboard');
        if (sb) {
            sb.style.display = 'none';
        }
    }
    else if (data.type === 'inventory_update') {
        player.inventory = data.inventory;
        renderInventory();
    } else if (data.type === 'bp_xp_added') {
        bpXP = data.totalXP;
        showNotification(`â­ +${data.amount} BP XP!`);
        renderBattlePass();
    } else if (data.type === 'bp_premium_unlocked') {
        bpPremium = true;
        showNotification(`â­ PREMIUM PASS UNLOCKED!`);
        renderBattlePass();
    } else if (data.type === 'bp_reward_claimed') {
        bpClaimedFree = data.bpClaimedFree;
        bpClaimedPremium = data.bpClaimedPremium;

        let rw = data.reward;
        let rewardName = rw.type === 'item' ? rw.id : `${rw.amount} ${rw.type}`;
        showNotification(`â­ Claimed: ${rewardName}`);
        renderBattlePass();
    } else if (data.type === 'task_claimed') {
        myClaimedTasks = data.claimedTasks;
        if (typeof renderTasksModal === 'function') renderTasksModal();
        if (typeof checkTaskBadge === 'function') checkTaskBadge();

        // Texto flotante de Ã©xito
        spawnDamageText(player.worldX, player.worldY, "Â¡RECOMPENSA!", true);
    } else if (data.type === 'coins_update') {
        player.coins = data.coins;
        const coinsDisplay = document.getElementById('profile-coins-display');
        if (coinsDisplay) coinsDisplay.innerText = player.coins;
    } else if (data.type === 'claim_error') {
        // NUNCA silencies un error en desarrollo. Si falla, el jugador debe saber por quÃ©.
        alert("âŒ No se pudo reclamar: " + (data.message || "Error desconocido"));
        // Forzamos a repintar para quitar el estado de "Procesando..."
        if (typeof renderTasksModal === 'function') renderTasksModal();
    } else if (data.type === 'argem_packages_data') {
        const grid = document.getElementById('argems-store-grid');
        if (!grid) return;
        grid.innerHTML = '';

        data.packages.forEach(pkg => {
            const card = document.createElement('div');
            card.style.cssText = `background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; padding: 20px; text-align: center; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; transition: 0.2s; box-shadow: 0 5px 15px rgba(0,0,0,0.3);`;
            card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.boxShadow = `0 10px 25px ${pkg.color}33, inset 0 0 15px ${pkg.color}33`; card.style.borderColor = pkg.color; };
            card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)'; card.style.borderColor = 'rgba(255,255,255,0.1)'; };

            if (pkg.badge) {
                const badge = document.createElement('div');
                badge.innerText = pkg.badge;
                badge.style.cssText = `position: absolute; top: -10px; right: -10px; background: ${pkg.color}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.5);`;
                card.appendChild(badge);
            }

            card.innerHTML += `
                        <div style="font-size: 48px; margin-bottom: 10px; filter: drop-shadow(0 0 10px ${pkg.color}88);"><img src="items/icons/argem.png" alt="Argem" style="height: 1.2em; vertical-align: text-bottom; filter: drop-shadow(0 0 5px rgba(241,196,15,0.5)); image-rendering: pixelated; image-rendering: crisp-edges;"></div>
                        <h3 style="color: white; margin: 0 0 5px 0; font-size: 16px;">${pkg.title}</h3>
                        <div style="color: #f1c40f; font-weight: bold; font-size: 24px; margin-bottom: 15px; text-shadow: 0 0 5px rgba(241,196,15,0.5);">${pkg.gemsAmount}</div>
                    `;

            const btn = document.createElement('button');
            btn.innerText = pkg.priceString + ' USD';
            btn.style.cssText = `background: ${pkg.color}; border: none; color: white; padding: 10px 0; width: 100%; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.3);`;
            btn.onmouseover = () => { btn.style.filter = 'brightness(1.2)'; };
            btn.onmouseout = () => { btn.style.filter = 'brightness(1)'; };

            btn.onclick = () => {
                if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                    btn.innerText = "Processing...";
                    ws.send(MessagePack.encode({ type: 'request_purchase_gems', packageId: pkg.id }));
                }
            };
            card.appendChild(btn);
            grid.appendChild(card);
        });

    } else if (data.type === 'stripe_checkout_url') {

        const width = 500;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        window.open(data.url, 'StripeCheckout', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`);


        // Refetch packages to reset the buttons back from "Processing..."
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'get_argem_packages' }));
        }

    } else if (data.type === 'gems_purchase_success') {
        player.gems = data.newGems;
        const balanceDisplay = document.getElementById('argems-balance-display');
        if (balanceDisplay) {
            balanceDisplay.innerHTML = `${player.gems} <img src="items/icons/argem.png" alt="Argem" style="height: 1.2em; vertical-align: text-bottom; filter: drop-shadow(0 0 5px rgba(241,196,15,0.5)); image-rendering: pixelated; image-rendering: crisp-edges;">`;
            // Premium Glow Animation
            balanceDisplay.style.transition = 'all 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            balanceDisplay.style.color = '#fff';
            balanceDisplay.style.transform = 'scale(1.4)';
            balanceDisplay.style.textShadow = '0 0 20px #f1c40f, 0 0 40px #fff';

            setTimeout(() => {
                balanceDisplay.style.transition = 'all 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
                balanceDisplay.style.color = '#f1c40f';
                balanceDisplay.style.transform = 'scale(1)';
                balanceDisplay.style.textShadow = '0 0 10px rgba(241,196,15,0.5)';
            }, 150);
        }

        // Show floating text
        damageTexts.push({
            x: player.worldX + (Math.random() * 20 - 10),
            y: player.worldY - 20,
            text: data.message,
            color: '#f1c40f',
            life: 80,
            maxLife: 80,
            scale: 1,
            velY: -0.5
        });

        // Refetch packages to reset the buttons from "Processing..."
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'get_argem_packages' }));
        }

    } else if (data.type === 'buy_success') {
        // Actualizar billetera e inventario localmente
        player.coins = data.newCoins;
        player.inventory = data.newInventory;

        // Efectos visuales de Ã©xito
        shopModal.style.display = 'none';
        isShopOpen = false;

        spawnDamageText(player.worldX, player.worldY, "Â¡COMPRADO!", true); // Texto verde flotante

        // Actualizar el perfil y la UI
        const coinsDisplay = document.getElementById('profile-coins-display');
        if (coinsDisplay) coinsDisplay.innerText = player.coins;

        // Resetear el botÃ³n
        const rawData = weaponsDB[currentShopItemId] || window.MASTER_CATALOG[currentShopItemId];
        buyItemBtn.innerHTML = ` <span style="font-size: 18px;">ðŸª™</span> <span id="shop-item-price">${rawData.price}</span>`;
        buyItemBtn.style.background = "#2ecc71";
    }
    else if (data.type === 'buy_error') {
        // Resetear el botÃ³n y mostrar el error (ej: No tienes dinero)
        const rawData = weaponsDB[currentShopItemId] || window.MASTER_CATALOG[currentShopItemId];
        buyItemBtn.innerHTML = ` <span style="font-size: 18px;">ðŸª™</span> <span id="shop-item-price">${rawData.price}</span>`;
        buyItemBtn.style.background = "#2ecc71";

        // Usamos una alerta rÃ¡pida (o puedes cambiarlo por tu sistema de notificaciones en el futuro)
        alert("âŒ " + data.message);
    } else if (data.type === 'register_success') {
        authMessage.style.color = '#4cd137'; // Green
        authMessage.innerText = data.message;
    } else if (data.type === 'trigger_tutorial') {
        // If they haven't seen the tutorial, open it automatically!
        setTimeout(() => {
            if (tutorialModal) {
                currentTutorialStep = 0;
                renderTutorialStep();
                tutorialModal.style.display = 'flex';
            }
        }, 500); // PequeÃ±o retraso para que no sea sÃºper agresivo
    } else if (data.type === 'feedback_success') {
        // Restaurar botÃ³n
        if (submitFeedbackBtn) {
            submitFeedbackBtn.innerText = "Submit";
            submitFeedbackBtn.disabled = false;
        }
        if (feedbackModal) feedbackModal.style.display = 'none';
        if (feedbackInput) feedbackInput.value = '';

        // Mostrar el nuevo Modal de Ã‰xito en lugar de alert()
        if (feedbackSuccessMsg) feedbackSuccessMsg.innerText = data.message;
        if (feedbackSuccessModal) feedbackSuccessModal.style.display = 'flex';

        spawnDamageText(player.worldX, player.worldY, "Feedback Sent!", true);
    }// --- RECIBIR LISTA DE TODOS MIS SQUADS ---
    else if (data.type === 'my_squads_list_data') {
        squadsListContainer.innerHTML = "";

        data.squads.forEach(sq => {
            const row = document.createElement('div');
            row.style.background = "rgba(255,255,255,0.05)";
            row.style.border = sq.isLeader ? "1px solid #f1c40f" : "1px solid rgba(255,255,255,0.2)";
            row.style.borderRadius = "10px"; row.style.padding = "15px"; row.style.cursor = "pointer";
            row.style.display = "flex"; row.style.justifyContent = "space-between"; row.style.alignItems = "center";

            // Si tiene logo lo dibujamos, si no, ponemos la bandera
            const logoHtml = sq.logo
                ? `<img src="${sq.logo}" style="width: 45px; height: 45px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.3);">`
                : `<div style="width: 45px; height: 45px; background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%); border-radius: 10px; display: flex; justify-content: center; align-items: center; font-size: 20px;">🏴‍☠️</div>`;

            row.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 15px;">
                            ${logoHtml}
                            <div>
                                <div style="color: ${sq.isLeader ? '#f1c40f' : 'white'}; font-weight: bold; font-family: sans-serif; font-size: 16px;">
                                    ${sq.isLeader ? '👑 ' : ''}${escapeHTML(sq.name)}
                                </div>
                                <div style="color: #aaa; font-size: 12px; font-family: sans-serif; margin-top: 4px;">${sq.memberCount} Miembros</div>
                            </div>
                        </div>
                        <span style="color: #777; font-size: 20px;">➜</span>
                    `;

            row.onclick = () => {
                lastSquadMenu = 'list'; // <--- ✨ ¡NUEVO! Memorizamos que vinimos de Mis Squads
                ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq.id }));
            }; squadsListContainer.appendChild(row);
        });
        squadListModal.style.display = 'flex';
    } else if (data.type === 'squad_search_results') {
        renderSquadSearchResults(data.results);
    }
    // --- RECIBIR DETALLES DE UN SQUAD DE FORMA SILENCIOSA (Background) ---
    else if (data.type === 'my_squad_data_silent') {
        window.mySquadData = data.squad; // Solo guarda en RAM sin abrir la UI
    }
    // --- RECEIVE ADMIN VOICE CHAT ---
    else if (data.type === 'admin_voice_status') {
        if (data.playerId && otherPlayers[data.playerId]) {
            otherPlayers[data.playerId].isSpeaking = data.isSpeaking;
        }
        if (data.isSpeaking) {
            if (typeof resetVoiceMediaSource === 'function') resetVoiceMediaSource();
            // iOS Fallback: prepare for new message
            if (typeof iosVoiceFallbackActive !== 'undefined' && iosVoiceFallbackActive) {
                if (typeof voiceAccumulator !== 'undefined') voiceAccumulator = [];
            }
        } else {
            // iOS Fallback: Play accumulated message when admin stops speaking!
            // Añadimos un pequeño retraso de 300ms para asegurar que el ÚLTIMO fragmento llegue antes de reproducir.
            if (typeof iosVoiceFallbackActive !== 'undefined' && iosVoiceFallbackActive && typeof voiceAccumulator !== 'undefined') {
                setTimeout(() => {
                    if (voiceAccumulator.length > 0) {
                        try {
                            const blob = new Blob([voiceHeader, ...voiceAccumulator], { type: 'audio/webm' });
                            const url = URL.createObjectURL(blob);
                            if (typeof globalIosAudio !== 'undefined') {
                                globalIosAudio.src = url;
                                globalIosAudio.play().catch(e => console.warn("iOS Fallback Block:", e));
                            }
                        } catch (e) { }
                        voiceAccumulator = [];
                    }
                }, 400);
            }
        }
    }
    else if (data.type === 'admin_voice_chunk') {
        if (typeof handleAdminVoiceChunk === 'function') {
            handleAdminVoiceChunk(data.audio, data.adminX, data.adminY);
        }
    }
    // --- RECIBIR DETALLES DE UN SQUAD AL HACER CLIC ---
    else if (data.type === 'my_squad_data') {
        // 🔮 FIX: Ocultar todas las listas previas y Mostrar la pantalla de Detalles
        if (typeof squadListModal !== 'undefined') squadListModal.style.display = 'none';
        const searchModal = document.getElementById('squad-search-modal');
        if (searchModal) searchModal.style.display = 'none';
        const lbModal = document.getElementById('squad-leaderboard-modal');
        if (lbModal) lbModal.style.display = 'none';
        if (typeof mySquadModal !== 'undefined') mySquadModal.style.display = 'flex';

        const sq = data.squad;
        window.mySquadData = sq; // Save for tasks menu
        document.getElementById('my-squad-title').innerText = sq.name;
        document.getElementById('my-squad-member-count').innerText = `${sq.members.length + 1} / 25 Miembros`;

        // Poner el Logo en Grande
        const logoContainer = document.getElementById('my-squad-logo-container');
        if (sq.logo) {
            logoContainer.innerHTML = `<img src="${sq.logo}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            logoContainer.innerHTML = `🏴‍☠️`;
        }
        
        const isLeader = (sq.leader && (sq.leader.id === player.accountId || sq.leader.accountId === player.accountId || sq.leader.name === player.username));
        const isMember = isLeader || (sq.members && sq.members.some(m => (m.accountId && m.accountId === player.accountId) || (m.name && m.name === player.username)));

        // Mostrar botón de "Editar" SOLO si soy el líder
        const editBtn = document.getElementById('edit-squad-btn');
        if (isLeader) {
            editBtn.style.display = 'block';
            editBtn.onclick = () => {
                originalSquadName = sq.name;
                currentEditSquadId = sq.id;
                editSquadNameInput.value = sq.name;
                editSquadLogoInput.value = sq.logo || "";
                squadEditMsg.innerText = "";
                confirmEditSquad.innerText = "Guardar Logo (Gratis)";
                const previewName = document.getElementById('edit-squad-name-preview');
                if (previewName) previewName.innerText = sq.name;
                const previewLogo = document.getElementById('edit-squad-logo-preview');
                if (previewLogo) {
                    if (sq.logo) {
                        previewLogo.innerHTML = `<img src="${sq.logo}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='🏴‍☠️';">`;
                    } else {
                        previewLogo.innerHTML = "🏴‍☠️";
                    }
                }
                mySquadModal.style.display = 'none';
                squadEditModal.style.display = 'flex';
            };
        } else {
            editBtn.style.display = 'none';
        }

        // --- LÓGICA DE BOTONES DE ACCIÓN (EQUIPAR TAG Y ABANDONAR) ---
        const toggleTagBtn = document.getElementById('toggle-squad-tag-btn');
        const leaveBtn = document.getElementById('leave-squad-btn');

        if (isMember) {
            // 1. Botón de Equipar / Desequipar Tag
            if (toggleTagBtn) {
                toggleTagBtn.style.display = 'block';
                const isTagEquipped = (player.squad === sq.id);

                if (isTagEquipped) {
                    toggleTagBtn.innerText = "Tag Equipado";
                    toggleTagBtn.style.background = "rgba(46, 204, 113, 0.2)";
                    toggleTagBtn.style.color = "#2ecc71";
                    toggleTagBtn.style.border = "1px solid #2ecc71";
                } else {
                    toggleTagBtn.innerText = "Equipar este Tag";
                    toggleTagBtn.style.background = "rgba(255, 255, 255, 0.1)";
                    toggleTagBtn.style.color = "white";
                    toggleTagBtn.style.border = "1px solid rgba(255, 255, 255, 0.3)";
                }

                toggleTagBtn.onclick = () => {
                    toggleTagBtn.innerText = "Procesando...";
                    ws.send(MessagePack.encode({ type: 'toggle_squad_tag', squadId: sq.id }));
                };
            }

            // 2. Botón de Abandonar Clan (Solo para miembros que no sean el líder)
            if (leaveBtn) {
                if (isLeader) {
                    leaveBtn.style.display = 'none';
                } else {
                    leaveBtn.style.display = 'block';
                    leaveBtn.innerText = "Abandonar";
                    leaveBtn.onclick = () => {
                        if (confirm(`¿Estás seguro de que quieres abandonar el clan "${sq.name}"?`)) {
                            leaveBtn.innerText = "Saliendo...";
                            ws.send(MessagePack.encode({ type: 'leave_squad', squadId: sq.id }));
                        }
                    };
                }
            }
        } else {
            // Modo solo lectura / búsqueda: Ocultar botones de Equipar y Abandonar
            if (toggleTagBtn) toggleTagBtn.style.display = 'none';
            if (leaveBtn) leaveBtn.style.display = 'none';
        }

        // Dibujar miembros
        renderSquadGrid(sq);


    }// --- RECIBIR DATOS DEL LEADERBOARD ---
    else if (data.type === 'squad_leaderboard_data') {
        currentLeaderboardData = {
            squads: data.squads,
            liveBases: data.liveBases
        };
        renderLeaderboard(); // Dibuja la pestaÃ±a actualmente seleccionada
    }// --- RESPUESTA: TAG EQUIPADO / DESEQUIPADO ---
    else if (data.type === 'toggle_squad_success') {
        // Actualizar mi propia memoria RAM con todos los atributos y poderes del nuevo squad
        player.squad = data.isActive ? data.squadId : null;
        player.squadName = data.squadName || null;
        player.squadLogo = data.squadLogo || null;
        player.squadCanInvite = !!data.squadCanInvite;
        player.squadCanKick = !!data.squadCanKick;
        player.squadCanAssignRoles = !!data.squadCanAssignRoles;
        player.isLeader = !!data.isLeader;
        player.squadRole = data.squadRole || null;
        player.squadTitle = data.squadTitle || null;

        // Actualizar botón de chat de clan en la isla dinámica
        if (document.getElementById('island-squad-chat-btn')) {
            document.getElementById('island-squad-chat-btn').style.display = player.squad ? 'flex' : 'none';
        }
        if (typeof updateSquadChatButton === 'function') updateSquadChatButton();

        // Solo si el modal de clan estaba abierto, refrescar detalles
        const mySquadModal = document.getElementById('my-squad-modal');
        if (mySquadModal && mySquadModal.style.display === 'flex' && data.squadId) {
            ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
        }
    }
    else if (data.type === 'squad_leave_success') {
        if (typeof mySquadModal !== 'undefined') mySquadModal.style.display = 'none';
        if (typeof squadListModal !== 'undefined') {
            squadListModal.style.display = 'flex';
            ws.send(MessagePack.encode({ type: 'get_my_squads_list' }));
        } else if (typeof squadMainModal !== 'undefined') {
            squadMainModal.style.display = 'flex';
        }
        updateSquadChatButton();
    }
    else if (data.type === 'edit_squad_success') {
        if (data.newCoins !== undefined) {
            player.coins = data.newCoins;
            const coinsDisplay = document.getElementById('profile-coins-display');
            if (coinsDisplay) coinsDisplay.innerText = player.coins;
        }
        player.squadName = data.squadName;
        player.squadLogo = data.squadLogo;

        // ðŸ›‘ EL FIX: Sin alert(). El botÃ³n muta a verde por 1 segundo y cierra.
        const btnEdit = document.getElementById('confirm-edit-squad');
        if (btnEdit) {
            btnEdit.innerText = "Â¡Guardado con Ã‰xito!";
            btnEdit.style.background = "#2ecc71";
            setTimeout(() => {
                squadEditModal.style.display = 'none';
                btnEdit.style.background = "#f1c40f";
                btnEdit.innerText = "Guardar Cambios";
            }, 1200);
        }

        // Volvemos a pedir los detalles para que la imagen se actualice mÃ¡gicamente
        ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
    }
    else if (data.type === 'edit_squad_error') {
        document.getElementById('squad-edit-msg').innerText = data.message;
        document.getElementById('confirm-edit-squad').innerText = "Reintentar";
    }
    // --- NO TIENE SQUADS ---
    else if (data.type === 'no_squads_found') {
        alert("AÃºn no perteneces a ningÃºn Squad. Â¡Crea uno o busca uno al cual unirte!");
    }
    else if (data.type === 'no_squad') {
        alert("AÃºn no perteneces a ningÃºn Squad. Â¡Crea uno o busca uno al cual unirte!");
    }// --- Ã‰XITO DE CLAN (CREAR, ACEPTAR O INVITAR) ---
    else if (data.type === 'squad_success') {
        if (data.newCoins !== undefined) {
            player.coins = data.newCoins;
            const coinsDisplay = document.getElementById('profile-coins-display');
            if (coinsDisplay) coinsDisplay.innerText = player.coins;
        }

        if (data.squadName !== undefined) {
            player.squadName = data.squadName;
            player.squadLogo = data.squadLogo;
            player.squad = data.squadId;
        }

        // 1. ¿Viene del botón de invitar en el perfil?
        const inviteBtn = document.getElementById('invite-squad-btn');
        if (inviteBtn && (inviteBtn.dataset.inviting === 'true' || inviteBtn.disabled || (inviteBtn.innerText && inviteBtn.innerText.includes('Enviando')))) {
            inviteBtn.dataset.inviting = 'false';
            inviteBtn.innerText = "✓ Invitación Enviada";
            inviteBtn.style.background = "#2ecc71";
            inviteBtn.style.borderColor = "#27ae60";
            inviteBtn.style.color = "white";

            if (typeof spawnDamageText === 'function') {
                spawnDamageText(player.worldX, player.worldY, "¡Invitación enviada!", true);
            }

            setTimeout(() => {
                inviteBtn.innerText = "🏴‍☠️ Invitar al Clan";
                inviteBtn.style.fontSize = "15px";
                inviteBtn.style.background = "rgba(155, 89, 182, 0.2)";
                inviteBtn.style.borderColor = "#9b59b6";
                inviteBtn.style.color = "white";
                inviteBtn.disabled = false;
            }, 3000);
            return;
        }

        // 2. ¿Viene de fundar un clan nuevo? Mutamos el botón.
        const createBtn = document.getElementById('confirm-create-squad');
        if (createBtn && (createBtn.innerText.includes('Creando') || createBtn.disabled)) {
            createBtn.style.display = "none";

            const goBtn = document.getElementById('go-to-new-squad-btn');
            if (goBtn) {
                goBtn.style.display = "block";
                goBtn.onclick = () => {
                    document.getElementById('squad-create-modal').style.display = 'none';
                    createBtn.style.display = "block";
                    createBtn.innerText = "2000 Argons";
                    goBtn.style.display = "none";
                    lastSquadMenu = 'main';
                    ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: data.squadId }));
                };
            }
            return;
        }

        // 3. Fallback silencioso (Ej. Aceptaste un invite de la Isla Dinámica)
        if (typeof spawnDamageText === 'function') {
            spawnDamageText(player.worldX, player.worldY, "¡Clan Actualizado!", true);
        }
        updateSquadChatButton();
    }
    else if (data.type === 'player_profile_data') {
        if (typeof window.updateProfileModalWithData === 'function') {
            window.updateProfileModalWithData(data.profile, data.targetId);
        }
    }
    else if (data.type === 'squad_error') {
        // 1. Mensajes del creador de Squads
        const createMsg = document.getElementById('squad-create-msg');
        if (createMsg) {
            createMsg.style.color = "#ff6b6b";
            createMsg.innerText = data.message;
        }
        const confirmBtn = document.getElementById('confirm-create-squad');
        if (confirmBtn) confirmBtn.innerText = "2000 Argons";

        // 2. Botón de Invitación de Perfil (Inyectar el error en el botón)
        const inviteBtn = document.getElementById('invite-squad-btn');
        if (inviteBtn && (inviteBtn.dataset.inviting === 'true' || inviteBtn.disabled || (inviteBtn.innerText && inviteBtn.innerText.includes('Enviando')))) {
            inviteBtn.dataset.inviting = 'false';
            inviteBtn.innerText = "❌ " + (data.message || 'Error');
            inviteBtn.style.fontSize = "12px";
            inviteBtn.style.background = "#e74c3c";
            inviteBtn.style.borderColor = "#c0392b";
            inviteBtn.style.color = "white";

            setTimeout(() => {
                inviteBtn.innerText = "🏴‍☠️ Invitar al Clan";
                inviteBtn.style.fontSize = "15px";
                inviteBtn.style.background = "rgba(155, 89, 182, 0.2)";
                inviteBtn.style.borderColor = "#9b59b6";
                inviteBtn.style.color = "white";
                inviteBtn.disabled = false;
            }, 2500);
        }
    }
    else if (data.type === 'update_permissions') {
        player.squadCanInvite = !!data.canInvite;
        if (typeof data.canKick !== 'undefined') player.squadCanKick = !!data.canKick;
        if (typeof data.canAssignRoles !== 'undefined') player.squadCanAssignRoles = !!data.canAssignRoles;
        if (typeof data.title !== 'undefined') player.squadTitle = data.title;

        // Solo si el modal de squad YA estaba abierto por el usuario, refrescar silenciosamente
        const mySquadModal = document.getElementById('my-squad-modal');
        if (mySquadModal && mySquadModal.style.display === 'flex' && player.squad && typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: player.squad }));
        }
    }
    /// --- RECIBIR HISTORIAL DE PM ---
    else if (data.type === 'pm_history') {
        if (currentChatTargetId === data.targetAccountId) {
            pmTargetName.innerText = data.targetUsername;
            currentChatTargetName = data.targetUsername;

            // Extraemos la cabeza de forma segura
            currentChatTargetHead = (data.targetEquipped && data.targetEquipped.head) ? data.targetEquipped.head : 'head_default';

            // ðŸ‘‡ NUEVO: Dibujar el Avatar del encabezado (Header) con la cabeza correcta
            const pmHeaderAvatar = document.getElementById('pm-header-avatar');
            if (pmHeaderAvatar) {
                pmHeaderAvatar.innerHTML = "";
                pmHeaderAvatar.appendChild(createAvatarCanvas(36, data.targetAccountId, currentChatTargetHead));
            }

            renderPMHistory(data.history);
        }
    }// --- RECIBIR LISTA DE AMIGOS ---
    else if (data.type === 'friends_list_data') {
        renderFriendsList(data.friends);
    }
    // ðŸ‘‡ PEGA ESTO NUEVO AQUÃ ðŸ‘‡
    // --- RESPUESTA: AMIGO ELIMINADO ---
    else if (data.type === 'friend_removed') {
        if (player.friends) {
            // Lo borramos de la memoria RAM local
            player.friends = player.friends.filter(id => id !== data.targetId);
        }
        alert("Amigo eliminado de tu lista.");
        // Actualizamos la ventana grÃ¡fica pidiÃ©ndole la nueva lista al servidor
        ws.send(MessagePack.encode({ type: 'get_friends_list' }));
    }// --- RECIBIR RESULTADOS DE LA BÃšSQUEDA ---
    else if (data.type === 'search_players_results') {
        renderSearchResults(data.results);
    }
    // ðŸ‘† HASTA AQUÃ ðŸ‘†// --- RECIBIR LISTA DEL INBOX ---
    // ðŸ‘† HASTA AQUÃ  ðŸ‘†// --- RECIBIR LISTA DEL INBOX ---
    else if (data.type === 'inbox_data') {
        renderInbox(data.inbox);
    }
    // --- RECIBIR NUEVO PM (NOTIFICACIÃ“N) ---
    else if (data.type === 'receive_pm') {
        if (currentChatTargetId === data.senderAccountId && document.getElementById('pm-modal').style.display === 'flex') {
            renderPMHistory(data.history);
        } else {
            if (!unreadPMs.includes(data.senderAccountId)) {
                unreadPMs.push(data.senderAccountId);
            }
            const badge = document.getElementById('notif-badge');
            if (badge) {
                badge.style.display = 'flex';
                badge.innerText = unreadPMs.length;
            }
            const notifBtn = document.getElementById('island-notif-btn');
            if (notifBtn) {
                notifBtn.classList.remove('icon-pop-anim');
                void notifBtn.offsetWidth; // Trigger reflow
                notifBtn.classList.add('icon-pop-anim');
            }
            if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);
            if (typeof triggerIslandGlow === 'function') triggerIslandGlow('#3498db'); // Blue glow for PM
        }
    }// --- SQUAD CHAT (RADIO) ---
    else if (data.type === 'squad_chat_history') {
        const sqHistoryContainer = document.getElementById('squad-chat-history-container');
        sqHistoryContainer.innerHTML = "";
        if (data.history.length === 0) {
            sqHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px; font-style:italic;">Radio silenciosa.</div>';
        } else {
            data.history.forEach(msg => sqHistoryContainer.appendChild(buildSquadChatBubble(msg)));
            sqHistoryContainer.scrollTop = sqHistoryContainer.scrollHeight;
        }
    }
    // --- NUEVO: WEBRTC VOICE LOBBY ---
        else if (data.type === 'webrtc_signal') {
            console.log("NET_CLIENT WEBRTC SIGNAL:", data);
            if (window.handleWebRTCSignal) window.handleWebRTCSignal(data);
        }
        else if (data.type === 'join_voice_lobby' || data.type === 'leave_voice_lobby') {
            console.log("NET_CLIENT VOICE LOBBY EVENT:", data);
            if (window.handleVoiceLobbyUpdate) window.handleVoiceLobbyUpdate(data);
        }
      else if (data.type === 'new_squad_chat') {
        const sqHistoryContainer = document.getElementById('squad-chat-history-container');
        const sqChatModal = document.getElementById('squad-chat-modal');
        const sqBadge = document.getElementById('squad-notif-badge');

        // 1. Detectar la prioridad de la menciÃ³n
        const textLower = data.message.text.toLowerCase();
        let incomingMention = 'none';

        if (textLower.includes(`@${player.username.toLowerCase()}`)) incomingMention = 'personal';
        else if (textLower.includes('@important')) incomingMention = 'important';
        else if (textLower.includes('@everyone')) incomingMention = 'everyone';

        // Si la ventana estÃ¡ abierta, lo aÃ±adimos a la plÃ¡tica
        if (sqChatModal.style.display === 'flex') {
            if (sqHistoryContainer.innerHTML.includes("Radio silenciosa")) sqHistoryContainer.innerHTML = "";
            sqHistoryContainer.appendChild(buildSquadChatBubble(data.message));
            sqHistoryContainer.scrollTop = sqHistoryContainer.scrollHeight;
        }
        // Si la ventana estÃ¡ cerrada, gestionamos el Badge DinÃ¡mico
        else {
            unreadSquadMessages++;

            // Solo actualiza el color si viene una menciÃ³n (o si ya habÃ­a una, la sobreescribe)
            if (incomingMention !== 'none') {
                squadMentionType = incomingMention;
            }

            if (sqBadge) {
                sqBadge.style.display = 'flex';

                // Mutar color y texto segÃºn la Ãºltima menciÃ³n recibida
                if (squadMentionType === 'personal') {
                    sqBadge.innerText = `@${unreadSquadMessages}`;
                    sqBadge.style.background = "#f1c40f"; // Amarillo brillante
                    sqBadge.style.color = "black";
                }
                else if (squadMentionType === 'important') {
                    sqBadge.innerText = `!${unreadSquadMessages}`;
                    sqBadge.style.background = "#e67e22"; // Naranja de alerta
                    sqBadge.style.color = "white";
                }
                else if (squadMentionType === 'everyone') {
                    sqBadge.innerText = `*${unreadSquadMessages}`;
                    sqBadge.style.background = "#9b59b6"; // Morado global
                    sqBadge.style.color = "white";
                }
                else {
                    sqBadge.innerText = unreadSquadMessages;
                    sqBadge.style.background = "#e74c3c"; // Rojo normal sin menciÃ³n
                    sqBadge.style.color = "white";
                }
            }
            if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);
        }
    }
    else if (data.type === 'init') {
        // ðŸš¨ ACTUALIZA EL BOTÃ“N TAN PRONTO COMO ENTRA EL JUGADOR
        updateSquadChatButton();
        if(authOverlay) authOverlay.style.pointerEvents = 'none';
        // ðŸ’¿ GUARDAR LA PLAYLIST
        bgmPlaylist = data.playlist || [];
        if(authOverlay) authOverlay.style.opacity = '0';
        window.PATCH_NOTES = data.patchNotes || []; // Guarda las noticias en la memoria local
        // ðŸ‘‡ NUEVO: GUARDAR DICCIONARIO Y CONSTRUIR LA UI ðŸ‘‡
        window.ZONE_CONFIG = data.zoneConfig || {};
        buildZoneUI();
        window.RANKS = data.ranksDB || [];
        // --- NUEVO: CONTADOR DE CARGA Y DESCARGA DEL CATÃLOGO MÃGICO ---
        window.MASTER_CATALOG = data.masterCatalog || {};
        window.loadedItemSprites = window.loadedItemSprites || {};

        // ðŸŒŸ ASIGNAR TAREAS Y LOGROS GLOBALES ðŸŒŸ
        globalTasks = data.globalTasks || {};
        if (!player || !player.accountId) {
            myTaskProgress = data.taskProgress || {};
            myClaimedTasks = data.claimedTasks || {};
        }
        console.log(`[DEBUG] Updated myClaimedTasks from ${data.type}:`, myClaimedTasks);
        if (typeof checkTaskBadge === 'function') checkTaskBadge();

        CLIENT_TRASH_CATALOG = data.trashCatalog || [];
        CLIENT_METALS_CATALOG = Object.values(data.masterCatalog || {})
            .filter(i => i.category === 'metal')
            .map(m => ({ ...m, value: m.price || 0 })); // ✍️ EL FIX: Clonamos el objeto y le creamos la variable 'value' copiando su 'price'
        
        // 🛡️ ESCUDO ANTI-CRASH: Si llega vacío, lee un objeto en blanco en lugar de crashear
        let weaponCount = Object.values(data.weaponsDB || {}).filter(w => w && w.src).length;
        let catalogCount = Object.values(window.MASTER_CATALOG || {}).filter(i => i && i.src).length;
        let tilesetCount = (data.tilesetsDB || []).filter(ts => ts && ts.src).length;

        totalAssetsToLoad = weaponCount + tilesetCount + catalogCount;
        assetsLoaded = 0;

        // 🛡️ 🚨 EL FIX: Descargar tooooooda la ropa e ítems del Catálogo Maestro
        for (let itemId in window.MASTER_CATALOG) {
            const item = window.MASTER_CATALOG[itemId];
            if (item && item.src) {
                const img = new Image();
                img.onload = () => {
                    assetsLoaded++;
                    updateLoadingBar();
                };
                img.onerror = () => {
                    assetsLoaded++;
                    updateLoadingBar();
                };
                img.src = item.src;
                window.loadedItemSprites[itemId] = img;
            }
        }
        updateLoadingBar("Descargando mapas y armas...");

        // GUARDAR DB DE ARMAS Y PRECARGAR SUS SONIDOS A LA RAM
        WEAPONS = data.weaponsDB;
        window.WEAPONS = WEAPONS;
        weaponsDB = data.weaponsDB;
        window.weaponsDB = weaponsDB;
        window.loadedWeaponSprites = loadedWeaponSprites;
        window.loadedItemSprites = window.loadedItemSprites || {};

        for (let wId in WEAPONS) {
            // Cargar imagen
            if (WEAPONS[wId].src) {
                const img = new Image();
                img.onload = () => {
                    assetsLoaded++;
                    updateLoadingBar();
                    renderHudHotbar();
                    if (typeof renderInventory === 'function' && document.getElementById('inventory-modal') && document.getElementById('inventory-modal').style.display === 'flex') {
                        renderInventory();
                    }
                };
                img.onerror = () => {
                    assetsLoaded++;
                    updateLoadingBar();
                };
                img.src = WEAPONS[wId].src;
                loadedWeaponSprites[wId] = img;
            }
            // 🔊 EL FIX: Pre-cargar los sonidos de disparo a la RAM del celular
            if (WEAPONS[wId].audio) {
                if (WEAPONS[wId].audio.use) preloadSound(WEAPONS[wId].audio.use);
                if (WEAPONS[wId].audio.reload) preloadSound(WEAPONS[wId].audio.reload);
            }
        }

        // GUARDAR DB DE TILESETS Y DESCARGAR IMÁGENES
        TILESET_CONFIG = data.tilesetsDB;
        TILESET_CONFIG.forEach(ts => {
            const img = new Image();
            img.onload = () => {
                assetsLoaded++;
                updateLoadingBar();
                if (assetsLoaded >= totalAssetsToLoad) {
                    floorChunks.clear();
                    overheadChunks.clear();
                    dirtyChunks.clear();
                }
            };
            img.onerror = () => {
                assetsLoaded++;
                updateLoadingBar();
                if (assetsLoaded >= totalAssetsToLoad) {
                    floorChunks.clear();
                    overheadChunks.clear();
                    dirtyChunks.clear();
                }
            };
            img.src = ts.src;
            loadedTilesets[ts.id] = img;
        });

        // Watchdog de seguridad: Si alguna imagen se queda colgada, forzamos la finalización de carga a los 3.5s
        setTimeout(() => {
            if (assetsLoaded < totalAssetsToLoad) {
                console.warn("[Loading Watchdog] Forzando entrada al juego por timeout de assets.");
                assetsLoaded = totalAssetsToLoad;
                updateLoadingBar("¡Listo!");
            }
        }, 3500);

        // ðŸ‘‡ AÃ‘ADE ESTA LÃ NEA AQUÃ  ðŸ‘‡
        weaponsDB = data.weaponsDB;

        // (Esto ya lo tenÃ­as)
        if (data.skeleton) {
            SKELETON_DATA.anchors = data.skeleton;
        }

        // Escudo por si no hay nada que descargar
        if (totalAssetsToLoad === 0) {
            assetsLoaded = 1; totalAssetsToLoad = 1; updateLoadingBar("Â¡Listo!");
        }

        myId = data.id;
        player.worldX = data.players[myId].worldX;
        player.worldY = data.players[myId].worldY;
        player.username = data.players[myId].username;
        player.accountId = data.players[myId].accountId;
        player.coins = data.players[myId].coins || 0; // <--- Â¡AÃ‘ADE ESTA LÃNEA!
        player.gems = data.players[myId].gems || 0;
        player.squadName = data.players[myId].squadName;
        player.squadLogo = data.players[myId].squadLogo;
        player.squad = data.players[myId].squad;
        player.elo = data.players[myId].elo || 1000;
        // ðŸ‘‡ AÃ‘ADE ESTA LÃNEA AQUÃ ðŸ‘‡
        player.quickSwaps = data.players[myId].quickSwaps || [];

        // ðŸ›‘ EL FIX: Asegurarnos de que el cliente guarda toda la info de la zona, incluyendo su Tipo
        safeZones = data.safeZones || [];

        // ðŸ‘‡ NUEVO: SINCRONIZAR SALUD AL APARECER ðŸ‘‡
        player.hp = data.players[myId].hp !== undefined ? data.players[myId].hp : 100;
        player.isDead = data.players[myId].isDead || false;

        // ðŸ›‘ EL FIX: LEER KILLS Y LOSSES AL RECARGAR LA PÃGINA ðŸ›‘
        player.kills = data.players[myId].kills || 0;
        player.losses = data.players[myId].losses || 0;
        if (data.turfBases && typeof data.turfBases === 'object') {
            turfBases = Object.assign({}, data.turfBases);
            window.turfBases = turfBases;
        } else if (data.centralBase) {
            turfBases = {};
            if (data.centralBase.turfId) turfBases[data.centralBase.turfId] = data.centralBase;
            window.turfBases = turfBases;
        }
        centralBase = data.centralBase || Object.values(turfBases || {})[0] || null;
        window.centralBase = centralBase;
        // ðŸ›‘ EL FIX: Cargar la basura que ya estaba tirada cuando entraste
        groundItems = data.groundItems || {};
        // ðŸ›‘ EL FIX: Guardamos el catÃ¡logo dinÃ¡mico
        CLIENT_TRASH_CATALOG = data.trashCatalog || [];

        // Actualizar la Isla DinÃ¡mica visualmente
        const islandFill = document.getElementById('island-hp-fill');
        const islandText = document.getElementById('island-hp-text');
        if (islandText && islandFill) {
            islandText.innerText = `${player.hp} / 100`;
            islandFill.style.width = `${player.hp}%`;
            if (player.hp > 50) islandFill.style.backgroundColor = '#2ecc71';
            else if (player.hp > 25) islandFill.style.backgroundColor = '#f1c40f';
            else islandFill.style.backgroundColor = '#e74c3c';
        }
        for (let id in data.players) {
            if (id !== myId) {
                otherPlayers[id] = data.players[id];
                otherPlayers[id].targetX = data.players[id].worldX || 0;
                otherPlayers[id].targetY = data.players[id].worldY || 0;
            }
        }
        // ðŸ”„ NEW: Store tiles as objects with layer and collision data!
        if (data.worldMap) {
            data.worldMap.forEach(t => {
                const l = t.l || 0;
                worldMap.set(getMapKey(t.x, t.y, l), {
                    tileId: t.tileId, l: l, hasCollision: t.hasCollision || false, isSit: t.isSit || false,
                    triggerType: t.triggerType, destX: t.destX, destY: t.destY,
                    itemId: t.itemId,
                    rotation: t.rotation || 0,
                    requiresClick: t.requiresClick || false,
                    npcMessage: t.npcMessage || "",
                    itemRow: t.itemRow || 0,
                    shelfX: t.shelfX || 0,
                    shelfY: t.shelfY || 0,
                });
            });
            // ðŸ“¸ EL FIX: Â¡El mapa ya llegÃ³, toma una foto nueva!
            floorDirty = true;
        }
    } else if (data.type === 'spawn_hole') {
        digHoles.push({
            x: data.x,
            y: data.y,
            life: 200, // DurarÃ¡ unos segundos en pantalla
            maxLife: 200
        });
    }// ðŸ—£ï¸  NUEVO: ESCUCHAR MENSAJES DEL SISTEMA (SERVER ALERTAS)
    else if (data.type === 'unjail') {
        const m = document.getElementById('jail-alert-modal');
        if (m) m.style.display = 'none';
    }
    else if (data.type === 'system_message') {
        if (data.isJailAlert) {
            const m = document.getElementById('jail-alert-modal');
            const t = document.getElementById('jail-alert-text');
            if (m && t) {
                t.innerText = data.text;
                m.style.display = 'flex';
                const lo = document.getElementById('login-overlay');
                if (lo) {
                    lo.style.opacity = '0';
                    setTimeout(() => lo.style.display = 'none', 800);
                }
                const closeBtn = document.getElementById('close-jail-alert-btn');
                if (closeBtn) closeBtn.onclick = () => m.style.display = 'none';
            }
        } else if (data.isAlert) alert("System: " + data.text);
        // Inyectamos el texto directamente en el sistema de daÃ±o flotante
        let dt = {
            x: player.worldX + (Math.random() * 20 - 10),
            y: player.worldY - 20,
            text: data.text,
            color: data.color || "#3498db", // Usa el color que manda el server
            life: 80,
            maxLife: 80
        };
        damageTexts.push(dt);
    }// (Pon esto junto a tus otros else if, por ejemplo debajo de 'shoot' o 'hp_update')
    else if (data.type === 'global_announcement') {
        window.serverAnnouncementsQueue = window.serverAnnouncementsQueue || [];
        window.serverAnnouncementsQueue.push(data.message);

        const announceBtn = document.getElementById('island-announce-btn');
        const announceBadge = document.getElementById('announce-badge');

        if (announceBtn) {
            announceBtn.style.display = 'flex';
            // Trigger animation
            announceBtn.classList.remove('icon-pop-anim');
            void announceBtn.offsetWidth; // Trigger reflow
            announceBtn.classList.add('icon-pop-anim');

            if (announceBadge) {
                announceBadge.style.display = 'flex';
                announceBadge.innerText = window.serverAnnouncementsQueue.length;
            }
        }

        // Wake up the island to make sure it's visible
        if (typeof wakeUpIsland === 'function') {
            wakeUpIsland(5000);
        }
        if (typeof triggerIslandGlow === 'function') {
            triggerIslandGlow('#f1c40f'); // Gold glow for server announcements
        }
    }
    else if (data.type === 'spawn_item') {
        groundItems[data.id] = data.item;
    }
    else if (data.type === 'remove_item') {
        delete groundItems[data.id];
    } else if (data.type === 'sell_success') {
        player.inventory = data.newInventory;
        if (data.newCoins !== undefined) player.coins = data.newCoins;

        // 1. Cierra el Yonke (si estaba abierto)
        const junkyard = document.getElementById('junkyard-modal');
        if (junkyard) junkyard.style.display = 'none';
        isJunkyardOpen = false;
        lastJunkyardTile = null;

        //  2. EL FIX: Cierra tambiÃ©n la JoyerÃ­a (si estaba abierta)
        const jeweler = document.getElementById('jeweler-modal');
        if (jeweler) jeweler.style.display = 'none';
        if (typeof isJewelerOpen !== 'undefined') isJewelerOpen = false;
        if (typeof lastJewelerTile !== 'undefined') lastJewelerTile = null;

        // 3. Actualizamos las monedas en el perfil (por si acaso)
        const coinsDisplay = document.getElementById('profile-coins-display');
        if (coinsDisplay) coinsDisplay.innerText = player.coins;

        // 4. Texto flotante de ganancia
        let dt = { x: player.worldX, y: player.worldY, text: `+${data.earned} ðŸª™`, color: "#f1c40f", life: 100, maxLife: 100 };
        damageTexts.push(dt);
    } else if (data.type === 'inventory_update') {
        // ðŸ›‘ EL FIX: Tu juego guarda en su memoria local lo que envÃ­e el servidor
        if (player) {
            player.inventory = data.inventory;
        }
    }// Recibir daÃ±o a la base en vivo
    else if (data.type === 'base_update') {
        if (data.turfBases && typeof data.turfBases === 'object') {
            turfBases = Object.assign({}, data.turfBases);
            window.turfBases = turfBases;
        }
        if (data.base) {
            if (!turfBases || typeof turfBases !== 'object') turfBases = {};
            turfBases[data.base.turfId] = data.base;
            window.turfBases = turfBases;
            centralBase = data.base;
            window.centralBase = data.base;
        }
    }
    else if (data.type === 'squad_time_update') {
        if (window.mySquadData && window.mySquadData.name === data.squadName) {
            window.mySquadData.territoryTimeMinutes = data.territoryTimeMinutes;
            window.mySquadData.dailyTimeMinutes = data.dailyTimeMinutes;
            window.mySquadData.weeklyTimeMinutes = data.weeklyTimeMinutes;
        }
    }
    else if (data.type === 'squad_reset_event') {
        if (window.mySquadData) {
            if (data.dailyReset) window.mySquadData.dailyTimeMinutes = 0;
            if (data.weeklyReset) window.mySquadData.weeklyTimeMinutes = 0;
        }
        if (typeof window.refreshLeaderboardIfOpen === 'function') {
            window.refreshLeaderboardIfOpen();
        }
    }
    else if (data.type === 'base_delete') {
        if (data.turfId && turfBases) {
            delete turfBases[data.turfId];
        }
        if (data.turfBases && typeof data.turfBases === 'object') {
            turfBases = Object.assign({}, data.turfBases);
        }
        window.turfBases = turfBases;
        centralBase = Object.values(turfBases || {})[0] || null;
        window.centralBase = centralBase;
    } else if (data.type === 'new_safezone') {
        // ðŸ‘‡ NUEVO: AGREGAR ZONA NUEVA EN TIEMPO REAL ðŸ‘‡
        safeZones.push(data.zone);
    }// ðŸ‘‡ AÃ‘ADE ESTO ðŸ‘‡
    else if (data.type === 'safezone_deleted') {
        // Filtramos la lista para quitar la que el servidor nos ordenÃ³ borrar
        safeZones = safeZones.filter(z => z._id !== data.id);
    }// Recibir info del letrero
    else if (data.type === 'arena_info_update') {
        if (document.getElementById('arena-modal').style.display !== 'none' && window.currentViewingArenaId === data.arenaId) {

            document.getElementById('arena-modal-title').innerText = `ðŸ¥Š ${data.name}`;

            const fightersEl = document.getElementById('arena-current-fighters');
            if (data.fighter1 && data.fighter2) {
                fightersEl.innerHTML = `<span style="color:#3498db">${data.fighter1}</span> <span style="color:white; font-size:12px;">vs</span> <span style="color:#e74c3c">${data.fighter2}</span>`;
            } else {
                fightersEl.innerHTML = "El Ring estÃ¡ VacÃ­o";
            }

            const queueEl = document.getElementById('arena-queue-list');
            if (data.queue.length === 0) {
                queueEl.innerHTML = "<div style='text-align:center; color:#777; margin-top: 10px;'>No hay nadie en fila.</div>";
            } else {
                queueEl.innerHTML = data.queue.map((name, index) =>
                    `<div style="padding: 5px; border-bottom: 1px solid rgba(255,255,255,0.05);"><b>#${index + 1}</b> - ${name}</div>`
                ).join('');
            }

            const joinBtn = document.getElementById('arena-join-btn');
            if (data.inQueue) {
                joinBtn.innerText = "Salir de la Fila";
                joinBtn.style.background = "#7f8c8d";
                joinBtn.style.boxShadow = "0 4px 0 #34495e";
                joinBtn.onclick = () => ws.send(MessagePack.encode({ type: 'leave_arena_queue', arenaId: data.arenaId }));
            } else {
                joinBtn.innerText = "Entrar a la Fila";
                joinBtn.style.background = "#e74c3c";
                joinBtn.style.boxShadow = "0 4px 0 #c0392b";
                joinBtn.onclick = () => {
                    ws.send(MessagePack.encode({ type: 'join_arena_queue', arenaId: data.arenaId }));
                };
            }
        }
    }

    // Si el servidor avisa que alguien entrÃ³ a la fila mientras tÃº estabas viendo el letrero
    else if (data.type === 'refresh_arena_ui') {
        if (document.getElementById('arena-modal').style.display !== 'none' && window.currentViewingArenaId === data.arenaId) {
            ws.send(MessagePack.encode({ type: 'get_arena_info', arenaId: data.arenaId }));
        }
    }

    // El teletransporte cinemÃ¡tico a la arena
    else if (data.type === 'match_found') {
        document.getElementById('arena-modal').style.display = 'none';

        player.isTeleporting = true;
        const fade = document.getElementById('fade-overlay');
        fade.style.background = 'white'; // Flashazo blanco de pelea
        fade.style.opacity = '1';

        setTimeout(() => {
            player.worldX = data.targetX;
            player.worldY = data.targetY;
            lastNetworkString = "";
            setTimeout(() => {
                fade.style.opacity = '0';
                fade.style.background = 'black';
                player.isTeleporting = false;
                spawnDamageText(player.worldX, player.worldY, "Â¡FIGHT!", true);
            }, 200);
        }, 250);
    }
    // ðŸ‘‡ AÃ‘ADE ESTE BLOQUE COMPLETO ðŸ‘‡
    else if (data.type === 'match_finished') {
        if (data.newElo !== undefined) player.elo = data.newElo;

        // ðŸ”§ FIX: Limpiar el arenaId para que el modal pueda reabrir despuÃ©s del match
        window.currentViewingArenaId = null;

        // Al terminar la pelea, volver a donde estabas
        player.isTeleporting = true;
        const fade = document.getElementById('fade-overlay');
        fade.style.background = 'black';
        fade.style.opacity = '1';

        setTimeout(() => {
            player.worldX = data.returnX;
            player.worldY = data.returnY;
            lastNetworkString = "";
            setTimeout(() => {
                fade.style.opacity = '0';
                player.isTeleporting = false;

                // Mostrar un letreo Ã©pico flotante sobre tu personaje
                spawnDamageText(player.worldX, player.worldY, data.result, true);
            }, 200);
        }, 250);
    }
    else if (data.type === 'tile_update') {
        const key = getMapKey(data.x, data.y, data.l);
        if (data.tileId === -1) {
            worldMap.delete(key);
        } else {
            const existing = worldMap.get(key) || { hasCollision: false, isSit: false };
            worldMap.set(key, {
                tileId: data.tileId,
                l: data.l,
                hasCollision: data.hasCollision !== undefined ? data.hasCollision : existing.hasCollision,
                isSit: data.isSit !== undefined ? data.isSit : existing.isSit,
                rotation: data.rotation !== undefined ? data.rotation : (existing.rotation || 0),
                shelfX: data.shelfX !== undefined ? data.shelfX : (existing.shelfX || 0),
                shelfY: data.shelfY !== undefined ? data.shelfY : (existing.shelfY || 0),
                triggerType: data.triggerType !== undefined ? data.triggerType : existing.triggerType,
                destX: data.destX !== undefined ? data.destX : existing.destX,
                destY: data.destY !== undefined ? data.destY : existing.destY,
                itemId: data.itemId !== undefined ? data.itemId : existing.itemId,
                requiresClick: data.requiresClick !== undefined ? data.requiresClick : existing.requiresClick,
                npcMessage: data.npcMessage !== undefined ? data.npcMessage : existing.npcMessage,
                itemRow: data.itemRow !== undefined ? data.itemRow : existing.itemRow
            });
        }
        markChunkDirty(data.x, data.y);
        minimapDirty = true;
        floorDirty = true;
    }
    else if (data.type === 'tile_update_bulk') {
        data.tiles.forEach(t => {
            const key = getMapKey(t.x, t.y, t.l);
            if (t.tileId === -1) {
                worldMap.delete(key);
            } else {
                const existing = worldMap.get(key) || { hasCollision: false, isSit: false };
                worldMap.set(key, {
                    tileId: t.tileId,
                    l: t.l,
                    hasCollision: t.hasCollision !== undefined ? t.hasCollision : existing.hasCollision,
                    isSit: t.isSit !== undefined ? t.isSit : existing.isSit,
                    rotation: t.rotation !== undefined ? t.rotation : (existing.rotation || 0),
                    shelfX: t.shelfX !== undefined ? t.shelfX : (existing.shelfX || 0),
                    shelfY: t.shelfY !== undefined ? t.shelfY : (existing.shelfY || 0),
                    triggerType: t.triggerType !== undefined ? t.triggerType : existing.triggerType,
                    destX: t.destX !== undefined ? t.destX : existing.destX,
                    destY: t.destY !== undefined ? t.destY : existing.destY,
                    itemId: t.itemId !== undefined ? t.itemId : existing.itemId,
                    requiresClick: t.requiresClick !== undefined ? t.requiresClick : existing.requiresClick,
                    npcMessage: t.npcMessage !== undefined ? t.npcMessage : existing.npcMessage,
                    itemRow: t.itemRow !== undefined ? t.itemRow : existing.itemRow
                });
            }
            markChunkDirty(t.x, t.y);
        });
        minimapDirty = true;
        floorDirty = true;
    }
    else if (data.type === 'tile_meta_update') {
        const key = getMapKey(data.x, data.y, data.layer);
        let tile = worldMap.get(key);
        if (tile) {
            tile.layer = data.layer;
            tile.hasCollision = !!data.hasCollision;
            tile.isSit = !!data.isSit;
            if (data.triggerType !== undefined) tile.triggerType = data.triggerType;
            if (data.destX !== undefined) tile.destX = data.destX;
            if (data.destY !== undefined) tile.destY = data.destY;
            if (data.itemId !== undefined) tile.itemId = data.itemId;
            if (data.requiresClick !== undefined) tile.requiresClick = data.requiresClick;
            if (data.npcMessage !== undefined) tile.npcMessage = data.npcMessage;
            if (data.itemRow !== undefined) tile.itemRow = data.itemRow;
            if (data.shelfX !== undefined) tile.shelfX = data.shelfX;
            if (data.shelfY !== undefined) tile.shelfY = data.shelfY;
            worldMap.set(key, tile);
        }
        markChunkDirty(data.x, data.y);
        minimapDirty = true;
        floorDirty = true;
    }
    else if (data.type === 'shoot') {
        if (data.id === myId) return; // Ya spawneó localmente

        let spawnX = data.x;
        let spawnY = data.y;
        const wStats = (window.weaponsDB && window.weaponsDB[data.weaponId]) || (window.WEAPONS && window.WEAPONS[data.weaponId]) || null;

        if (otherPlayers[data.id]) {
            otherPlayers[data.id].lastShotTime = Date.now();
            const enemy = otherPlayers[data.id];

            // FIX VISUAL: Forzar al enemigo a mirar hacia donde disparó instantáneamente
            let deg = data.angle * (180 / Math.PI);
            if (deg > 45 && deg <= 135) enemy.frameY = 0;
            else if (deg > 135 || deg <= -135) enemy.frameY = 1;
            else if (deg > -45 && deg <= 45) enemy.frameY = 2;
            else if (deg > -135 && deg <= -45) enemy.frameY = 3;

            if (wStats) {
                const dir = enemy.frameY || 0;
                const d = wStats.dirStats ? (wStats.dirStats[dir] || {}) : {};
                spawnX = enemy.worldX + (d.hitX !== undefined ? d.hitX : (dir === 2 ? 16 : dir === 1 ? -16 : 0));
                spawnY = enemy.worldY + (d.hitY !== undefined ? d.hitY : (dir === 0 ? 16 : dir === 3 ? -16 : 0));
            }
        }

        // ⚡ LAG COMPENSATION: avanzar la bala los ms que tardó en llegar
        const bulletLag = data.t ? Math.min(Date.now() - data.t, 150) : 0;
        spawnProjectile(spawnX, spawnY, data.angle, data.id, data.weaponId, bulletLag);
        if (typeof triggerMuzzleFlash === 'function') {
            triggerMuzzleFlash(spawnX, spawnY, data.angle, wStats && wStats.color ? wStats.color : "#f1c40f");
        }

        // 🔊 Play the sound!
        playItemSound(data.weaponId, 'use', 0.3);
    }
    // 💥 NUEVO: RECIBIR ESCOPETAZO (ARRAY DE BALAS)
    else if (data.type === 'shoot_shotgun') {
        if (data.id === myId) return; // Ya spawneó localmente

        let spawnX = data.x;
        let spawnY = data.y;
        const wStats = (window.weaponsDB && window.weaponsDB[data.weaponId]) || (window.WEAPONS && window.WEAPONS[data.weaponId]) || null;

        if (otherPlayers[data.id]) {
            otherPlayers[data.id].lastShotTime = Date.now(); // Levanta el arma del enemigo
            const enemy = otherPlayers[data.id];

            if (data.angles && data.angles.length > 0) {
                const midAngle = data.angles[Math.floor(data.angles.length / 2)];
                let deg = midAngle * (180 / Math.PI);
                if (deg > 45 && deg <= 135) enemy.frameY = 0;
                else if (deg > 135 || deg <= -135) enemy.frameY = 1;
                else if (deg > -45 && deg <= 45) enemy.frameY = 2;
                else if (deg > -135 && deg <= -45) enemy.frameY = 3;
            }

            if (wStats) {
                const dir = enemy.frameY || 0;
                const d = wStats.dirStats ? (wStats.dirStats[dir] || {}) : {};
                spawnX = enemy.worldX + (d.hitX !== undefined ? d.hitX : (dir === 2 ? 16 : dir === 1 ? -16 : 0));
                spawnY = enemy.worldY + (d.hitY !== undefined ? d.hitY : (dir === 0 ? 16 : dir === 3 ? -16 : 0));
            }
        }

        // ⚡ LAG COMPENSATION: avanzar cada pellet los ms de lag
        const shotgunLag = data.t ? Math.min(Date.now() - data.t, 150) : 0;
        const avgAngle = (data.angles && data.angles.length > 0) ? data.angles[Math.floor(data.angles.length / 2)] : 0;

        data.angles.forEach(ang => {
            spawnProjectile(spawnX, spawnY, ang, data.id, data.weaponId, shotgunLag);
        });

        // ðŸ”Š THE FIX: Trigger the sound!
        const isMe = (data.id === myId);
        playItemSound(data.weaponId, 'use', isMe ? 0.8 : 0.3);
    }// --- VER QUE OTROS DAN ESPADAZOS ---
    else if (data.type === 'player_swing') {
        if (otherPlayers[data.id]) {
            otherPlayers[data.id].isSwinging = true;
            otherPlayers[data.id].swingStartTime = Date.now();
        }

        // ðŸ”Š THE FIX: Escuchar los espadazos de otros jugadores
        playItemSound(data.weaponId, 'use', 0.3);
    }

    // =======================================================================
    // ðŸ’¥ RECEPCIÃ“N MAESTRA DE VIDA, DAÃ‘O, INTERFAZ, KILLS Y LOSSES ðŸ’¥
    // =======================================================================
    else if (data.type === 'hp_update') {

        // --- 1. SI YO RECIBÃ EL DAÃ‘O O LA CURACIÃ“N ---
        if (data.targetId === myId) {
            player.hp = data.newHp;
            player.health = data.newHp; // ðŸ›‘ EL FIX: Sincroniza la barra de vida sobre tu cabeza
            player.isDead = data.isDead;
            player.lastHpUpdateTime = Date.now();
            // ðŸ›¡ï¸ Respawn shield: store when it expires so we can draw it
            if (data.shieldUntil) player.shieldUntil = data.shieldUntil;

            if (data.damageDealt > 0) {
                player.lastHitTime = Date.now();
                spawnDamageText(player.worldX, player.worldY, data.damageDealt, false);

                // Efecto de Pantalla Roja (Sangre)
                const overlay = document.getElementById('damage-overlay');
                if (overlay) {
                    overlay.style.opacity = '1';
                    setTimeout(() => { overlay.style.opacity = '0'; }, 150);
                }
                if (typeof wakeUpIsland === 'function') wakeUpIsland(3000);

            } else if (data.damageDealt < 0) {
                // CuraciÃ³n (Texto Verde)
                spawnDamageText(player.worldX, player.worldY, data.damageDealt, true);
                if (typeof wakeUpIsland === 'function') wakeUpIsland(2000);
            }

            // Actualizar la "Isla DinÃ¡mica" (UI)
            const islandFill = document.getElementById('island-hp-fill');
            const islandText = document.getElementById('island-hp-text');
            if (islandText) islandText.innerText = `${player.hp} / 100`;

            if (islandFill) {
                islandFill.style.width = `${player.hp}%`;
                if (player.hp > 50) islandFill.style.backgroundColor = '#2ecc71'; // Verde
                else if (player.hp > 25) islandFill.style.backgroundColor = '#f1c40f'; // Amarillo
                else islandFill.style.backgroundColor = '#e74c3c'; // Rojo
            }
        }

        // --- 2. SI OTRO JUGADOR RECIBIÃ“ EL DAÃ‘O O LA CURACIÃ“N ---
        else if (otherPlayers[data.targetId]) {
            let enemy = otherPlayers[data.targetId];
            enemy.hp = data.newHp;
            enemy.health = data.newHp; // ðŸ›‘ EL FIX: Sincroniza la barra de vida del enemigo
            enemy.isDead = data.isDead;
            enemy.lastHpUpdateTime = Date.now();
            // ðŸ›¡ï¸ Respawn shield
            if (data.shieldUntil) enemy.shieldUntil = data.shieldUntil;

            if (data.damageDealt > 0) {
                enemy.lastHitTime = Date.now();
                spawnDamageText(enemy.worldX, enemy.worldY, data.damageDealt, false);
            } else if (data.damageDealt < 0) {
                spawnDamageText(enemy.worldX, enemy.worldY, data.damageDealt, true);
            }
        }

                // --- 3. ACTUALIZAR KILLS Y LOSSES EN LA PANTALLA ---
        if (data.isDead) {

            // Actualizar al Tirador (El que hizo la kill)
            if (data.shooterId === myId) {
                player.kills = data.shooterKills;
                spawnDamageText(player.worldX, player.worldY, "+1 Kill", true); // Flota texto verde en ti
            } else if (otherPlayers[data.shooterId]) {
                otherPlayers[data.shooterId].kills = data.shooterKills;
            }

            // Actualizar a la Víctima (El que murió)
            if (data.targetId === myId) {
                player.losses = data.targetLosses;
                spawnDamageText(player.worldX, player.worldY, "+1 Loss", false); // Flota texto rojo en ti
            } else if (otherPlayers[data.targetId]) {
                otherPlayers[data.targetId].losses = data.targetLosses;
            }
        }

        // 🏳️ TURF RESPAWN: teletransportar al spawn con fade
        // isTeleporting=true INMEDIATO para congelar movimiento desde el primer frame
        if (!data.isDead && data.targetId === myId && data.respawnX != null && data.respawnY != null) {
            player.isTeleporting = true; // ← congela input de movimiento al instante

            const fade = document.getElementById('fade-overlay');
            if (fade) {
                fade.style.background = 'black';
                fade.style.opacity = '0.9';
                setTimeout(() => {
                    // Mover al spawn exactamente cuando la pantalla está negra
                    player.worldX = data.respawnX;
                    player.worldY = data.respawnY;
                    player.vx = 0; player.vy = 0;
                    lastNetworkString = '';
                    spawnDamageText(player.worldX, player.worldY, '🏳️ Respawn', true);
                    // Desvanecer Y soltar el congelamiento solo al terminar el fade
                    setTimeout(() => {
                        fade.style.opacity = '0';
                        player.isTeleporting = false; // ← movimiento habilitado de nuevo
                    }, 220);
                }, 320);
            } else {
                // Fallback sin fade: mover y liberar inmediatamente
                player.worldX = data.respawnX;
                player.worldY = data.respawnY;
                player.vx = 0; player.vy = 0;
                lastNetworkString = '';
                player.isTeleporting = false;
            }
        }
    }
    else if (data.type === 'joined' || data.type === 'update') {
        // Ignore messages about our own character!
        if (data.id === myId) return;

        // 🛑 FAILSAFE 1: Ignorar si el servidor manda un paquete vacío
        if (!data.player) return;

        if (!otherPlayers[data.id]) {
            // First time seeing this player
            otherPlayers[data.id] = data.player;
            otherPlayers[data.id].targetX = data.player.worldX;
            otherPlayers[data.id].targetY = data.player.worldY;
        } else {
            const op = otherPlayers[data.id];

            // 🛑 FAILSAFE 2: Si el jugador localmente es un fantasma (null), borrar y abortar
            if (!op) {
                delete otherPlayers[data.id];
                return;
            }

            // 1. Update identity and state
            op.username = data.player.username;
            op.frameY = data.player.frameY;
            op.isMoving = data.player.isMoving;
            op.isSitting = data.player.isSitting;

            // Identity & Account
            if (data.player.accountId) op.accountId = data.player.accountId;
            if (data.player.gameId) op.gameId = data.player.gameId;
            if (data.player.role) op.role = data.player.role;
            if (data.player.isGuest !== undefined) op.isGuest = data.player.isGuest;

            // Stats & Currency
            if (data.player.coins !== undefined) op.coins = data.player.coins;
            if (data.player.gems !== undefined) op.gems = data.player.gems;
            if (data.player.kills !== undefined) op.kills = data.player.kills;
            if (data.player.losses !== undefined) op.losses = data.player.losses;
            if (data.player.elo !== undefined) op.elo = data.player.elo;
            if (data.player.squad !== undefined) op.squad = data.player.squad;

            // 🛑 THE JITTER FIX: The client will animate the legs locally!

            // 🛑 THE TELEPORT FIX: ONLY update the target destination. 
            // Never overwrite op.worldX/Y directly here!
            op.targetX = data.player.worldX;
            op.targetY = data.player.worldY;

            // Update wardrobe and stats
            op.equippedWeapon = data.player.equippedWeapon;
            op.isDead = data.player.isDead;
            op.invisibleEnabled = data.player.invisibleEnabled;
            op.equipped = data.player.equipped || op.equipped || { head: 'head_default', body: 'body_default', hands: 'none' };
            op.squadName = data.player.squadName;
            op.squadLogo = data.player.squadLogo;
            op.lastUpdateTick = Date.now(); // Feed the garbage collector

            // 💬 Chat bubble: only reset timer when it's a NEW message
            if (data.player.message && data.player.message !== op.message) {
                op.message = data.player.message;
                op.messageTimer = data.player.messageTimer > 0 ? data.player.messageTimer : 420;
            } else if (!data.player.message) {
                // Sender cleared their message (timer hit 0 on their side)
                op.message = '';
                op.messageTimer = 0;
            }
            op.isTyping = data.player.isTyping;
        }
    } else if (data.type === 'player_count') {
        const mapPlayerCount = document.getElementById('map-player-count');
        if (mapPlayerCount) mapPlayerCount.innerText = `Players: ${data.count}`;
    } else if (data.type === 'admin_online_players_list') {
        if (typeof window.renderGodOnlinePlayers === 'function') {
            window.renderGodOnlinePlayers(data.players);
        }
    } else if (data.type === 'left') {
        delete otherPlayers[data.id];
        const gm = document.getElementById('god-modal');
        if (gm && gm.style.display !== 'none' && typeof window.renderGodOnlinePlayers === 'function') {
            window.renderGodOnlinePlayers();
        }
    } else if (data.type === 'login_success') {
        // SLEDGEHAMMER HIDE THE LOGIN SCREEN
        authOverlay.style.display = 'none';
        if(authOverlay) authOverlay.style.opacity = '0';
        if(authOverlay) authOverlay.style.pointerEvents = 'none';
        // ðŸ‘‡ NUEVO: Aterrizar el dron tras loguearse ðŸ‘‡
        isCinematicLoading = false;

        // Si player.squad existe (no es null), muestra el botÃ³n como 'flex', si no, 'none'
        if (document.getElementById('island-squad-chat-btn')) {
            document.getElementById('island-squad-chat-btn').style.display = player.squad ? 'flex' : 'none';
        }

        // SAVE THE TOKEN TO BROWSER MEMORY!
        if (data.token) {
            localStorage.setItem('gameToken', data.token);
            // Sincronizar datos con el index.html
            if (data.player) {
                localStorage.setItem('gameUsername', data.player.username);
                localStorage.setItem('gameCoins', data.player.coins || 0);
                if (data.player.equipped && data.player.equipped.head) {
                    localStorage.setItem('gameHead', 'items/players/head/' + data.player.equipped.head + '.png');
                }
            }
            // --- NUEVO: BATTLE PASS INIT ---
            if (data.activeSeason) {
                bpActiveSeason = data.activeSeason;
                bpXP = data.player.bpXP || 0;
                bpPremium = data.player.bpPremium || false;
                bpClaimedFree = data.player.bpClaimedFree || [];
                bpClaimedPremium = data.player.bpClaimedPremium || [];
                renderBattlePass(); // Pre-render
            }
        }
        // --- THE FIX: Load the friends array from the server into your local player! ---
        player.friends = data.friends || [];

        // --- THE FIX: Load the inventory from the server! ---
        player.inventory = data.player.inventory || [];
        // --- THE PERSISTENCE FIX: Apply the loaded weapon! ---
        player.equippedWeapon = data.player.equippedWeapon || "none";

        // --- THE HOTBAR PERSISTENCE FIX ---
        player.hotbar = data.player.hotbar || ["none", "none", "none"];
        player.quickSwaps = data.player.quickSwaps || [];
        player.accountId = data.player.accountId;

        // --- ðŸŒŸ NUEVO: CARGAR TAREAS DEL SERVIDOR TRAS LOGIN ðŸŒŸ ---
        globalTasks = data.globalTasks || {};
        myTaskProgress = data.taskProgress || {};
        myClaimedTasks = data.claimedTasks || {}; console.log(`[DEBUG] Updated myClaimedTasks from ${data.type}:`, myClaimedTasks);
        if (typeof checkTaskBadge === 'function') checkTaskBadge();

        // ðŸŒŸ NUEVO: Pedir datos del squad si pertenece a uno, para las recompensas de Squad
        if (data.player.squad) {
            ws.send(MessagePack.encode({ type: 'get_squad_details_silent', squadId: data.player.squad }));
        }

        // ðŸ›‘ EL FIX 3: Cargar tu ropa desde el servidor al entrar
        player.equipped = data.player.equipped || { head: 'head_default', body: 'body_default', hands: 'none' };
        // --- NUEVO: RECIBIR TU ROL ---
        player.role = data.player.role;

        // EL FIX: Comprobamos si los botones existen antes de intentar cambiarles el 'style'
        const appEditModeBtn = document.getElementById('app-edit-mode');
        const appGodPanelBtn = document.getElementById('app-god-panel');
        const appSkelBtn = document.getElementById('app-skel');

        // Ocultar o Mostrar el botón del Editor según tu rol
        if (player.role === 'admin') {
            if (appEditModeBtn) appEditModeBtn.style.display = 'flex';
            if (appGodPanelBtn) appGodPanelBtn.style.display = 'flex';
            if (appSkelBtn) appSkelBtn.style.display = 'flex';
        } else {
            if (appEditModeBtn) appEditModeBtn.style.display = 'none';
            if (appGodPanelBtn) appGodPanelBtn.style.display = 'none';
            if (appSkelBtn) appSkelBtn.style.display = 'none';
            editMode = false;
        }
        // Set the active highlight to match the equipped weapon
        const slotIndex = player.hotbar.indexOf(player.equippedWeapon);
        if (slotIndex !== -1) {
            player.activeSlot = slotIndex;
        }

        // Redraw the HUD so it shows your saved items!
        renderHudHotbar();

        // MORPH THE TRAY BUTTON INTO "SIGN OUT"
        isLoggedIn = true;
        const authBg = appAuth.querySelector('.app-bg');
        const authText = appAuth.querySelector('span');

        authBg.innerHTML = '<img src="items/icons/door.png" class="pixel-icon" alt="Sign Out">';
        authBg.style.background = 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)';
        authText.innerText = 'Sign Out';

        // Update our local character with the DB memory
        player.username = data.player.username;
        player.worldX = data.player.worldX;
        player.worldY = data.player.worldY;
        player.coins = data.player.coins || 0;
        player.gems = data.player.gems || 0;
        player.kills = data.player.kills || 0;
        player.losses = data.player.losses || 0;
        player.elo = data.player.elo || 1000;
        player.squadName = data.player.squadName;
        player.squadLogo = data.player.squadLogo;
        player.squad = data.player.squad;

        // Guardar tus atributos y permisos de squad al entrar al juego
        player.squadCanInvite = !!data.player.squadCanInvite;
        player.squadCanKick = !!data.player.squadCanKick;
        player.squadCanAssignRoles = !!data.player.squadCanAssignRoles;
        player.isLeader = !!data.player.isLeader;
        player.squadRole = data.player.squadRole || null;
        player.squadTitle = data.player.squadTitle || null;
        // Actualizar el botón de radio al loguearse
        updateSquadChatButton();
        // Force an immediate camera update
        lastNetworkString = "";
    }
    // --- NUEVO: RECIBIR SOLICITUD DE AMISTAD ---
    else if (data.type === 'friend_request') {
        window.pendingRequests = window.pendingRequests || [];
        window.pendingRequests.push(data);

        if (typeof window.checkPendingRequests === 'function') {
            window.checkPendingRequests();
        } else {
            const notifBtnContainer = document.getElementById('notif-btn-container');
            if (notifBtnContainer) notifBtnContainer.style.display = 'block';
            const friendBadge = document.getElementById('friend-notif-badge');
            if (friendBadge) {
                friendBadge.style.display = 'flex';
                friendBadge.innerText = window.pendingRequests.length;
            }
        }

        if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);

        const notifCanvas = document.getElementById('notif-canvas');
        const hImg = window.headImg || (typeof headImg !== 'undefined' ? headImg : null);
        if (notifCanvas && hImg && hImg.complete) {
            const nCtx = notifCanvas.getContext('2d');
            if (nCtx) {
                nCtx.clearRect(0, 0, notifCanvas.width, notifCanvas.height);
                const frameW = window.FRAME_WIDTH || (typeof FRAME_WIDTH !== 'undefined' ? FRAME_WIDTH : 48);
                const headFrameH = hImg.height / 4;
                const drawW = 32;
                const drawH = 32 * (headFrameH / frameW);
                nCtx.drawImage(hImg, 0, 0, frameW, headFrameH, (notifCanvas.width - drawW) / 2, (notifCanvas.height - drawH) / 2, drawW, drawH);
            }
        }
    }
    // --- RECIBIR INVITACIÓN A UN CLAN ---
    else if (data.type === 'squad_invite') {
        window.pendingRequests = window.pendingRequests || [];
        window.pendingRequests.push(data);

        if (typeof window.checkPendingRequests === 'function') {
            window.checkPendingRequests();
        } else {
            const notifBtnContainer = document.getElementById('notif-btn-container');
            if (notifBtnContainer) notifBtnContainer.style.display = 'block';
            const friendBadge = document.getElementById('friend-notif-badge');
            if (friendBadge) {
                friendBadge.style.display = 'flex';
                friendBadge.innerText = window.pendingRequests.length;
            }
        }

        if (typeof wakeUpIsland === 'function') wakeUpIsland(5000);

        const notifCanvas = document.getElementById('notif-canvas');
        const hImg = window.headImg || (typeof headImg !== 'undefined' ? headImg : null);
        if (notifCanvas && hImg && hImg.complete) {
            const nCtx = notifCanvas.getContext('2d');
            if (nCtx) {
                nCtx.clearRect(0, 0, notifCanvas.width, notifCanvas.height);
                const frameW = window.FRAME_WIDTH || (typeof FRAME_WIDTH !== 'undefined' ? FRAME_WIDTH : 48);
                const headFrameH = hImg.height / 4;
                const drawW = 32;
                const drawH = 32 * (headFrameH / frameW);
                nCtx.drawImage(hImg, 0, 0, frameW, headFrameH, (notifCanvas.width - drawW) / 2, (notifCanvas.height - drawH) / 2, drawW, drawH);
            }
        }
    }
    // --- RECIBIR ACTUALIZACIÓN DEL GANI EDITOR ---
    else if (data.type === 'sync_skeleton') {
        SKELETON_DATA.anchors = data.anchors;
    } else if (data.type === 'sync_melee_stats') {
        if (weaponsDB[data.weaponId]) {
            // Aseguramos que el objeto exista
            if (!weaponsDB[data.weaponId].dirStats) {
                weaponsDB[data.weaponId].dirStats = {};
            }
            // Sobreescribimos solo la configuración del lado que se editó
            weaponsDB[data.weaponId].dirStats[data.direction] = data.stats;
        }
    }
};

// =========================================================
//  CONSTRUCTOR DINÁMICO DE LA INTERFAZ DE ZONAS
// =========================================================
let activeZoneFilter = 'all'; // 'all' muestra todo. Si es 'trash', solo muestra basureros.
let showSafeZoneVisuals = false; // Memoria del interruptor principal

function buildZoneUI() {
    const selectEl = document.getElementById('zone-type-select');
    const modalSelectEl = document.getElementById('modal-zone-type-select');
    const filterContainer = document.getElementById('zone-filter-buttons');

    const defaultConfigs = {
        safe: { name: "Zona Segura", icon: "🛡️", colorBorder: "rgba(46, 204, 113, 0.8)", colorFill: "rgba(46, 204, 113, 0.2)" },
        trash: { name: "Basurero / Chatarra", icon: "🗑️", colorBorder: "rgba(230, 126, 34, 0.8)", colorFill: "rgba(230, 126, 34, 0.2)" },
        dig: { name: "Zona de Excavación", icon: "⛏️", colorBorder: "rgba(139, 69, 19, 0.8)", colorFill: "rgba(139, 69, 19, 0.2)" },
        turf: { name: "Turf (Respawn Clan)", icon: "🏴", colorBorder: "rgba(231, 76, 60, 0.9)", colorFill: "rgba(231, 76, 60, 0.15)" },
        indoor: { name: "Interior / Techo", icon: "🏠", colorBorder: "rgba(52, 152, 219, 0.8)", colorFill: "rgba(52, 152, 219, 0.2)" },
        npc: { name: "Zona NPC", icon: "🤖", colorBorder: "rgba(155, 89, 182, 0.8)", colorFill: "rgba(155, 89, 182, 0.2)" }
    };

    const configs = (window.ZONE_CONFIG && Object.keys(window.ZONE_CONFIG).length > 0)
        ? window.ZONE_CONFIG
        : defaultConfigs;

    if (selectEl) selectEl.innerHTML = '';
    if (modalSelectEl) modalSelectEl.innerHTML = '';
    if (filterContainer) {
        filterContainer.innerHTML = '<button class="tool-btn active zone-filter-btn" data-target="all" style="background: #3498db;">🌟 Todo</button>';
    }

    for (const [key, config] of Object.entries(configs)) {
        if (selectEl) {
            selectEl.innerHTML += `<option value="${key}">${config.icon} ${config.name}</option>`;
        }
        if (modalSelectEl) {
            modalSelectEl.innerHTML += `<option value="${key}">${config.icon} ${config.name}</option>`;
        }
        if (filterContainer) {
            filterContainer.innerHTML += `<button class="tool-btn zone-filter-btn" data-target="${key}" style="background: rgba(255,255,255,0.1);">${config.icon} ${config.name}</button>`;
        }
    }

    document.querySelectorAll('.zone-filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.zone-filter-btn').forEach(b => {
                b.style.background = 'rgba(255,255,255,0.1)';
                b.classList.remove('active');
            });

            const targetBtn = e.currentTarget || e.target;
            targetBtn.style.background = '#3498db';
            targetBtn.classList.add('active');
            activeZoneFilter = targetBtn.getAttribute('data-target');
        };
    });
}

// --- UPDATED LOGIN BUTTON ---
loginBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        authMessage.style.color = '#f1c40f';
        authMessage.innerText = "Still connecting... please wait.";
        return;
    }

    if (authEmail.value && authPassword.value) {
        ws.send(MessagePack.encode({
            type: 'login',
            email: authEmail.value.trim().toLowerCase(), // Send email instead of username
            password: authPassword.value
        }));
    } else {
        authMessage.innerText = "Please enter your email and password.";
    }
});

// --- UPDATED REGISTER BUTTON ---
registerBtn.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        authMessage.style.color = '#f1c40f';
        authMessage.innerText = "Still connecting... please wait.";
        return;
    }

    if (authEmail.value && authUsername.value && authPassword.value) {
        ws.send(MessagePack.encode({
            type: 'register',
            email: authEmail.value.trim().toLowerCase(), // Add email
            username: authUsername.value.trim(),         // Add display name
            password: authPassword.value
        }));
    } else {
        authMessage.style.color = '#ff6b6b';
        authMessage.innerText = "Please fill out Email, Display Name, and Password to sign up.";
    }
});

// Send our state to the server ONLY when something changes