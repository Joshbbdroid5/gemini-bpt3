import React from 'react';
import { User, Wallet, Award, TrendingUp } from 'lucide-react'; // Importing necessary icons from lucide-react

interface ProfilePageProps {
  telegramName: string;
  walletBalance: number;
  gamesWon: number;
  totalEarnings: number;
}

export default function ProfilePage({ telegramName, walletBalance, gamesWon, totalEarnings }: ProfilePageProps) {
  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 text-white min-h-screen">
      <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-bold mb-4"> {/* User avatar placeholder */}
        <User size={48} />
      </div>
      <h2 className="text-3xl font-black mb-6">@{telegramName}</h2> {/* Display Telegram username */}

      <div className="w-full max-w-md bg-gray-800 rounded-2xl p-6 shadow-lg mb-6">
        <h3 className="text-xl font-bold mb-4">Your Stats</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-gray-300"><Wallet size={20} /> Wallet Balance:</span>
            <span className="font-bold text-lg text-green-400">{walletBalance.toLocaleString()} ETB</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-gray-300"><Award size={20} /> Games Won:</span>
            <span className="font-bold text-lg text-blue-400">{gamesWon}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-gray-300"><TrendingUp size={20} /> Total Earnings:</span>
            <span className="font-bold text-lg text-yellow-400">{totalEarnings.toLocaleString()} ETB</span>
          </div>
        </div>
      </div>

      {/* Example buttons, assuming they might be part of the original JSX that caused errors */}
      <button className="w-full max-w-md bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors mb-4">
        View Full History
      </button>
      <button className="w-full max-w-md bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl transition-colors">
        Top Up Wallet
      </button>
    </div>
  );
}