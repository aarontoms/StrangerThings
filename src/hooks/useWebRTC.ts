import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import toast from 'react-hot-toast';

export const useWebRTC = () => {
    const {
        setLocalStream,
        setConnectionState,
        setSearching,
        setPartnerConnected,
        isMuted,
        cameraOn,
        localStream
    } = useCallStore();

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

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
        initCamera();

        return () => {
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

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

    const skip = () => {
        // Logic for skipping:
        // 1. disconnect current session
        // 2. enter searching state
        setPartnerConnected(false);
        setConnectionState('searching');
        setSearching(true);
        // In real implementation: Notify backend, close old peer connection, wait for new match
    };

    const end = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        setLocalStream(null);
        setPartnerConnected(false);
        setConnectionState('disconnected');
        setSearching(false);
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
    };

    return { skip, end };
};
