import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatsBar } from './components/StatsBar';
import { UploadZone } from './components/UploadZone';
import { Dashboard } from './components/Dashboard';
import { VideoTemplateGenerator } from './components/VideoTemplateGenerator';
import { NotePad } from './components/NotePad';
import { MediaPreviewModal } from './components/MediaPreviewModal';
import { FirebaseSettingsModal } from './components/FirebaseSettingsModal';
import { PythonExportModal } from './components/PythonExportModal';
import { Language, UploadedFileItem } from './types';
import { subscribeToAssets, runAutomatedCleanup, uploadAsset } from './services/assetService';
import { getActiveFirebaseConfig, testFirestoreConnection } from './services/firebase';
import { translations } from './services/translations';
import { Flame, Sparkles, UploadCloud, LayoutDashboard, Code, Bot, ShieldCheck, CheckCircle2, Clapperboard, FileText } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('bn');
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard' | 'template' | 'note'>('upload');
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Modals
  const [isFirebaseSettingsOpen, setIsFirebaseSettingsOpen] = useState<boolean>(false);
  const [isPythonOpen, setIsPythonOpen] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<UploadedFileItem | null>(null);

  const t = translations[lang];
  const fbConfig = getActiveFirebaseConfig();

  // Subscribe to real-time Firebase Firestore updates & test connection
  useEffect(() => {
    testFirestoreConnection().then(ok => setIsConnected(ok));

    // Real-time listener: files will persist across reloads, browser tabs and devices!
    const unsubscribe = subscribeToAssets((items) => {
      setFiles(items);
    });

    // Run automated cleanup of expired files on mount
    runAutomatedCleanup();

    // Check every 30 seconds for expired files and remove from Firebase Storage + Firestore
    const cleanupInterval = setInterval(() => {
      runAutomatedCleanup();
    }, 30000);

    // Check URL query parameters (e.g. ?tab=note or ?tab=template)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'note') {
      setActiveTab('note');
    } else if (tabParam === 'template') {
      setActiveTab('template');
    } else if (tabParam === 'dashboard') {
      setActiveTab('dashboard');
    }

    return () => {
      unsubscribe();
      clearInterval(cleanupInterval);
    };
  }, []);

  const handleToggleLang = () => {
    setLang((prev) => (prev === 'bn' ? 'en' : 'bn'));
  };

  const handleUploadSuccess = (itemOrItems: UploadedFileItem | UploadedFileItem[]) => {
    const newItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const newIds = new Set(newItems.map((i) => i.id));
    setFiles((prev) => [...newItems, ...prev.filter((f) => !newIds.has(f.id))]);
  };

  // Seed sample demonstration pipeline items if user wants quick testing
  const handleLoadDemoFiles = () => {
    const now = Date.now();
    const demoItems: UploadedFileItem[] = [
      {
        id: 'pipeline_demo_1',
        name: 'ai-scene-ocean-sunset.jpg',
        size: 2450000,
        type: 'image/jpeg',
        category: 'image',
        publicUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
        storageKey: 'pipeline_assets/demo_1/ai-scene-ocean-sunset.jpg',
        storageProvider: 'firebase-storage',
        uploadedAt: now - 3600000,
        expiresAt: null, // Permanent
        retention: 'permanent',
        downloadsCount: 18,
      },
      {
        id: 'pipeline_demo_2',
        name: 'ai-character-motion.mp4',
        size: 8900000,
        type: 'video/mp4',
        category: 'video',
        publicUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        storageKey: 'pipeline_assets/demo_2/ai-character-motion.mp4',
        storageProvider: 'firebase-storage',
        uploadedAt: now - 7200000,
        expiresAt: now + (23 * 3600000 + 45 * 60000), // ~23h left (Auto-delete)
        retention: '1day',
        downloadsCount: 7,
      },
      {
        id: 'pipeline_demo_3',
        name: 'ai-cyberpunk-city.webp',
        size: 1420000,
        type: 'image/webp',
        category: 'image',
        publicUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=600&q=80',
        storageKey: 'pipeline_assets/demo_3/ai-cyberpunk-city.webp',
        storageProvider: 'firebase-storage',
        uploadedAt: now - 1800000,
        expiresAt: now + (2 * 86400000 + 12 * 3600000), // ~2.5 days left (Auto-delete)
        retention: '3days',
        downloadsCount: 4,
      },
    ];

    setFiles(prev => [...demoItems, ...prev.filter(p => !p.id.startsWith('pipeline_demo'))]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950 flex flex-col font-sans">
      {/* Navigation */}
      <Navbar
        lang={lang}
        onToggleLang={handleToggleLang}
        onOpenFirebaseSettings={() => setIsFirebaseSettingsOpen(true)}
        onOpenPython={() => setIsPythonOpen(true)}
        onOpenTemplate={() => setActiveTab('template')}
        onOpenNote={() => setActiveTab('note')}
        activeTab={activeTab}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Hero Banner for Automated AI Video Pipeline */}
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl mb-6">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>Firebase Storage & Firestore Live</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold">
                  <Bot className="w-3.5 h-3.5" />
                  <span>AI Video Pipeline Ready</span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {lang === 'bn' ? (
                  <>AI ভিডিও পাইপলাইনের জন্য <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200">Firebase অ্যাসেট ভল্ট</span></>
                ) : (
                  <>Firebase Asset Vault for <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200">AI Video Pipelines</span></>
                )}
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                {lang === 'bn' 
                  ? 'ছবি ও ভিডিও ফাইল আপলোড করুন। ফাইলগুলো Firebase Storage-এ সংরক্ষিত হবে এবং রিলোড করলেও মেয়াদের সময় পর্যন্ত ডেটাবেসে থাকবে। নির্দিষ্ট সময় (১, ২ বা ৩ দিন) পার হলে স্বয়ংক্রিয়ভাবে Storage ও ড্যাশবোর্ড থেকে ডিলিট হয়ে যাবে।'
                  : 'Upload images and videos directly to Firebase Storage with Firestore metadata persistence across refreshes. Temporary assets are automatically purged from both Storage & DB when expired.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
              <button
                onClick={() => setIsFirebaseSettingsOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30 transition-all shadow-md"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>{lang === 'bn' ? 'Firebase কনফিগ দেখুন' : 'Firebase Config'}</span>
              </button>

              {files.length === 0 && (
                <button
                  onClick={handleLoadDemoFiles}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{lang === 'bn' ? 'ডেমো অ্যাসেট লোড করুন' : 'Load Demo Assets'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex p-1 rounded-2xl bg-slate-900 border border-slate-800 shadow-inner">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'upload'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>{t.uploadTab}</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{t.dashboardTab}</span>
              <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                activeTab === 'dashboard' ? 'bg-slate-950/40 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {files.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('template')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'template'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              <span>{t.templateTab}</span>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === 'template' ? 'bg-slate-950/40 text-slate-950' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}>
                AI
              </span>
            </button>

            <button
              onClick={() => setActiveTab('note')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'note'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{t.noteTab}</span>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                activeTab === 'note' ? 'bg-slate-950/40 text-slate-950' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}>
                NEW
              </span>
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        {activeTab !== 'template' && activeTab !== 'note' && <StatsBar files={files} lang={lang} />}

        {/* Tab Content */}
        {activeTab === 'upload' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <UploadZone
              lang={lang}
              onUploadSuccess={handleUploadSuccess}
              onOpenFirebaseSettings={() => setIsFirebaseSettingsOpen(true)}
            />

            {/* Quick Recent Uploads snippet below upload box */}
            {files.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>{lang === 'bn' ? 'সরাসরি Firebase এ সংরক্ষিত অ্যাসেটসমূহ' : 'Live Assets in Firebase'}</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                  >
                    <span>{lang === 'bn' ? 'ড্যাশবোর্ডে সব দেখুন ↗' : 'View All in Dashboard ↗'}</span>
                  </button>
                </div>

                <Dashboard
                  files={files.slice(0, 3)}
                  lang={lang}
                  onRefresh={(deletedId) => {
                    if (deletedId) setFiles(prev => prev.filter(f => f.id !== deletedId));
                    runAutomatedCleanup();
                  }}
                  onPreview={(f) => setPreviewFile(f)}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in duration-200">
            <Dashboard
              files={files}
              lang={lang}
              onRefresh={(deletedId) => {
                if (deletedId) setFiles(prev => prev.filter(f => f.id !== deletedId));
                runAutomatedCleanup();
              }}
              onPreview={(f) => setPreviewFile(f)}
            />
          </div>
        )}

        {activeTab === 'template' && (
          <div className="animate-in fade-in duration-200">
            <VideoTemplateGenerator lang={lang} />
          </div>
        )}

        {activeTab === 'note' && (
          <div className="animate-in fade-in duration-200">
            <NotePad lang={lang} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-400">Firebase Storage & Firestore Pipeline Vault</span>
            <span>•</span>
            <span className="font-mono text-slate-500">{fbConfig.projectId}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <button onClick={() => setIsFirebaseSettingsOpen(true)} className="hover:text-amber-300 transition-colors">
              Firebase Config
            </button>
            <span>•</span>
            <button onClick={() => setIsPythonOpen(true)} className="hover:text-slate-200">
              Python Pipeline Code
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <MediaPreviewModal
        file={previewFile}
        lang={lang}
        onClose={() => setPreviewFile(null)}
      />

      <FirebaseSettingsModal
        isOpen={isFirebaseSettingsOpen}
        onClose={() => setIsFirebaseSettingsOpen(false)}
        lang={lang}
      />

      <PythonExportModal
        isOpen={isPythonOpen}
        onClose={() => setIsPythonOpen(false)}
        lang={lang}
      />
    </div>
  );
}
