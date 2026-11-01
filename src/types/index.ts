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
  storageProvider: 'firebase-storage' | 'cloudflare-r2' | 'sandbox-local';
  uploadedAt: number; // timestamp
  expiresAt: number | null; // timestamp or null for permanent
  retention: RetentionOption;
  isExpired?: boolean;
  thumbnailUrl?: string;
  downloadsCount: number;
}

export type Language = 'bn' | 'en';
