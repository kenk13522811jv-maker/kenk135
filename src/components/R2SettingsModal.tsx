import React, { useState } from 'react';
import { X, Cloud, Key, ShieldCheck, Database, Globe, HelpCircle, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { R2Config, Language } from '../types';
import { translations } from '../services/translations';
import { saveR2Config, testR2Connection } from '../services/r2Service';

interface R2SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: R2Config;
  onConfigSaved: (config: R2Config) => void;
  lang: Language;
}

export const R2SettingsModal: React.FC<R2SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigSaved,
  lang,
}) => {
  const t = translations[lang];

  const [formData, setFormData] = useState<R2Config>({ ...config });
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleChange = (field: keyof R2Config, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
    setTestResult(null);
  };

  const handleSave = () => {
    saveR2Config(formData);
    onConfigSaved(formData);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testR2Connection(formData);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Connection failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleResetToSandbox = () => {
    const empty: R2Config = {
      accountId: '',
      accessKeyId: '',
      secretAccessKey: '',
      bucketName: '',
      publicDomain: '',
      customDomainEnabled: false,
      isConfigured: false,
    };
    setFormData(empty);
    saveR2Config(empty);
    onConfigSaved(empty);
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base sm:text-lg">
                {t.r2SettingsTitle}
              </h3>
              <p className="text-xs text-slate-400">
                {t.r2SettingsDesc}
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

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Account ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-orange-400" />
              <span>{t.accountId}</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 9b8f2c3d1e4a5..."
              value={formData.accountId}
              onChange={(e) => handleChange('accountId', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Bucket Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.bucketName}</span>
            </label>
            <input
              type="text"
              placeholder="e.g. my-media-vault"
              value={formData.bucketName}
              onChange={(e) => handleChange('bucketName', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Access Key ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.accessKeyId}</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 8f6d7e2a9b..."
              value={formData.accessKeyId}
              onChange={(e) => handleChange('accessKeyId', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.secretAccessKey}</span>
            </label>
            <input
              type="password"
              placeholder="••••••••••••••••••••••••••••••"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          {/* Public Domain / URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.publicDomain}</span>
            </label>
            <input
              type="text"
              placeholder="https://pub-xxxxxx.r2.dev or https://cdn.yourdomain.com"
              value={formData.publicDomain}
              onChange={(e) => handleChange('publicDomain', e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {lang === 'bn' 
                ? 'Cloudflare R2 ড্যাশবোর্ডে Bucket Settings থেকে "R2.dev subdomain" অথবা Custom Domain এনাবল করতে পারেন।'
                : 'Enable "R2.dev subdomain" or Custom Domain under Bucket Settings in Cloudflare R2 dashboard.'}
            </p>
          </div>

          {/* Test connection alert */}
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

          {/* Toggle Help & Guide */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>
                {lang === 'bn' ? 'Cloudflare R2 ক্রেডেনশিয়াল কীভাবে সংগ্রহ করবেন?' : 'How to get Cloudflare R2 credentials?'}
              </span>
            </button>

            {showHelp && (
              <div className="mt-2 p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
                <p>1. Log in to <strong className="text-slate-200">Cloudflare Dashboard</strong> &gt; <strong className="text-slate-200">R2 Object Storage</strong>.</p>
                <p>2. Create a Bucket (e.g. <code>my-vault</code>).</p>
                <p>3. Under "Manage R2 API Tokens", create an API Token with <strong className="text-slate-200">Admin Read & Write</strong> permissions.</p>
                <p>4. In your Bucket settings &gt; <strong className="text-slate-200">CORS Policy</strong>, add:</p>
                <pre className="p-2 bg-slate-900 rounded font-mono text-[10px] text-sky-300 overflow-x-auto">
{`[{"AllowedOrigins": ["*"], "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"], "AllowedHeaders": ["*"]}]`}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleResetToSandbox}
            className="text-xs text-slate-400 hover:text-slate-200 underline order-last sm:order-first"
          >
            {t.switchToSandbox}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleTest}
              disabled={testing || !formData.accountId || !formData.bucketName}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{t.testConnection}</span>
            </button>

            <button
              onClick={handleSave}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20"
            >
              {t.saveSettings}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
