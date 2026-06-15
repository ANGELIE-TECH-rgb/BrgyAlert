import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAnalytics } from "firebase/analytics";

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

// Initialize Firebase Auth with React Native persistence to keep users logged in
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

// Initialize Firestore Database
const db = getFirestore(app);

// Initialize Firebase Storage
const storage = getStorage(app);
const analytics = getAnalytics(app);
export { app, auth, db, storage };
