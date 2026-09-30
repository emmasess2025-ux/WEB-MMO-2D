// =========================================================
// 🏝️ DYNAMIC ISLAND, APP TRAY, TUTORIAL & NOTIFICATIONS UI
// =========================================================

// --- 🧠 MEMORIA INTELIGENTE DEL APP TRAY ---
window.isTrayWaitingInBg = false;

window.hideTrayForModal = function() {
    const appTray = document.getElementById('app-tray');
    if (appTray && appTray.classList.contains('open')) {
        window.isTrayWaitingInBg = true;
        appTray.classList.remove('open');
    }
};

window.restoreTrayAfterModal = function() {
    const appTray = document.getElementById('app-tray');
    if (window.isTrayWaitingInBg && appTray) {
        appTray.classList.add('open');
        window.isTrayWaitingInBg = false;
    }
};

// --- CONTROL DE LA ISLA DINÁMICA ---
let islandTimeout = null;

window.wakeUpIsland = function(duration = 5000) {
    const island = document.getElementById('dynamic-island');
    if (!island) return;

    island.classList.add('active');

    if (islandTimeout) clearTimeout(islandTimeout);

    islandTimeout = setTimeout(() => {
        island.classList.remove('active');
    }, duration);
};

let islandGlowTimeout = null;
window.triggerIslandGlow = function(color) {
    const island = document.getElementById('dynamic-island');
    if (!island) return;
    island.style.boxShadow = `0 0 15px ${color}, inset 0 0 10px ${color}`;
    if (islandGlowTimeout) clearTimeout(islandGlowTimeout);
    islandGlowTimeout = setTimeout(() => {
        island.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(255, 255, 255, 0.1)';
    }, 3500);
};

// --- SISTEMA DE BANDEJA DE ENTRADA (ISLA DINÁMICA) ---
window.unreadPMs = [];

// --- NOTIFICATION SYSTEM QUEUE ---
window.pendingRequests = [];

window.checkPendingRequests = function() {
    const notifBtnContainer = document.getElementById('notif-btn-container');
    const notifModal = document.getElementById('notif-modal');
    const badge = document.getElementById('friend-notif-badge');

    if (window.pendingRequests.length === 0) {
        if (notifBtnContainer) notifBtnContainer.style.display = 'none';
        if (notifModal) notifModal.style.display = 'none';
        if (badge) badge.style.display = 'none';
    } else {
        if (notifBtnContainer) notifBtnContainer.style.display = 'block';
        if (badge) {
            badge.style.display = 'flex';
            badge.innerText = window.pendingRequests.length;
        }
        if (notifModal) notifModal.style.display = 'none';
    }
};

// --- TUTORIAL LOGIC ---
const tutorialSteps = [
    {
        title: "Welcome to the Game",
        desc: "Welcome! Survive, build, and fight in a persistent world. Here is how you can get started.",
        icon: "items/icons/Info.png"
    },
    {
        title: "Movement & Combat",
        desc: "Use the on-screen joysticks (or WASD/Mouse) to move and aim. Click or tap the aim joystick to attack.",
        icon: "items/icons/ghost_gun.png"
    },
    {
        title: "Economy & Loot",
        desc: "Find loot in the world! Visit the Jeweler or the Junkyard NPCs to sell your items and earn coins.",
        icon: "items/icons/bag.png"
    },
    {
        title: "Build & Socialize",
        desc: "Use your coins to buy weapons and building materials. Team up with other players by joining a Squad and take down and held bases for rewards on the long run!",
        icon: "items/icons/squads.png"
    }
];

let currentTutorialStep = 0;

function renderTutorialStep() {
    const step = tutorialSteps[currentTutorialStep];
    const tutorialTitle = document.getElementById('tutorial-title');
    const tutorialContent = document.getElementById('tutorial-content');
    const tutorialDots = document.getElementById('tutorial-dots');
    const tutorialNextBtn = document.getElementById('tutorial-next-btn');

    if (tutorialTitle) tutorialTitle.innerText = step.title;

    if (tutorialContent) {
        tutorialContent.innerHTML = `
            <img src="${step.icon}" style="width: 64px; height: 64px; margin-bottom: 15px; image-rendering: pixelated;">
            <p style="font-size: 15px; line-height: 1.5; color: #ccc; margin: 0;">${step.desc}</p>
        `;
    }

    if (tutorialDots) {
        tutorialDots.innerHTML = '';
        for (let i = 0; i < tutorialSteps.length; i++) {
            const dot = document.createElement('div');
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '50%';
            dot.style.background = (i === currentTutorialStep) ? '#38ef7d' : 'rgba(255,255,255,0.3)';
            tutorialDots.appendChild(dot);
        }
    }

    if (tutorialNextBtn) {
        if (currentTutorialStep === tutorialSteps.length - 1) {
            tutorialNextBtn.innerText = "Finish ➔";
        } else {
            tutorialNextBtn.innerText = "Next ➔";
        }
    }
}

function closeTutorial() {
    const tutorialModal = document.getElementById('tutorial-modal');
    if (tutorialModal) tutorialModal.style.display = 'none';
    window.restoreTrayAfterModal();

    if (window.ws && window.ws.readyState === WebSocket.OPEN && window.isLoggedIn) {
        window.ws.send(MessagePack.encode({ type: 'tutorial_completed' }));
        if (window.player) window.player.hasSeenTutorial = true;
    }
}

// --- INITIALIZE DOM LISTENERS ---
window.addEventListener('DOMContentLoaded', () => {
    // Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const appTray = document.getElementById('app-tray');
    if (menuToggle && appTray) {
        menuToggle.addEventListener('click', () => {
            appTray.classList.toggle('open');
        });
    }

    // Dynamic Island Tap to Wake
    const island = document.getElementById('dynamic-island');
    if (island) {
        island.addEventListener('mousedown', () => window.wakeUpIsland(5000));
        island.addEventListener('touchstart', () => window.wakeUpIsland(5000));
    }

    // Island Announcements
    const announceBtn = document.getElementById('island-announce-btn');
    const announceBadge = document.getElementById('announce-badge');
    const closeAnnounceBtn = document.getElementById('close-announcement-btn');

    if (announceBtn) {
        const openAnnouncements = (e) => {
            e.stopPropagation();
            window.wakeUpIsland(5000);

            if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                const msg = window.serverAnnouncementsQueue[0];
                const banner = document.getElementById('global-announcement-banner');
                const textEl = document.getElementById('global-announcement-text');
                if (banner && textEl) {
                    textEl.innerText = msg;
                    banner.style.animation = 'none';
                    banner.offsetHeight;
                    banner.style.display = 'block';
                    banner.style.animation = 'slideDownFade 0.5s ease-out forwards';
                }
            }
        };
        announceBtn.addEventListener('mousedown', openAnnouncements);
        announceBtn.addEventListener('touchstart', openAnnouncements, { passive: false });
    }

    if (closeAnnounceBtn) {
        closeAnnounceBtn.addEventListener('click', () => {
            const banner = document.getElementById('global-announcement-banner');

            if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                window.serverAnnouncementsQueue.shift();
            }

            if (window.serverAnnouncementsQueue && window.serverAnnouncementsQueue.length > 0) {
                const msg = window.serverAnnouncementsQueue[0];
                const textEl = document.getElementById('global-announcement-text');
                if (textEl) textEl.innerText = msg;
                if (announceBadge) announceBadge.innerText = window.serverAnnouncementsQueue.length;
            } else {
                if (banner) banner.style.display = 'none';
                if (announceBtn) announceBtn.style.display = 'none';
            }
        });
    }

    // Island Notifications / Inbox Button
    const notifBtn = document.getElementById('island-notif-btn');
    const notifBadge = document.getElementById('notif-badge');
    if (notifBadge) notifBadge.style.display = 'none';

    if (notifBtn) {
        const openInbox = (e) => {
            e.stopPropagation();
            window.wakeUpIsland(5000);

            const inboxModal = document.getElementById('inbox-modal');
            if (inboxModal) inboxModal.style.display = 'flex';

            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(MessagePack.encode({ type: 'get_inbox' }));
            }

            window.unreadPMs = [];
            if (notifBadge) notifBadge.style.display = 'none';
        };
        notifBtn.addEventListener('mousedown', openInbox);
        notifBtn.addEventListener('touchstart', openInbox);
    }

    // Feedback UI
    const appFeedbackBtn = document.getElementById('app-feedback');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeFeedbackModalBtn = document.getElementById('close-feedback-modal');
    const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
    const feedbackInput = document.getElementById('feedback-input');
    const feedbackCategoryBtns = document.querySelectorAll('.feedback-category-btn');
    const feedbackSuccessModal = document.getElementById('feedback-success-modal');
    const closeFeedbackSuccessBtn = document.getElementById('close-feedback-success-btn');

    let selectedFeedbackCategory = "Ideas";

    if (appFeedbackBtn) {
        appFeedbackBtn.addEventListener('click', () => {
            window.hideTrayForModal();
            if (!window.isLoggedIn) {
                alert("You must be logged in to submit feedback!");
                window.restoreTrayAfterModal();
                return;
            }
            if (feedbackModal) feedbackModal.style.display = 'flex';
        });
    }

    feedbackCategoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            feedbackCategoryBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'rgba(0,0,0,0.5)';
                b.style.border = '1px solid rgba(255,255,255,0.2)';
                b.style.color = '#aaa';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(255,154,158,0.2)';
            btn.style.border = '1px solid #ff9a9e';
            btn.style.color = 'white';
            selectedFeedbackCategory = btn.getAttribute('data-category') || "Ideas";
        });
    });

    if (closeFeedbackModalBtn) {
        closeFeedbackModalBtn.addEventListener('click', () => {
            if (feedbackModal) feedbackModal.style.display = 'none';
            if (feedbackInput) feedbackInput.value = '';
            window.restoreTrayAfterModal();
        });
    }

    if (closeFeedbackSuccessBtn) {
        closeFeedbackSuccessBtn.addEventListener('click', () => {
            if (feedbackSuccessModal) feedbackSuccessModal.style.display = 'none';
            window.restoreTrayAfterModal();
        });
    }

    if (submitFeedbackBtn) {
        submitFeedbackBtn.addEventListener('click', () => {
            const text = feedbackInput ? feedbackInput.value.trim() : '';
            if (!text) return;

            submitFeedbackBtn.innerText = "Sending...";
            submitFeedbackBtn.disabled = true;

            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(MessagePack.encode({
                    type: 'submit_feedback',
                    category: selectedFeedbackCategory,
                    message: text
                }));
            }
        });
    }

    // Tutorial Listeners
    const tutorialNextBtn = document.getElementById('tutorial-next-btn');
    const tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
    const appGuideBtn = document.getElementById('app-guide');
    const tutorialModal = document.getElementById('tutorial-modal');

    if (tutorialNextBtn) {
        tutorialNextBtn.addEventListener('click', () => {
            if (currentTutorialStep < tutorialSteps.length - 1) {
                currentTutorialStep++;
                renderTutorialStep();
            } else {
                closeTutorial();
            }
        });
    }

    if (tutorialSkipBtn) {
        tutorialSkipBtn.addEventListener('click', closeTutorial);
    }

    if (appGuideBtn) {
        appGuideBtn.addEventListener('click', () => {
            window.hideTrayForModal();
            currentTutorialStep = 0;
            renderTutorialStep();
            if (tutorialModal) tutorialModal.style.display = 'flex';
        });
    }

    // Discord App Button
    const appDiscordBtn = document.getElementById('app-discord');
    if (appDiscordBtn) {
        appDiscordBtn.addEventListener('click', () => {
            const appTray = document.getElementById('app-tray');
            if (appTray) appTray.classList.remove('open');
            window.open('https://discord.com/invite/7WyCq2DQgD', '_blank', 'noopener,noreferrer');
        });
    }

    // Notification Modals (Friend requests & Squad invites)
    const notifToggle = document.getElementById('notif-toggle');
    const notifModal = document.getElementById('notif-modal');
    const notifText = document.getElementById('notif-text');
    const notifYesBtn = document.getElementById('notif-yes-btn');
    const notifNoBtn = document.getElementById('notif-no-btn');
    const modalAvatarCanvas = document.getElementById('modal-avatar-canvas');
    const modalCtx = modalAvatarCanvas ? modalAvatarCanvas.getContext('2d') : null;

        if (notifToggle) {
        notifToggle.addEventListener('click', () => {
            if (window.pendingRequests.length > 0) {
                const req = window.pendingRequests[0];

                if (notifText) {
                    if (req.type === 'friend_request') {
                        notifText.innerHTML = `<span id="safe-notif-name" style="color:#3498db; font-weight:bold;"></span> te ha enviado una solicitud de amistad. ¿Aceptas?`;
                        const safeName = document.getElementById('safe-notif-name');
                        if (safeName) safeName.innerText = req.senderUsername;
                    } else if (req.type === 'squad_invite') {
                        notifText.innerHTML = `<span id="safe-notif-name" style="color:#9b59b6; font-weight:bold;"></span> te invita a unirte a su clan: <span id="safe-notif-squad" style="color:#f1c40f; font-weight:bold;"></span>. ¿Aceptas?`;
                        const safeName = document.getElementById('safe-notif-name');
                        const safeSquad = document.getElementById('safe-notif-squad');
                        if (safeName) safeName.innerText = req.senderUsername;
                        if (safeSquad) safeSquad.innerText = `[${req.squadName}]`;
                    }
                }

                if (modalCtx && window.headImg && window.headImg.complete) {
                    modalCtx.clearRect(0, 0, modalAvatarCanvas.width, modalAvatarCanvas.height);
                    const headFrameH = window.headImg.height / 4;
                    const drawW = 40;
                    const drawH = 40 * (headFrameH / (window.FRAME_WIDTH || 48));
                    modalCtx.drawImage(window.headImg, 0, 0, (window.FRAME_WIDTH || 48), headFrameH, (modalAvatarCanvas.width - drawW) / 2, modalAvatarCanvas.height - drawH, drawW, drawH);
                }

                if (notifModal) notifModal.style.display = 'flex';
                // 🛑 Ocultar el botón flotante en el instante que se abre el modal
                const notifBtnContainer = document.getElementById('notif-btn-container');
                if (notifBtnContainer) notifBtnContainer.style.display = 'none';
            }
        });
    }

    if (notifYesBtn) {
        notifYesBtn.addEventListener('click', () => {
            if (window.pendingRequests.length > 0) {
                const req = window.pendingRequests.shift();

                if (req.type === 'friend_request') {
                    if (window.ws) window.ws.send(MessagePack.encode({ type: 'add_friend', friendAccountId: req.senderAccountId, isReply: true }));
                    if (window.player) {
                        if (!window.player.friends) window.player.friends = [];
                        if (!window.player.friends.includes(req.senderAccountId)) window.player.friends.push(req.senderAccountId);
                    }
                } else if (req.type === 'squad_invite') {
                    if (window.ws) window.ws.send(MessagePack.encode({ type: 'accept_squad_invite', squadId: req.squadId }));
                }

                window.checkPendingRequests();
            }
        });
    }

    if (notifNoBtn) {
        notifNoBtn.addEventListener('click', () => {
            if (window.pendingRequests.length > 0) {
                window.pendingRequests.shift();
                window.checkPendingRequests();
            }
        });
    }
});
