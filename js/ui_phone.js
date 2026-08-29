// =========================================================
// UI PHONE MODULE: Apps, Modals, Inbox, Social, Profiles
// =========================================================

// --- LÃ“GICA DE LA APP DE ACTUALIZACIONES ---
const appUpdates = document.getElementById('app-updates');
const updatesModal = document.getElementById('updates-modal');
const closeUpdatesModal = document.getElementById('close-updates-modal');
const updatesListContainer = document.getElementById('updates-list-container');

if (appUpdates) {
    appUpdates.addEventListener('click', () => {
        hideTrayForModal();
        renderPatchNotes();
        updatesModal.style.display = 'flex';
    });
}

if (closeUpdatesModal) {
    closeUpdatesModal.addEventListener('click', () => {
        updatesModal.style.display = 'none';
        restoreTrayAfterModal();
    });
}

function renderPatchNotes() {
    updatesListContainer.innerHTML = "";

    if (!window.PATCH_NOTES || window.PATCH_NOTES.length === 0) {
        updatesListContainer.innerHTML = '<div style="text-align:center; color:#777; font-style:italic;">No hay noticias recientes.</div>';
        return;
    }

    window.PATCH_NOTES.forEach((note, index) => {
        // Formatear la fecha
        const dateObj = new Date(note.date);
        const dateString = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        // Destacar el parche mÃ¡s reciente
        const isNewest = index === 0;
        const borderColor = isNewest ? 'rgba(0, 198, 255, 0.5)' : 'rgba(255,255,255,0.1)';
        const bg = isNewest ? 'rgba(0, 198, 255, 0.05)' : 'rgba(255,255,255,0.02)';
        const badge = isNewest ? `<span style="background: #00c6ff; color: black; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">Â¡NUEVO!</span>` : '';

        const noteDiv = document.createElement('div');
        noteDiv.style.background = bg;
        noteDiv.style.border = `1px solid ${borderColor}`;
        noteDiv.style.borderRadius = "10px";
        noteDiv.style.padding = "15px";

        noteDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <h4 style="margin: 0; color: ${isNewest ? '#00c6ff' : 'white'}; font-family: sans-serif; font-size: 16px;">
                            ${escapeHTML(note.title)} ${badge}
                        </h4>
                        <span style="color: #777; font-size: 11px; font-family: monospace;">v${escapeHTML(note.version)}</span>
                    </div>
                    <div style="color: #aaa; font-size: 10px; margin-bottom: 10px;">ðŸ“… ${dateString}</div>
                    <div style="color: #ddd; font-size: 13px; line-height: 1.5; font-family: sans-serif; white-space: pre-wrap;">${escapeHTML(note.description)}</div>
                `;

        updatesListContainer.appendChild(noteDiv);
    });
}


// --- PROFILE MODAL LOGIC ---
const profileModal = document.getElementById('profile-modal');
const closeProfile = document.getElementById('close-profile');
// --- CONECTADO AL CANVAS CLÃSICO GIGANTE ---
const profileCanvas = document.getElementById('profile-canvas');
const prCtx = profileCanvas.getContext('2d');
const profileNameDisplay = document.getElementById('profile-name-display');

// Nuevas variables para el botÃ³n de opciones
const profileOptionsBtn = document.getElementById('profile-options-btn');
const profileOtherControls = document.getElementById('profile-other-controls');
const addFriendBtn = document.getElementById('add-friend-btn');

// Variables del Modal de Opciones
const optionsModal = document.getElementById('options-modal');
const closeOptionsModal = document.getElementById('close-options-modal');
const editNameInput = document.getElementById('edit-name-input');
const saveNameBtn = document.getElementById('save-name-btn');

let isProfileOpen = false;
let profileTargetId = null;
let profileAnimFrame = 0;
let currentProfileData = null; // ðŸ‘ˆ Guarda toda la data del jugador inspeccionado



// =========================================================
// ðŸ—£ï¸ SISTEMA DE DIÃLOGOS RPG (A PRUEBA DE FALLOS v3)
// =========================================================
let dialogFullText = "";
let dialogCurrentIndex = 0;
let dialogTimer = null;
let isDialogTyping = false;

function showRetroDialog(texto) {
    if (!texto) return; // Escudo por si el texto viene vacÃ­o

    const box = document.getElementById('retro-dialog-box');
    const textEl = document.getElementById('retro-dialog-text');
    const indicator = document.getElementById('retro-dialog-indicator');

    if (!box || !textEl) {
        console.error("No se encontrÃ³ el HTML de la caja de diÃ¡logo.");
        return;
    }

    // 1. Congelar al jugador MIENTRAS LEE (Cortamos toda inercia)
    player.vx = 0;
    player.vy = 0;
    player.isMoving = false;

    // ðŸ›‘ EL FIX: TambiÃ©n detenemos al jugador hacia donde haya estado caminando
    keys.w = false; keys.a = false; keys.s = false; keys.d = false;

    // 2. Reiniciar la caja (Asegurar que la flechita se oculte al iniciar nuevo diÃ¡logo)
    box.style.display = 'block';
    if (indicator) indicator.style.display = 'none';

    // 3. Preparar las variables del texto
    dialogFullText = String(texto); // Forzar a que sea cadena de texto
    dialogCurrentIndex = 0;
    textEl.innerText = "";
    isDialogTyping = true;

    // 4. Limpiar timers viejos por si acaso
    if (dialogTimer) clearInterval(dialogTimer);

    // 5. Iniciar el efecto de mÃ¡quina de escribir (1 letra cada 35ms)
    dialogTimer = setInterval(() => {
        textEl.innerText += dialogFullText.charAt(dialogCurrentIndex);
        dialogCurrentIndex++;

        if (dialogCurrentIndex >= dialogFullText.length) {
            finishTypingDialog();
        }
    }, 35);
}

// FunciÃ³n para rellenar de golpe cuando se completa o el jugador se salta la animaciÃ³n
function finishTypingDialog() {
    if (dialogTimer) clearInterval(dialogTimer);
    const textEl = document.getElementById('retro-dialog-text');
    const indicator = document.getElementById('retro-dialog-indicator');

    if (textEl) textEl.innerText = dialogFullText;
    isDialogTyping = false;

    // Mostrar la flechita
    if (indicator) indicator.style.display = 'block';
}

// --- LÃ³gica de InteracciÃ³n (Hacer Clic en la caja) ---
window.handleDialogClick = function (e) {
    // Evitar que el clic en la caja de diÃ¡logo se propague al mapa detrÃ¡s
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    const box = document.getElementById('retro-dialog-box');

    if (isDialogTyping) {
        // Si estÃ¡ escribiendo y das clic, muestra todo el texto de golpe (Fast-Forward)
        finishTypingDialog();
    } else {
        // Si ya terminÃ³ de escribir y das clic, cerramos la caja y eres libre
        if (box) {
            box.style.display = 'none';
            // ðŸ›‘ EL FIX: Limpiamos la flechita para que no aparezca parpadeando la prÃ³xima vez que se abra de golpe
            const indicator = document.getElementById('retro-dialog-indicator');
            if (indicator) indicator.style.display = 'none';
        }
    }
};
function renderProfileUI(targetPlayer, targetId) {
    if (!targetPlayer) return;
    currentProfileData = targetPlayer;

    if (typeof profileNameDisplay !== 'undefined' && profileNameDisplay) {
        profileNameDisplay.innerText = targetPlayer.username || 'Player';
    }

    // Rank and ELO
    const targetElo = targetPlayer.elo !== undefined ? targetPlayer.elo : 1000;
    const rank = getPlayerRank(targetElo);
    const rankImgEl = document.getElementById('profile-rank-badge');
    const eloDisplay = document.getElementById('profile-elo-display');

    if (rankImgEl) {
        if (rank) {
            rankImgEl.src = rank.src;
            rankImgEl.style.display = 'block';
            rankImgEl.title = `${rank.name} (${targetElo} Pts)`;
        } else {
            rankImgEl.style.display = 'none';
        }
    }
    if (eloDisplay) {
        if (rank) {
            eloDisplay.innerText = targetElo;
            eloDisplay.style.display = 'block';
        } else {
            eloDisplay.style.display = 'none';
        }
    }

    // Clan Tag & Logo
    const tagContainer = document.getElementById('profile-squad-tag-container');
    if (tagContainer) {
        if (targetPlayer.squadName) {
            tagContainer.style.display = 'flex';
            const nameSpan = document.getElementById('profile-squad-name');
            if (nameSpan) nameSpan.innerText = `(${targetPlayer.squadName})`;

            const logoImg = document.getElementById('profile-squad-logo');
            if (logoImg) {
                if (targetPlayer.squadLogo) {
                    logoImg.src = targetPlayer.squadLogo;
                    logoImg.style.display = 'block';
                } else {
                    logoImg.style.display = 'none';
                }
            }
        } else {
            tagContainer.style.display = 'none';
        }
    }

    // Coins / Argons
    const coinsDisplay = document.getElementById('profile-coins-display');
    if (coinsDisplay) {
        const coinsVal = targetId === 'self' ? (player.coins || 0) : (targetPlayer.coins || 0);
        coinsDisplay.innerText = coinsVal;
    }

    // Kills, Losses, and KR
    const killsDisplay = document.getElementById('profile-kills-display');
    const lossesDisplay = document.getElementById('profile-losses-display');
    const krDisplay = document.getElementById('profile-kr-display');

    const k = targetId === 'self' ? (player.kills || 0) : (targetPlayer.kills || 0);
    const l = targetId === 'self' ? (player.losses || 0) : (targetPlayer.losses || 0);

    if (killsDisplay) killsDisplay.innerText = k;
    if (lossesDisplay) lossesDisplay.innerText = l;
    if (krDisplay) {
        const kr = l === 0 ? k.toFixed(2) : (k / l).toFixed(2);
        krDisplay.innerText = kr;
    }

    // Modal display
    if (typeof profileModal !== 'undefined' && profileModal) {
        profileModal.style.display = 'flex';
    }

    // Action buttons
    const mainActionsDiv = document.getElementById('profile-main-actions');
    const moreOptionsBtn = document.getElementById('toggle-more-options-btn');
    const moreOptionsModal = document.getElementById('more-options-modal');
    const backFromMoreOptions = document.getElementById('back-from-more-options');
    const inviteSquadBtn = document.getElementById('invite-squad-btn');

    if (targetId === 'self') {
        if (typeof profileOptionsBtn !== 'undefined' && profileOptionsBtn) profileOptionsBtn.style.display = 'block';
        if (mainActionsDiv) mainActionsDiv.style.display = 'none';
        if (moreOptionsBtn) moreOptionsBtn.style.display = 'none';
    } else {
        if (typeof profileOptionsBtn !== 'undefined' && profileOptionsBtn) profileOptionsBtn.style.display = 'none';
        if (mainActionsDiv) mainActionsDiv.style.display = 'flex';
        if (moreOptionsBtn) moreOptionsBtn.style.display = 'block';
        if (typeof addFriendBtn !== 'undefined' && addFriendBtn) addFriendBtn.style.display = 'block';

        const targetAccId = targetPlayer.accountId;
        const targetName = targetPlayer.username;
        const isFriend = player.friends && targetAccId && player.friends.includes(targetAccId);

        // Add / Remove Friend
        if (typeof addFriendBtn !== 'undefined' && addFriendBtn) {
            addFriendBtn.style.background = "#3498db";
            addFriendBtn.style.border = "none";
            addFriendBtn.style.color = "white";

            if (isFriend) {
                addFriendBtn.innerText = "❌ Unfriend";
                addFriendBtn.onclick = () => {
                    ws.send(MessagePack.encode({ type: 'remove_friend', targetId: targetAccId }));
                    if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';
                };
            } else {
                addFriendBtn.innerText = "➕ Add Friend";
                addFriendBtn.onclick = () => {
                    if (!targetAccId) {
                        alert("No puedes agregar como amigo a un Invitado.");
                        return;
                    }
                    ws.send(MessagePack.encode({ type: 'add_friend', friendAccountId: targetAccId }));
                    addFriendBtn.innerText = "✓ Sent";
                    if (!player.friends) player.friends = [];
                    player.friends.push(targetAccId);
                };
            }
        }

        // Direct Message (PM)
        if (typeof profileMessageBtn !== 'undefined' && profileMessageBtn) {
            profileMessageBtn.onclick = () => {
                if (!targetAccId) {
                    alert("No puedes enviar mensajes a un Invitado.");
                    return;
                }
                if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';
                lastPmSource = 'profile';
                openPMModal(targetAccId, targetName);
            };
        }

        // More Options & Invite to Squad
        if (moreOptionsBtn && moreOptionsModal) {
            moreOptionsBtn.onclick = () => {
                if (typeof profileModal !== 'undefined') profileModal.style.display = 'none';
                moreOptionsModal.style.display = 'flex';

                if (inviteSquadBtn) {
                    if (!player.squad || !player.squadCanInvite) {
                        inviteSquadBtn.style.display = 'none';
                    } else {
                        inviteSquadBtn.style.display = 'block';
                        inviteSquadBtn.innerText = "🏴‍☠️ Invitar al Clan";
                        inviteSquadBtn.style.background = "rgba(155, 89, 182, 0.2)";
                        inviteSquadBtn.style.borderColor = "#9b59b6";
                        inviteSquadBtn.style.color = "white";
                        inviteSquadBtn.disabled = false;

                        inviteSquadBtn.onclick = () => {
                            const accId = currentProfileData?.accountId || targetAccId;
                            const uname = currentProfileData?.username || targetName;
                            const pId = (profileTargetId !== 'self' && profileTargetId !== 'offline') ? profileTargetId : null;

                            ws.send(MessagePack.encode({
                                type: 'send_squad_invite',
                                targetAccountId: accId,
                                targetUsername: uname,
                                targetPlayerId: pId
                            }));

                            inviteSquadBtn.dataset.inviting = "true";
                            inviteSquadBtn.innerText = "⏳ Enviando...";
                            inviteSquadBtn.style.background = "#7f8c8d";
                            inviteSquadBtn.style.borderColor = "#555";
                            inviteSquadBtn.disabled = true;
                        };
                    }
                }
            };
        }

        if (backFromMoreOptions) {
            backFromMoreOptions.onclick = () => {
                moreOptionsModal.style.display = 'none';
                if (typeof profileModal !== 'undefined') profileModal.style.display = 'flex';
            };
        }
    }

    drawProfileAnimation();
}

function openProfile(targetId, username, initialData = null) {
    isProfileOpen = true;
    profileTargetId = targetId;

    let targetPlayer;
    if (targetId === 'self') {
        targetPlayer = player;
    } else if (targetId === 'offline') {
        targetPlayer = {
            accountId: initialData ? initialData.accountId : null,
            username: username || (initialData ? initialData.username : 'Player'),
            role: initialData ? initialData.role : 'player',
            elo: initialData ? (initialData.elo || 1000) : 1000,
            kills: initialData ? (initialData.kills || 0) : 0,
            losses: initialData ? (initialData.losses || 0) : 0,
            coins: initialData ? (initialData.coins || 0) : 0,
            gems: initialData ? (initialData.gems || 0) : 0,
            squad: initialData ? initialData.squad : null,
            squadName: initialData ? initialData.squadName : null,
            squadLogo: initialData ? initialData.squadLogo : null,
            isGuest: false,
            equipped: {
                head: (initialData && initialData.equipped && initialData.equipped.head)
                    ? initialData.equipped.head : (initialData && initialData.headId ? initialData.headId : 'head_default'),
                body: (initialData && initialData.equipped && initialData.equipped.body)
                    ? initialData.equipped.body : 'body_default',
                hat: (initialData && initialData.equipped && initialData.equipped.hat)
                    ? initialData.equipped.hat : 'none'
            }
        };
    } else {
        const op = otherPlayers[targetId] || {};
        targetPlayer = {
            accountId: op.accountId || (initialData ? initialData.accountId : null),
            username: username || op.username || (initialData ? initialData.username : 'Player'),
            role: op.role || (initialData ? initialData.role : 'player'),
            elo: op.elo !== undefined ? op.elo : (initialData && initialData.elo !== undefined ? initialData.elo : 1000),
            kills: op.kills !== undefined ? op.kills : (initialData && initialData.kills !== undefined ? initialData.kills : 0),
            losses: op.losses !== undefined ? op.losses : (initialData && initialData.losses !== undefined ? initialData.losses : 0),
            coins: op.coins !== undefined ? op.coins : (initialData && initialData.coins !== undefined ? initialData.coins : 0),
            gems: op.gems !== undefined ? op.gems : (initialData && initialData.gems !== undefined ? initialData.gems : 0),
            squad: op.squad || (initialData ? initialData.squad : null),
            squadName: op.squadName || (initialData ? initialData.squadName : null),
            squadLogo: op.squadLogo || (initialData ? initialData.squadLogo : null),
            isGuest: op.isGuest !== undefined ? op.isGuest : (initialData ? initialData.isGuest : false),
            equipped: {
                head: (op.equipped && op.equipped.head) ? op.equipped.head : ((initialData && initialData.equipped && initialData.equipped.head) ? initialData.equipped.head : 'head_default'),
                body: (op.equipped && op.equipped.body) ? op.equipped.body : ((initialData && initialData.equipped && initialData.equipped.body) ? initialData.equipped.body : 'body_default'),
                hat: (op.equipped && op.equipped.hat) ? op.equipped.hat : ((initialData && initialData.equipped && initialData.equipped.hat) ? initialData.equipped.hat : 'none')
            }
        };
    }

    renderProfileUI(targetPlayer, targetId);

    // Si es otro jugador, pedir al servidor sus datos en vivo o de la BD
    if (targetId !== 'self' && typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({
            type: 'get_player_profile',
            targetId: targetId,
            username: username || targetPlayer.username,
            accountId: targetPlayer.accountId
        }));
    }
}

window.updateProfileModalWithData = function (profile, targetId) {
    if (!profile) return;
    if (profileTargetId === targetId || (currentProfileData && (currentProfileData.accountId === profile.accountId || currentProfileData.username === profile.username))) {
        const updated = Object.assign({}, currentProfileData || {}, profile);
        if (!updated.equipped) {
            updated.equipped = { head: 'head_default', body: 'body_default', hat: 'none' };
        }
        currentProfileData = updated;
        renderProfileUI(updated, profileTargetId);
    }
};

closeProfile.addEventListener('click', () => {
    isProfileOpen = false;
    profileModal.style.display = 'none';

    if (lastProfileSource === 'friends') {
        document.getElementById('friends-modal').style.display = 'flex';
        lastProfileSource = 'game';
    } else if (lastProfileSource === 'squad') {
        document.getElementById('my-squad-modal').style.display = 'flex';
        lastProfileSource = 'game';
    } else if (lastProfileSource === 'squad_member') {
        // ðŸ›‘ EL FIX: Si venÃ­amos de editar a un miembro, abrimos AMBAS ventanas
        document.getElementById('my-squad-modal').style.display = 'flex'; // Fondo
        document.getElementById('squad-member-modal').style.display = 'flex'; // Frente
        lastProfileSource = 'game'; // Reseteamos
    }
});

profileOptionsBtn.addEventListener('click', () => {
    editNameInput.value = player.username;
    openWardrobe();
    profileModal.style.display = 'none'; // ðŸ›‘ HIDE PROFILE MODAL
    optionsModal.style.display = 'flex';
});

// =========================================================
// ---  SISTEMA DEL MODAL DE OPCIONES ---
// =========================================================

// 1. LÃ³gica de PestaÃ±as (Tabs)
const opTabBtns = document.querySelectorAll('.op-tab-btn');
const opTabContents = document.querySelectorAll('.op-tab-content');

opTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Apagar todas
        opTabBtns.forEach(b => {
            b.style.background = 'transparent';
            b.style.borderBottomColor = 'transparent';
            b.style.color = '#aaa';
            b.style.fontWeight = 'normal';
        });
        opTabContents.forEach(c => c.style.display = 'none');

        // Encender la presionada
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.borderBottomColor = '#3498db'; // Color activo
        btn.style.color = 'white';
        btn.style.fontWeight = 'bold';

        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).style.display = 'block';
    });
});

// 2. Cerrar Modal y AUTO-GUARDAR Todo (Nombre + Ropa)
closeOptionsModal.addEventListener('click', () => {

    // --- AUTO-GUARDAR NOMBRE ---
    const nameInput = document.getElementById('edit-name-input');
    if (nameInput) {
        const newName = nameInput.value.trim();
        // Verificamos que no estÃ© vacÃ­o y que sea diferente al actual
        if (newName.length > 0 && newName !== player.username) {
            player.username = newName; // Actualizamos localmente

            // Si tienes un texto en la pantalla que muestra el nombre, lo actualizamos de una vez
            const profileNameDisplay = document.getElementById('profile-name-display');
            if (profileNameDisplay) profileNameDisplay.innerText = newName;

            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                // Enviamos el formato EXACTO que tu servidor espera:
                ws.send(MessagePack.encode({ type: 'change_username', newUsername: newName }));
            }
        }
    }

    // --- AUTO-GUARDAR ROPA ---
    const headId = ownedHeads[currentHeadIdx];
    const bodyId = ownedBodies[currentBodyIdx];
    const hatId = ownedHats[currentHatIdx];

    const isDifferent = (
        player.equipped.head !== headId ||
        player.equipped.body !== bodyId ||
        player.equipped.hat !== hatId
    );

    if (isDifferent) {
        player.equipped.head = headId;
        player.equipped.body = bodyId;
        player.equipped.hat = hatId;

        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(MessagePack.encode({ type: 'update_wardrobe', head: headId, body: bodyId, hat: hatId }));
        }
    }

    // Ocultamos la ventana
    optionsModal.style.display = 'none';
    // ðŸ›‘ RETURN TO PROFILE MODAL
    if (isProfileOpen) {
        profileModal.style.display = 'flex';
    }
});

// 3. The Isolated Walking Animation for the UI (CON ROPA Y SOMBRERO DINÃMICO)
function drawProfileAnimation() {
    prCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
    prCtx.imageSmoothingEnabled = false;

    // 1. Â¿A quiÃ©n estamos inspeccionando? Usamos la memoria exacta que guardÃ³ openProfile
    const targetP = currentProfileData || player;

    // 2. Obtener la ropa que lleva puesta
    const eq = targetP.equipped || { head: 'head_default', body: 'body_default', hat: 'none' };
    const safeSprites = window.loadedItemSprites || {};
    const dynBody = safeSprites[eq.body] || window.bodyImg || window.walkSprite;
    const dynHead = safeSprites[eq.head] || window.headImg;
    const dynHat = safeSprites[eq.hat]; // ðŸŽ© Extraemos el sombrero

    if (!dynBody || !dynBody.complete) {
        requestAnimationFrame(drawProfileAnimation);
        return;
    }

    profileAnimFrame = (profileAnimFrame + 0.1) % 8;
    const fX = Math.floor(profileAnimFrame);

    // Fila 8: Caminar desarmado (Hacia abajo = DirecciÃ³n 0)
    const bodyRow = SKELETON_DATA.states["walk_unarmed"] || 8;
    const headRow = 0;

    // Usar FRAME_WIDTH y FRAME_HEIGHT fijos para no deformar spritesheets grandes
    const pFrameW = FRAME_WIDTH;
    const pFrameH = FRAME_HEIGHT;

    const drawScale = 4.5;
    const drawW = pFrameW * drawScale;
    const drawH = pFrameH * drawScale;

    const drawX = (profileCanvas.width - drawW) / 2;
    const drawY = (profileCanvas.height - drawH) / 2;

    // 3. Dibujar CUERPO
    prCtx.drawImage(
        dynBody,
        fX * pFrameW, bodyRow * pFrameH, pFrameW, pFrameH,
        drawX, drawY,
        drawW, drawH
    );

    // Extraer el bamboleo de la cabeza para el cuadro exacto de la animaciÃ³n
    const fKey = `walk_unarmed_0_${fX}`;
    const rawAnchors = (SKELETON_DATA.anchors && SKELETON_DATA.anchors[fKey]) ? SKELETON_DATA.anchors[fKey] : {};
    const headAnc = rawAnchors.head || [0, 0];

    // ==========================================================
    // ðŸ§  EL WOBBLE (BAMBOLEO) MATEMÃTICO PARA EL PERFIL
    // ==========================================================
    const WOBBLE_PATTERN = [0, 1, 0, -1, 0, 1, 0, -1];
    const currentWalkFrame = fX % 8;
    const wobbleY = WOBBLE_PATTERN[currentWalkFrame] || 0;

    // Calculamos la coordenada FINAL para el perfil
    const finalHeadX = drawX + (headAnc[0] * drawScale);
    const finalHeadY = drawY + ((headAnc[1] + wobbleY) * drawScale);

    // 4. Dibujar CABEZA
    if (dynHead && dynHead.complete && dynHead.naturalWidth > 0) {
        const headFrameH = dynHead.height / 4;
        prCtx.drawImage(
            dynHead,
            0, headRow * headFrameH, pFrameW, headFrameH, // X es 0, igual que el sombrero
            finalHeadX, finalHeadY, drawW, headFrameH * drawScale
        );
    }

    // 5. ðŸŽ© Dibujar SOMBRERO
    if (dynHat && dynHat.complete && dynHat.naturalWidth > 0) {
        const hatFrameH = dynHat.height / 4;
        prCtx.drawImage(
            dynHat,
            0, 0, pFrameW, hatFrameH,
            finalHeadX, finalHeadY, drawW, hatFrameH * drawScale
        );
    }
    // ==========================================================

    // ðŸ›‘ EL FIX: Solo pedir el siguiente frame si la ventana sigue abierta
    if (isProfileOpen) {
        requestAnimationFrame(drawProfileAnimation);
    }
}
// --- LÃ“GICA DEL INBOX Y CHAT PRIVADO ---
const inboxModal = document.getElementById('inbox-modal');
const closeInboxModal = document.getElementById('close-inbox-modal');
const inboxListContainer = document.getElementById('inbox-list-container');

const pmModal = document.getElementById('pm-modal');
const backToInboxBtn = document.getElementById('back-to-inbox-btn');
const pmTargetName = document.getElementById('pm-target-name');
const pmHistoryContainer = document.getElementById('pm-history-container');
const pmInput = document.getElementById('pm-input');
const pmSendBtn = document.getElementById('pm-send-btn');
const profileMessageBtn = document.getElementById('profile-message-btn');

let currentChatTargetId = ""; // AHORA USAMOS EL ID
let currentChatTargetName = "";
let currentChatTargetHead = "head_default"; // ðŸ‘ˆ NUEVA VARIABLE
// =========================================================
// ðŸ‘• SISTEMA DE GUARDARROPA (CARRUSEL)
// =========================================================
let ownedHeads = [];
let ownedBodies = [];
let ownedHats = []; // ðŸŽ© NUEVO
let currentHeadIdx = 0;
let currentBodyIdx = 0;
let currentHatIdx = 0;

function openWardrobe() {
    ownedHeads = ['head_default'];
    ownedBodies = ['body_default'];
    ownedHats = ['none']; // ðŸŽ© Por defecto puedes no llevar sombrero

    const safeCatalog = window.MASTER_CATALOG || {};

    if (player.inventory) {
        player.inventory.forEach(item => {
            const itemId = typeof item === 'object' ? item.id : item;
            const catalogItem = safeCatalog[itemId];

            if (catalogItem) {
                if (catalogItem.category === 'head' && !ownedHeads.includes(itemId)) ownedHeads.push(itemId);
                if (catalogItem.category === 'body' && !ownedBodies.includes(itemId)) ownedBodies.push(itemId);
                if (catalogItem.category === 'hat' && !ownedHats.includes(itemId)) ownedHats.push(itemId); // ðŸŽ©
            }
        });
    }

    if (!player.equipped) player.equipped = { head: 'head_default', body: 'body_default', hat: 'none' };
    currentHeadIdx = Math.max(0, ownedHeads.indexOf(player.equipped.head));
    currentBodyIdx = Math.max(0, ownedBodies.indexOf(player.equipped.body));
    currentHatIdx = Math.max(0, ownedHats.indexOf(player.equipped.hat));

    updateWardrobePreview();
}

function updateWardrobePreview() {
    const headId = ownedHeads[currentHeadIdx];
    const bodyId = ownedBodies[currentBodyIdx];
    const hatId = ownedHats[currentHatIdx];

    const safeCatalog = window.MASTER_CATALOG || {};
    //document.getElementById('head-name-display').innerText = safeCatalog[headId]?.name || "Cabeza";
    //document.getElementById('body-name-display').innerText = safeCatalog[bodyId]?.name || "Cuerpo";
    //document.getElementById('hat-name-display').innerText = safeCatalog[hatId]?.name || "Sin Sombrero";

    const canvas = document.getElementById('wardrobe-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const safeSprites = window.loadedItemSprites || {};
    const bImg = safeSprites[bodyId] || window.bodyImg;
    const hImg = safeSprites[headId] || window.headImg;
    const hatImg = safeSprites[hatId]; // ðŸŽ©

    const frameW = 48; const frameH = 64;
    const zoom = 2;
    const drawX = (canvas.width - (frameW * zoom)) / 2;
    const drawY = (canvas.height - (frameH * zoom)) / 2 + 10;

    if (bImg && bImg.complete && bImg.naturalWidth > 0) ctx.drawImage(bImg, 0, 0, frameW, frameH, drawX, drawY, frameW * zoom, frameH * zoom);
    if (hImg && hImg.complete && hImg.naturalWidth > 0) ctx.drawImage(hImg, 0, 0, frameW, frameH, drawX, drawY, frameW * zoom, frameH * zoom);

    // ðŸŽ© Dibujar Sombrero en el Carrusel (Fila 0 = Hacia abajo)
    if (hatImg && hatImg.complete && hatImg.naturalWidth > 0) {
        const hHeight = hatImg.height / 4;
        ctx.drawImage(hatImg, 0, 0, frameW, hHeight, drawX, drawY, frameW * zoom, hHeight * zoom);
    }
}

document.getElementById('head-prev').onclick = () => { currentHeadIdx = (currentHeadIdx - 1 + ownedHeads.length) % ownedHeads.length; updateWardrobePreview(); };
document.getElementById('head-next').onclick = () => { currentHeadIdx = (currentHeadIdx + 1) % ownedHeads.length; updateWardrobePreview(); };
document.getElementById('body-prev').onclick = () => { currentBodyIdx = (currentBodyIdx - 1 + ownedBodies.length) % ownedBodies.length; updateWardrobePreview(); };
document.getElementById('body-next').onclick = () => { currentBodyIdx = (currentBodyIdx + 1) % ownedBodies.length; updateWardrobePreview(); };

// ðŸŽ© Botones del sombrero
document.getElementById('hat-prev').onclick = () => { currentHatIdx = (currentHatIdx - 1 + ownedHats.length) % ownedHats.length; updateWardrobePreview(); };
document.getElementById('hat-next').onclick = () => { currentHatIdx = (currentHatIdx + 1) % ownedHats.length; updateWardrobePreview(); };

// Conectar botones del Carrusel
document.getElementById('head-prev').onclick = () => { currentHeadIdx = (currentHeadIdx - 1 + ownedHeads.length) % ownedHeads.length; updateWardrobePreview(); };
document.getElementById('head-next').onclick = () => { currentHeadIdx = (currentHeadIdx + 1) % ownedHeads.length; updateWardrobePreview(); };
document.getElementById('body-prev').onclick = () => { currentBodyIdx = (currentBodyIdx - 1 + ownedBodies.length) % ownedBodies.length; updateWardrobePreview(); };
document.getElementById('body-next').onclick = () => { currentBodyIdx = (currentBodyIdx + 1) % ownedBodies.length; updateWardrobePreview(); };

// CERRAR INBOX
closeInboxModal.addEventListener('click', () => {
    inboxModal.style.display = 'none';
});

// BOTÃ“N "ATRÃS" EN EL CHAT
backToInboxBtn.addEventListener('click', () => {
    pmModal.style.display = 'none';

    currentChatTargetId = "";
    currentChatTargetName = "";

    // ðŸ›‘ EL FIX: Â¿A dÃ³nde regresamos?
    if (lastPmSource === 'profile') {
        // Si vinimos del perfil, reabrimos el perfil
        profileModal.style.display = 'flex';
        lastPmSource = 'inbox'; // Reseteamos por seguridad
    } else {
        // Si vinimos del Inbox normal, reabrimos el Inbox
        inboxModal.style.display = 'flex';
        ws.send(MessagePack.encode({ type: 'get_inbox' }));
    }
});

// ABRIR UN CHAT ESPECÃFICO
function openPMModal(targetAccountId, fallbackName) {
    inboxModal.style.display = 'none';
    currentChatTargetId = targetAccountId;
    currentChatTargetName = fallbackName || "Cargando...";
    pmTargetName.innerText = currentChatTargetName;

    const pmHeaderAvatar = document.getElementById('pm-header-avatar');
    // Ponemos un cuadrito gris cargando mientras esperamos al servidor
    pmHeaderAvatar.innerHTML = '<div style="width:36px; height:36px; background:rgba(0,0,0,0.5);"></div>';

    pmModal.style.display = 'flex';
    pmHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">Cargando mensajes...</div>';

    // Pedimos el historial usando el ID
    ws.send(MessagePack.encode({ type: 'get_pm_history', targetAccountId: targetAccountId }));
    setTimeout(() => pmInput.focus(), 100);
}

// ENVIAR MENSAJE
function sendPM() {
    const text = pmInput.value.trim();
    if (text && currentChatTargetId) {
        ws.send(MessagePack.encode({ type: 'send_pm', targetAccountId: currentChatTargetId, targetUsername: currentChatTargetName, text: text }));
        pmInput.value = "";
    }
}
pmSendBtn.addEventListener('click', sendPM);
pmInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendPM(); });

// =========================================================
// ðŸ­ FÃBRICA UNIVERSAL DE TARJETAS DE JUGADORES (DRY)
// =========================================================
function createPlayerCard(playerData, onClickCallback, inboxData = null) {
    const isAdmin = (playerData.role === 'admin');
    const rowBg = isAdmin ? "rgba(231, 76, 60, 0.15)" : "rgba(255,255,255,0.05)";
    const rowBorder = isAdmin ? "1px solid #e74c3c" : "1px solid rgba(255,255,255,0.1)";
    const nameColor = isAdmin ? "#e74c3c" : "#f1c40f";
    const adminBadge = isAdmin ? `<span style="background: #e74c3c; color: white; font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: bold; margin-left: 6px; box-shadow: 0 0 5px rgba(231,76,60,0.5);">ADMIN</span>` : "";

    const row = document.createElement('div');
    row.style.padding = "10px";
    row.style.background = rowBg;
    row.style.borderRadius = "10px";
    row.style.border = rowBorder;
    row.style.cursor = "pointer";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.transition = "0.2s";

    row.onmouseenter = () => row.style.transform = "scale(1.02)";
    row.onmouseleave = () => row.style.transform = "scale(1)";

    const avatarDiv = document.createElement('div');
    avatarDiv.style.width = "40px"; avatarDiv.style.height = "40px";
    avatarDiv.style.borderRadius = "10px";
    avatarDiv.style.overflow = "hidden";
    avatarDiv.style.background = "rgba(0,0,0,0.3)";
    avatarDiv.style.flexShrink = "0";

    // ðŸ›‘ EL FIX DE LA CABEZA: Buscar de forma segura en cualquier formato
    const headToDraw = (playerData.equipped && playerData.equipped.head)
        ? playerData.equipped.head
        : (playerData.targetHeadId || playerData.headId || 'head_default');

    const safeSprites = window.loadedItemSprites || {};
    const headImgForAvatar = safeSprites[headToDraw] || window.headImg;

    const aCanvas = document.createElement('canvas');
    aCanvas.width = 40; aCanvas.height = 40;
    const aCtx = aCanvas.getContext('2d');
    aCtx.imageSmoothingEnabled = false;

    if (headImgForAvatar && headImgForAvatar.complete) {
        const hH = headImgForAvatar.height / 4;
        const zoom = 40 / 30;
        setTimeout(() => {
            aCtx.drawImage(headImgForAvatar, 0, 0, 48, hH, (40 - (48 * zoom)) / 2, (40 - (hH * zoom)) / 2 + (4 * zoom), 48 * zoom, hH * zoom);
        }, 10);
    }
    avatarDiv.appendChild(aCanvas);

    const textDiv = document.createElement('div');
    textDiv.style.flex = "1"; textDiv.style.display = "flex"; textDiv.style.flexDirection = "column";

    if (inboxData) {
        textDiv.style.overflow = "hidden";
        textDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: ${nameColor}; font-weight: bold; font-family: sans-serif; font-size: 15px;">${escapeHTML(playerData.username)} ${adminBadge}</span>
                        <span style="color: #777; font-family: sans-serif; font-size: 11px;">${formatPMTime(inboxData.time)}</span>
                    </div>
                    <span style="color: #aaa; font-family: sans-serif; font-size: 13px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(inboxData.lastMessage)}</span>
                `;
    } else {
        const statusHtml = playerData.isOnline ? `<span style="color: #2ecc71; font-size: 11px;">â— Online</span>` : `<span style="color: #777; font-size: 11px;">â—‹ Offline</span>`;
        textDiv.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <span style="color: ${nameColor}; font-weight: bold; font-family: sans-serif; font-size: 15px;">${escapeHTML(playerData.username)}</span>
                        ${adminBadge}
                    </div>
                    <div style="margin-top: 4px; font-family: sans-serif;">${statusHtml}</div>
                `;
    }

    row.appendChild(avatarDiv);
    row.appendChild(textDiv);
    row.addEventListener('click', onClickCallback);

    return row;
}

// 1. INBOX MINIMALISTA (OPTIMIZADO CON FRAGMENT)
function renderInbox(inboxData) {
    inboxListContainer.innerHTML = "";
    if (inboxData.length === 0) {
        inboxListContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 14px; margin-top:20px;">No tienes mensajes activos.</div>';
        return;
    }

    // ðŸ“¦ LA CAJA INVISIBLE
    const fragment = document.createDocumentFragment();

    inboxData.forEach(chat => {
        const pData = { username: chat.targetUser, targetHeadId: chat.targetHeadId, role: 'player' };
        const card = createPlayerCard(pData, () => openPMModal(chat.targetAccountId, chat.targetUser), chat);
        fragment.appendChild(card); // Meter a la caja invisible
    });

    // ðŸ’¥ Pegar la caja de golpe a la pantalla
    inboxListContainer.appendChild(fragment);
}

// --- HELPERS PARA AVATARES (AHORA USA CABEZAS DINÃMICAS) ---
function createAvatarCanvas(size = 36, targetAccountId = null) {
    const tCanvas = document.createElement('canvas');
    tCanvas.width = size;
    tCanvas.height = size;
    const tCtx = tCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = false;

    // 1. Buscar quÃ© cabeza tiene equipada el jugador
    let headId = 'head_default';
    if (targetAccountId === player.accountId) {
        headId = player.equipped?.head || 'head_default';
    } else if (targetAccountId) {
        for (let id in otherPlayers) {
            if (otherPlayers[id].accountId === targetAccountId) {
                headId = otherPlayers[id].equipped?.head || 'head_default';
                break;
            }
        }
    }

    // 2. Cargar la imagen del catÃ¡logo
    const safeSprites = window.loadedItemSprites || {};
    const dHead = safeSprites[headId] || headImg;

    // 3. Dibujar la cabeza centrada
    if (dHead && dHead.complete && dHead.naturalWidth > 0) {
        const frameW = FRAME_WIDTH;
        const headFrameH = dHead.height / 4;
        const zoom = size / 30; // Escala dinÃ¡mica segÃºn el tamaÃ±o de la burbuja

        const drawW = frameW * zoom;
        const drawH = headFrameH * zoom;

        tCtx.drawImage(
            dHead,
            0, 0, frameW, headFrameH, // Fila 0 (Mirando al frente)
            (size - drawW) / 2,
            (size - drawH) / 2 + (4 * zoom), // Bajarla un poquito para centrar la cara
            drawW, drawH
        );
    }
    return tCanvas;
}

function formatPMTime(dateString) {
    if (!dateString) return "";
    const d = new Date(dateString);
    // Convierte la fecha del servidor en hora local (ej: "02:15 PM")
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// DIBUJAR LAS BURBUJAS (Con Avatar a un lado y Hora abajo)
function renderPMHistory(history) {
    pmHistoryContainer.innerHTML = "";
    if (history.length === 0) {
        pmHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">No hay mensajes. Â¡Di hola!</div>';
        return;
    }

    history.forEach(msg => {
        const isMe = (msg.senderId === player.accountId);

        // Contenedor invisible para acomodar la burbuja a la izquierda o derecha
        const row = document.createElement('div');
        row.style.width = "100%";
        row.style.display = "flex";
        row.style.justifyContent = isMe ? "flex-end" : "flex-start";
        row.style.alignItems = "flex-end"; // Alinea la burbuja y el avatar por la base
        row.style.gap = "8px";
        row.style.marginBottom = "8px";

        // --- 1. MINI AVATAR ---
        // ðŸ‘‡ EL FIX: Si soy yo, usa mi cabeza. Si es el otro, usa la cabeza que mandÃ³ el server.
        const headToUse = isMe ? (player.equipped?.head || 'head_default') : currentChatTargetHead;
        const avatar = createAvatarCanvas(28, msg.senderId, headToUse);
        avatar.style.borderRadius = "50%"; // Avatar circular para los chats
        avatar.style.background = "rgba(0,0,0,0.3)";
        avatar.style.flexShrink = "0";
        avatar.style.border = "1px solid rgba(255,255,255,0.1)";

        // --- 2. CONTENEDOR DE BURBUJA + HORA ---
        const bubbleGroup = document.createElement('div');
        bubbleGroup.style.display = "flex";
        bubbleGroup.style.flexDirection = "column";
        bubbleGroup.style.maxWidth = "75%"; // Limita el ancho del texto
        bubbleGroup.style.alignItems = isMe ? "flex-end" : "flex-start";

        const bubble = document.createElement('div');
        bubble.style.padding = "10px 14px";
        bubble.style.fontFamily = "sans-serif";
        bubble.style.fontSize = "14px";
        bubble.style.lineHeight = "1.4";
        bubble.style.wordBreak = "break-word";

        if (isMe) {
            bubble.style.background = "#2ecc71";
            bubble.style.color = "black";
            bubble.style.borderRadius = "15px 15px 0 15px";
        } else {
            bubble.style.background = "rgba(255,255,255,0.15)";
            bubble.style.color = "white";
            bubble.style.borderRadius = "15px 15px 15px 0";
        }
        bubble.innerText = msg.text;

        // Hora bajo la burbuja
        const timeSpan = document.createElement('span');
        timeSpan.style.fontSize = "10px";
        timeSpan.style.color = "#777";
        timeSpan.style.marginTop = "4px";
        timeSpan.style.fontFamily = "sans-serif";
        timeSpan.innerText = formatPMTime(msg.timestamp);

        bubbleGroup.appendChild(bubble);
        bubbleGroup.appendChild(timeSpan);

        // Ensamblar la fila: [Burbuja] + [Avatar] si eres tÃº, o [Avatar] + [Burbuja] si es el otro
        if (isMe) {
            row.appendChild(bubbleGroup);
            row.appendChild(avatar);
        } else {
            row.appendChild(avatar);
            row.appendChild(bubbleGroup);
        }

        pmHistoryContainer.appendChild(row);
    });

    pmHistoryContainer.scrollTop = pmHistoryContainer.scrollHeight;
}

// ðŸŸ¢ FUNCIÃ“N MAESTRA DEL BOTÃ“N DE RADIO
function updateSquadChatButton() {
    const btn = document.getElementById('island-squad-chat-btn');
    if (btn) {
        // Si player.squad tiene un ID (no es nulo ni vacÃ­o), muestra el botÃ³n. Si no, lo oculta.
        btn.style.display = (player.squad && player.squad !== "null") ? 'flex' : 'none';
    }
}

// ==========================================
// ðŸŸ¢ LÃ“GICA DEL SQUAD CHAT (RADIO, MENCIONES Y AVATARES)
// ==========================================
const islandSquadChatBtn = document.getElementById('island-squad-chat-btn');
const squadNotifBadge = document.getElementById('squad-notif-badge');

const squadChatModal = document.getElementById('squad-chat-modal');
const closeSquadChatBtn = document.getElementById('close-squad-chat-btn');
const sqChatHistoryContainer = document.getElementById('squad-chat-history-container');
const sqChatInput = document.getElementById('sq-chat-input');
const sqChatSendBtn = document.getElementById('sq-chat-send-btn');
const sqChatHeaderLogo = document.getElementById('sq-chat-header-logo');
const sqChatHeaderName = document.getElementById('sq-chat-header-name');
const sqChatOnlineCount = document.getElementById('sq-chat-online-count');
// --- NUEVO: VARIABLES DEL PANEL DE VOZ ---
const toggleVoicePanelBtn = document.getElementById('toggle-voice-panel-btn');
const squadVoicePanel = document.getElementById('squad-voice-panel');

const closeVoicePanelBtn = document.getElementById('close-voice-panel-btn');
if (closeVoicePanelBtn && squadVoicePanel) {
    closeVoicePanelBtn.addEventListener('click', () => {
        squadVoicePanel.style.opacity = '0';
        squadVoicePanel.style.transform = 'translateX(-40px)';
        
        if (toggleVoicePanelBtn) {
            toggleVoicePanelBtn.style.transform = 'scale(1)';
            const micImg = toggleVoicePanelBtn.querySelector('img');
            if (micImg) micImg.style.filter = 'drop-shadow(0 0 5px rgba(52, 152, 219, 0.8))';
        }
        
        setTimeout(() => {
            if (squadVoicePanel.style.opacity === '0') {
                squadVoicePanel.style.visibility = 'hidden';
            }
        }, 400);
    });
}


if (toggleVoicePanelBtn && squadVoicePanel) {
    toggleVoicePanelBtn.addEventListener('click', () => {
        // En lugar de display none/flex, usamos opacity y transform para animarlo
        if (squadVoicePanel.style.visibility === 'hidden' || squadVoicePanel.style.opacity === '0') {
            
            squadVoicePanel.style.visibility = 'visible';
            squadVoicePanel.style.opacity = '1';
            squadVoicePanel.style.transform = 'translateX(0)';
            
            toggleVoicePanelBtn.style.transform = 'scale(1.2)';
            toggleVoicePanelBtn.querySelector('img').style.filter = 'drop-shadow(0 0 10px #3498db)';
        } else {
            squadVoicePanel.style.opacity = '0';
            squadVoicePanel.style.transform = 'translateX(-40px)';
            
            toggleVoicePanelBtn.style.transform = 'scale(1)';
            toggleVoicePanelBtn.querySelector('img').style.filter = 'drop-shadow(0 0 5px rgba(52, 152, 219, 0.8))';
            
            // Esperar a que termine la animacion para ocultarlo totalmente y no estorbe los clicks
            setTimeout(() => {
                if (squadVoicePanel.style.opacity === '0') {
                    squadVoicePanel.style.visibility = 'hidden';
                }
            }, 400); // 400ms dura la animacion
        }
    });
}
let unreadSquadMessages = 0;
let squadMentionType = 'none'; // ðŸ›‘ NUEVO: Guarda si es personal, everyone, important o none

// FunciÃ³n para contar jugadores del clan en vivo
function updateSquadOnlineCount() {
    if (!player.squad) return;
    let count = 1; // TÃº siempre estÃ¡s conectado
    for (let id in otherPlayers) {
        if (otherPlayers[id].squad === player.squad) count++;
    }
    if (sqChatOnlineCount) sqChatOnlineCount.innerText = `${count} Online`;
}

// Construir Burbujas (Con Avatar, Menciones y Anuncios de Sistema estilo WhatsApp)
function buildSquadChatBubble(msg) {
    // --- ANUNCIO DE SISTEMA ESTILO WHATSAPP (PILL COMPACTO CENTRADO) ---
    if (msg.isSystem || msg.type === 'system' || msg.isAnnouncement || msg.senderId === 'system') {
        const centerRow = document.createElement('div');
        centerRow.style.width = "100%";
        centerRow.style.display = "flex";
        centerRow.style.justifyContent = "center";
        centerRow.style.margin = "4px 0";

        const pill = document.createElement('div');
        pill.style.background = "rgba(18, 22, 28, 0.78)";
        pill.style.backdropFilter = "blur(4px)";
        pill.style.webkitBackdropFilter = "blur(4px)";
        pill.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        pill.style.borderRadius = "10px";
        pill.style.padding = "2px 8px";
        pill.style.fontSize = "9.5px";
        pill.style.fontFamily = "sans-serif";
        pill.style.color = "#c8d6e5";
        pill.style.textAlign = "center";
        pill.style.maxWidth = "82%";
        pill.style.lineHeight = "1.25";
        pill.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";

        let safeText = escapeHTML(msg.text || "");

        // 1. Resaltar nombres de jugadores:
        // El primer @username es quien ejecuta/otorga (en Cyan brillante #54a0ff)
        // El segundo @username es quien recibe (en Oro brillante #f1c40f)
        let mentionIdx = 0;
        safeText = safeText.replace(/@([a-zA-Z0-9_-]+)/g, (match, uname) => {
            mentionIdx++;
            if (mentionIdx === 1) {
                return `<span style="color:#54a0ff; font-weight:bold;">@${uname}</span>`;
            } else {
                return `<span style="color:#f1c40f; font-weight:bold;">@${uname}</span>`;
            }
        });

        // 2. Resaltar atributos y poderes [poder] en color verde esmeralda / tag destacado
        safeText = safeText.replace(/\[(.*?)\]/g, `<span style="color:#2ecc71; font-weight:bold; background:rgba(46,204,113,0.12); padding:1px 4px; border-radius:4px; border:1px solid rgba(46,204,113,0.25);">$1</span>`);

        pill.innerHTML = safeText;
        centerRow.appendChild(pill);
        return centerRow;
    }

    const isMe = (msg.senderId === player.accountId);
    const senderColor = isMe ? "#f1c40f" : getColorForString(msg.senderName);

    const row = document.createElement('div');
    row.style.width = "100%";
    row.style.display = "flex";
    row.style.justifyContent = isMe ? "flex-end" : "flex-start";
    row.style.alignItems = "flex-end"; // Alinear por abajo como WhatsApp
    row.style.gap = "8px";
    row.style.marginBottom = "8px";

    // 1. DIBUJAR EL AVATAR DE QUIEN ENVÃA
    const avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = 28; avatarCanvas.height = 28;
    avatarCanvas.style.borderRadius = "50%";
    avatarCanvas.style.background = "rgba(0,0,0,0.3)";
    avatarCanvas.style.border = "1px solid rgba(255,255,255,0.1)";
    avatarCanvas.style.flexShrink = "0";

    const aCtx = avatarCanvas.getContext('2d');
    aCtx.imageSmoothingEnabled = false;
    const headImg = window.loadedItemSprites[msg.senderHead] || window.headImg;

    if (headImg && headImg.complete) {
        const hH = headImg.height / 4;
        const zoom = 28 / 30; // Escalar al tamaÃ±o de la burbuja
        setTimeout(() => {
            aCtx.imageSmoothingEnabled = false;
            aCtx.drawImage(headImg, 0, 0, 48, hH, (28 - 48 * zoom) / 2, (28 - hH * zoom) / 2 + 4 * zoom, 48 * zoom, hH * zoom);
        }, 10);
    }

    // 2. PARSEAR MENCIONES (@Usuario, @everyone, @important)
    let safeText = escapeHTML(msg.text);

    // A) Resaltar Tags Globales (@everyone, @important) en color ROJO/NARANJA
    safeText = safeText.replace(/@(everyone|important)\b/gi, `<span style="background: rgba(231, 76, 60, 0.4); color: #ff7675; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #e74c3c; box-shadow: 0 0 5px rgba(231,76,60,0.5);">$&</span>`);

    // B) Resaltar mi nombre (@Lero) en color AMARILLO BRILLANTE
    const mentionRegex = new RegExp(`@${player.username}\\b`, 'gi');
    safeText = safeText.replace(mentionRegex, `<span style="background: rgba(241, 196, 15, 0.4); color: #f1c40f; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #f1c40f; box-shadow: 0 0 5px rgba(241,196,15,0.5);">$&</span>`);

    // Si encuentra tu nombre, lo resalta en amarillo brillante dentro del texto
    safeText = safeText.replace(mentionRegex, `<span style="background: rgba(241, 196, 15, 0.4); color: #f1c40f; padding: 2px 5px; border-radius: 6px; font-weight: bold; border: 1px solid #f1c40f;">$&</span>`);

    // 3. ENSAMBLAR LA BURBUJA
    const bubbleGroup = document.createElement('div');
    bubbleGroup.style.display = "flex";
    bubbleGroup.style.flexDirection = "column";
    bubbleGroup.style.maxWidth = "75%";
    bubbleGroup.style.alignItems = isMe ? "flex-end" : "flex-start";

    const div = document.createElement('div');
    div.style.background = isMe ? "rgba(46, 204, 113, 0.15)" : "rgba(255,255,255,0.05)";
    div.style.borderLeft = `3px solid ${senderColor}`;
    div.style.padding = "8px 10px";
    div.style.borderRadius = isMe ? "10px 10px 0 10px" : "10px 10px 10px 0";
    div.style.fontFamily = "sans-serif";

    div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 10px;">
                    <span style="font-weight: bold; font-size: 11px; color: ${senderColor};">${escapeHTML(msg.senderName)}</span>
                </div>
                <div style="color: white; font-size: 13px; line-height: 1.3; word-wrap: break-word;">${safeText}</div>
            `;

    const timeSpan = document.createElement('span');
    timeSpan.style.fontSize = "9px";
    timeSpan.style.color = "#777";
    timeSpan.style.marginTop = "4px";
    timeSpan.style.fontFamily = "sans-serif";
    timeSpan.innerText = formatPMTime(msg.timestamp);

    bubbleGroup.appendChild(div);
    bubbleGroup.appendChild(timeSpan);

    // Si soy yo, avatar a la derecha. Si es otro, avatar a la izquierda.
    if (isMe) {
        row.appendChild(bubbleGroup);
        row.appendChild(avatarCanvas);
    } else {
        row.appendChild(avatarCanvas);
        row.appendChild(bubbleGroup);
    }
    return row;
}

// Abrir Chat
const openSquadChat = (e) => {
    if (e) e.stopPropagation();
    if (!player.squad) return;

    wakeUpIsland(5000);

    unreadSquadMessages = 0;
    squadMentionType = 'none';
    squadNotifBadge.style.display = 'none';

    updateSquadOnlineCount(); // Calcular conectados

    sqChatHeaderName.innerText = player.squadName || "Mi Clan";
    if (player.squadLogo) {
        sqChatHeaderLogo.innerHTML = `<img src="${player.squadLogo}" style="width: 100%; height: 100%; object-fit: cover;">`;
    }

    squadChatModal.style.display = 'flex';
    sqChatHistoryContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 12px; margin-top:20px;">Conectando a la frecuencia...</div>';

    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: 'get_squad_chat' }));
    }

    setTimeout(() => sqChatInput.focus(), 100);
};

if (islandSquadChatBtn) {
    islandSquadChatBtn.addEventListener('mousedown', openSquadChat);
    islandSquadChatBtn.addEventListener('touchstart', openSquadChat, { passive: false });
}

if (closeSquadChatBtn) {
    closeSquadChatBtn.addEventListener('click', () => {
        squadChatModal.style.display = 'none';
    });
}

// Enviar Mensaje
function executeSquadChatSend() {
    const txt = sqChatInput.value.trim();
    if (txt && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: 'send_squad_chat', text: txt }));
        sqChatInput.value = "";
    }
}
if (sqChatSendBtn) sqChatSendBtn.addEventListener('click', executeSquadChatSend);
if (sqChatInput) sqChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSquadChatSend(); });

// ==========================================
// ðŸ§  MOTOR DE AUTOCOMPLETADO DE MENCIONES
// ==========================================
const sqMentionDropdown = document.getElementById('sq-mention-dropdown');

// Vigilar cuando el usuario escribe en el chat
if (sqChatInput) {
    sqChatInput.addEventListener('input', (e) => {
        const val = sqChatInput.value;
        const cursorStart = sqChatInput.selectionStart;

        // Cortar el texto hasta donde estÃ¡ el cursor y buscar si la Ãºltima palabra empieza con @
        const textBeforeCursor = val.substring(0, cursorStart);
        const match = textBeforeCursor.match(/@(\w*)$/); // Busca @ seguido de cualquier letra

        if (match) {
            const searchStr = match[1].toLowerCase();
            showMentionDropdown(searchStr, match.index, cursorStart);
        } else {
            sqMentionDropdown.style.display = 'none';
        }
    });

    // Si el jugador da clic fuera, ocultar el menÃº con un micro-retraso para permitir el clic
    sqChatInput.addEventListener('blur', () => {
        setTimeout(() => { sqMentionDropdown.style.display = 'none'; }, 200);
    });
}

// Construir y Mostrar la Lista DinÃ¡mica
function showMentionDropdown(searchStr, startIndex, endIndex) {
    sqMentionDropdown.innerHTML = '';

    // 1. Tags Globales del Sistema
    let candidates = [
        { name: 'everyone', color: '#e74c3c', desc: 'Notifica a todos', icon: 'ðŸ“¢' },
        { name: 'important', color: '#f39c12', desc: 'Aviso urgente', icon: 'âš ï¸' }
    ];

    // 2. Jugadores del Clan Online (Escaneando tu mapa local)
    if (player.squad) {
        for (let id in otherPlayers) {
            if (otherPlayers[id].squad === player.squad) {
                candidates.push({
                    name: otherPlayers[id].username,
                    color: '#3498db',
                    desc: 'Online',
                    icon: 'ðŸŸ¢'
                });
            }
        }
    }

    // 3. Filtrar segÃºn lo que escribiÃ³ el usuario (ej: "@lu" muestra a "Luis")
    const filtered = candidates.filter(c => c.name.toLowerCase().includes(searchStr));

    if (filtered.length === 0) {
        sqMentionDropdown.style.display = 'none';
        return;
    }

    // 4. Dibujar la lista
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = "10px 15px";
        item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.cursor = "pointer";
        item.style.fontFamily = "sans-serif";

        // Efecto Hover
        item.onmouseenter = () => item.style.background = "rgba(255,255,255,0.1)";
        item.onmouseleave = () => item.style.background = "transparent";

        item.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:14px;">${c.icon}</span>
                        <span style="color:white; font-weight:bold; font-size:14px;">@${c.name}</span>
                    </div>
                    <span style="color:#777; font-size:10px; font-weight:bold;">${c.desc}</span>
                `;

        // AcciÃ³n al dar clic (Inyectar el nombre al input)
        item.onmousedown = (e) => {
            e.preventDefault(); // Evita perder el foco
            const val = sqChatInput.value;
            const textBefore = val.substring(0, startIndex);
            const textAfter = val.substring(endIndex);

            // Ensamblar texto (Agregamos un espacio al final para seguir escribiendo)
            sqChatInput.value = textBefore + '@' + c.name + ' ' + textAfter;
            sqMentionDropdown.style.display = 'none';
            sqChatInput.focus();
        };

        sqMentionDropdown.appendChild(item);
    });

    sqMentionDropdown.style.display = 'flex';
}


// --- LÃ“GICA DE LAS PESTAÃ‘AS DEL MODAL SOCIAL ---
const frTabBtns = document.querySelectorAll('.fr-tab-btn');
const frTabContents = document.querySelectorAll('.fr-tab-content');

frTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        frTabBtns.forEach(b => {
            b.style.background = 'transparent';
            b.style.borderBottomColor = 'transparent';
            b.style.color = '#aaa';
            b.style.fontWeight = 'normal';
        });
        frTabContents.forEach(c => c.style.display = 'none');

        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.borderBottomColor = '#3498db';
        btn.style.color = 'white';
        btn.style.fontWeight = 'bold';

        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).style.display = 'flex';
    });
});

// --- LÃ“GICA DE LA BÃšSQUEDA GLOBAL ---
const searchPlayersInput = document.getElementById('search-players-input');
const searchResultsContainer = document.getElementById('search-results-container');
let searchTimeout = null;

if (searchPlayersInput) {
    searchPlayersInput.addEventListener('input', (e) => {
        const text = e.target.value;
        if (searchTimeout) clearTimeout(searchTimeout);

        if (text.length >= 3) {
            searchResultsContainer.innerHTML = '<div style="text-align:center; color:#aaa; font-size: 13px; margin-top:10px;">Buscando...</div>';
            // Esperamos medio segundo despuÃ©s de que deje de escribir para no hacer spam al servidor
            searchTimeout = setTimeout(() => {
                if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'search_players', query: text }));
                }
            }, 500);
        } else {
            searchResultsContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 13px; margin-top:10px; font-style: italic;">Ingresa al menos 3 letras.</div>';
        }
    });
}

// 3. BUSCADOR GLOBAL MINIMALISTA
function renderSearchResults(results) {
    searchResultsContainer.innerHTML = "";
    if (results.length === 0) {
        searchResultsContainer.innerHTML = '<div style="text-align:center; color:#e74c3c; font-size: 13px; margin-top:10px;">No se encontrÃ³ a nadie con ese nombre.</div>';
        return;
    }

    results.forEach(res => {
        let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === res.accountId);
        if (res.accountId === player.accountId) onlineId = 'self';

        if (onlineId && onlineId !== 'self' && otherPlayers[onlineId].equipped) {
            res.equipped = otherPlayers[onlineId].equipped;
        } else if (onlineId === 'self') {
            res.equipped = player.equipped;
        }

        res.isOnline = !!onlineId;
        const card = createPlayerCard(res, () => {
            lastProfileSource = 'friends'; // ðŸ’¾ Â¡AÃ‘ADE ESTA LÃNEA AQUÃ TAMBIÃ‰N!
            document.getElementById('friends-modal').style.display = 'none';
            if (onlineId && onlineId !== 'offline') openProfile(onlineId, res.username, res);
            else {
                offlineFriendAccountId = res.accountId;
                openProfile('offline', res.username, res);
            }
        });
        searchResultsContainer.appendChild(card);
    });
}

// --- LÃ“GICA DE LA APP DE AMIGOS ---
const appFriends = document.getElementById('app-friends');
const friendsModal = document.getElementById('friends-modal');
const closeFriendsModal = document.getElementById('close-friends-modal');
const friendsListContainer = document.getElementById('friends-list-container');

let offlineFriendAccountId = null; // Memoria temporal para poder enviarle PMs a alguien offline

// Abrir la app desde el MenÃº
appFriends.addEventListener('click', () => {
    hideTrayForModal();
    friendsListContainer.innerHTML = '<div style="text-align:center; color:#777; font-size: 14px; margin-top:20px;">Cargando amigos...</div>';
    friendsModal.style.display = 'flex';

    // Le pedimos al servidor nuestra lista fresca
    ws.send(MessagePack.encode({ type: 'get_friends_list' }));
});

closeFriendsModal.addEventListener('click', () => {
    friendsModal.style.display = 'none';
    restoreTrayAfterModal();
});

// 2. LISTA DE AMIGOS MINIMALISTA (OPTIMIZADO CON FRAGMENT)
function renderFriendsList(friendsData) {
    const container = document.getElementById('friends-list-container');
    if (!container) return;
    container.innerHTML = "";

    if (friendsData.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#777; font-size: 13px; margin-top:20px; font-style:italic;">Tu lista de amigos estÃ¡ vacÃ­a.</div>';
        return;
    }

    // ðŸ“¦ LA CAJA INVISIBLE
    const fragment = document.createDocumentFragment();

    friendsData.forEach(friend => {
        let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === friend.accountId);

        if (onlineId && otherPlayers[onlineId].equipped) {
            friend.equipped = otherPlayers[onlineId].equipped;
        }

        friend.isOnline = !!onlineId;
        const card = createPlayerCard(friend, () => {
            lastProfileSource = 'friends';
            document.getElementById('friends-modal').style.display = 'none';
            if (onlineId) openProfile(onlineId, friend.username, friend);
            else openProfile('offline', friend.username, friend);
        });
        fragment.appendChild(card); // Meter a la caja invisible
    });

    // ðŸ’¥ Pegar la caja de golpe a la pantalla
    container.appendChild(fragment);
}

// --- LÃ“GICA DE SQUADS (FRONTEND) ---
const openSquadsBtn = document.getElementById('open-squads-btn');
const squadMainModal = document.getElementById('squad-main-modal');
const closeSquadMain = document.getElementById('close-squad-main');

const btnCreateSquad = document.getElementById('btn-create-squad');
const squadCreateModal = document.getElementById('squad-create-modal');
const closeCreateSquad = document.getElementById('close-create-squad');
const confirmCreateSquad = document.getElementById('confirm-create-squad');
const newSquadNameInput = document.getElementById('new-squad-name');
const squadCreateMsg = document.getElementById('squad-create-msg');

// --- LÃ“GICA DEL LEADERBOARD ---
const btnSquadLeaderboard = document.getElementById('btn-squad-leaderboard');
const leaderboardModal = document.getElementById('leaderboard-modal');
const closeLeaderboardModal = document.getElementById('close-leaderboard-modal');
const lbTabBtns = document.querySelectorAll('.lb-tab-btn');
const leaderboardContent = document.getElementById('leaderboard-content');

let currentLeaderboardData = { squads: [], liveBases: [] };
let activeLbTab = 'live';

// 1. Abrir Modal y pedir datos al servidor
if (btnSquadLeaderboard) {
    btnSquadLeaderboard.addEventListener('click', () => {
        squadMainModal.style.display = 'none';
        leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Cargando clasificaciones...</div>';
        leaderboardModal.style.display = 'flex';
        ws.send(MessagePack.encode({ type: 'get_squad_leaderboard' }));
    });
}

if (closeLeaderboardModal) {
    closeLeaderboardModal.addEventListener('click', () => {
        leaderboardModal.style.display = 'none';
        squadMainModal.style.display = 'flex'; // Volver al menÃº de Squads
    });
}

// 2. LÃ³gica de PestaÃ±as
lbTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        lbTabBtns.forEach(b => {
            b.style.background = 'transparent';
            b.style.borderBottomColor = 'transparent';
            b.style.color = '#aaa';
            b.style.fontWeight = 'normal';
        });

        btn.style.background = 'rgba(241, 196, 15, 0.1)';
        btn.style.borderBottomColor = '#f1c40f';
        btn.style.color = '#f1c40f';
        btn.style.fontWeight = 'bold';

        activeLbTab = btn.getAttribute('data-target');
        renderLeaderboard(); // Redibujar con la nueva categorÃ­a
    });
});

// 3. Renderizador Maestro de Clasificaciones
function renderLeaderboard() {
    leaderboardContent.innerHTML = "";

    // --- PESTAÃ‘A: EN VIVO (ESTADO DE LAS BASES) ---
    if (activeLbTab === 'live') {
        if (currentLeaderboardData.liveBases.length === 0) {
            leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">No hay bases activas en el servidor.</div>';
            return;
        }

        currentLeaderboardData.liveBases.forEach(base => {
            const hpPct = Math.max(0, base.hp / base.maxHp) * 100;
            const hpColor = hpPct > 50 ? '#2ecc71' : hpPct > 20 ? '#f1c40f' : '#e74c3c';

            const logoHtml = base.ownerLogo
                ? `<img src="${base.ownerLogo}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);">`
                : `<div style="width: 40px; height: 40px; background: rgba(0,0,0,0.5); border-radius: 8px; display: flex; justify-content: center; align-items: center; font-size: 20px;">ðŸ´â€â˜ ï¸</div>`;

            leaderboardContent.innerHTML += `
                        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 15px;">
                            <div style="color: #3498db; font-weight: bold; font-size: 16px; margin-bottom: 10px;">ðŸ° ${base.name}</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                ${logoHtml}
                                <div style="flex: 1;">
                                    <div style="color: #f1c40f; font-weight: bold; font-size: 15px; margin-bottom: 4px;">ðŸ‘‘ ${base.owner}</div>
                                    <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden;">
                                        <div style="width: ${hpPct}%; height: 100%; background: ${hpColor};"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
        });
        return;
    }

    // --- PESTAÃ‘AS: DIARIO, SEMANAL, HISTÃ“RICO ---
    // Decidir quÃ© campo de la base de datos usar para ordenar
    let sortField = 'territoryTimeMinutes';
    if (activeLbTab === 'daily') sortField = 'dailyTimeMinutes';
    if (activeLbTab === 'weekly') sortField = 'weeklyTimeMinutes';

    // Clonar y ordenar el array de mayor a menor
    let sortedSquads = [...currentLeaderboardData.squads].sort((a, b) => b[sortField] - a[sortField]);

    // Filtrar los que tienen 0 minutos para que no aparezca basura
    sortedSquads = sortedSquads.filter(sq => sq[sortField] > 0);

    if (sortedSquads.length === 0) {
        leaderboardContent.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Nadie ha puntuado en esta categorÃ­a aÃºn.</div>';
        return;
    }

    sortedSquads.forEach((sq, index) => {
        let rankColor = "rgba(255,255,255,0.1)";
        let rankText = `#${index + 1}`;
        if (index === 0) { rankColor = "rgba(241, 196, 15, 0.2)"; rankText = "ðŸ¥‡ 1"; }
        else if (index === 1) { rankColor = "rgba(189, 195, 199, 0.2)"; rankText = "ðŸ¥ˆ 2"; }
        else if (index === 2) { rankColor = "rgba(211, 84, 0, 0.2)"; rankText = "ðŸ¥‰ 3"; }

        const logoHtml = sq.logo ? `<img src="${sq.logo}" style="width: 36px; height: 36px; border-radius: 8px; object-fit: cover;">` : `ðŸ´â€â˜ ï¸`;

        // Creamos el elemento en lugar de usar += para poder aÃ±adirle el onclick
        const row = document.createElement('div');
        row.style.cssText = `background: rgba(255,255,255,0.05); border: 1px solid ${rankColor}; border-radius: 8px; padding: 10px 15px; display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 8px;`;
        row.innerHTML = `
                    <div style="width: 30px; font-weight: bold; color: ${index < 3 ? '#fff' : '#888'}; font-size: 14px;">${rankText}</div>
                    ${logoHtml}
                    <div style="flex: 1; font-weight: bold; color: white; font-size: 15px;">${escapeHTML(sq.name)}</div>
                    <div style="color: #2ecc71; font-family: monospace; font-weight: bold; font-size: 14px;">${sq[sortField]} min</div>
                `;

        // (dentro de renderLeaderboard)
        row.onclick = () => {
            lastSquadMenu = 'leaderboard';
            leaderboardModal.style.display = 'none';
            // ðŸ›‘ EL FIX: Pantalla de carga instantÃ¡nea
            document.getElementById('my-squad-title').innerText = "Cargando...";
            document.getElementById('squad-members-list').innerHTML = "";
            document.getElementById('my-squad-modal').style.display = 'flex';

            ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq._id }));
        };
        leaderboardContent.appendChild(row);
    });
}

// --- LÃ“GICA DE BÃšSQUEDA DE SQUADS ---
const btnOpenSearch = document.getElementById('btn-search-squads');
const searchModal = document.getElementById('squad-search-modal');
const closeSearchBtn = document.getElementById('close-search-squads');
const searchInput = document.getElementById('search-squads-input');
const resultsContainer = document.getElementById('squad-search-results-container');

// Abrir el buscador y cargar la lista inicial (vacÃ­a = todos)
btnOpenSearch.onclick = () => {
    document.getElementById('squad-main-modal').style.display = 'none';
    searchModal.style.display = 'flex';
    ws.send(MessagePack.encode({ type: 'search_squads', query: "" }));
};

closeSearchBtn.onclick = () => {
    searchModal.style.display = 'none';
    document.getElementById('squad-main-modal').style.display = 'flex';
};

// BÃºsqueda en tiempo real al escribir
searchInput.oninput = (e) => {
    ws.send(MessagePack.encode({ type: 'search_squads', query: e.target.value }));
};

function renderSquadSearchResults(results) {
    resultsContainer.innerHTML = "";

    if (results.length === 0) {
        resultsContainer.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">No se encontraron clanes.</div>';
        return;
    }

    results.forEach(sq => {
        const row = document.createElement('div');
        row.style.background = "rgba(255,255,255,0.05)";
        row.style.border = "1px solid rgba(255,255,255,0.1)";
        row.style.borderRadius = "10px";
        row.style.padding = "12px";
        row.style.cursor = "pointer";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "12px";

        const logoHtml = sq.logo
            ? `<img src="${sq.logo}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">`
            : `<div style="width: 40px; height: 40px; background: rgba(255,255,255,0.1); border-radius: 8px; display: flex; justify-content: center; align-items: center;">ðŸ´â€â˜ ï¸</div>`;

        row.innerHTML = `
            ${logoHtml}
            <div style="flex: 1;">
                <div style="color: #f1c40f; font-weight: bold; font-size: 15px;">${escapeHTML(sq.name)}</div>
                <div style="color: #777; font-size: 11px;">${sq.memberCount} miembros | ${sq.infamia} min</div>
            </div>
            <span style="color: #555;">âž”</span>
        `;

        // (dentro de renderSquadSearchResults)
        row.onclick = () => {
            lastSquadMenu = 'search';
            document.getElementById('squad-search-modal').style.display = 'none';
            // ðŸ›‘ EL FIX: Pantalla de carga instantÃ¡nea
            document.getElementById('my-squad-title').innerText = "Cargando...";
            document.getElementById('squad-members-list').innerHTML = "";
            document.getElementById('my-squad-modal').style.display = 'flex';

            ws.send(MessagePack.encode({ type: 'get_squad_details', squadId: sq.id }));
        };

        resultsContainer.appendChild(row);
    });
}

// --- VARIABLES DE SQUADS (LISTA Y DETALLES) ---
let lastSquadMenu = 'main';
const btnMySquads = document.getElementById('btn-my-squads');
const squadListModal = document.getElementById('squad-list-modal');
const squadsListContainer = document.getElementById('squads-list-container');
const backToSquadMain = document.getElementById('back-to-squad-main');

const mySquadModal = document.getElementById('my-squad-modal');
const closeMySquad = document.getElementById('close-my-squad');
const mySquadTitle = document.getElementById('my-squad-title');
const mySquadMemberCount = document.getElementById('my-squad-member-count');
const squadMembersList = document.getElementById('squad-members-list');

// 1. Clic en "Mis Squads" -> Pide la LISTA
btnMySquads.addEventListener('click', () => {
    squadMainModal.style.display = 'none';
    // ðŸ›‘ EL FIX: Pantalla de carga instantÃ¡nea
    squadsListContainer.innerHTML = '<div style="text-align:center; color:#777; margin-top:20px;">Cargando...</div>';
    squadListModal.style.display = 'flex';
    ws.send(MessagePack.encode({ type: 'get_my_squads_list' }));
});

// 2. BotÃ³n AtrÃ¡s de la lista
backToSquadMain.addEventListener('click', () => {
    squadListModal.style.display = 'none';
    squadMainModal.style.display = 'flex';
});

// 3. Cerrar el modal de detalles
function resetSquadHeaderState() {
    const infoPanel = document.getElementById('my-squad-info-panel');
    if (infoPanel) infoPanel.classList.remove('squad-header-compact');
    const container = document.getElementById('squad-members-list');
    if (container) container.scrollTop = 0;
}

closeMySquad.addEventListener('click', () => {
    mySquadModal.style.display = 'none';
    resetSquadHeaderState();

    if (lastSquadMenu === 'search') {
        document.getElementById('squad-search-modal').style.display = 'flex';
    } else if (lastSquadMenu === 'list') {
        squadListModal.style.display = 'flex';
    } else if (lastSquadMenu === 'leaderboard') {
        // ðŸ›‘ EL FIX: Regresar al Leaderboard
        document.getElementById('leaderboard-modal').style.display = 'flex';
    } else {
        squadMainModal.style.display = 'flex';
    }
});

// --- CONTROLADOR DE ENCABEZADO COLAPSABLE EN MÃ“VIL ---
const squadMembersListScrollEl = document.getElementById('squad-members-list');
if (squadMembersListScrollEl) {
    squadMembersListScrollEl.addEventListener('scroll', () => {
        const infoPanel = document.getElementById('my-squad-info-panel');
        if (!infoPanel) return;
        const st = squadMembersListScrollEl.scrollTop;
        if (st > 18) {
            if (!infoPanel.classList.contains('squad-header-compact')) {
                infoPanel.classList.add('squad-header-compact');
            }
        } else if (st < 6) {
            if (infoPanel.classList.contains('squad-header-compact')) {
                infoPanel.classList.remove('squad-header-compact');
            }
        }
    }, { passive: true });
}

// =========================================================
// --- ðŸ›¡ï¸  DIBUJAR CUADRÃ CULA DE MIEMBROS DEL SQUAD ---
// =========================================================
function renderSquadGrid(sq) {
    const container = document.getElementById('squad-members-list');
    if (!container) return;
    container.innerHTML = '';
    resetSquadHeaderState();

    container.style.gridTemplateColumns = 'repeat(5, 1fr)';
    container.style.gap = '4px';

    const safeSprites = window.loadedItemSprites || {};
    const defaultHead = window.headImg;

    const allMembers = [
        { ...sq.leader, isLeader: true, title: "ðŸ‘‘ LÃ­der" },
        ...sq.members
    ];

    // ðŸ“¦ LA CAJA INVISIBLE
    const fragment = document.createDocumentFragment();

    allMembers.forEach(member => {
        const card = document.createElement('div');
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.width = '100%';
        card.style.minWidth = '0';
        card.style.gap = '2px';

        const canvas = document.createElement('canvas');
        canvas.width = 144;
        canvas.height = 144;
        canvas.style.width = '100%';
        canvas.style.maxWidth = '65px';
        canvas.style.aspectRatio = '1 / 1';
        canvas.style.background = 'transparent';
        canvas.style.border = 'none';
        canvas.style.imageRendering = 'pixelated';

        const nameLabel = document.createElement('span');
        nameLabel.innerText = member.name || member.username || "Desconocido";

        if (member.isLeader) {
            nameLabel.style.color = '#f1c40f';
            nameLabel.style.fontWeight = 'bold';
            canvas.style.filter = 'drop-shadow(0 0 5px rgba(241, 196, 15, 0.5))';
        } else {
            nameLabel.style.color = 'white';
            nameLabel.style.fontWeight = 'normal';
            canvas.style.filter = 'none';
        }

        nameLabel.style.fontSize = '9px';
        nameLabel.style.fontFamily = 'sans-serif';
        nameLabel.style.width = '100%';
        nameLabel.style.textAlign = 'center';
        nameLabel.style.whiteSpace = 'nowrap';
        nameLabel.style.overflow = 'hidden';
        nameLabel.style.textOverflow = 'ellipsis';

        card.appendChild(canvas);
        card.appendChild(nameLabel);

        // ðŸ”¥ En lugar de mandarlo al DOM real, lo metemos al Fragment
        fragment.appendChild(card);

        const ctx = canvas.getContext('2d');
        let headId = 'head_default';

        if (member.equipped && member.equipped.head) {
            headId = member.equipped.head;
        } else if (member.head) {
            headId = member.head;
        }

        if (member.name === player.username || member.accountId === player.accountId) {
            headId = player.equipped?.head || 'head_default';
        }

        const hImg = safeSprites[headId] || defaultHead;

        const drawHead = (img) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;
            const sourceX = 12;
            const sourceY = 12;
            const cropSize = 24;
            ctx.drawImage(img, sourceX, sourceY, cropSize, cropSize, 0, 0, 144, 144);
        };

        if (hImg && hImg.complete && hImg.naturalWidth > 0) {
            drawHead(hImg);
        } else if (hImg) {
            hImg.addEventListener('load', () => drawHead(hImg), { once: true });
        }

        card.style.cursor = 'pointer';
        card.onclick = () => {
            const isLeader = (sq.leader && (sq.leader.id === player.accountId || sq.leader.accountId === player.accountId || sq.leader.name === player.username));
            const isMember = isLeader || (sq.members && sq.members.some(m => (m.accountId && m.accountId === player.accountId) || (m.name && m.name === player.username)));

            if (!isMember) {
                lastProfileSource = 'squad';
                document.getElementById('my-squad-modal').style.display = 'none';
                if (member.accountId === player.accountId || member.name === player.username) {
                    openProfile('self', player.username);
                } else {
                    let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === member.accountId);
                    if (onlineId) openProfile(onlineId, nameLabel.innerText, member);
                    else openProfile('offline', nameLabel.innerText, member);
                }
            } else {
                openSquadMemberModal(member, sq);
            }
        };
    });

    // ðŸ’¥ Pegar la cuadrÃ­cula entera con sus 25 cabezas de 1 solo golpe
    container.appendChild(fragment);
}
function createSquadMemberRow(name, title, isLeader) {
    const row = document.createElement('div');
    row.style.background = isLeader ? "rgba(241, 196, 15, 0.1)" : "rgba(255,255,255,0.05)";
    row.style.border = isLeader ? "1px solid rgba(241, 196, 15, 0.3)" : "1px solid rgba(255,255,255,0.1)";
    row.style.padding = "12px 15px";
    row.style.borderRadius = "10px";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const nameSpan = document.createElement('span');
    nameSpan.style.color = isLeader ? "#f1c40f" : "white";
    nameSpan.style.fontWeight = "bold";
    nameSpan.style.fontFamily = "sans-serif";
    nameSpan.innerText = name;

    const titleSpan = document.createElement('span');
    titleSpan.style.color = isLeader ? "#f39c12" : "#3498db";
    titleSpan.style.fontSize = "12px";
    titleSpan.style.fontFamily = "sans-serif";
    titleSpan.style.background = "rgba(0,0,0,0.5)";
    titleSpan.style.padding = "4px 8px";
    titleSpan.style.borderRadius = "6px";
    titleSpan.innerText = title;

    row.appendChild(nameSpan);
    row.appendChild(titleSpan);
    return row;
}

// Abrir/Cerrar Menú Principal
if (openSquadsBtn) {
    openSquadsBtn.addEventListener('click', () => {
        hideTrayForModal();
        squadMainModal.style.display = 'flex';
        player.vx = 0; player.vy = 0; player.isMoving = false;
    });
}
if (closeSquadMain) closeSquadMain.addEventListener('click', () => {
    squadMainModal.style.display = 'none';
    restoreTrayAfterModal();
});

// Abrir/Cerrar Ventana de "Crear"
btnCreateSquad.addEventListener('click', () => {
    squadMainModal.style.display = 'none';
    squadCreateModal.style.display = 'flex';
    squadCreateMsg.innerText = ""; // Limpiar errores pasados
    newSquadNameInput.value = "";
    const logoInput = document.getElementById('new-squad-logo');
    if (logoInput) logoInput.value = "";
    const previewName = document.getElementById('create-squad-name-preview');
    if (previewName) previewName.innerText = "Tu Clan";
    const previewLogo = document.getElementById('create-squad-logo-preview');
    if (previewLogo) previewLogo.innerHTML = "🏴‍☠️";
});

// Live Preview para Crear Squad
if (newSquadNameInput) {
    newSquadNameInput.addEventListener('input', (e) => {
        const previewName = document.getElementById('create-squad-name-preview');
        if (previewName) {
            previewName.innerText = e.target.value.trim() || "Tu Clan";
        }
    });
}

const newSquadLogoInput = document.getElementById('new-squad-logo');
if (newSquadLogoInput) {
    newSquadLogoInput.addEventListener('input', (e) => {
        const previewLogo = document.getElementById('create-squad-logo-preview');
        if (previewLogo) {
            const url = e.target.value.trim();
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
                previewLogo.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='🏴‍☠️';">`;
            } else {
                previewLogo.innerHTML = "🏴‍☠️";
            }
        }
    });
}

// Cerrar Ventana de "Crear" y regresar al Menú Principal
closeCreateSquad.addEventListener('click', () => {
    squadCreateModal.style.display = 'none';
    squadMainModal.style.display = 'flex';
});

// Botón de Confirmar Creación
confirmCreateSquad.addEventListener('click', () => {
    const squadName = newSquadNameInput.value.trim();
    const squadLogo = document.getElementById('new-squad-logo').value.trim();
    if (squadName.length < 3) {
        squadCreateMsg.style.color = "#ff6b6b";
        squadCreateMsg.innerText = "El nombre es muy corto.";
        return;
    }
    confirmCreateSquad.innerText = "Creando...";
    ws.send(MessagePack.encode({ type: 'create_squad', squadName: squadName, logo: squadLogo }));
});

// --- LÓGICA DE EDITAR SQUAD ---
const squadEditModal = document.getElementById('squad-edit-modal');
const closeEditSquad = document.getElementById('close-edit-squad');
const confirmEditSquad = document.getElementById('confirm-edit-squad');
const editSquadNameInput = document.getElementById('edit-squad-name');
const editSquadLogoInput = document.getElementById('edit-squad-logo');
const squadEditMsg = document.getElementById('squad-edit-msg');
let currentEditSquadId = null;
let originalSquadName = ""; // Para saber si le cobramos o no

if (closeEditSquad) {
    closeEditSquad.addEventListener('click', () => {
        squadEditModal.style.display = 'none';
        mySquadModal.style.display = 'flex';
    });
}

// Live Preview para Editar Squad
if (editSquadNameInput) {
    editSquadNameInput.addEventListener('input', (e) => {
        const previewName = document.getElementById('edit-squad-name-preview');
        if (previewName) {
            previewName.innerText = e.target.value.trim() || originalSquadName || "Nombre";
        }
        if (editSquadNameInput.value.trim() !== originalSquadName) {
            confirmEditSquad.innerText = "Guardar Cambios (Cuesta 350 🪙)";
        } else {
            confirmEditSquad.innerText = "Guardar Logo (Gratis)";
        }
    });
}

if (editSquadLogoInput) {
    editSquadLogoInput.addEventListener('input', (e) => {
        const previewLogo = document.getElementById('edit-squad-logo-preview');
        if (previewLogo) {
            const url = e.target.value.trim();
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
                previewLogo.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='🏴‍☠️';">`;
            } else {
                previewLogo.innerHTML = "🏴‍☠️";
            }
        }
    });
}

if (confirmEditSquad) {
    confirmEditSquad.addEventListener('click', () => {
        confirmEditSquad.innerText = "Procesando...";
        ws.send(MessagePack.encode({
            type: 'edit_squad',
            squadId: currentEditSquadId,
            newName: editSquadNameInput.value.trim(),
            newLogo: editSquadLogoInput.value.trim()
        }));
    });
}

// Atajo ESC para navegación rápida en Squads
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const chatInput = document.getElementById('chat-input');
        if (document.activeElement === chatInput) return;

        if (squadMemberModal && squadMemberModal.style.display === 'flex') {
            const btn = document.getElementById('close-squad-member');
            if (btn) btn.click();
            return;
        }
        if (squadEditModal && squadEditModal.style.display === 'flex') {
            if (closeEditSquad) closeEditSquad.click();
            return;
        }
        if (squadCreateModal && squadCreateModal.style.display === 'flex') {
            if (closeCreateSquad) closeCreateSquad.click();
            return;
        }
        if (mySquadModal && mySquadModal.style.display === 'flex') {
            if (closeMySquad) closeMySquad.click();
            return;
        }
        if (squadListModal && squadListModal.style.display === 'flex') {
            if (backToSquadMain) backToSquadMain.click();
            return;
        }
        const searchModalEl = document.getElementById('squad-search-modal');
        if (searchModalEl && searchModalEl.style.display === 'flex') {
            const btn = document.getElementById('close-search-squads');
            if (btn) btn.click();
            return;
        }
        if (leaderboardModal && leaderboardModal.style.display === 'flex') {
            if (closeLeaderboardModal) closeLeaderboardModal.click();
            return;
        }
        if (squadMainModal && squadMainModal.style.display === 'flex') {
            if (closeSquadMain) closeSquadMain.click();
            return;
        }
    }
});

let currentEditingMember = null;
let currentEditingSquad = null;
const squadMemberModal = document.getElementById('squad-member-modal');

function openSquadMemberModal(member, squad) {
    currentEditingMember = member; // Guardamos TODO el objeto del miembro
    currentEditingSquad = squad || window.mySquadData;

    const leaderAccountId = squad && squad.leader ? (squad.leader.accountId || squad.leader.id || squad.leader._id) : null;
    const amILeader = (leaderAccountId && player && (leaderAccountId.toString() === (player.accountId || '').toString())) ||
        (squad && squad.leader && player && squad.leader.name === player.username) ||
        (player && player.isLeader && player.squad && squad && (player.squad === squad.id || player.squad === squad._id));
    let myMemberData = squad && squad.members ? squad.members.find(m => (player && m.accountId && m.accountId.toString() === (player.accountId || '').toString()) || (player && m.name && m.name === player.username)) : null;
    const iCanAssignRoles = amILeader || (player && player.squadCanAssignRoles) || (myMemberData && myMemberData.canAssignRoles);
    const iCanKick = amILeader || (player && player.squadCanKick) || (myMemberData && myMemberData.canKick);

    document.getElementById('sm-name').innerText = member.name || member.username || "Desconocido";
    // ✅ EL FIX CORRECTO (Usando tu Catálogo Maestro):
    const headId = (member.equipped && member.equipped.head) ? member.equipped.head : 'head_default';
    const canvas = document.getElementById('sm-head-canvas');
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Extraer la imagen precargada en la RAM del juego
    const safeSprites = window.loadedItemSprites || {};
    const hImg = safeSprites[headId] || window.headImg;

    const drawHead = (img) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        // El recorte maestro (Igual que en la cuadrícula del Squad)
        const sourceX = 12;
        const sourceY = 12;
        const cropSize = 24;

        // Dibujamos el recorte ocupando los 64x64 píxeles del Canvas
        ctx.drawImage(
            img,
            sourceX, sourceY, cropSize, cropSize,
            0, 0, 64, 64
        );
    };

    // Dibujar si ya descargó, o esperar a que cargue
    if (hImg && hImg.complete && hImg.naturalWidth > 0) {
        drawHead(hImg);
    } else if (hImg) {
        hImg.addEventListener('load', () => drawHead(hImg), { once: true });
    }
    const titleInput = document.getElementById('sm-title');
    const chkInvite = document.getElementById('sm-can-invite');
    const chkKick = document.getElementById('sm-can-kick');
    const chkAssign = document.getElementById('sm-can-assign');
    const kickBtn = document.getElementById('sm-kick-btn');

    // 1. Cargar datos
    titleInput.value = member.title || "Miembro";
    chkInvite.checked = !!member.canInvite;
    chkKick.checked = !!member.canKick;
    chkAssign.checked = !!member.canAssignRoles;

    // Guardar snapshot de estado ya sincronizado para evitar disparos dobles
    member._savedTitle = (member.title || "Miembro").trim();
    member._savedInvite = !!member.canInvite;
    member._savedKick = !!member.canKick;
    member._savedAssign = !!member.canAssignRoles;

    // 2. Bloquear inputs si no tengo permisos o si es el líder
    const isEditingLeader = member.isLeader || (leaderAccountId && leaderAccountId === member.accountId);
    const canIEditThisPerson = iCanAssignRoles && !isEditingLeader;

    titleInput.disabled = !canIEditThisPerson;
    chkInvite.disabled = !canIEditThisPerson;
    chkKick.disabled = !canIEditThisPerson;
    chkAssign.disabled = !canIEditThisPerson;

    // 3. Botón de Expulsar
    kickBtn.style.display = (iCanKick && !isEditingLeader && member.accountId !== player.accountId) ? 'block' : 'none';

    squadMemberModal.style.display = 'flex';
}

// ==========================================
// 💾 FUNCIÓN DE AUTO-GUARDADO CON DEBOUNCE (APILAMIENTO DE CAMBIOS)
// ==========================================
let squadMemberAutoSaveTimeout = null;

function triggerAutoSaveSquadMember() {
    if (!currentEditingMember || squadMemberModal.style.display === 'none') return;

    // 1. Actualizar memoria local en RAM al instante para fluidez en la interfaz
    const titleVal = document.getElementById('sm-title').value.trim();
    const canInviteVal = document.getElementById('sm-can-invite').checked;
    const canKickVal = document.getElementById('sm-can-kick').checked;
    const canAssignVal = document.getElementById('sm-can-assign').checked;

    currentEditingMember.title = titleVal;
    currentEditingMember.canInvite = canInviteVal;
    currentEditingMember.canKick = canKickVal;
    currentEditingMember.canAssignRoles = canAssignVal;

    if (window.mySquadData && window.mySquadData.members) {
        const localMem = window.mySquadData.members.find(m => m.accountId === currentEditingMember.accountId);
        if (localMem) {
            localMem.title = titleVal;
            localMem.canInvite = canInviteVal;
            localMem.canKick = canKickVal;
            localMem.canAssignRoles = canAssignVal;
        }
    }

    // 2. Debounce de 700ms: Si el usuario marca varias casillas, se apilan en un solo envío
    if (squadMemberAutoSaveTimeout) {
        clearTimeout(squadMemberAutoSaveTimeout);
    }
    squadMemberAutoSaveTimeout = setTimeout(() => {
        flushAutoSaveSquadMember();
    }, 700);
}

function flushAutoSaveSquadMember() {
    if (squadMemberAutoSaveTimeout) {
        clearTimeout(squadMemberAutoSaveTimeout);
        squadMemberAutoSaveTimeout = null;
    }

    if (!currentEditingMember || squadMemberModal.style.display === 'none') return;

    const sq = currentEditingSquad || window.mySquadData;
    const squadId = sq ? (sq.id || sq._id) : null;
    const titleVal = document.getElementById('sm-title').value.trim();
    const canInviteVal = document.getElementById('sm-can-invite').checked;
    const canKickVal = document.getElementById('sm-can-kick').checked;
    const canAssignVal = document.getElementById('sm-can-assign').checked;

    // Comprobar contra el último estado guardado en el servidor
    if (currentEditingMember._savedTitle === titleVal &&
        currentEditingMember._savedInvite === canInviteVal &&
        currentEditingMember._savedKick === canKickVal &&
        currentEditingMember._savedAssign === canAssignVal) {
        return; // 🛑 Sin cambios reales respecto a lo guardado
    }

    currentEditingMember._savedTitle = titleVal;
    currentEditingMember._savedInvite = canInviteVal;
    currentEditingMember._savedKick = canKickVal;
    currentEditingMember._savedAssign = canAssignVal;

    if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({
            type: 'update_squad_member',
            squadId: squadId,
            targetAccountId: currentEditingMember.accountId,
            title: titleVal,
            canInvite: canInviteVal,
            canKick: canKickVal,
            canAssignRoles: canAssignVal
        }));
    }
}

// Alias de compatibilidad
function autoSaveSquadMember() {
    flushAutoSaveSquadMember();
}

const smTitleInput = document.getElementById('sm-title');
if (smTitleInput) {
    // 🛑 No disparar en cada tecla ('input'), sino únicamente al salir del campo ('blur' / 'change') o pulsar Enter
    smTitleInput.addEventListener('change', triggerAutoSaveSquadMember);
    smTitleInput.addEventListener('blur', triggerAutoSaveSquadMember);
    smTitleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            smTitleInput.blur();
        }
    });
}
document.getElementById('sm-can-invite').addEventListener('change', triggerAutoSaveSquadMember);
document.getElementById('sm-can-kick').addEventListener('change', triggerAutoSaveSquadMember);
document.getElementById('sm-can-assign').addEventListener('change', triggerAutoSaveSquadMember);

// ==========================================
// 🛑 BOTÓN DE EXPULSAR MIEMBRO DEL CLAN
// ==========================================
const kickBtnElement = document.getElementById('sm-kick-btn');
if (kickBtnElement) {
    kickBtnElement.onclick = () => {
        const sq = currentEditingSquad || window.mySquadData;
        if (!currentEditingMember || !sq) return;
        if (confirm(`¿Estás seguro de que quieres expulsar a ${currentEditingMember.name || "este miembro"} del clan?`)) {
            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({
                    type: 'kick_squad_member',
                    squadId: sq.id || sq._id,
                    targetAccountId: currentEditingMember.accountId
                }));
            }
            squadMemberModal.style.display = 'none';
            currentEditingMember = null;
            currentEditingSquad = null;
        }
    };
}

// ==========================================
// 👁️ BOTÓN DE VER PERFIL (CON NAVEGACIÓN)
// ==========================================
document.getElementById('sm-profile-btn').onclick = () => {
    if (!currentEditingMember) return;

    squadMemberModal.style.display = 'none';
    document.getElementById('my-squad-modal').style.display = 'none';

    lastProfileSource = 'squad_member';

    // 🛑 EL FIX DEFINITIVO DE IDENTIDAD
    if (currentEditingMember.accountId === player.accountId) {
        openProfile('self', player.username);
    } else {
        let onlineId = Object.keys(otherPlayers).find(id => otherPlayers[id].accountId === currentEditingMember.accountId);
        if (onlineId) {
            openProfile(onlineId, currentEditingMember.name, currentEditingMember);
        } else {
            openProfile('offline', currentEditingMember.name, currentEditingMember);
        }
    }
};

// ==========================================
// ❌ CERRAR MODAL
// ==========================================
document.getElementById('close-squad-member').onclick = () => {
    // Guardar inmediatamente cualquier cambio pendiente antes de cerrar
    flushAutoSaveSquadMember();
    squadMemberModal.style.display = 'none';
    currentEditingMember = null;
    currentEditingSquad = null;
};


window.refreshLeaderboardIfOpen = function () {
    const modal = document.getElementById('leaderboard-modal');
    if (modal && modal.style.display === 'flex' && typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MessagePack.encode({ type: 'get_squad_leaderboard' }));
    }
};
