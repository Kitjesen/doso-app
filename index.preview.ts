import { registerRootComponent } from 'expo';
import { createElement } from 'react';
import { DesignQaRoot } from './src/design-qa/DesignQaRoot';
import { FontProvider } from './src/fonts/FontProvider';

// Only isolated preview builds select this entry: Android `preview` or the
// unsigned iOS `ios-browser-preview` profile. No AuthProvider or backend writes.
// Production index.ts and its __DEV__ guard are deliberately unchanged.
function OfflinePreview() {
  return createElement(FontProvider, null, createElement(DesignQaRoot, {
    search: '?design-qa=1&qa-browse=1&qa-stage=main-home&qa-theme=light',
  }));
}

registerRootComponent(OfflinePreview);
