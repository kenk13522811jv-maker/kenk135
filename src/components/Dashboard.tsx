import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink, 
  Download, 
  Eye, 
  Clock, 
  ShieldCheck, 
  HardDrive,
  LayoutGrid, 
  List, 
  Film, 
  ImageIcon,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { Flame } from 'lucide-react';
import { UploadedFileItem, Language } from '../types';
import { translations } from '../services/translations';
import { deleteAsset, runAutomatedCleanup } from '../services/assetService';
import { getFileBlobForDownload } from '../services/r2Service';

interface DashboardProps {
  files: UploadedFileItem[];
  lang: Language;
  onRefresh: (deletedId?: string) => void;
  onPreview: (file: UploadedFileItem) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getRemainingTimeText(expiresAt: number | null, lang: Language): { text: string; isExpiringSoon: boolean } {
  if (!expiresAt) {
    return {
      text: lang === 'bn' ? 'স্থায়ী' : 'Permanent',
      isExpiringSoon: false,
    };
  }

  const diffMs = expiresAt - Date.now();
  if (diffMs <= 0) {
    return {
      text: lang === 'bn' ? 'মেয়াদোত্তীর্ণ (Expired)' : 'Expired',
      isExpiringSoon: true,
    };
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const remHours = diffHours % 24;
    return {
      text: lang === 'bn' 
        ? `${diffDays} দিন ${remHours} ঘণ্টা বাকি` 
        : `${diffDays}d ${remHours}h left`,
      isExpiringSoon: false,
    };
  }

  if (diffHours > 0) {
    const remMin = diffMinutes % 60;
    return {
      text: lang === 'bn' 
        ? `${diffHours} ঘণ্টা ${remMin} মি. বাকি` 
        : `${diffHours}h ${remMin}m left`,
      isExpiringSoon: diffHours < 3,
    };
  }

  return {
    text: lang === 'bn' 
      ? `${diffMinutes} মিনিট বাকি` 
      : `${diffMinutes}m left`,
    isExpiringSoon: true,
  };
}

export const Dashboard: React.FC<DashboardProps> = ({
  files,
  lang,
  onRefresh,
  onPreview,
}) => {
  const t = translations[lang];

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'expiring' | 'permanent'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<UploadedFileItem | null>(null);

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((item) => {
      // Search
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Filter category
      if (filterType === 'image') return item.category === 'image';
      if (filterType === 'video') return item.category === 'video';
      if (filterType === 'expiring') return item.retention !== 'permanent';
      if (filterType === 'permanent') return item.retention === 'permanent';

      return true;
    });
  }, [files, searchQuery, filterType]);

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDownload = async (file: UploadedFileItem) => {
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
        // Fallback directly to public URL
        window.open(file.publicUrl, '_blank');
      }
    } catch {
      window.open(file.publicUrl, '_blank');
    }
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    const target = fileToDelete;
    setDeletingId(target.id);
    try {
      await deleteAsset(target);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeletingId(null);
      setFileToDelete(null);
      onRefresh(target.id);
    }
  };

  const handleCleanupExpired = async () => {
    await runAutomatedCleanup();
    onRefresh();
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-xl shadow-black/20 my-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <span>{t.dashboardHeading}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {files.length}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.dashboardSub}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCleanupExpired}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/20 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.cleanupExpiredBtn}</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-slate-800 text-orange-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-slate-800 text-orange-400' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 my-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: t.filterAll },
            { id: 'image', label: t.filterImages },
            { id: 'video', label: t.filterVideos },
            { id: 'expiring', label: t.filterExpiring },
            { id: 'permanent', label: t.filterPermanent },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === tab.id
                  ? 'bg-orange-500 text-white font-semibold shadow-sm'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* File List/Grid */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h4 className="text-sm sm:text-base font-semibold text-slate-300">
            {files.length === 0 ? t.noFilesUploadedYet : t.noFilesFound}
          </h4>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const { text: expiryText, isExpiringSoon } = getRemainingTimeText(file.expiresAt, lang);
            const isCopied = copiedId === file.id;

            return (
              <div
                key={file.id}
                className="group relative bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-xl hover:shadow-black/30"
              >
                {/* Media Preview Box */}
                <div 
                  onClick={() => onPreview(file)}
                  className="relative w-full h-44 rounded-xl bg-slate-900 border border-slate-800/80 overflow-hidden flex items-center justify-center cursor-pointer group-hover:opacity-95"
                >
                  {file.category === 'video' ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                      {file.thumbnailUrl ? (
                        <video 
                          src={file.thumbnailUrl} 
                          className="w-full h-full object-cover opacity-80" 
                          preload="metadata"
                        />
                      ) : null}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-orange-500/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Film className="w-6 h-6" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={file.thumbnailUrl || file.publicUrl}
                      alt={file.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                      loading="lazy"
                    />
                  )}

                  {/* Badges on top */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/10 uppercase">
                      {file.category}
                    </span>
                    {file.storageProvider === 'firebase-storage' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 backdrop-blur-md flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        Firebase
                      </span>
                    ) : file.storageProvider === 'cloudflare-r2' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/80 text-white backdrop-blur-md">
                        R2
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 backdrop-blur-md">
                        Sandbox
                      </span>
                    )}
                  </div>

                  {/* Expiration badge */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 backdrop-blur-md ${
                      file.retention === 'permanent'
                        ? 'bg-slate-950/80 text-emerald-400 border border-emerald-500/30'
                        : isExpiringSoon
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                        : 'bg-slate-950/80 text-amber-300 border border-amber-500/30'
                    }`}>
                      <Clock className="w-3 h-3" />
                      <span>{expiryText}</span>
                    </span>
                  </div>
                </div>

                {/* File Details */}
                <div className="mt-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 
                      onClick={() => onPreview(file)}
                      title={file.name} 
                      className="font-semibold text-sm text-slate-200 truncate cursor-pointer hover:text-orange-400 transition-colors"
                    >
                      {file.name}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 truncate font-mono">
                    {file.publicUrl}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => handleCopy(file.id, file.publicUrl)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? t.copied : t.copyLink}</span>
                  </button>

                  <button
                    onClick={() => onPreview(file)}
                    title={t.previewFile}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDownload(file)}
                    title={t.download}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setFileToDelete(file)}
                    title={t.delete}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/40 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">{t.fileName}</th>
                <th className="py-3 px-3">{t.type}</th>
                <th className="py-3 px-3">{t.fileSize}</th>
                <th className="py-3 px-3">{t.expiry}</th>
                <th className="py-3 px-3 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredFiles.map((file) => {
                const { text: expiryText, isExpiringSoon } = getRemainingTimeText(file.expiresAt, lang);
                const isCopied = copiedId === file.id;

                return (
                  <tr key={file.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="py-3 px-3 font-medium text-slate-200">
                      <div className="flex items-center gap-2.5 max-w-xs sm:max-w-md truncate">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-orange-400">
                          {file.category === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                        </div>
                        <div className="truncate">
                          <span 
                            onClick={() => onPreview(file)}
                            className="truncate block cursor-pointer hover:text-orange-400"
                          >
                            {file.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block truncate">
                            {file.publicUrl}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 capitalize text-slate-400">
                      {file.category}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">
                      {formatBytes(file.size)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        file.retention === 'permanent'
                          ? 'bg-emerald-950/60 text-emerald-300'
                          : isExpiringSoon
                          ? 'bg-rose-950/60 text-rose-300'
                          : 'bg-amber-950/60 text-amber-300'
                      }`}>
                        <Clock className="w-3 h-3" />
                        <span>{expiryText}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleCopy(file.id, file.publicUrl)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title={t.copyLink}
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onPreview(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title={t.previewFile}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownload(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title={t.download}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setFileToDelete(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-400"
                          title={t.delete}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal for File Deletion */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-100">
                {t.confirmDelete}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              {lang === 'bn' 
                ? `ফাইল: "${fileToDelete.name}" মুছে ফেলা হবে এবং পাবলিক লিংকটি অকার্যকর হয়ে যাবে।`
                : `File "${fileToDelete.name}" will be deleted from the vault and the public link will no longer work.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmDelete}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deletingId ? 'Deleting...' : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
