import { LogBox } from 'react-native';
LogBox.ignoreLogs([
  'Android push notifications require a project ID',
  'remote notifications not supported',
  'expo-notifications: Android Push notifications',
  'functionality provided by expo-notifications was removed from Expo Go',
]);

console.log("[DEBUG index.js] Root component registration starting...");
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
