import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../store/useCallStore';
import toast from 'react-hot-toast';
import { useSocket } from './useSocket';

export const useWebRTC = () => {
    const {
        setLocalStream,
        setRemoteStream,
        setConnectionState,
        setSearching,
        setPartnerConnected,
        isMuted,
        cameraOn,
        localStream
    } = useCallStore();

    const socket = useSocket();

    // Use refs for everything that needs to be accessed inside callbacks
    // without causing or depending on re-renders
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const currentRoomIdRef = useRef<string | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
    const hasJoined = useRef(false);

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
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        });

        // Add local tracks from ref (avoids stale closure over localStream state)
        const stream = localStreamRef.current;
        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('ice-candidate', { roomId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            const remoteStream = event.streams?.[0] ?? new MediaStream([event.track]);
            setRemoteStream(remoteStream);
            setPartnerConnected(true);
            setConnectionState('connected');
            setSearching(false);
        };

        peerConnectionRef.current = pc;
        (window as any).debugPC = pc;
        return pc;
    }, [socket, setRemoteStream, setPartnerConnected, setConnectionState, setSearching]);

    const createOffer = useCallback(async (roomId: string) => {
        const pc = initializeConnection(roomId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit('offer', { roomId, offer });
        } catch (err) {
            console.error('createOffer failed:', err);
        }
    }, [initializeConnection, socket]);

    const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit, roomId: string) => {
        const pc = peerConnectionRef.current;
        if (!pc) { console.error('createAnswer: no peer connection'); return; }
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            // Flush any queued ICE candidates
            while (pendingCandidates.current.length > 0) {
                const c = pendingCandidates.current.shift();
                if (c) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket?.emit('answer', { roomId, answer });
        } catch (err) {
            console.error('createAnswer failed:', err);
        }
    }, [socket]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            // Flush any queued ICE candidates
            while (pendingCandidates.current.length > 0) {
                const c = pendingCandidates.current.shift();
                if (c) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
            }
        } catch (err) {
            console.error('handleAnswer failed:', err);
        }
    }, []);

    const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        const pc = peerConnectionRef.current;
        if (!pc) return;
        if (pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        } else {
            pendingCandidates.current.push(candidate);
        }
    }, []);

    // --- Camera initialization (runs once) ---
    useEffect(() => {
        let isMounted = true;
        let activeStream: MediaStream | null = null;

        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

                // If React immediately unmounted the component (StrictMode), free the hardware immediately
                if (!isMounted) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                activeStream = stream;
                setLocalStream(stream);
                localStreamRef.current = stream;
            } catch (err: any) {
                if (isMounted) {
                    console.error('Camera error:', err);
                    const errorMsg = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'Permissions denied.' : err.name === 'NotFoundError' ? 'Device not found.' : err.message;
                    toast.error(`Could not connect to camera: ${errorMsg}`);
                }
            }
        };

        if (!localStreamRef.current) {
            initCamera();
        }

        return () => {
            isMounted = false;
            // Free the hardware lock so immediate remount accesses it successfully
            if (activeStream) {
                activeStream.getTracks().forEach(t => t.stop());
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Socket event listeners + join (runs once when socket is ready) ---
    useEffect(() => {
        if (!socket) return;

        const onMatched = ({ roomId: newRoomId, initiator }: { roomId: string; initiator: boolean }) => {
            console.log('Matched! Room:', newRoomId, 'Initiator:', initiator);
            currentRoomIdRef.current = newRoomId;
            roomIdRef.current = newRoomId;
            initializeConnection(newRoomId);
            if (initiator) {
                createOffer(newRoomId);
            }
        };

        const onOffer = (offer: RTCSessionDescriptionInit) => {
            const roomId = currentRoomIdRef.current;
            if (roomId) createAnswer(offer, roomId);
        };

        const onPartnerLeft = () => {
            closeConnection();
            currentRoomIdRef.current = null;
            roomIdRef.current = null;
            setConnectionState('partner_left');
        };

        socket.on('matched', onMatched);
        socket.on('offer', onOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', addIceCandidate);
        socket.on('partner-left', onPartnerLeft);

        // Emit join once camera is ready, or wait for it
        const tryJoin = () => {
            if (localStreamRef.current && !hasJoined.current) {
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
            socket.off('offer', onOffer);
            socket.off('answer', handleAnswer);
            socket.off('ice-candidate', addIceCandidate);
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
        setConnectionState('searching');
        setSearching(true);
        if (socket && roomIdRef.current) {
            socket.emit('skip', { roomId: roomIdRef.current });
        }
        currentRoomIdRef.current = null;
        roomIdRef.current = null;
        hasJoined.current = false; // allow re-join
        if (socket) socket.emit('join');
    }, [closeConnection, setConnectionState, setSearching, socket]);

    const end = useCallback(() => {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        setLocalStream(null);
        localStreamRef.current = null;
        closeConnection();
        setConnectionState('disconnected');
        setSearching(false);
        if (socket && roomIdRef.current) {
            socket.emit('end', { roomId: roomIdRef.current });
        }
    }, [closeConnection, setLocalStream, setConnectionState, setSearching, socket]);

    return { skip, end };
};
