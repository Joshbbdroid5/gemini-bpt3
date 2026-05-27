import React from 'react';
import { User, Wallet, Award, TrendingUp } from 'lucide-react';

interface ProfilePageProps {
  telegramName: string;
  walletBalance: number;
  gamesWon: number;
  totalEarnings: number;
  telegramDisplayName: string;
  onViewHistory: () => void;
}

export default function ProfilePage({ telegramName, walletBalance, gamesWon, totalEarnings, telegramDisplayName, onViewHistory }: ProfilePageProps) {
  return (
    <div className="flex-1 flex flex-col items-center p-6 text-white overflow-y-auto">
      <div className="w-24 h-24 rounded-full bg-indigo-600 border-4 border-white/10 flex items-center justify-center shadow-2xl mb-4 shrink-0">
        <User size={48} className="text-white" />
      </div>
      <div className="flex flex-col items-center mb-8">
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-center leading-tight">
          {telegramDisplayName || `User ${telegramName}`}
        </h2>
        <p className="text-[10px] text-gray-400 italic font-medium mt-1 uppercase tracking-widest opacity-70">ID: {telegramName}</p>
      </div>

      <div className="w-full max-w-sm space-y-4 mb-8">
        <StatRow icon={<Wallet className="text-lime-400" size={20} />} label="Balance" value={`${walletBalance.toLocaleString()} ETB`} />
        <StatRow icon={<Award className="text-blue-400" size={20} />} label="Games Won" value={gamesWon.toString()} />
        <StatRow icon={<TrendingUp className="text-yellow-400" size={20} />} label="Earnings" value={`${totalEarnings.toLocaleString()} ETB`} />
      </div>

      <button 
        onClick={onViewHistory} 
        className="w-full max-w-sm bg-white text-indigo-950 font-black py-4 rounded-2xl shadow-xl hover:bg-yellow-400 active:scale-95 transition-all uppercase text-sm tracking-widest"
      >
        View Full History
      </button>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-inner backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{label}</span>
      </div>
      <span className="text-lg font-black italic">{value}</span>
    </div>
  );
}