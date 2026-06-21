import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

//firebase api key — values loaded from .env (EXPO_PUBLIC_* variables)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};


// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
// NOTE: Persistence (AsyncStorage) is set up asynchronously in AuthContext
// to avoid blocking the app startup (which caused the freeze at 100%).
const auth = getAuth(app);

// Initialize Firestore with HTTP long polling instead of WebSocket (gRPC).
// School/office WiFi networks often block WebSocket connections which causes
// Firestore writes/reads to hang or timeout. Long polling uses regular HTTP
// requests which always work through firewalls and proxies.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

// Initialize Firebase Storage
const storage = getStorage(app);

export { app, auth, db, storage };
