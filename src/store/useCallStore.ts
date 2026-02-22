import { create } from 'zustand';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'searching' | 'partner_left';

interface CallState {
    connectionState: ConnectionState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    cameraOn: boolean;
    partnerConnected: boolean;
    searching: boolean;

    setConnectionState: (state: ConnectionState) => void;
    setLocalStream: (stream: MediaStream | null) => void;
    setRemoteStream: (stream: MediaStream | null) => void;
    setIsMuted: (isMuted: boolean) => void;
    setCameraOn: (cameraOn: boolean) => void;
    setPartnerConnected: (connected: boolean) => void;
    setSearching: (searching: boolean) => void;
}

export const useCallStore = create<CallState>((set) => ({
    connectionState: 'disconnected',
    localStream: null,
    remoteStream: null,
    isMuted: false,
    cameraOn: true,
    partnerConnected: false,
    searching: false,

    setConnectionState: (connectionState) => set({ connectionState }),
    setLocalStream: (localStream) => set({ localStream }),
    setRemoteStream: (remoteStream) => set({ remoteStream }),
    setIsMuted: (isMuted) => set({ isMuted }),
    setCameraOn: (cameraOn) => set({ cameraOn }),
    setPartnerConnected: (partnerConnected) => set({ partnerConnected }),
    setSearching: (searching) => set({ searching }),
}));
