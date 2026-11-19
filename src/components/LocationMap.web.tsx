import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MapBar } from './MapBar';
import { initialMapView, locationMapHtml, locationMapMessage, readMapView, type LocationMapProps, type MapMode } from './locationMapHtml';

export function LocationMap(props: LocationMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [view, setView] = useState(initialMapView);
  const message = locationMapMessage(props);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const next = readMapView(event.data);
      if (next) setView(next);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => { frame.current?.contentWindow?.postMessage(message, '*'); }, [message]);
  const choose = (mode: MapMode) => frame.current?.contentWindow?.postMessage({ type: 'doso-map-mode', mode }, '*');
  return <View style={styles.container}>
    <MapBar view={view} isDark={props.isDark} onMode={choose} />
    <iframe ref={frame} title="机器狗 GPS 跟随与历史轨迹地图" srcDoc={locationMapHtml} sandbox="allow-scripts"
      referrerPolicy="no-referrer" onLoad={() => frame.current?.contentWindow?.postMessage(message, '*')}
      style={{ display: 'block', width: '100%', flex: 1, minHeight: 0, border: 0 }} />
  </View>;
}

const styles = StyleSheet.create({ container: { flex: 1, minHeight: 0, overflow: 'hidden' } });
