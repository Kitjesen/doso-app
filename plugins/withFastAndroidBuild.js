const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const GRADLE_PROPS = [
  ['org.gradle.jvmargs', '-Xmx2048m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8'],
  ['org.gradle.daemon', 'true'],
  ['org.gradle.parallel', 'true'],
  ['org.gradle.caching', 'true'],
  ['org.gradle.vfs.watch', 'true'],
  ['org.gradle.workers.max', '4'],
  ['kotlin.incremental', 'true'],
  ['kotlin.caching.enabled', 'true'],
  ['android.enablePngCrunchInReleaseBuilds', 'false'],
  ['reactNativeArchitectures', 'arm64-v8a'],
];

const PROJECT_LINT_MARKER = '// DOSO_FAST_BUILD_SUBPROJECT_LINT';
const PROJECT_LINT_BLOCK = `
${PROJECT_LINT_MARKER}
subprojects { sub ->
  sub.plugins.withId('com.android.library') {
    sub.android.lint {
      checkReleaseBuilds = false
      abortOnError = false
    }
  }
}
`;

const APP_QA_MARKER = '// DOSO_FAST_BUILD_QA_SPEEDUP';
const APP_QA_BLOCK = `
${APP_QA_MARKER}
android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
    buildTypes {
        qa {
            crunchPngs false
        }
    }
}
afterEvaluate {
    tasks.matching { it.name == 'createBundleQaJsAndAssets' }.configureEach { bundleTask ->
        bundleTask.hermesFlags.set(['-O'])
    }
}
`;

module.exports = function withFastAndroidBuild(config) {
  config = withGradleProperties(config, mod => {
    const items = mod.modResults;
    for (const [key, value] of GRADLE_PROPS) {
      const existing = items.find(item => item.type === 'property' && item.key === key);
      if (existing) {
        existing.value = value;
      } else {
        items.push({ type: 'property', key, value });
      }
    }
    return mod;
  });

  config = withProjectBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') return mod;
    if (!mod.modResults.contents.includes(PROJECT_LINT_MARKER)) {
      mod.modResults.contents += PROJECT_LINT_BLOCK;
    }
    return mod;
  });

  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') return mod;
    if (!mod.modResults.contents.includes(APP_QA_MARKER)) {
      mod.modResults.contents += APP_QA_BLOCK;
    }
    return mod;
  });

  return config;
};
