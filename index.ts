import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import './src/services/brainstemWebDevBridge';
import App from './App';
import { FontProvider } from './src/fonts/FontProvider';

function Root() {
  return createElement(FontProvider, null, createElement(App));
}

registerRootComponent(Root);
