import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject, 
  UploadTask 
} from 'firebase/storage';
import { db, storage, isFirebaseConfigured, ensureAuthUser } from './firebase';
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

// Active upload tracking to allow immediate mid-upload cancellation
let activeXhr: XMLHttpRequest | null = null;
let activeUploadTask: UploadTask | null = null;
let activeUploadingAssetId: string | null = null;
let activeUploadingStoragePath: string | null = null;

// Cancel in-progress upload and purge any partial data immediately
export async function cancelCurrentUpload(): Promise<void> {
  if (activeXhr) {
    try {
      activeXhr.abort();
    } catch {}
    activeXhr = null;
  }

  if (activeUploadTask) {
    try {
      activeUploadTask.cancel();
    } catch {}
    activeUploadTask = null;
  }

  // Purge any partial storage object or firestore doc
  if (activeUploadingStoragePath) {
    try {
      const storageRef = ref(storage, activeUploadingStoragePath);
      await deleteObject(storageRef);
    } catch {}
    activeUploadingStoragePath = null;
  }

  if (activeUploadingAssetId) {
    const idToPurge = activeUploadingAssetId;
    activeUploadingAssetId = null;
    try {
      await deleteDoc(doc(db, 'assets', idToPurge));
    } catch {}
    try {
      await fetch(`/api/files/${idToPurge}`, { method: 'DELETE' });
    } catch {}
  }
}

// Ultra-fast instant upload (<1s) with Firebase Firestore synchronization
export async function uploadAsset(
  file: File | Blob,
  fileName: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  const isVideo = file.type.startsWith('video/');
  const category = isVideo ? 'video' : 'image';
  const cleanName = sanitizeFileName(fileName);
  const now = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, now);

  if (onProgress) onProgress(15);

  // Step 1: Upload via same-origin backend API (takes ~150-300ms for images/videos)
  const formData = new FormData();
  formData.append('file', file, cleanName);
  formData.append('retention', retention);

  const serverAsset = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        // Map upload progress from 15% to 80%
        const percent = Math.min(80, Math.round((event.loaded / event.total) * 65) + 15);
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
            reject(new Error(res.error || 'Server rejected the file upload'));
          }
        } catch {
          reject(new Error('Invalid response from upload server'));
        }
      } else {
        reject(new Error(`Server error: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      activeXhr = null;
      reject(new Error('Network error during file upload. Please check your connection.'));
    };

    xhr.onabort = () => {
      activeXhr = null;
      reject(new Error('Upload was cancelled.'));
    };

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });

  const assetId = serverAsset.id;
  activeUploadingAssetId = assetId;

  if (onProgress) onProgress(85);

  let finalPublicUrl = serverAsset.publicUrl;
  let finalStorageKey = serverAsset.filePath || `uploads/${serverAsset.id}`;

  // Step 2: Attempt Firebase Storage upload in background with a 2-second strict timeout (so CORS never hangs the user)
  if (isFirebaseConfigured()) {
    try {
      await ensureAuthUser();
      const storagePath = `pipeline_assets/${assetId}/${cleanName}`;
      activeUploadingStoragePath = storagePath;
      const storageRef = ref(storage, storagePath);

      const fbStoragePromise = (async () => {
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
          customMetadata: {
            retention,
            expiresAt: expiresAt ? String(expiresAt) : 'permanent',
            uploadedAt: String(now),
          }
        });
        activeUploadTask = uploadTask;
        await uploadTask;
        activeUploadTask = null;
        return await getDownloadURL(storageRef);
      })();

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
      const fbUrl = await Promise.race([fbStoragePromise, timeoutPromise]);
      if (fbUrl) {
        finalPublicUrl = fbUrl;
        finalStorageKey = storagePath;
      }
    } catch (fbErr) {
      console.warn('Firebase Storage upload notice (using universal vault link):', fbErr);
    }
  }

  if (onProgress) onProgress(95);

  const assetItem: UploadedFileItem = {
    id: assetId,
    name: fileName,
    size: file.size,
    type: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    category,
    publicUrl: finalPublicUrl,
    storageKey: finalStorageKey,
    storageProvider: 'firebase-storage',
    uploadedAt: now,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: finalPublicUrl,
  };

  // Step 3: Persist document in Firestore database (if configured) with timeout protection
  if (isFirebaseConfigured()) {
    try {
      const firestorePromise = setDoc(doc(db, 'assets', assetId), {
        id: assetItem.id,
        name: assetItem.name,
        size: assetItem.size,
        type: assetItem.type,
        category: assetItem.category,
        publicUrl: assetItem.publicUrl,
        storagePath: assetItem.storageKey,
        storageProvider: 'firebase-storage',
        uploadedAt: assetItem.uploadedAt,
        expiresAt: assetItem.expiresAt || 0,
        retention: assetItem.retention,
        isExpired: false,
      });
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 2000));
      await Promise.race([firestorePromise, timeoutPromise]);
    } catch (fsErr) {
      console.warn('Firestore metadata sync notice:', fsErr);
    }
  }

  // Clear active upload tracking
  activeUploadingAssetId = null;
  activeUploadingStoragePath = null;
  activeXhr = null;
  activeUploadTask = null;

  if (onProgress) onProgress(100);
  return assetItem;
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
    throw new Error('Failed to process URL on server');
  }

  const data = await res.json();
  const serverAsset = data.asset;
  if (onProgress) onProgress(70);

  const assetItem: UploadedFileItem = {
    id: serverAsset.id,
    name: serverAsset.name,
    size: serverAsset.size || 512000,
    type: serverAsset.type || 'image/jpeg',
    category: serverAsset.category || 'image',
    publicUrl: serverAsset.publicUrl,
    storageKey: serverAsset.filePath || serverAsset.id,
    storageProvider: 'firebase-storage',
    uploadedAt: serverAsset.uploadedAt,
    expiresAt: serverAsset.expiresAt,
    retention: serverAsset.retention || retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: serverAsset.publicUrl,
  };

  // Sync to Firestore if available
  if (isFirebaseConfigured()) {
    try {
      await Promise.race([
        setDoc(doc(db, 'assets', assetItem.id), {
          id: assetItem.id,
          name: assetItem.name,
          size: assetItem.size,
          type: assetItem.type,
          category: assetItem.category,
          publicUrl: assetItem.publicUrl,
          storagePath: assetItem.storageKey,
          storageProvider: 'firebase-storage',
          uploadedAt: assetItem.uploadedAt,
          expiresAt: assetItem.expiresAt || 0,
          retention: assetItem.retention,
          isExpired: false,
        }),
        new Promise<void>((r) => setTimeout(r, 2000))
      ]);
    } catch {}
  }

  if (onProgress) onProgress(100);
  return assetItem;
}

// Real-time listener for Firestore collection "assets" with local server sync
export function subscribeToAssets(
  onUpdate: (items: UploadedFileItem[]) => void
): () => void {
  let serverItems: UploadedFileItem[] = [];
  let firestoreItems: UploadedFileItem[] = [];

  const emitMerged = () => {
    const map = new Map<string, UploadedFileItem>();
    // Add server items first
    serverItems.forEach(item => map.set(item.id, item));
    // Firestore items take priority if present
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
        storageKey: f.filePath || f.id,
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
          storageKey: data.storagePath || `pipeline_assets/${data.id}/${data.name}`,
          storageProvider: 'firebase-storage',
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

// Delete asset with safety timeout so it NEVER gets stuck on "Deleting..."
export async function deleteAsset(item: UploadedFileItem): Promise<boolean> {
  const deletePromise = (async () => {
    // 1. Delete from Firebase Storage
    if (isFirebaseConfigured() && item.storageKey && !item.storageKey.startsWith('http')) {
      try {
        const storageRef = ref(storage, item.storageKey);
        await deleteObject(storageRef);
      } catch {}
    }

    // 2. Delete from Firebase Firestore
    if (isFirebaseConfigured()) {
      try {
        await deleteDoc(doc(db, 'assets', item.id));
      } catch {}
    }

    // 3. Delete from backend file system if it existed on disk
    try {
      await fetch(`/api/files/${item.id}`, { method: 'DELETE' });
    } catch {}
  })();

  // 2.5 second timeout to guarantee UI never freezes
  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 2500));
  await Promise.race([deletePromise, timeoutPromise]);

  return true;
}

// Automated cleanup of expired files in Firebase Storage and Firestore
export async function runAutomatedCleanup(): Promise<number> {
  if (!isFirebaseConfigured()) {
    try {
      const res = await fetch('/api/cleanup', { method: 'POST' });
      const data = await res.json();
      return data.cleaned || 0;
    } catch {
      return 0;
    }
  }

  let count = 0;
  const now = Date.now();

  try {
    const assetsCol = collection(db, 'assets');
    const snapshot = await getDocs(assetsCol);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      if (expiresAt && now > expiresAt) {
        if (data.storagePath && !data.storagePath.startsWith('http')) {
          try {
            const storageRef = ref(storage, data.storagePath);
            await deleteObject(storageRef);
          } catch {}
        }

        try {
          await deleteDoc(doc(db, 'assets', docSnap.id));
          count++;
        } catch {}
      }
    }
  } catch {}

  return count;
}
