import React, { useState } from 'react';
import { 
  X, 
  Flame, 
  Key, 
  Database, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileCode, 
  ShieldCheck, 
  RotateCcw,
  GitBranch,
  Copy,
  Check,
  Server
} from 'lucide-react';
import { Language } from '../types';
import { 
  getActiveFirebaseConfig, 
  saveCustomFirebaseConfig, 
  resetToDefaultFirebaseConfig, 
  testFirestoreConnection,
  FirebaseConfigType 
} from '../services/firebase';

interface FirebaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const FirebaseSettingsModal: React.FC<FirebaseSettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [config, setConfig] = useState<FirebaseConfigType>(() => getActiveFirebaseConfig());
  const [activeTab, setActiveTab] = useState<'form' | 'json' | 'deploy'>('form');
  const [jsonInput, setJsonInput] = useState<string>('');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFieldChange = (field: keyof FirebaseConfigType, val: string) => {
    setConfig(prev => ({ ...prev, [field]: val }));
    setTestResult(null);
    setSaveSuccess(false);
  };

  const handleJsonPaste = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed.apiKey && parsed.projectId) {
        setConfig({
          apiKey: parsed.apiKey || '',
          authDomain: parsed.authDomain || `${parsed.projectId}.firebaseapp.com`,
          projectId: parsed.projectId || '',
          storageBucket: parsed.storageBucket || `${parsed.projectId}.appspot.com`,
          messagingSenderId: parsed.messagingSenderId || '',
          appId: parsed.appId || '',
          firestoreDatabaseId: parsed.firestoreDatabaseId || '',
        });
        setActiveTab('form');
        setTestResult(null);
      } else {
        alert(lang === 'bn' ? 'ভুল JSON ফরম্যাট! apiKey ও projectId আবশ্যক।' : 'Invalid JSON! apiKey and projectId are required.');
      }
    } catch {
      alert(lang === 'bn' ? 'অবৈধ JSON ডাটা।' : 'Invalid JSON string.');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await testFirestoreConnection();
      if (ok) {
        setTestResult({
          success: true,
          message: lang === 'bn' ? 'Firebase Firestore সফলভাবে সংযুক্ত হয়েছে!' : 'Firebase Firestore connection verified successfully!'
        });
      } else {
        setTestResult({
          success: false,
          message: lang === 'bn' ? 'কানেকশন টেস্ট ব্যর্থ হয়েছে। ক্রেডেনশিয়াল বা নেটওয়ার্ক চেক করুন।' : 'Connection check failed. Please check credentials or network.'
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Error testing connection'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveCustomFirebaseConfig(config);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
      window.location.reload();
    }, 1200);
  };

  const handleReset = () => {
    resetToDefaultFirebaseConfig();
    const def = getActiveFirebaseConfig();
    setConfig(def);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
      window.location.reload();
    }, 1000);
  };

  const envString = `VITE_FIREBASE_API_KEY="${config.apiKey}"
VITE_FIREBASE_PROJECT_ID="${config.projectId}"
VITE_FIREBASE_STORAGE_BUCKET="${config.storageBucket}"
VITE_FIREBASE_AUTH_DOMAIN="${config.authDomain}"
VITE_FIREBASE_APP_ID="${config.appId}"
VITE_FIREBASE_DATABASE_ID="${config.firestoreDatabaseId || ''}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${config.messagingSenderId || ''}"`;

  const handleCopyEnv = () => {
    navigator.clipboard.writeText(envString);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base sm:text-lg flex items-center gap-2">
                <span>{lang === 'bn' ? 'Firebase কনফিগারেশন ও ডিপ্লয়মেন্ট' : 'Firebase Configuration & Deployment'}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Storage & Firestore
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {lang === 'bn' 
                  ? 'গিটহাবে লিক ছাড়াই রেন্ডার (Render) এ ডিপ্লয় করার নিরাপদ নিয়মাবলী'
                  : 'Safe credentials management and GitHub / Render deployment instructions'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between overflow-x-auto">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('form')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'form'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'bn' ? 'ক্রেডেনশিয়াল ভিউ' : 'Credentials'}
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'json'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {lang === 'bn' ? 'JSON পেস্ট' : 'Paste JSON'}
            </button>
            <button
              onClick={() => setActiveTab('deploy')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'deploy'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'গিটহাব ও Render ডিপ্লয়' : 'GitHub & Render'}</span>
            </button>
          </div>

          <button
            onClick={handleReset}
            className="text-[11px] text-slate-400 hover:text-amber-400 pb-2 flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Reset to project default configuration"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{lang === 'bn' ? 'কনফিগারেশন সেভ হয়েছে! অ্যাপ রিলোড হচ্ছে...' : 'Configuration saved! Reloading...'}</span>
            </div>
          )}

          {activeTab === 'deploy' ? (
            /* ================= GITHUB & RENDER GUIDE ================= */
            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                <div className="font-bold flex items-center gap-2 text-sm text-amber-200">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'গিটহাবে এপিআই কী লিক প্রতিরোধ:' : 'Safe Secret Management:'}</span>
                </div>
                <p className="leading-relaxed">
                  {lang === 'bn' 
                    ? 'Firebase এর ওয়েব এপিআই কি (API Key) মূলত পাবলিক ক্লায়েন্ট আইডি, কিন্তু গিটহাবে পুশ করার সময় কোডের মধ্যে সরাসরি না রেখে Environment Variables (.env) এ রাখা সেরা নিয়ম। এতে গিটহাব কোনো সিকিউরিটি ওয়ার্নিং দেবে না।'
                    : 'Firebase web keys are public client identifiers, but storing them in Environment Variables is best practice to keep repositories clean and pass GitHub secret scans.'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>{lang === 'bn' ? 'Render ও .env এর জন্য ভ্যারিয়েবলসমূহ:' : 'Environment Variables for Render:'}</span>
                  </label>
                  <button
                    onClick={handleCopyEnv}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEnv ? 'কপি হয়েছে' : 'কপি করুন'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-sky-300 overflow-x-auto select-all">
                  {envString}
                </pre>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-orange-400" />
                  <span>{lang === 'bn' ? 'Render.com এ ডিপ্লয় করার ধাপসমূহ:' : 'Steps to deploy on Render:'}</span>
                </div>
                <p>1. আপনার গিটহাব রিপোজিটরিতে কোড পুশ করুন (আমাদের <code>.gitignore</code> ফাইলে <code>.env</code> অলরেডি ইগনোর করা আছে)।</p>
                <p>2. Render.com এ গিয়ে <strong className="text-white">New Static Site</strong> অথবা <strong className="text-white">Web Service</strong> সিলেক্ট করুন।</p>
                <p>3. Build Command: <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">npm run build</code> | Publish Directory: <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">dist</code></p>
                <p>4. Render এর <strong className="text-white">Environment</strong> সেকশনে উপরের ভ্যারিয়েবলগুলো পেস্ট করে দিন। ব্যস, কোনো কী লিক ছাড়াই লাইভ চলবে!</p>
              </div>
            </div>
          ) : activeTab === 'json' ? (
            /* ================= JSON PASTE ================= */
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-amber-400" />
                <span>
                  {lang === 'bn' 
                    ? 'Firebase Console থেকে firebaseConfig অবজেক্ট পেস্ট করুন:' 
                    : 'Paste firebaseConfig object from Firebase Console:'}
                </span>
              </label>
              <textarea
                rows={8}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={`{\n  "apiKey": "AIzaSy...",\n  "authDomain": "my-project.firebaseapp.com",\n  "projectId": "my-project",\n  "storageBucket": "my-project.firebasestorage.app",\n  "messagingSenderId": "...",\n  "appId": "..."\n}`}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-sky-300 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleJsonPaste}
                className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
              >
                {lang === 'bn' ? 'JSON ডাটা লোড করুন' : 'Apply JSON Config'}
              </button>
            </div>
          ) : (
            /* ================= FORM VIEW ================= */
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-400" />
                  <span>Project ID:</span>
                </label>
                <input
                  type="text"
                  value={config.projectId}
                  onChange={(e) => handleFieldChange('projectId', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  <span>Storage Bucket:</span>
                </label>
                <input
                  type="text"
                  value={config.storageBucket}
                  onChange={(e) => handleFieldChange('storageBucket', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>API Key:</span>
                </label>
                <input
                  type="text"
                  value={config.apiKey}
                  onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Auth Domain:</span>
                </label>
                <input
                  type="text"
                  value={config.authDomain}
                  onChange={(e) => handleFieldChange('authDomain', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-rose-400" />
                  <span>App ID:</span>
                </label>
                <input
                  type="text"
                  value={config.appId}
                  onChange={(e) => handleFieldChange('appId', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          {/* Test connection feedback */}
          {testResult && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              testResult.success
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{lang === 'bn' ? 'কানেকশন টেস্ট' : 'Test Connection'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/20 transition-all"
            >
              {lang === 'bn' ? 'সেভ করুন' : 'Save Config'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
