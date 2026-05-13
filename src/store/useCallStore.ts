import { create } from 'zustand';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'searching' | 'partner_left';

export type Message = {
    id: string;
    sender: 'you' | 'stranger';
    text: string;
};

interface CallState {
    connectionState: ConnectionState;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isMuted: boolean;
    cameraOn: boolean;
    partnerConnected: boolean;
    searching: boolean;
    roomId: string | null;
    messages: Message[];
    onlineCount: number;
    isBackendOffline: boolean;

    setConnectionState: (state: ConnectionState) => void;
    setLocalStream: (stream: MediaStream | null) => void;
    setRemoteStream: (stream: MediaStream | null) => void;
    setIsMuted: (isMuted: boolean) => void;
    setCameraOn: (cameraOn: boolean) => void;
    setPartnerConnected: (connected: boolean) => void;
    setSearching: (searching: boolean) => void;
    setRoomId: (id: string | null) => void;
    addMessage: (msg: Message) => void;
    clearMessages: () => void;
    setOnlineCount: (count: number) => void;
    setIsBackendOffline: (offline: boolean) => void;
}

export const useCallStore = create<CallState>((set) => ({
    connectionState: 'disconnected',
    localStream: null,
    remoteStream: null,
    isMuted: false,
    cameraOn: true,
    partnerConnected: false,
    searching: false,
    roomId: null,
    messages: [],
    onlineCount: 0,
    isBackendOffline: false,

    setConnectionState: (connectionState) => set({ connectionState }),
    setLocalStream: (localStream) => set({ localStream }),
    setRemoteStream: (remoteStream) => set({ remoteStream }),
    setIsMuted: (isMuted) => set({ isMuted }),
    setCameraOn: (cameraOn) => set({ cameraOn }),
    setPartnerConnected: (partnerConnected) => set({ partnerConnected }),
    setSearching: (searching) => set({ searching }),
    setRoomId: (roomId) => set({ roomId }),
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    clearMessages: () => set({ messages: [] }),
    setOnlineCount: (onlineCount) => set({ onlineCount }),
    setIsBackendOffline: (isBackendOffline) => set({ isBackendOffline }),
}));
