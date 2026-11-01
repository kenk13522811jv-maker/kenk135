import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs 
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { UploadedFileItem, RetentionOption } from '../types';

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

export function sanitizeFileName(name: string): string {
  const extIndex = name.lastIndexOf('.');
  const ext = extIndex !== -1 ? name.slice(extIndex) : '';
  const base = extIndex !== -1 ? name.slice(0, extIndex) : name;
  const clean = base.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30);
  return `${clean || 'asset'}${ext || '.bin'}`;
}

// Active upload tracking
let activeXhr: XMLHttpRequest | null = null;
let isCancelled = false;

export async function cancelCurrentUpload(): Promise<void> {
  isCancelled = true;
  if (activeXhr) {
    try {
      activeXhr.abort();
    } catch {}
    activeXhr = null;
  }
}

// Upload a single asset to Firebase Firestore
export async function uploadAsset(
  file: File | Blob,
  fileName: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  isCancelled = false;
  const isVideo = file.type.startsWith('video/');
  const category = isVideo ? 'video' : 'image';
  const cleanName = sanitizeFileName(fileName);
  const now = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, now);

  if (onProgress) onProgress(15);

  const formData = new FormData();
  formData.append('file', file, cleanName);
  formData.append('retention', retention);

  const serverAsset = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(85, Math.round((event.loaded / event.total) * 70) + 15);
        if (onProgress) onProgress(percent);
      }
    };

    xhr.onload = () => {
      activeXhr = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.asset) {
            resolve(res.asset);
          } else {
            reject(new Error(res.error || 'Firebase save rejected'));
          }
        } catch {
          reject(new Error('Invalid response from Firebase server'));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error || `Server error: HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Server error: HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      activeXhr = null;
      reject(new Error('Network error during file upload. Check your connection.'));
    };

    xhr.onabort = () => {
      activeXhr = null;
      reject(new Error('Upload was cancelled.'));
    };

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });

  if (onProgress) onProgress(90);

  const assetItem: UploadedFileItem = {
    id: serverAsset.id,
    name: fileName,
    size: file.size,
    type: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    category,
    publicUrl: serverAsset.publicUrl,
    storageKey: serverAsset.storagePath || `firestore_assets/${serverAsset.id}`,
    storageProvider: 'firestore-embedded',
    uploadedAt: now,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: serverAsset.publicUrl,
  };

  // Double check client-side Firestore synchronization
  if (isFirebaseConfigured()) {
    try {
      await setDoc(doc(db, 'assets', assetItem.id), {
        id: assetItem.id,
        name: assetItem.name,
        size: assetItem.size,
        type: assetItem.type,
        category: assetItem.category,
        publicUrl: assetItem.publicUrl,
        storagePath: assetItem.storageKey,
        storageProvider: 'firestore-embedded',
        uploadedAt: assetItem.uploadedAt,
        expiresAt: assetItem.expiresAt || 0,
        retention: assetItem.retention,
        isExpired: false,
      });
    } catch (fsErr) {
      console.warn('Client-side Firestore sync notice (server already saved):', fsErr);
    }
  }

  if (onProgress) onProgress(100);
  return assetItem;
}

// Bulk Upload: Handles 10, 20, 30+ files sequentially/in batches with progress
export async function uploadMultipleAssets(
  files: File[],
  retention: RetentionOption,
  onBatchProgress?: (completed: number, total: number, currentFileName: string, filePercent: number) => void
): Promise<UploadedFileItem[]> {
  const results: UploadedFileItem[] = [];
  isCancelled = false;

  for (let i = 0; i < files.length; i++) {
    if (isCancelled) break;
    const file = files[i];

    if (onBatchProgress) {
      onBatchProgress(i, files.length, file.name, 10);
    }

    try {
      const item = await uploadAsset(file, file.name, retention, (filePct) => {
        if (onBatchProgress) {
          onBatchProgress(i, files.length, file.name, filePct);
        }
      });
      results.push(item);
    } catch (err: any) {
      console.error(`Failed to upload ${file.name}:`, err);
      // We continue with other files so one broken file doesn't block the other 29 files
    }

    if (onBatchProgress) {
      onBatchProgress(i + 1, files.length, file.name, 100);
    }
  }

  return results;
}

// Upload from web URL (Online image/video link pasted by user)
export async function uploadAssetFromUrl(
  url: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  if (onProgress) onProgress(20);

  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, retention }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to process URL into Firebase');
  }

  const data = await res.json();
  const serverAsset = data.asset;
  if (onProgress) onProgress(80);

  const assetItem: UploadedFileItem = {
    id: serverAsset.id,
    name: serverAsset.name,
    size: serverAsset.size || 512000,
    type: serverAsset.type || 'image/jpeg',
    category: serverAsset.category || 'image',
    publicUrl: serverAsset.publicUrl,
    storageKey: serverAsset.storagePath || `firestore_assets/${serverAsset.id}`,
    storageProvider: 'firestore-embedded',
    uploadedAt: serverAsset.uploadedAt,
    expiresAt: serverAsset.expiresAt,
    retention: serverAsset.retention || retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: serverAsset.publicUrl,
  };

  if (onProgress) onProgress(100);
  return assetItem;
}

// Real-time listener for Firestore collection "assets"
export function subscribeToAssets(
  onUpdate: (items: UploadedFileItem[]) => void
): () => void {
  let serverItems: UploadedFileItem[] = [];
  let firestoreItems: UploadedFileItem[] = [];

  const emitMerged = () => {
    const map = new Map<string, UploadedFileItem>();
    serverItems.forEach(item => map.set(item.id, item));
    firestoreItems.forEach(item => map.set(item.id, item));
    const merged = Array.from(map.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
    onUpdate(merged);
  };

  // Initial fetch from server
  fetch('/api/files')
    .then(res => res.json())
    .then((files: any[]) => {
      serverItems = files.map(f => ({
        ...f,
        thumbnailUrl: f.publicUrl,
      }));
      emitMerged();
    })
    .catch(() => {});

  if (!isFirebaseConfigured()) {
    return () => {};
  }

  const collectionPath = 'assets';
  const assetsCol = collection(db, collectionPath);

  const unsubscribe = onSnapshot(
    assetsCol,
    (snapshot) => {
      const now = Date.now();
      firestoreItems = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
        return {
          id: data.id || docSnap.id,
          name: data.name,
          size: data.size,
          type: data.type,
          category: data.category || (data.type?.startsWith('video/') ? 'video' : 'image'),
          publicUrl: data.publicUrl,
          storageKey: data.storagePath || `firestore_assets/${data.id}`,
          storageProvider: 'firestore-embedded',
          uploadedAt: Number(data.uploadedAt),
          expiresAt,
          retention: data.retention || (expiresAt ? '1day' : 'permanent'),
          isExpired: expiresAt ? now > expiresAt : false,
          downloadsCount: 0,
          thumbnailUrl: data.publicUrl,
        };
      });

      emitMerged();
    },
    (err) => {
      console.warn('Firestore subscription notice:', err);
    }
  );

  return unsubscribe;
}

// Delete asset fast without UI freezing
export async function deleteAsset(item: UploadedFileItem): Promise<boolean> {
  const deletePromise = (async () => {
    // 1. Delete from Firebase Firestore
    if (isFirebaseConfigured()) {
      try {
        await deleteDoc(doc(db, 'assets', item.id));
      } catch (e) {
        console.warn('Direct Firestore delete error:', e);
      }
    }

    // 2. Delete via backend API
    try {
      await fetch(`/api/files/${item.id}`, { method: 'DELETE' });
    } catch {}
  })();

  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  await Promise.race([deletePromise, timeoutPromise]);
  return true;
}

// Automated cleanup of expired files in Firestore
export async function runAutomatedCleanup(): Promise<number> {
  try {
    const res = await fetch('/api/cleanup', { method: 'POST' });
    const data = await res.json();
    return data.cleaned || 0;
  } catch {
    // Fallback client-side cleanup
    if (!isFirebaseConfigured()) return 0;
    let count = 0;
    const now = Date.now();
    try {
      const assetsCol = collection(db, 'assets');
      const snapshot = await getDocs(assetsCol);
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
        if (expiresAt && now > expiresAt) {
          try {
            await deleteDoc(doc(db, 'assets', docSnap.id));
            count++;
          } catch {}
        }
      }
    } catch {}
    return count;
  }
}
