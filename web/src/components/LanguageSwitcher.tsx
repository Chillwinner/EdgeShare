import { AnimatePresence, motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import { useState } from 'react';
import { LANG_LABELS, useI18n, type Lang } from '../i18n';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-200 transition-colors cursor-pointer"
      >
        <Languages className="w-3.5 h-3.5 text-orange-400" />
        <span>{LANG_LABELS[lang]}</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-1.5 w-32 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-1 z-50"
          >
            {(Object.keys(LANG_LABELS) as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLang(code);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  lang === code ? 'bg-orange-500/20 text-orange-300 font-medium' : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                {LANG_LABELS[code]}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
