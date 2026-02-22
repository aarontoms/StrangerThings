import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import { motion, AnimatePresence } from 'framer-motion';

export const VideoPlayer = () => {
    const { localStream, remoteStream, connectionState, partnerConnected, searching } = useCallStore();
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    return (
        <div className="relative w-full bg-black" style={{ height: 'calc(100vh - 140px)' }}>
            {/* Remote Video (Main Area) */}
            <motion.video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover rounded-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: partnerConnected ? 1 : 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
            />

            {/* Status Overlay */}
            <AnimatePresence>
                {(!partnerConnected || searching || connectionState === 'disconnected') && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                        <div className="bg-black/60 px-6 py-4 rounded-xl text-base text-gray-50 backdrop-blur-sm">
                            {searching
                                ? "Searching for stranger..."
                                : connectionState === 'partner_left'
                                    ? "Stranger disconnected"
                                    : connectionState === 'connecting'
                                        ? "Connecting..."
                                        : "Ready to start"}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Local Video Overlay */}
            <AnimatePresence>
                {localStream && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute bottom-5 right-5 w-[220px] h-[140px] rounded-xl overflow-hidden shadow-2xl border-2 border-surface-border z-10"
                    >
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
