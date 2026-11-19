import { requireOptionalNativeModule } from 'expo';
import { requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import { Platform, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';

import { Text } from './AppText';
import { validateLingtuOrigin } from '../services/lingtuReadOnly';

export type PointCloudStatus = Readonly<{ status: string; message: string; points: number }>;
type Props = ViewProps & Readonly<{
  endpoint: string;
  kind: 1 | 2;
  active: boolean;
  onStatus?: (event: NativeSyntheticEvent<PointCloudStatus>) => void;
}>;

let NativeView: ComponentType<Props> | null = null;
try {
  if (Platform.OS === 'android' && requireOptionalNativeModule('DosoPointCloud')) {
    NativeView = requireNativeViewManager<Props>('DosoPointCloud');
  }
} catch { /* Older APKs do not contain this view. */ }

export function pointCloudEndpoint(webOrigin: string, allowLocalHttp = false): string {
  const endpoint = new URL(validateLingtuOrigin(webOrigin, allowLocalHttp));
  endpoint.port = '5052';
  return endpoint.origin;
}

export function PointCloudView(props: Props) {
  if (!NativeView) return <View style={[{ alignItems: 'center', justifyContent: 'center', padding: 24 }, props.style]}
    testID="point-cloud-unavailable">
    <Text>当前版本不支持原生点云，请安装包含点云模块的 Android App。</Text>
  </View>;
  return <NativeView {...props} />;
}
