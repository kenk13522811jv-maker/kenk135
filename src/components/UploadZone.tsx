import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { 
  UploadCloud, 
  Film, 
  Image as ImageIcon, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  Clock, 
  Flame, 
  AlertCircle,
  QrCode,
  Sparkles,
  Bot,
  Link2,
  Globe,
  Layers,
  FileCheck2,
  ListOrdered
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RetentionOption, UploadedFileItem, Language } from '../types';
import { uploadAsset, uploadMultipleAssets, uploadAssetFromUrl, cancelCurrentUpload } from '../services/assetService';
import { getActiveFirebaseConfig, isFirebaseConfigured } from '../services/firebase';
import { translations } from '../services/translations';

interface UploadZoneProps {
  lang: Language;
  onUploadSuccess: (itemOrItems: UploadedFileItem | UploadedFileItem[]) => void;
  onOpenFirebaseSettings: () => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  lang,
  onUploadSuccess,
  onOpenFirebaseSettings,
}) => {
  const t = translations[lang];
  const fbConfig = getActiveFirebaseConfig();

  // Mode: 'file' (Drag & Drop multiple) vs 'url' (Paste Link)
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file');

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ [key: string]: string }>({});

  // URL Mode state
  const [pastedUrl, setPastedUrl] = useState<string>('');
  const [urlPreviewValid, setUrlPreviewValid] = useState<boolean>(false);

  const [retention, setRetention] = useState<RetentionOption>('permanent');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');

  // Batch upload results
  const [uploadedResults, setUploadedResults] = useState<UploadedFileItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [qrCodeFileId, setQrCodeFileId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFiles = (files: File[]) => {
    const validFiles: File[] = [];
    const newPreviews: { [key: string]: string } = {};

    for (const file of files) {
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        validFiles.push(file);
        try {
          newPreviews[file.name] = URL.createObjectURL(file);
        } catch {}
      }
    }

    if (validFiles.length === 0) {
      setErrorMessage(
        lang === 'bn' 
          ? 'শুধুমাত্র ছবি বা ভিডিও ফাইল আপলোড করা যাবে।' 
          : 'Only image or video files are supported.'
      );
      return;
    }

    setErrorMessage(null);
    setUploadedResults([]);
    setSelectedFiles((prev) => [...prev, ...validFiles]);
    setFilePreviews((prev) => ({ ...prev, ...newPreviews }));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    const fileToRemove = selectedFiles[index];
    if (fileToRemove && filePreviews[fileToRemove.name]) {
      URL.revokeObjectURL(filePreviews[fileToRemove.name]);
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearSelection = async () => {
    if (isUploading) {
      try {
        await cancelCurrentUpload();
      } catch {}
    }
    Object.values(filePreviews).forEach((url) => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setFilePreviews({});
    setPastedUrl('');
    setUrlPreviewValid(false);
    setUploadProgress(0);
    setUploadStatusText('');
    setIsUploading(false);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUrlChange = (val: string) => {
    setPastedUrl(val);
    setErrorMessage(null);
    if (!val.trim()) {
      setUrlPreviewValid(false);
      return;
    }

    try {
      new URL(val);
      setUrlPreviewValid(true);
    } catch {
      setUrlPreviewValid(false);
    }
  };

  // Start Upload (Single URL or Multiple Files in Batch)
  const handleStartUpload = async () => {
    if (inputMode === 'file' && selectedFiles.length === 0) return;
    if (inputMode === 'url' && !pastedUrl.trim()) return;

    setIsUploading(true);
    setUploadProgress(5);
    setErrorMessage(null);
    setUploadedResults([]);

    try {
      if (inputMode === 'url') {
        setUploadStatusText(lang === 'bn' ? 'URL প্রসেস করা হচ্ছে...' : 'Processing URL...');
        const item = await uploadAssetFromUrl(pastedUrl.trim(), retention, (pct) => {
          setUploadProgress(pct);
        });
        setUploadedResults([item]);
        onUploadSuccess(item);
      } else {
        const total = selectedFiles.length;
        if (total === 1) {
          setUploadStatusText(lang === 'bn' ? 'Firebase এ আপলোড হচ্ছে...' : 'Uploading to Firebase...');
          const item = await uploadAsset(selectedFiles[0], selectedFiles[0].name, retention, (pct) => {
            setUploadProgress(pct);
          });
          setUploadedResults([item]);
          onUploadSuccess(item);
        } else {
          // Bulk upload (10, 20, 30+ files)
          const results = await uploadMultipleAssets(
            selectedFiles,
            retention,
            (completed, totalCount, currentName, filePct) => {
              const overallPct = Math.round(((completed + filePct / 100) / totalCount) * 100);
              setUploadProgress(Math.min(99, overallPct));
              setUploadStatusText(
                lang === 'bn'
                  ? `আপলোড হচ্ছে: ${completed + 1} / ${totalCount} (${currentName}) - ${filePct}%`
                  : `Uploading: ${completed + 1} / ${totalCount} (${currentName}) - ${filePct}%`
              );
            }
          );

          if (results.length > 0) {
            setUploadedResults(results);
            onUploadSuccess(results);
          } else {
            throw new Error(lang === 'bn' ? 'কোনো ফাইল আপলোড করা যায়নি।' : 'No files could be uploaded.');
          }
        }
      }

      setUploadProgress(100);

      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}

      // Clear selected input after successful upload
      setSelectedFiles([]);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Upload could not complete.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopySingle = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyAllLinks = () => {
    if (uploadedResults.length === 0) return;
    const allLinks = uploadedResults.map((r) => r.publicUrl).join('\n');
    navigator.clipboard.writeText(allLinks);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const totalSelectedSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-2xl shadow-black/30">
      {/* Upload Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI Video Pipeline
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30 flex items-center gap-1">
              <Flame className="w-3 h-3" />
              Firebase Firestore Direct
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Bulk Upload (10-30+)
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <UploadCloud className="w-6 h-6 text-amber-400" />
            <span>{lang === 'bn' ? 'ফায়ারবেস অ্যাসেট আপলোড (সিঙ্গেল ও বাল্ক)' : 'Firebase Asset Upload (Single & Bulk)'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {lang === 'bn' 
              ? 'একসাথে ১০, ২০ বা ৩০+ ছবি/ভিডিও ড্রপ করুন। প্রতিটি ফাইল আলাদাভাবে Firebase-এ সেভ হবে এবং সিরিয়াল অনুযায়ী লিংক পাবেন।'
              : 'Select 10, 20 or 30+ files at once. Every file is saved directly into Firebase and returns serial public links.'}
          </p>
        </div>

        {/* Current storage target indicator */}
        <button
          onClick={onOpenFirebaseSettings}
          className="flex items-center gap-2 self-start sm:self-auto rounded-xl px-3.5 py-2 text-xs transition-all border bg-emerald-950/50 border-emerald-500/40 text-emerald-300"
          title="Click to view or edit Firebase configuration"
        >
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="text-left">
            <div className="text-[10px] opacity-80 leading-none">Database Target</div>
            <div className="font-mono font-semibold truncate max-w-[150px] sm:max-w-[190px]">
              {fbConfig.firestoreDatabaseId || 'ai-studio-cloudflarer2file'}
            </div>
          </div>
        </button>
      </div>

      {/* Input Method Switcher (File vs URL) */}
      <div className="flex items-center gap-2 mt-5">
        <button
          onClick={() => { setInputMode('file'); handleClearSelection(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            inputMode === 'file'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>{lang === 'bn' ? 'ফাইল আপলোড (মাল্টিপল / বাল্ক)' : 'File Upload (Multi / Bulk)'}</span>
        </button>

        <button
          onClick={() => { setInputMode('url'); handleClearSelection(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            inputMode === 'url'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>{lang === 'bn' ? 'ইমেজ/ভিডিও লিংক পেস্ট করুন' : 'Paste Image/Video URL'}</span>
        </button>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="mt-4 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button 
            onClick={() => setErrorMessage(null)}
            className="text-slate-400 hover:text-slate-200 text-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================= BATCH RESULTS PANEL ================= */}
      {uploadedResults.length > 0 && (
        <div className="mt-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900/90 to-slate-900 border border-emerald-500/40 shadow-xl animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm sm:text-base flex items-center gap-2">
                  <span>
                    {lang === 'bn' 
                      ? `${uploadedResults.length}টি ফাইল সফলভাবে Firebase এ আপলোড হয়েছে!` 
                      : `${uploadedResults.length} files successfully saved to Firebase!`}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Firebase Live
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {lang === 'bn' 
                    ? 'ফাইলগুলো Firebase Firestore ডাটাবেসের assets কালেকশনে সংরক্ষিত হয়েছে।' 
                    : 'All assets saved directly into Firestore collection assets.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {uploadedResults.length > 1 && (
                <button
                  onClick={handleCopyAllLinks}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md ${
                    copiedAll
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedAll ? (lang === 'bn' ? 'সব কপি হয়েছে!' : 'All Copied!') : (lang === 'bn' ? 'সব লিংক কপি করুন (Copy All)' : 'Copy All Links')}</span>
                </button>
              )}

              <button
                onClick={() => setUploadedResults([])}
                className="text-slate-400 hover:text-slate-200 text-xs p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Serial List of Uploaded Assets */}
          <div className="mt-4 space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {uploadedResults.map((item, idx) => (
              <div 
                key={item.id}
                className="p-3 bg-slate-950/70 border border-slate-800/90 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-amber-400 font-mono text-xs flex items-center justify-center shrink-0 font-bold">
                    #{idx + 1}
                  </span>

                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                    {item.category === 'video' ? (
                      <Film className="w-5 h-5 text-sky-400" />
                    ) : (
                      <img 
                        src={item.publicUrl} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-200 truncate" title={item.name}>
                      {item.name}
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {(item.size / (1024 * 1024)).toFixed(2)} MB • {item.retention}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 md:w-64 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-sky-300 truncate">
                    {item.publicUrl}
                  </div>

                  <button
                    onClick={() => handleCopySingle(item.id, item.publicUrl)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      copiedId === item.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                    }`}
                  >
                    {copiedId === item.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === item.id ? 'কপি হয়েছে' : 'কপি লিংক'}</span>
                  </button>

                  <a
                    href={item.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                    title="Open Link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => setQrCodeFileId(qrCodeFileId === item.id ? null : item.id)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0"
                    title="QR Code"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                </div>

                {qrCodeFileId === item.id && (
                  <div className="w-full mt-2 pt-2 border-t border-slate-800 flex justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(item.publicUrl)}`}
                      alt="QR Code"
                      className="w-28 h-28 rounded-lg bg-white p-2"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Upload Body */}
      <div className="mt-5">
        {inputMode === 'url' ? (
          /* ================= URL PASTING MODE ================= */
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 sm:p-8">
            <label className="block text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" />
              <span>
                {lang === 'bn' 
                  ? 'গুগল বা যেকোনো ওয়েবসাইট থেকে ইমেজ বা ভিডিও এর লিংক পেস্ট করুন:' 
                  : 'Paste image or video link from Google or any website:'}
              </span>
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  placeholder="https://example.com/images/sample.jpg"
                  value={pastedUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none transition-colors"
                />
              </div>

              {pastedUrl && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Clear"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Retention Selector for URL */}
            <div className="mt-6">
              <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{t.retentionLabel}</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {lang === 'bn' ? 'মেয়াদ শেষে স্বয়ংক্রিয়ভাবে মুছে যাবে' : 'Auto-purged on expiration'}
                </span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'permanent', label: t.retentionPermanent, desc: lang === 'bn' ? 'কখনই ডিলিট হবে না' : 'Never deleted' },
                  { id: '1day', label: t.retention1Day, desc: lang === 'bn' ? '২৪ ঘণ্টা পর মুছবে' : 'Expires in 24 hours' },
                  { id: '2days', label: t.retention2Days, desc: lang === 'bn' ? '৪৮ ঘণ্টা পর মুছবে' : 'Expires in 48 hours' },
                  { id: '3days', label: t.retention3Days, desc: lang === 'bn' ? '৭২ ঘণ্টা পর মুছবে' : 'Expires in 72 hours' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRetention(opt.id as RetentionOption)}
                    disabled={isUploading}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      retention === opt.id
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 text-amber-300'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-xs sm:text-sm">{opt.label}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Button for URL */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleStartUpload}
                disabled={isUploading || !pastedUrl.trim()}
                className="flex-1 py-3 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{t.uploading}</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4 text-slate-950" />
                    <span>{lang === 'bn' ? 'Firebase-এ সংরক্ষণ ও পাবলিক লিংক তৈরি' : 'Save to Firebase & Generate Public Link'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : selectedFiles.length === 0 ? (
          /* ================= DRAG & DROP MULTIPLE FILES MODE ================= */
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative cursor-pointer border-2 border-dashed rounded-3xl p-8 sm:p-12 transition-all flex flex-col items-center justify-center text-center group ${
              dragActive
                ? 'border-amber-500 bg-amber-500/10 scale-[1.005]'
                : 'border-slate-700 hover:border-amber-500/60 bg-slate-950/40 hover:bg-slate-950/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500/10 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform mb-4">
              <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>

            <h3 className="text-base sm:text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
              {lang === 'bn' ? 'একসাথে এক বা একাধিক (১০, ২০, ৩০+) ফাইল ড্র্যাগ করুন' : 'Drop one or multiple (10, 20, 30+) files here'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1.5">
              {lang === 'bn' 
                ? 'কম্পিউটার থেকে ক্লিক করে যেকোনো সংখ্যক ছবি বা ভিডিও সিলেক্ট করুন।' 
                : 'Click to browse or drop any number of image/video assets.'}
            </p>

            <div className="flex items-center gap-3 mt-5 flex-wrap justify-center">
              <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                PNG, JPG, WEBP, GIF
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
                <Film className="w-3.5 h-3.5 text-sky-400" />
                MP4, WEBM, MOV
              </span>
              <span className="flex items-center gap-1.5 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                Multi-Asset Ingestion
              </span>
            </div>
          </div>
        ) : (
          /* ================= MULTIPLE FILES SELECTED VIEW ================= */
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 text-sm">
                    {lang === 'bn' 
                      ? `${selectedFiles.length}টি ফাইল সিলেক্ট করা হয়েছে` 
                      : `${selectedFiles.length} files selected`}
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">
                    {(totalSelectedSize / (1024 * 1024)).toFixed(2)} MB মোট সাইজ • Firebase Firestore এ সংরক্ষিত হবে
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  + {lang === 'bn' ? 'আরও যোগ করুন' : 'Add More'}
                </button>
                <button
                  onClick={handleClearSelection}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  title="Clear all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Selected Files Preview List / Carousel */}
            <div className="my-4 max-h-64 overflow-y-auto space-y-2 pr-1">
              {selectedFiles.map((f, i) => (
                <div 
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-mono text-[10px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                      {f.type.startsWith('video/') ? (
                        <Film className="w-4 h-4 text-sky-400" />
                      ) : (
                        <img 
                          src={filePreviews[f.name]} 
                          alt="" 
                          className="w-full h-full object-cover" 
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 truncate max-w-[200px] sm:max-w-xs">{f.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{(f.size / (1024 * 1024)).toFixed(2)} MB</div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveFile(i)}
                    disabled={isUploading}
                    className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Retention Policy Selection for Batch */}
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{t.retentionLabel}</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {lang === 'bn' ? 'মেয়াদ শেষে Firebase থেকে স্বয়ংক্রিয়ভাবে মুছে যাবে' : 'Auto-purged on expiry from Firebase'}
                </span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'permanent', label: t.retentionPermanent, desc: lang === 'bn' ? 'কখনই ডিলিট হবে না' : 'Never deleted' },
                  { id: '1day', label: t.retention1Day, desc: lang === 'bn' ? '২৪ ঘণ্টা পর মুছবে' : 'Expires in 24 hours' },
                  { id: '2days', label: t.retention2Days, desc: lang === 'bn' ? '৪৮ ঘণ্টা পর মুছবে' : 'Expires in 48 hours' },
                  { id: '3days', label: t.retention3Days, desc: lang === 'bn' ? '৭২ ঘণ্টা পর মুছবে' : 'Expires in 72 hours' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRetention(opt.id as RetentionOption)}
                    disabled={isUploading}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      retention === opt.id
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 text-amber-300'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-xs sm:text-sm">{opt.label}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Upload Progress Bar if active */}
            {isUploading && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>{uploadStatusText || (lang === 'bn' ? 'Firebase এ সেভ হচ্ছে...' : 'Saving into Firebase...')}</span>
                  </span>
                  <span className="font-mono text-amber-400">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleStartUpload}
                disabled={isUploading}
                className="flex-1 py-3 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{t.uploading}</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4 text-slate-950" />
                    <span>
                      {lang === 'bn' 
                        ? `${selectedFiles.length}টি ফাইল Firebase এ আপলোড করুন` 
                        : `Upload ${selectedFiles.length} files to Firebase`}
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={handleClearSelection}
                className="px-4 py-3 rounded-xl text-sm font-medium border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
