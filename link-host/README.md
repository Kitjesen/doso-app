# DOSO verified auth link host

This directory is a self-contained deployment root for the canonical `https://links.dosorobotics.com` association files and browser fallback pages. Verified iOS Universal Links and Android App Links are the primary route into the App. The browser pages never exchange, display, retain, or forward callback parameters; they scrub the address bar and instruct the user to reopen the official App.

## Build

Supply public production identity values through the deployment environment:

```text
DOSO_APPLE_TEAM_ID=A1B2C3D4E5
DOSO_ANDROID_APP_LINK_FINGERPRINTS=AA:BB:...:FF,11:22:...:00
```

`DOSO_APPLE_TEAM_ID` is the real 10-character Apple Team ID. Android accepts one or more SHA-256 fingerprints separated by commas, semicolons, or newlines. Use the Play App Signing certificate for Play and the actual signing certificate for every other production channel. The repository QA/debug certificate is rejected.

Run `npm run auth-links:build`; output is written to `link-host/dist`. Vercel runs the same self-contained builder as `node build.mjs` from this directory. Missing or invalid identity inputs fail the build. The builder writes a unique sibling staging directory and swaps it into place only after every file succeeds, restoring the previous output if publication fails. No provider flag is changed by this process.

## Deploy and verify

Configure the Vercel project root as `doso-app/link-host`, attach only `links.dosorobotics.com`, inject the two public build variables, and deploy. `vercel.json` defines exact callback rewrites, JSON media types, no-store/no-referrer behavior, CSP, frame denial, HSTS, MIME sniffing protection, and a restrictive permissions policy.

An HTTPS callback query reaches Vercel's edge before browser JavaScript can scrub the address bar. Production therefore permits only Supabase's short-lived, one-time PKCE authorization code in the query. URL fragments are not transmitted in the HTTP request. Before activation, review and configure Vercel request-log, Log Drain/export, observability and retention settings so callback query values are redacted or not retained; browser history scrubbing is not a substitute for edge-log controls.

After deployment run:

```text
npm run auth-links:verify-deployment -- https://links.dosorobotics.com
```

The verifier requires the same two identity environment variables and rejects a deployment whose published identities differ. Then complete Apple CDN/AASA checks, Android Digital Asset Links checks, and real-device exact-path tests before enabling any Apple, WeChat, or QQ provider or client feature flag.
