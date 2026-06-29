// ─── Imports MUST come first in ES modules (Hermes/EAS enforces this) ────────
import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import App from './App';

// ─── Suppress noisy non-critical warnings ─────────────────────────────────────
LogBox.ignoreLogs([
  'Android push notifications require a project ID',
  'remote notifications not supported',
  'expo-notifications: Android Push notifications',
  'functionality provided by expo-notifications was removed from Expo Go',
  'Could not reach Cloud Firestore backend',
  'The operation could not be completed',
  'code=unavailable',
  // New Architecture / Reanimated transition warnings
  'ReactImageView: Image source',
  'Non-serializable values were found in the navigation state',
  'nativeEventEmitter',
]);

// ─── Intercept Firestore offline drops — convert to clean logs (no red box) ───
const originalConsoleError = console.error;
console.error = (...args) => {
  let message = '';
  try {
    message = args
      .map(arg =>
        typeof arg === 'object' && arg !== null
          ? arg.message || String(arg)
          : String(arg)
      )
      .join(' ');
  } catch (e) {
    message = String(args);
  }

  if (
    message.includes('Could not reach Cloud Firestore backend') ||
    message.includes('code=unavailable') ||
    message.includes('The operation could not be completed')
  ) {
    console.log('[Firestore Offline Mode Sync Check]:', ...args);
    return;
  }
  originalConsoleError(...args);
};

// ─── Global unhandled promise rejection safety net ─────────────────────────
// Prevents unhandled async errors (Firebase, network) from triggering the
// EAS/Android "App has crashed" dialog. All errors are logged for debugging.
if (typeof global !== 'undefined') {
  const originalHandler = global.ErrorUtils?.getGlobalHandler?.();
  global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    console.log('[GlobalErrorHandler] Caught error:', error?.message, 'isFatal:', isFatal);
    // For non-fatal errors, log and suppress — avoid crashing to the OS dialog
    if (!isFatal && originalHandler) {
      originalHandler(error, isFatal);
    } else if (isFatal) {
      // Still pass fatal errors through so React's ErrorBoundary can catch them
      if (originalHandler) originalHandler(error, isFatal);
    }
  });
}

console.log('[DEBUG index.js] Root component registration starting...');

registerRootComponent(App);

