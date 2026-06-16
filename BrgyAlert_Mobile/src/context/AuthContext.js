import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  getReactNativePersistence,
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
let GoogleSignin = null;
let statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

try {
  const GoogleModule = require('@react-native-google-signin/google-signin');
  GoogleSignin = GoogleModule.GoogleSignin;
  if (GoogleModule.statusCodes) {
    statusCodes = GoogleModule.statusCodes;
  }

  GoogleSignin.configure({
    webClientId: '82872757022-hbefa8qpqid2pnc9lrocqp64p0hnuags.apps.googleusercontent.com',
    offlineAccess: false,
  });
} catch (error) {
  console.warn('[AuthContext] Native GoogleSignin module is not available in current runtime environment.', error.message);
}

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // ─── Native Google Sign-In ──────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!GoogleSignin) {
      Alert.alert(
        'Expo Go Limitation',
        'Native Google Sign-In is not supported inside standard Expo Go. To test the real Google Sign-In flow, you must build a custom Development Client (using EAS Build or locally using Android SDK).'
      );
      return;
    }
    setLoading(true);
    try {
      console.log('[AuthContext] Checking Google Play Services...');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      console.log('[AuthContext] Triggering native Google Sign-in...');
      const signInResult = await GoogleSignin.signIn();

      // Handle different versions of the Google Sign-in payload structure
      let idToken = signInResult.idToken;
      if (!idToken && signInResult.data) {
        idToken = signInResult.data.idToken;
      }

      if (!idToken) {
        throw new Error('Google Sign-in was completed but did not return an ID token.');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      console.log('[AuthContext] Logging in with Google credential to Firebase...');
      const userCredential = await signInWithCredential(auth, credential);
      const firebaseUser = userCredential.user;
      const uid = firebaseUser.uid;

      // Check if user has a profile in Firestore
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log('[AuthContext] Creating new Firestore profile for Google user:', uid);
        const profileData = {
          uid,
          email: firebaseUser.email ? firebaseUser.email.toLowerCase() : '',
          fullName: firebaseUser.displayName || 'Google User',
          dob: '',
          phoneNumber: '',
          gender: '',
          role: 'citizen',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, profileData);
        setUserProfile(profileData);
      } else {
        console.log('[AuthContext] Existing profile found for Google user:', uid);
        setUserProfile(userDoc.data());
      }

      setUser(firebaseUser);
      subscribeToUserProfile(uid);
    } catch (error) {
      console.error('[AuthContext] Firebase Google login error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('[AuthContext] Google Sign-in cancelled by user');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('[AuthContext] Google Sign-in is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services', 'Google Play Services are not available or outdated.');
      } else {
        Alert.alert('Google Login Error', error.message || 'Failed to authenticate with Firebase.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Ref flags for registration race condition prevention
  const isRegisteringRef = React.useRef(false);
  const justRegisteredRef = React.useRef(false);

  // Holds the Firestore onSnapshot unsubscribe function for the user profile.
  // This keeps the profile in sync in real-time — if an admin changes the
  // user's role in Firebase Console, the app updates instantly.
  const profileListenerRef = React.useRef(null);

  // ─── Real-time profile listener ────────────────────────────────────────────
  // Replaces one-time getDoc with onSnapshot so any Firestore change
  // (role, name, etc.) is reflected in the app immediately.
  const subscribeToUserProfile = (uid) => {
    // Unsubscribe from any previous listener first
    if (profileListenerRef.current) {
      profileListenerRef.current();
      profileListenerRef.current = null;
    }

    console.log('[AuthContext] Subscribing to real-time profile for UID:', uid);
    const userDocRef = doc(db, 'users', uid);

    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          console.log('[AuthContext] Profile updated from Firestore:', docSnapshot.data().role);
          setUserProfile(docSnapshot.data());
        } else {
          console.warn('[AuthContext] No Firestore profile found for UID:', uid);
          setUserProfile(null);
        }
      },
      (error) => {
        // Network errors are non-fatal — the last known profile stays in state
        console.warn('[AuthContext] Profile listener error:', error.message);
      }
    );

    profileListenerRef.current = unsubscribe;
  };

  // Unsubscribe from profile listener (called on logout)
  const unsubscribeFromProfile = () => {
    if (profileListenerRef.current) {
      profileListenerRef.current();
      profileListenerRef.current = null;
      console.log('[AuthContext] Unsubscribed from profile listener.');
    }
  };

  // ─── Auth state monitor ────────────────────────────────────────────────────
  useEffect(() => {
    // Set up AsyncStorage persistence NON-BLOCKING (avoids startup freeze)
    setPersistence(auth, getReactNativePersistence(AsyncStorage))
      .then(() => console.log('[AuthContext] AsyncStorage persistence ready.'))
      .catch(e => console.warn('[AuthContext] Persistence setup error:', e.message));

    // Safety net: if onAuthStateChanged never fires within 10s, unblock the UI
    const safetyTimeout = setTimeout(() => {
      console.warn('[AuthContext] Safety timeout — forcing loading=false');
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(safetyTimeout);
      console.log('[AuthContext] onAuthStateChanged:', firebaseUser?.email ?? 'null');

      // Skip while register() is running — it sets state directly
      if (isRegisteringRef.current) {
        console.log('[AuthContext] Skipping: registration in progress.');
        setLoading(false);
        return;
      }

      // Skip the first post-registration fire — profile already in state
      if (justRegisteredRef.current) {
        console.log('[AuthContext] Skipping: just registered, profile already set.');
        justRegisteredRef.current = false;
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        // Start real-time listener — profile updates (incl. role changes)
        // will automatically flow into the app without re-login
        subscribeToUserProfile(firebaseUser.uid);
      } else {
        setUser(null);
        setUserProfile(null);
        unsubscribeFromProfile();
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
      unsubscribeFromProfile();
    };
  }, []);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const login = async (email, password) => {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      // Real-time listener will populate userProfile automatically
      subscribeToUserProfile(userCredential.user.uid);
      return userCredential.user;
    } catch (error) {
      console.log('Login error:', error.code, error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // ─── Register ──────────────────────────────────────────────────────────────
  const register = async (email, password, fullName, dob, phoneNumber, gender, role) => {
    isRegisteringRef.current = true;
    setLoading(true);
    try {
      // Step 1: Create Firebase Auth account or heal missing Firestore profile
      let firebaseUser;
      let isExistingUser = false;

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log('[AuthContext] User already exists in Auth. Checking if Firestore profile is missing...');
          // Attempt login with the password provided to authenticate
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          firebaseUser = userCredential.user;
          isExistingUser = true;
        } else {
          throw authError;
        }
      }

      const uid = firebaseUser.uid;

      // If user existed in Auth, check if they already have a profile in Firestore
      if (isExistingUser) {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          // Profile exists, so this is a legitimate "email already in use" case.
          throw { code: 'auth/email-already-in-use', message: 'This email is already registered.' };
        }
        console.log('[AuthContext] Profile is missing in Firestore for existing user. Proceeding to create profile...');
      }

      // Step 2: Prepare profile data
      const profileData = {
        uid,
        email: email.toLowerCase(),
        fullName,
        dob: dob || '',
        phoneNumber: phoneNumber || '',
        gender: gender || '',
        role: role || 'citizen',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Step 3: Write user profile to Firestore with timing-propagation retry logic.
      // Firestore rules require authentication. However, there can be a brief delay
      // between createUserWithEmailAndPassword/signInWithEmailAndPassword resolving and
      // the Firestore client receiving the updated auth token.
      let retries = 3;
      let writeSuccess = false;
      let lastError = null;

      while (retries > 0 && !writeSuccess) {
        try {
          console.log(`[AuthContext] Writing profile to Firestore (Attempts left: ${retries})...`);

          // Wrap setDoc with a timeout — if Firestore is unreachable (e.g. network
          // blocked), fail after 15s with a clear error instead of hanging forever.
          const writeTimeout = new Promise((_, reject) =>
            setTimeout(() => reject({ code: 'firestore/write-timeout', message: 'Could not save your profile. Please check your internet connection and try again.' }), 15000)
          );

          await Promise.race([
            setDoc(doc(db, 'users', uid), profileData),
            writeTimeout,
          ]);

          writeSuccess = true;
          console.log('[AuthContext] Profile saved to Firestore for UID:', uid);
        } catch (error) {
          lastError = error;
          console.warn(`[AuthContext] Profile write attempt failed:`, error.code || error.message);

          if ((error.code === 'permission-denied' || error.message?.includes('permission')) && retries > 1) {
            retries--;
            console.log('[AuthContext] Got permission-denied. Forcing token refresh and waiting 1s for propagation...');
            try {
              await firebaseUser.getIdToken(false);
            } catch (tokenErr) {
              console.warn('[AuthContext] Error getting ID token:', tokenErr.message);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw error;
          }
        }
      }

      // Step 4: Set state and start real-time listener
      setUser(firebaseUser);
      setUserProfile(profileData);
      justRegisteredRef.current = true;

      // Start listening for real-time profile updates
      subscribeToUserProfile(uid);

      return firebaseUser;
    } catch (error) {
      console.error('Registration error:', error.code, error.message);
      throw error;
    } finally {
      isRegisteringRef.current = false;
      setLoading(false);
    }
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    setLoading(true);
    try {
      unsubscribeFromProfile(); // Stop listening before signing out
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      justRegisteredRef.current = false;
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // ─── Update User Role ──────────────────────────────────────────────────────
  // Changes a user's role in Firestore. The real-time listener will
  // automatically push the change to the app — no re-login needed.
  const updateUserRole = async (targetUid, newRole) => {
    try {
      const validRoles = ['citizen', 'responder', 'admin'];
      if (!validRoles.includes(newRole)) {
        throw new Error(`Invalid role: "${newRole}". Must be: ${validRoles.join(', ')}`);
      }
      await updateDoc(doc(db, 'users', targetUid), {
        role: newRole,
        updatedAt: serverTimestamp(),
      });
      console.log(`[AuthContext] Role updated to "${newRole}" for UID:`, targetUid);
    } catch (error) {
      console.error('updateUserRole error:', error);
      throw error;
    }
  };

  // ─── Password Reset ────────────────────────────────────────────────────────
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
      login,
      register,
      logout,
      resetPassword,
      updateUserRole,
      loginWithGoogle
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
