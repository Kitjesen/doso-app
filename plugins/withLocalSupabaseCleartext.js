const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const DOSO_ANDROID_BUILD_START = '// DOSO_ANDROID_RELEASE_GROUNDWORK_START';
const DOSO_ANDROID_BUILD_END = '// DOSO_ANDROID_RELEASE_GROUNDWORK_END';
const DOSO_PRODUCTION_AUTH_LINK_ORIGIN = 'https://links.dosorobotics.com';

function assertProductionAuthLinkOrigin(isProductionBuild, configuredOrigin) {
  if (isProductionBuild && configuredOrigin?.trim() !== DOSO_PRODUCTION_AUTH_LINK_ORIGIN) {
    throw new Error(
      `DOSO production builds require EXPO_PUBLIC_AUTH_LINK_ORIGIN=${DOSO_PRODUCTION_AUTH_LINK_ORIGIN}.`,
    );
  }
}

const dosoAndroidBuildBlock = [
  DOSO_ANDROID_BUILD_START,
  'def dosoProductionSigningEnv = [',
  "    keystorePath: System.getenv('DOSO_ANDROID_KEYSTORE_PATH'),",
  "    keystorePassword: System.getenv('DOSO_ANDROID_KEYSTORE_PASSWORD'),",
  "    keyAlias: System.getenv('DOSO_ANDROID_KEY_ALIAS'),",
  "    keyPassword: System.getenv('DOSO_ANDROID_KEY_PASSWORD'),",
  ']',
  'def dosoMissingProductionSigningEnv = dosoProductionSigningEnv.findAll { key, value -> !value }.keySet()',
  `def dosoRequiredProductionAuthLinkOrigin = '${DOSO_PRODUCTION_AUTH_LINK_ORIGIN}'`,
  "def dosoProductionAuthLinkOrigin = System.getenv('EXPO_PUBLIC_AUTH_LINK_ORIGIN')?.trim()",
  '',
  'android {',
  '    signingConfigs {',
  '        if (dosoMissingProductionSigningEnv.isEmpty()) {',
  '            production {',
  '                storeFile file(dosoProductionSigningEnv.keystorePath)',
  '                storePassword dosoProductionSigningEnv.keystorePassword',
  '                keyAlias dosoProductionSigningEnv.keyAlias',
  '                keyPassword dosoProductionSigningEnv.keyPassword',
  '            }',
  '        }',
  '    }',
  '    buildTypes {',
  '        qa {',
  '            initWith release',
  '            applicationIdSuffix ".qa"',
  '            versionNameSuffix "-qa"',
  '            signingConfig signingConfigs.debug',
  '            matchingFallbacks = ["release"]',
  '        }',
  '        release {',
  '            // Explicitly clear the generated debug signing fallback.',
  '            signingConfig dosoMissingProductionSigningEnv.isEmpty() ? signingConfigs.production : null',
  '        }',
  '    }',
  '}',
  '',
  'gradle.taskGraph.whenReady { graph ->',
  '    def hasReleaseTask = graph.allTasks.any { task ->',
  "        task.project == project && task.name ==~ /(?i)^(assemble|bundle|package|install|publish|upload).*release.*$/",
  '    }',
  '    if (hasReleaseTask && !dosoMissingProductionSigningEnv.isEmpty()) {',
  '        throw new GradleException(',
  '            "DOSO production signing is not configured. Set these non-public environment variables before a release build: " +',
  '            "DOSO_ANDROID_KEYSTORE_PATH, DOSO_ANDROID_KEYSTORE_PASSWORD, DOSO_ANDROID_KEY_ALIAS, DOSO_ANDROID_KEY_PASSWORD " +',
  '            "(missing: ${dosoMissingProductionSigningEnv.sort().join(\', \')})."',
  '        )',
  '    }',
  '    if (hasReleaseTask && dosoProductionAuthLinkOrigin != dosoRequiredProductionAuthLinkOrigin) {',
  '        throw new GradleException(',
  '            "DOSO production builds require EXPO_PUBLIC_AUTH_LINK_ORIGIN=${dosoRequiredProductionAuthLinkOrigin}."',
  '        )',
  '    }',
  '}',
  DOSO_ANDROID_BUILD_END,
].join('\n');

module.exports = function withLocalSupabaseCleartext(config) {
  assertProductionAuthLinkOrigin(
    process.env.EAS_BUILD_PROFILE?.trim() === 'production',
    process.env.EXPO_PUBLIC_AUTH_LINK_ORIGIN,
  );

  const manifestConfig = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application?.$) {
      throw new Error('DOSO config plugin could not find the Android application manifest node.');
    }

    const androidUrl = (
      process.env.EXPO_PUBLIC_SUPABASE_URL_ANDROID ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      ''
    ).trim();

    application.$['android:usesCleartextTraffic'] = androidUrl.startsWith('http://') ? 'true' : 'false';
    return modConfig;
  });

  return withAppBuildGradle(manifestConfig, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('DOSO Android release groundwork requires a Groovy app/build.gradle.');
    }

    const existingBlock = new RegExp(
      `${DOSO_ANDROID_BUILD_START}[\\s\\S]*?${DOSO_ANDROID_BUILD_END}\\n?`,
      'g',
    );
    const baseContents = modConfig.modResults.contents.replace(existingBlock, '').trimEnd();
    modConfig.modResults.contents = `${baseContents}\n\n${dosoAndroidBuildBlock}\n`;
    return modConfig;
  });
};

module.exports.assertProductionAuthLinkOrigin = assertProductionAuthLinkOrigin;
module.exports.DOSO_PRODUCTION_AUTH_LINK_ORIGIN = DOSO_PRODUCTION_AUTH_LINK_ORIGIN;
