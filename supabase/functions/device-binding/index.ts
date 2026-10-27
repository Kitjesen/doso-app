import { authenticate } from "../_shared/auth.ts";
import { actionFrom } from "../_shared/actions.ts";
import { normalizeBindingCode, sha256Hex } from "../_shared/crypto.ts";
import {
  handle,
  HttpError,
  json,
  optionalString,
  readJson,
  requiredString,
} from "../_shared/http.ts";
import { writeAudit } from "../_shared/audit.ts";

Deno.serve((request) =>
  handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const body = await readJson(request);
    const action = actionFrom(request, body);
    const { caller, db } = await authenticate(request);

    if (action === "claim") {
      const serialNumber = requiredString(body, "serialNumber", 100)
        .toUpperCase();
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
        .eq("serial_number", serialNumber)
        .eq("owner_id", caller.user.id)
        .eq("is_demo", false)
        .maybeSingle();
      if (alreadyOwnedError) throw alreadyOwnedError;
      if (alreadyOwnedDevice) {
        await writeAudit(db, caller, {
          request,
          outcome: "success",
          action: "device.claim",
          targetType: "device",
          targetId: alreadyOwnedDevice.id,
          metadata: { serialNumber, idempotentRetry: true },
        });
        return json({ device: alreadyOwnedDevice });
      }

      const codeDigest = await sha256Hex(code);

      // Validation, attempt accounting, owner assignment and claim consumption
      // are intentionally one SQL transaction. The raw code never leaves this
      // function and only its SHA-256 digest crosses the database boundary.
      const { data, error } = await db.rpc("claim_device_with_digest", {
        p_user_id: caller.user.id,
        p_serial_number: serialNumber,
        p_code_digest: codeDigest,
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("account already has a bound physical device")) {
          throw new HttpError(
            409,
            "physical_device_limit",
            "This account already has a physical device bound.",
          );
        }
        if (
          message.includes("invalid") || message.includes("expired") ||
          message.includes("attempt")
        ) {
          throw new HttpError(
            400,
            "claim_rejected",
            "The serial number or binding code is invalid, expired, or already used.",
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
          "The serial number or binding code is invalid, expired, or already used.",
        );
      }
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "device.claim",
        targetType: "device",
        targetId: device?.id,
        metadata: { serialNumber },
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
      await writeAudit(db, caller, {
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
  })
);
