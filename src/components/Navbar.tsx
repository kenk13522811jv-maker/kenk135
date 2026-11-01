import React from 'react';
import { Flame, Settings, Code, Globe2, ShieldCheck, Database } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../services/translations';
import { getActiveFirebaseConfig } from '../services/firebase';

interface NavbarProps {
  lang: Language;
  onToggleLang: () => void;
  onOpenFirebaseSettings: () => void;
  onOpenPython: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  lang,
  onToggleLang,
  onOpenFirebaseSettings,
  onOpenPython,
}) => {
  const t = translations[lang];
  const fbConfig = getActiveFirebaseConfig();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold">
            <Flame className="w-6 h-6 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-100 tracking-tight">
                {lang === 'bn' ? 'Firebase AI ভিডিও ভল্ট' : 'Firebase AI Video Vault'}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Database className="w-2.5 h-2.5" />
                Firestore
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {lang === 'bn' 
                ? 'এআই ভিডিও পাইপলাইনের জন্য Firebase Storage ও মেয়াদের অটো-ডিলিট সিস্টেম'
                : 'Firebase Storage & automated retention for AI video pipelines'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Storage status badge */}
          <button
            onClick={onOpenFirebaseSettings}
            title={`Firebase Storage Bucket: ${fbConfig.storageBucket}`}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-950/50 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate max-w-[120px] sm:max-w-[180px] font-mono">
              {fbConfig.storageBucket ? 'Firebase Connected' : 'Local Sandbox'}
            </span>
          </button>

          {/* Firebase Config Trigger */}
          <button
            onClick={onOpenFirebaseSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-500/40 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{lang === 'bn' ? 'Firebase কনফিগ' : 'Firebase Config'}</span>
          </button>

          {/* Python Code Modal Trigger */}
          <button
            onClick={onOpenPython}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 hover:border-sky-500/40 transition-all shadow-sm"
          >
            <Code className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.pythonCode}</span>
            <span className="sm:hidden">Python</span>
          </button>

          {/* Language Toggle */}
          <button
            onClick={onToggleLang}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
            title="Toggle Language"
          >
            <Globe2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{lang === 'bn' ? 'বাংলা' : 'EN'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
