import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../store/useCallStore';
import toast from 'react-hot-toast';
import { useSocket, BACKEND_URL } from './useSocket';

export const useWebRTC = () => {
    const {
        setLocalStream,
        setRemoteStream,
        setConnectionState,
        setSearching,
        setPartnerConnected,
        isMuted,
        cameraOn,
        localStream,
        addMessage,
        clearMessages,
        setRoomId
    } = useCallStore();

    const socket = useSocket();

    // Use refs for everything that needs to be accessed inside callbacks
    // without causing or depending on re-renders
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const currentRoomIdRef = useRef<string | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
    const hasJoined = useRef(false);
    const hasFetchedIce = useRef(false);
    const iceServersRef = useRef<RTCIceServer[]>([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]);

    useEffect(() => {
        const fetchIce = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/ice-servers`);
                const data = await res.json();
                if (data && data.iceServers) {
                    iceServersRef.current = data.iceServers;
                    console.log('[WebRTC] Fetched secure ICE config from backend.');
                }
            } catch (err) {
                console.error('[WebRTC] Failed to fetch backend config, using fallback STUN', err);
            } finally {
                hasFetchedIce.current = true;
            }
        };
        fetchIce();
    }, []);

    // Keep localStreamRef in sync with Zustand state
    useEffect(() => {
        localStreamRef.current = localStream;
    }, [localStream]);

    const roomIdRef = useRef<string | null>(null);

    // --- Core WebRTC functions (all use refs, no stale closures) ---

    const closeConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
            (window as any).debugPC = null;
        }
        pendingCandidates.current = [];
        setRemoteStream(null);
        setPartnerConnected(false);
    }, [setRemoteStream, setPartnerConnected]);

    const initializeConnection = useCallback((roomId: string) => {
        // Clean up any existing connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        pendingCandidates.current = [];

        const pc = new RTCPeerConnection({
            iceServers: iceServersRef.current,
            iceCandidatePoolSize: 10
        });

        // Add local tracks from ref (avoids stale closure over localStream state)
        const stream = localStreamRef.current;
        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                console.log('[WebRTC] Local ICE candidate generated', event.candidate.candidate);
                socket.emit('ice-candidate', { roomId, candidate: event.candidate });
            } else {
                console.log('[WebRTC] Local ICE candidate gathering complete');
            }
        };

        pc.ontrack = (event) => {
            console.log('[WebRTC] Received remote track', event.track.kind);
            const remoteStream = event.streams?.[0] ?? new MediaStream([event.track]);
            setRemoteStream(remoteStream);
            setPartnerConnected(true);
            setConnectionState('connected');
            setSearching(false);
        };

        pc.oniceconnectionstatechange = () => console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
        pc.onconnectionstatechange = () => console.log('[WebRTC] Full Connection State:', pc.connectionState);
        pc.onsignalingstatechange = () => console.log('[WebRTC] Signaling State:', pc.signalingState);

        // Negotiate gracefully if tracks are dynamically added (e.g. from missing permissions)
        pc.onnegotiationneeded = async () => {
            try {
                if (pc.signalingState !== "stable") return;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (socket && currentRoomIdRef.current) {
                     socket.emit('offer', { roomId: currentRoomIdRef.current, offer });
                }
            } catch (e) {
                console.error('[WebRTC] Renegotiation error:', e);
            }
        };

        peerConnectionRef.current = pc;
        (window as any).debugPC = pc;
        return pc;
    }, [socket, setRemoteStream, setPartnerConnected, setConnectionState, setSearching]);

    const createOffer = useCallback(async (roomId: string) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        try {
            console.log('[WebRTC] Creating Offer');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit('offer', { roomId, offer });
        } catch (err) {
            console.error('[WebRTC] createOffer failed:', err);
        }
    }, [socket]);

    const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit, roomId: string) => {
        const pc = peerConnectionRef.current;
        if (!pc) { console.error('[WebRTC] createAnswer: no peer connection'); return; }
        try {
            console.log('[WebRTC] Creating Answer. Applying remote offer...');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            // Flush any queued ICE candidates
            while (pendingCandidates.current.length > 0) {
                const c = pendingCandidates.current.shift();
                if (c) {
                    console.log('[WebRTC] Emptying queued ICE candidate queue...');
                    await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
                }
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket?.emit('answer', { roomId, answer });
        } catch (err) {
            console.error('[WebRTC] createAnswer failed:', err);
        }
    }, [socket]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        try {
            console.log('[WebRTC] Received remote Answer.');
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            // Flush any queued ICE candidates
            while (pendingCandidates.current.length > 0) {
                const c = pendingCandidates.current.shift();
                if (c) {
                    console.log('[WebRTC] Emptying queued ICE candidate queue (after answer)...');
                    await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
                }
            }
        } catch (err) {
            console.error('[WebRTC] handleAnswer failed:', err);
        }
    }, []);

    const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        console.log('[WebRTC] Received remote ICE candidate', candidate.candidate);
        if (pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        } else {
            console.log('[WebRTC] Queuing ICE candidate (No remote description yet)');
            pendingCandidates.current.push(candidate);
        }
    }, []);

    // --- Camera initialization ---
    const requestMedia = useCallback(async () => {
        if (localStreamRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Sync with ongoing UI states
            stream.getAudioTracks().forEach(t => { t.enabled = !useCallStore.getState().isMuted; });
            stream.getVideoTracks().forEach(t => { t.enabled = useCallStore.getState().cameraOn; });

            setLocalStream(stream);

            // Dynamically add to peer connection if we are already connected!
            const pc = peerConnectionRef.current;
            if (pc) {
                const senders = pc.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (!sender) {
                        pc.addTrack(track, stream);
                    }
                });
            }
        } catch (err: any) {
            console.error('Camera error:', err);
            const errorMsg = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'Permissions denied.' : err.name === 'NotFoundError' ? 'Device not found.' : err.message;
            toast.error(`Could not connect to camera: ${errorMsg}`);
        }
    }, [setLocalStream]);

    useEffect(() => {
        // initial blind request
        requestMedia();
    }, [requestMedia]); 

    // --- Socket event listeners + join (runs once when socket is ready) ---
    useEffect(() => {
        if (!socket) return;

        const onMatched = ({ roomId: newRoomId, initiator }: { roomId: string; initiator: boolean }) => {
            console.log('Matched! Room:', newRoomId, 'Initiator:', initiator);
            currentRoomIdRef.current = newRoomId;
            roomIdRef.current = newRoomId;
            setRoomId(newRoomId);
            clearMessages();
            initializeConnection(newRoomId);
            if (initiator) {
                createOffer(newRoomId);
            }
        };

        const onOfferWrapper = (payload: any) => {
            // Check if backend nested the payload as { roomId, offer }
            const offer = payload.roomId ? payload.offer : payload;
            const roomId = payload.roomId || currentRoomIdRef.current;
            if (roomId) createAnswer(offer, roomId);
        };

        const onAnswerWrapper = (payload: any) => {
            const answer = payload.roomId ? payload.answer : payload;
            handleAnswer(answer);
        };

        const onIceCandidateWrapper = (payload: any) => {
            // DO NOT check `payload.candidate` because the actual RTCIceCandidate object
            // also has a `.candidate` string property. Checking `.roomId` is safe.
            const candidate = payload.roomId ? payload.candidate : payload;
            addIceCandidate(candidate);
        };

        const onChatMessage = (message: string) => {
            addMessage({ id: Date.now().toString(), sender: 'stranger', text: message });
        };

        const onPartnerLeft = () => {
            closeConnection();
            currentRoomIdRef.current = null;
            roomIdRef.current = null;
            setRoomId(null);
            clearMessages();
            
            // Immediate rematch logic
            hasJoined.current = false;
            if (hasFetchedIce.current) {
                hasJoined.current = true;
                socket.emit('join');
                setConnectionState('searching');
                setSearching(true);
            }
        };

        socket.on('matched', onMatched);
        socket.on('offer', onOfferWrapper);
        socket.on('answer', onAnswerWrapper);
        socket.on('ice-candidate', onIceCandidateWrapper);
        socket.on('chat-message', onChatMessage);
        socket.on('partner-left', onPartnerLeft);

        // Emit join immediately (no camera permission needed)
        const tryJoin = () => {
            if (hasFetchedIce.current && !hasJoined.current) {
                hasJoined.current = true;
                console.log('Emitting join...');
                socket.emit('join');
                setConnectionState('searching');
                setSearching(true);
            }
        };

        tryJoin();
        // Poll every 200ms until camera is ready (handles async camera load)
        const joinInterval = setInterval(() => {
            if (hasJoined.current) { clearInterval(joinInterval); return; }
            tryJoin();
        }, 200);

        return () => {
            clearInterval(joinInterval);
            socket.off('matched', onMatched);
            socket.off('offer', onOfferWrapper);
            socket.off('answer', onAnswerWrapper);
            socket.off('ice-candidate', onIceCandidateWrapper);
            socket.off('chat-message', onChatMessage);
            socket.off('partner-left', onPartnerLeft);
        };
    }, [socket]); // ← ONLY depends on socket. All other values read from refs.

    // --- Sync mute/camera state ---
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
            localStream.getVideoTracks().forEach(t => { t.enabled = cameraOn; });
        }
    }, [localStream, isMuted, cameraOn]);

    const skip = useCallback(() => {
        closeConnection();
        if (socket && roomIdRef.current) {
            socket.emit('skip', { roomId: roomIdRef.current });
        }
        currentRoomIdRef.current = null;
        roomIdRef.current = null;
        setRoomId(null);
        clearMessages();
        
        hasJoined.current = false; // allow re-join
        if (socket) {
             hasJoined.current = true;
             socket.emit('join');
             setConnectionState('searching');
             setSearching(true);
        }
    }, [closeConnection, setConnectionState, setSearching, socket, clearMessages, setRoomId]);

    return { skip, requestMedia };
};
