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
// 1. UI: Botones y Lista
// ==========================================
const joinVoiceBtn = document.getElementById('join-voice-btn');
const muteVoiceBtn = document.getElementById('mute-voice-btn');
const participantsList = document.getElementById('voice-chat-participants');

function updateParticipantsUI() {
    if (!participantsList) return;
    participantsList.innerHTML = '';
    
    if (voiceParticipants.size === 0 && !localAudioStream) {
        participantsList.innerHTML = '<p style="color: #777; font-size: 12px; text-align: center; margin-top: 50px;">Nadie esto conectado.</p>';
        return;
    }

    // Helper para crear la fila del participante
    function createRow(name, headId, isMuted, isMe) {
        const row = document.createElement('div');
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        row.style.background = "rgba(255,255,255,0.05)";
        row.style.padding = "8px";
        row.style.borderRadius = "8px";
        if (isMuted) row.style.opacity = "0.5";

        const avatarContainer = document.createElement('div');
        avatarContainer.style.width = "25px";
        avatarContainer.style.height = "25px";
        avatarContainer.style.background = "#222";
        avatarContainer.style.borderRadius = "5px";
        avatarContainer.style.display = "flex";
        avatarContainer.style.alignItems = "center";
        avatarContainer.style.justifyContent = "center";
        avatarContainer.style.overflow = "hidden";
        avatarContainer.style.border = isMe ? "1px solid #2ecc71" : "1px solid #3498db";

        // Usar la logica de la cabeza real del juego
        let cHeadId = headId || 'H_D';
        const safeSprites = window.loadedItemSprites || {};
        const dHead = safeSprites[cHeadId] || (typeof headImg !== 'undefined' ? headImg : null);
        
        if (dHead && dHead.complete && dHead.naturalWidth > 0) {
            const tCanvas = document.createElement('canvas');
            tCanvas.width = 25;
            tCanvas.height = 25;
            const tCtx = tCanvas.getContext('2d');
            tCtx.imageSmoothingEnabled = false;
            
            const frameW = typeof FRAME_WIDTH !== 'undefined' ? FRAME_WIDTH : 32;
            const headFrameH = dHead.height / 4;
            const zoom = 25 / 30; 
            const drawW = frameW * zoom;
            const drawH = headFrameH * zoom;

            tCtx.drawImage(
                dHead,
                0, 0, frameW, headFrameH, 
                (25 - drawW) / 2, (25 - drawH) / 2 + 5, drawW, drawH
            );
            avatarContainer.appendChild(tCanvas);
        } else {
            // Fallback si no hay sprite cargado en memoria
            avatarContainer.innerHTML = '<span style="color:#fff; font-size:10px;">?</span>';
        }

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

        row.appendChild(avatarContainer);
        row.appendChild(nameSpan);
        row.appendChild(dot);
        return row;
    }

    if (localAudioStream) {
        let myHead = (typeof player !== 'undefined' && player.equipped && player.equipped.head) ? player.equipped.head : 'H_D';
        participantsList.appendChild(createRow('Tu ' + (isVoiceMuted ? '(Muteado)' : ''), myHead, isVoiceMuted, true));
    }

    voiceParticipants.forEach((data, uId) => {
        participantsList.appendChild(createRow(data.username, data.head, false, false));
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
                localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                
                joinVoiceBtn.innerText = "Desconectarse";
                joinVoiceBtn.style.background = "#e74c3c";
                muteVoiceBtn.style.display = "block";
                isVoiceMuted = false;
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic.png" style="width:16px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8))">';
                muteVoiceBtn.style.background = "#2ecc71"; muteVoiceBtn.style.border = "none";

                // Avisar al servidor
                if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
                    ws.send(MessagePack.encode({ type: 'join_voice_lobby' }));
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
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic.png" style="width:16px; opacity:0.5;">';
                muteVoiceBtn.style.background = "rgba(231, 76, 60, 0.5)"; muteVoiceBtn.style.border = "1px solid #e74c3c";
            } else {
                muteVoiceBtn.innerHTML = '<img src="items/icons/mic.png" style="width:16px; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8))">';
                muteVoiceBtn.style.background = "#2ecc71"; muteVoiceBtn.style.border = "none";
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
            console.log("[WEBRTC] ontrack received from", targetId);
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
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
            voiceParticipants.set(data.userId, { username: data.username, head: data.head });
            updateParticipantsUI();
        }
    } else if (data.type === 'leave_voice_lobby') {
        if (peerConnections[data.userId]) {
            peerConnections[data.userId].close();
            delete peerConnections[data.userId];
        }
        voiceParticipants.delete(data.userId);
        updateParticipantsUI();
    }
};
