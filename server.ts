import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Ensure uploads and data directories exist
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const META_FILE = path.resolve(__dirname, 'uploads_meta.json');

interface StoredAsset {
  id: string;
  name: string;
  size: number;
  type: string;
  category: 'image' | 'video';
  filePath: string;
  publicUrl: string;
  storageProvider: 'firebase-storage' | 'cloudflare-r2' | 'sandbox-local';
  uploadedAt: number;
  expiresAt: number | null;
  retention: string;
  isExpired: boolean;
  downloadsCount: number;
}

function loadAssets(): StoredAsset[] {
  try {
    if (fs.existsSync(META_FILE)) {
      const raw = fs.readFileSync(META_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading metadata file', e);
  }
  return [];
}

function saveAssets(assets: StoredAsset[]): void {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(assets, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving metadata file', e);
  }
}

// Background cleanup of expired files
function cleanupExpired(): number {
  const assets = loadAssets();
  const now = Date.now();
  const active: StoredAsset[] = [];
  let deletedCount = 0;

  for (const asset of assets) {
    if (asset.expiresAt && now > asset.expiresAt) {
      if (asset.filePath && fs.existsSync(asset.filePath)) {
        try {
          fs.unlinkSync(asset.filePath);
        } catch (err) {
          console.warn('Failed to delete file from disk:', err);
        }
      }
      deletedCount++;
    } else {
      active.push(asset);
    }
  }

  if (deletedCount > 0) {
    saveAssets(active);
    console.log(`[Auto-Retention] Cleaned up ${deletedCount} expired assets`);
  }
  return deletedCount;
}

// Run cleanup every 30 seconds
setInterval(cleanupExpired, 30000);

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    cb(null, `${id}_${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Middleware for CORS on API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ================= API ROUTES =================

// 1. File Upload (multipart/form-data)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file received' });
  }

  const retention = (req.body.retention as string) || 'permanent';
  const now = Date.now();
  let expiresAt: number | null = null;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (retention === '1day') expiresAt = now + ONE_DAY;
  else if (retention === '2days') expiresAt = now + 2 * ONE_DAY;
  else if (retention === '3days') expiresAt = now + 3 * ONE_DAY;

  const id = req.file.filename.split('_')[0] + '_' + req.file.filename.split('_')[1];
  const isVideo = req.file.mimetype.startsWith('video/');
  const category: 'image' | 'video' = isVideo ? 'video' : 'image';

  // Construct absolute universal public URL
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const publicUrl = `${protocol}://${host}/api/public/${id}`;

  const newAsset: StoredAsset = {
    id,
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    category,
    filePath: req.file.path,
    publicUrl,
    storageProvider: 'firebase-storage',
    uploadedAt: now,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
  };

  const current = loadAssets();
  current.unshift(newAsset);
  saveAssets(current);

  return res.json({ success: true, asset: newAsset });
});

// 2. Upload from URL (Paste Image/Video Link)
app.post('/api/upload-url', async (req, res) => {
  const { url, retention = 'permanent' } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const now = Date.now();
  let expiresAt: number | null = null;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (retention === '1day') expiresAt = now + ONE_DAY;
  else if (retention === '2days') expiresAt = now + 2 * ONE_DAY;
  else if (retention === '3days') expiresAt = now + 3 * ONE_DAY;

  const id = 'asset_' + now + '_' + Math.random().toString(36).substring(2, 7);
  const isVideo = Boolean(url.match(/\.(mp4|webm|mov|ogg)($|\?)/i));
  const category: 'image' | 'video' = isVideo ? 'video' : 'image';

  let parsedName = 'online-media.jpg';
  try {
    const urlObj = new URL(url);
    const lastPart = urlObj.pathname.split('/').pop();
    if (lastPart && lastPart.includes('.')) {
      parsedName = decodeURIComponent(lastPart.split('?')[0]);
    }
  } catch {}

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const publicUrl = `${protocol}://${host}/api/public/${id}`;

  const newAsset: StoredAsset = {
    id,
    name: parsedName,
    size: 1024 * 512,
    type: isVideo ? 'video/mp4' : 'image/jpeg',
    category,
    filePath: '',
    publicUrl: url, // Or direct URL
    storageProvider: 'firebase-storage',
    uploadedAt: now,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
  };

  const current = loadAssets();
  current.unshift(newAsset);
  saveAssets(current);

  return res.json({ success: true, asset: newAsset });
});

// 3. Get Public Asset (UNIVERSAL DIRECT ACCESS FOR ANY BROWSER OR AI PIPELINE)
app.get('/api/public/:id', (req, res) => {
  cleanupExpired();
  const { id } = req.params;
  const assets = loadAssets();
  const asset = assets.find((a) => a.id === id);

  if (!asset) {
    // Check if a file starts with this id in uploads folder
    const files = fs.readdirSync(UPLOADS_DIR);
    const matched = files.find((f) => f.startsWith(id));
    if (matched) {
      const fullPath = path.join(UPLOADS_DIR, matched);
      const isVideo = matched.endsWith('.mp4') || matched.endsWith('.webm') || matched.endsWith('.mov');
      res.setHeader('Content-Type', isVideo ? 'video/mp4' : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(fullPath);
    }
    return res.status(404).send('File not found or expired');
  }

  // If this asset has a local file on disk, stream it
  if (asset.filePath && fs.existsSync(asset.filePath)) {
    res.setHeader('Content-Type', asset.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${asset.name}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(asset.filePath);
  }

  // If it's a remote URL, redirect
  if (asset.publicUrl && asset.publicUrl.startsWith('http')) {
    return res.redirect(asset.publicUrl);
  }

  return res.status(404).send('File not found');
});

// 4. Get All Assets
app.get('/api/files', (_req, res) => {
  cleanupExpired();
  const assets = loadAssets();
  const now = Date.now();
  const result = assets.map((a) => ({
    ...a,
    isExpired: a.expiresAt ? now > a.expiresAt : false,
  }));
  return res.json(result);
});

// 5. Delete Asset
app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const assets = loadAssets();
  const asset = assets.find((a) => a.id === id);

  if (asset && asset.filePath && fs.existsSync(asset.filePath)) {
    try {
      fs.unlinkSync(asset.filePath);
    } catch {}
  }

  const updated = assets.filter((a) => a.id !== id);
  saveAssets(updated);
  return res.json({ success: true });
});

// 6. Manual cleanup expired endpoint
app.post('/api/cleanup', (_req, res) => {
  const cleaned = cleanupExpired();
  return res.json({ success: true, cleaned });
});

// Start server with Vite middleware in dev or static files in production
async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI Video Pipeline Vault Server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
});
