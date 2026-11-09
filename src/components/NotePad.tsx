import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Save, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  Clock, 
  Sparkles, 
  RotateCcw, 
  Clipboard, 
  Share2, 
  Download, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Flame,
  ShieldCheck,
  Bot,
  FileUp,
  UploadCloud
} from 'lucide-react';
import { Language, NoteItem, RetentionOption } from '../types';
import { saveNote, fetchNotes, deleteNote } from '../services/noteService';

interface NotePadProps {
  lang: Language;
}

export const NotePad: React.FC<NotePadProps> = ({ lang }) => {
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'saved'>('create');
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [retention, setRetention] = useState<RetentionOption>('permanent');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentlySaved, setRecentlySaved] = useState<NoteItem | null>(null);

  // File upload & drag-drop state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Saved notes list
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load notes on mount and whenever switching to saved tab
  const loadSavedNotes = async () => {
    setIsLoadingNotes(true);
    const list = await fetchNotes();
    setNotes(list);
    setIsLoadingNotes(false);
  };

  useEffect(() => {
    loadSavedNotes();
  }, []);

  // Text stats
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const approxKb = (new Blob([content]).size / 1024).toFixed(1);

  // Read .txt or document file
  const handleFileSelect = (file: File) => {
    if (!file) return;
    setSaveError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setContent(text);
      setUploadedFileName(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      if (!title.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_.-]/g, ' ');
        setTitle(cleanName);
      }
    };
    reader.onerror = () => {
      setSaveError(lang === 'bn' ? 'ফাইলটি পড়তে সমস্যা হয়েছে।' : 'Failed to read file.');
    };
    reader.readAsText(file, 'utf-8');
  };

  // Handle Save
  const handleSave = async () => {
    if (!content.trim()) {
      setSaveError(lang === 'bn' ? 'নোটের বিষয়বস্তু বা টেক্সট লিখুন' : 'Please enter note content');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Strip trailing empty newlines so preformatted reader has zero extra bottom space
      const cleanContent = content.replace(/\s+$/, '');
      const saved = await saveNote(title, cleanContent, retention);
      setRecentlySaved(saved);
      setNotes(prev => [saved, ...prev.filter(n => n.id !== saved.id)]);
      // Reset form fields
      setTitle('');
      setContent('');
      setUploadedFileName(null);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setContent(prev => (prev ? `${prev}\n${text}` : text));
      }
    } catch {
      // Permission issue or browser restriction
    }
  };

  // Load sample demonstration note
  const handleLoadSample = () => {
    setTitle('মহাস্থানগড় ভিডিও স্ক্রিপ্ট ও নির্দেশনা');
    setContent(`===== ভিডিও স্ক্রিপ্ট ও নির্দেশনা =====

[১] ইন্ট্রো দৃশ্য:
প্রাচীন বাংলার সমৃদ্ধ ইতিহাস আজও মহাস্থানগড়ের বুকে দৃশ্যমান।
ইতিহাস যার নাম মহাস্থানগড়, অবস্থিত বগুড়া জেলার শিবগঞ্জ উপজেলায় এই প্রাচীন নগরী।

[২] তথ্য বিবরণী:
- পুণ্ড্রনগরের পরিচয় ও ইতিহাস
- করতোয়া নদীর তীরে অবস্থিত পুণ্ড্রবর্ধনের রাজধানী
- প্রত্নতাত্ত্বিক নিদর্শন এবং প্রাচীন স্থাপত্য

[৩] বিশেষ দিকনির্দেশনা:
- ক্যামেরা মুভমেন্ট: ড্রোন শট ও স্লো প্যানিং
- আবহ সঙ্গীত: ধীরগতির ক্লাসিক্যাল বাঁশির সুর
- লাইটিং: ভোরের মিষ্টি সোনালী রোদ`);
  };

  // Delete note
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const ok = await deleteNote(id);
    if (ok) {
      setNotes(prev => prev.filter(n => n.id !== id));
      if (recentlySaved?.id === id) {
        setRecentlySaved(null);
      }
    }
    setDeletingId(null);
  };

  // Filtered notes
  const filteredNotes = notes.filter(n => {
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {lang === 'bn' ? 'Firebase ক্লাউড নোটপ্যাড' : 'Firebase Cloud NotePad'}
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Firestore Live</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              {lang === 'bn'
                ? 'টেক্সট বা স্ক্রিপ্ট সেভ করুন এবং স্থায়ী পাবলিক লিংক তৈরি করুন, যা কোনো ভাঙচুর ছাড়া যে কেউ বা যেকোনো AI দেখতে পারবে।'
                : 'Save notes permanently to Firebase and get clean, preformatted public links for humans & AI.'}
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              onClick={() => setActiveSubTab('create')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'create'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'নতুন নোট লিখুন' : 'New Note'}</span>
            </button>

            <button
              onClick={() => {
                setActiveSubTab('saved');
                loadSavedNotes();
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'saved'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'সংরক্ষিত নোটসমূহ' : 'Saved Notes'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeSubTab === 'saved' ? 'bg-slate-950/40 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {notes.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Recently Saved Note Success Banner */}
      {recentlySaved && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <h3 className="font-bold text-sm sm:text-base text-emerald-200">
                {lang === 'bn' ? 'নোটটি সফলভাবে Firebase এ সেভ হয়েছে!' : 'Note saved successfully to Firebase!'}
              </h3>
            </div>
            <button
              onClick={() => setRecentlySaved(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Clean Preformatted Public URL */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                  <Share2 className="w-3 h-3" />
                  <span>{lang === 'bn' ? 'পাবলিক ক্লিন প্রিভিউ লিংক:' : 'Public Clean Reader Link:'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">মানুষ ও AI উভয়ের জন্য</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={recentlySaved.publicUrl}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none selection:bg-amber-500 selection:text-slate-950"
                />
                <button
                  onClick={() => handleCopy(recentlySaved.publicUrl, 'recent_public')}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm"
                >
                  {copiedId === 'recent_public' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'recent_public' ? 'কপি!' : 'কপি'}</span>
                </button>
                <a
                  href={recentlySaved.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Open Link"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                </a>
              </div>
            </div>

            {/* Raw Plain Text URL */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  <span>{lang === 'bn' ? 'র\' প্লেইন টেক্সট লিংক (Raw):' : 'Raw Text Link (API & AI):'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">100% Plain Text</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={recentlySaved.rawUrl}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none selection:bg-sky-500 selection:text-slate-950"
                />
                <button
                  onClick={() => handleCopy(recentlySaved.rawUrl, 'recent_raw')}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-sm"
                >
                  {copiedId === 'recent_raw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'recent_raw' ? 'কপি!' : 'কপি'}</span>
                </button>
                <a
                  href={recentlySaved.rawUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Open Raw"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: CREATE NEW NOTE */}
      {activeSubTab === 'create' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          {/* Note Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">•</span>
                <span>{lang === 'bn' ? 'নোটের শিরোনাম (ঐচ্ছিক):' : 'Note Title (Optional):'}</span>
              </span>
              <span className="text-[11px] text-slate-500">
                {lang === 'bn' ? 'যেমন: মহাস্থানগড় স্ক্রিপ্ট, ভিডিও প্ল্যান' : 'e.g. Video Plan, Script'}
              </span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. আমার ভিডিওর সম্পূর্ণ স্ক্রিপ্ট ও প্রম্পট"
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all font-sans"
            />
          </div>

          {/* Note Content Textarea with File Upload & Drag-and-Drop */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                // reset input so same file can be re-selected if needed
                e.target.value = '';
              }}
              accept=".txt,.md,.srt,.json,.csv,.log,.text,text/*"
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">•</span>
                <span>{lang === 'bn' ? 'নোটপ্যাডের টেক্সট (Text Content):' : 'Note Text Content:'}</span>
              </label>

              {/* Text helper buttons & File Upload */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* .txt File Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 transition-all shadow-sm"
                  title="কম্পিউটার/মোবাইল থেকে সরাসরি .txt বা ডকুমেন্ট ফাইল আপলোড করুন"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{lang === 'bn' ? '📁 .txt ফাইল আপলোড' : '📁 Upload .txt'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title="ক্লিপবোর্ড থেকে পেস্ট করুন"
                >
                  <Clipboard className="w-3 h-3 text-sky-400" />
                  <span>পেস্ট</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30 transition-colors"
                  title="নমুনা স্ক্রিপ্ট লোড করুন"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>নমুনা টেক্সট</span>
                </button>

                {content && (
                  <button
                    type="button"
                    onClick={() => {
                      setContent('');
                      setUploadedFileName(null);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
                    title="মুছে ফেলুন"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Uploaded File Indicator Banner */}
            {uploadedFileName && (
              <div className="mb-2 px-3 py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>ফাইল লোড হয়েছে: <strong>{uploadedFileName}</strong></span>
                </span>
                <button
                  type="button"
                  onClick={() => setUploadedFileName(null)}
                  className="text-slate-400 hover:text-white text-xs ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Drag & Drop enabled textarea box */}
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className={`relative rounded-2xl bg-slate-950 border transition-all overflow-hidden ${
                isDraggingFile
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-950/20'
                  : 'border-slate-700/80 focus-within:border-amber-500'
              }`}
            >
              {isDraggingFile && (
                <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center gap-2 text-emerald-400 font-bold text-sm pointer-events-none">
                  <UploadCloud className="w-8 h-8 animate-bounce" />
                  <span>এখানে .txt ফাইলটি ছেড়ে দিন (Drop to load)</span>
                </div>
              )}

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'এখানে যেকোনো সাইজের বড় টেক্সট, স্ক্রিপ্ট বা কোড পেস্ট করুন, অথবা উপরের "📁 .txt ফাইল আপলোড" বাটনে ক্লিক করে ফাইল নির্বাচন করুন...\n\nযত বড় টেক্সটই হোক না কেন, Firebase এ নিখুঁতভাবে সেভ হবে এবং শেয়ার করা লিংকে কোনো বাড়তি ফাঁকা স্পেস ছাড়া সরাসরি পড়া যাবে।'
                    : 'Paste any large text, script, or click "📁 Upload .txt" to load your file...\nNo size limits, stored securely in Firebase.'
                }
                rows={12}
                className="w-full bg-transparent p-4 text-xs sm:text-sm text-slate-100 placeholder:text-slate-600 font-mono leading-relaxed resize-y outline-none selection:bg-amber-500 selection:text-slate-950"
              />

              {/* Stats Footer bar inside textarea */}
              <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono gap-2">
                <div className="flex items-center gap-3">
                  <span>{wordCount} শব্দ (Words)</span>
                  <span>•</span>
                  <span>{charCount} অক্ষর (Chars)</span>
                  <span>•</span>
                  <span className="text-amber-400">{approxKb} KB</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">ড্র্যাগ & ড্রপ সাপোর্টেড • UTF-8</span>
                </div>
              </div>
            </div>
          </div>

          {/* Retention Selector (স্থায়ী বা অটো-ডিলিট) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{lang === 'bn' ? 'সংরক্ষণের মেয়াদ নির্ধারণ করুন (Retention Policy):' : 'Select Retention Policy:'}</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setRetention('permanent')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex flex-col ${
                  retention === 'permanent'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
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
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
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
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
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
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>⏳ ৩ দিন পর</span>
                <span className="text-[10px] text-slate-500 font-normal">৭২ ঘণ্টা পর মুছবে</span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {saveError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Submit Save Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Firebase এ সেভ হচ্ছে...' : 'Firebase এ নোট সেভ করুন'}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SAVED NOTES LIST */}
      {activeSubTab === 'saved' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="নোটের শিরোনাম বা ভেতরের টেক্সট দিয়ে খুঁজুন..."
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
            />
          </div>

          {isLoadingNotes ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              লোড হচ্ছে...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-700 mx-auto" />
              <h4 className="text-sm font-bold text-slate-300">কোনো সংরক্ষিত নোট নেই</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery ? 'আপনার সার্চ কোয়েরির সাথে কোনো নোট মেলেনি।' : 'নতুন নোট লিখতে উপরের "নতুন নোট লিখুন" ট্যাবে ক্লিক করুন।'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setActiveSubTab('create')}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>এখনই লিখুন</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition-all shadow-md space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <h4 className="font-bold text-sm text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{note.title || 'Untitled Note'}</span>
                      </h4>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        <span>{new Date(note.createdAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        <span>•</span>
                        <span>{(note.size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span className="text-amber-400">
                          {note.retention === 'permanent' ? '♾️ স্থায়ী' : `⏳ ${note.retention}`}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Copy Public Link */}
                      <button
                        onClick={() => handleCopy(note.publicUrl, `pub_${note.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors"
                        title="পাবলিক লিংক কপি করুন"
                      >
                        {copiedId === `pub_${note.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedId === `pub_${note.id}` ? 'কপি হয়েছে' : 'লিংক কপি'}</span>
                      </button>

                      {/* Open Clean Reader */}
                      <a
                        href={note.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                        title="ক্লিন ভিউতে ওপেন করুন"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>প্রিভিউ</span>
                      </a>

                      {/* Raw Link */}
                      <a
                        href={note.rawUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800"
                        title="100% Raw Plain Text"
                      >
                        Raw
                      </a>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 transition-colors"
                        title="নোটটি মুছে ফেলুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Note snippet preview */}
                  <div className="bg-slate-950 rounded-lg p-3 border border-slate-800/80">
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap line-clamp-3 leading-relaxed">
                      {note.content}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
