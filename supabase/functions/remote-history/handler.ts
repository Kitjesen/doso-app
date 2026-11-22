import type { authenticate } from "../_shared/auth.ts";
import { handle, HttpError, json } from "../_shared/http.ts";
import {
  counter,
  exact,
  readBoundedJson,
  record,
  status,
  timestamp,
  uuid,
} from "../remote-state/handler.ts";

type Access = {
  deviceId: string;
  ownerId: string;
  simulated: boolean;
  authorizationEpoch: number;
  historyId: string | null;
  tbDeviceId: string | null;
  enabled: boolean;
  pendingCount: number;
  failedCount: number;
  droppedCount: number;
};
type Dependencies = {
  authenticate: typeof authenticate;
  readEnvironment(name: string): string | undefined;
  fetch: typeof fetch;
};

function unavailable(): HttpError {
  return new HttpError(
    503,
    "remote_history_unavailable",
    "Remote history is temporarily unavailable.",
  );
}

function denied(): HttpError {
  return new HttpError(
    403,
    "remote_history_access_denied",
    "This device is not available to the current account.",
  );
}

function access(
  value: unknown,
  deviceId: string,
  ownerId: string,
): value is Access {
  return record(value) && exact(value, [
    "deviceId",
    "ownerId",
    "simulated",
    "authorizationEpoch",
    "historyId",
    "tbDeviceId",
    "enabled",
    "pendingCount",
    "failedCount",
    "droppedCount",
  ]) && value.deviceId === deviceId && value.ownerId === ownerId &&
    typeof value.simulated === "boolean" && counter(value.authorizationEpoch) &&
    (value.historyId === null || uuid(value.historyId)) &&
    (value.tbDeviceId === null || uuid(value.tbDeviceId)) &&
    (value.tbDeviceId === null || value.historyId !== null) &&
    typeof value.enabled === "boolean" && counter(value.pendingCount, 0) &&
    counter(value.failedCount, 0) && counter(value.droppedCount, 0);
}

function milliseconds(value: string | null): number {
  if (
    value === null || !/^(0|[1-9]\d*)$/.test(value) ||
    !counter(Number(value), 0)
  ) {
    throw new HttpError(
      400,
      "invalid_remote_history",
      "Specify a device UUID and a valid time window of at most 24 hours.",
    );
  }
  return Number(value);
}

function platformUrl(value: string | undefined): URL {
  const url = new URL(value ?? "");
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/"
  ) {
    throw unavailable();
  }
  return url;
}

function points(
  value: Record<string, unknown>,
  mapping: Access,
  start: number,
  end: number,
  after: number | null,
) {
  if (
    (!exact(value, ["sourceReport"]) && !exact(value, [])) ||
    (value.sourceReport !== undefined && !Array.isArray(value.sourceReport))
  ) throw unavailable();
  const rows = value.sourceReport ?? [];
  if (!Array.isArray(rows) || rows.length > (after === null ? 501 : 502)) throw unavailable();
  let previous = start - 1;
  let consentVersion: number | undefined;
  return rows.map((row: unknown) => {
    if (
      !record(row) || !exact(row, ["ts", "value"]) || !counter(row.ts, 0) ||
      row.ts < start || row.ts >= end || row.ts <= previous ||
      typeof row.value !== "string"
    ) throw unavailable();
    const report: unknown = JSON.parse(row.value);
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
    if (
      !record(report) || report.v !== 1 || report.kind !== "status.report" ||
      report.deviceId !== mapping.deviceId ||
      report.authorizationEpoch !== mapping.authorizationEpoch ||
      !uuid(report.connectionId) || !uuid(report.reportingSessionId) ||
      !counter(report.consentVersion) || !counter(report.seq) ||
      !timestamp(report.observedAt) ||
      Date.parse(report.observedAt) !== row.ts ||
      !(exact(report, [...keys, "status"]) && status(report.status) ||
        exact(report, [...keys, "error"]) &&
          report.error === "upstream_unavailable")
    ) throw unavailable();
    previous = row.ts;
    const breakBefore = consentVersion === undefined || consentVersion !== report.consentVersion;
    consentVersion = Number(report.consentVersion);
    return {
      reportTs: row.ts,
      breakBefore,
      location: record(report.status) ? report.status.location ?? null : null,
    };
  }).filter(point => after === null || point.reportTs > after);
}

export async function handleRemoteHistory(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const response = await handle(request, async () => {
    try {
      if (request.method !== "GET") {
        throw new HttpError(405, "method_not_allowed", "Use GET.");
      }
      const authorized = await dependencies.authenticate(request);
      const params = new URL(request.url).searchParams;
      const deviceId = params.get("deviceId");
      if (
        !uuid(deviceId) ||
        [...params.keys()].some((key) =>
          !["deviceId", "startTs", "endTs", "after"].includes(key) ||
          params.getAll(key).length !== 1
        )
      ) {
        throw new HttpError(
          400,
          "invalid_remote_history",
          "Specify one deviceId UUID and a valid time window.",
        );
      }
      const startTs = milliseconds(params.get("startTs"));
      const endTs = milliseconds(params.get("endTs"));
      const after = params.has("after")
        ? milliseconds(params.get("after"))
        : null;
      if (
        endTs <= startTs || endTs - startTs > 86400000 ||
        after !== null && (after < startTs || after >= endTs)
      ) {
        throw new HttpError(
          400,
          "invalid_remote_history",
          "Specify a time window of at most 24 hours and an after value within it.",
        );
      }
      const readAccess = async (): Promise<Access> => {
        const result = await authorized.db.rpc(
          "get_telemetry_history_access",
          { p_device_id: deviceId, p_owner_id: authorized.caller.user.id, p_session_id: authorized.caller.sessionId },
        );
        if (result.error?.code === "42501") throw denied();
        if (
          record(result.data) && typeof result.data.ownerId === "string" &&
          result.data.ownerId !== authorized.caller.user.id
        ) throw denied();
        if (
          result.error ||
          !access(result.data, deviceId!, authorized.caller.user.id)
        ) throw unavailable();
        return result.data;
      };
      const mapping = await readAccess();
      let history: ReturnType<typeof points> = [];
      if (
        mapping.tbDeviceId !== null && (after === null || after < endTs - 1)
      ) {
        const url = platformUrl(
          dependencies.readEnvironment("DOSO_THINGSBOARD_URL"),
        );
        const key = dependencies.readEnvironment("DOSO_THINGSBOARD_KEY")
          ?.trim();
        if (!key || /[\r\n]/.test(key)) throw unavailable();
        url.pathname =
          `/api/plugins/telemetry/DEVICE/${mapping.tbDeviceId}/values/timeseries`;
        url.search = new URLSearchParams({
          keys: "sourceReport",
          startTs: String(after === null ? startTs : after),
          endTs: String(endTs - 1),
          limit: after === null ? "501" : "502",
          agg: "NONE",
          orderBy: "ASC",
        }).toString();
        const platform = await dependencies.fetch(url, {
          headers: { "X-Authorization": `ApiKey ${key}` },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        });
        if (!platform.ok) {
          await platform.body?.cancel();
          throw unavailable();
        }
        // The same signal bounds streaming as well as the initial response headers.
        let body;
        try {
          body = await readBoundedJson(
            new Request("https://history.internal", {
              method: "POST",
              headers: platform.headers,
              body: platform.body,
            }),
            4 * 1024 * 1024,
          );
        } finally {
          await platform.body?.cancel().catch(() => {});
        }
        history = points(
          body,
          mapping,
          after === null ? startTs : after,
          endTs,
          after,
        );
      }
      const current = await readAccess();
      if (
        current.ownerId !== mapping.ownerId ||
        current.authorizationEpoch !== mapping.authorizationEpoch ||
        current.historyId !== mapping.historyId ||
        current.tbDeviceId !== mapping.tbDeviceId ||
        current.simulated !== mapping.simulated
      ) throw denied();
      const page = history.slice(0, 500);
      return json({
        deviceId,
        simulated: current.simulated,
        historyId: current.historyId,
        startTs,
        endTs,
        points: page,
        nextTs: history.length > 500 ? page[499].reportTs : null,
        enabled: current.enabled,
        availability: current.tbDeviceId === null ? "preparing" : "ready",
        syncState: current.failedCount > 0 || current.droppedCount > 0 ? "incomplete" : current.pendingCount > 0 ? "pending" : "current",
      });
    } catch (error) {
      if (
        error instanceof HttpError && error.status !== 413 &&
        error.code !== "invalid_json"
      ) throw error;
      throw unavailable();
    }
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}
