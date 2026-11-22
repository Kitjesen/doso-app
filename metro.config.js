const { randomUUID } = require('node:crypto');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo skips --reset-cache in CI; production must not reuse inlined public config.
if (process.env.NODE_ENV === 'production') {
  config.cacheVersion = `${config.cacheVersion ?? '1'}-${randomUUID()}`;
}

module.exports = config;
