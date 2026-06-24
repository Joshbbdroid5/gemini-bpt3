import React, { memo } from 'react';
import { ArrowUpRight, ArrowDownLeft, Settings2, ShoppingCart, Trophy } from 'lucide-react';

interface TransactionCardProps {
  log: any;
  wallets: Record<string, { balance: number; username?: string }>;
}

const TransactionCard = memo(({ log, wallets }: TransactionCardProps) => {
  const user = wallets[log.userId];

  const getIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowUpRight size={18} />;
      case 'withdrawal': return <ArrowDownLeft size={18} />;
      case 'stake': return <ShoppingCart size={18} />;
      case 'win': return <Trophy size={18} />;
      case 'adjustment': return <Settings2 size={18} />;
      default: return <Settings2 size={18} />;
    }
  };

  const getAmountColor = (type: string) => {
    if (type === 'deposit' || type === 'win') return 'text-green-400';
    if (type === 'withdrawal' || type === 'stake') return 'text-red-400';
    return 'text-indigo-400'; // adjustment
  };

  return (
    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex items-center justify-between gap-4 shadow-md">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-2xl ${getAmountColor(log.type).replace('text-', 'bg-')}/20 ${getAmountColor(log.type)}`}>
          {getIcon(log.type)}
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-black text-white uppercase tracking-wider">{log.type.toUpperCase()}</span>
            <span className="text-[10px] font-bold text-indigo-300 truncate max-w-[100px]">{user?.username || 'Anonymous'}</span>
          </div>
          <span className="text-[9px] text-gray-500 font-bold mt-0.5">{new Date(log.timestamp).toLocaleString()}</span>
          <span className="text-[8px] text-gray-600 font-mono">ID: {log.userId}</span>
        </div>
      </div>
      <div className={`text-base font-black italic whitespace-nowrap ${getAmountColor(log.type)}`}>
        {log.type === 'deposit' || log.type === 'win' ? '+' : '-'}{log.amount.toFixed(0)} <span className="text-[10px] not-italic opacity-60 ml-0.5">ETB</span>
      </div>
    </div>
  );
});

export default TransactionCard;