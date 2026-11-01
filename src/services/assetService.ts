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

// Active upload task reference to allow immediate cancellation mid-upload
let activeUploadTask: UploadTask | null = null;
let activeUploadingAssetId: string | null = null;
let activeUploadingStoragePath: string | null = null;

// Cancel in-progress upload and purge any partial data immediately
export async function cancelCurrentUpload(): Promise<void> {
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
    try {
      await deleteDoc(doc(db, 'assets', activeUploadingAssetId));
    } catch {}
    try {
      await fetch(`/api/files/${activeUploadingAssetId}`, { method: 'DELETE' });
    } catch {}
    activeUploadingAssetId = null;
  }
}

// Pure Firebase Upload (No Sandbox, saves directly to Firebase Storage + Firestore)
export async function uploadAsset(
  file: File | Blob,
  fileName: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured! Please add VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET in your Render Environment Variables or click Firebase Config.'
    );
  }

  try {
    await ensureAuthUser();
  } catch {}

  const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const uploadedAt = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, uploadedAt);
  const isVideo = file.type.startsWith('video/');
  const category = isVideo ? 'video' : 'image';
  const cleanName = sanitizeFileName(fileName);
  const storagePath = `pipeline_assets/${id}/${cleanName}`;

  activeUploadingAssetId = id;
  activeUploadingStoragePath = storagePath;

  if (onProgress) onProgress(10);

  // 1. Upload to Firebase Storage
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    customMetadata: {
      retention,
      expiresAt: expiresAt ? String(expiresAt) : 'permanent',
      uploadedAt: String(uploadedAt),
    }
  });

  activeUploadTask = uploadTask;

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 80) + 10;
          if (onProgress) onProgress(pct);
        }
      },
      (error) => {
        activeUploadTask = null;
        reject(error);
      },
      () => {
        activeUploadTask = null;
        resolve();
      }
    );
  });

  // 2. Obtain real public download URL from Firebase Storage
  if (onProgress) onProgress(90);
  const publicUrl = await getDownloadURL(storageRef);

  // 3. Save metadata to Firebase Firestore
  const assetItem: UploadedFileItem = {
    id,
    name: fileName,
    size: file.size,
    type: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
    category,
    publicUrl,
    storageKey: storagePath,
    storageProvider: 'firebase-storage',
    uploadedAt,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: publicUrl,
  };

  await setDoc(doc(db, 'assets', id), {
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

  // Reset active tracking
  activeUploadingAssetId = null;
  activeUploadingStoragePath = null;

  if (onProgress) onProgress(100);
  return assetItem;
}

// Upload from web URL (Online image/video link pasted by user)
export async function uploadAssetFromUrl(
  url: string,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured! Please add Firebase credentials in Render Environment Variables or Firebase Config.'
    );
  }

  if (onProgress) onProgress(20);

  let parsedName = 'online-media.jpg';
  try {
    const urlObj = new URL(url);
    const lastPart = urlObj.pathname.split('/').pop();
    if (lastPart && lastPart.includes('.')) {
      parsedName = decodeURIComponent(lastPart.split('?')[0]);
    }
  } catch {}

  const isVideoUrl = Boolean(url.match(/\.(mp4|webm|mov|ogg)($|\?)/i));
  const mimeType = isVideoUrl ? 'video/mp4' : 'image/jpeg';

  let blob: Blob | null = null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      blob = await response.blob();
    }
  } catch {}

  if (onProgress) onProgress(50);

  if (blob) {
    const file = new File([blob], parsedName, { type: blob.type || mimeType });
    return await uploadAsset(file, parsedName, retention, onProgress);
  }

  // If remote CORS blocks binary download, register URL entry directly in Firestore
  const id = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, now);
  const category = isVideoUrl ? 'video' : 'image';

  const assetItem: UploadedFileItem = {
    id,
    name: parsedName,
    size: 1024 * 512,
    type: mimeType,
    category,
    publicUrl: url,
    storageKey: url,
    storageProvider: 'firebase-storage',
    uploadedAt: now,
    expiresAt,
    retention,
    isExpired: false,
    downloadsCount: 0,
    thumbnailUrl: url,
  };

  await setDoc(doc(db, 'assets', id), {
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

  if (onProgress) onProgress(100);
  return assetItem;
}

// Real-time listener for Firestore collection "assets"
export function subscribeToAssets(
  onUpdate: (items: UploadedFileItem[]) => void
): () => void {
  // If Firebase is not configured, check if there are legacy backend files
  if (!isFirebaseConfigured()) {
    fetch('/api/files')
      .then(res => res.json())
      .then((files: any[]) => {
        onUpdate(files.map(f => ({
          ...f,
          storageKey: f.filePath || f.id,
          thumbnailUrl: f.publicUrl,
        })));
      })
      .catch(() => onUpdate([]));
    return () => {};
  }

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
          storageProvider: 'firebase-storage',
          uploadedAt: Number(data.uploadedAt),
          expiresAt,
          retention: data.retention || (expiresAt ? '1day' : 'permanent'),
          isExpired: expiresAt ? now > expiresAt : false,
          downloadsCount: 0,
          thumbnailUrl: data.publicUrl,
        };
      });

      firestoreItems.sort((a, b) => b.uploadedAt - a.uploadedAt);
      onUpdate(firestoreItems);
    },
    (err) => {
      console.warn('Firestore subscription notice:', err);
      // Fallback
      fetch('/api/files')
        .then(res => res.json())
        .then(items => onUpdate(items))
        .catch(() => onUpdate([]));
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
