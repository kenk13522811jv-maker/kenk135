import React, { useState } from 'react';
import { X, Copy, Check, Download, ExternalLink, Clock, ShieldCheck, Film, Image as ImageIcon } from 'lucide-react';
import { UploadedFileItem, Language } from '../types';
import { translations } from '../services/translations';
import { getFileBlobForDownload } from '../services/r2Service';

interface MediaPreviewModalProps {
  file: UploadedFileItem | null;
  lang: Language;
  onClose: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  file,
  lang,
  onClose,
}) => {
  const t = translations[lang];
  const [copied, setCopied] = useState<boolean>(false);

  if (!file) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(file.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = async () => {
    try {
      const blob = await getFileBlobForDownload(file);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        window.open(file.publicUrl, '_blank');
      }
    } catch {
      window.open(file.publicUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
              {file.category === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base truncate">
                {file.name}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-center justify-center bg-slate-950/60 min-h-[300px]">
          {file.category === 'video' ? (
            <video
              src={file.thumbnailUrl || file.publicUrl}
              controls
              autoPlay
              className="max-h-[60vh] max-w-full rounded-xl shadow-xl object-contain"
            />
          ) : (
            <img
              src={file.thumbnailUrl || file.publicUrl}
              alt={file.name}
              className="max-h-[60vh] max-w-full rounded-xl shadow-xl object-contain"
            />
          )}
        </div>

        {/* Footer Details & Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              {file.retention === 'permanent' 
                ? (lang === 'bn' ? 'স্থায়ী ফাইল' : 'Permanent')
                : (lang === 'bn' ? `অটো-ডিলিট পলিসি: ${file.retention}` : `Auto-delete: ${file.retention}`)}
            </span>
            <span>•</span>
            <span className="font-mono text-slate-400">
              Provider: {file.storageProvider}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? t.copied : t.copyLink}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <Download className="w-4 h-4" />
              <span>{t.download}</span>
            </button>

            <a
              href={file.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center"
              title="Open Public Link"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
