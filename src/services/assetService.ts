import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs 
} from 'firebase/firestore';
import { db } from './firebase';
import { UploadedFileItem, RetentionOption } from '../types';
import { saveSandboxBlob } from './db';

export function computeExpiryTimestamp(retention: RetentionOption, uploadTime: number): number | null {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  switch (retention) {
    case '1day':
      return uploadTime + ONE_DAY_MS;
    case '2days':
      return uploadTime + 2 * ONE_DAY_MS;
    case '3days':
      return uploadTime + 3 * ONE_DAY_MS;
    case 'permanent':
    default:
      return null;
  }
}

// Upload file directly to backend API (/api/upload) which gives a universal public URL
export async function uploadAsset(
  file: File | Blob,
  fileName: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  if (onProgress) onProgress(15);

  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('retention', retention);

  if (onProgress) onProgress(45);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (onProgress) onProgress(80);

    if (res.ok) {
      const data = await res.json();
      const asset: UploadedFileItem = {
        id: data.asset.id,
        name: data.asset.name,
        size: data.asset.size,
        type: data.asset.type,
        category: data.asset.category,
        publicUrl: data.asset.publicUrl,
        storageKey: data.asset.filePath || data.asset.id,
        storageProvider: 'firebase-storage',
        uploadedAt: data.asset.uploadedAt,
        expiresAt: data.asset.expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: data.asset.publicUrl,
      };

      // Also mirror metadata in Firestore so it's accessible across Firebase clients
      try {
        await setDoc(doc(db, 'assets', asset.id), {
          id: asset.id,
          name: asset.name,
          size: asset.size,
          type: asset.type,
          category: asset.category,
          publicUrl: asset.publicUrl,
          storagePath: asset.storageKey,
          storageProvider: asset.storageProvider,
          uploadedAt: asset.uploadedAt,
          expiresAt: asset.expiresAt || 0,
          retention: asset.retention,
          isExpired: false,
        });
      } catch (fsErr) {
        console.warn('Firestore sync note:', fsErr);
      }

      if (onProgress) onProgress(100);
      return asset;
    }
  } catch (err) {
    console.warn('Backend /api/upload fetch error, using local fallback:', err);
  }

  // Fallback if backend API failed
  const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const uploadedAt = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, uploadedAt);
  const isVideo = file.type.startsWith('video/');
  const category = isVideo ? 'video' : 'image';
  
  await saveSandboxBlob(id, file);
  // Generate real public endpoint URL format
  const publicUrl = `${window.location.origin}/api/public/${id}`;

  const fallbackItem: UploadedFileItem = {
    id,
    name: fileName,
    size: file.size,
    type: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    category,
    publicUrl,
    storageKey: `local/${id}/${fileName}`,
    storageProvider: 'sandbox-local',
    uploadedAt,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: URL.createObjectURL(file),
  };

  saveLocalFallbackAsset(fallbackItem);
  if (onProgress) onProgress(100);
  return fallbackItem;
}

// Upload from Online URL (/api/upload-url)
export async function uploadAssetFromUrl(
  url: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  if (onProgress) onProgress(20);

  try {
    const res = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, retention }),
    });

    if (onProgress) onProgress(80);

    if (res.ok) {
      const data = await res.json();
      const asset: UploadedFileItem = {
        id: data.asset.id,
        name: data.asset.name,
        size: data.asset.size,
        type: data.asset.type,
        category: data.asset.category,
        publicUrl: data.asset.publicUrl,
        storageKey: data.asset.id,
        storageProvider: 'firebase-storage',
        uploadedAt: data.asset.uploadedAt,
        expiresAt: data.asset.expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: data.asset.publicUrl,
      };

      try {
        await setDoc(doc(db, 'assets', asset.id), {
          id: asset.id,
          name: asset.name,
          size: asset.size,
          type: asset.type,
          category: asset.category,
          publicUrl: asset.publicUrl,
          storagePath: asset.storageKey,
          storageProvider: asset.storageProvider,
          uploadedAt: asset.uploadedAt,
          expiresAt: asset.expiresAt || 0,
          retention: asset.retention,
          isExpired: false,
        });
      } catch {}

      if (onProgress) onProgress(100);
      return asset;
    }
  } catch (err) {
    console.warn('Failed to call /api/upload-url, storing directly:', err);
  }

  // Fallback
  const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  const isVideo = Boolean(url.match(/\.(mp4|webm|mov|ogg)($|\?)/i));
  const fallbackItem: UploadedFileItem = {
    id,
    name: 'online-media.jpg',
    size: 1024 * 512,
    type: isVideo ? 'video/mp4' : 'image/jpeg',
    category: isVideo ? 'video' : 'image',
    publicUrl: url,
    storageKey: url,
    storageProvider: 'firebase-storage',
    uploadedAt: now,
    expiresAt: computeExpiryTimestamp(retention, now),
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: url,
  };

  saveLocalFallbackAsset(fallbackItem);
  if (onProgress) onProgress(100);
  return fallbackItem;
}

const LOCAL_FALLBACK_KEY = 'firebase_fallback_assets_v1';

function saveLocalFallbackAsset(item: UploadedFileItem) {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    const list: UploadedFileItem[] = raw ? JSON.parse(raw) : [];
    list.unshift(item);
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list));
  } catch {}
}

export function getLocalFallbackAssets(): UploadedFileItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function deleteLocalFallbackAsset(id: string) {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return;
    const list: UploadedFileItem[] = JSON.parse(raw);
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(list.filter(x => x.id !== id)));
  } catch {}
}

// Fetch all files from backend /api/files and listen to Firestore
export function subscribeToAssets(
  onUpdate: (items: UploadedFileItem[]) => void,
  _onError?: (err: Error) => void
): () => void {
  // 1. Initial fetch from /api/files
  const fetchBackendFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const files: any[] = await res.json();
        const mapped: UploadedFileItem[] = files.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          type: f.type,
          category: f.category,
          publicUrl: f.publicUrl,
          storageKey: f.filePath || f.id,
          storageProvider: (f.storageProvider || 'firebase-storage') as any,
          uploadedAt: f.uploadedAt,
          expiresAt: f.expiresAt,
          retention: f.retention,
          isExpired: f.isExpired,
          downloadsCount: f.downloadsCount || 0,
          thumbnailUrl: f.publicUrl,
        }));
        onUpdate(mapped);
        return;
      }
    } catch {}
    onUpdate(getLocalFallbackAssets());
  };

  fetchBackendFiles();

  // 2. Also listen to Firestore collection "assets"
  const collectionPath = 'assets';
  const assetsCol = collection(db, collectionPath);

  const unsubscribe = onSnapshot(
    assetsCol,
    (snapshot) => {
      const now = Date.now();
      const firestoreItems: UploadedFileItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
        return {
          id: data.id || docSnap.id,
          name: data.name,
          size: data.size,
          type: data.type,
          category: data.category || (data.type?.startsWith('video/') ? 'video' : 'image'),
          publicUrl: data.publicUrl,
          storageKey: data.storagePath || `pipeline_assets/${data.id}/${data.name}`,
          storageProvider: (data.storageProvider || 'firebase-storage') as any,
          uploadedAt: Number(data.uploadedAt),
          expiresAt,
          retention: data.retention || (expiresAt ? '1day' : 'permanent'),
          isExpired: expiresAt ? now > expiresAt : false,
          downloadsCount: 0,
          thumbnailUrl: data.publicUrl,
        };
      });

      if (firestoreItems.length > 0) {
        firestoreItems.sort((a, b) => b.uploadedAt - a.uploadedAt);
        onUpdate(firestoreItems);
      }
    },
    () => {
      fetchBackendFiles();
    }
  );

  return unsubscribe;
}

// Delete asset via backend /api/files/:id + Firestore
export async function deleteAsset(item: UploadedFileItem): Promise<boolean> {
  try {
    await fetch(`/api/files/${item.id}`, { method: 'DELETE' });
  } catch {}

  try {
    await deleteDoc(doc(db, 'assets', item.id));
  } catch {}

  deleteLocalFallbackAsset(item.id);
  return true;
}

// Automated cleanup trigger
export async function runAutomatedCleanup(): Promise<number> {
  let count = 0;
  try {
    const res = await fetch('/api/cleanup', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      count = data.cleaned || 0;
    }
  } catch {}

  // Also clean expired docs from Firestore
  try {
    const now = Date.now();
    const assetsCol = collection(db, 'assets');
    const snapshot = await getDocs(assetsCol);
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      if (expiresAt && now > expiresAt) {
        await deleteDoc(doc(db, 'assets', docSnap.id));
        count++;
      }
    }
  } catch {}

  return count;
}
