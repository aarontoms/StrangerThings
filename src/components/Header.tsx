import { Settings, Users } from 'lucide-react';
import { useCallStore } from '../store/useCallStore';

export const Header = () => {
    const { onlineCount } = useCallStore();

    return (
        <header className="h-[56px] bg-surface-panel border-b border-surface-border px-5 flex items-center justify-between shrink-0">
            <div className="font-semibold text-lg text-gray-50 uppercase tracking-wide">
                StrangerThings
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                    <Users size={16} />
                    {onlineCount} Online
                </div>
                <button
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-surface-border transition-colors duration-200 focus:outline-none"
                    aria-label="Settings"
                >
                    <Settings size={20} />
                </button>
            </div>
        </header>
    );
};
