import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';

import { getSocialLoginReadiness, type SocialLoginProvider, type SocialLoginReadiness } from '../services/socialAuthService';

const providerLabels: Record<SocialLoginProvider, string> = { apple: 'Apple', wechat: '微信', qq: 'QQ' };
const providerIds: SocialLoginProvider[] = ['apple', 'wechat', 'qq'];

export function socialLoginExplanation(readiness: SocialLoginReadiness, hasAction: boolean) {
  if (!hasAction) return '当前为界面预览，不会发起账户授权。';
  if (readiness.ready) return '可以使用，点按上方图标后继续账户授权。';
  if (readiness.blockerCodes.includes('platform-unsupported')) return '这台设备不支持此登录方式。';
  if (readiness.blockerCodes.includes('feature-disabled')) return '当前版本尚未开放此登录方式。';
  if (readiness.blockerCodes.includes('redirect-uri-missing')) return '授权返回地址尚未配置完成。';
  if (readiness.blockerCodes.some(code => code.startsWith('provider-'))) return '此登录方式的服务配置尚未完成。';
  return readiness.blockerMessage ?? '此登录方式尚未就绪。';
}

// A synchronous guard protects even a retained onPress callback. The screen still
// owns authentication, errors, and cancellation; this hook never calls a service.
export function useSocialLoginAction({ busy, activeProvider, onPress }: {
  busy: boolean;
  activeProvider: SocialLoginProvider | null;
  onPress?: (provider: SocialLoginProvider) => void | Promise<void>;
}) {
  const [pendingProvider, setPendingProvider] = useState<SocialLoginProvider | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const current = useRef({ busy, onPress });
  current.current = { busy, onPress };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = async (provider: SocialLoginProvider) => {
    if (!mounted.current || current.current.busy || inFlight.current || !current.current.onPress || !getSocialLoginReadiness(provider).ready) return;
    inFlight.current = true;
    setPendingProvider(provider);
    try {
      await current.current.onPress(provider);
    } finally {
      inFlight.current = false;
      if (mounted.current) setPendingProvider(null);
    }
  };
  return { busy: busy || pendingProvider !== null, activeProvider: pendingProvider ?? activeProvider, run };
}

export function SocialLoginFeedback({ hasAction, busy, activeProvider, palette, testID = 'social-login-help' }: {
  hasAction: boolean;
  busy: boolean;
  activeProvider: SocialLoginProvider | null;
  palette: { accent: string; border: string; ink: string; secondary: string; surface: string };
  testID?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const authorizationPending = hasAction && busy && activeProvider !== null && getSocialLoginReadiness(activeProvider).ready;
  return <View style={styles.section}>
    {authorizationPending ? <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: palette.accent }]} testID={`${testID}-progress`}>{`正在打开 ${providerLabels[activeProvider]} 授权…`}</Text> : null}
    <Pressable accessibilityLabel="登录方式说明" accessibilityRole="button" accessibilityHint={expanded ? '收起各登录方式的说明' : '展开查看各登录方式的状态，也可继续使用上方邮箱表单'} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]} testID={testID}>
      <Ionicons accessible={false} color={palette.secondary} name="information-circle-outline" size={17} />
      <Text style={[styles.toggleLabel, { color: palette.secondary }]}>登录方式说明</Text>
      <Ionicons accessible={false} color={palette.secondary} name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
    </Pressable>
    {expanded ? <View style={[styles.details, { backgroundColor: palette.surface, borderColor: palette.border }]} testID={`${testID}-details`}>
      {providerIds.map(provider => <View key={provider} style={styles.reason}>
        <Text style={[styles.provider, { color: palette.ink }]}>{providerLabels[provider]}</Text>
        <Text selectable style={[styles.description, { color: palette.secondary }]}>{socialLoginExplanation(getSocialLoginReadiness(provider), hasAction)}</Text>
      </View>)}
      <Text selectable style={[styles.alternative, { color: palette.ink, borderTopColor: palette.border }]}>也可以使用上方的邮箱表单继续，无需第三方账户。</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { alignSelf: 'stretch', marginTop: 4 },
  toggle: { alignSelf: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' },
  toggleLabel: { fontSize: 13, lineHeight: 20 },
  details: { borderRadius: 24, padding: 16, gap: 12 },
  reason: { gap: 3 },
  provider: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  description: { fontSize: 13, lineHeight: 20 },
  alternative: { fontSize: 13, lineHeight: 20, paddingTop: 12 },
  progress: { fontSize: 13, lineHeight: 20, textAlign: 'center', paddingTop: 8 },
  pressed: { opacity: 0.65 },
});
