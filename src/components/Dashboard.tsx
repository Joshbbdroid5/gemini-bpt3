import { motion } from 'framer-motion';
import { Language } from '../types';
import { translations } from '../translations';

interface Props {
  onPlay: (stake: number) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  isGameActive: boolean;
}

const LANGUAGES = [
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'am', label: 'አማርኛ', flag: '🇪🇹' },
  { id: 'om', label: 'Oromoo', flag: '🇪🇹' }
] as const;

export default function Dashboard({ onPlay, language, onLanguageChange, isGameActive }: Props) {
  const t = translations[language];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {/* Language Selection Tabs with Flags */}
      <div className="mb-12 flex bg-white/5 p-1.5 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.id}
            onClick={() => onLanguageChange(lang.id)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              language === lang.id 
                ? 'bg-indigo-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="text-sm leading-none">{lang.flag}</span>
            {lang.label}
          </button>
        ))}
      </div>

      {/* Game in Progress Badge */}
      {isGameActive && (
        <div className="flex justify-center mb-6">
          <div className="bg-red-500 px-3 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1.5 animate-pulse text-white shadow-lg">
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            Game in Progress
          </div>
        </div>
      )}

      {/* Stake Selection Section */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-12"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300 mb-2 block">
          {t.premiumExp}
        </span>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-tight whitespace-pre-line">
          {t.chooseStake}
        </h2>
      </motion.div>

      {/* Entry Fee Buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {[10, 20].map((amount) => (
          <motion.button
            key={amount}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPlay(amount)}
            className="group relative overflow-hidden bg-white text-indigo-950 py-5 rounded-3xl font-black text-xl italic uppercase tracking-tighter shadow-xl transition-all hover:bg-yellow-400 active:bg-yellow-500"
          >
            {amount} ETB
            {/* Subtle decorative circle */}
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
               <div className="w-12 h-12 bg-black rounded-full -mr-6 -mt-6"></div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mt-8 text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em] opacity-50">
        Secure & Verified Gaming
      </div>
    </div>
  );
}