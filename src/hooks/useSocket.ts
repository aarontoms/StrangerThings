import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

export const useSocket = () => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // For now we don't connect to a real backend to keep it error-free
        // socketRef.current = io('http://localhost:3000', { autoConnect: false });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    return socketRef.current;
};
