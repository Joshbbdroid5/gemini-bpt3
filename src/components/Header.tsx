interface Props {
  onShowRules: () => void;
}
 // Header component definition
export default function Header({ onShowRules }: Props) {
  return (
    <header className="flex items-center justify-between p-4 sticky top-0 bg-transparent z-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-black border border-white/20 flex items-center justify-center text-white font-black rounded-lg shadow-lg">L</div> {/* Logo placeholder */}
        <h1 className="text-sm font-black tracking-tighter text-white uppercase italic">Lomi Bingo</h1> {/* App title */}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onShowRules}
          className="px-4 py-1 rounded-full border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          Rules
        </button>
      </div>
    </header>
  );
}
