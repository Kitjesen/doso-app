# Shanghai loopback gateway, phase 1

This directory adds **only Auth and REST** to the existing Shanghai shadow stack.
It is not a public endpoint or an App backend switch. Functions, Storage,
Realtime, GraphQL, Studio, PG Meta and MCP paths return 404 until separately
reviewed and explicitly connected. It does not change schemas or account data.

The candidate image already exists. Do not rebuild or pull it. Its image ID and
the existing wrapper SHA are in `manifest.json`. The original bootstrap is
unchanged; the listener keeps the 12 upstream Auth/REST routes, in order, with
the original HTTP filters byte-for-byte. Its final route is a direct 404.
The two retained clusters are also unchanged upstream blocks. The public-origin
comment preserves the existing wrapper's strict eight-placeholder contract and
origin validation after removing the dashboard route that originally used it.

## Install and compose order

The guarded deployment owner must first verify the pinned core helper, frozen
runtime manifest, candidate image, existing four healthy containers and website.
Install only the five files listed in `manifest.json` plus the manifest under:

`/opt/doso-backend-shadow/runtime-20261027/docker/doso/gateway-loopback-20261027/`

Use a root-owned directory that is traversable by UID 1000 (0755), public
configuration/validator files 0644 and the Compose overlay/manifest 0600. These
files contain **no real credentials**. Never install a rendered `lds.yaml` on
disk: the wrapper creates it as UID 1000, 0600, exclusively in private tmpfs.
The environment remains `/opt/doso-backend-shadow/env/.env` with root-only access.

Append these three entries to the six layers in the trusted `core.Docker.compose`,
in this exact order (the first two are already active and must not be omitted):

```python
for layer in (
    'doso/compose.email-otp-six.yml',
    'doso/mail-layout-20261027/compose.mail-layout.yml',
    'doso/gateway-loopback-20261027/compose.gateway-loopback.yml',
):
    docker.compose.extend(('-f', core.WORK + '/' + layer))
```

Capture `docker.run(docker.compose + ['config', '--format', 'json'])` **in memory**.
Compare the eight-layer before model to the nine-layer after model: only the
`api-gw` service may change. Validate the rootless identity, exact image, restricted
binds, tmpfs, log policy, Auth/REST dependencies and the sole host publication
`127.0.0.1:18000 -> 8000/tcp`. Existing core services must stay byte-identical in
the effective model. Do not print Compose JSON or container environments.

After those checks, these are the exact command suffixes for the existing
guard's private-config, Unix-socket Docker client:

```python
docker.run(docker.compose + [
    'run', '--rm', '--no-deps', '--pull', 'never', '--entrypoint', 'node',
    'api-gw', '/app/validate-config.mjs',
], timeout=30)
docker.run(docker.compose + [
    'up', '--detach', '--no-deps', '--pull', 'never', '--wait',
    '--wait-timeout', '60', 'api-gw',
], timeout=90)
```

The first command creates a disposable container without publishing service
ports. Its real rendered listener stays in container tmpfs; all Envoy diagnostics
are captured then discarded. Its fixed JSON says `dynamic_routes_verified:false`:
Envoy bootstrap validation alone does not prove dynamic LDS/CDS activation.
The second command targets only `api-gw`, leaving the four running services alone.

`core.Docker.verify_started()` intentionally expects exactly four containers, so
do not call it unchanged after adding the gateway. Verify core identities/health
and the new fifth container explicitly; compare the original four IDs, start
times, mounts and the website snapshot before and after. No Nginx reload, public
firewall change, restart of existing services, or DNS operation belongs here.

## Required live acceptance

Make bounded HTTP requests to `http://127.0.0.1:18000`, with redirects disabled.
Read the required keys only into server-process memory and report only status,
expected error codes and booleans. Never log keys, Authorization headers,
full response bodies, tokens or user rows. Use no registration, password, refresh
or logout calls in this non-mutating gateway test.

| Request | Key | Expected result |
| --- | --- | --- |
| `GET /auth/v1/health` | Valid anon or publishable | 200, Auth health JSON |
| `GET /auth/v1/.well-known/jwks.json` | None | 200, valid public JWKS structure |
| `GET /auth/v1/health` | Missing / invalid | 401 |
| `GET /rest/v1/` | Anon or publishable | 403, intentionally service-only OpenAPI |
| `GET /rest/v1/` | Service role or secret | 200, OpenAPI JSON |
| `GET /rest/v1/doso_gateway_probe_absent_20261027` | Valid anon or publishable | 404 and `PGRST205`, proving REST forwarding without reading data |
| Same nonexistent-table request | Missing / invalid | 401 |
| `GET /`, `/pg/`, `/mcp`, `/api/mcp`, `/storage/v1/`, `/realtime/v1/`, `/graphql/v1`, `/functions/v1/account-sessions` | No key and valid anon | 404, never forwarded |

PostgREST error `PGRST205` is evidence of successful forwarding to a missing-table
lookup, not evidence that the App profile/session schema exists. Separately
verify actual schema, RLS, session RPCs and function handlers before switching App.
The TCP health check and `--mode validate` must not be counted as this HTTP pass.

## Local checks

```text
node --test deploy/backend/gateway-loopback-20261027/gateway-loopback.test.mjs deploy/backend/envoy-safe-entrypoint.test.mjs
```

The tests use only fabricated keys, the installed YAML package and the locked
upstream public sources. No new dependency or gateway image is introduced.

Not checked here: real Docker merge/mount behavior, dynamic Envoy startup, live
HTTP route results, public HTTPS, mobile networks or G20 installation.
