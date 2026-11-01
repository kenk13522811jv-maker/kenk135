import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const CUSTOM_FIREBASE_CONFIG_KEY = 'custom_firebase_config_v1';

export interface FirebaseConfigType {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId?: string;
  measurementId?: string;
}

// Safely probe if local dev config exists without hardcoding or breaking git builds
let localDevConfig: Partial<FirebaseConfigType> = {};
try {
  const glob = import.meta.glob('/firebase-applet-config.json', { eager: true });
  const key = Object.keys(glob)[0];
  if (key && glob[key]) {
    localDevConfig = (glob[key] as any).default || glob[key];
  }
} catch {}

export function getActiveFirebaseConfig(): FirebaseConfigType {
  // 1. PRIMARY: Vite Environment Variables (Render, Vercel, .env)
  // This is the clean, secure method where no secrets are stored in the repo!
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.firebasestorage.app`,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
    };
  }

  // 2. Custom configuration saved in browser's local settings
  try {
    const custom = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read custom firebase config from localStorage', e);
  }

  // 3. Local dev config (for AI Studio preview, excluded from Git via .gitignore)
  if (localDevConfig.apiKey && localDevConfig.projectId) {
    return localDevConfig as FirebaseConfigType;
  }

  // 4. Default clean empty placeholder
  return {
    projectId: '',
    appId: '',
    apiKey: '',
    authDomain: '',
    storageBucket: '',
    messagingSenderId: '',
  };
}

export function saveCustomFirebaseConfig(config: FirebaseConfigType): void {
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function resetToDefaultFirebaseConfig(): void {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
}

// Initialize Firebase App
const activeConfig = getActiveFirebaseConfig();
const hasCredentials = Boolean(activeConfig.apiKey && activeConfig.projectId);

export const app = getApps().length === 0 
  ? initializeApp(hasCredentials ? activeConfig : {
      apiKey: "dummy-key-for-init",
      projectId: "dummy-project",
      appId: "1:000:web:000",
      authDomain: "dummy.firebaseapp.com",
      storageBucket: "dummy.appspot.com",
    }) 
  : getApp();

export const db = (hasCredentials && activeConfig.firestoreDatabaseId)
  ? getFirestore(app, activeConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Anonymous sign in helper
let currentUser: User | null = null;
export async function ensureAuthUser(): Promise<User | null> {
  if (!hasCredentials) return null;
  if (currentUser) return currentUser;
  try {
    const cred = await signInAnonymously(auth);
    currentUser = cred.user;
    return currentUser;
  } catch (err) {
    return null;
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

// Test connection
export async function testFirestoreConnection(): Promise<boolean> {
  if (!hasCredentials) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch {
    return false;
  }
}
