import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileCode2, Download, ExternalLink } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../services/translations';
import { 
  FLASK_APP_CODE, 
  STREAMLIT_APP_CODE, 
  PYTHON_REQUIREMENTS, 
  PYTHON_ENV_EXAMPLE 
} from '../services/pythonTemplates';

interface PythonExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const PythonExportModal: React.FC<PythonExportModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'flask' | 'streamlit' | 'requirements' | 'env'>('flask');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const getActiveCode = () => {
    switch (activeTab) {
      case 'flask':
        return FLASK_APP_CODE;
      case 'streamlit':
        return STREAMLIT_APP_CODE;
      case 'requirements':
        return PYTHON_REQUIREMENTS;
      case 'env':
        return PYTHON_ENV_EXAMPLE;
      default:
        return '';
    }
  };

  const getFileName = () => {
    switch (activeTab) {
      case 'flask':
        return 'app.py (Flask)';
      case 'streamlit':
        return 'streamlit_app.py';
      case 'requirements':
        return 'requirements.txt';
      case 'env':
        return '.env';
      default:
        return 'script.py';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([getActiveCode()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName().replace(/\s+\(Flask\)/, '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base sm:text-lg">
                {t.pythonModalTitle}
              </h3>
              <p className="text-xs text-slate-400">
                {t.pythonModalDesc}
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

        {/* Tab Selection */}
        <div className="px-5 pt-3 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('flask')}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'flask'
                  ? 'border-orange-500 text-orange-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🐍 Flask (app.py)
            </button>
            <button
              onClick={() => setActiveTab('streamlit')}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'streamlit'
                  ? 'border-orange-500 text-orange-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              ⚡ Streamlit (app.py)
            </button>
            <button
              onClick={() => setActiveTab('requirements')}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'requirements'
                  ? 'border-orange-500 text-orange-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              📦 requirements.txt
            </button>
            <button
              onClick={() => setActiveTab('env')}
              className={`px-3.5 py-2 rounded-t-xl text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'env'
                  ? 'border-orange-500 text-orange-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              🔒 .env.example
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? t.copiedCode : t.copyCode}</span>
            </button>
            <button
              onClick={handleDownload}
              title="Download file"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick run instruction bar */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
          <Terminal className="w-3.5 h-3.5 text-orange-400 shrink-0" />
          <span className="font-semibold text-slate-300">{t.howToRun}</span>
          <code className="text-sky-300 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {activeTab === 'streamlit' 
              ? 'pip install -r requirements.txt && streamlit run app.py' 
              : 'pip install -r requirements.txt && python app.py'}
          </code>
        </div>

        {/* Code View Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-950 font-mono text-xs leading-relaxed text-slate-300">
          <pre className="whitespace-pre overflow-x-auto select-all">
            {getActiveCode()}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {lang === 'bn' 
              ? 'Python Boto3 দিয়ে Cloudflare R2 এর পূর্ণাঙ্গ S3 এপিআই ইন্টিগ্রেশন।'
              : 'Full Cloudflare R2 S3 API integration using Python Boto3.'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
