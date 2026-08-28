// --- TWIN STICK LOGIC ---
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const aimZone = document.getElementById('aim-zone');
const aimKnob = document.getElementById('aim-knob');

// A reusable function to handle moving the visual knob and calculating the math
function processJoystick(e, zoneElement, knobElement, maxDist) {
    const rect = zoneElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // We loop through e.changedTouches instead of e.touches[0] 
    // to handle true multitouch properly
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxDist) {
            dx = (dx / distance) * maxDist;
            dy = (dy / distance) * maxDist;
        }

        knobElement.style.transform = `translate(${dx}px, ${dy}px)`;

        // Return normalized values (-1.0 to 1.0) so you can apply them to movement or aiming
        return { x: dx / maxDist, y: dy / maxDist };
    }
}

// --- LEFT JOYSTICK (MOVEMENT) LISTENERS ---
joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
    e.stopPropagation(); // PREVENTS ZOOM CONFLICT
    const vectors = processJoystick(e, joystickZone, joystickKnob, 35);
    // ðŸ›‘ EL FIX: Guardamos la "intenciÃ³n" del joystick, no la velocidad final
    player.joyX = vectors.x;
    player.joyY = vectors.y;
}, { passive: false });

joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
    e.stopPropagation(); // PREVENTS ZOOM CONFLICT
    const vectors = processJoystick(e, joystickZone, joystickKnob, 35);
    // ðŸ›‘ EL FIX: Guardamos la "intenciÃ³n" del joystick, no la velocidad final
    player.joyX = vectors.x;
    player.joyY = vectors.y;
}, { passive: false });

joystickZone.addEventListener('touchend', (e) => {
    e.preventDefault();  // <--- KILLS THE MAGNIFIER ON THE JOYSTICK
    e.stopPropagation();
    joystickKnob.style.transform = `translate(0px, 0px)`;
    // ðŸ›‘ EL FIX: Resetear intenciÃ³n al soltar
    player.joyX = 0;
    player.joyY = 0;
});

// --- RIGHT JOYSTICK (AIMING) LISTENERS ---
aimZone.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    const vectors = processJoystick(e, aimZone, aimKnob, 35);

    // Only shoot if they push the stick far enough (creates a deadzone)
    if (Math.hypot(vectors.x, vectors.y) > 0.3) {
        isShooting = true;
        shootAngle = Math.atan2(vectors.y, vectors.x);
    }
}, { passive: false });

aimZone.addEventListener('touchmove', (e) => {
    e.preventDefault(); e.stopPropagation();
    const vectors = processJoystick(e, aimZone, aimKnob, 35);

    if (Math.hypot(vectors.x, vectors.y) > 0.3) {
        isShooting = true;
        shootAngle = Math.atan2(vectors.y, vectors.x);
    } else {
        isShooting = false;
    }
}, { passive: false });

aimZone.addEventListener('touchend', (e) => {
    e.preventDefault(); e.stopPropagation();
    aimKnob.style.transform = `translate(0px, 0px)`;
    isShooting = false;
});

// Chat logic moved to ui_chat.js