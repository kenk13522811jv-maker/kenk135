import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  Upload, 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  Clock, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  RotateCcw,
  Sparkles,
  Share2,
  PackageCheck,
  FileCode2,
  HardDrive
} from 'lucide-react';
import { Language, AppItem, RetentionOption } from '../types';
import { uploadApp, fetchApps, deleteApp } from '../services/appService';

interface AppVaultProps {
  lang: Language;
}

export const AppVault: React.FC<AppVaultProps> = ({ lang }) => {
  const [activeSubTab, setActiveSubTab] = useState<'upload' | 'list'>('upload');
  const [appName, setAppName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [retention, setRetention] = useState<RetentionOption>('permanent');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentlyUploaded, setRecentlyUploaded] = useState<AppItem | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // App list state
  const [apps, setApps] = useState<AppItem[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadApps = async () => {
    setIsLoadingApps(true);
    const data = await fetchApps();
    setApps(data);
    setIsLoadingApps(false);
  };

  useEffect(() => {
    loadApps();
  }, []);

  // Handle file selection
  const handleFilePicked = (file: File) => {
    if (!file) return;
    setUploadError(null);
    setSelectedFile(file);
    if (!appName.trim()) {
      const clean = file.name.replace(/\.[^/.]+$/, '').replace(/[_.-]/g, ' ');
      setAppName(clean);
    }
  };

  // Upload handler
  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError(lang === 'bn' ? 'অনুগ্রহ করে একটি .apk ফাইল নির্বাচন করুন' : 'Please select an .apk file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const app = await uploadApp(selectedFile, appName, retention, (percent) => {
        setUploadProgress(percent);
      });

      setRecentlyUploaded(app);
      setApps(prev => [app, ...prev.filter(a => a.id !== app.id)]);
      setSelectedFile(null);
      setAppName('');
      setUploadProgress(0);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload APK file');
    } finally {
      setIsUploading(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const ok = await deleteApp(id);
    if (ok) {
      setApps(prev => prev.filter(a => a.id !== id));
      if (recentlyUploaded?.id === id) {
        setRecentlyUploaded(null);
      }
    }
    setDeletingId(null);
  };

  // Filtered apps
  const filteredApps = apps.filter(a => {
    const q = searchQuery.toLowerCase();
    return (
      (a.appName && a.appName.toLowerCase().includes(q)) ||
      (a.name && a.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {lang === 'bn' ? 'Firebase অ্যাপ ভল্ট (APK Vault)' : 'Firebase App Vault (APK)'}
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <PackageCheck className="w-3 h-3 text-emerald-400" />
                <span>Android Direct Install</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              {lang === 'bn'
                ? 'আপনার অ্যানড্রয়েড APK ফাইল আপলোড করুন এবং স্থায়ী বা মেয়াদি শেয়ার লিংক তৈরি করুন, যা দিয়ে যে কেউ সরাসরি ফোনে অ্যাপ ইনস্টল করতে পারবে।'
                : 'Upload Android APK files and generate direct install links for users to download and install on any phone.'}
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              onClick={() => setActiveSubTab('upload')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'upload'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'নতুন অ্যাপ আপলোড' : 'Upload APK'}</span>
            </button>

            <button
              onClick={() => {
                setActiveSubTab('list');
                loadApps();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'list'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'সংরক্ষিত অ্যাপসমূহ' : 'Uploaded Apps'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeSubTab === 'list' ? 'bg-slate-950/40 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {apps.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Recently Uploaded App Success Banner */}
      {recentlyUploaded && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base text-emerald-200">
                {lang === 'bn' ? 'অ্যাপটি সফলভাবে Firebase-এ আপলোড হয়েছে!' : 'App uploaded successfully to Firebase!'}
              </h3>
            </div>
            <button
              onClick={() => setRecentlyUploaded(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Direct Download Binary APK URL */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  <span>{lang === 'bn' ? 'সরাসরি APK ডাউনলোড ও ইনস্টল লিংক:' : 'Direct APK Download Link:'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">ফোন সরাসরি ডাউনলোড করবে</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={recentlyUploaded.downloadUrl}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none selection:bg-emerald-500 selection:text-slate-950"
                />
                <button
                  onClick={() => handleCopy(recentlyUploaded.downloadUrl, 'recent_dl')}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-sm"
                >
                  {copiedId === 'recent_dl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'recent_dl' ? 'কপি!' : 'কপি'}</span>
                </button>
                <a
                  href={recentlyUploaded.downloadUrl}
                  download
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Test Download"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                </a>
              </div>
            </div>

            {/* Public Web Installer Page URL */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                  <Share2 className="w-3 h-3" />
                  <span>{lang === 'bn' ? 'ওয়েব ইনস্টলার পেজ লিংক (Web Page):' : 'Web Installer Page Link:'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">মোবাইল-বান্ধব পেজ</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={recentlyUploaded.publicUrl}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none selection:bg-sky-500 selection:text-slate-950"
                />
                <button
                  onClick={() => handleCopy(recentlyUploaded.publicUrl, 'recent_pub')}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-sm"
                >
                  {copiedId === 'recent_pub' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'recent_pub' ? 'কপি!' : 'কপি'}</span>
                </button>
                <a
                  href={recentlyUploaded.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Open Web Installer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: UPLOAD NEW APK */}
      {activeSubTab === 'upload' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          {/* App Display Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">•</span>
                <span>{lang === 'bn' ? 'অ্যাপের নাম (ঐচ্ছিক):' : 'App Name (Optional):'}</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {lang === 'bn' ? 'যেমন: Voice Assistant v1.0, My App' : 'e.g. Voice Assistant, Camera Pro'}
              </span>
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. আমার ভয়েস অ্যাপ (My Voice App)"
              className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all font-sans"
            />
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFilePicked(file);
              e.target.value = '';
            }}
            accept=".apk,.aab,.zip,application/vnd.android.package-archive"
            className="hidden"
          />

          {/* Drag & Drop APK Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">•</span>
              <span>{lang === 'bn' ? 'অ্যানড্রয়েড APK ফাইল নির্বাচন করুন:' : 'Select Android APK File:'}</span>
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFilePicked(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-950/20 ring-4 ring-emerald-500/10'
                  : selectedFile
                  ? 'border-emerald-500/70 bg-emerald-950/10'
                  : 'border-slate-700/80 hover:border-emerald-500/50 bg-slate-950/50 hover:bg-slate-950'
              }`}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-sm text-emerald-300">{selectedFile.name}</h4>
                  <p className="text-xs text-slate-400 font-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Android Package
                  </p>
                  <p className="text-[11px] text-emerald-400/80 pt-1">
                    ✓ ফাইলটি প্রস্তুত। নিচের বাটনে ক্লিক করে Firebase এ আপলোড করুন।
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200">
                      {lang === 'bn' ? 'এখানে .apk ফাইল ড্র্যাগ করে ছাড়ুন' : 'Drag & drop your .apk file here'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {lang === 'bn' ? 'বা ব্রাউজ করতে ক্লিক করুন (.apk সাপোর্টেড)' : 'or click to browse (.apk supported)'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Retention Selector (স্থায়ী বা অটো-ডিলিট) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'bn' ? 'সংরক্ষণের মেয়াদ নির্ধারণ করুন (Retention Policy):' : 'Select Retention Policy:'}</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setRetention('permanent')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col ${
                  retention === 'permanent'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>♾️ স্থায়ী (Permanent)</span>
                <span className="text-[10px] text-slate-500 font-normal">কখনই মুছবে না</span>
              </button>

              <button
                type="button"
                onClick={() => setRetention('1day')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col ${
                  retention === '1day'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>⏳ ১ দিন পর</span>
                <span className="text-[10px] text-slate-500 font-normal">২৪ ঘণ্টা পর মুছবে</span>
              </button>

              <button
                type="button"
                onClick={() => setRetention('2days')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col ${
                  retention === '2days'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>⏳ ২ দিন পর</span>
                <span className="text-[10px] text-slate-500 font-normal">৪৮ ঘণ্টা পর মুছবে</span>
              </button>

              <button
                type="button"
                onClick={() => setRetention('3days')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col ${
                  retention === '3days'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>⏳ ৩ দিন পর</span>
                <span className="text-[10px] text-slate-500 font-normal">৭২ ঘণ্টা পর মুছবে</span>
              </button>
            </div>
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Firebase-এ আপলোড হচ্ছে...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {uploadError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !selectedFile}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? `আপলোড হচ্ছে (${uploadProgress}%)...` : 'Firebase-এ অ্যাপ আপলোড করুন'}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: UPLOADED APPS LIST */}
      {activeSubTab === 'list' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="অ্যাপের নাম বা ফাইলের নাম দিয়ে খুঁজুন..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
            />
          </div>

          {isLoadingApps ? (
            <div className="py-12 text-center text-slate-400 text-xs">লোড হচ্ছে...</div>
          ) : filteredApps.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Smartphone className="w-12 h-12 text-slate-700 mx-auto" />
              <h4 className="text-sm font-bold text-slate-300">কোনো সংরক্ষিত অ্যাপ নেই</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery
                  ? 'আপনার সার্চ কোয়েরির সাথে কোনো অ্যাপ মেলেনি।'
                  : 'নতুন APK ফাইল আপলোড করতে উপরের "নতুন অ্যাপ আপলোড" বাটনে ক্লিক করুন।'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setActiveSubTab('upload')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>এখনই আপলোড করুন</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredApps.map((app) => {
                const sizeMb = (app.size / (1024 * 1024)).toFixed(2);
                const isExpired = app.expiresAt && app.expiresAt > 0 && Date.now() > app.expiresAt;

                return (
                  <div
                    key={app.id}
                    className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition-all shadow-md space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: App Info */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white flex items-center gap-2">
                            <span>{app.appName || app.name}</span>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              APK
                            </span>
                          </h4>
                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5 font-mono">
                            <span>{app.name}</span>
                            <span>•</span>
                            <span className="text-slate-300 font-semibold">{sizeMb} MB</span>
                            <span>•</span>
                            <span>{new Date(app.uploadedAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            <span>•</span>
                            <span className="text-emerald-400">
                              {app.retention === 'permanent' ? '♾️ স্থায়ী' : `⏳ ${app.retention}`}
                            </span>
                            <span>•</span>
                            <span className="text-sky-400">
                              ⬇️ {app.downloadsCount || 0} বার ডাউনলোড
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Direct Download Button */}
                        <a
                          href={app.downloadUrl}
                          download={app.name}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow-sm"
                          title="ফোনে সরাসরি ডাউনলোড ও ইনস্টল"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </a>

                        {/* Copy Direct Download Link */}
                        <button
                          onClick={() => handleCopy(app.downloadUrl, `dl_${app.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
                          title="সরাসরি ডাউনলোড লিংক কপি করুন"
                        >
                          {copiedId === `dl_${app.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === `dl_${app.id}` ? 'কপি!' : 'ডাউনলোড লিংক'}</span>
                        </button>

                        {/* Open Web Installer Page */}
                        <a
                          href={app.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                          title="ওয়েব ইনস্টলার পেজ দেখুন"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                          <span>ইনস্টল পেজ</span>
                        </a>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(app.id)}
                          disabled={deletingId === app.id}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition-colors"
                          title="অ্যাপটি মুছে ফেলুন"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
