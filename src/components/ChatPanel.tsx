import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

import { useCallStore } from '../store/useCallStore';
import { useSocket } from '../hooks/useSocket';

export const ChatPanel = () => {
    const { messages, addMessage, connectionState, roomId } = useCallStore();
    const socket = useSocket();
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!input.trim() || connectionState !== 'connected' || !roomId) return;
        const text = input.trim();
        addMessage({ id: Date.now().toString(), sender: 'you', text });
        socket.emit('chat-message', { roomId, message: text });
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="w-full lg:w-[320px] bg-surface-panel border-l border-surface-border flex flex-col h-full shrink-0">

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={clsx(
                                "max-w-[80%] rounded-2xl px-3 py-2 text-sm text-gray-100 shadow-sm",
                                msg.sender === 'you'
                                    ? "bg-brand self-end rounded-tr-sm"
                                    : "bg-surface-border self-start rounded-tl-sm"
                            )}
                        >
                            {msg.text}
                        </motion.div>
                    ))}
                </AnimatePresence>
                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 pt-2 border-t border-surface-border bg-surface-panel">
                <div className="relative flex items-center">
                    <input
                        type="text"
                        className="w-full h-11 bg-surface border border-surface-border rounded-xl pl-3 pr-10 text-sm focus:outline-none focus:border-brand transition-colors text-white placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder={connectionState === 'connected' ? "Type a message..." : "Waiting for stranger..."}
                        value={input}
                        disabled={connectionState !== 'connected'}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        onClick={handleSend}
                        className="absolute right-2 p-1.5 text-gray-400 hover:text-brand transition-colors focus:outline-none"
                        aria-label="Send message"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
