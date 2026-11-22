import { authorizeRobotIngress } from "../_shared/robotIngress.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import {
  counter,
  exact,
  readBoundedJson,
  record,
  status,
  timestamp,
  uuid,
} from "../remote-state/handler.ts";

type Client = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
type Dependencies = {
  readEnvironment: (name: string) => string | undefined;
  createClient: () => Client;
  now?: () => number;
};

function nullableUuid(value: unknown): boolean {
  return value === null || uuid(value);
}
function nullableTime(value: unknown): boolean {
  return value === null || timestamp(value);
}

function decision(value: unknown): boolean {
  return value === null ||
    record(value) &&
      exact(value, [
        "authorizationEpoch",
        "consentVersion",
        "desiredEnabled",
        "deviceConfirmed",
        "reportingSessionId",
        "expiresAt",
      ]) &&
      counter(value.authorizationEpoch) && counter(value.consentVersion) &&
      typeof value.desiredEnabled === "boolean" &&
      typeof value.deviceConfirmed === "boolean" &&
      nullableUuid(value.reportingSessionId) && nullableTime(value.expiresAt);
}

function received(value: unknown, deviceId: string): boolean {
  if (value === null) return true;
  if (
    !record(value) || !exact(value, ["report", "receivedAt"]) ||
    !timestamp(value.receivedAt) || !record(value.report)
  ) return false;
  const report = value.report;
  const keys = [
    "v",
    "kind",
    "deviceId",
    "connectionId",
    "reportingSessionId",
    "authorizationEpoch",
    "consentVersion",
    "seq",
    "observedAt",
  ];
  return report.v === 1 && report.kind === "status.report" &&
    report.deviceId === deviceId && uuid(report.connectionId) &&
    uuid(report.reportingSessionId) &&
    counter(report.authorizationEpoch) && counter(report.consentVersion) &&
    counter(report.seq) && timestamp(report.observedAt) &&
    (exact(report, [...keys, "status"]) && status(report.status) ||
      exact(report, [...keys, "error"]) &&
        report.error === "upstream_unavailable");
}

function device(value: unknown): value is Record<string, unknown> {
  return record(value) &&
    exact(value, [
      "deviceId",
      "connectionId",
      "lastSeenAt",
      "reachable",
      "permission",
      "latest",
      "sessionReusable",
    ]) &&
    uuid(value.deviceId) && nullableUuid(value.connectionId) &&
    nullableTime(value.lastSeenAt) && typeof value.reachable === "boolean" &&
    typeof value.sessionReusable === "boolean" && decision(value.permission) &&
    received(value.latest, value.deviceId);
}

function permission(value: unknown): boolean {
  return value === null ||
    record(value) &&
      exact(value, [
        "authorizationEpoch",
        "consentVersion",
        "enabled",
        "connectionId",
        "reportingSessionId",
        "expiresAt",
      ]) &&
      counter(value.authorizationEpoch) && counter(value.consentVersion) &&
      typeof value.enabled === "boolean" && timestamp(value.expiresAt) &&
      nullableUuid(value.connectionId) &&
      nullableUuid(value.reportingSessionId) &&
      (!value.enabled ||
        uuid(value.connectionId) && uuid(value.reportingSessionId));
}

function responseBody(value: unknown, requested: Set<string>): boolean {
  if (
    !record(value) || !exact(value, ["v", "permissions"]) || value.v !== 1 ||
    !Array.isArray(value.permissions) ||
    value.permissions.length > requested.size
  ) return false;
  const seen = new Set<string>();
  for (const entry of value.permissions) {
    if (
      !record(entry) || !exact(entry, ["deviceId", "permission"]) ||
      !uuid(entry.deviceId) || !requested.has(entry.deviceId) ||
      seen.has(entry.deviceId) || !permission(entry.permission)
    ) return false;
    seen.add(entry.deviceId);
  }
  return true;
}

function authorize(
  request: Request,
  read: Dependencies["readEnvironment"],
): boolean {
  try {
    return authorizeRobotIngress(
      request,
      (name) =>
        name === "DOSO_ROBOT_INGRESS_SECRET_NAME"
          ? read("DOSO_REMOTE_SYNC_SECRET_NAME")?.trim() || "remote-state-sync"
          : read(name),
    );
  } catch {
    throw new HttpError(
      503,
      "remote_sync_configuration_error",
      "Remote state synchronization is not configured.",
    );
  }
}

export function createRemoteStateSyncHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    let response: Response;
    try {
      if (request.method === "OPTIONS") {
        response = new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "apikey, content-type",
          },
        });
      } else {
        if (request.method !== "POST") {
          throw new HttpError(405, "method_not_allowed", "Use POST.");
        }
        if (!authorize(request, dependencies.readEnvironment)) {
          throw new HttpError(
            401,
            "remote_sync_unauthorized",
            "A dedicated synchronization key is required.",
          );
        }
        if (new URL(request.url).search) {
          throw new HttpError(
            400,
            "invalid_remote_state_batch",
            "Query parameters are not accepted.",
          );
        }
        const body = await readBoundedJson(request, 128 * 1024);
        const now = (dependencies.now ?? Date.now)();
        if (
          !exact(body, ["v", "observedAt", "devices"]) || body.v !== 1 ||
          !timestamp(body.observedAt) || !Number.isFinite(now) ||
          now - Date.parse(body.observedAt) > 15000 ||
          Date.parse(body.observedAt) - now > 2000 ||
          !Array.isArray(body.devices) || body.devices.length > 32 ||
          !body.devices.every(device)
        ) {
          throw new HttpError(
            400,
            "invalid_remote_state_batch",
            "The synchronization batch is invalid or outside its time window.",
          );
        }
        const ids = new Set(
          body.devices.map((item) => item.deviceId as string),
        );
        if (ids.size !== body.devices.length) {
          throw new HttpError(
            400,
            "invalid_remote_state_batch",
            "Duplicate device IDs are not accepted.",
          );
        }
        let result;
        try {
          result = await dependencies.createClient().rpc("sync_remote_state", {
            p_observed_at: body.observedAt,
            p_devices: body.devices,
          });
        } catch {
          throw new HttpError(
            503,
            "remote_sync_unavailable",
            "Remote state synchronization is temporarily unavailable.",
          );
        }
        if (result.error) {
          const code = record(result.error) ? result.error.code : null;
          if (code === "22023") {
            throw new HttpError(
              400,
              "invalid_remote_state_batch",
              "The synchronization batch was rejected.",
            );
          }
          throw new HttpError(
            503,
            "remote_sync_unavailable",
            "Remote state synchronization is temporarily unavailable.",
          );
        }
        if (!responseBody(result.data, ids)) {
          throw new HttpError(
            503,
            "remote_sync_unavailable",
            "The synchronization response could not be confirmed.",
          );
        }
        response = json(result.data);
      }
    } catch (error) {
      response = errorResponse(
        error instanceof HttpError ? error : new HttpError(
          503,
          "remote_sync_unavailable",
          "Remote state synchronization is temporarily unavailable.",
        ),
      );
    }
    response.headers.set("cache-control", "no-store");
    response.headers.set("pragma", "no-cache");
    return response;
  };
}
