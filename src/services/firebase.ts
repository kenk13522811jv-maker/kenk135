import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import defaultConfig from '../../firebase-applet-config.json';

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

export function getActiveFirebaseConfig(): FirebaseConfigType {
  // 1. Check Vite Environment variables (Recommended for Render, Vercel, Netlify deployment)
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

  // 2. Check localStorage custom settings
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

  // 3. Fallback to auto-provisioned configuration
  return defaultConfig as FirebaseConfigType;
}

export function saveCustomFirebaseConfig(config: FirebaseConfigType): void {
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function resetToDefaultFirebaseConfig(): void {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
}

// Initialize Firebase App
const activeConfig = getActiveFirebaseConfig();
export const app = getApps().length === 0 ? initializeApp(activeConfig) : getApp();

export const db = activeConfig.firestoreDatabaseId
  ? getFirestore(app, activeConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

// Anonymous sign in helper
let currentUser: User | null = null;
export async function ensureAuthUser(): Promise<User | null> {
  if (currentUser) return currentUser;
  try {
    const cred = await signInAnonymously(auth);
    currentUser = cred.user;
    return currentUser;
  } catch (err) {
    console.warn('Anonymous sign-in not available; continuing in public mode', err);
    return null;
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
});

// Test connection
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network connectivity.");
    }
    return false;
  }
}
