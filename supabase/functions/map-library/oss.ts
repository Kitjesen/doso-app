import {
  MAP_URL_SECONDS,
  type MapObjectStore,
  type MapPart,
} from "./handler.ts";

type OssOptions = {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
};
type OssClient = {
  initMultipartUpload(
    key: string,
    options: Record<string, unknown>,
  ): Promise<{ uploadId: string }>;
  signatureUrlV4(
    method: string,
    seconds: number,
    request: Record<string, unknown>,
    key: string,
    additionalHeaders?: string[],
  ): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MapPart[],
    options: Record<string, unknown>,
  ): Promise<unknown>;
  head(key: string): Promise<{ res: { headers: Record<string, string> } }>;
  abortMultipartUpload(key: string, uploadId: string): Promise<unknown>;
};

export async function createOssMapStore(
  options: OssOptions,
): Promise<MapObjectStore> {
  if (
    !/^oss-[a-z0-9-]+$/.test(options.region) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(options.bucket) ||
    !options.accessKeyId.trim() || !options.accessKeySecret.trim()
  ) {
    throw new Error("Map object storage configuration is invalid.");
  }
  const { default: OSS } = await import("npm:ali-oss@6.23.0");
  const client: OssClient = new OSS({
    ...options,
    secure: true,
    authorizationV4: true,
    timeout: 15000,
  });
  return {
    async initialize(key) {
      const result = await client.initMultipartUpload(key, {
        mime: "application/gzip",
        headers: { "x-oss-object-acl": "private" },
      });
      if (
        typeof result.uploadId !== "string" || !result.uploadId ||
        result.uploadId.length > 2048
      ) throw new Error("Invalid multipart response.");
      return result.uploadId;
    },
    async signPart(key, uploadId, number, size) {
      return await client.signatureUrlV4(
        "PUT",
        MAP_URL_SECONDS,
        {
          queries: { uploadId, partNumber: String(number) },
          headers: { "content-length": String(size) },
        },
        key,
        ["content-length"],
      );
    },
    async complete(key, uploadId, parts) {
      await client.completeMultipartUpload(key, uploadId, parts, {
        headers: { "x-oss-forbid-overwrite": "true" },
      });
    },
    async head(key) {
      let result;
      try {
        result = await client.head(key);
      } catch (error) {
        const failure = error as { status?: number; code?: string };
        if (failure.status === 404 && failure.code === "NoSuchKey") return null;
        throw error;
      }
      const headers = result.res.headers;
      const rawSize = headers["content-length"],
        crc64 = headers["x-oss-hash-crc64ecma"];
      const size = Number(rawSize);
      if (
        !/^[0-9]+$/.test(rawSize ?? "") || !Number.isSafeInteger(size) ||
        size < 1 ||
        !/^(0|[1-9][0-9]{0,19})$/.test(crc64 ?? "") ||
        BigInt(crc64) > 18446744073709551615n
      ) {
        throw new Error("Object verification headers are unavailable.");
      }
      return { size, crc64 };
    },
    async abort(key, uploadId) {
      await client.abortMultipartUpload(key, uploadId);
    },
    async signDownload(key) {
      return await client.signatureUrlV4("GET", MAP_URL_SECONDS, {}, key);
    },
  };
}

export function configuredMapObjectStore(): Promise<MapObjectStore> {
  const value = (name: string) => Deno.env.get(name)?.trim() ?? "";
  return createOssMapStore({
    region: value("DOSO_MAP_OSS_REGION"),
    bucket: value("DOSO_MAP_OSS_BUCKET"),
    accessKeyId: value("DOSO_MAP_OSS_ACCESS_KEY_ID"),
    accessKeySecret: value("DOSO_MAP_OSS_ACCESS_KEY_SECRET"),
  });
}
