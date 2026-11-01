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

// ================= API ROUTES =================

// 1. Direct File Upload to Cloud Firestore (Pure Firebase, zero local disk)
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

    // Convert memory buffer to dataUrl for pure Firebase Firestore storage
    const base64Data = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64Data}`;

    const newAsset = {
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
      dataUrl,
    };

    // Save directly into Cloud Firestore
    await setDoc(doc(fbDb, 'assets', id), newAsset);
    console.log(`[Firebase Firestore] Saved asset "${req.file.originalname}" to assets/${id}`);

    // Return asset item to client (omitting raw dataUrl in response for speed)
    const { dataUrl: _, ...clientAsset } = newAsset;
    return res.json({ 
      success: true, 
      asset: {
        ...clientAsset,
        expiresAt,
        downloadsCount: 0,
        thumbnailUrl: publicUrl,
      } 
    });
  } catch (err: any) {
    console.error('Upload to Firestore failed:', err);
    return res.status(500).json({ error: `Firebase save failed: ${err.message || 'Unknown error'}` });
  }
});

// 2. Upload from URL (Saves to Firestore)
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

    const newAsset = {
      id,
      name: parsedName,
      size: 1024 * 512,
      type: isVideo ? 'video/mp4' : 'image/jpeg',
      category,
      publicUrl: url, // Direct URL
      storagePath: `firestore_assets/${id}`,
      storageProvider: 'firestore-embedded',
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      dataUrl: url,
    };

    await setDoc(doc(fbDb, 'assets', id), newAsset);

    return res.json({ 
      success: true, 
      asset: {
        ...newAsset,
        expiresAt,
        downloadsCount: 0,
        thumbnailUrl: url,
      } 
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'URL ingestion failed' });
  }
});

// 3. Universal Public Access (Directly streamed from Cloud Firestore)
app.get('/api/public/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docSnap = await getDoc(doc(fbDb, 'assets', id));

    if (!docSnap.exists()) {
      return res.status(404).send('Asset not found or expired in Firebase');
    }

    const data = docSnap.data();
    const now = Date.now();

    // Check expiration
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      // Async purge
      deleteDoc(doc(fbDb, 'assets', id)).catch(() => {});
      return res.status(404).send('Asset expired according to retention policy');
    }

    // If document has base64 dataUrl, stream it directly as binary
    if (data.dataUrl && data.dataUrl.startsWith('data:')) {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${data.name}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.end(buffer);
      }
    }

    // If external publicUrl
    if (data.publicUrl && data.publicUrl.startsWith('http') && !data.publicUrl.includes(`/api/public/${id}`)) {
      return res.redirect(data.publicUrl);
    }

    return res.status(404).send('Media payload unavailable');
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
    console.log(`🚀 Firebase AI Vault Server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
});
