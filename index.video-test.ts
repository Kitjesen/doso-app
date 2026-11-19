import { registerRootComponent } from 'expo';
import { createElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FontProvider } from './src/fonts/FontProvider';
import { VideoAcceptanceScreen } from './src/screens/VideoAcceptanceScreen';

function VideoAcceptance() {
  return createElement(SafeAreaProvider, null,
    createElement(FontProvider, null, createElement(VideoAcceptanceScreen)));
}

registerRootComponent(VideoAcceptance);
