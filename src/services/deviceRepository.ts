import type { Device, DeviceSettingsUpdate } from '../types/api';
import { runAuthSessionOperation } from './authSessionOperation';
import { runDeviceDataQuery } from './deviceDataQuery';
import { getSupabaseClient } from './supabaseClient';
export { beginDeviceEnrollment } from './deviceEnrollmentService';
export type { DeviceEnrollmentSession } from './deviceEnrollmentService';

async function requireUserId() {
  return runAuthSessionOperation(async () => {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('需要登录后才能访问设备。');
    return data.user.id;
  }, { kind: 'session-read' });
}

export async function listDevices(): Promise<Device[]> {
  const ownerId = await requireUserId();
  return runDeviceDataQuery<Device[]>(ownerId, client => client
    .from('devices')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_demo', false)
    .order('created_at', { ascending: true }));
}

export async function updateDeviceSettings(
  deviceId: string,
  settings: DeviceSettingsUpdate,
): Promise<Device> {
  const ownerId = await requireUserId();
  return runDeviceDataQuery<Device>(ownerId, client => client
    .from('devices')
    .update(settings)
    .eq('id', deviceId)
    .eq('owner_id', ownerId)
    .select('*')
    .single());
}

type DeviceBindingResponse = {
  device?: Device;
  deviceId?: string;
  unbound?: boolean;
  error?: string | { code?: string; message?: string };
  message?: string;
};

type DeviceBindingRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

function bindingErrorMessage(payload: Pick<DeviceBindingResponse, 'error' | 'message'>) {
  if (typeof payload.error === 'string') return payload.message ?? payload.error;
  if (payload.error && typeof payload.error === 'object') {
    return [payload.error.code, payload.error.message].filter(Boolean).join(': ') || '设备绑定请求失败。';
  }
  return payload.message ?? null;
}

async function invokeDeviceBinding(
  body: Record<string, string>,
  options: DeviceBindingRequestOptions = {},
): Promise<DeviceBindingResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<DeviceBindingResponse>(
    'device-binding',
    { body, signal: options.signal, timeout: options.timeoutMs },
  );
  if (error) {
    let message = error.message;
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as DeviceBindingResponse;
        message = bindingErrorMessage(payload) ?? message;
      } catch {
        // Preserve the SDK error if the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (!data) throw new Error('设备绑定服务没有返回结果。');
  const responseError = bindingErrorMessage(data);
  if (responseError) throw new Error(responseError);
  return data;
}

export async function claimDevice(
  serialNumber: string,
  code: string,
  options: DeviceBindingRequestOptions = {},
): Promise<Device> {
  const response = await invokeDeviceBinding({
    action: 'claim',
    serialNumber: serialNumber.trim().toUpperCase(),
    code: code.trim(),
  }, options);
  if (!response.device) throw new Error('设备绑定服务没有返回设备资料。');
  return response.device;
}

export async function unbindDevice(deviceId: string, reason = 'user_request') {
  const response = await invokeDeviceBinding({
    action: 'unbind',
    deviceId,
    reason: reason.trim() || 'user_request',
  });
  if (!response.unbound) throw new Error('设备解绑没有完成。');
}

export const deviceRepository = {
  list: listDevices,
  claim: claimDevice,
  unbind: unbindDevice,
  updateSettings: updateDeviceSettings,
};
