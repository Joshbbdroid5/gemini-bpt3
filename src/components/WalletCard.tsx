import React, { memo } from 'react';
import { Plus, Minus, Check, Trash2, History } from 'lucide-react';

interface WalletCardProps {
  id: string;
  data: { balance: number; username?: string };
  adjustmentValues: Record<string, string>;
  isUpdating: string | null;
  onViewActivity: (userId: string) => void;
  onDeleteUser: (userId: string | null) => void;
  onShowDeleteConfirm: (show: boolean) => void;
  onSetAdjustmentValue: (userId: string, value: string) => void;
  onTriggerUpdateBalance: (userId: string, amount: number, type: 'add' | 'subtract' | 'set') => void;
}

const WalletCard = memo(({
  id,
  data,
  adjustmentValues,
  isUpdating,
  onViewActivity,
  onDeleteUser,
  onShowDeleteConfirm,
  onSetAdjustmentValue,
  onTriggerUpdateBalance,
}: WalletCardProps) => {
  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-indigo-300 uppercase leading-none mb-1">User</span>
          <span className="text-xs font-bold text-white font-mono leading-none">{data.username || 'Anonymous'}</span>
          <span className="text-[10px] text-gray-500 italic mt-1 font-medium italic underline">ID: {id}</span>
        </div>
        <div className="flex items-start gap-4">
          <button 
            onClick={() => onViewActivity(id)}
            className="p-2 text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors"
            aria-label="View Activity"
            title="View Activity"
          >
            <History size={16} aria-hidden="true" />
          </button>
          <div className="text-right">
            <span className="text-[10px] font-black text-gray-500 uppercase leading-none block mb-1">Balance</span>
            <span className="text-lg font-black text-green-400 italic">{data.balance.toFixed(0)} ETB</span>
          </div>
          <button 
            onClick={() => { onDeleteUser(id); onShowDeleteConfirm(true); }}
            className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
            aria-label="Delete User"
            title="Delete User"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Quick Adjustment Controls */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <div className="relative flex-1">
          <input 
            type="number"
            placeholder="Adjustment amount..."
            value={adjustmentValues[id] || ''}
            onChange={(e) => onSetAdjustmentValue(id, e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => onTriggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'subtract')}
            disabled={isUpdating === id || !adjustmentValues[id]}
            className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-30"
            aria-label="Decrease Balance"
            title="Decrease Balance"
          ><Minus size={14} aria-hidden="true" /></button>
          <button 
            onClick={() => onTriggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'add')}
            disabled={isUpdating === id || !adjustmentValues[id]}
            className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-30"
            aria-label="Increase Balance"
            title="Increase Balance"
          ><Plus size={14} aria-hidden="true" /></button>
          <button 
            onClick={() => onTriggerUpdateBalance(id, Math.abs(Number(adjustmentValues[id])), 'set')}
            disabled={isUpdating === id || !adjustmentValues[id]}
            className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 disabled:opacity-30"
            title="Set Balance Exactly"
            aria-label="Set Exact Balance"
          ><Check size={14} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
});

export default WalletCard;