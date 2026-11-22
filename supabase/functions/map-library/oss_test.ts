import assert from "node:assert/strict";
import { createOssMapStore } from "./oss.ts";

// The Node SDK reads user-agent and interface details, requiring --allow-sys=osRelease,networkInterfaces.
Deno.test("official OSS SDK signs fixed HTTPS part capabilities with exact content length", async () => {
  const store = await createOssMapStore({
    region: "oss-cn-shanghai",
    bucket: "doso-synthetic-map-test",
    accessKeyId: "SYNTHETIC_ACCESS_KEY",
    accessKeySecret: "synthetic-signing-secret-only",
  });
  const key = "maps/synthetic/version.tar.gz";
  const url = new URL(await store.signPart(key, "synthetic-upload-id", 2, 10));
  assert.equal(url.protocol, "https:");
  assert.equal(
    url.hostname,
    "doso-synthetic-map-test.oss-cn-shanghai.aliyuncs.com",
  );
  assert.equal(url.pathname, "/maps/synthetic/version.tar.gz");
  assert.equal(url.searchParams.get("uploadId"), "synthetic-upload-id");
  assert.equal(url.searchParams.get("partNumber"), "2");
  assert.equal(url.searchParams.get("x-oss-expires"), "300");
  assert.equal(
    url.searchParams.get("x-oss-signature-version"),
    "OSS4-HMAC-SHA256",
  );
  assert.equal(
    url.searchParams.get("x-oss-additional-headers"),
    "content-length",
  );
  assert.match(url.searchParams.get("x-oss-signature")!, /^[a-f0-9]{64}$/);
  const differentLength = new URL(
    await store.signPart(key, "synthetic-upload-id", 2, 11),
  );
  assert.notEqual(
    url.searchParams.get("x-oss-signature"),
    differentLength.searchParams.get("x-oss-signature"),
  );
  const download = new URL(await store.signDownload(key));
  assert.equal(download.protocol, "https:");
  assert.equal(download.pathname, url.pathname);
  assert.equal(download.searchParams.has("uploadId"), false);
  assert.equal(download.searchParams.has("partNumber"), false);
});

Deno.test("invalid OSS configuration fails before loading the SDK", async () => {
  await assert.rejects(
    createOssMapStore({
      region: "https://untrusted.example",
      bucket: "maps",
      accessKeyId: "",
      accessKeySecret: "",
    }),
    /configuration is invalid/,
  );
});
