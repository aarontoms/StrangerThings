import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../store/useCallStore';
import { useSocket } from './useSocket';

export const useWebRTC = () => {
    const { setLocalStream, setRemoteStream, localStream } = useCallStore();
    const socket = useSocket();
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    // 2. Request camera & microphone and store local stream
    useEffect(() => {
        let stream: MediaStream | null = null;
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((mediaStream) => {
                stream = mediaStream;
                setLocalStream(mediaStream);
            })
            .catch((err) => console.error("Error accessing media devices.", err));

        return () => {
            // 12. Cleanup: stop tracks
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
            }
            closeConnection();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount

    const initPeerConnection = useCallback(() => {
        if (peerConnectionRef.current) return peerConnectionRef.current;

        // 3. Create an RTCPeerConnection with STUN configuration
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peerConnectionRef.current = peerConnection;

        // 4. Add all local tracks to the peer connection
        if (localStream) {
            localStream.getTracks().forEach(track =>
                peerConnection.addTrack(track, localStream)
            );
        }

        // 5. Handle remote stream
        peerConnection.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        // 6. Implement ICE candidate handling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit("ice-candidate", event.candidate);
            }
        };

        return peerConnection;
    }, [localStream, setRemoteStream, socket]);

    // 7. Implement functions
    const createOffer = useCallback(async () => {
        const peerConnection = initPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (socket) socket.emit("offer", offer);
    }, [initPeerConnection, socket]);

    const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit) => {
        const peerConnection = initPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        if (socket) socket.emit("answer", answer);
    }, [initPeerConnection, socket]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }, []);

    const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, []);

    const closeConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        setRemoteStream(null);
    }, [setRemoteStream]);

    // 8. Connect signaling using socket.io-client
    useEffect(() => {
        if (!socket) return;

        const onOffer = (offer: RTCSessionDescriptionInit) => {
            createAnswer(offer);
        };

        const onAnswer = (answer: RTCSessionDescriptionInit) => {
            handleAnswer(answer);
        };

        const onIceCandidate = (candidate: RTCIceCandidateInit) => {
            addIceCandidate(candidate);
        };

        // receive "offer", "answer", "ice-candidate"
        socket.on("offer", onOffer);
        socket.on("answer", onAnswer);
        socket.on("ice-candidate", onIceCandidate);

        return () => {
            socket.off("offer", onOffer);
            socket.off("answer", onAnswer);
            socket.off("ice-candidate", onIceCandidate);
        };
    }, [socket, createAnswer, handleAnswer, addIceCandidate]);

    // Example skip method used by ControlsBar
    const skip = useCallback(() => {
        // 12. Cleanup: close peer connection on skip
        closeConnection();
        if (socket) socket.emit("skip");
    }, [closeConnection, socket]);

    // Example end method used by ControlsBar
    const end = useCallback(() => {
        // 12. Cleanup: close peer connection on disconnect
        closeConnection();
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        setLocalStream(null);
        if (socket) socket.emit("end");
    }, [closeConnection, localStream, setLocalStream, socket]);

    return {
        createOffer,
        createAnswer,
        handleAnswer,
        addIceCandidate,
        closeConnection,
        skip,
        end,
    };
};
