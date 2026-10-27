import { registerRootComponent } from 'expo';
import { createElement, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import { AuthProvider } from './src/auth';
import { DesignQaRoot, isDesignQaRequested } from './src/design-qa';
import { FontProvider } from './src/fonts/FontProvider';
import { ConnectionDiagnosticsScreen } from './src/screens/ConnectionDiagnosticsScreen';
import { BrainstemSimulationScreen } from './src/screens/BrainstemSimulationScreen';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
function Root() {
  return createElement(AuthProvider, null, createElement(App));
}

const webDesignQaSearch = Platform.OS === 'web' && typeof window !== 'undefined'
  ? window.location.search
  : null;
const nativeDesignQaEnabled = Platform.OS !== 'web'
  && process.env.EXPO_PUBLIC_DESIGN_QA === '1'
  && Boolean(process.env.EXPO_PUBLIC_DESIGN_QA_STAGE);
const nativeDesignQaSearch = nativeDesignQaEnabled
  ? `?design-qa=1&qa-stage=${encodeURIComponent(process.env.EXPO_PUBLIC_DESIGN_QA_STAGE ?? '')}&qa-state=${encodeURIComponent(process.env.EXPO_PUBLIC_DESIGN_QA_STATE ?? 'default')}${process.env.EXPO_PUBLIC_DESIGN_QA_BROWSE === '1' ? '&qa-browse=1' : ''}`
  : null;
const designQaSearch = webDesignQaSearch && isDesignQaRequested(webDesignQaSearch)
  ? webDesignQaSearch
  : nativeDesignQaSearch;
const useDesignQa = __DEV__ && designQaSearch !== null;
// Separate from Design QA: this explicitly requested development tool may perform
// only user-triggered, read-only checks. The existing QA entry remains offline.
const useConnectionDiagnostics = __DEV__ && !useDesignQa && (
  (Platform.OS === 'web' && new URLSearchParams(webDesignQaSearch ?? '').get('connection-check') === '1')
  || (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_CONNECTION_DIAGNOSTICS === '1')
);

const useBrainstemSimulation = __DEV__ && !useDesignQa && !useConnectionDiagnostics && (
  (Platform.OS === 'web' && new URLSearchParams(webDesignQaSearch ?? '').get('local-simulation') === '1')
  || (Platform.OS !== 'web' && process.env.EXPO_PUBLIC_BRAINSTEM_SIMULATION === '1')
);

function BrainstemSimulationEntry() {
  const [open, setOpen] = useState(true);
  return open
    ? createElement(SafeAreaProvider, null, createElement(BrainstemSimulationScreen, { onBack: () => setOpen(false) }))
    : createElement(Root);
}

function ConnectionDiagnosticsEntry() {
  const [open, setOpen] = useState(true);
  return open
    ? createElement(SafeAreaProvider, null, createElement(ConnectionDiagnosticsScreen, { onBack: () => setOpen(false) }))
    : createElement(Root);
}

function DesignQaEntry() {
  return createElement(DesignQaRoot, {
    hideDisclosure: Platform.OS !== 'web' && process.env.EXPO_PUBLIC_DESIGN_QA_CAPTURE === '1',
    search: designQaSearch ?? '',
  });
}

function FontReadyEntry() {
  return createElement(FontProvider, null, createElement(useBrainstemSimulation ? BrainstemSimulationEntry : useDesignQa ? DesignQaEntry : useConnectionDiagnostics ? ConnectionDiagnosticsEntry : Root));
}

registerRootComponent(FontReadyEntry);
