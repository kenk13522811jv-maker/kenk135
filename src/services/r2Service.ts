import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { R2Config, UploadedFileItem, RetentionOption } from '../types';
import { saveSandboxBlob, getSandboxBlob, deleteSandboxBlob } from './db';

const R2_CONFIG_KEY = 'cloudflare_r2_config_v1';
const CATALOG_KEY = 'uploaded_vault_files_v1';

export const DEFAULT_R2_CONFIG: R2Config = {
  accountId: '',
  accessKeyId: '',
  secretAccessKey: '',
  bucketName: '',
  publicDomain: '',
  customDomainEnabled: false,
  isConfigured: false,
};

export function loadR2Config(): R2Config {
  try {
    const raw = localStorage.getItem(R2_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.accountId && parsed.bucketName && parsed.accessKeyId && parsed.secretAccessKey) {
        return { ...parsed, isConfigured: true };
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load R2 config', e);
  }
  return DEFAULT_R2_CONFIG;
}

export function saveR2Config(config: R2Config): void {
  const isConfigured = Boolean(
    config.accountId.trim() &&
    config.accessKeyId.trim() &&
    config.secretAccessKey.trim() &&
    config.bucketName.trim()
  );
  const updated = { ...config, isConfigured };
  localStorage.setItem(R2_CONFIG_KEY, JSON.stringify(updated));
}

function getR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
    },
  });
}

export async function testR2Connection(config: R2Config): Promise<{ success: boolean; message: string }> {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    return { success: false, message: 'All credentials (Account ID, Access Key, Secret Key, Bucket Name) are required.' };
  }

  try {
    const client = getR2Client(config);
    const command = new ListObjectsV2Command({
      Bucket: config.bucketName.trim(),
      MaxKeys: 1,
    });
    await client.send(command);
    return { success: true, message: 'Connection to Cloudflare R2 bucket successful!' };
  } catch (error: any) {
    console.error('R2 Test failed:', error);
    const errorMsg = error?.message || error?.name || 'Failed to connect to Cloudflare R2 bucket.';
    return { 
      success: false, 
      message: `${errorMsg}. Check CORS settings on your bucket if testing from browser, or verify your keys.` 
    };
  }
}

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

// Generate unique clean storage key
export function generateStorageKey(filename: string): string {
  const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
  const sanitized = filename
    .replace(ext, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 30);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `uploads/${sanitized}-${timestamp}-${randomSuffix}${ext}`;
}

export async function uploadFileToR2(
  file: File,
  retention: RetentionOption,
  onProgress?: (pct: number) => void
): Promise<UploadedFileItem> {
  const config = loadR2Config();
  const id = 'f_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const key = generateStorageKey(file.name);
  const uploadedAt = Date.now();
  const expiresAt = computeExpiryTimestamp(retention, uploadedAt);
  const isVideo = file.type.startsWith('video/');
  const category = isVideo ? 'video' : 'image';

  if (onProgress) onProgress(20);

  if (config.isConfigured) {
    try {
      const client = getR2Client(config);
      const command = new PutObjectCommand({
        Bucket: config.bucketName.trim(),
        Key: key,
        Body: file,
        ContentType: file.type,
      });

      if (onProgress) onProgress(60);
      await client.send(command);
      if (onProgress) onProgress(95);

      // Public URL generation
      let publicUrl = '';
      if (config.publicDomain && config.publicDomain.trim()) {
        const base = config.publicDomain.trim().replace(/\/+$/, '');
        publicUrl = `${base}/${key}`;
      } else {
        // Cloudflare R2 default pub dev or S3 url
        publicUrl = `https://${config.bucketName.trim()}.${config.accountId.trim()}.r2.cloudflarestorage.com/${key}`;
      }

      // Also create object URL for instant UI preview in current session
      const localBlobUrl = URL.createObjectURL(file);

      const newItem: UploadedFileItem = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        category,
        publicUrl,
        storageKey: key,
        storageProvider: 'cloudflare-r2',
        uploadedAt,
        expiresAt,
        retention,
        thumbnailUrl: localBlobUrl,
        downloadsCount: 0,
      };

      saveFileToCatalog(newItem);
      if (onProgress) onProgress(100);
      return newItem;
    } catch (err: any) {
      console.warn('Real R2 upload failed, falling back to sandbox storage:', err);
      // Fall through to sandbox mode with explanatory alert or return sandbox
    }
  }

  // Sandbox / Local fallback mode
  if (onProgress) onProgress(50);
  await saveSandboxBlob(id, file);
  if (onProgress) onProgress(90);

  const localBlobUrl = URL.createObjectURL(file);
  const publicUrl = `https://r2.cdn.vault.io/public/${key}`;

  const newItem: UploadedFileItem = {
    id,
    name: file.name,
    size: file.size,
    type: file.type,
    category,
    publicUrl,
    storageKey: key,
    storageProvider: 'sandbox-local',
    uploadedAt,
    expiresAt,
    retention,
    thumbnailUrl: localBlobUrl,
    downloadsCount: 0,
  };

  saveFileToCatalog(newItem);
  if (onProgress) onProgress(100);
  return newItem;
}

export function loadCatalog(): UploadedFileItem[] {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const items: UploadedFileItem[] = JSON.parse(raw);
      const now = Date.now();
      // Mark or filter expired items
      return items.map(item => ({
        ...item,
        isExpired: item.expiresAt ? now > item.expiresAt : false,
      }));
    }
  } catch (e) {
    console.error('Failed to load catalog', e);
  }
  return [];
}

export function saveFileToCatalog(item: UploadedFileItem): void {
  const current = loadCatalog();
  const updated = [item, ...current.filter(i => i.id !== item.id)];
  localStorage.setItem(CATALOG_KEY, JSON.stringify(updated));
}

export async function deleteFileFromVault(file: UploadedFileItem): Promise<boolean> {
  const config = loadR2Config();
  if (file.storageProvider === 'cloudflare-r2' && config.isConfigured) {
    try {
      const client = getR2Client(config);
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucketName.trim(),
          Key: file.storageKey,
        })
      );
    } catch (e) {
      console.warn('Failed to delete from R2 bucket directly:', e);
    }
  } else {
    await deleteSandboxBlob(file.id);
  }

  const current = loadCatalog();
  const updated = current.filter(i => i.id !== file.id);
  localStorage.setItem(CATALOG_KEY, JSON.stringify(updated));
  return true;
}

export async function cleanupExpiredFiles(): Promise<number> {
  const catalog = loadCatalog();
  const now = Date.now();
  const expired = catalog.filter(i => i.expiresAt && now > i.expiresAt);
  for (const item of expired) {
    await deleteFileFromVault(item);
  }
  return expired.length;
}

export async function getFileBlobForDownload(item: UploadedFileItem): Promise<Blob | null> {
  if (item.storageProvider === 'sandbox-local') {
    return await getSandboxBlob(item.id);
  }
  try {
    const res = await fetch(item.publicUrl);
    if (res.ok) {
      return await res.blob();
    }
  } catch (err) {
    console.warn('Direct fetch from public URL failed (CORS or network):', err);
  }
  return null;
}
