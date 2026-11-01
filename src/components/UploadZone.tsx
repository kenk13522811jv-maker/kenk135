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
  Globe
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RetentionOption, UploadedFileItem, Language } from '../types';
import { uploadAsset, uploadAssetFromUrl } from '../services/assetService';
import { getActiveFirebaseConfig } from '../services/firebase';
import { translations } from '../services/translations';

interface UploadZoneProps {
  lang: Language;
  onUploadSuccess: (item: UploadedFileItem) => void;
  onOpenFirebaseSettings: () => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  lang,
  onUploadSuccess,
  onOpenFirebaseSettings,
}) => {
  const t = translations[lang];
  const fbConfig = getActiveFirebaseConfig();

  // Mode: 'file' (Drag & Drop) vs 'url' (Paste Link)
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file');

  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // URL Mode state
  const [pastedUrl, setPastedUrl] = useState<string>('');
  const [urlPreviewValid, setUrlPreviewValid] = useState<boolean>(false);
  const [isCheckingUrl, setIsCheckingUrl] = useState<boolean>(false);

  const [retention, setRetention] = useState<RetentionOption>('permanent');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [lastUploaded, setLastUploaded] = useState<UploadedFileItem | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
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

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setErrorMessage(
        lang === 'bn' 
          ? 'শুধুমাত্র ছবি বা ভিডিও ফাইল আপলোড করা যাবে।' 
          : 'Only image or video files are supported.'
      );
      return;
    }

    setErrorMessage(null);
    setLastUploaded(null);
    setSelectedFile(file);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleClearSelection = () => {
    if (previewUrl && selectedFile) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setPastedUrl('');
    setUrlPreviewValid(false);
    setUploadProgress(0);
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

  // Upload either selected File or Pasted URL
  const handleStartUpload = async () => {
    if (inputMode === 'file' && !selectedFile) return;
    if (inputMode === 'url' && !pastedUrl.trim()) return;

    setIsUploading(true);
    setUploadProgress(20);
    setErrorMessage(null);

    try {
      let item: UploadedFileItem;

      if (inputMode === 'url') {
        item = await uploadAssetFromUrl(pastedUrl.trim(), retention, (pct) => {
          setUploadProgress(pct);
        });
      } else {
        item = await uploadAsset(selectedFile!, selectedFile!.name, retention, (pct) => {
          setUploadProgress(pct);
        });
      }

      setLastUploaded(item);
      onUploadSuccess(item);

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {}

      handleClearSelection();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Upload could not complete.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isVideo = selectedFile 
    ? selectedFile.type.startsWith('video/')
    : pastedUrl.match(/\.(mp4|webm|mov|ogg)($|\?)/i);

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
              Firebase Storage & Firestore
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <UploadCloud className="w-6 h-6 text-amber-400" />
            <span>{lang === 'bn' ? 'এআই ভিডিও পাইপলাইন অ্যাসেট আপলোড' : 'AI Video Pipeline Asset Upload'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {lang === 'bn' 
              ? 'ফাইল ড্র্যাগ-অ্যান্ড-ড্রপ করুন অথবা অনলাইন ইমেজ/ভিডিও লিংক পেস্ট করে Firebase-এ সেভ করুন।'
              : 'Upload by drag-and-drop or paste any online image/video link to save into Firebase.'}
          </p>
        </div>

        {/* Current storage target indicator */}
        <button
          onClick={onOpenFirebaseSettings}
          className="flex items-center gap-2 self-start sm:self-auto bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-xl px-3.5 py-2 text-xs text-slate-300 transition-all hover:bg-slate-900 group"
          title="Click to view or edit Firebase configuration"
        >
          <Flame className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <div className="text-left">
            <div className="text-[10px] text-slate-400 leading-none">Storage Bucket</div>
            <div className="font-mono font-semibold text-amber-300 truncate max-w-[150px] sm:max-w-[190px]">
              {fbConfig.storageBucket || 'firebase-storage'}
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
          <span>{lang === 'bn' ? 'ফাইল আপলোড (Drag & Drop)' : 'File Upload (Drag & Drop)'}</span>
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

      {/* Success Banner if file just uploaded */}
      {lastUploaded && (
        <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900/90 border border-emerald-500/30 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm sm:text-base flex items-center gap-2">
                  <span>{t.uploadSuccessTitle} ({lastUploaded.name})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {lastUploaded.storageProvider === 'firebase-storage' ? 'Firebase Live' : 'Vault Saved'}
                  </span>
                </h3>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                  <span className="capitalize">{lastUploaded.category}</span>
                  <span>•</span>
                  <span>{(lastUploaded.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-medium">
                    {lastUploaded.retention === 'permanent' 
                      ? (lang === 'bn' ? 'স্থায়ী ফাইল (Permanent)' : 'Permanent Asset') 
                      : (lang === 'bn' ? 'অটো-ডিলিট নির্ধারিত (Temporary)' : 'Auto-delete scheduled')}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setLastUploaded(null)}
              className="text-slate-400 hover:text-slate-200 text-xs p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Public Link Box */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
              <span>{t.publicUrlLabel}</span>
              <span className="text-[10px] text-amber-400 font-normal">
                {lang === 'bn' ? '✓ AI ভিডিও পাইপলাইনে সরাসরি ব্যবহারের জন্য প্রস্তুত' : '✓ Direct public link for video generation pipeline'}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono text-sky-300 overflow-x-auto truncate">
                {lastUploaded.publicUrl}
              </div>

              <button
                onClick={() => handleCopy(lastUploaded.publicUrl)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? t.copied : t.copyLink}</span>
              </button>

              <button
                onClick={() => setShowQr(!showQr)}
                title="Show QR Code"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0"
              >
                <QrCode className="w-4 h-4" />
              </button>

              <a
                href={lastUploaded.publicUrl}
                target="_blank"
                rel="noreferrer"
                title="Open Link"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* QR Code display */}
            {showQr && (
              <div className="mt-3 p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col items-center justify-center gap-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(lastUploaded.publicUrl)}`}
                  alt="QR Code"
                  className="w-36 h-36 rounded-lg bg-white p-2"
                />
                <span className="text-[11px] text-slate-400">
                  {lang === 'bn' ? 'মোবাইল দিয়ে স্ক্যান করে লিংকটি খুলুন' : 'Scan with mobile to open direct asset'}
                </span>
              </div>
            )}
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

            {/* URL Live Preview Card */}
            {urlPreviewValid && (
              <div className="mt-4 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-400 mb-2 font-medium">
                  {lang === 'bn' ? 'ইমেজ / ভিডিও লাইভ প্রিভিউ:' : 'Media Live Preview:'}
                </span>
                {isVideo ? (
                  <video
                    src={pastedUrl}
                    controls
                    className="max-h-56 max-w-full rounded-xl object-contain shadow-md"
                  />
                ) : (
                  <img
                    src={pastedUrl}
                    alt="Pasted Preview"
                    className="max-h-56 max-w-full rounded-xl object-contain shadow-md"
                    onError={() => {
                      // Some hotlinked images might block direct hotlink rendering
                    }}
                  />
                )}
              </div>
            )}

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
                    <div className="font-semibold text-xs sm:text-sm">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {opt.desc}
                    </div>
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
                    <span>{lang === 'bn' ? 'Firebase ও ভল্টে প্রসেসিং হচ্ছে...' : 'Processing and saving into Firebase...'}</span>
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

            {/* Action Buttons for URL */}
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
                    <span>{lang === 'bn' ? 'লিংক সেভ ও পাবলিক URL তৈরি করুন' : 'Save URL & Generate Public Link'}</span>
                  </>
                )}
              </button>

              {isUploading && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-4 py-3 rounded-xl text-sm font-medium border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  {t.cancel}
                </button>
              )}
            </div>
          </div>
        ) : !selectedFile ? (
          /* ================= FILE DRAG & DROP MODE ================= */
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
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500/10 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform mb-4">
              <UploadCloud className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>

            <h3 className="text-base sm:text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors">
              {t.dragDropHeading}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1.5">
              {t.dragDropSub}
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
                Auto AI Video Ingestion
              </span>
            </div>
          </div>
        ) : (
          /* ================= FILE SELECTED STATE ================= */
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3 truncate">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  {isVideo ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                </div>
                <div className="truncate">
                  <h4 className="font-semibold text-slate-200 text-sm truncate">
                    {selectedFile.name}
                  </h4>
                  <span className="text-xs text-slate-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type}
                  </span>
                </div>
              </div>

              <button
                onClick={handleClearSelection}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Cancel selection"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Media visual preview */}
            <div className="my-5 flex justify-center bg-slate-900/50 rounded-xl p-3 border border-slate-800/60">
              {isVideo ? (
                <video
                  src={previewUrl || ''}
                  controls
                  className="max-h-64 rounded-lg object-contain"
                />
              ) : (
                <img
                  src={previewUrl || ''}
                  alt="Preview"
                  className="max-h-64 rounded-lg object-contain shadow-md"
                />
              )}
            </div>

            {/* Retention Policy Selection */}
            <div className="mt-5">
              <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>{t.retentionLabel}</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {lang === 'bn' ? 'মেয়াদ শেষে Firebase Storage ও ড্যাশবোর্ড থেকে অটো-ডিলিট হবে' : 'Automatically purged from Firebase on expiry'}
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
                    <div className="font-semibold text-xs sm:text-sm">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {opt.desc}
                    </div>
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
                    <span>{lang === 'bn' ? 'Firebase ও ভল্টে প্রসেসিং হচ্ছে...' : 'Uploading and storing in Firebase...'}</span>
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
                    <span>{lang === 'bn' ? 'Firebase এ আপলোড ও লিংক তৈরি করুন' : 'Upload to Firebase & Generate URL'}</span>
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
