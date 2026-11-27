import { getSupabaseClient, isSupabaseConfigured, supabaseConfig } from './supabaseClient';
import {
  callFirmwareOtaEndpoint,
  type CloudOtaDevice,
  type CloudOtaInspectResult,
  type CloudOtaJob,
} from './firmwareOtaCore';

export * from './firmwareOtaCore';

export interface FirmwareOtaRequestOptions {
  accessToken?: string;
  baseUrl?: string;
  publishableKey?: string;
  fetchImpl?: typeof fetch;
}

async function resolveTransport(options?: FirmwareOtaRequestOptions) {
  const baseUrl = options?.baseUrl ?? supabaseConfig.url ?? '';
  const publishableKey = options?.publishableKey ?? supabaseConfig.publishableKey ?? '';
  let accessToken = options?.accessToken;
  if (!accessToken) {
    if (!isSupabaseConfigured) {
      throw new Error('未连接云服务');
    }
    const { data } = await getSupabaseClient().auth.getSession();
    accessToken = data.session?.access_token;
  }
  if (!accessToken) {
    throw new Error('请先登录账号');
  }
  return {
    accessToken,
    baseUrl,
    publishableKey,
    fetchImpl: options?.fetchImpl,
  };
}

export async function listOtaDevices(
  options?: FirmwareOtaRequestOptions,
): Promise<{ isAdmin: boolean; devices: CloudOtaDevice[] }> {
  return await callFirmwareOtaEndpoint({ action: 'devices' }, await resolveTransport(options));
}

export async function inspectFirmwareOta(
  deviceId: string,
  options?: FirmwareOtaRequestOptions,
): Promise<CloudOtaInspectResult> {
  return await callFirmwareOtaEndpoint(
    { action: 'inspect', deviceId },
    await resolveTransport(options),
  );
}

export async function startFirmwareOtaJob(
  deviceId: string,
  releaseId: string,
  idempotencyKey: string,
  options?: FirmwareOtaRequestOptions,
): Promise<{ job: CloudOtaJob }> {
  return await callFirmwareOtaEndpoint(
    { action: 'start', deviceId, releaseId, idempotencyKey },
    await resolveTransport(options),
  );
}

export async function readFirmwareOtaJob(
  deviceId: string,
  jobId: string,
  options?: FirmwareOtaRequestOptions,
): Promise<{ job: CloudOtaJob }> {
  return await callFirmwareOtaEndpoint(
    { action: 'job', deviceId, jobId },
    await resolveTransport(options),
  );
}

export async function cancelFirmwareOtaJob(
  deviceId: string,
  jobId: string,
  options?: FirmwareOtaRequestOptions,
): Promise<{ job: CloudOtaJob }> {
  return await callFirmwareOtaEndpoint(
    { action: 'cancel', deviceId, jobId },
    await resolveTransport(options),
  );
}
