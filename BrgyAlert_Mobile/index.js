import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  'Android push notifications require a project ID',
  'remote notifications not supported',
  'expo-notifications: Android Push notifications',
  'functionality provided by expo-notifications was removed from Expo Go',
  'Could not reach Cloud Firestore backend',
  'The operation could not be completed',
  'code=unavailable',
]);

// Intercept firestore connection drops and convert to clean console logs to avoid redbox
const originalConsoleError = console.error;
console.error = (...args) => {
  let message = '';
  try {
    message = args.map(arg => typeof arg === 'object' && arg !== null ? (arg.message || String(arg)) : String(arg)).join(' ');
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

console.log("[DEBUG index.js] Root component registration starting...");
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
