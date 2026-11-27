import type { authenticate } from "../_shared/auth.ts";
import { handle, HttpError, json } from "../_shared/http.ts";
import { readBoundedJson, record, uuid } from "../remote-state/handler.ts";

export interface OtaReleaseSummary {
  releaseId: string;
  version: string;
  sequence: number;
  channel: string;
  model: string;
  hardwareRevision: string;
  artifactSizeBytes: number;
  artifactSha256: string;
  artifactType: string;
  policySlot?: string;
  component?: string;
  adminOnly?: boolean;
}

type Dependencies = {
  authenticate: typeof authenticate;
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
};

const ADMIN_ONLY_COMPONENTS = new Set(["fw-esp32", "fw-bms", "ota"]);
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function isAdminOnlyRelease(release: {
  artifactType?: unknown;
  component?: unknown;
}): boolean {
  if (release.artifactType !== "component_release") return false;
  if (typeof release.component !== "string") return false;
  const comp = release.component.trim().toLowerCase();
  return ADMIN_ONLY_COMPONENTS.has(comp) || comp.startsWith("fw-");
}

function unavailable(detail?: string): HttpError {
  return new HttpError(
    503,
    "firmware_ota_unavailable",
    detail ?? "Firmware update service is temporarily unavailable.",
  );
}

function resolveUpstreamUrl(raw: string | undefined): URL {
  try {
    const url = new URL((raw ?? "").trim());
    const host = url.hostname.toLowerCase();
    const internal = host === "127.0.0.1" || host === "[::1]" ||
      host === "localhost" || host === "host.docker.internal" ||
      host.startsWith("172.") || host.startsWith("10.");
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && internal)) ||
      url.username || url.password || url.search || url.hash
    ) {
      throw unavailable();
    }
    return url;
  } catch {
    throw unavailable();
  }
}

function resolveUpstreamToken(raw: string | undefined): string {
  const token = (raw ?? "").trim();
  if (!token || !/^[\x21-\x7e]{16,256}$/.test(token)) {
    throw unavailable();
  }
  return token;
}

async function readUpstreamJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function upstreamFetch(
  baseUrl: URL,
  token: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fetchImpl: typeof fetch,
): Promise<{ status: number; data: unknown }> {
  const normalizedBase = baseUrl.toString().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const target = `${normalizedBase}${normalizedPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    const resp = await fetchImpl(target, {
      method: init.method,
      redirect: "error",
      signal: controller.signal,
      headers,
      body,
    });
    const data = await readUpstreamJson(resp).catch(() => null);
    return { status: resp.status, data };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
  }
}

async function assertDeviceAuthorized(
  authorized: Awaited<ReturnType<typeof authenticate>>,
  deviceId: string,
  isAdmin: boolean,
): Promise<{ id: string; displayName: string; serialNumber: string | null }> {
  const query = isAdmin
    ? authorized.db.from("devices")
      .select("id,display_name,serial_number")
      .eq("id", deviceId)
      .eq("is_demo", false)
      .eq("is_simulated", false)
      .maybeSingle()
    : authorized.userDb.from("devices")
      .select("id,display_name,serial_number")
      .eq("id", deviceId)
      .eq("owner_id", authorized.caller.user.id)
      .eq("is_demo", false)
      .eq("is_simulated", false)
      .maybeSingle();

  const { data, error } = await query;
  if (error) throw unavailable();
  if (!data || data.id !== deviceId) {
    throw new HttpError(
      403,
      "firmware_ota_access_denied",
      "This device is not accessible by the current account.",
    );
  }
  return {
    id: String(data.id),
    displayName: typeof data.display_name === "string"
      ? data.display_name
      : String(data.id),
    serialNumber: typeof data.serial_number === "string"
      ? data.serial_number
      : null,
  };
}

function decodeBase64UrlJson(
  encoded: unknown,
): Record<string, unknown> | null {
  if (typeof encoded !== "string" || !encoded || encoded.length > 64 * 1024) {
    return null;
  }
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const binary = atob(normalized + "=".repeat(padLength));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    return record(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeJob(value: unknown): Record<string, unknown> {
  if (
    !record(value) ||
    typeof value.jobId !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.releaseId !== "string" ||
    typeof value.phase !== "string"
  ) {
    throw unavailable();
  }
  const manifestObj = record(value.manifest)
    ? decodeBase64UrlJson(value.manifest.payload)
    : null;
  const targetVersion = manifestObj && typeof manifestObj.version === "string"
    ? manifestObj.version
    : null;
  const totalBytes = manifestObj &&
      typeof manifestObj.artifactSizeBytes === "number" &&
      Number.isFinite(manifestObj.artifactSizeBytes)
    ? manifestObj.artifactSizeBytes
    : null;

  return {
    jobId: value.jobId,
    deviceId: value.deviceId,
    releaseId: value.releaseId,
    idempotencyKey: typeof value.idempotencyKey === "string"
      ? value.idempotencyKey
      : "",
    phase: value.phase,
    bytesDownloaded: typeof value.bytesDownloaded === "number" &&
        Number.isFinite(value.bytesDownloaded)
      ? value.bytesDownloaded
      : 0,
    totalBytes,
    targetVersion,
    currentVersion: typeof value.currentVersion === "string"
      ? value.currentVersion
      : null,
    message: typeof value.message === "string" ? value.message : null,
    ...(typeof value.createdAtMs === "number" &&
        Number.isFinite(value.createdAtMs)
      ? { createdAtMs: value.createdAtMs }
      : {}),
    ...(typeof value.updatedAtMs === "number" &&
        Number.isFinite(value.updatedAtMs)
      ? { updatedAtMs: value.updatedAtMs }
      : {}),
  };
}

function annotateReleases(
  raw: unknown,
  isAdmin: boolean,
): OtaReleaseSummary[] {
  if (!Array.isArray(raw)) return [];
  const list: OtaReleaseSummary[] = [];
  for (const item of raw) {
    if (!record(item) || typeof item.releaseId !== "string") continue;
    const adminOnly = isAdminOnlyRelease(item);
    if (!isAdmin && adminOnly) continue;
    list.push({
      releaseId: item.releaseId,
      version: typeof item.version === "string" ? item.version : "",
      sequence: typeof item.sequence === "number" ? item.sequence : 0,
      channel: typeof item.channel === "string" ? item.channel : "stable",
      model: typeof item.model === "string" ? item.model : "",
      hardwareRevision: typeof item.hardwareRevision === "string"
        ? item.hardwareRevision
        : "",
      artifactSizeBytes: typeof item.artifactSizeBytes === "number"
        ? item.artifactSizeBytes
        : 0,
      artifactSha256: typeof item.artifactSha256 === "string"
        ? item.artifactSha256
        : "",
      artifactType: typeof item.artifactType === "string"
        ? item.artifactType
        : "brainstem_release",
      ...(typeof item.policySlot === "string"
        ? { policySlot: item.policySlot }
        : {}),
      ...(typeof item.component === "string"
        ? { component: item.component }
        : {}),
      adminOnly,
    });
  }
  list.sort((a, b) => b.sequence - a.sequence);
  return list;
}

export async function handleFirmwareOta(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    if (new URL(request.url).search) {
      throw new HttpError(
        400,
        "invalid_firmware_ota_request",
        "Query parameters are not accepted.",
      );
    }
    const body = await readBoundedJson(request, 2048);
    const action = typeof body.action === "string" ? body.action : "";

    let authorized: Awaited<ReturnType<typeof authenticate>>;
    try {
      authorized = await dependencies.authenticate(request);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw unavailable();
    }
    const isAdmin = authorized.caller.role === "admin";

    if (action === "devices") {
      const query = isAdmin
        ? authorized.db.from("devices")
          .select("id,display_name,serial_number,model_code,firmware_version,is_simulated")
          .eq("is_demo", false)
          .order("created_at", { ascending: false })
        : authorized.userDb.from("devices")
          .select("id,display_name,serial_number,model_code,firmware_version,is_simulated")
          .eq("owner_id", authorized.caller.user.id)
          .eq("is_demo", false)
          .order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw unavailable();
      const devices = (data ?? []).map((row) => ({
        id: String(row.id),
        displayName: typeof row.display_name === "string"
          ? row.display_name
          : String(row.id),
        serialNumber: typeof row.serial_number === "string"
          ? row.serial_number
          : null,
        modelCode: typeof row.model_code === "string" ? row.model_code : null,
        firmwareVersion: typeof row.firmware_version === "string"
          ? row.firmware_version
          : null,
        isSimulated: Boolean(row.is_simulated),
      }));
      return json({ isAdmin, devices });
    }

    if (!uuid(body.deviceId)) {
      throw new HttpError(
        400,
        "invalid_firmware_ota_request",
        "A valid deviceId is required.",
      );
    }
    const deviceId = body.deviceId;
    const device = await assertDeviceAuthorized(authorized, deviceId, isAdmin);

    const env = dependencies.env ?? Deno.env.get;
    const baseUrl = resolveUpstreamUrl(env("DOSO_OTA_RELEASE_URL"));
    const token = resolveUpstreamToken(env("DOSO_OTA_RELEASE_TOKEN"));
    const fetchImpl = dependencies.fetch ?? fetch;

    if (action === "inspect") {
      const [statusRes, releasesRes] = await Promise.all([
        upstreamFetch(
          baseUrl,
          token,
          `/v1/devices/${deviceId}/status`,
          { method: "GET" },
          fetchImpl,
        ),
        upstreamFetch(
          baseUrl,
          token,
          `/v1/devices/${deviceId}/firmware/releases`,
          { method: "GET" },
          fetchImpl,
        ),
      ]);
      if (releasesRes.status === 404 || releasesRes.status === 403) {
        return json({
          deviceId,
          deviceName: device.displayName,
          serialNumber: device.serialNumber,
          isAdmin,
          registeredForOta: false,
          status: null,
          releases: [],
        });
      }
      if (releasesRes.status < 200 || releasesRes.status >= 300) {
        throw unavailable();
      }
      const status = statusRes.status >= 200 && statusRes.status < 300 &&
          record(statusRes.data)
        ? statusRes.data
        : null;
      const releases = annotateReleases(releasesRes.data, isAdmin);
      return json({
        deviceId,
        deviceName: device.displayName,
        serialNumber: device.serialNumber,
        isAdmin,
        registeredForOta: true,
        status,
        releases,
      });
    }

    if (action === "start") {
      const releaseId = typeof body.releaseId === "string"
        ? body.releaseId.trim()
        : "";
      const idempotencyKey = typeof body.idempotencyKey === "string"
        ? body.idempotencyKey.trim()
        : "";
      if (
        !SAFE_ID_RE.test(releaseId) ||
        !SAFE_ID_RE.test(idempotencyKey)
      ) {
        throw new HttpError(
          400,
          "invalid_firmware_ota_request",
          "Valid releaseId and idempotencyKey are required.",
        );
      }

      const releasesRes = await upstreamFetch(
        baseUrl,
        token,
        `/v1/devices/${deviceId}/firmware/releases`,
        { method: "GET" },
        fetchImpl,
      );
      if (releasesRes.status < 200 || releasesRes.status >= 300) {
        throw new HttpError(
          releasesRes.status === 404 ? 404 : 503,
          "firmware_release_unavailable",
          "Target release could not be verified.",
        );
      }
      const allReleases = annotateReleases(releasesRes.data, true);
      const target = allReleases.find((r) => r.releaseId === releaseId);
      if (!target) {
        throw new HttpError(
          404,
          "firmware_release_not_found",
          "The requested firmware release is not available for this device.",
        );
      }
      if (!isAdmin && target.adminOnly) {
        throw new HttpError(
          403,
          "firmware_admin_only",
          "Hardware firmware updates require administrator access.",
        );
      }

      const jobRes = await upstreamFetch(
        baseUrl,
        token,
        `/v1/devices/${deviceId}/firmware/jobs`,
        { method: "POST", body: { releaseId, idempotencyKey } },
        fetchImpl,
      );
      if (jobRes.status < 200 || jobRes.status >= 300 || !record(jobRes.data)) {
        const errObj = record(jobRes.data) && record(jobRes.data.error)
          ? jobRes.data.error
          : null;
        const msg = errObj && typeof errObj.message === "string"
          ? errObj.message
          : record(jobRes.data) && typeof jobRes.data.error === "string"
          ? jobRes.data.error
          : "Failed to start firmware update job.";
        const code = errObj && typeof errObj.code === "string" &&
            SAFE_ID_RE.test(errObj.code)
          ? errObj.code
          : "firmware_job_rejected";
        throw new HttpError(
          jobRes.status >= 400 && jobRes.status < 500 ? jobRes.status : 503,
          code,
          msg,
        );
      }
      return json(
        { job: sanitizeJob(jobRes.data) },
        jobRes.status === 201 || jobRes.status === 202 ? jobRes.status : 200,
      );
    }

    if (action === "job" || action === "cancel") {
      const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
      if (!SAFE_ID_RE.test(jobId)) {
        throw new HttpError(
          400,
          "invalid_firmware_ota_request",
          "A valid jobId is required.",
        );
      }
      const res = await upstreamFetch(
        baseUrl,
        token,
        action === "cancel"
          ? `/v1/devices/${deviceId}/firmware/jobs/${jobId}/cancel`
          : `/v1/devices/${deviceId}/firmware/jobs/${jobId}`,
        { method: action === "cancel" ? "POST" : "GET" },
        fetchImpl,
      );
      if (res.status === 404) {
        throw new HttpError(404, "firmware_job_not_found", "Job not found.");
      }
      if (res.status < 200 || res.status >= 300 || !record(res.data)) {
        throw unavailable();
      }
      return json({ job: sanitizeJob(res.data) });
    }

    throw new HttpError(
      400,
      "invalid_firmware_ota_request",
      "Unsupported firmware-ota action.",
    );
  });
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
