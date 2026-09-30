// --- CHAT LOGIC ---
const chatContainer = document.getElementById('chat-container');
const chatToggle = document.getElementById('chat-toggle');
const chatInput = document.getElementById('chat-input');
// Detect when the user opens/closes their keyboard
chatInput.addEventListener('focus', () => { player.isTyping = true; });
chatInput.addEventListener('blur', () => { player.isTyping = false; });
const sendBtn = document.getElementById('send-btn');

// Open the chat bar and trigger keyboard
chatToggle.addEventListener('click', () => {
    chatContainer.classList.add('expanded');
    chatToggle.style.display = 'none'; // Hide the chat icon

    // Slight delay ensures the CSS animation starts before pulling up the keyboard
    setTimeout(() => {
        chatInput.focus();
    }, 100);
});

function closeChat() {
    chatInput.value = "";
    chatInput.blur(); // Hides the keyboard
    chatContainer.classList.remove('expanded');

    // Wait for the collapse animation before showing the icon again
    setTimeout(() => {
        chatToggle.style.display = 'block';
    }, 300);
}

function sendMessage() {
    const text = chatInput.value.trim();
    if (text !== "") {

        // ðŸ‘‡ NUEVO: COMANDO DE RESCATE /fix (ANTI-ABUSO) ðŸ‘‡
        if (text.toLowerCase() === '/fix' || text.toLowerCase() === '/unstuck') {
            // Limpiamos todos los estados fÃ­sicos y de interfaz locales
            player.isTeleporting = false;
            player.isReloading = false;
            player.isSwinging = false;
            player.isMoving = false;

            // ðŸ›¡ï¸ EL FIX: Solo te cura si de verdad estabas en estado de muerte
            if (player.hp <= 0 || player.isDead) {
                player.hp = 100;
                player.isDead = false;
            }

            if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'force_unstuck' }));
            }

            // Si tienes el arma bugueada, la forzamos a recargar visualmente
            renderHudHotbar();
            closeChat();
            return; // Detenemos la ejecuciÃ³n
        }

        // --- COMANDO DE ADMIN: TELETRANSPORTE INSTANTÃNEO ---
        // Â¡EL FIX!: Ahora verifica si tienes el rol de admin
        if (text.startsWith('/tp ') && player.role === 'admin') {
            const parts = text.split(' ');
            if (parts.length === 3) {
                const tx = parseInt(parts[1]);
                const ty = parseInt(parts[2]);
                if (!isNaN(tx) && !isNaN(ty)) {
                    player.worldX = (tx * TILE_SIZE) + (TILE_SIZE / 2);
                    player.worldY = (ty * TILE_SIZE) + (TILE_SIZE / 2);
                    lastNetworkString = "";
                }
            }
        }
        // --- MENSAJE DE CHAT NORMAL ---
        else {
            player.message = text;
            player.messageTimer = 420;
        }
    }
    closeChat();
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// If the user taps the game screen while chat is open, close it
document.getElementById('gameCanvas').addEventListener('touchstart', (e) => {
    if (chatContainer.classList.contains('expanded') && e.touches.length === 1) {
        // Only close if they didn't tap inside the chat box
        if (e.touches[0].clientY > 80) {
            closeChat();
        }
    }
}, { passive: false });

// --- GAME LOOP ---
function drawGrid(offsetX, offsetY) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    // Scale the grid up by our zoom level
    const gridSize = 50 * zoomLevel;

    // Scale the movement offset so the floor slides at the correct speed
    const scaledOffsetX = offsetX * zoomLevel;
    const scaledOffsetY = offsetY * zoomLevel;

    const startX = scaledOffsetX % gridSize;
    const startY = scaledOffsetY % gridSize;

    // Draw lines (starting slightly off-screen to prevent popping)
    for (let x = startX - gridSize; x < window.innerWidth; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, window.innerHeight); ctx.stroke();
    }
    for (let y = startY - gridSize; y < window.innerHeight; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(window.innerWidth, y); ctx.stroke();
    }
}

function updatePlayerDirection() {
    const currentlyMoving = (player.vx !== 0 || player.vy !== 0);

    if (currentlyMoving !== player.isMoving) {
        player.frameX = 0; player.tickCount = 0; player.isMoving = currentlyMoving;
    }

    // --- 1. MIRADA (NUEVO ORDEN: 0=Abajo, 1=Derecha, 2=Izquierda, 3=Arriba) ---
    let faceAngle;
    if (isShooting || player.isSwinging) {
        faceAngle = shootAngle;
    } else if (player.isMoving) {
        faceAngle = Math.atan2(player.vy, player.vx);
    }

    if (faceAngle !== undefined) {
        const deg = faceAngle * (180 / Math.PI);
        // RESTAURADO: Tu lÃ³gica original que funciona perfecto
        if (deg > 45 && deg <= 135) player.frameY = 0;
        else if (deg > 135 || deg <= -135) player.frameY = 1;
        else if (deg > -45 && deg <= 45) player.frameY = 2;
        else if (deg > -135 && deg <= -45) player.frameY = 3;
    }

    // --- 2. ANIMACIÃ“N DE LAS PIERNAS (DINÃMICA) ---
    player.tickCount++;

    const speedMod = player.isMoving ? 1 : 2;

    // ðŸ›‘ LÃMITES EXACTOS DE TU IMAGEN
    let maxFrames = 4;
    if (player.equippedWeapon && player.equippedWeapon !== "none") {
        maxFrames = player.isMoving ? 6 : 1;
    } else {
        maxFrames = player.isMoving ? 8 : 4;
    }

    if (player.tickCount > player.ticksPerFrame * speedMod) {
        player.tickCount = 0;
        player.frameX = (player.frameX + 1) % maxFrames;
    }
}

// A helper function to draw perfectly scaled chat bubbles
function drawDynamicBubble(text, timer, isTyping, isSpeaking, x, y, scaledWidth) {
    // If they aren't chatting, typing, and speaking, do nothing
    if (timer <= 0 && !isTyping && !isSpeaking) return;

    // 1. Scale the font size to be a bit smaller (changed from 14 to 12)
    const fontSize = 7 * zoomLevel;
    ctx.font = `bold ${fontSize}px Arial`;

    // 2. Scale the outline thickness slightly down for the smaller text
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5 * zoomLevel;
    ctx.strokeStyle = "black";

    // 3. Anchor it perfectly above the head
    const bubbleY = y + (15 * zoomLevel);
    const centerX = x + (scaledWidth / 2);
    let currentY = bubbleY;

    if (timer > 0 || isTyping) {
        if (timer > 0) {
            // --- ACTUAL CHAT MESSAGE ---
            // Keep standard messages centered
            ctx.textAlign = "center";
            ctx.strokeText(text, centerX, currentY);
            ctx.fillStyle = "white";
            ctx.fillText(text, centerX, currentY);
        } else if (isTyping) {
            // --- TYPING INDICATOR ---
            // Lock alignment to the left so the dots don't wiggle back and forth
            ctx.textAlign = "left";

            // Animate the dots (1 to 3)
            const dotCount = (Math.floor(Date.now() / 400) % 3) + 1;
            const displayText = ".".repeat(dotCount);

            // Pre-measure the maximum width of "..." so we can center the whole block
            const maxTextWidth = ctx.measureText("...").width;
            const startX = centerX - (maxTextWidth / 2);

            ctx.strokeText(displayText, startX, currentY);
            ctx.fillStyle = "white";
            ctx.fillText(displayText, startX, currentY);
        }
        currentY -= (15 * zoomLevel); // Move up so the mic doesn't overlap
    }

    if (isSpeaking) {
        if (typeof window.micIconObj === 'undefined') {
            window.micIconObj = new Image();
            window.micIconObj.src = 'items/icons/mic.png';
        }
        if (window.micIconObj.complete) {
            const micW = 16 * zoomLevel;
            const micH = 18 * zoomLevel;
            // Pulsing animation
            const pulse = 1 + (Math.sin(Date.now() / 150) * 0.15);
            const drawW = micW * pulse;
            const drawH = micH * pulse;
            ctx.drawImage(window.micIconObj, centerX - (drawW / 2), currentY - drawH, drawW, drawH);
        }
    }
}
