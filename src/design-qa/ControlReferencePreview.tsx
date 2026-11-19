import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { ControlScreen } from '../screens/ControlScreen';
import { RobotConnectionScreen } from '../screens/RobotConnectionScreen';
import { G20InputPanel } from '../components/G20InputPanel';
import { images } from '../assets';
import { createRobotDiagnosticsGateway } from '../features/robot-lifecycle/robotDiagnosticsGateway';

const gateway = createRobotDiagnosticsGateway({ nowMs: () => 0 });
const noop = () => undefined;

// This fixture is reachable only through the isolated design-QA entry, never production.
export function ControlReferencePreview({ onBack, initialPage = 'control' }: { onBack: () => void; initialPage?: 'control' | 'connection' | 'input' }) {
  const [page, setPage] = useState(initialPage);
  const [posture, setPosture] = useState<'standing' | 'sitting'>('standing');
  const [motor, setMotor] = useState<'enabled' | 'disabled'>('disabled');
  const [held, setHeld] = useState(true);
  const [policy, setPolicy] = useState('flat');
  const previewMedia = { presentation: { id: 'design-reference-only', phase: 'receiving' as const }, surface: <Image source={require('./assets/control-quarry.png')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />, active: true, onInterrupted: noop };
  if (page === 'connection') return <RobotConnectionScreen media={previewMedia} readOnlyPreview onBack={() => setPage('control')} />;
  if (page === 'input') return <G20InputPanel media={previewMedia}
    state={{ available: false, reading: false, status: 'unavailable', message: null, sample: null, axes: {}, buttons: {}, calibrating: false, calibrated: false, vector: null }}
    source="touch" onSourceChange={noop} onStart={noop} onStop={noop} onBeginCalibration={noop} onFinishCalibration={noop}
    onLearnAxis={noop} onLearnButton={noop} onClearCalibration={noop} onClose={() => setPage('control')} />;
  return <ControlScreen allowInteractionPreview batteryPercent={78} canUseManualControl={false}
    canUseRouteMode={false} canUseTaskMode={false} connected diagnosticsDeviceClass="physical"
    diagnosticsGateway={gateway} robotImage={images.thunderHero} robotName="THUNDER-01" robotType="设计预览"
    onBack={onBack} onOpenConnection={() => setPage('connection')}
    directConnection={{ endpointLabel: '192.168.66.64:13145', fresh: true, summary: '设计预览' }}
    controlSession={{ label: held ? '本设备持有控制权' : '未持有控制权', canAcquire: !held, leaseActive: held, busy: false,
      onAcquire: () => setHeld(true), onRelease: () => setHeld(false) }}
    video={previewMedia.presentation}
    videoSurface={previewMedia.surface}
    runtimeState={{ controlLink: 'connected', posture, motorState: motor, controlOwner: held ? 'this-device' : 'none', controlAuthority: held ? 'held' : 'not-held',
      speed: { source: 'device', linearMps: 1.2, lateralMps: 0, yawRps: 0 },
      signal: { source: 'controller', rssiDbm: -42 }, policyCatalogStatus: 'synced',
      currentPolicy: { id: policy, label: policy === 'flat' ? '平地' : policy === 'stairs' ? '楼梯' : '高台' }, policyOptions: [{ id: 'flat', label: '平地' }, { id: 'stairs', label: '楼梯' }, { id: 'platform', label: '高台' }] }}
    operationReadiness={{ stand: { ready: true }, sit: { ready: true }, stop: { ready: held }, enableMotor: { ready: true }, disableMotor: { ready: true }, switchPolicy: { ready: true } }}
    operationCallbacks={{ stand: async () => setPosture('standing'), sit: async () => setPosture('sitting'),
      stop: async () => setHeld(false), enableMotor: async () => setMotor('enabled'), disableMotor: async () => setMotor('disabled'), switchPolicy: async id => setPolicy(id) }}

  />;
}
