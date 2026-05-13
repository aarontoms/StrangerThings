import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCallStore } from '../store/useCallStore';

// Initialize the socket outside the hook to ensure ONLY ONE instance exists globally
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const socket: Socket = io(BACKEND_URL, {
    autoConnect: false
});

export const useSocket = () => {
    const { setIsBackendOffline, setOnlineCount } = useCallStore();

    useEffect(() => {
        // Only connect if not already connected
        if (!socket.connected) {
            socket.connect();
        }

        const onConnect = () => setIsBackendOffline(false);
        const onDisconnect = () => setIsBackendOffline(true);
        const onConnectError = () => setIsBackendOffline(true);
        const onOnlineCount = (count: number) => setOnlineCount(count);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('online-count', onOnlineCount);

        // We intentionally do not disconnect here because React 18 Strict Mode 
        // will aggressively mount/unmount/remount, causing connection thrashing.
        // Sharing a global socket also means unmounting one component shouldn't kill it for others.

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            socket.off('online-count', onOnlineCount);
        };
    }, [setIsBackendOffline, setOnlineCount]);

    return socket;
};
