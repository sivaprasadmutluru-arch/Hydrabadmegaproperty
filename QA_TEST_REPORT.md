# Application test report

Tested 27 October 2026 against http://127.0.0.1:5173 using the local Cloudflare D1 database in `.wrangler/state`. Hosted data and deployment were untouched.

## Results

- All four categories submitted through browser forms: visitor, delegate, exhibitor, sponsor.
- Visitor automatically approved with no payment required. Other categories initially pending with quotation required.
- Four records persisted, with working pass IDs, SVG QR images, direct pass links and retrieval.
- Duplicate submissions reused the existing pass for the same email/category.
- Dashboard filters, details editor, approval changes, quotation/payment references and simulated payment status updates worked.
- Pending and unpaid passes could not check in. Approved, paid passes could check in. Repeat check-in was rejected. Five concurrent check-in requests produced one success and four conflicts.
- CSV export downloaded and contained all four filtered test records with the correct column values.
- Temporary event dates, venue, organizer contact and HTTPS payment URL were saved; dates, venue and contact were verified in the website. No payment was made and the payment destination was not opened.
- 26 in-page anchor links had existing targets. Menu navigation closed the menu and navigated to the section.
- All 40 source registration buttons referenced supported registration categories. Representative browser actions for each category were submitted. The standard-stall CTA preselected Standard Stall.
- Company filters returned two Hyderabad and three Dubai companies. All-companies reset worked.
- All three programme tabs and keyboard Home navigation worked.
- Three footer policy dialogs opened and closed.
- Four FAQ accordions expanded. Animation pause and resume worked.
- Local website, dashboard, stylesheet/scripts, sample data, favicon, logo and photography responded successfully.
- External company links: My Home, Aparna, Emaar and Sobha returned HTTP 200. DAMAC returned HTTP 403 to the automated request; browser access to that external destination was not verified.
- Final production build and extracted inline JavaScript syntax check passed.
- Final API regression: **37 / 37 passed**. Detailed assertions are in `QA_API_RESULTS.json`.

## Fixes made during testing

1. Malformed JSON / wrong input types now return HTTP 400 instead of HTTP 500.
2. Updating an unknown registration now returns HTTP 404 instead of reporting success.
3. Unsupported or incomplete organizer actions return a specific HTTP 400 error.
4. Phone field pattern now works with the browser's current HTML pattern syntax; an invalid number fails and a valid formatted number passes.
5. Find My Pass now uses an on-page dialog instead of the browser prompt that failed in the in-app preview. Valid lowercase IDs are normalized and retrieve the pass. Unknown IDs display an inline error. Retrieved passes lock background scrolling until closed.

## Cleanup and limits

The four clearly labelled QA records were deleted after testing. Temporary settings were restored to their original empty configuration. Final API output confirmed `records: []` and `settings: "{}"`.

These checks cover local functionality and the browser preview. They do not verify hosted authentication, production deployment, real bank settlement, a physical QR scanner, or the operating-system print/PDF dialog. Payment reconciliation remains manual by design. This was not a full security, accessibility, load, or cross-browser audit.
