import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
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

// In-Memory storage (RAM only, 0 disk footprint on Render)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
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

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

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

// 1. Create a Note and store permanently in Cloud Firestore
app.post('/api/notes', async (req, res) => {
  try {
    const { title = '', content = '', retention = 'permanent' } = req.body;
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Note content cannot be empty' });
    }

    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) {
      return res.status(400).json({ error: 'Note exceeds 1MB limit' });
    }

    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const id = `note_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const finalTitle = (title && typeof title === 'string') ? title.trim().slice(0, 150) : 'Untitled Note';

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/note?id=${id}`;
    const rawUrl = `${protocol}://${host}/note/raw/${id}`;

    const noteDoc = {
      id,
      title: finalTitle,
      content,
      size: Buffer.byteLength(content, 'utf8'),
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      publicUrl,
      rawUrl,
    };

    await setDoc(doc(fbDb, 'notes', id), noteDoc);
    console.log(`[Firebase Firestore] Note created: ${id} ("${finalTitle}")`);

    return res.json({ success: true, note: noteDoc });
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
      });
    }

    notes.sort((a, b) => b.createdAt - a.createdAt);
    return res.json(notes);
  } catch (err: any) {
    console.error('Error fetching notes from Firestore:', err);
    return res.json([]);
  }
});

// 3. Get Single Note JSON
app.get('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docSnap = await getDoc(doc(fbDb, 'notes', id));
    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const data = docSnap.data();
    const now = Date.now();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, 'notes', id)).catch(() => {});
      return res.status(404).json({ error: 'Note expired' });
    }
    return res.json({ success: true, note: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch note' });
  }
});

// 4. Delete a Note from Cloud Firestore
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
    const docSnap = await getDoc(doc(fbDb, 'notes', id));
    if (!docSnap.exists()) {
      return res.status(404).send('Note not found');
    }
    const data = docSnap.data();
    const now = Date.now();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, 'notes', id)).catch(() => {});
      return res.status(404).send('Note expired according to retention policy');
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(data.content || '');
  } catch (err: any) {
    return res.status(500).send(`Error reading note: ${err.message}`);
  }
});

// 6. Public Clean Viewer (Preformatted Raw Notepad view for humans & AI, zero clutter, zero broken layout)
app.get(['/note', '/note/:id'], async (req, res, next) => {
  try {
    const id = (req.params.id || req.query.id as string || '').trim();
    if (!id) {
      // If no ID provided, pass to SPA router
      return next();
    }

    const docSnap = await getDoc(doc(fbDb, 'notes', id));
    if (!docSnap.exists()) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head><meta charset="utf-8"><title>Note Not Found</title></head>
        <body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;">
          <div style="text-align:center;">
            <h1 style="color:#f43f5e;">404 - নোট পাওয়া যায়নি</h1>
            <p>এই নোটটি মুছে ফেলা হয়েছে অথবা মেয়াদের সময় পার হয়ে গেছে।</p>
            <a href="/" style="color:#f59e0b;text-decoration:none;">← হোমপেজে ফিরে যান</a>
          </div>
        </body>
        </html>
      `);
    }

    const data = docSnap.data();
    const now = Date.now();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, 'notes', id)).catch(() => {});
      return res.status(404).send('Note expired according to retention policy');
    }

    // Check if client prefers raw text (e.g. AI prompt, curl, API request)
    const isCurl = (req.get('user-agent') || '').toLowerCase().includes('curl');
    const isWget = (req.get('user-agent') || '').toLowerCase().includes('wget');
    const wantsRaw = req.query.raw === '1' || req.query.raw === 'true' || req.headers.accept === 'text/plain' || isCurl || isWget;

    if (wantsRaw) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(data.content || '');
    }

    const safeTitle = escapeHtml(data.title || 'Untitled Note');
    const safeContent = escapeHtml(data.content || '');
    const dateFormatted = new Date(data.createdAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
    const wordCount = (data.content || '').trim().split(/\s+/).filter(Boolean).length;
    const charCount = (data.content || '').length;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} - Clean Note</title>
  <meta name="description" content="Clean, distraction-free preformatted note" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.6;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(3, 7, 18, 0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #1f2937;
      padding: 0.75rem 1.25rem;
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
      flex: 1;
      max-width: 1000px;
      width: 100%;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem 1.25rem;
    }
    .note-box {
      background: #0b0f19;
      border: 1px solid #1f2937;
      border-radius: 0.75rem;
      padding: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.88rem;
      color: #e5e7eb;
      line-height: 1.7;
      tab-size: 4;
      outline: none;
    }
    .footer-notice {
      margin-top: 1.5rem;
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
