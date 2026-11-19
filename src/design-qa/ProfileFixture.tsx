import { useState, type ComponentProps } from 'react';
import { ProfileHub } from '../screens/ProfileScreen';
import type { Device } from '../types/api';

// Device records are confined to the design viewer, never account inventory.
const devices: Device[] = [1, 2].map(number => ({
  id: 'qa-thunder-' + number, owner_id: null, model_code: 'THUNDER', display_name: 'THUNDER 0' + number,
  category: '四足', environment: '室外', serial_number: null, connection_status: number === 1 ? 'online' : 'offline',
  safety_lock: false, alerts_enabled: true, battery_percent: number === 1 ? 86 : null,
  firmware_version: null, runtime_hours: 0, last_seen_at: null, is_demo: true,
  created_at: '2026-11-11T06:32:00Z', updated_at: '2026-11-11T06:32:00Z',
}));

export function ProfileFixture(props: ComponentProps<typeof ProfileHub>) {
  const [selected, setSelected] = useState(devices[0].id);
  const [alerts, setAlerts] = useState(true);
  const device = devices.find(item => item.id === selected) ?? devices[0];
  return <ProfileHub {...props} devices={devices} selectedDeviceId={selected} onSelectDevice={setSelected}
    connected={device.connection_status === 'online'} deviceName={device.display_name} deviceId={device.id}
    batteryPercent={device.battery_percent} alertsEnabled={alerts} onToggleAlerts={() => setAlerts(value => !value)} />;
}
