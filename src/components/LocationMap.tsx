import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Text } from './AppText';
import { MapBar } from './MapBar';
import { initialMapView, locationMapHtml, locationMapMessage, readMapView, type LocationMapProps, type MapMode } from './locationMapHtml';

const source = { html: locationMapHtml };
export function LocationMap(props: LocationMapProps) {
  const webview = useRef<WebView>(null);
  const [view, setView] = useState(initialMapView);
  const message = locationMapMessage(props);
  const send = (data: string) => webview.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(data)}}));true;`);
  useEffect(() => send(message), [message]);
  const choose = (mode: MapMode) => send(JSON.stringify({ type: 'doso-map-mode', mode }));
  return <View style={styles.container}>
    <MapBar view={view} isDark={props.isDark} onMode={choose} />
    <WebView ref={webview} source={source} style={styles.map} originWhitelist={['*']} onLoadEnd={() => send(message)} javaScriptEnabled
      onMessage={event => {
        let value: unknown;
        try { value = JSON.parse(event.nativeEvent.data); } catch { return; }
        const next = readMapView(value);
        if (next) setView(next);
      }}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      renderError={() => <Text>位置地图加载失败，请检查网络后重新展开。</Text>} />
  </View>;
}

const styles = StyleSheet.create({ container: { flex: 1, minHeight: 0, overflow: 'hidden' }, map: { flex: 1, minHeight: 0 } });
