import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/AppText';
import { AuthEntryButton, AuthEntryField } from '../components/AuthEntry';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { useAppTheme } from '../theme';
import { checkBrainstemConnection, checkCloudConnection, ConnectionCheckError, type BrainstemSnapshot } from '../services/brainstemReadOnly';
import { presentBrainstemSnapshot } from '../services/brainstemPresentation';

export function ConnectionDiagnosticsScreen({ onBack }: { onBack: () => void }) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const [endpoint, setEndpoint] = useState(process.env.EXPO_PUBLIC_BRAINSTEM_BRIDGE_URL ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'cloud' | 'brainstem' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BrainstemSnapshot | null>(null);
  const endpointRef = useRef<TextInput | null>(null);
  const tokenRef = useRef<TextInput | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stop = () => { generation.current++; attempt.current?.abort(); attempt.current = null; };
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      stop(); setToken(''); setSnapshot(null); setBusy(null); setMessage('已暂停检查；诊断令牌未保存。');
    });
    return () => { stop(); sub.remove(); };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(() => { setSnapshot(null); setMessage('本次状态已过期，请重新检查。'); }, Math.max(0, Date.parse(snapshot.observedAt) + 15000 - Date.now()));
    return () => clearTimeout(timer);
  }, [snapshot]);
  const check = async (kind: 'cloud' | 'brainstem') => {
    if (attempt.current) return;
    const controller = new AbortController();
    attempt.current = controller;
    const id = ++generation.current;
    setBusy(kind); setMessage(null); setSnapshot(null);
    try {
      if (kind === 'cloud') {
        await checkCloudConnection({
          endpoint: (Platform.OS === 'android' ? process.env.EXPO_PUBLIC_SUPABASE_URL_ANDROID : undefined) || process.env.EXPO_PUBLIC_SUPABASE_URL || '',
          publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
          allowLocalHttp: __DEV__, signal: controller.signal,
        });
        if (generation.current === id) setMessage('认证服务可达；这不代表已完成登录或数据库验收。');
      } else {
        const result = await checkBrainstemConnection({ endpoint, token, requestId: randomUUID(), allowLocalHttp: __DEV__, signal: controller.signal });
        if (generation.current === id) { setSnapshot(result); setMessage('已收到 Brainstem 只读状态；未获取控制权。'); }
      }
    } catch (error) {
      if (generation.current === id) setMessage(error instanceof ConnectionCheckError ? error.message : '检查失败，请核对服务配置。');
    } finally {
      if (generation.current === id) { attempt.current = null; setBusy(null); }
    }
  };
  const copyStyle = { ...typography.supporting, color: p.secondary };
  const presentation = snapshot ? presentBrainstemSnapshot(snapshot) : null;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, gap: cardLayout.gap, maxWidth: 560, alignSelf: 'center', width: '100%' }}>
      <Pressable accessibilityRole="button" onPress={() => { stop(); onBack(); }} style={{ minHeight: 44, justifyContent: 'center' }} testID="connection-back"><Text style={{ ...typography.label, color: p.blueInk }}>返回</Text></Pressable>
      <Text accessibilityRole="header" style={{ ...typography.compactTitle, color: p.ink }}>连接诊断</Text>
      <Text style={copyStyle}>开发联调入口。只检查云服务和 Brainstem 状态，不绑定设备、不写入 Wi-Fi、不发送运动指令。</Text>
      <AuthEntryButton busy={busy !== null} loading={busy === 'cloud'} label="检查云端认证服务" onPress={() => void check('cloud')} testID="connection-cloud" />
      <View style={{ height: 4, backgroundColor: 'transparent' }} />
      <Text style={{ ...typography.label, color: p.ink }}>Brainstem 只读网关</Text>
      <Text style={copyStyle}>填写已部署的 HTTPS 网关地址，不是机器人 gRPC 的 13145 端口。诊断令牌仅保留在本页，离开后清除。</Text>
      <AuthEntryField label="网关地址" icon="person-outline" inputRef={endpointRef} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} value={endpoint} onChangeText={value => { setEndpoint(value); setSnapshot(null); setMessage(null); }} placeholder="https://你的网关地址" testID="connection-endpoint" />
      <AuthEntryField label="网关诊断令牌" icon="lock-closed-outline" inputRef={tokenRef} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" secure editable={!busy} value={token} onChangeText={value => { setToken(value); setSnapshot(null); setMessage(null); }} placeholder="不是 Supabase 密钥或账号密码" testID="connection-token" />
      <AuthEntryButton busy={busy !== null} loading={busy === 'brainstem'} label={busy === 'brainstem' ? '正在读取状态…' : '检查 Brainstem 连接'} onPress={() => void check('brainstem')} testID="connection-brainstem" />
      {busy ? <Pressable accessibilityRole="button" onPress={() => { stop(); setBusy(null); setMessage('检查已取消。'); }} style={{ minHeight: 44, justifyContent: 'center' }} testID="connection-cancel"><Text style={{ ...typography.label, color: p.blueInk }}>取消检查</Text></Pressable> : null}
      {message ? <Text selectable accessibilityLiveRegion="polite" style={copyStyle} testID="connection-result">{message}</Text> : null}
      {snapshot && presentation ? <View style={{ padding: cardLayout.inset, gap: 8, backgroundColor: p.surface, borderRadius: cardLayout.radius }} testID="connection-snapshot">
        <Text style={{ ...typography.label, color: p.ink }}>{presentation.scope}</Text>
        <Text selectable style={copyStyle}>状态：{presentation.state}</Text>
        <Text selectable style={copyStyle}>姿态切换：{presentation.transition}</Text>
        <Text selectable style={copyStyle}>控制来源：{presentation.owner}</Text>
        <Text selectable style={copyStyle}>电机输出：{snapshot.control.motorOutputEnabled ? '已使能' : '未使能'}</Text>
        <Text selectable style={copyStyle}>严重故障：{snapshot.control.criticalMotorFault ? '有' : '无'}</Text>
        <Text selectable style={copyStyle}>链路：{snapshot.transport}，{new Date(snapshot.observedAt).toLocaleTimeString()}</Text>
        <Text style={copyStyle}>{presentation.authority}</Text>
        <Text style={copyStyle}>仅为网关本次读取结果，不代表设备身份验证、运动安全或控制权限。</Text>
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}
