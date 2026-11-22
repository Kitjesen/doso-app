# DOSO backend preparation

This directory prepares a new, independent Supabase deployment from the official
`self-hosted/v0.8.3` source release. The source preparation command does not start services or generate secrets,
copy production accounts, apply SQL, deploy DOSO functions, or switch the App.

`prepare-shadow-env.py` is a separate, not-yet-executed Linux-root tool for the
approved independent test backend. It verifies the locked `.env.example`, runs
`generate-shadow-keys.mjs` through private pipes in an already downloaded, fixed
Node container without network or container logging, and exclusively creates a
0600 `.env` in a new root-owned 0700 empty directory. It never overwrites an
environment, reads old account credentials or prints generated values. Node
verifies generated ES256 signatures; Python rechecks HS256 signatures and the
ES256/JWK structure. Timeout cleanup uses only this run's private, validated CID;
uncertain cleanup is reported as a failure. Tests use ephemeral in-memory values:

```sh
node --test deploy/backend/generate-shadow-keys.test.mjs
python3 -B deploy/backend/prepare-shadow-env.test.py
```

The tool leaves every SMTP example unset and returns `pending_smtp` with
`can_start=false`. Real DirectMail configuration and approval to save new test
credentials at the reviewed server path are still required before deployment.
Do not run the upstream key-generation shell scripts: they expose secrets in
process arguments. See the runbook for the current five-layer image overlay;
the four-layer preparation example below alone is not the final launch command.

`bootstrap-host.sh` is a separate, reviewed first-install tool for the inspected
Ubuntu 22.04 amd64 Shanghai host. It installs the official Ubuntu Docker packages
after guarded checks and a package simulation, then verifies the existing website
and Nginx configuration are unchanged. It rejects an existing container setup;
do not rerun it on the host after the recorded successful installation. Docker's
normal internal bridge/NAT behavior is retained. Raw diagnostics stay root-only.
Its focused checks run with `node --test deploy/backend/bootstrap-host.test.mjs`.
The preparation commands below do not execute that installer.

```sh
node deploy/backend/prepare.mjs
node --test deploy/backend/prepare.test.mjs
node deploy/backend/prepare.mjs --output /absolute/path/to/a-new-directory
```

The output parent must already exist; the output directory must not exist.
`package-manifest.json` confirms verified source preparation, not a working or
production-ready backend. Keep incomplete directories out of deployment.

Use the [deployment and migration runbook](../../docs/production/DOSO_BACKEND_DEPLOYMENT.md)
for the target server, HTTPS, protected environment, OTP mail templates,
matching SQL/Functions baseline, account preservation and acceptance gates.

The prepared output includes four DOSO templates. On a new host without an
existing web server, merge the upstream base, upstream Caddy configuration and
`doso/compose.doso.yml`. On the inspected Shanghai host, retain its existing
Nginx website and append the fourth layer from inside the generated `docker/`:

```sh
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.caddy.yml \
  -f doso/compose.doso.yml \
  -f doso/compose.host-nginx.yml config --quiet
```

This last layer publishes only `127.0.0.1:18000`, excludes Caddy by default and
removes its ports even if its manual profile is enabled. Never start the base
alone: it publishes internal ports. Compose must support `!reset` and `!override`
(2.24.4 or later). The command validates configuration; it starts no services.

`nginx.doso.conf.example` is a separate HTTPS site template, not a replacement
for existing sites. It still requires an approved domain and trusted certificate.
Its dedicated access log contains only method, status, upstream status and timing;
raw errors are not persisted because callback URLs may contain authentication
codes. The existing site's configuration and logs are unaffected.

Both proxy templates expose the reviewed DOSO session function only; add other
business functions after review. Studio, MCP and the default hello function stay
private. Local tests and Compose parsing do not prove Nginx syntax, image
availability, runtime health, mail delivery or successful account migration.
