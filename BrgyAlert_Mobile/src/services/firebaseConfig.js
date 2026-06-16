import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

//firebase api key
const firebaseConfig = {
  apiKey: "AIzaSyDG61e0PX-imPGW_msoq3Cn7FcRzKZ5QRE",
  authDomain: "brgyalert-74b2f.firebaseapp.com",
  projectId: "brgyalert-74b2f",
  storageBucket: "brgyalert-74b2f.firebasestorage.app",
  messagingSenderId: "82872757022",
  appId: "1:82872757022:web:45e13a64eea8bac587b70f",
  measurementId: "G-RD88HC5TEN"
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
