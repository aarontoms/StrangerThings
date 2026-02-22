import { useEffect, useRef, useCallback, useState } from 'react';
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
    const [roomId, setRoomId] = useState<string | null>(null);
    const currentRoomIdRef = useRef<string | null>(null);
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
    const hasJoinedRef = useRef(false);

    const closeConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.onicecandidate = null;
            peerConnectionRef.current.ontrack = null;
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        pendingCandidates.current = [];
        setRemoteStream(null);
        setPartnerConnected(false);
    }, [setRemoteStream, setPartnerConnected]);

    const initializeConnection = useCallback((currentRoomId: string) => {
        if (peerConnectionRef.current) {
            closeConnection();
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
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
            if (event.candidate && socket && currentRoomId) {
                socket.emit('ice-candidate', { roomId: currentRoomId, candidate: event.candidate });
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams.length > 0) {
                setRemoteStream(event.streams[0]);
            } else {
                setRemoteStream(new MediaStream([event.track]));
            }
            setPartnerConnected(true);
            setConnectionState('connected');
            setSearching(false);
        };

        peerConnectionRef.current = peerConnection;
        (window as any).debugPC = peerConnection;
        return peerConnection;
    }, [localStream, socket, closeConnection, setRemoteStream, setPartnerConnected, setConnectionState, setSearching]);

    const createOffer = useCallback(async (currentRoomId: string) => {
        const peerConnection = peerConnectionRef.current;
        if (!peerConnection) {
            console.error('No peer connection to offer on!');
            return;
        }
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            if (socket) {
                socket.emit('offer', { roomId: currentRoomId, offer });
            }
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }, [socket]);

    const createAnswer = useCallback(async (offer: RTCSessionDescriptionInit, currentRoomId: string) => {
        const peerConnection = peerConnectionRef.current;
        if (!peerConnection) {
            console.error('No peer connection to answer on!');
            return;
        }
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            while (pendingCandidates.current.length > 0) {
                const candidate = pendingCandidates.current.shift();
                if (candidate) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.error('Failed to add pending ICE', e);
                    }
                }
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            if (socket) {
                socket.emit('answer', { roomId: currentRoomId, answer });
            }
        } catch (error) {
            console.error('Error creating answer:', error);
        }
    }, [socket]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        try {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));

                while (pendingCandidates.current.length > 0) {
                    const candidate = pendingCandidates.current.shift();
                    if (candidate) {
                        try {
                            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                        } catch (e) {
                            console.error('Failed to add pending ICE on answer', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }, []);

    const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        try {
            if (peerConnectionRef.current) {
                if (peerConnectionRef.current.remoteDescription) {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    pendingCandidates.current.push(candidate);
                }
            }
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }, []);

    // Auto-join only once media is ready
    useEffect(() => {
        if (socket && localStream && !hasJoinedRef.current) {
            hasJoinedRef.current = true;
            socket.emit("join"); // Start finding a partner
        }
    }, [socket, localStream]);

    // Set up socket listeners
    useEffect(() => {
        if (!socket) return;

        const handleMatched = ({ roomId: newRoomId, initiator }: { roomId: string, initiator: boolean }) => {
            setRoomId(newRoomId);
            currentRoomIdRef.current = newRoomId;
            initializeConnection(newRoomId);
            if (initiator) {
                createOffer(newRoomId);
            }
        };

        const handleOffer = (offer: RTCSessionDescriptionInit) => {
            if (currentRoomIdRef.current) {
                createAnswer(offer, currentRoomIdRef.current);
            }
        };

        const handlePartnerLeft = () => {
            closeConnection();
            currentRoomIdRef.current = null;
            setConnectionState('partner_left');
        };

        socket.on('matched', handleMatched);
        socket.on('offer', handleOffer);
        socket.on('answer', handleAnswer);
        socket.on('ice-candidate', addIceCandidate);
        socket.on('partner-left', handlePartnerLeft);

        return () => {
            socket.off('matched', handleMatched);
            socket.off('offer', handleOffer);
            socket.off('answer', handleAnswer);
            socket.off('ice-candidate', addIceCandidate);
            socket.off('partner-left', handlePartnerLeft);
        };
    }, [socket, createOffer, createAnswer, handleAnswer, addIceCandidate, closeConnection, setConnectionState, initializeConnection]);

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
        if (socket && roomId) {
            socket.emit('skip', { roomId });
        }
        setRoomId(null);
        currentRoomIdRef.current = null;
        if (socket) {
            socket.emit('join');
        }
    }, [closeConnection, setConnectionState, setSearching, socket, roomId]);

    const end = useCallback(() => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        setLocalStream(null);
        closeConnection();
        setConnectionState('disconnected');
        setSearching(false);
        if (socket && roomId) {
            socket.emit('end', { roomId }); // End also signals partner leaving to server if desired
        }
    }, [localStream, closeConnection, setLocalStream, setConnectionState, setSearching, socket, roomId]);

    return { skip, end, createOffer, createAnswer, handleAnswer, addIceCandidate, closeConnection };
};
