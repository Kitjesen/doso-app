import { authenticate as authenticateRequest } from "../_shared/auth.ts";
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

const SAFE_DEVICE_COLUMNS =
  "id,owner_id,model_code,display_name,category,environment,serial_number,connection_status,safety_lock,alerts_enabled,battery_percent,firmware_version,runtime_hours,last_seen_at,is_demo,is_simulated,created_at,updated_at";
const DEVICE_CATEGORIES = ["四足", "轮式"] as const;
const DEVICE_ENVIRONMENTS = ["室内", "室外"] as const;

export const createAdminDevicesHandler = (
  authenticate = authenticateRequest,
) =>
(request: Request) =>
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

    const requestId =
      request.headers.get("x-request-id")?.trim().slice(0, 200) ||
      crypto.randomUUID();

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
      if (body.simulated !== undefined && typeof body.simulated !== "boolean") {
        throw new HttpError(
          400,
          "invalid_simulated",
          "simulated must be a boolean.",
        );
      }
      const { data, error } = await db.rpc("create_device_inventory", {
        p_actor_user_id: caller.user.id,
        p_serial_number: serialNumber,
        p_is_simulated: body.simulated ?? false,
        p_model_code: modelCode,
        p_display_name: optionalString(body, "displayName", 100) ?? modelCode,
        p_category: category,
        p_environment: environment,
        p_reason: reason,
        p_request_id: requestId,
      }).select(SAFE_DEVICE_COLUMNS).single();
      if (error?.code === "23505" && error.message === "serial_exists") {
        throw new HttpError(
          409,
          "serial_exists",
          "A device with this serial number already exists.",
        );
      }
      if (error) throw error;
      return json({ device: data }, 201);
    }

    if (action === "issue_factory_claim") {
      const deviceId = requiredString(body, "deviceId", 36).toLowerCase();
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
      const expiresAt = requiredString(body, "expiresAt", 30);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt) ||
        !Number.isFinite(Date.parse(expiresAt)) ||
        new Date(expiresAt).toISOString() !== expiresAt ||
        Date.parse(expiresAt) <= Date.now()
      ) {
        throw new HttpError(
          400,
          "invalid_claim_expiry",
          "expiresAt must be a future UTC timestamp, for example 2028-01-01T00:00:00.000Z.",
        );
      }
      const bindingCode = randomBindingCode(32);
      const { data, error } = await db.rpc("admin_issue_factory_claim", {
        p_actor_user_id: caller.user.id,
        p_device_id: deviceId,
        p_code_digest: await sha256Hex(bindingCode),
        p_expires_at: expiresAt,
        p_reason: optionalString(body, "reason", 500) ??
          "factory_claim_issuance",
        p_request_id: requestId,
      });
      if (
        error?.code === "P0001" &&
        error.message === "factory_device_unavailable"
      ) {
        throw new HttpError(
          409,
          "factory_device_unavailable",
          "Device must be unowned physical inventory.",
        );
      }
      if (error) throw error;
      if (!data) {
        throw new HttpError(404, "device_not_found", "Device was not found.");
      }
      const response = json({
        deviceId,
        claimUrl: `doso://robot/${deviceId}?claim=${bindingCode}`,
        expiresAt,
        oneTimeDisplay: true,
      });
      response.headers.set("cache-control", "no-store");
      return response;
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
      const { data, error } = await db.rpc("admin_rotate_device_claim", {
        p_actor_user_id: caller.user.id,
        p_device_id: deviceId,
        p_code_digest: digest,
        p_expires_at: expiresAt,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (error) throw error;
      if (!data) {
        throw new HttpError(404, "device_not_found", "Device was not found.");
      }
      // The plaintext code is intentionally returned once. Neither the digest nor
      // the private claim row is exposed to the caller or audit log.
      return json({ deviceId, bindingCode, expiresAt, oneTimeDisplay: true });
    }

    if (action === "unbind") {
      const deviceId = requiredString(body, "deviceId", 64);
      const reason = requiredString(body, "reason", 500);
      const { data, error } = await db.rpc("admin_unbind_device", {
        p_actor_user_id: caller.user.id,
        p_device_id: deviceId,
        p_reason: reason,
        p_request_id: requestId,
      });
      if (error) {
        throw error;
      }
      const device = Array.isArray(data) ? data[0] : data;
      if (!device) {
        throw new HttpError(404, "device_not_found", "Device was not found.");
      }
      return json({ deviceId, unbound: true, device });
    }

    throw new HttpError(404, "unknown_action", `Unknown action: ${action}`);
  });
