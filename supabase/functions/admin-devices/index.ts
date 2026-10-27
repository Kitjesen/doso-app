import { authenticate } from "../_shared/auth.ts";
import { actionFrom } from "../_shared/actions.ts";
import {
  normalizeBindingCode,
  randomBindingCode,
  sha256Hex,
} from "../_shared/crypto.ts";
import {
  handle,
  HttpError,
  json,
  optionalString,
  positiveInteger,
  readJson,
  requiredString,
} from "../_shared/http.ts";
import { writeAudit } from "../_shared/audit.ts";

const SAFE_DEVICE_COLUMNS =
  "id,owner_id,model_code,display_name,category,environment,serial_number,connection_status,safety_lock,alerts_enabled,battery_percent,firmware_version,runtime_hours,last_seen_at,is_demo,created_at,updated_at";
const DEVICE_CATEGORIES = ["四足", "轮式"] as const;
const DEVICE_ENVIRONMENTS = ["室内", "室外"] as const;

Deno.serve((request) =>
  handle(request, async () => {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST.");
    }
    const body = await readJson(request);
    const action = actionFrom(request, body);
    const { caller, db } = await authenticate(
      request,
      ["admin"],
      true,
      true,
    );

    if (action === "list_devices") {
      const page = positiveInteger(body.page, 1, 10_000);
      const perPage = positiveInteger(body.perPage, 25, 100);
      const from = (page - 1) * perPage;
      let query = db.from("devices").select(SAFE_DEVICE_COLUMNS, {
        count: "exact",
      })
        .order("created_at", { ascending: false }).range(
          from,
          from + perPage - 1,
        );
      const search = optionalString(body, "search", 100);
      if (search) {
        query = query.or(
          `serial_number.ilike.%${
            search.replace(/[%_,()]/g, "")
          }%,display_name.ilike.%${search.replace(/[%_,()]/g, "")}%`,
        );
      }
      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      return json({
        devices: data ?? [],
        pagination: { page, perPage, total: count ?? 0 },
      });
    }

    if (action === "create_inventory") {
      const reason = optionalString(body, "reason", 500) ??
        "inventory_provision";
      const serialNumber = requiredString(body, "serialNumber", 100)
        .toUpperCase();
      const modelCode = requiredString(body, "modelCode", 100);
      const category = optionalString(body, "category", 100) ?? "四足";
      const environment = optionalString(body, "environment", 100) ?? "室外";
      if (!(DEVICE_CATEGORIES as readonly string[]).includes(category)) {
        throw new HttpError(
          400,
          "invalid_category",
          "category must be 四足 or 轮式.",
        );
      }
      if (!(DEVICE_ENVIRONMENTS as readonly string[]).includes(environment)) {
        throw new HttpError(
          400,
          "invalid_environment",
          "environment must be 室内 or 室外.",
        );
      }
      const { data, error } = await db.from("devices").insert({
        owner_id: null,
        model_code: modelCode,
        display_name: optionalString(body, "displayName", 100) ?? modelCode,
        category,
        environment,
        serial_number: serialNumber,
        connection_status: "offline",
        is_demo: false,
      }).select(SAFE_DEVICE_COLUMNS).single();
      if (error?.code === "23505") {
        throw new HttpError(
          409,
          "serial_exists",
          "A device with this serial number already exists.",
        );
      }
      if (error) throw error;
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "device.inventory_created",
        targetType: "device",
        targetId: data.id,
        metadata: { serialNumber, modelCode, reason },
      });
      return json({ device: data }, 201);
    }

    if (action === "rotate_binding_code") {
      const reason = optionalString(body, "reason", 500) ??
        "binding_code_rotation";
      const deviceId = requiredString(body, "deviceId", 64);
      const requestedCode = optionalString(body, "code", 100);
      const bindingCode = normalizeBindingCode(
        requestedCode ?? randomBindingCode(),
      );
      if (bindingCode.length < 6) {
        throw new HttpError(
          400,
          "invalid_binding_code",
          "Binding code must contain at least 6 characters.",
        );
      }
      const expiresInMinutes = positiveInteger(body.expiresInMinutes, 30, 1440);
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000)
        .toISOString();
      const digest = await sha256Hex(bindingCode);
      const { data, error } = await db.rpc("rotate_device_claim", {
        p_device_id: deviceId,
        p_code_digest: digest,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      if (!data) {
        throw new HttpError(404, "device_not_found", "Device was not found.");
      }
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "device.binding_code_rotated",
        targetType: "device",
        targetId: deviceId,
        metadata: { expiresAt, reason },
      });
      // The plaintext code is intentionally returned once. Neither the digest nor
      // the private claim row is exposed to the caller or audit log.
      return json({ deviceId, bindingCode, expiresAt, oneTimeDisplay: true });
    }

    if (action === "unbind") {
      const deviceId = requiredString(body, "deviceId", 64);
      const reason = requiredString(body, "reason", 500);
      const { data, error } = await db.rpc("unbind_device", {
        p_device_id: deviceId,
        p_owner_id: null,
        p_force: true,
      });
      if (error) {
        throw error;
      }
      const device = Array.isArray(data) ? data[0] : data;
      if (!device) {
        throw new HttpError(404, "device_not_found", "Device was not found.");
      }
      await writeAudit(db, caller, {
        request,
        outcome: "success",
        action: "device.force_unbind",
        targetType: "device",
        targetId: deviceId,
        metadata: { reason },
      });
      return json({ deviceId, unbound: true, device });
    }

    throw new HttpError(404, "unknown_action", `Unknown action: ${action}`);
  })
);
