// webrtc_squad.js - L�gica WebRTC Peer-to-Peer para el Chat de Voz del Clan
// No pasa audio por el servidor de Node.js, ahorrando 100% de CPU.

let localAudioStream = null;
const peerConnections = {}; // { userId: RTCPeerConnection }
const voiceParticipants = new Map(); // userId -> { username, head } // Qui�nes est�n en la sala
let isVoiceMuted = false;

// Configuraci�n de los servidores STUN (p�blicos y gratuitos de Google)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==========================================
// 1. UI: Botones y Lista (y Mini Widget)
// ==========================================
const joinVoiceBtn = document.getElementById('join-voice-btn');
const muteVoiceBtn = document.getElementById('mute-voice-btn');
const participantsList = document.getElementById('voice-chat-participants');

// Init Mini Widget UI
let voiceMiniWidget = document.getElementById('voice-mini-widget');
if (!voiceMiniWidget) {
    voiceMiniWidget = document.createElement('div');
    voiceMiniWidget.id = 'voice-mini-widget';
    voiceMiniWidget.style.cssText = 'position:absolute; left:20px; top:80px; background:rgba(20,20,20,0.8); border:2px solid #333; border-radius:30px; padding:12px 6px; display:none; flex-direction:column; align-items:center; z-index:1000; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-family:sans-serif; transition: all 0.2s ease;';
    
    

    // Controls container
    const vwControls = document.createElement('div');
    vwControls.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:10px; border-bottom:1px solid #444; padding-bottom:10px; align-items:center; width:30px;';
    
    // Heads container
    const vwHeads = document.createElement('div');
    vwHeads.id = 'voice-mini-heads';
    vwHeads.style.cssText = 'display:flex; flex-direction:column; gap:5px; align-items:center;';
    
    const vwMute = document.createElement('button');
    vwMute.id = 'voice-mini-mute';
    vwMute.innerHTML = '<img src="items/icons/mic.png" style="width:14px; pointer-events:none;">';
    vwMute.style.cssText = 'background:#2ecc71; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;';
    
    const vwHangup = document.createElement('button');
    vwHangup.innerHTML = '<img src="items/icons/phone.png" style="width:16px; pointer-events:none;">';
    vwHangup.style.cssText = 'background:#e74c3c; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:14px; padding:0;';
    
    vwControls.appendChild(vwMute);
    vwControls.appendChild(vwHangup);
    voiceMiniWidget.appendChild(vwControls);
    voiceMiniWidget.appendChild(vwHeads);
    document.body.appendChild(voiceMiniWidget);

    // Events for Mini Widget
    vwMute.addEventListener('click', () => { if(muteVoiceBtn) muteVoiceBtn.click(); });
    vwHangup.addEventListener('click', () => { if(joinVoiceBtn) joinVoiceBtn.click(); });
}

function updateParticipantsUI() {
    if (participantsList) participantsList.innerHTML = '';
    
    const vwHeads = document.getElementById('voice-mini-heads');
    
    const vwMute = document.getElementById('voice-mini-mute');
    if (vwHeads) vwHeads.innerHTML = '';
    
    if (voiceParticipants.size === 0 && !localAudioStream) {
        if (participantsList) participantsList.innerHTML = '<p style="color: #777; font-size: 12px; text-align: center; margin-top: 50px;">Nadie esto conectado.</p>';
        if (voiceMiniWidget) voiceMiniWidget.style.display = 'none';
        return;
    }

    if (voiceMiniWidget) voiceMiniWidget.style.display = 'flex';
    

    // Helper para renderizar la cabeza en canvas
    function buildAvatarBox(headId, isMuted, isMe, size = 25) {
        const box = document.createElement('div');
        box.style.width = size + "px";
        box.style.height = size + "px";
        box.style.background = "#222";
        box.style.borderRadius = "5px";
        box.style.display = "flex";
        box.style.alignItems = "center";
        box.style.justifyContent = "center";
        box.style.overflow = "hidden";
        box.style.border = isMe ? "1px solid #2ecc71" : "1px solid #3498db";
        box.style.position = "relative";
        if (isMuted) box.style.opacity = "0.5";

        let cHeadId = headId || 'H_D';
        const safeSprites = window.loadedItemSprites || {};
        const dHead = safeSprites[cHeadId] || (typeof headImg !== 'undefined' ? headImg : null);
        
        if (dHead && dHead.complete && dHead.naturalWidth > 0) {
            const tCanvas = document.createElement('canvas');
            tCanvas.width = size;
            tCanvas.height = size;
            const tCtx = tCanvas.getContext('2d');
            tCtx.imageSmoothingEnabled = false;
            const frameW = typeof FRAME_WIDTH !== 'undefined' ? FRAME_WIDTH : 32;
            const headFrameH = dHead.height / 4;
            const zoom = size / 30; 
            const drawW = frameW * zoom;
            const drawH = headFrameH * zoom;
            tCtx.drawImage(dHead, 0, 0, frameW, headFrameH, (size - drawW) / 2, (size - drawH) / 2 + (5*zoom), drawW, drawH);
            box.appendChild(tCanvas);
        } else {
            box.innerHTML = '<span style="color:#fff; font-size:10px;">?</span>';
        }

        if (isMuted) {
            const muteIcon = document.createElement('img');
            muteIcon.src = "items/icons/mic_mute.png";
            muteIcon.style.cssText = "position:absolute; width:12px; bottom:2px; right:2px; pointer-events:none;";
            box.appendChild(muteIcon);
        }

        return box;
    }

    // Helper para la lista grande modal
    function createRow(name, headId, isMuted, isMe) {
        const row = document.createElement('div');
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        row.style.background = "rgba(255,255,255,0.05)";
        row.style.padding = "8px";
        row.style.borderRadius = "8px";
        if (isMuted) row.style.opacity = "0.5";

        row.appendChild(buildAvatarBox(headId, isMuted, isMe, 25));

        const nameSpan = document.createElement('span');
        nameSpan.style.color = "#fff";
        nameSpan.style.fontSize = "12px";
        nameSpan.style.fontFamily = "sans-serif";
        nameSpan.style.flex = "1";
        nameSpan.innerText = name;

        const dot = document.createElement('div');
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.background = isMuted ? "#e74c3c" : "#2ecc71";
        dot.style.borderRadius = "50%";
        dot.style.boxShadow = "0 0 5px " + (isMuted ? "#e74c3c" : "#2ecc71");

        row.appendChild(nameSpan);
        row.appendChild(dot);
        return row;
    }

    if (localAudioStream) {
        let myHead = (typeof player !== 'undefined' && player.equipped && player.equipped.head) ? player.equipped.head : 'H_D';
        if (participantsList) participantsList.appendChild(createRow('Tu ' + (isVoiceMuted ? '(Muteado)' : ''), myHead, isVoiceMuted, true));
        if (vwHeads) vwHeads.appendChild(buildAvatarBox(myHead, isVoiceMuted, true, 30));
        
        if (vwMute) {
            vwMute.style.background = isVoiceMuted ? "rgba(231, 76, 60, 0.5)" : "#2ecc71";
            vwMute.style.border = isVoiceMuted ? "1px solid #e74c3c" : "none";
            vwMute.innerHTML = isVoiceMuted ? '<img src="items/icons/mic_mute.png" style="width:14px; pointer-events:none;">' : '<img src="items/icons/mic.png" style="width:14px; pointer-events:none; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8))">';
        }
    }

    voiceParticipants.forEach((data, uId) => {
        if (participantsList) participantsList.appendChild(createRow(data.username, data.head, data.isMuted, false));
        if (vwHeads) vwHeads.appendChild(buildAvatarBox(data.head, data.isMuted, false, 30));
    });
}

// ==========================================
// 2. Conectarse / Desconectarse
// ==========================================
if (joinVoiceBtn) {
    joinVoiceBtn.addEventListener('click', async () => {
        if (!localAudioStream) {
            // CONECTAR
            try {
                
                // Explicitly request echo cancellation and ideal constraints for iOS
                localAudioStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        echoCancellation: true, 
                        noiseSuppression: true, 
                        autoGainControl: true,
                        sampleRate: 48000
                    }, 
                    video: false 
                });
                
                // Explicitly ensure the track is enabled
                if (localAudioStream.getAudioTracks().length > 0) {
                    localAudioStream.getAudioTracks()[0].enabled = true;
                }

                
                joinVoiceBtn.innerText = "Desconectarse";
                joinVoiceBtn.style.background = "#e74c3c";
                muteVoiceBtn.style.display = "block";
                isVoiceMuted = false;
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic.png" style="width:16px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8))">';
                muteVoiceBtn.style.background = "#2ecc71"; muteVoiceBtn.style.border = "none";

                // Avisar al servidor
                if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'join_voice_lobby', isMuted: isVoiceMuted }));
                }
                
                updateParticipantsUI();
            } catch (err) {
                console.error("Error al acceder al micr�fono:", err);
                alert("Debes permitir el acceso al micr�fono para usar el chat de voz.");
            }
        } else {
            // DESCONECTAR
            localAudioStream.getTracks().forEach(track => track.stop());
            localAudioStream = null;
            
            joinVoiceBtn.innerText = "Conectarse";
            joinVoiceBtn.style.background = "#3498db";
            muteVoiceBtn.style.display = "none";
            
            // Cerrar todas las conexiones peer to peer
            for (let id in peerConnections) {
                peerConnections[id].close();
                delete peerConnections[id];
            }
            voiceParticipants.clear();

            // Avisar al servidor
            if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'leave_voice_lobby' }));
            }
            
            updateParticipantsUI();
        }
    });
}

if (muteVoiceBtn) {
    muteVoiceBtn.addEventListener('click', () => {
        if (localAudioStream) {
            isVoiceMuted = !isVoiceMuted;
            localAudioStream.getAudioTracks()[0].enabled = !isVoiceMuted;
            
            if (isVoiceMuted) {
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic_mute.png" style="width:16px; pointer-events:none;">';
                muteVoiceBtn.style.background = "rgba(231, 76, 60, 0.5)"; muteVoiceBtn.style.border = "1px solid #e74c3c";
            } else {
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic.png" style="width:16px; pointer-events:none; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8))">';
                muteVoiceBtn.style.background = "#2ecc71"; muteVoiceBtn.style.border = "none";
            }
            
            // Broadcast mute status to squad
            if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({ type: 'voice_mute_status', isMuted: isVoiceMuted }));
            }
            
            updateParticipantsUI();
        }
    });
}

// ==========================================
// 3. Manejo de Se�ales WebRTC
// ==========================================
async function createPeerConnection(targetId, username, isInitiator, head = 'H_D') {
    console.log("[WEBRTC] createPeerConnection called:", { targetId, username, isInitiator });
    if (peerConnections[targetId]) {
        console.log("[WEBRTC] Connection already exists for", targetId);
        return peerConnections[targetId];
    }

    try {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[targetId] = pc;
        console.log("[WEBRTC] RTCPeerConnection created");

        if (localAudioStream) {
            console.log("[WEBRTC] Adding local tracks to PC");
            localAudioStream.getTracks().forEach(track => pc.addTrack(track, localAudioStream));
        } else {
            console.log("[WEBRTC] WARNING: localAudioStream is null!");
        }

        pc.ontrack = (event) => {
            console.log("[WEBRTC] ontrack received from", targetId, "Track enabled:", event.track.enabled, "Muted:", event.track.muted);
            event.track.onunmute = () => console.log("[WEBRTC] Track unmuted from", targetId);
            event.track.onmute = () => console.log("[WEBRTC] Track muted from", targetId);
            const audio = new Audio();
            audio.srcObject = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
            audio.autoplay = true;
            audio.playsInline = true; // Crucial for iOS/PWA
            
            // DEBUG: Make audio visible to see if it's playing
            audio.controls = true;
            audio.style.position = 'fixed';
            audio.style.bottom = '10px';
            audio.style.left = '10px';
            audio.style.zIndex = '99999';
            audio.style.background = 'white';
            audio.style.border = '2px solid red';
            document.body.appendChild(audio);

            
            // Forzar reproduccion para evitar bloqueos de autoplay en iOS
            audio.play().catch(err => console.warn("Autoplay blocked by browser:", err));
            updateParticipantsUI();
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                ws.send(MessagePack.encode({
                    type: 'webrtc_signal',
                    targetId: targetId,
                    signalData: { type: 'ice', candidate: { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex } }
                }));
            }
        };

        if (isInitiator) {
            console.log("[WEBRTC] I am initiator. Creating offer for", targetId);
            const offer = await pc.createOffer();
            console.log("[WEBRTC] Offer created");
            await pc.setLocalDescription(offer);
            console.log("[WEBRTC] Local description set. Sending webrtc_signal...");
            ws.send(MessagePack.encode({
                type: 'webrtc_signal',
                targetId: targetId,
                signalData: { type: 'offer', offer: { type: offer.type, sdp: offer.sdp } }
            }));
            console.log("[WEBRTC] webrtc_signal sent!");
        }
        return pc;
    } catch (err) {
        console.error("[WEBRTC] FATAL ERROR in createPeerConnection:", err);
    }
}

// Funci�n expuesta para ser llamada desde net_client.js cuando llega un mensaje
window.handleWebRTCSignal = async (data) => {
    console.log("WEBRTC SIGNAL RECV:", data.signalData.type, "from:", data.senderId);
    const { senderId, senderName, signalData } = data;

    // Si recibimos un offer, creamos conexi�n y respondemos
    if (signalData.type === 'offer') {
        const pc = await createPeerConnection(senderId, senderName, false, data.senderHead || 'H_D');
        voiceParticipants.set(senderId, { username: senderName, head: data.senderHead || 'H_D' });
        updateParticipantsUI();
        
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        ws.send(MessagePack.encode({
            type: 'webrtc_signal',
            targetId: senderId,
            signalData: { type: 'answer', answer: { type: answer.type, sdp: answer.sdp } }
        }));
    } 
    // Si recibimos una respuesta a nuestra oferta
    else if (signalData.type === 'answer') {
        if (peerConnections[senderId]) {
            await peerConnections[senderId].setRemoteDescription(new RTCSessionDescription(signalData.answer));
        }
    } 
    // Si recibimos un candidato de ICE
    else if (signalData.type === 'ice') {
        if (peerConnections[senderId]) {
            await peerConnections[senderId].addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
    }
};

window.handleVoiceLobbyUpdate = (data) => {
    console.log("VOICE LOBBY UPDATE:", data.type, "userId:", data.userId, "myId:", typeof myId !== 'undefined' ? myId : null);
    if (data.type === 'join_voice_lobby') {
        // Alguien se conect�, yo inicio la llamada hacia �l
        if (localAudioStream && data.userId !== (typeof myId !== 'undefined' ? myId : null)) {
            createPeerConnection(data.userId, data.username, true, data.head);
            voiceParticipants.set(data.userId, { username: data.username, head: data.head, isMuted: data.isMuted });
            updateParticipantsUI();
        }
    } else if (data.type === 'leave_voice_lobby') {
        if (peerConnections[data.userId]) {
            peerConnections[data.userId].close();
            delete peerConnections[data.userId];
        }
        voiceParticipants.delete(data.userId);
        updateParticipantsUI();
    } else if (data.type === 'voice_mute_status') {
        console.log("MUTE STATUS APPLIED TO UI:", data.userId, data.isMuted);
        if (voiceParticipants.has(data.userId)) {
            voiceParticipants.get(data.userId).isMuted = data.isMuted;
            updateParticipantsUI();
        }
    }
};
