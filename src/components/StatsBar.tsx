import React from 'react';
import { Files, Database, Clock, Shield } from 'lucide-react';
import { UploadedFileItem, Language } from '../types';
import { translations } from '../services/translations';

interface StatsBarProps {
  files: UploadedFileItem[];
  lang: Language;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const StatsBar: React.FC<StatsBarProps> = ({ files, lang }) => {
  const t = translations[lang];

  const totalFiles = files.length;
  const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
  const permanentCount = files.filter(f => f.retention === 'permanent').length;
  const expiringCount = files.filter(f => f.retention !== 'permanent').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 my-6">
      {/* Total files */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 text-slate-400 text-xs sm:text-sm font-medium mb-1">
          <Files className="w-4 h-4 text-orange-400" />
          <span>{t.totalFiles}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-100">
          {totalFiles}
        </div>
      </div>

      {/* Storage Used */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 text-slate-400 text-xs sm:text-sm font-medium mb-1">
          <Database className="w-4 h-4 text-sky-400" />
          <span>{t.storageUsed}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-100">
          {formatBytes(totalBytes)}
        </div>
      </div>

      {/* Permanent files */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 text-slate-400 text-xs sm:text-sm font-medium mb-1">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>{t.permanentFiles}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-100">
          {permanentCount}
        </div>
      </div>

      {/* Expiring files */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 text-slate-400 text-xs sm:text-sm font-medium mb-1">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>{t.expiringFiles}</span>
        </div>
        <div className="text-xl sm:text-2xl font-bold text-slate-100">
          {expiringCount}
        </div>
      </div>
    </div>
  );
};
