import type { authenticate } from "../_shared/auth.ts";
import {
  handle,
  HttpError,
  json,
  readJson,
  requiredString,
} from "../_shared/http.ts";

export const MAP_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MAP_URL_SECONDS = 300;
export const MAP_CATALOG_COLUMNS =
  "id,owner_id,device_id,authorization_epoch,request_id,name,source_map_id,source_content_epoch,frame_id,format,schema_version,archive_format,size_bytes,sha256,crc64,status,created_at,ready_at";

export type MapVersion = Record<string, unknown> & {
  id: string;
  status: string;
  size_bytes: number;
  crc64: string;
  object_key: string;
  upload_id: string | null;
};

export type MapPart = { number: number; etag: string };
export interface MapObjectStore {
  initialize(key: string): Promise<string>;
  signPart(
    key: string,
    uploadId: string,
    number: number,
    size: number,
  ): Promise<string>;
  complete(key: string, uploadId: string, parts: MapPart[]): Promise<void>;
  head(key: string): Promise<{ size: number; crc64: string } | null>;
  abort(key: string, uploadId: string): Promise<void>;
  signDownload(key: string): Promise<string>;
}

type Authorized = Awaited<ReturnType<typeof authenticate>>;

async function reauthorize(
  request: Request,
  previous: Authorized,
  authenticateRequest: typeof authenticate,
): Promise<Authorized> {
  const current = await authenticateRequest(request);
  if (
    current.caller.user.id !== previous.caller.user.id ||
    current.caller.sessionId !== previous.caller.sessionId
  ) {
    throw new HttpError(
      401,
      "map_session_changed",
      "The map operation session has changed.",
    );
  }
  return current;
}

function conflict(): HttpError {
  return new HttpError(
    409,
    "map_state_conflict",
    "Refresh the map version before retrying.",
  );
}

function unavailable(): HttpError {
  return new HttpError(
    503,
    "map_storage_unavailable",
    "Map object storage is unavailable. Please retry later.",
  );
}

function uuid(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    throw new HttpError(400, "invalid_request", `${key} must be a UUID.`);
  }
  return value.toLowerCase();
}

function publicVersion(
  version: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    MAP_CATALOG_COLUMNS.split(",").map((key) => [key, version[key]]),
  );
}

async function rpc(
  auth: Authorized,
  name: string,
  args: Record<string, unknown>,
): Promise<MapVersion> {
  let result;
  try {
    result = await auth.db.rpc(name, {
      p_owner_id: auth.caller.user.id,
      ...args,
    });
  } catch {
    throw new HttpError(
      503,
      "map_catalog_unavailable",
      "The map catalog is unavailable.",
    );
  }
  if (result.error) {
    const { code, message } = result.error;
    if (code === "42501") {
      throw new HttpError(
        403,
        "map_access_denied",
        "This map operation is not authorized.",
      );
    }
    if (code === "22023") {
      throw new HttpError(
        400,
        "invalid_request",
        "The map request is invalid or conflicts with an earlier request.",
      );
    }
    if (code === "55000") {
      if (message === "map_verification_mismatch") {
        throw new HttpError(
          409,
          "map_verification_mismatch",
          "Stored map size or checksum does not match the upload request.",
        );
      }
      throw conflict();
    }
    throw new HttpError(
      503,
      "map_catalog_unavailable",
      "The map catalog is unavailable.",
    );
  }
  const version = result.data;
  if (
    !version || typeof version !== "object" || Array.isArray(version) ||
    typeof version.id !== "string"
  ) {
    throw new HttpError(
      503,
      "map_catalog_unavailable",
      "The map catalog returned an invalid response.",
    );
  }
  return version as MapVersion;
}

function parseParts(value: unknown, size: number): MapPart[] {
  const count = Math.ceil(size / MAP_PART_SIZE_BYTES);
  if (!Array.isArray(value) || value.length !== count) {
    throw new HttpError(
      400,
      "invalid_request",
      "Supply every map part in order.",
    );
  }
  return value.map((part, index) => {
    if (
      !part || typeof part !== "object" || part.number !== index + 1 ||
      typeof part.etag !== "string" || !/^"?[0-9a-fA-F]{32}"?$/.test(part.etag)
    ) {
      throw new HttpError(
        400,
        "invalid_request",
        "Map parts must have consecutive numbers and valid OSS ETags.",
      );
    }
    return { number: part.number, etag: part.etag.replaceAll('"', "") };
  });
}

async function bestEffortAbort(
  store: MapObjectStore,
  key: string,
  uploadId: string,
): Promise<void> {
  try {
    await store.abort(key, uploadId);
  } catch { /* The cancelled database intent prevents completion. */ }
}

export async function handleMapLibrary(request: Request, dependencies: {
  authenticate: typeof authenticate;
  objectStore: () => MapObjectStore | Promise<MapObjectStore>;
}): Promise<Response> {
  const response = await handle(request, async () => {
    if (request.method !== "GET" && request.method !== "POST") {
      throw new HttpError(
        405,
        "method_not_allowed",
        "Use GET or POST for the map library.",
      );
    }
    if (new URL(request.url).search) {
      throw new HttpError(
        400,
        "invalid_request",
        "Map library accepts no query parameters.",
      );
    }
    const auth = await dependencies.authenticate(request);
    if (request.method === "GET") {
      let result;
      try {
        result = await auth.userDb.from("device_map_versions").select(
          MAP_CATALOG_COLUMNS,
        )
          .eq("owner_id", auth.caller.user.id).order("created_at", {
            ascending: false,
          }).limit(100);
      } catch {
        throw new HttpError(
          503,
          "map_catalog_unavailable",
          "The map catalog is unavailable.",
        );
      }
      if (result.error || !Array.isArray(result.data)) {
        throw new HttpError(
          503,
          "map_catalog_unavailable",
          "The map catalog is unavailable.",
        );
      }
      return json({
        versions: result.data.map((version) => publicVersion(version)),
      });
    }

    const body = await readJson(request);
    const action = requiredString(body, "action", 40);
    if (
      ![
        "prepare-upload",
        "upload-part",
        "complete-upload",
        "cancel-upload",
        "download",
      ].includes(action)
    ) {
      throw new HttpError(
        400,
        "invalid_request",
        "Unknown map library action.",
      );
    }
    // Cancellation must remain available even while OSS is unconfigured or unavailable.
    if (action === "cancel-upload") {
      const version = await rpc(auth, "cancel_map_version", {
        p_version_id: uuid(body, "versionId"),
      });
      if (version.upload_id) {
        try {
          await bestEffortAbort(
            await dependencies.objectStore(),
            version.object_key,
            version.upload_id,
          );
        } catch { /* No storage capability is needed to revoke the intent. */ }
      }
      return json({ version: publicVersion(version) });
    }

    let store: MapObjectStore;
    try {
      store = await dependencies.objectStore();
    } catch {
      throw unavailable();
    }
    if (action === "prepare-upload") {
      if (
        !body.metadata || typeof body.metadata !== "object" ||
        Array.isArray(body.metadata)
      ) {
        throw new HttpError(
          400,
          "invalid_request",
          "metadata must be a map package description.",
        );
      }
      let version = await rpc(auth, "prepare_map_version", {
        p_device_id: uuid(body, "deviceId"),
        p_request_id: uuid(body, "requestId"),
        p_metadata: body.metadata,
      });
      if (version.status === "uploading" && !version.upload_id) {
        let created: string;
        try {
          created = await store.initialize(version.object_key);
        } catch {
          throw unavailable();
        }
        try {
          const current = await reauthorize(
            request,
            auth,
            dependencies.authenticate,
          );
          version = await rpc(current, "set_map_upload_id", {
            p_version_id: version.id,
            p_upload_id: created,
          });
        } catch (error) {
          await bestEffortAbort(store, version.object_key, created);
          throw error;
        }
        if (version.upload_id !== created) {
          await bestEffortAbort(store, version.object_key, created);
        }
      }
      return json({
        version: publicVersion(version),
        partSizeBytes: MAP_PART_SIZE_BYTES,
        partCount: Math.ceil(version.size_bytes / MAP_PART_SIZE_BYTES),
        uploadAvailable: version.status === "uploading" && !!version.upload_id,
      });
    }

    const versionId = uuid(body, "versionId");
    let version = await rpc(auth, "get_map_version_for_transfer", {
      p_version_id: versionId,
      p_require_source: action !== "download",
    });
    if (action === "download") {
      if (version.status !== "ready") throw conflict();
      let url;
      try {
        url = await store.signDownload(version.object_key);
      } catch {
        throw unavailable();
      }
      const current = await reauthorize(
        request,
        auth,
        dependencies.authenticate,
      );
      version = await rpc(current, "get_map_version_for_transfer", {
        p_version_id: versionId,
        p_require_source: false,
      });
      if (version.status !== "ready") throw conflict();
      return json({
        version: publicVersion(version),
        url,
        expiresInSeconds: MAP_URL_SECONDS,
      });
    }
    if (action === "upload-part") {
      if (version.status !== "uploading" || !version.upload_id) {
        throw conflict();
      }
      const number = body.partNumber;
      const count = Math.ceil(version.size_bytes / MAP_PART_SIZE_BYTES);
      if (
        typeof number !== "number" || !Number.isInteger(number) || number < 1 ||
        number > count
      ) {
        throw new HttpError(
          400,
          "invalid_request",
          "partNumber is outside this map upload.",
        );
      }
      let url;
      const size = Math.min(
        MAP_PART_SIZE_BYTES,
        version.size_bytes - (number - 1) * MAP_PART_SIZE_BYTES,
      );
      try {
        url = await store.signPart(
          version.object_key,
          version.upload_id,
          number,
          size,
        );
      } catch {
        throw unavailable();
      }
      // Recheck cancellation and source ownership before releasing a newly signed capability.
      const current = await reauthorize(
        request,
        auth,
        dependencies.authenticate,
      );
      version = await rpc(current, "get_map_version_for_transfer", {
        p_version_id: versionId,
        p_require_source: true,
      });
      if (version.status !== "uploading") throw conflict();
      return json({
        url,
        partNumber: number,
        sizeBytes: size,
        headers: { "content-length": String(size) },
        expiresInSeconds: MAP_URL_SECONDS,
      });
    }
    if (version.status === "ready") {
      return json({ version: publicVersion(version) });
    }
    if (
      !["uploading", "verifying"].includes(version.status) || !version.upload_id
    ) throw conflict();
    const parts = parseParts(body.parts, version.size_bytes);
    version = await rpc(auth, "begin_map_verification", {
      p_version_id: versionId,
    });
    let actual;
    try {
      // A lost CompleteMultipartUpload response may already have created the immutable object.
      actual = await store.head(version.object_key);
      if (!actual) {
        try {
          await store.complete(version.object_key, version.upload_id!, parts);
        } catch {
          /* HEAD also resolves completion responses lost in transit. */
        }
        actual = await store.head(version.object_key);
      }
    } catch {
      throw unavailable();
    }
    if (!actual) throw unavailable();
    const current = await reauthorize(request, auth, dependencies.authenticate);
    version = await rpc(current, "finish_map_verification", {
      p_version_id: versionId,
      p_size_bytes: actual.size,
      p_crc64: actual.crc64,
    });
    if (version.status === "failed") {
      throw new HttpError(
        409,
        "map_verification_mismatch",
        "Stored map size or checksum does not match the upload request.",
        { version: publicVersion(version) },
      );
    }
    return json({ version: publicVersion(version) });
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("pragma", "no-cache");
  return response;
}
