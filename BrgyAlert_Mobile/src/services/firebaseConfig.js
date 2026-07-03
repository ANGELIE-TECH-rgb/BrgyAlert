import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase config — values loaded from .env (EXPO_PUBLIC_* variables)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Guard against double-initialization (can happen on hot reload or if module
// is imported more than once — throws "Firebase App named '[DEFAULT]' already exists")
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth with AsyncStorage persistence.
// Guard: initializeAuth throws if auth was already initialized on the same app instance.
// Fall back to getAuth() in that case (already initialized = already has persistence).
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Auth already initialized — retrieve the existing instance
  auth = getAuth(app);
}

// Initialize Firestore with HTTP long polling instead of WebSocket (gRPC).
// Guard: initializeFirestore throws if already initialized on the same app.
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
} catch (e) {
  // Firestore already initialized — retrieve the existing instance
  db = getFirestore(app);
}

// Initialize Firebase Storage
const storage = getStorage(app);

export { app, auth, db, storage };
