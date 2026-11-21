# Shanghai account-sessions runtime increment

This is an offline, versioned deployment input, not a claim of a running service.
It adds the existing `account-sessions` handler to the already verified Auth/REST
gateway. It changes only `api-gw` and `functions`; the four core containers,
website, Auth accounts, data and mail configuration must stay intact.

## Runtime files and source identity

Install exactly `manifest.json` and its 11 listed files under:

`/opt/doso-backend-shadow/runtime-20261027/docker/doso/account-sessions-20261027/`

Use root ownership, directories 0755, public runtime files 0644, and overlay and
manifest 0600. The directory contains no actual credentials. Copy the handler
and four shared files byte-for-byte from the pinned local snapshots; recheck the
manifest against current repository sources before deployment to reject drift.
The official main and `deno.jsonc` are unchanged at the locked upstream commit.
The `dependency-probe/` directory is not in the production handler tree.

The service image is the already cached amd64 digest:

`public.ecr.aws/supabase/edge-runtime@sha256:fded42ff725708990b1a0803633c2659453259d075c4bec6b4d01dfb82dc055e`

Do not rebuild, pull another tag, expose host ports or start other services.

## Effective model and startup order

Append `doso/account-sessions-20261027/compose.account-sessions.yml` as layer 10,
after the six frozen layers, OTP6, compact-mail and gateway-loopback layers.
Validate the effective model in memory without printing it. Only these changes
are allowed relative to layer 9:

- `api-gw`: the `/etc/envoy/cds.yaml` and `/etc/envoy/lds.template.yaml` bind sources
  change to this versioned directory. Its bootstrap, validator, image, keys,
  security controls, dependencies and sole host port remain identical.
- `functions`: fixed image, read-only handler bind plus the existing project
  `deno-cache` named volume, required environment and restricted resources.
  Inherit the official main command, healthcheck and default image user.
  Verify the actual pinned image's entrypoint/user before executing; the cache
  target follows upstream `/root/.cache/deno` and must be writable for that user.

The gateway adds exactly `/functions/v1/account-sessions` and rewrites it to
`/account-sessions`. Keeping the old `/` rewrite with an exact match would remove
the function name. Query strings still work; action subpaths, trailing slashes,
other functions and all previously closed routes remain 404. All 12 existing
Auth/REST routes and the complete HTTP-filter suffix remain byte-identical;
only the unchanged official Functions cluster is added.

`VERIFY_JWT=false` matches the reviewed DOSO handler contract. The official
router does not need JWT signing material in that mode. The handler still
calls Auth `getUser`, checks the active application profile, and requires the
caller's real Auth-session/terminal RLS authority. Registration alone skips the
already-registered-terminal check; it still requires the real Auth session.
Only the necessary service and anon keys are supplied server-side; the database
password and JWT signing keys are not passed to the worker. Do not enable a
privileged fallback or put the service key in App configuration.

After the dependency probe below and a guarded bootstrap validation:

```python
# All ten layers are already in `compose`; --no-deps avoids touching api-gw here.
docker.run(compose + [
    'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
    '--wait-timeout', '60', 'functions',
], timeout=90)
# Recreate only the gateway to attach the new immutable LDS/CDS files.
docker.run(compose + [
    'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
    '--wait-timeout', '60', 'api-gw',
], timeout=90)
```

Functions can start while the old Auth/REST gateway is healthy. It makes no
account calls until a request arrives. The gateway container ID is expected to
change; core four IDs/start times/env/mounts must not. Verify six final healthy
project services and compare website/frozen-runtime fingerprints. No public
HTTPS, firewall, DNS, SQL or App operation belongs to this increment.

## Credential-free runtime/import probe

The official main imports `jsr:@panva/jose@6`; the handler imports
`npm:@supabase/supabase-js@2.112.3`. The JSR major range is upstream's unchanged
contract, so the server must resolve it with normal certificate verification;
local source tests do not prove cache availability or module integrity on host.

Before starting the real Functions container, use the reviewed Unix-socket
Docker client to inspect the exact cached image's platform and entrypoint.
Inspect the project `deno-cache` volume; if absent, create only that local volume
with the standard project and volume labels. Reject external or mismatched
existing volumes. Do not erase or recreate its content. Its expected name is
`doso-backend-shadow_deno-cache`, subject to effective-model verification.

Run one disposable container with the same image, cache and tmpfs, but **without
any Compose environment, Auth keys, database URL or real account request**:

```python
# IMAGE is the manifest's functions_image. DIR is the versioned server directory.
# Use a fresh nonce, cidfile in the trusted private /run directory, and verify
# the matching labels/ID before cleanup if the start command times out.
probe_args = [
    'run', '--detach', '--pull', 'never', '--name', probe_name,
    '--cidfile', private + '/functions-probe.cid',
    '--label', 'com.docker.compose.project=doso-backend-shadow',
    '--label', 'com.docker.compose.service=functions-dependency-probe',
    '--label', 'io.doso.functions-dependency-probe=' + nonce,
    '--network', 'doso-backend-shadow_default', '--log-driver', 'none',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--ulimit', 'core=0:0', '--memory', '512m', '--memory-swap', '512m',
    '--cpus', '1', '--pids-limit', '128',
    '--mount', 'type=bind,src=' + DIR + '/dependency-probe,dst=/home/deno/probe,readonly',
    '--mount', 'type=volume,src=doso-backend-shadow_deno-cache,dst=/root/.cache/deno',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16777216,mode=0700',
    '--env', 'DENO_DIR=/root/.cache/deno',
    IMAGE, 'start', '--main-service', '/home/deno/probe',
]
```

No Compose profile is needed, and no port is published. Inspect only its network
address within the verified private network, then make a bounded internal GET
on port 9000. Require exactly:

```json
{"status":"doso_function_imports_ready","jose":true,"supabase":true}
```

An import failure, exited container or one bounded startup deadline is a stop,
not permission to repeat starts indefinitely or disable TLS. Always remove only
the positively identified disposable probe in `finally`, leaving the cache for
the real runtime. Its success only proves these imports can resolve, not that
the handler, gateway route or authenticated workflow works.

## Live acceptance required from the owner

After the real handler is running, use bounded requests through the loopback
API gateway and fixed-field responses only. Do not log bearer/key values or full
user/terminal rows. Basic non-mutating checks:

| Request | Expected |
| --- | --- |
| GET account-sessions, no bearer | Handler 401 `missing_authorization` |
| GET account-sessions, valid anon key and invalid bearer | Handler 401 `invalid_authorization` |
| GET another function or an account-sessions action subpath | 404 |
| Existing Auth and REST success/invalid-key matrix | Previous results preserved |

A 401 emitted by the shared handler proves worker imports and routing, unlike a
TCP healthcheck or gateway-level rejection. Positive register/profile/heartbeat
and current-session logout require the real retained test user's locally
entered password/token. Do not mint fake JWTs for a positive test and do not
re-register, reset or delete that Auth user. Test native token refresh/restart
and App preparation separately. Mail worker stays uninstalled.

If startup fails, preserve the state and inspect fixed metadata first. To revert
only the gateway after review, apply its original nine-layer model and target
`api-gw` alone; do not use `down`, prune, remove volumes or overwrite old files.

## Offline verification

```text
node --test deploy/backend/account-sessions-20261027/account-sessions.test.mjs
```

This checks source hashes, exact route/rewrite, unchanged filters/clusters,
Compose boundaries, the renderer contract, and probe TypeScript syntax. Actual
Docker mounts/cache/JIT behavior, dependency resolution, handler HTTP, public
HTTPS, authenticated App flows and G20 are not verified by these files.
