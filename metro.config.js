// Metro configuration for Expo
// We disable package "exports" resolution to avoid Metro picking ESM builds
// (e.g. zustand's `esm/*.mjs` which contains `import.meta.env`) for web bundles.
// Those ESM-only features can end up in a non-module script bundle and crash
// in the browser with: "Cannot use 'import.meta' outside a module".
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver = config.resolver ?? {};
// In Metro >=0.81 this flag controls "exports" field support.
// Turning it off forces classic resolution (main/react-native fields),
// which fixes packages that ship ESM with `import.meta.*`.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;

