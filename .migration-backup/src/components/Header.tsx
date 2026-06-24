interface Props {
  onShowRules: () => void;
}

export default function Header({ onShowRules }: Props) {
  return (
    <header className="flex items-center justify-between px-6 py-4 sticky top-0 bg-transparent z-50 shrink-0 border-b border-white/5 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-lime-400 flex items-center justify-center text-black font-black rounded-xl shadow-[0_0_15px_rgba(163,230,53,0.3)]">L</div>
        <h1 className="text-base font-black tracking-tight text-white uppercase italic">Lomi Bingo</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onShowRules}
          className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
        >
          Rules
        </button>
      </div>
    </header>
  );
}
