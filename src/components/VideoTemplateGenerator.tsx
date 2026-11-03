import React, { useState, useId } from 'react';
import { 
  Clapperboard, 
  FileText, 
  Upload, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  RotateCcw, 
  Sparkles, 
  Image as ImageIcon,
  Palette,
  Film,
  Info,
  ChevronUp,
  ChevronDown,
  Layers,
  Eye,
  X,
  Maximize2
} from 'lucide-react';
import { Language } from '../types';

export interface ImagePlacementItem {
  id: string;
  fileName: string;
  previewUrl?: string;
  srtLine: number | string;
  text: string;
}

interface VideoTemplateGeneratorProps {
  lang: Language;
}

const DEFAULT_STYLE_TEXT = '(এসআরটি ফাইল বা স্ক্রিপ্ট কথা অনুযায়ী তুমি তোমার মনমতো কাজ করবা / স্বয়ংক্রিয়)';
const DEFAULT_STYLE_HEADER_NOTE = 'ঐচ্ছিক, লিখলে ফল আপনার পছন্দের কাছাকাছি আসবে';

export const VideoTemplateGenerator: React.FC<VideoTemplateGeneratorProps> = ({ lang }) => {
  // Section [A]: Files
  const [srtFileName, setSrtFileName] = useState<string>('');
  const [logoFileName, setLogoFileName] = useState<string>('');

  // Section [B]: Image placements
  const [placements, setPlacements] = useState<ImagePlacementItem[]>([
    { id: 'item-1', fileName: '', srtLine: 1, text: '' }
  ]);

  // Section [C]: Video Style & Editable Style Header Note
  const [styleHeaderNote, setStyleHeaderNote] = useState<string>(DEFAULT_STYLE_HEADER_NOTE);
  const [speed, setSpeed] = useState<string>('');
  const [colors, setColors] = useState<string>('');
  const [specialScenes, setSpecialScenes] = useState<string>('');
  const [dontWant, setDontWant] = useState<string>('');

  // UI state
  const [copied, setCopied] = useState<boolean>(false);
  const [activePreview, setActivePreview] = useState<ImagePlacementItem | null>(null);

  const srtInputId = useId();
  const logoInputId = useId();
  const bulkImagesInputId = useId();

  // Handle SRT file pick
  const handleSrtFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSrtFileName(e.target.files[0].name);
    }
  };

  // Handle Logo file pick
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFileName(e.target.files[0].name);
    }
  };

  // Add a blank row to Section [B]
  const handleAddRow = () => {
    const nextLineNumber = placements.length > 0 
      ? Number(placements[placements.length - 1].srtLine) + 3 || placements.length + 1
      : 1;

    setPlacements(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        fileName: '',
        srtLine: nextLineNumber,
        text: ''
      }
    ]);
  };

  // Handle single row image file pick
  const handleRowFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileName = file.name;
      const previewUrl = URL.createObjectURL(file);
      setPlacements(prev => {
        const next = [...prev];
        next[index] = { ...next[index], fileName, previewUrl };
        return next;
      });
    }
  };

  // Handle bulk images selection/drop (creates multiple rows automatically with previewUrls)
  const handleBulkImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const newItems: ImagePlacementItem[] = fileArray.map((file, idx) => ({
      id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      srtLine: (idx + 1) * 3, // Auto spacing hint
      text: ''
    }));

    setPlacements(prev => {
      // If previous only had 1 empty row, replace it
      if (prev.length === 1 && !prev[0].fileName && !prev[0].text) {
        return newItems;
      }
      return [...prev, ...newItems];
    });
  };

  // Update specific placement row field
  const handleUpdatePlacement = (index: number, field: keyof ImagePlacementItem, value: any) => {
    setPlacements(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    setPlacements(prev => {
      if (prev.length <= 1) {
        return [{ id: `item-${Date.now()}`, fileName: '', srtLine: 1, text: '' }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Move row up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setPlacements(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Move row down
  const handleMoveDown = (index: number) => {
    if (index === placements.length - 1) return;
    setPlacements(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Pre-load demo data (user's Mahasthangarh example)
  const handleLoadDemo = () => {
    setSrtFileName('Generated_Audio_November_02_2026_-_9_17PM_ben.srt');
    setLogoFileName('logo.jpeg');
    setPlacements([
      {
        id: 'demo-1',
        fileName: 'Gemini_Generated_Image_rl3gz3rl3gz3rl3g.jpeg',
        previewUrl: 'https://images.unsplash.com/photo-1590059390046-24e525164d4d?auto=format&fit=crop&w=800&q=80',
        srtLine: 4,
        text: 'ইতিহাস যার নাম মহাস্থানগড়।'
      },
      {
        id: 'demo-2',
        fileName: 'Gemini_Generated_Image_bzntq0bzntq0bznt.jpeg',
        previewUrl: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80',
        srtLine: 7,
        text: 'অবস্থিত এই প্রাচীন নগরী'
      },
      {
        id: 'demo-3',
        fileName: 'Gemini_Generated_Image_9yhyd59yhyd59yhy.jpeg',
        previewUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
        srtLine: 9,
        text: 'প্রত্নতাত্ত্বিক নিদর্শন।'
      },
      {
        id: 'demo-4',
        fileName: 'Gemini_Generated_Image_7l8x1f7l8x1f7l8x.jpeg',
        previewUrl: 'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=800&q=80',
        srtLine: 25,
        text: 'পুণ্ড্রনগরের পরিচয় ও ইতিহাস'
      },
      {
        id: 'demo-5',
        fileName: 'Gemini_Generated_Image_mhasthan_ancient_wall.jpeg',
        previewUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
        srtLine: 42,
        text: 'প্রাচীন বাংলার সমৃদ্ধ ইতিহাস আজও মহাস্থানগড়ের বুকে দৃশ্যমান।'
      }
    ]);
    setStyleHeaderNote(DEFAULT_STYLE_HEADER_NOTE);
    setSpeed(''); // will use default
    setColors('সোনালী, প্রাচীন মাটির বাদামী ও বাস্তবধর্মী ঐতিহাসিক টোন');
    setSpecialScenes('মহাস্থানগড়ের পুরোনো মাটির দেওয়াল ও ধ্বংসাবশেষের সিনেমাটিক প্যানিং');
    setDontWant('অপ্রাসঙ্গিক আধুনিক গাড়ি, প্লাস্টিক বা আধুনিক হাইটেক উপাদান');
  };

  // Reset all
  const handleReset = () => {
    setSrtFileName('');
    setLogoFileName('');
    setPlacements([{ id: `item-${Date.now()}`, fileName: '', srtLine: 1, text: '' }]);
    setStyleHeaderNote(DEFAULT_STYLE_HEADER_NOTE);
    setSpeed('');
    setColors('');
    setSpecialScenes('');
    setDontWant('');
    setActivePreview(null);
  };

  // Format the Section [C] header according to user specification
  const formatStyleSectionHeader = () => {
    const trimmed = styleHeaderNote.trim();
    if (!trimmed) {
      return '[C] এই ভিডিওর স্টাইল';
    }
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return `[C] এই ভিডিওর স্টাইল ${trimmed}`;
    }
    return `[C] এই ভিডিওর স্টাইল (${trimmed})`;
  };

  // Generate output text exactly matching user's requested specification
  const generateOutputText = (): string => {
    const srt = srtFileName.trim() || 'নির্ধারণ করা হয়নি';
    const logo = logoFileName.trim() || 'নির্ধারণ করা হয়নি';

    const validPlacements = placements.filter(p => p.fileName.trim() || p.text.trim());
    const placementsList = (validPlacements.length > 0 ? validPlacements : placements)
      .map(p => {
        const file = p.fileName.trim() || 'চিত্র_ফাইল.jpg';
        const line = p.srtLine || '1';
        const txt = p.text.trim() || 'স্ক্রিপ্ট টেক্সট';
        return `ফাইল: ${file}  → SRT লাইন ${line} → লেখা: "${txt}"`;
      })
      .join('\n');

    const speedVal = speed.trim() || DEFAULT_STYLE_TEXT;
    const colorsVal = colors.trim() || DEFAULT_STYLE_TEXT;
    const specialVal = specialScenes.trim() || DEFAULT_STYLE_TEXT;
    const dontWantVal = dontWant.trim() || DEFAULT_STYLE_TEXT;

    return `===== এই ভিডিওর তথ্য =====

[A] ফাইল
- SRT ফাইল: ${srt}
- লোগো ফাইল: ${logo}

[B] ছবি কোথায় বসবে
${placementsList}

${formatStyleSectionHeader()}
- গতি: ${speedVal}
- মূল রং: ${colorsVal}
- বিশেষ দৃশ্য: ${specialVal}
- যা চাই না: ${dontWantVal}`;
  };

  const outputText = generateOutputText();

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = outputText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Download as .txt
  const handleDownload = () => {
    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `video_pipeline_prompt_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
            <Clapperboard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <span>{lang === 'bn' ? 'ভিডিও প্রম্পট ও টেমপ্লেট জেনারেটর' : 'Video Prompt & Template Generator'}</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Client-Side
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              {lang === 'bn'
                ? 'SRT, লোগো, ইমেজ প্লেসমেন্ট এবং স্টাইল সেট করে AI ভিডিও তৈরির জন্য নিখুঁত প্রম্পট তৈরি করুন'
                : 'Configure SRT, logo, image placements and styling parameters for AI video production'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-950/60 hover:bg-amber-900/70 text-amber-300 border border-amber-500/40 transition-all shadow-sm"
            title="Load Mahasthangarh Example"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{lang === 'bn' ? 'নমুনা ডেটা লোড করুন' : 'Load Demo Example'}</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title="Reset Form"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'রিসেট' : 'Reset'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Editor (A, B, C) */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECTION [A]: Files */}
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-black flex items-center justify-center text-sm border border-amber-500/40">
                A
              </span>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>{lang === 'bn' ? 'ফাইল নির্বাচন (SRT ও লোগো)' : 'File Inputs (SRT & Logo)'}</span>
              </h3>
            </div>

            <div className="space-y-4">
              {/* SRT File */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{lang === 'bn' ? 'SRT ফাইল:' : 'SRT File:'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {lang === 'bn' ? '(ফাইল নির্বাচন করুন বা নাম লিখুন)' : '(Select file or type name)'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={srtFileName}
                      onChange={(e) => setSrtFileName(e.target.value)}
                      placeholder="e.g. Generated_Audio_November_02_2026_-_9_17PM_ben.srt"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <input
                    type="file"
                    id={srtInputId}
                    accept=".srt,.vtt,.txt"
                    onChange={handleSrtFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor={srtInputId}
                    className="cursor-pointer shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>{lang === 'bn' ? 'ব্রাউজ' : 'Browse'}</span>
                  </label>
                </div>
              </div>

              {/* Logo File */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{lang === 'bn' ? 'লোগো ফাইল:' : 'Logo File:'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {lang === 'bn' ? '(ফাইল নির্বাচন করুন বা নাম লিখুন)' : '(Select file or type name)'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={logoFileName}
                      onChange={(e) => setLogoFileName(e.target.value)}
                      placeholder="e.g. logo.jpeg"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <input
                    type="file"
                    id={logoInputId}
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor={logoInputId}
                    className="cursor-pointer shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 hover:border-slate-600 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>{lang === 'bn' ? 'ব্রাউজ' : 'Browse'}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION [B]: Image Placements */}
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-lg relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 font-black flex items-center justify-center text-sm border border-orange-500/40">
                  B
                </span>
                <div>
                  <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-orange-400" />
                    <span>{lang === 'bn' ? 'ছবি কোথায় বসবে' : 'Image Placements (SRT Mappings)'}</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {lang === 'bn' 
                      ? 'প্রতিটি ছবির ফাইলের নাম, প্রিভিউ, SRT লাইন নম্বর ও সংশ্লিষ্ট ডায়লগ নির্ধারণ করুন'
                      : 'Map image filenames & previews to SRT line numbers and corresponding caption text'}
                  </span>
                </div>
              </div>

              {/* Bulk upload trigger */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id={bulkImagesInputId}
                  multiple
                  accept="image/*"
                  onChange={(e) => handleBulkImages(e.target.files)}
                  className="hidden"
                />
                <label
                  htmlFor={bulkImagesInputId}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                  title="Upload multiple images at once to create multiple rows"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>{lang === 'bn' ? 'মাল্টিপল ছবি ড্রপ/সিলেক্ট' : 'Bulk Select'}</span>
                </label>
              </div>
            </div>

            {/* Placements List */}
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {placements.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 transition-all group"
                >
                  <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-amber-400 font-mono">
                        #{index + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {lang === 'bn' ? 'ছবির ম্যাপিং রো' : 'Placement Row'}
                      </span>
                      {item.previewUrl && (
                        <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/30 flex items-center gap-1">
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>ছবি সংযুক্ত</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Image Preview Button */}
                      <button
                        type="button"
                        onClick={() => setActivePreview(item)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                          item.previewUrl
                            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                        }`}
                        title="ছবিটি বড় করে বা পপআপে দেখুন"
                      >
                        <Eye className="w-3 h-3 text-amber-400" />
                        <span>{lang === 'bn' ? 'ছবি দেখুন' : 'Preview'}</span>
                      </button>

                      {/* Move up / down */}
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:hover:text-slate-500"
                        title="Move Up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === placements.length - 1}
                        className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:hover:text-slate-500"
                        title="Move Down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteRow(index)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* File Name & Preview Button */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {lang === 'bn' ? 'ফাইল:' : 'File:'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        {/* Thumbnail icon if available */}
                        {item.previewUrl ? (
                          <button
                            type="button"
                            onClick={() => setActivePreview(item)}
                            className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-amber-500/50 hover:border-amber-400 group/thumb relative transition-all shadow-sm"
                            title="ক্লিক করে ছবিটি বড় করে দেখুন"
                          >
                            <img
                              src={item.previewUrl}
                              alt={item.fileName}
                              className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-3 h-3 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-slate-600">
                            <ImageIcon className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <input
                          type="text"
                          value={item.fileName}
                          onChange={(e) => handleUpdatePlacement(index, 'fileName', e.target.value)}
                          placeholder="e.g. Gemini_Generated_Image...jpeg"
                          className="flex-1 bg-slate-900 border border-slate-700/80 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono"
                        />

                        {/* Upload file button */}
                        <label className="cursor-pointer p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0" title="ছবি নির্বাচন করুন">
                          <Upload className="w-3.5 h-3.5 text-amber-400" />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleRowFileChange(index, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* SRT Line Number */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {lang === 'bn' ? 'SRT লাইন:' : 'SRT Line:'}
                      </label>
                      <input
                        type="text"
                        value={item.srtLine}
                        onChange={(e) => handleUpdatePlacement(index, 'srtLine', e.target.value)}
                        placeholder="e.g. 4"
                        className="w-full bg-slate-900 border border-slate-700/80 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none font-mono text-center"
                      />
                    </div>

                    {/* Text / Script line */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {lang === 'bn' ? 'লেখা:' : 'Text / Caption:'}
                      </label>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => handleUpdatePlacement(index, 'text', e.target.value)}
                        placeholder="e.g. ইতিহাস যার নাম মহাস্থানগড়।"
                        className="w-full bg-slate-900 border border-slate-700/80 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={handleAddRow}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{lang === 'bn' ? 'নতুন রো যোগ করুন (+ Add Row)' : 'Add New Row (+)'}</span>
              </button>

              <span className="text-xs text-slate-400 font-mono">
                {lang === 'bn' ? `মোট রো: ${placements.length}` : `Total Rows: ${placements.length}`}
              </span>
            </div>
          </div>

          {/* SECTION [C]: Style Preferences & Editable Title Note */}
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-lg relative">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
              <span className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 font-black flex items-center justify-center text-sm border border-sky-500/40">
                C
              </span>
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-sky-400" />
                  <span>{lang === 'bn' ? 'এই ভিডিওর স্টাইল' : 'Video Style Preferences'}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {lang === 'bn'
                    ? 'স্টাইল হেডার নোট ও প্যারামিটার নিজের ইচ্ছামতো লিখতে পারবেন।'
                    : 'Customize style section header note and specific style directives.'}
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* Editable Style Section Title Note */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sky-400 font-bold">•</span>
                    <span>{lang === 'bn' ? 'স্টাইলের বিবরণ / হেডিং নোট (ব্র্যাকেটের অংশ):' : 'Style Header Note (in brackets):'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {lang === 'bn' ? '(কাস্টমাইজ করুন)' : '(Customizable)'}
                  </span>
                </label>
                <input
                  type="text"
                  value={styleHeaderNote}
                  onChange={(e) => setStyleHeaderNote(e.target.value)}
                  placeholder="ঐচ্ছিক, লিখলে ফল আপনার পছন্দের কাছাকাছি আসবে"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all font-sans"
                />
                <p className="mt-1.5 text-[10px] text-slate-400 font-mono">
                  আউটপুট হেডার: <span className="text-amber-400">{formatStyleSectionHeader()}</span>
                </p>
              </div>

              {/* গতি (Speed) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>{lang === 'bn' ? 'গতি (Speed):' : 'Speed / Pacing:'}</span>
                  {!speed && (
                    <span className="text-[10px] text-amber-400/80 italic font-normal">
                      {lang === 'bn' ? 'স্বয়ংক্রিয় ডিফল্ট মান সক্রিয়' : 'Auto default active'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value)}
                  placeholder="e.g. মিডিয়াম পেসিং, স্মুথ এবং সিনেমেটিক ট্রানজিশন"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                />
              </div>

              {/* মূল রং (Colors) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>{lang === 'bn' ? 'মূল রং (Primary Colors):' : 'Color Palette / Tone:'}</span>
                  {!colors && (
                    <span className="text-[10px] text-amber-400/80 italic font-normal">
                      {lang === 'bn' ? 'স্বয়ংক্রিয় ডিফল্ট মান সক্রিয়' : 'Auto default active'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={colors}
                  onChange={(e) => setColors(e.target.value)}
                  placeholder="e.g. সোনালী, প্রাচীন মাটির বাদামী ও ঐতিহাসিক ওয়ার্ম টোন"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                />
              </div>

              {/* বিশেষ দৃশ্য (Special Scenes) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>{lang === 'bn' ? 'বিশেষ দৃশ্য (Special Scenes):' : 'Special Visuals:'}</span>
                  {!specialScenes && (
                    <span className="text-[10px] text-amber-400/80 italic font-normal">
                      {lang === 'bn' ? 'স্বয়ংক্রিয় ডিফল্ট মান সক্রিয়' : 'Auto default active'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={specialScenes}
                  onChange={(e) => setSpecialScenes(e.target.value)}
                  placeholder="e.g. প্রাচীন দেয়াল ও ভাস্কর্যের ক্লোজ-আপ এবং এরিয়াল ভিউ"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                />
              </div>

              {/* যা চাই না (What to avoid) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                  <span>{lang === 'bn' ? 'যা চাই না (What to avoid):' : 'Negative Elements (What to avoid):'}</span>
                  {!dontWant && (
                    <span className="text-[10px] text-amber-400/80 italic font-normal">
                      {lang === 'bn' ? 'স্বয়ংক্রিয় ডিফল্ট মান সক্রিয়' : 'Auto default active'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={dontWant}
                  onChange={(e) => setDontWant(e.target.value)}
                  placeholder="e.g. অপ্রাসঙ্গিক আধুনিক গাড়ি, অতিরিক্ত ঝাপসা বা বিকৃত মুখ"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Formatted Output & Copy / Download (Sticky Pinned Panel) */}
        <div className="lg:col-span-5 flex flex-col space-y-4 lg:sticky lg:top-20 z-10">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col lg:max-h-[calc(100vh-6.5rem)]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-slate-100">
                  {lang === 'bn' ? 'লাইভ জেনারেটেড টেক্সট' : 'Live Generated Prompt'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 hidden sm:inline">
                  {lang === 'bn' ? 'স্থির প্যানেল' : 'Pinned'}
                </span>
                <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800">
                  UTF-8
                </span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
              <button
                onClick={handleCopy}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{lang === 'bn' ? 'কপি হয়েছে!' : 'Copied!'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{lang === 'bn' ? 'কপি করুন' : 'Copy All'}</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm"
              >
                <Download className="w-4 h-4 text-sky-400" />
                <span>{lang === 'bn' ? 'ডাউনলোড (.txt)' : 'Download (.txt)'}</span>
              </button>
            </div>

            {/* Live Text Area with internal scroll */}
            <div className="relative flex-1 min-h-[340px] bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-hidden flex flex-col">
              <textarea
                readOnly
                value={outputText}
                className="w-full h-full flex-1 bg-transparent text-slate-200 font-mono text-xs leading-relaxed resize-none outline-none selection:bg-amber-500 selection:text-slate-950 whitespace-pre overflow-y-auto"
              />
            </div>

            {/* Info Notice */}
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2 shrink-0">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                {lang === 'bn'
                  ? 'এই প্যানেলটি স্ক্রিনে স্থির থাকবে; বাম পাশে যত খুশি ফাইল বা রো যোগ করে স্ক্রল করলেও এটি দেখতে ও কপি করতে পারবেন।'
                  : 'This panel remains pinned in place while you scroll through the editor on the left.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Image Lightbox / Preview Modal (হালকা বক্সের মতো ভেসে ওঠা প্রিভিউ) */}
      {activePreview && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActivePreview(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl relative animate-in zoom-in-95 duration-150 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 overflow-hidden mr-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <h4 className="text-sm font-bold text-white truncate font-mono">
                    {activePreview.fileName || 'ছবির নাম দেওয়া হয়নি'}
                  </h4>
                  <p className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>SRT লাইন: #{activePreview.srtLine || '1'}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActivePreview(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                title="বন্ধ করুন (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Image Box */}
            <div className="bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center min-h-[220px] max-h-[50vh] p-2 border border-slate-800/80 relative">
              {activePreview.previewUrl ? (
                <img
                  src={activePreview.previewUrl}
                  alt={activePreview.fileName}
                  className="max-h-[46vh] w-auto max-w-full rounded-lg object-contain shadow-md"
                />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <ImageIcon className="w-12 h-12 text-slate-700 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">
                    {lang === 'bn' 
                      ? 'এই ফাইলটির কোনো ছবি ফাইল নির্বাচন করা নেই (শুধু নাম লেখা রয়েছে)' 
                      : 'No image file selected yet (only filename entered)'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {lang === 'bn'
                      ? 'রো-এর ব্রাউজ (আপলোড) আইকন দিয়ে ছবি সিলেক্ট করলে সরাসরি দেখতে পাবেন।'
                      : 'Browse or drop image to see live preview.'}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Bottom Info */}
            <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>সংশ্লিষ্ট স্ক্রিপ্ট / লেখা:</span>
                <span className="font-mono text-amber-400">লাইন: {activePreview.srtLine}</span>
              </div>
              <p className="font-semibold text-white">
                "{activePreview.text || 'কোনো লেখা এখনো যুক্ত করা হয়নি'}"
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={() => setActivePreview(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
