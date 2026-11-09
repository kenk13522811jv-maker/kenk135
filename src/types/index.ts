export type RetentionOption = 'permanent' | '1day' | '2days' | '3days';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string; // e.g. "https://pub-xxxx.r2.dev" or custom domain
  customDomainEnabled: boolean;
  isConfigured: boolean;
}

export interface UploadedFileItem {
  id: string;
  name: string;
  size: number;
  type: string; // mime type
  category: 'image' | 'video';
  publicUrl: string;
  storageKey: string;
  storageProvider: 'firebase-storage' | 'firestore-embedded' | 'cloudflare-r2' | 'sandbox-local';
  uploadedAt: number; // timestamp
  expiresAt: number | null; // timestamp or null for permanent
  retention: RetentionOption;
  isExpired?: boolean;
  thumbnailUrl?: string;
  downloadsCount: number;
  dataUrl?: string;
}

export type Language = 'bn' | 'en';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  retention: RetentionOption;
  isExpired?: boolean;
  publicUrl: string;
  rawUrl: string;
}

export interface AppItem {
  id: string;
  name: string; // original filename (e.g., app-release.apk)
  appName: string; // user-friendly app display name
  size: number;
  type?: string;
  uploadedAt: number;
  expiresAt: number | null;
  retention: RetentionOption;
  isExpired?: boolean;
  publicUrl: string; // landing page with download button
  downloadUrl: string; // direct .apk binary download
  downloadsCount: number;
}

