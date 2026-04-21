import { motion } from 'framer-motion';

interface Props {
  onPlay: (stake: number) => void;
}

export default function Dashboard({ onPlay }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-12"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300 mb-2 block">Premium Experience</span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-none">
          Choose Your <br />
          <span className="text-yellow-400">Stake</span>
        </h2>
      </motion.div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => onPlay(10)}
          className="group relative flex items-center justify-between bg-white/10 backdrop-blur-md text-white p-6 rounded-3xl border border-white/10 hover:bg-white/20 active:scale-[0.98] transition-all"
        >
          <div className="flex flex-col items-start relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Standard Entry</span>
            <span className="text-2xl font-black italic tracking-tight uppercase">Play 10 <span className="text-[10px] not-italic ml-1">ETB</span></span>
          </div>
        </button>

        <button
          onClick={() => onPlay(20)}
          className="group relative flex items-center justify-between bg-indigo-600/80 backdrop-blur-md text-white p-6 rounded-3xl border border-indigo-400/30 hover:bg-indigo-600 active:scale-[0.98] transition-all shadow-2xl shadow-indigo-500/20"
        >
          <div className="flex flex-col items-start relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Premium Entry</span>
            <span className="text-2xl font-black italic tracking-tight uppercase">Play 20 <span className="text-[10px] not-italic ml-1">ETB</span></span>
          </div>
          <motion.div 
            animate={{ x: [-100, 300] }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="absolute top-0 bottom-0 w-20 bg-white/20 blur-xl -skew-x-12"
          />
        </button>
      </div>
      
      <p className="mt-12 text-[10px] text-white/30 font-black uppercase tracking-[0.2em] leading-relaxed max-w-[200px]">
        Select your stake to proceed to board selection
      </p>
    </div>
  );
}
