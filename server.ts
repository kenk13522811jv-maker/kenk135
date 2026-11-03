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
