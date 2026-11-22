import { authorizeRobotIngress } from "../_shared/robotIngress.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import {
  counter,
  exact,
  readBoundedJson,
  record,
  timestamp,
  uuid,
} from "../remote-state/handler.ts";

type Dependencies = {
  readEnvironment(name: string): string | undefined;
  createClient(): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

function claimItem(value: unknown): boolean {
  if (
    !record(value) ||
    !exact(value, [
      "id",
      "leaseToken",
      "deviceId",
      "ownerId",
      "authorizationEpoch",
      "consentVersion",
      "tbDeviceId",
      "simulated",
      "received",
    ]) ||
    !uuid(value.id) || !uuid(value.leaseToken) || !uuid(value.deviceId) ||
    !uuid(value.ownerId) ||
    !counter(value.authorizationEpoch) || !counter(value.consentVersion) ||
    !(value.tbDeviceId === null || uuid(value.tbDeviceId)) ||
    typeof value.simulated !== "boolean" ||
    !record(value.received) ||
    !exact(value.received, ["report", "receivedAt"]) ||
    !timestamp(value.received.receivedAt) || !record(value.received.report)
  ) return false;
  const report = value.received.report;
  // Preserve the accepted report; the database owns validation of its status schema.
  return report.v === 1 && report.kind === "status.report" &&
    report.deviceId === value.deviceId &&
    report.authorizationEpoch === value.authorizationEpoch &&
    report.consentVersion === value.consentVersion &&
    uuid(report.connectionId) && uuid(report.reportingSessionId) &&
    counter(report.seq) && timestamp(report.observedAt) &&
    (record(report.status) && report.error === undefined ||
      report.status === undefined && report.error === "upstream_unavailable");
}

function validResponse(action: string, value: unknown): boolean {
  if (!record(value) || value.v !== 1) return false;
  if (action === "claim") {
    return exact(value, ["v", "items"]) && Array.isArray(value.items) &&
      value.items.length <= 1 && value.items.every(claimItem);
  }
  const key = action === "check" ? "allowed" : "accepted";
  return exact(value, ["v", key]) && typeof value[key] === "boolean";
}

export function createTelemetryExportHandler(dependencies: Dependencies) {
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
        let authorized: boolean;
        try {
          authorized = authorizeRobotIngress(
            request,
            (name) =>
              name === "DOSO_ROBOT_INGRESS_SECRET_NAME"
                ? dependencies.readEnvironment(
                  "DOSO_TELEMETRY_EXPORT_SECRET_NAME",
                )?.trim() || "telemetry-export"
                : dependencies.readEnvironment(name),
          );
        } catch {
          throw new HttpError(
            503,
            "telemetry_export_configuration_error",
            "Telemetry export is not configured.",
          );
        }
        if (!authorized) {
          throw new HttpError(
            401,
            "telemetry_export_unauthorized",
            "A dedicated export key is required.",
          );
        }
        if (new URL(request.url).search) {
          throw new HttpError(
            400,
            "invalid_telemetry_export",
            "Query parameters are not accepted.",
          );
        }
        const body = await readBoundedJson(request, 4096);
        let rpc: string;
        let args: Record<string, unknown>;
        if (
          body.v === 1 && body.action === "claim" &&
          exact(body, ["v", "action"])
        ) {
          rpc = "claim_telemetry_export";
          args = {};
        } else if (
          body.v === 1 && body.action === "check" &&
          exact(body, ["v", "action", "id", "leaseToken", "tbDeviceId"]) &&
          uuid(body.id) && uuid(body.leaseToken) &&
          (body.tbDeviceId === null || uuid(body.tbDeviceId))
        ) {
          rpc = "check_telemetry_export";
          args = {
            p_id: body.id,
            p_lease_token: body.leaseToken,
            p_tb_device_id: body.tbDeviceId,
          };
        } else if (
          body.v === 1 && body.action === "finish" &&
          exact(body, ["v", "action", "id", "leaseToken", "outcome"]) &&
          uuid(body.id) && uuid(body.leaseToken) &&
          ["delivered", "retry", "conflict"].includes(String(body.outcome))
        ) {
          rpc = "finish_telemetry_export";
          args = {
            p_id: body.id,
            p_lease_token: body.leaseToken,
            p_outcome: body.outcome,
          };
        } else {
          throw new HttpError(
            400,
            "invalid_telemetry_export",
            "The export request is invalid.",
          );
        }
        const result = await dependencies.createClient().rpc(rpc, args);
        if (result.error || !validResponse(String(body.action), result.data)) {
          throw new HttpError(
            503,
            "telemetry_export_unavailable",
            "Telemetry export is temporarily unavailable.",
          );
        }
        response = json(result.data);
      }
    } catch (error) {
      response = errorResponse(
        error instanceof HttpError ? error : new HttpError(
          503,
          "telemetry_export_unavailable",
          "Telemetry export is temporarily unavailable.",
        ),
      );
    }
    response.headers.set("cache-control", "no-store");
    response.headers.set("pragma", "no-cache");
    return response;
  };
}
