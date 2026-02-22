import { useState } from 'react';
import { Header } from '../components/Header';
import { VideoPlayer } from '../components/VideoPlayer';
import { ControlsBar } from '../components/ControlsBar';
import { ChatPanel } from '../components/ChatPanel';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import clsx from 'clsx';
import { MessageSquare, X } from 'lucide-react';

export const Home = () => {
    // Initialize hooks that manage global state lifecycle
    useSocket();
    useWebRTC();

    const [chatOpen, setChatOpen] = useState(false);

    return (
        <div className="flex flex-col h-screen w-full bg-surface text-gray-50 overflow-hidden font-sans">
            <Header />

            <div className="flex flex-1 relative min-h-0 overflow-hidden">

                {/* Main Video & Controls Area */}
                <div className="flex-1 flex flex-col relative w-full h-full min-w-0">
                    <div className="flex-1 relative bg-black">
                        <VideoPlayer />

                        {/* Mobile Chat Toggle (Visible on smaller screens when chat is closed) */}
                        <button
                            className={clsx(
                                "absolute bottom-24 right-5 lg:hidden bg-brand p-3 rounded-full shadow-lg z-20 hover:bg-brand-hover transition-colors outline-none",
                                chatOpen ? "hidden" : "block"
                            )}
                            onClick={() => setChatOpen(true)}
                            aria-label="Open Chat"
                        >
                            <MessageSquare size={24} className="text-white" />
                        </button>
                    </div>
                    <ControlsBar />
                </div>

                {/* Desktop Chat Panel */}
                <div className="hidden lg:block h-full">
                    <ChatPanel />
                </div>

                {/* Mobile/Tablet Chat Drawer/Modal */}
                {chatOpen && (
                    <div className="lg:hidden absolute inset-0 z-50 flex flex-col bg-surface-panel shadow-2xl">
                        {/* Mobile Chat Header */}
                        <div className="h-[56px] border-b border-surface-border flex items-center justify-between px-5 shrink-0 bg-surface">
                            <span className="font-semibold text-gray-50 uppercase text-sm tracking-wide">
                                Live Chat
                            </span>
                            <button
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-border transition-colors outline-none"
                                onClick={() => setChatOpen(false)}
                                aria-label="Close Chat"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {/* Mobile Chat Area */}
                        <div className="flex-1 flex w-full">
                            <div className="w-full">
                                <ChatPanel />
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
