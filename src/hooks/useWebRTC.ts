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
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    const closeConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        setRemoteStream(null);
        setPartnerConnected(false);
    }, [setRemoteStream, setPartnerConnected]);

    const initializeConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            closeConnection();
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        // Add local tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
                setPartnerConnected(true);
                setConnectionState('connected');
                setSearching(false);
            }
        };

        peerConnectionRef.current = peerConnection;
        return peerConnection;
    }, [localStream, socket, closeConnection, setRemoteStream, setPartnerConnected, setConnectionState, setSearching]);

    const createOffer = useCallback(async () => {
        const peerConnection = initializeConnection();
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            if (socket) {
                socket.emit('offer', offer);
            }
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }, [initializeConnection, socket]);

    const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit) => {
        const peerConnection = initializeConnection();
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            if (socket) {
                socket.emit('answer', answer);
            }
        } catch (error) {
            console.error('Error creating answer:', error);
        }
    }, [initializeConnection, socket]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        try {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }, []);

    const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        try {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }, []);

    // Set up socket listeners
    useEffect(() => {
        if (!socket) return;

        socket.on('offer', createAnswer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', addIceCandidate);

        return () => {
            socket.off('offer', createAnswer);
            socket.off('answer', handleAnswer);
            socket.off('ice-candidate', addIceCandidate);
        };
    }, [socket, createAnswer, handleAnswer, addIceCandidate]);

    // Initialize camera
    useEffect(() => {
        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                setLocalStream(stream);
            } catch (err) {
                console.error('Error accessing media devices.', err);
                toast.error('Could not access camera and microphone.');
            }
        };

        if (!localStream) {
            initCamera();
        }

        return () => {
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync mute/video state
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
            localStream.getVideoTracks().forEach(track => {
                track.enabled = cameraOn;
            });
        }
    }, [localStream, isMuted, cameraOn]);

    const skip = useCallback(() => {
        closeConnection();
        setConnectionState('searching');
        setSearching(true);
        if (socket) {
            socket.emit('skip');
        }
    }, [closeConnection, setConnectionState, setSearching, socket]);

    const end = useCallback(() => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        setLocalStream(null);
        closeConnection();
        setConnectionState('disconnected');
        setSearching(false);
        if (socket) {
            socket.emit('end');
        }
    }, [localStream, closeConnection, setLocalStream, setConnectionState, setSearching, socket]);

    return { skip, end, createOffer, createAnswer, handleAnswer, addIceCandidate, closeConnection };
};
