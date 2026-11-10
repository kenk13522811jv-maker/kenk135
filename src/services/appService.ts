import { AppItem, RetentionOption } from '../types';

export async function uploadApp(
  file: File,
  appName?: string,
  retention: RetentionOption = 'permanent',
  onProgress?: (percent: number) => void
): Promise<AppItem> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('retention', retention);
    if (appName && appName.trim()) {
      formData.append('appName', appName.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/apps/upload');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const text = (xhr.responseText || '').trim();
        if (!text) {
          reject(new Error(`সার্ভার থেকে খালি রেসপন্স এসেছে (HTTP ${xhr.status || 500})`));
          return;
        }

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          if (xhr.status >= 400) {
            reject(new Error(`সার্ভার ত্রুটি (HTTP ${xhr.status}): রিকোয়েস্ট ব্যর্থ হয়েছে`));
          } else {
            reject(new Error(`রেসপন্স সঠিক JSON ফরম্যাটে নেই (HTTP ${xhr.status})`));
          }
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.success && data.app) {
          resolve(data.app);
        } else {
          reject(new Error(data.error || `Upload failed with status ${xhr.status}`));
        }
      } catch (err: any) {
        reject(new Error(err.message || 'Failed to parse response'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('নেটওয়ার্ক সংযোগ বিঘ্নিত হয়েছে। সার্ভারে রিকোয়েস্ট পৌঁছাতে পারেনি।'));
    };

    xhr.ontimeout = () => {
      reject(new Error('আপলোড সম্পন্ন হতে অতিরিক্ত সময় লেগেছে (টাইমআউট)।'));
    };

    xhr.send(formData);
  });
}

export async function fetchApps(): Promise<AppItem[]> {
  try {
    const res = await fetch('/api/apps');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to fetch apps:', err);
    return [];
  }
}

export async function deleteApp(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/apps/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return Boolean(res.ok && data.success);
  } catch (err) {
    console.error(`Failed to delete app ${id}:`, err);
    return false;
  }
}
