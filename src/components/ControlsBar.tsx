import { useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, FastForward } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallStore } from '../store/useCallStore';
import { useWebRTC } from '../hooks/useWebRTC';
import clsx from 'clsx';

export const ControlsBar = () => {
    const { isMuted, cameraOn, setIsMuted, setCameraOn, connectionState } = useCallStore();
    const { skip, requestMedia } = useWebRTC();

    const isConnecting = connectionState === 'connecting';

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isConnecting) {
                skip();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [skip, isConnecting]);

    const toggleMic = () => { setIsMuted(!isMuted); requestMedia(); };
    const toggleCamera = () => { setCameraOn(!cameraOn); requestMedia(); };

    return (
        <div className="h-[84px] bg-surface-panel border-t border-surface-border flex items-center justify-center gap-[18px] shrink-0">

            {/* Mic Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMic}
                className={clsx(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-200 outline-none",
                    isMuted ? "bg-danger text-white" : "bg-surface-border text-gray-200 hover:bg-gray-700"
                )}
                aria-label={isMuted ? "Unmute" : "Mute"}
            >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </motion.button>

            {/* Camera Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleCamera}
                className={clsx(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-200 outline-none",
                    !cameraOn ? "bg-danger text-white" : "bg-surface-border text-gray-200 hover:bg-gray-700"
                )}
                aria-label={!cameraOn ? "Turn on camera" : "Turn off camera"}
            >
                {!cameraOn ? <VideoOff size={22} /> : <Video size={22} />}
            </motion.button>

            {/* Skip Button */}
            <motion.button
                whileHover={!isConnecting ? { scale: 1.03 } : {}}
                whileTap={!isConnecting ? { scale: 0.97 } : {}}
                disabled={isConnecting}
                onClick={skip}
                className={clsx(
                    "w-[140px] h-14 rounded-[28px] flex items-center justify-center gap-2 font-semibold text-white transition-colors duration-200 outline-none",
                    isConnecting ? "bg-brand/50 cursor-not-allowed" : "bg-brand hover:bg-brand-hover"
                )}
            >
                <FastForward size={20} fill="currentColor" />
                Skip
            </motion.button>
        </div>
    );
};
