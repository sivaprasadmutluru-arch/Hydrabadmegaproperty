# Hyderabad Mega Property Expo 2027 — complete source

This archive contains the editable website, organizer dashboard, backend API, database schema and migration, animation code, sample datasets, local images, dependency lockfile and build tooling. It is the source for the updated owner-private Site, not only an HTML mockup.

## Start here

- `public/expo.html`: page structure, navigation, footer and registration/pass dialogs.
- `public/reference.css`: current page styling and responsive layouts.
- `public/reference.js`: light-tunnel animation, counters, sticky header and programme tabs.
- `public/examples.js`: company filters, example sponsors/delegates, menu flyouts and footer policy dialogs.
- `public/sample-data.json`: editable examples. Company names are real; event affiliations are illustrative. Delegate names, companies and email addresses are fictional.
- `public/admin.html`: registration management, approvals, quotation/payment tracking, check-in, CSV export and event settings.
- `app/api/expo/route.ts`: database-backed application and organizer operations.
- `app/api/qr/route.ts`: server-rendered SVG QR codes.
- `db/schema.ts`, `db/index.ts`, `drizzle/`: database model, access and schema migration.
- `app/page.tsx`, `app/layout.tsx`: application entry points and metadata.
- `worker/`, `vite.config.ts`, `scripts/`, `vendor/`: runtime and build support.
- `pnpm-lock.yaml`, `package.json`: locked dependencies and commands.
- `SAMPLE_CONTENT_SOURCES.md`: official reference websites for company examples.

## Requirements

Node.js 22.13 or later, pnpm 11.25, and internet access for dependencies. The runtime uses Vinext/React and Cloudflare Workers with a D1 database. Google Fonts are requested by the browser; photography is included in `public/`.

## Install and build

From the extracted project directory:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm run build
```

Build once before applying the database migration, because this generates the local Wrangler configuration.

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_marvelous_johnny_blaze.sql
pnpm run dev
```

Open the local URL printed by the dev server. The portable development profile normally uses port 5173. Only apply the migration once to a new database. The local preview database is separate from hosted records.

For the built production-style local preview:

```bash
pnpm run start
```

Use the printed URL; this preview also uses the local database. No live attendee data or database exports are included in this archive.

## Quick visual-only preview

To inspect the HTML/CSS/animation without installing the full framework:

```bash
python3 -m http.server 8080 --directory public
```

Visit `http://localhost:8080/expo.html`. This mode displays the frontend and examples only. Registration, pass generation and admin data require the backend and D1 setup above.

## Organizer workflow

1. Open the website and register a visitor, delegate, exhibitor or partner enquiry.
2. Keep the resulting pass/application ID. Existing email/category combinations return the same registration.
3. Open `/admin.html`. Manage approvals, quotation amounts and payment references.
4. Only record Paid after verification with the bank/payment provider.
5. Verify the pass ID under Verify & Check In. Entry requires approval and cleared payment where applicable. A pass can be checked in once.
6. Export the current filtered registration list to CSV.
7. Event Settings stores the date, venue, organizer contact and optional HTTPS hosted payment link.

## Access and deployment

The current hosted release is OWNER-PRIVATE. Its hosting platform provides the access boundary for the website, admin dashboard and API. There is no separate hard-coded admin username/password. This archive contains no login credentials or deployment tokens.

Keep owner-private access when updating the existing Site. `.openai/hosting.json` records its Site project ID and the `DB` binding. Use the Sites source workflow to publish to that same project; it applies hosted migrations.

Before independently publishing a public visitor site, implement server-side administrator authorization on every organizer API operation and separate public registration/pass access from organizer data. The current API returns the organizer list within the private access boundary. Do not make that API public unchanged. Public multi-user access and live payment webhooks are additional deployment work, not enabled in this release.

If deploying outside Sites, provision a Cloudflare Worker and D1 database, preserve the `DB` binding, apply the schema migration and configure authentication for that hosting environment. Sites authentication does not automatically transfer to a separate host.

## Payments

The application supports manual quotations, status/reference recording and an optional hosted provider payment link. It does not collect card data, create payment orders, verify settlement automatically, generate tax invoices or process refunds. Add the chosen provider's credentials and verified webhook integration before enabling automatic paid booking. Prices and stall allocations remain organizer-confirmed.

## Example content

`public/sample-data.json` supplies:

- Hyderabad examples: My Home Constructions and Aparna Constructions.
- Dubai examples: Emaar Properties, DAMAC Properties and Sobha Realty.
- Illustrative sponsor-tier placements using the same company names.
- Four fictional delegates with reserved `example.com` email addresses.

All examples are labelled on the website. They are not inserted into the live registration database, do not imply endorsement and must not be represented as confirmed participants. Replace these examples after actual confirmation. Generic text presentations are used rather than official company logo assets.

## Included and excluded

All application source and required local assets are included. Dependency installations (`node_modules`), generated build output (`dist`), repository history, cache/runtime state, credentials and live registration data are excluded. Recreate the build from the supplied lockfile. The GITEX reference informed the design; its proprietary video, logos and source code are not bundled. The light tunnel is independently implemented in canvas.
