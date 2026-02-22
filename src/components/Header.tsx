import { Settings } from 'lucide-react';

export const Header = () => {
    return (
        <header className="h-[56px] bg-surface-panel border-b border-surface-border px-5 flex items-center justify-between shrink-0">
            <div className="font-semibold text-lg text-gray-50 uppercase tracking-wide">
                Omegle Clone
            </div>
            <button
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-border transition-colors duration-200 focus:outline-none"
                aria-label="Settings"
            >
                <Settings size={20} />
            </button>
        </header>
    );
};
