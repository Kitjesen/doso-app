const { createHash } = require('node:crypto');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep Metro transform cache warm across repeated builds while still
// invalidating automatically whenever any EXPO_PUBLIC_* config changes.
if (process.env.NODE_ENV === 'production') {
  const publicEnv = Object.keys(process.env)
    .filter((key) => key.startsWith('EXPO_PUBLIC_'))
    .sort()
    .map((key) => `${key}=${process.env[key] ?? ''}`)
    .join('\n');
  const envHash = createHash('sha256').update(publicEnv).digest('hex').slice(0, 12);
  config.cacheVersion = `${config.cacheVersion ?? '1'}-prod-${envHash}`;
}

module.exports = config;
