import { authenticate } from "./auth.ts";
import { actionFrom } from "./actions.ts";
import { normalizeBindingCode, sha256Hex } from "./crypto.ts";
import {
  handle,
  HttpError,
  json,
  optionalString,
  readJson,
  requiredString,
} from "./http.ts";
import { writeAudit } from "./audit.ts";

export function createDeviceBindingHandler(
  authenticateRequest = authenticate,
  audit = writeAudit,
) {
  return (request: Request) =>
    handle(request, async () => {
      if (request.method !== "POST") {
        throw new HttpError(405, "method_not_allowed", "Use POST.");
      }
      const body = await readJson(request);
      const action = actionFrom(request, body);
      const { caller, db } = await authenticateRequest(request);

      if (action === "claim") {
        let deviceId: string;
        if (body.deviceId !== undefined) {
          deviceId = requiredString(body, "deviceId", 36).toLowerCase();
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
              .test(deviceId)
          ) {
            throw new HttpError(
              400,
              "invalid_device_id",
              "deviceId must be a UUID v4.",
            );
          }
        } else {
          // Installed App builds still identify claims by their inventory serial.
          const serialNumber = requiredString(body, "serialNumber", 100)
            .toUpperCase();
          const { data, error } = await db.from("devices").select("id")
            .eq("serial_number", serialNumber).eq("is_demo", false)
            .maybeSingle();
          if (error) throw error;
          if (!data) {
            throw new HttpError(
              400,
              "claim_rejected",
              "The robot ID or binding code is invalid, expired, or already used.",
            );
          }
          deviceId = data.id;
        }
        const code = normalizeBindingCode(requiredString(body, "code", 100));
        if (code.length < 6) {
          throw new HttpError(
            400,
            "invalid_binding_code",
            "The binding code is invalid.",
          );
        }

        const { data: alreadyOwnedDevice, error: alreadyOwnedError } = await db
          .from("devices")
          .select("*")
          .eq("id", deviceId)
          .eq("owner_id", caller.user.id)
          .eq("is_demo", false)
          .maybeSingle();
        if (alreadyOwnedError) throw alreadyOwnedError;
        if (alreadyOwnedDevice) {
          await audit(db, caller, {
            request,
            outcome: "success",
            action: "device.claim",
            targetType: "device",
            targetId: alreadyOwnedDevice.id,
            metadata: { idempotentRetry: true },
          });
          return json({ device: alreadyOwnedDevice });
        }

        const codeDigest = await sha256Hex(code);

        // Validation, attempt accounting, owner assignment and claim consumption
        // are intentionally one SQL transaction. The raw code never leaves this
        // function and only its SHA-256 digest crosses the database boundary.
        const { data, error } = await db.rpc("claim_device_with_digest", {
          p_user_id: caller.user.id,
          p_device_id: deviceId,
          p_code_digest: codeDigest,
        });
        if (error) {
          const message = error.message.toLowerCase();
          if (
            message.includes("invalid") || message.includes("expired") ||
            message.includes("attempt")
          ) {
            throw new HttpError(
              400,
              "claim_rejected",
              "The robot ID or binding code is invalid, expired, or already used.",
            );
          }
          if (message.includes("bound")) {
            throw new HttpError(
              409,
              "device_already_bound",
              "This device is already bound.",
            );
          }
          throw error;
        }
        const device = Array.isArray(data) ? data[0] : data;
        if (!device) {
          throw new HttpError(
            400,
            "claim_rejected",
            "The robot ID or binding code is invalid, expired, or already used.",
          );
        }
        await audit(db, caller, {
          request,
          outcome: "success",
          action: "device.claim",
          targetType: "device",
          targetId: device?.id,
          metadata: { deviceId },
        });
        return json({ device });
      }

      if (action === "unbind") {
        const deviceId = requiredString(body, "deviceId", 64);
        const { data, error } = await db.rpc("unbind_device", {
          p_device_id: deviceId,
          p_owner_id: caller.user.id,
          p_force: false,
        });
        if (error) {
          if (
            error.message.toLowerCase().includes("not found") ||
            error.message.toLowerCase().includes("owner")
          ) {
            throw new HttpError(
              404,
              "device_not_found",
              "The device is not bound to this account.",
            );
          }
          throw error;
        }
        const device = Array.isArray(data) ? data[0] : data;
        if (!device) {
          throw new HttpError(
            404,
            "device_not_found",
            "The device is not bound to this account.",
          );
        }
        await audit(db, caller, {
          request,
          outcome: "success",
          action: "device.unbind",
          targetType: "device",
          targetId: deviceId,
          metadata: {
            reason: optionalString(body, "reason", 200) ?? "user_request",
          },
        });
        return json({ deviceId, unbound: true, device });
      }

      throw new HttpError(404, "unknown_action", `Unknown action: ${action}`);
    });
}
