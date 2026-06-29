const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v12 uses package.json "exports" field for sub-module resolution
// (e.g. firebase/auth, firebase/firestore). This flag MUST be enabled or Metro
// falls back to the legacy "main" field and loads the browser bundle instead of
// the React Native bundle, which crashes on native with "getReactNativePersistence is not a function".
config.resolver.unstable_enablePackageExports = true;

// 'react-native' MUST be listed first so native-specific exports are preferred
// over browser/node ones for all packages (Firebase, react-native-svg, etc.)
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'default'];

// Belt-and-suspenders: also set resolverMainFields so packages without exports
// still resolve native code first
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Keep .cjs extension support for Firebase modular SDK
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Ensure wasm files are blocked (not needed and can cause crashes in Hermes)
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');

module.exports = config;

