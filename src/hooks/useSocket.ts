import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// Initialize the socket outside the hook to ensure ONLY ONE instance exists globally
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const socket: Socket = io(BACKEND_URL, {
    autoConnect: false
});

export const useSocket = () => {
    useEffect(() => {
        // Only connect if not already connected
        if (!socket.connected) {
            socket.connect();
        }

        // We intentionally do not disconnect here because React 18 Strict Mode 
        // will aggressively mount/unmount/remount, causing connection thrashing.
        // Sharing a global socket also means unmounting one component shouldn't kill it for others.
    }, []);

    return socket;
};
