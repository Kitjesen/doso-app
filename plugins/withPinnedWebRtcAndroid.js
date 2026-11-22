const { withProjectBuildGradle } = require('expo/config-plugins');

const marker = "configurations.configureEach { resolutionStrategy.force 'org.jitsi:webrtc:155.0.1' }";

module.exports = function withPinnedWebRtcAndroid(config) {
  return withProjectBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('DOSO WebRTC requires Groovy build configuration.');
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `\nallprojects { ${marker} }\n`;
    return mod;
  });
};
