# HMP Expo2027 standalone Docker deployment

This target runs the actual website HTML, scripts, images and admin dashboard with the existing `app/api/expo` and `app/api/qr` handlers. The build replaces only the Cloudflare D1 database adapter with a persistent SQLite adapter using Node's built-in SQLite and Drizzle's async proxy interface. The original Cloudflare/Vinext target remains available.

Build from the project root after installing locked dependencies:

```sh
node deploy/build.mjs
ADMIN_AUTH_FILE=/absolute/private/admin-auth.json PUBLIC_ORIGIN=https://your-host docker compose -f deploy/compose.yaml up -d --build
```

The service listens on **127.0.0.1:18081** only. Image version: `hmp-expo2027:1.1.14`. A named Docker volume stores `/data/expo.sqlite`. The container runs as the unprivileged node user, with a read-only root filesystem, dropped capabilities, resource limits, log rotation, restart policy and database-aware health check. Schema migrations are transactional and each runs once, including account tables and registration ownership. Source assets and the compiled API bundle are copied into the image; node_modules and local data are excluded.

## Authentication and access

**The website is public.** Organizer access uses the branded `/admin/login` page. The application checks a salted scrypt password hash loaded from a read-only secret mount; plaintext credentials are not embedded in frontend code or the image. Random opaque session cookies are HttpOnly, SameSite=Strict and Secure on HTTPS, expire after eight hours and are invalidated on sign-out. Sessions persist in SQLite across restarts, but changing the credential hash invalidates them. Management POST requests require the matching Origin header. Login attempts are throttled by the application and Nginx. Unauthenticated `/admin` requests redirect to the login page; the management API returns JSON 401 without a browser authentication prompt.

Visitors can browse anonymously. Creating a registration and retrieving its pass require an attendee account. `/api/account/*` provides sign-up, sign-in, profile, My passes and in-app notifications; `/api/public/expo` serves published settings and owner-authorized registrations/pass retrieval. Public responses exclude attendee email, phone, submitted details, payment references and the organizer list. Organizer action payloads are rejected. Public API requests are rate-limited. Configure TLS and certificate renewal in your reverse proxy for your own hostname. Keep server-specific configuration and credentials outside this repository.

The deployment starts with a fresh server database. Local development registrations and settings are not uploaded.

## Operations

From `/srv/expo/app`:

```sh
docker compose --env-file /srv/expo/private/runtime.env -f deploy/compose.yaml ps
docker compose --env-file /srv/expo/private/runtime.env -f deploy/compose.yaml logs --tail=100 expo
docker compose --env-file /srv/expo/private/runtime.env -f deploy/compose.yaml exec -T expo node backup.mjs
```

Backup output is inside the named volume under `/data/backups`; copy backups off-server for disaster recovery. Do not use `docker compose down -v` unless intentionally deleting the database. To update, preserve the named volume, build a new image from a new release, and recreate this service only. Keep the prior release/image to roll back application code; restore a backup separately if a future schema change requires it.

## Local runtime verification

```sh
node deploy/build.mjs
ADMIN_AUTH_FILE=/tmp/expo-qa-auth.json DATABASE_PATH=/tmp/expo-qa.sqlite PORT=5174 PUBLIC_ORIGIN=http://127.0.0.1:5174 node deploy/build/server.mjs
# In another terminal:
TEST_ACCESS_FILE=/tmp/expo-qa-access.json node deploy/smoke-test.mjs
```

Before local testing, supply a disposable auth JSON with `username`, a random 16-byte hex `salt`, and a 64-byte scrypt hex `passwordHash`. The access JSON contains the matching `username` and `password` and must remain outside the repository with restrictive permissions. `deploy/auth-smoke-test.mjs` checks login/session protections; `deploy/public-smoke-test.mjs` checks anonymous visitor operations. The workflow smoke test writes clearly labelled QA registrations. Use a disposable database. It covers pages/assets, all four registration types, duplicates, saved pass lookup, QR rendering, payment/approval updates, concurrent check-in, invalid input and hidden file rejection.

## Attendee accounts (release 20261027-6)

The existing hamburger menu contains sign in/create account, or My profile, My passes, Notifications and Sign out. All four registration types are owned by a persistent attendee user. Passwords use salted scrypt hashes; session tokens are stored hashed and expire after 30 days. Registration contacts come from the account profile. A user can save one pass per category.

Existing registrations are preserved. An attendee can add a legacy pass using its original pass ID and matching account email; records are never automatically assigned based on email alone. Email addresses are not verified, and password recovery requires a future delivery-provider integration.

Organizer account management shows saved accounts and allows targeted or all-account in-app messages. Approval, quotation, payment and check-in changes create account notifications. Email update consent is stored; email/SMS delivery is not connected. The organizer login stays separate.

Account endpoints are implemented for the standalone Node/Docker runtime. For local account development use the bundled standalone server with a separate test database; the original Vinext/Cloudflare target does not implement these endpoints.

Verification: `deploy/attendee-smoke-test.mjs` replaces anonymous-registration assumptions in the older smoke scripts. The local isolated database run passed 98 assertions, including legacy pass linking, account isolation, all categories, notifications, profile updates and organizer access. Desktop and 390px mobile account screens were checked in the local preview.

## Direct registration forms (20261028-1)

Get Tickets, Delegate, Exhibitor and Sponsor actions open their existing registration form directly. There is no separate Create Account screen or menu action. Guests set a password inside the category form; submission saves their account and then the owned registration. Existing users can sign in from the form and keep their draft fields. Profile, My passes and notifications remain available. No backend schema or access rules changed in this release.

All four forms were submitted through the local browser and appeared in My passes. Inline sign-in preserved the exhibitor draft.

## Email or phone sign-in

Attendees can sign in using an email address or their saved phone number plus the same password. Formatting spaces, brackets and hyphens are ignored; Indian mobile numbers work with or without +91. Signup and profile updates now reject phone numbers already used by another account. Existing email/password clients remain supported. No database migration is required. `node deploy/phone-login-smoke-test.mjs` passed 20 local assertions.

## Mobile QR check-in

Organizer dashboard → Verify & Check In → Scan QR with camera. The browser requests camera access only after the organizer taps the button, prefers the rear camera and stops it when scanning succeeds, the organizer leaves the tab, signs out, hides the page or taps Stop camera. Use HTTPS. A QR image can also be selected and decoded locally; manual ID entry remains available.

The decoder is vendored jsQR 1.4.0 (Apache-2.0; license in public/vendor). Camera frames and image files are processed in the browser; only the parsed pass ID is used for verification. Pass ID/QR links are validated and links are never navigated. Verification refreshes organizer records from the protected API. Check-in requires an explicit confirmation; server approval/payment/duplicate guards remain authoritative.

Validation: 24 QR parser, decoder, camera lifecycle and permission-handling assertions; browser QR image scan, check-in and blocked pending/unpaid pass checks; mobile layout inspection. Physical camera hardware was not exercised in the test environment.

## Short manual pass codes

Each registration has a persistent globally unique eight-character hexadecimal short_code. Migration 0002 adds a nullable column and unique index; startup backfills old passes transactionally. Codes are generated with random bytes and collision retries. The original registration ID, attendee link, QR URL and check-in state remain unchanged.

Passes and My passes cards show the short code. The organizer can type it, with optional spaces/hyphen or lowercase, in Verify & Check In. Full IDs and QR links remain accepted. Organizer verification resolves the code against freshly loaded protected records; check-in still uses the full ID and existing server guards. CSV exports include both values. Legacy pass claiming accepts a short code only with the matching authenticated account email. Anonymous short-code lookup is not provided.

Validation: 98 account/ownership checks, 24 decoder/camera checks, 14 migration/uniqueness/stability/legacy-claim checks, and browser manual short-code check-in plus old full-ID compatibility.

## Duplicate account and pass protection

Migration 0003 adds a unique index on canonical attendee phone numbers. Spaces, brackets, hyphens and plus signs are ignored; Indian mobile numbers with/without 91 share one key. Existing stored values stay unchanged. Audit duplicate groups before deployment; resolve any existing conflict with the organizer instead of merging accounts automatically. Email uniqueness remains case insensitive. Signup checks both fields and returns the same clear duplicate-account message; database uniqueness protects simultaneous requests. Profile changes cannot adopt another account's phone.

Repeat registration in an owned category now returns HTTP 409 ALREADY_REGISTERED and a My passes link instead of silently returning the previous pass. Separate categories remain permitted. The existing unique user/category index remains authoritative. Local validation: 98 attendee assertions, 20 email/phone login assertions, 21 duplicate/normalization/profile/concurrency/index/repeat-category assertions, and browser duplicate-account and repeat-visitor message checks.
