const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package.json exports support so Metro resolves modern Firebase and react-native-svg packages correctly
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['require', 'default'];

config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;

