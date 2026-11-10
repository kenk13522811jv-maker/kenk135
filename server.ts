import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs 
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Ensure dedicated directory for persistent APK binary files (high speed, 0 Firestore write quota consumed)
const APPS_DIR = path.resolve(process.cwd(), 'uploads', 'apps');
try {
  fs.mkdirSync(APPS_DIR, { recursive: true });
} catch {}

// Firebase Configuration (Direct Cloud Firestore Connection - No Local Disk Dependency)
const firebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0536368169',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:324552210220:web:b11d8cc1636bcad38f5e89',
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyAQ5V8D9oSjRiNSDppXHPN-NqXm0lnEE0Y',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0536368169.firebaseapp.com',
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-cloudflarer2file-8229099a-1e66-456d-b761-d252780131eb',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0536368169.firebasestorage.app',
};

const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const fbDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

// Safe timeout wrapper so Firestore operations never deadlock or hang the HTTP connection
function withTimeout<T>(promise: Promise<T>, ms: number = 3000, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

// Upload storage limits (handles up to 150MB APK files seamlessly)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB per file
});

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Helper to compute expiration
function computeExpiresAt(retention: string, now: number): number | null {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (retention === '1day') return now + ONE_DAY;
  if (retention === '2days') return now + 2 * ONE_DAY;
  if (retention === '3days') return now + 3 * ONE_DAY;
  return null;
}

// In-Memory media cache to instantly serve files without latency or Firestore read limits
interface CachedMedia {
  buffer: Buffer;
  mimeType: string;
  name: string;
  expiresAt: number;
}
const mediaMemoryCache = new Map<string, CachedMedia>();

function pruneMemoryCache() {
  if (mediaMemoryCache.size > 150) {
    const keys = Array.from(mediaMemoryCache.keys());
    for (let i = 0; i < 30; i++) {
      mediaMemoryCache.delete(keys[i]);
    }
  }
}

// In-Memory notes cache for ultra-fast, zero-lag serving (<2ms) to humans and AI bots
interface CachedNote {
  id: string;
  title: string;
  content: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  retention: string;
  isExpired: boolean;
  publicUrl: string;
  rawUrl: string;
  hasChunks?: boolean;
  chunksCount?: number;
}
const notesMemoryCache = new Map<string, CachedNote>();

function pruneNotesCache() {
  if (notesMemoryCache.size > 200) {
    const keys = Array.from(notesMemoryCache.keys());
    for (let i = 0; i < 50; i++) {
      notesMemoryCache.delete(keys[i]);
    }
  }
}

// In-Memory APK/App cache for instantaneous binary download (<5ms)
interface CachedApp {
  id: string;
  name: string;
  appName: string;
  size: number;
  buffer?: Buffer;
  type: string;
  uploadedAt: number;
  expiresAt: number;
  retention: string;
  isExpired: boolean;
  publicUrl: string;
  downloadUrl: string;
  downloadsCount: number;
  hasChunks?: boolean;
  chunksCount?: number;
}
const appsMemoryCache = new Map<string, CachedApp>();

function pruneAppsCache() {
  if (appsMemoryCache.size > 60) {
    const keys = Array.from(appsMemoryCache.keys());
    for (let i = 0; i < 15; i++) {
      appsMemoryCache.delete(keys[i]);
    }
  }
}

// ================= API ROUTES =================

// 1. Direct File Upload to Cloud Firestore (Pure Firebase, zero local disk, auto-chunked for any size)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received' });
    }

    const retention = (req.body.retention as string) || 'permanent';
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);

    const safeBase = req.file.originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const id = `asset_${now}_${Math.random().toString(36).substring(2, 7)}_${safeBase || 'item'}`;
    const isVideo = req.file.mimetype.startsWith('video/');
    const category: 'image' | 'video' = isVideo ? 'video' : 'image';

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/api/public/${id}`;

    // Store in RAM cache immediately for zero-lag streaming
    mediaMemoryCache.set(id, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      name: req.file.originalname,
      expiresAt: expiresAt || 0,
    });
    pruneMemoryCache();

    const base64Data = req.file.buffer.toString('base64');
    const CHUNK_SIZE = 400000; // ~400KB per chunk in characters (well below Firestore 1MB limit)
    const needsChunking = base64Data.length > 600000;
    const chunksCount = needsChunking ? Math.ceil(base64Data.length / CHUNK_SIZE) : 0;

    const newAsset: Record<string, any> = {
      id,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      category,
      publicUrl,
      storagePath: `firestore_assets/${id}`,
      storageProvider: 'firestore-embedded',
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      hasChunks: needsChunking,
      chunksCount,
      dataUrl: needsChunking ? '' : `data:${req.file.mimetype};base64,${base64Data}`,
    };

    // If chunking is needed, write chunks to subcollection
    if (needsChunking) {
      const chunkWrites = [];
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunkWrites.push(
          setDoc(doc(fbDb, 'assets', id, 'chunks', `chunk_${i}`), {
            chunkIndex: i,
            data: chunkData,
          })
        );
      }
      await Promise.all(chunkWrites);
    }

    // Save parent record into Cloud Firestore
    await setDoc(doc(fbDb, 'assets', id), newAsset);
    console.log(`[Firebase Firestore] Successfully saved asset "${req.file.originalname}" (${req.file.size} bytes) to assets/${id}${needsChunking ? ` with ${chunksCount} chunks` : ''}`);

    return res.json({ 
      success: true, 
      asset: {
        id,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        category,
        publicUrl,
        storageKey: `firestore_assets/${id}`,
        storageProvider: 'firestore-embedded',
        uploadedAt: now,
        expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: publicUrl,
      } 
    });
  } catch (err: any) {
    console.error('Upload to Firestore failed:', err);
    return res.status(500).json({ error: `Firebase save failed: ${err.message || 'Unknown error'}` });
  }
});

// 2. Upload from URL (Fetches & stores media into Firestore so link is 100% permanent)
app.post('/api/upload-url', async (req, res) => {
  try {
    const { url, retention = 'permanent' } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const id = `asset_${now}_${Math.random().toString(36).substring(2, 7)}`;
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

    // Try fetching the remote image buffer so it is permanently archived in Firestore
    let fetchedBuffer: Buffer | null = null;
    let fetchedMime = isVideo ? 'video/mp4' : 'image/jpeg';
    let fetchedSize = 1024 * 512;

    try {
      const fetchRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        fetchedBuffer = Buffer.from(arrayBuf);
        fetchedSize = fetchedBuffer.length;
        const cType = fetchRes.headers.get('content-type');
        if (cType) fetchedMime = cType.split(';')[0];
      }
    } catch (fetchErr) {
      console.warn('Could not download external URL buffer, saving URL reference:', fetchErr);
    }

    if (fetchedBuffer) {
      mediaMemoryCache.set(id, {
        buffer: fetchedBuffer,
        mimeType: fetchedMime,
        name: parsedName,
        expiresAt: expiresAt || 0,
      });
      pruneMemoryCache();

      const base64Data = fetchedBuffer.toString('base64');
      const CHUNK_SIZE = 400000;
      const needsChunking = base64Data.length > 600000;
      const chunksCount = needsChunking ? Math.ceil(base64Data.length / CHUNK_SIZE) : 0;

      if (needsChunking) {
        const chunkWrites = [];
        for (let i = 0; i < chunksCount; i++) {
          const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          chunkWrites.push(
            setDoc(doc(fbDb, 'assets', id, 'chunks', `chunk_${i}`), {
              chunkIndex: i,
              data: chunkData,
            })
          );
        }
        await Promise.all(chunkWrites);
      }

      const newAsset: Record<string, any> = {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl,
        storagePath: `firestore_assets/${id}`,
        storageProvider: 'firestore-embedded',
        uploadedAt: now,
        expiresAt: expiresAt || 0,
        retention,
        isExpired: false,
        hasChunks: needsChunking,
        chunksCount,
        dataUrl: needsChunking ? '' : `data:${fetchedMime};base64,${base64Data}`,
      };

      await setDoc(doc(fbDb, 'assets', id), newAsset);
    } else {
      // Fallback: save URL reference
      const newAsset = {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl: url,
        storagePath: `firestore_assets/${id}`,
        storageProvider: 'firestore-embedded',
        uploadedAt: now,
        expiresAt: expiresAt || 0,
        retention,
        isExpired: false,
        dataUrl: url,
        hasChunks: false,
        chunksCount: 0,
      };
      await setDoc(doc(fbDb, 'assets', id), newAsset);
    }

    return res.json({ 
      success: true, 
      asset: {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl,
        storageKey: `firestore_assets/${id}`,
        storageProvider: 'firestore-embedded',
        uploadedAt: now,
        expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: publicUrl,
      } 
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'URL ingestion failed' });
  }
});

// 3. Universal Public Access (Streamed from In-Memory Cache or Cloud Firestore with CORS)
app.all('/api/public/:id', async (req, res) => {
  // CORS & embed headers for all devices, browsers, and AI tools
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { id } = req.params;
    const now = Date.now();

    // 1. Check in-memory fast RAM cache first
    const cached = mediaMemoryCache.get(id);
    if (cached) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) {
        mediaMemoryCache.delete(id);
        deleteDoc(doc(fbDb, 'assets', id)).catch(() => {});
        return res.status(404).send('Asset expired according to retention policy');
      }

      res.setHeader('Content-Type', cached.mimeType || 'image/jpeg');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(cached.name || 'media')}"`);
      res.setHeader('Content-Length', cached.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (req.method === 'HEAD') {
        return res.end();
      }
      return res.end(cached.buffer);
    }

    // 2. Query Cloud Firestore
    const docSnap = await getDoc(doc(fbDb, 'assets', id));
    if (!docSnap.exists()) {
      return res.status(404).send('Asset not found or expired in Firebase');
    }

    const data = docSnap.data();

    // Check expiration
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, 'assets', id)).catch(() => {});
      return res.status(404).send('Asset expired according to retention policy');
    }

    // A. Single dataUrl embedded in document
    if (data.dataUrl && data.dataUrl.startsWith('data:')) {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        mediaMemoryCache.set(id, {
          buffer,
          mimeType,
          name: data.name || 'file',
          expiresAt: data.expiresAt || 0,
        });
        pruneMemoryCache();

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(data.name || 'media')}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (req.method === 'HEAD') {
          return res.end();
        }
        return res.end(buffer);
      }
    }

    // B. Chunked storage in Firestore subcollection (for files > 600KB)
    if (data.hasChunks && data.chunksCount > 0) {
      const chunkPromises = [];
      for (let i = 0; i < data.chunksCount; i++) {
        chunkPromises.push(getDoc(doc(fbDb, 'assets', id, 'chunks', `chunk_${i}`)));
      }
      const chunkDocs = await Promise.all(chunkPromises);
      let fullBase64 = '';
      for (const cDoc of chunkDocs) {
        if (cDoc.exists()) {
          fullBase64 += cDoc.data()?.data || '';
        }
      }

      if (fullBase64.length > 0) {
        const buffer = Buffer.from(fullBase64, 'base64');
        const mimeType = data.type || 'image/jpeg';
        mediaMemoryCache.set(id, {
          buffer,
          mimeType,
          name: data.name || 'media',
          expiresAt: data.expiresAt || 0,
        });
        pruneMemoryCache();

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(data.name || 'media')}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (req.method === 'HEAD') {
          return res.end();
        }
        return res.end(buffer);
      }
    }

    // C. External redirect if applicable
    if (data.publicUrl && data.publicUrl.startsWith('http') && !data.publicUrl.includes(`/api/public/${id}`)) {
      return res.redirect(data.publicUrl);
    }

    return res.status(404).send('Media payload unavailable or missing in Firebase');
  } catch (err: any) {
    console.error('Error serving asset from Firestore:', err);
    return res.status(500).send('Internal server error retrieving file from Firebase');
  }
});

// 4. Get All Assets directly from Firestore
app.get('/api/files', async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, 'assets'));
    const now = Date.now();
    const items = snapshot.docs.map((d) => {
      const data = d.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      return {
        id: data.id || d.id,
        name: data.name,
        size: data.size,
        type: data.type,
        category: data.category || (data.type?.startsWith('video/') ? 'video' : 'image'),
        publicUrl: data.publicUrl,
        storageKey: data.storagePath || `firestore_assets/${data.id}`,
        storageProvider: data.storageProvider || 'firestore-embedded',
        uploadedAt: Number(data.uploadedAt),
        expiresAt,
        retention: data.retention || (expiresAt ? '1day' : 'permanent'),
        isExpired: expiresAt ? now > expiresAt : false,
        downloadsCount: 0,
        thumbnailUrl: data.publicUrl,
      };
    }).sort((a, b) => b.uploadedAt - a.uploadedAt);

    return res.json(items);
  } catch (err: any) {
    console.error('Error reading assets from Firestore:', err);
    return res.json([]);
  }
});

// 5. Delete Asset directly from Firestore
app.delete('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    mediaMemoryCache.delete(id);

    const docSnap = await getDoc(doc(fbDb, 'assets', id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.hasChunks && data.chunksCount > 0) {
        const chunkDeletes = [];
        for (let i = 0; i < data.chunksCount; i++) {
          chunkDeletes.push(deleteDoc(doc(fbDb, 'assets', id, 'chunks', `chunk_${i}`)).catch(() => {}));
        }
        await Promise.all(chunkDeletes);
      }
    }

    await deleteDoc(doc(fbDb, 'assets', id));
    console.log(`[Firebase Firestore] Deleted asset ${id}`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete from Firebase' });
  }
});

// 6. Manual cleanup endpoint
app.post('/api/cleanup', async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, 'assets'));
    const now = Date.now();
    let cleaned = 0;
    for (const d of snapshot.docs) {
      const data = d.data();
      if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
        await deleteDoc(doc(fbDb, 'assets', d.id));
        cleaned++;
      }
    }
    return res.json({ success: true, cleaned });
  } catch {
    return res.json({ success: true, cleaned: 0 });
  }
});

// Helper for escaping HTML in clean public note view
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ================= NOTE API & PUBLIC VIEWER ROUTES =================

// Helper to detect AI crawlers, LLM tools, curl, and automated API agents
function isAICrawlerOrTool(req: express.Request): boolean {
  const ua = (req.get('user-agent') || '').toLowerCase();
  const accept = (req.get('accept') || '').toLowerCase();

  if (req.query.raw === '1' || req.query.raw === 'true') return true;
  if (accept.includes('text/plain') && !accept.includes('text/html')) return true;

  const botSignatures = [
    'gptbot', 'chatgpt-user', 'chatgpt', 'openai', 'claude-web', 'claudebot', 'anthropic',
    'perplexitybot', 'perplexity', 'google-extended', 'googlebot', 'bytespider',
    'python-requests', 'python', 'curl', 'wget', 'httpie', 'postman', 'aiohttp',
    'node-fetch', 'axios', 'go-http-client', 'urllib', 'scrapy'
  ];
  return botSignatures.some(sig => ua.includes(sig));
}

// Unified helper to load full note (RAM cache first, then Firestore with subcollection chunks support)
async function loadFullNote(id: string): Promise<CachedNote | null> {
  const now = Date.now();
  const cached = notesMemoryCache.get(id);

  if (cached) {
    if (cached.expiresAt && cached.expiresAt > 0 && now > cached.expiresAt) {
      notesMemoryCache.delete(id);
      deleteDoc(doc(fbDb, 'notes', id)).catch(() => {});
      return null;
    }
    return cached;
  }

  const docSnap = await getDoc(doc(fbDb, 'notes', id));
  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
    deleteDoc(doc(fbDb, 'notes', id)).catch(() => {});
    return null;
  }

  let fullContent = data.content || '';
  if (data.hasChunks && data.chunksCount > 0) {
    try {
      const chunksSnap = await getDocs(collection(fbDb, 'notes', id, 'chunks'));
      const chunkDocs = chunksSnap.docs
        .map(c => c.data() as { chunkIndex: number; data: string })
        .sort((a, b) => a.chunkIndex - b.chunkIndex);
      fullContent = chunkDocs.map(c => c.data || '').join('');
    } catch (cErr) {
      console.error(`Error loading chunks for note ${id}:`, cErr);
    }
  }

  const assembledNote: CachedNote = {
    id: data.id || id,
    title: data.title || 'Untitled Note',
    content: fullContent,
    size: data.size || Buffer.byteLength(fullContent, 'utf8'),
    createdAt: Number(data.createdAt || now),
    updatedAt: Number(data.updatedAt || now),
    expiresAt: Number(data.expiresAt || 0),
    retention: data.retention || 'permanent',
    isExpired: false,
    publicUrl: data.publicUrl || '',
    rawUrl: data.rawUrl || '',
    hasChunks: Boolean(data.hasChunks),
    chunksCount: data.chunksCount || 0,
  };

  notesMemoryCache.set(id, assembledNote);
  pruneNotesCache();
  return assembledNote;
}

// 1. Create a Note and store in Cloud Firestore (Supports UNLIMITED size via chunking & RAM cache)
app.post('/api/notes', async (req, res) => {
  try {
    const { title = '', content = '', retention = 'permanent' } = req.body;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    // Strip trailing empty newlines and spaces to prevent bottom empty space in viewer
    const cleanContent = content.replace(/\s+$/, '');
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const id = `note_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const finalTitle = (title && typeof title === 'string' && title.trim().length > 0)
      ? title.trim().slice(0, 150)
      : 'Untitled Note';

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/note?id=${id}`;
    const rawUrl = `${protocol}://${host}/note/raw/${id}`;
    const byteSize = Buffer.byteLength(cleanContent, 'utf8');

    // Firestore single doc limit is 1MB. For texts > 500KB, seamlessly chunk into subcollection
    const CHUNK_SIZE = 400000; // ~400,000 characters per subcollection chunk
    const needsChunking = cleanContent.length > 500000;
    const chunksCount = needsChunking ? Math.ceil(cleanContent.length / CHUNK_SIZE) : 0;

    const noteDoc: Record<string, any> = {
      id,
      title: finalTitle,
      content: needsChunking ? cleanContent.slice(0, 100000) : cleanContent,
      size: byteSize,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      publicUrl,
      rawUrl,
      hasChunks: needsChunking,
      chunksCount,
    };

    if (needsChunking) {
      const chunkWrites = [];
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = cleanContent.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunkWrites.push(
          setDoc(doc(fbDb, 'notes', id, 'chunks', `chunk_${i}`), {
            chunkIndex: i,
            data: chunkData,
          })
        );
      }
      await Promise.all(chunkWrites);
    }

    await setDoc(doc(fbDb, 'notes', id), noteDoc);

    // Keep the full pristine note in RAM cache for instantaneous (<2ms) retrieval
    notesMemoryCache.set(id, {
      ...noteDoc,
      content: cleanContent,
    } as CachedNote);
    pruneNotesCache();

    console.log(`[Firebase Firestore] Note created: ${id} ("${finalTitle}") [Size: ${(byteSize / 1024).toFixed(1)} KB, Chunks: ${chunksCount}]`);

    return res.json({ 
      success: true, 
      note: {
        ...noteDoc,
        content: cleanContent,
      }
    });
  } catch (err: any) {
    console.error('Error creating note in Firestore:', err);
    return res.status(500).json({ error: err.message || 'Failed to save note to Firebase' });
  }
});

// 2. Get All Notes from Cloud Firestore
app.get('/api/notes', async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, 'notes'));
    const now = Date.now();
    const notes: any[] = [];

    for (const d of snapshot.docs) {
      const data = d.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      if (expiresAt && now > expiresAt) {
        deleteDoc(doc(fbDb, 'notes', d.id)).catch(() => {});
        continue;
      }
      notes.push({
        id: data.id || d.id,
        title: data.title || 'Untitled Note',
        content: data.content || '',
        size: data.size || Buffer.byteLength(data.content || '', 'utf8'),
        createdAt: Number(data.createdAt || now),
        updatedAt: Number(data.updatedAt || now),
        expiresAt,
        retention: data.retention || (expiresAt ? '1day' : 'permanent'),
        isExpired: false,
        publicUrl: data.publicUrl,
        rawUrl: data.rawUrl,
        hasChunks: Boolean(data.hasChunks),
        chunksCount: data.chunksCount || 0,
      });
    }

    notes.sort((a, b) => b.createdAt - a.createdAt);
    return res.json(notes);
  } catch (err: any) {
    console.error('Error fetching notes from Firestore:', err);
    return res.json([]);
  }
});

// 3. Get Single Note JSON (Full assembled text)
app.get('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or expired' });
    }
    return res.json({ success: true, note });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch note' });
  }
});

// 4. Delete a Note from Cloud Firestore (and subcollection chunks)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    notesMemoryCache.delete(id);
    
    // Check if it has chunks and delete them
    try {
      const chunksSnap = await getDocs(collection(fbDb, 'notes', id, 'chunks'));
      const chunkDeletes = chunksSnap.docs.map(c => deleteDoc(doc(fbDb, 'notes', id, 'chunks', c.id)));
      await Promise.all(chunkDeletes);
    } catch {}

    await deleteDoc(doc(fbDb, 'notes', id));
    console.log(`[Firebase Firestore] Deleted note: ${id}`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete note' });
  }
});

// 5. Raw Text Endpoint for curl, AI tools & direct plain-text consumption
app.all(['/note/raw/:id', '/api/notes/:id/raw'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  try {
    const { id } = req.params;
    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).send('Note not found or expired');
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(note.content || '');
  } catch (err: any) {
    return res.status(500).send(`Error reading note: ${err.message}`);
  }
});

// 6. Public Clean Viewer (Preformatted Raw Notepad view for humans & AI, zero excessive bottom space)
app.get(['/note', '/note/:id'], async (req, res, next) => {
  try {
    const id = (req.params.id || (req.query.id as string) || '').trim();
    if (!id) {
      return next();
    }

    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head><meta charset="utf-8"><title>Note Not Found</title></head>
        <body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
          <div style="text-align:center;">
            <h1 style="color:#f43f5e;margin-bottom:0.5rem;">404 - নোট পাওয়া যায়নি</h1>
            <p style="color:#94a3b8;margin-bottom:1.5rem;">এই নোটটি মুছে ফেলা হয়েছে অথবা মেয়াদের সময় পার হয়ে গেছে।</p>
            <a href="/" style="color:#f59e0b;text-decoration:none;font-weight:bold;">← হোমপেজে ফিরে যান</a>
          </div>
        </body>
        </html>
      `);
    }

    // Check if client is AI crawler, LLM bot, curl, or requested raw text
    if (isAICrawlerOrTool(req)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(note.content || '');
    }

    const safeTitle = escapeHtml(note.title || 'Untitled Note');
    // Ensure content ends cleanly without trailing newlines so <pre> doesn't create extra empty lines
    const cleanContent = (note.content || '').replace(/\s+$/, '');
    const safeContent = escapeHtml(cleanContent);
    const dateFormatted = new Date(note.createdAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
    const wordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
    const charCount = cleanContent.length;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} - Clean Note</title>
  <meta name="description" content="Clean, preformatted text note" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      margin: 0;
      padding: 0;
      line-height: 1.6;
      min-height: auto;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(3, 7, 18, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #1f2937;
      padding: 0.65rem 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .meta-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .badge {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.15rem 0.55rem;
      border-radius: 9999px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .note-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f9fafb;
    }
    .note-stats {
      font-size: 0.75rem;
      color: #9ca3af;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn {
      background: #1f2937;
      color: #f3f4f6;
      border: 1px solid #374151;
      border-radius: 0.5rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn:hover {
      background: #374151;
      border-color: #4b5563;
      color: #ffffff;
    }
    .btn-primary {
      background: #f59e0b;
      border-color: #d97706;
      color: #030712;
      font-weight: 700;
    }
    .btn-primary:hover {
      background: #fbbf24;
      color: #030712;
    }
    .main-wrap {
      max-width: 1050px;
      width: 100%;
      margin: 0.75rem auto 1rem auto;
      padding: 0 1rem;
    }
    .note-box {
      background: #0b0f19;
      border: 1px solid #1f2937;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.6);
    }
    pre {
      margin: 0;
      padding: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.9rem;
      color: #e5e7eb;
      line-height: 1.65;
      tab-size: 4;
      outline: none;
    }
    .footer-notice {
      margin-top: 0.75rem;
      margin-bottom: 1.25rem;
      font-size: 0.7rem;
      color: #6b7280;
      text-align: center;
    }
    .copied-toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4);
      display: none;
      animation: fadeIn 0.2s;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="meta-left">
      <span class="badge">Clean Note</span>
      <span class="note-title">${safeTitle}</span>
      <span class="note-stats">• ${wordCount} শব্দ • ${charCount} অক্ষর • ${dateFormatted}</span>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="copyContent()">📋 কপি করুন</button>
      <a class="btn" href="/note/raw/${id}" target="_blank" title="View 100% Plain Raw Text">📄 Raw</a>
      <button class="btn" onclick="downloadTxt()">💾 .txt</button>
      <a class="btn" href="/" title="Open Full App">🏠 হোম</a>
    </div>
  </header>

  <div class="main-wrap">
    <div class="note-box">
      <pre id="noteText">${safeContent}</pre>
    </div>
    <p class="footer-notice">Firebase Persistent Storage • Pure Preformatted Raw Note</p>
  </div>

  <div id="toast" class="copied-toast">✓ কপি করা হয়েছে!</div>

  <script>
    function copyContent() {
      const text = document.getElementById('noteText').innerText;
      navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('toast');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2200);
      });
    }
    function downloadTxt() {
      const text = document.getElementById('noteText').innerText;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${id}.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  </script>
</body>
</html>`;

    return res.send(html);
  } catch (err: any) {
    console.error('Error serving clean note view:', err);
    return res.status(500).send('Error rendering note');
  }
});

// ================= APP / APK VAULT & INSTALLER ROUTES =================

// Helper to load full app buffer from RAM cache, local disk, or Cloud Firestore
async function loadFullAppBuffer(id: string): Promise<{ app: CachedApp; buffer: Buffer } | null> {
  const now = Date.now();
  const cached = appsMemoryCache.get(id);

  // 1. Check RAM cache first
  if (cached && cached.buffer) {
    if (cached.expiresAt > 0 && now > cached.expiresAt) {
      appsMemoryCache.delete(id);
      deleteDoc(doc(fbDb, 'apps', id)).catch(() => {});
      return null;
    }
    return { app: cached, buffer: cached.buffer };
  }

  // 2. Check local disk
  const diskPath = path.join(APPS_DIR, `${id}.apk`);
  let diskBuffer: Buffer | null = null;
  try {
    if (fs.existsSync(diskPath)) {
      diskBuffer = await fsp.readFile(diskPath);
    }
  } catch {}

  // 3. Query Cloud Firestore
  let firestoreData: any = null;
  try {
    const docSnap = await getDoc(doc(fbDb, 'apps', id));
    if (docSnap.exists()) {
      firestoreData = docSnap.data();
    }
  } catch (err: any) {
    console.warn(`[Firestore] App doc lookup warning: ${err?.message}`);
  }

  // Check expiration if doc found
  if (firestoreData) {
    if (firestoreData.expiresAt && firestoreData.expiresAt > 0 && now > firestoreData.expiresAt) {
      deleteDoc(doc(fbDb, 'apps', id)).catch(() => {});
      if (diskBuffer) {
        fsp.unlink(diskPath).catch(() => {});
      }
      return null;
    }
  }

  let finalBuffer: Buffer | null = diskBuffer;

  // 4. If not on disk, check Firestore embedded dataUrl or subcollection chunks (backward compatibility)
  if (!finalBuffer && firestoreData) {
    if (firestoreData.dataUrl && firestoreData.dataUrl.startsWith('data:')) {
      const match = firestoreData.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        finalBuffer = Buffer.from(match[2], 'base64');
      }
    } else if (firestoreData.hasChunks && firestoreData.chunksCount > 0) {
      try {
        const chunkPromises = [];
        for (let i = 0; i < firestoreData.chunksCount; i++) {
          chunkPromises.push(getDoc(doc(fbDb, 'apps', id, 'chunks', `chunk_${i}`)));
        }
        const chunkDocs = await Promise.all(chunkPromises);
        let fullBase64 = '';
        for (const cDoc of chunkDocs) {
          if (cDoc.exists()) {
            fullBase64 += cDoc.data()?.data || '';
          }
        }
        if (fullBase64.length > 0) {
          finalBuffer = Buffer.from(fullBase64, 'base64');
        }
      } catch (chunkErr) {
        console.error('Error fetching Firestore chunks:', chunkErr);
      }
    }
  }

  if (!finalBuffer) {
    return null;
  }

  // Cache to disk if not already there
  if (!fs.existsSync(diskPath)) {
    fsp.writeFile(diskPath, finalBuffer).catch(() => {});
  }

  const appItem: CachedApp = {
    id,
    name: firestoreData?.name || cached?.name || 'app.apk',
    appName: firestoreData?.appName || cached?.appName || firestoreData?.name || 'Android App',
    size: firestoreData?.size || cached?.size || finalBuffer.length,
    buffer: finalBuffer,
    type: firestoreData?.type || 'application/vnd.android.package-archive',
    uploadedAt: Number(firestoreData?.uploadedAt || cached?.uploadedAt || now),
    expiresAt: Number(firestoreData?.expiresAt || cached?.expiresAt || 0),
    retention: firestoreData?.retention || cached?.retention || 'permanent',
    isExpired: false,
    publicUrl: firestoreData?.publicUrl || cached?.publicUrl || `/app?id=${id}`,
    downloadUrl: firestoreData?.downloadUrl || cached?.downloadUrl || `/app/download/${id}`,
    downloadsCount: Number(firestoreData?.downloadsCount || cached?.downloadsCount || 0),
    hasChunks: false,
    chunksCount: 0,
  };

  appsMemoryCache.set(id, appItem);
  pruneAppsCache();
  return { app: appItem, buffer: finalBuffer };
}

// 1. Upload APK App file (Zero timeout, disk streaming + RAM cache + single Firestore metadata write)
app.post('/api/apps/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No APK file received' });
    }

    const retention = (req.body.retention as string) || 'permanent';
    const rawAppName = (req.body.appName as string) || '';
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);

    const originalName = req.file.originalname || 'application.apk';
    const safeBase = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 35);
    const id = `app_${now}_${Math.random().toString(36).substring(2, 7)}_${safeBase || 'apk'}`;
    const cleanAppName = rawAppName.trim() || originalName.replace(/\.[^/.]+$/, '').replace(/[_.-]/g, ' ');

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/app?id=${id}`;
    const downloadUrl = `${protocol}://${host}/app/download/${id}`;

    // 1. Instantly save binary APK to disk (Takes ~5ms, zero Firestore write units, reliable streaming)
    const diskPath = path.join(APPS_DIR, `${id}.apk`);
    await fsp.writeFile(diskPath, req.file.buffer);

    // 2. Store in RAM cache for instantaneous downloading
    const cachedApp: CachedApp = {
      id,
      name: originalName,
      appName: cleanAppName,
      size: req.file.size,
      buffer: req.file.buffer,
      type: 'application/vnd.android.package-archive',
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      publicUrl,
      downloadUrl,
      downloadsCount: 0,
    };
    appsMemoryCache.set(id, cachedApp);
    pruneAppsCache();

    // 3. Single lightweight metadata document for Cloud Firestore (Takes 1 write unit instead of 88 writes!)
    const newApp: Record<string, any> = {
      id,
      name: originalName,
      appName: cleanAppName,
      size: req.file.size,
      type: 'application/vnd.android.package-archive',
      publicUrl,
      downloadUrl,
      storagePath: `uploads/apps/${id}.apk`,
      storageProvider: 'local-disk',
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      downloadsCount: 0,
      hasChunks: false,
      chunksCount: 0,
    };

    // Save to Firestore with a 6-second timeout so network/quota issues never hang the browser
    try {
      await Promise.race([
        setDoc(doc(fbDb, 'apps', id), newApp),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 6000))
      ]);
      console.log(`[Firebase Firestore] APK App created: ${id} ("${cleanAppName}", Size: ${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
    } catch (fbErr: any) {
      console.warn(`[Firebase] App metadata Firestore sync warning (saved locally & in RAM):`, fbErr?.message);
    }

    return res.json({ success: true, app: newApp });
  } catch (err: any) {
    console.error('Error uploading APK to Firestore:', err);
    return res.status(500).json({ error: err.message || 'Failed to save APK app' });
  }
});

// 2. Get All Uploaded APK Apps (Merged from Firestore and RAM cache)
app.get('/api/apps', async (_req, res) => {
  try {
    const now = Date.now();
    const appsMap = new Map<string, any>();

    // Load from Firestore
    try {
      const snapshot = await getDocs(collection(fbDb, 'apps'));
      for (const d of snapshot.docs) {
        const data = d.data();
        const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
        if (expiresAt && now > expiresAt) {
          deleteDoc(doc(fbDb, 'apps', d.id)).catch(() => {});
          const diskPath = path.join(APPS_DIR, `${d.id}.apk`);
          fsp.unlink(diskPath).catch(() => {});
          continue;
        }

        appsMap.set(data.id || d.id, {
          id: data.id || d.id,
          name: data.name || 'app.apk',
          appName: data.appName || data.name || 'Android App',
          size: Number(data.size || 0),
          type: data.type || 'application/vnd.android.package-archive',
          uploadedAt: Number(data.uploadedAt || now),
          expiresAt,
          retention: data.retention || (expiresAt ? '1day' : 'permanent'),
          isExpired: false,
          publicUrl: data.publicUrl,
          downloadUrl: data.downloadUrl,
          downloadsCount: Number(data.downloadsCount || 0),
          hasChunks: Boolean(data.hasChunks),
          chunksCount: data.chunksCount || 0,
        });
      }
    } catch (fbErr: any) {
      console.warn('[Firestore] Error fetching apps collection:', fbErr?.message);
    }

    // Also include any apps from memory cache that might not have reached Firestore
    for (const [id, cached] of appsMemoryCache.entries()) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) continue;
      if (!appsMap.has(id)) {
        appsMap.set(id, {
          id: cached.id,
          name: cached.name,
          appName: cached.appName,
          size: cached.size,
          type: cached.type,
          uploadedAt: cached.uploadedAt,
          expiresAt: cached.expiresAt || null,
          retention: cached.retention,
          isExpired: false,
          publicUrl: cached.publicUrl,
          downloadUrl: cached.downloadUrl,
          downloadsCount: cached.downloadsCount || 0,
          hasChunks: false,
          chunksCount: 0,
        });
      }
    }

    const appsList = Array.from(appsMap.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
    return res.json(appsList);
  } catch (err: any) {
    console.error('Error fetching apps:', err);
    return res.json([]);
  }
});

// 3. Get Single App JSON
app.get('/api/apps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();

    // Check memory cache
    const cached = appsMemoryCache.get(id);
    if (cached) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) {
        appsMemoryCache.delete(id);
        return res.status(404).json({ error: 'App expired' });
      }
      return res.json({ success: true, app: cached });
    }

    const docSnap = await getDoc(doc(fbDb, 'apps', id));
    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'App not found' });
    }
    const data = docSnap.data();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, 'apps', id)).catch(() => {});
      return res.status(404).json({ error: 'App expired' });
    }
    return res.json({ success: true, app: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch app' });
  }
});

// 4. Delete an APK App from disk, Cloud Firestore, and memory
app.delete('/api/apps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    appsMemoryCache.delete(id);

    // Delete from disk immediately
    const diskPath = path.join(APPS_DIR, `${id}.apk`);
    fsp.unlink(diskPath).catch(() => {});

    // Delete Firestore record with safe timeout so client never waits
    withTimeout(deleteDoc(doc(fbDb, 'apps', id)), 2500, null).catch(() => {});

    console.log(`[Firebase Firestore] Deleted APK app: ${id}`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete app' });
  }
});

// 5. Direct Binary APK Download Endpoint (Instant streaming from disk / RAM with 0 timeout)
app.all(['/app/download/:id', '/api/apps/:id/download'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') return res.sendStatus(200);

  try {
    const { id } = req.params;
    const diskPath = path.join(APPS_DIR, `${id}.apk`);

    // A. If file exists on disk, stream directly with zero RAM overhead
    if (fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      let appName = 'app.apk';
      const cached = appsMemoryCache.get(id);
      if (cached?.name) {
        appName = cached.name;
      }

      const downloadFileName = appName.endsWith('.apk') ? appName : `${appName}.apk`;

      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (req.method === 'HEAD') {
        return res.end();
      }

      // Track download count asynchronously
      if (cached) cached.downloadsCount = (cached.downloadsCount || 0) + 1;
      setDoc(doc(fbDb, 'apps', id), { downloadsCount: (cached?.downloadsCount || 1) }, { merge: true }).catch(() => {});

      const stream = fs.createReadStream(diskPath);
      return stream.pipe(res);
    }

    // B. Fallback to full buffer loader (RAM / Firestore)
    const appData = await loadFullAppBuffer(id);
    if (!appData) {
      return res.status(404).send('APK file not found or expired');
    }

    const { app, buffer } = appData;

    // Track download count asynchronously
    app.downloadsCount = (app.downloadsCount || 0) + 1;
    setDoc(doc(fbDb, 'apps', id), { downloadsCount: app.downloadsCount }, { merge: true }).catch(() => {});

    const downloadFileName = app.name.endsWith('.apk') ? app.name : `${app.name}.apk`;

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (req.method === 'HEAD') {
      return res.end();
    }
    return res.end(buffer);
  } catch (err: any) {
    console.error('Error streaming APK download:', err);
    return res.status(500).send(`Error downloading APK: ${err.message}`);
  }
});

// 6. Public Web Installer Landing Page (For humans & phones to 1-click download and install APK)
app.get(['/app', '/app/:id'], async (req, res, next) => {
  try {
    const id = (req.params.id || (req.query.id as string) || '').trim();
    if (!id) {
      return next();
    }

    if (req.query.download === '1' || req.query.direct === '1') {
      return res.redirect(`/app/download/${id}`);
    }

    const appData = await loadFullAppBuffer(id);
    if (!appData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head><meta charset="utf-8"><title>App Not Found</title></head>
        <body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
          <div style="text-align:center;padding:1.5rem;">
            <div style="font-size:3rem;margin-bottom:0.5rem;">📱</div>
            <h1 style="color:#f43f5e;margin-bottom:0.5rem;">404 - অ্যাপ ফাইল পাওয়া যায়নি</h1>
            <p style="color:#94a3b8;margin-bottom:1.5rem;">এই এপিকে (APK) ফাইলটি মুছে ফেলা হয়েছে অথবা মেয়াদের সময় পার হয়ে গেছে।</p>
            <a href="/" style="color:#10b981;text-decoration:none;font-weight:bold;">← হোমপেজে ফিরে যান</a>
          </div>
        </body>
        </html>
      `);
    }

    const { app } = appData;
    const safeAppName = escapeHtml(app.appName || app.name || 'Android Application');
    const safeFileName = escapeHtml(app.name || 'application.apk');
    const sizeMb = (app.size / (1024 * 1024)).toFixed(2);
    const dateFormatted = new Date(app.uploadedAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
    const directDownloadUrl = app.downloadUrl || `/app/download/${app.id}`;
    const retentionText = app.retention === 'permanent' ? '♾️ স্থায়ী (Permanent)' : `⏳ মেয়াদ: ${app.retention}`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeAppName} - APK ডাউনলোড ও ইনস্টল</title>
  <meta name="description" content="Download and install ${safeAppName} Android APK directly to your phone." />
  <meta property="og:title" content="${safeAppName} - Android APK Download" />
  <meta property="og:description" content="ফাইল সাইজ: ${sizeMb} MB • সরাসরি ডাউনলোড করে আপনার ফোনে ইনস্টল করুন।" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 1rem;
      background-image: radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.12) 0%, rgba(3, 7, 18, 0) 70%);
    }
    .card {
      background: #0b1120;
      border: 1px solid #1f293d;
      border-radius: 1.5rem;
      max-width: 480px;
      width: 100%;
      padding: 2rem 1.75rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 30px -10px rgba(16, 185, 129, 0.2);
      text-align: center;
    }
    .app-icon {
      width: 76px;
      height: 76px;
      margin: 0 auto 1.25rem auto;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
    }
    .app-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 0.35rem;
      line-height: 1.3;
    }
    .app-sub {
      font-size: 0.8rem;
      color: #94a3b8;
      font-family: monospace;
      word-break: break-all;
      margin-bottom: 1.25rem;
    }
    .meta-pills {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.75rem;
    }
    .pill {
      background: #111827;
      border: 1px solid #1f2937;
      color: #cbd5e1;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
    }
    .pill-green {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .btn-download {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #022c22;
      font-size: 1.05rem;
      font-weight: 800;
      padding: 0.95rem 1.5rem;
      border-radius: 1rem;
      text-decoration: none;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.5);
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
    }
    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px -5px rgba(16, 185, 129, 0.6);
      background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
      margin-top: 0.85rem;
    }
    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.65rem 0.85rem;
      border-radius: 0.75rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-secondary:hover {
      background: #334155;
      color: #ffffff;
    }
    .guide-box {
      margin-top: 1.75rem;
      background: #060a12;
      border: 1px solid #1e293b;
      border-radius: 1rem;
      padding: 1.1rem;
      text-align: left;
    }
    .guide-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .guide-steps {
      font-size: 0.72rem;
      color: #94a3b8;
      line-height: 1.6;
      padding-left: 1.1rem;
    }
    .guide-steps li {
      margin-bottom: 0.35rem;
    }
    .footer-brand {
      margin-top: 1.5rem;
      font-size: 0.72rem;
      color: #64748b;
    }
    .footer-brand a {
      color: #10b981;
      text-decoration: none;
      font-weight: 600;
    }
    .toast {
      position: fixed;
      bottom: 1.5rem;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.5rem 1.25rem;
      border-radius: 9999px;
      box-shadow: 0 10px 20px -5px rgba(0,0,0,0.5);
      display: none;
      animation: fadeIn 0.2s;
      z-index: 99;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="app-icon">🤖</div>
    <h1 class="app-title">${safeAppName}</h1>
    <p class="app-sub">${safeFileName}</p>

    <div class="meta-pills">
      <span class="pill pill-green">📦 ${sizeMb} MB</span>
      <span class="pill">${retentionText}</span>
      <span class="pill">⬇️ ${app.downloadsCount || 0} বার ডাউনলোড</span>
      <span class="pill">📅 ${dateFormatted}</span>
    </div>

    <!-- Direct Download & Install Button -->
    <a href="${directDownloadUrl}" class="btn-download" download="${safeFileName}">
      <span>📲 অ্যাপ ডাউনলোড ও ইনস্টল করুন</span>
    </a>

    <div class="actions-grid">
      <button class="btn-secondary" onclick="copyDirectLink()">
        🔗 সরাসরি লিংক কপি
      </button>
      <button class="btn-secondary" onclick="copyPageLink()">
        📤 শেয়ার পেজ কপি
      </button>
    </div>

    <!-- Android Quick Installation Guide -->
    <div class="guide-box">
      <div class="guide-title">
        <span>💡 ফোনে ইনস্টল করার সহজ নিয়ম:</span>
      </div>
      <ol class="guide-steps">
        <li>উপরের <strong>'অ্যাপ ডাউনলোড ও ইনস্টল করুন'</strong> বাটনে চাপ দিন।</li>
        <li>ডাউনলোড সম্পন্ন হলে নোটিফিকেশন বার অথবা ফোনের <strong>Downloads</strong> ফোল্ডার থেকে <code>.apk</code> ফাইলটিতে ট্যাপ করুন।</li>
        <li>যদি নিরাপত্তা সতর্কতা দেখায়, তবে <strong>'Settings'</strong> এ গিয়ে <strong>'Allow from this source'</strong> চালু করে <strong>'Install'</strong> চাপুন।</li>
      </ol>
    </div>

    <div class="footer-brand">
      Firebase App Vault • <a href="/">🏠 হোম অ্যাপে ফিরে যান</a>
    </div>
  </div>

  <div id="toast" class="toast">✓ লিংক কপি করা হয়েছে!</div>

  <script>
    function showToast(text) {
      const toast = document.getElementById('toast');
      toast.innerText = text;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }
    function copyDirectLink() {
      const rawUrl = '${directDownloadUrl}';
      const url = rawUrl.startsWith('http') ? rawUrl : (window.location.origin + rawUrl);
      navigator.clipboard.writeText(url).then(() => {
        showToast('✓ সরাসরি ডাউনলোডের APK লিংক কপি হয়েছে!');
      });
    }
    function copyPageLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('✓ ইনস্টলার পেজের লিংক কপি হয়েছে!');
      });
    }
  </script>
</body>
</html>`;

    return res.send(html);
  } catch (err: any) {
    console.error('Error serving app installer view:', err);
    return res.status(500).send('Error rendering app view');
  }
});

// Start server with Vite middleware in dev or static files in production
async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Firebase AI Vault Server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
});
