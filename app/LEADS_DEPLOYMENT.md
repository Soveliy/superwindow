# Leads release — 2026-09-24

Published UI: https://aspro.galereyaokon.com/calc/leads

## Installed

- All six root mockups reviewed; lead cards/filters/details, installation and delivery layouts aligned. Light/dark themes retained. Mobile layouts checked at 414px and 320px.
- `Лиды` added to the shared bottom navigation and calculator. Calculator price/save panel sits above navigation.
- Production uses remote API, no demo fallback. Existing `B24Leads` (HL10) and `B24Works` (HL11) reused; existing field types/data preserved.
- Missing fields, four auxiliary HL blocks, indexes and three Sale order properties installed additively. Installer's final dry run reported no pending operations/errors.
- Existing private `Bitrix24.php` and its credentials were not replaced. Outbox uses this transport with current-state reconciliation and acknowledgement validation.
- Old `hl_*` routes retain their response envelopes through the compatibility bridge. Mutations require POST, session, ownership and CSRF. B24 import/sync require POST and admin+CSRF or the configured integration key.
- Bitrix agent `swLeadWorkerAgent();` ID921 is active, interval300. Hosting exposes no CLI crontab; `agents_use_crontab=N`, `check_agents=Y`. The agent runs on site hits, so the interval is not a strict wall-clock guarantee.

## Verification

- Production TypeScript/Vite build and PHP lint passed.
- Offline B24 adapter regressions (13), legacy bridge contract checks (28), repository/date compatibility checks passed.
- Server read-only checks: storage, legacy date/type/money filters, masked contacts and ownership passed.
- Server transactional smoke: three synthetic workflows (measurement/installation/delivery), take conflicts/retries, deadlines, legacy work reassignment, scheduling, real PNG upload, completion and idempotent retry passed. Database rollback and deletion of both test photos verified. No B24 requests were sent by smoke tests.
- Initial three leads and one work order preserved after tests/deployment. Automatic deadline processing subsequently follows the configured business rules.
- Live HTTPS: `/calc/leads` and bundle return200; anonymous new/legacy API requests return401; GET mutation returns405. Production dealer login/UI mutations were not exercised because no dealer login was supplied; browser workflow QA used the local demo and real storage was tested through the transactional smoke.

## Backup / deployment scope

Server backup: `/home/g/galereya/backups/superwindow-leads-20260924/`.
Contains `application.tar.gz`, `database.sql`, per-file pre-publish snapshots and install/deployment/HTTP verification reports. Backup is outside the web root.

Published root: `/home/g/galereya/aspro.galereyaokon.com/public_html`.
Only the built calculator and selected API/config/service/worker files were published. Existing User/Basket/SMSC/Bitrix24 controllers and old hashed assets were retained. The production OrderController SMS hook was preserved; for lead conversion its phone comes from the trusted lead context. The pre-existing local draft's unrelated SMS-hook deletion was not deployed.

## Remaining configuration

- Optional: set an import key outside source control and update B24 robots to the authenticated POST contract if immediate robot-driven delivery is required. Automatic new-lead discovery is now enabled without a separate robot (see below).
- Provide B24 stages for `cancelled` and `expired`. Their outbox events remain retryable without exhausting attempts. `DT1058_75:FAIL` means **Converted**, not Cancelled, and is never used as cancellation.
- Configure eligible dealer groups/region resolver for new-lead broadcast notifications. Empty configuration intentionally sends no broadcast.
- External push/SMS/email notification adapters are not enabled; in-app notifications and channel preferences work. The existing order SMS hook is separate and retained.

See [BACKEND_CONTRACT.md](BACKEND_CONTRACT.md) for endpoints, runtime configuration and repeatable smoke commands.

## Follow-up: automatic CRM discovery enabled

- Published `LeadB24ImportService`, the atomic create-only service method, worker integration and CLI `cron/import_b24.php`.
- Enabled `SUPERWINDOW_B24_IMPORT_ENABLED=true` in the server runtime. The existing 300-second Bitrix agent now also discovers new published records from entity1058/category75. Page-hit scheduling still applies.
- Existing records are never overwritten. Fresh CRM candidates must still be published, unassigned and unexpired; suggested CRM dates stay metadata and do not fulfil the dealer's scheduling obligation. Pagination, per-run limits, locking and persisted retry/backoff are included.
- Real CRM dry-run and enabled apply both succeeded: 2 published IDs found, both already present, 0 created, 0 errors. Cursor reset to0; persisted status reports enabled with no failures.
- Offline discovery suite: 48 enabled +5 disabled assertions passed. Real transactional smoke also confirmed create → take → changed repeated import preserves the entire existing row and all related counts. All synthetic rows/files rolled back/removed, no CRM mutations in the smoke test.
- Before this follow-up, the existing worker had already run and its outbox contained one acknowledged `sent` event, confirming real outbound transport operation.
- API and live frontend HTTP verification passed after deployment. During initial runtime activation a configuration syntax error briefly caused API500; the runtime was immediately restored, insertion was corrected and pre-rename PHP lint added. Final activation and all HTTP checks passed.
- Incremental source/runtime backups: `/home/g/galereya/backups/superwindow-b24-import-20260924/`.

Discovery does not refresh already imported customer/project fields or infer cancellation/deletion from CRM list disappearance. Cancellation/expiry mappings and external notification transports still require the configuration listed above.

## Follow-up: missing CRM properties repaired

- Live `crm.item.fields` confirmed that product, budget, reward and expiry IDs differed from the prototype. The shared inbound/outbound mapper now uses the actual schema, with absent-key legacy fallback, exact product enum labels (`1` / `2`), safe money parsing and current-field precedence even for null/false.
- Composite Bitrix addresses are split into readable text, validated coordinates and safe location metadata. No city/region is guessed. Source file IDs are retained safely; authenticated file download remains unimplemented. All five inspected CRM records had no files.
- Published only six backend files: config, adapter, sync controller, importer, bounded repair service and its CLI. Runtime, frontend bundle, private helper and unrelated controllers were unchanged. Backup: `/home/g/galereya/backups/superwindow-fieldmap-20260924/`, including the five pre-repair row snapshots outside the web root with0600 permissions.
- Dry-run checked CRM IDs1,3,5,11,15. Raw source JSON was validated before repair. Applied to1,5,11,15: four records enriched, no workflow/owner/date changes. The repeated dry-run reported four unchanged records and no errors. No CRM updates or notifications were emitted by repair.
- The screenshot record CRM15 / portal19 now has the correct product/reward and clean address/coordinates. Name, phone and comment already matched CRM; their pre-take masking remains intact. Budget, explicit expiry and files were empty in CRM; the existing default expiry was preserved.
- Remaining exceptions: CRM3 / portal2 was **not** modified because its active linked work belongs to a different dealer (`repair_work_owner_conflict`). CRM5 / portal3 received product/reward only; its locally differing address was preserved. Resolve the owner conflict and review address provenance before any broader refresh.
- PHP lint and offline adapter/import/mapping/repair suites passed (repair111 assertions). Staged server transactional smoke passed all three workflows, import immutability, rollback and cleanup of two synthetic photos, with zero external calls. The legacy transport includes production controllers, so a staged real-CRM repair preview causes duplicate declarations; the actual preview/apply ran from the deployed path and passed as above.
- Post-deployment checks: protected fields unchanged for all five leads and linked works; fresh CRM target comparison matched; discovery dry-run succeeded; HTTPS UI/bundle200, anonymous API401 and GET mutation405. No production dealer browser login was exercised.

## Follow-up: Yandex Maps

- Replaced OpenStreetMap point links, embedded map and delivery directions with Yandex Maps. Address-only fallback opens Yandex search; explicit map images and private-field masking remain unchanged.
- Shared URL helpers validate complete finite coordinates and ranges, preserve zero and coordinate precision, and use longitude/latitude for map centers/markers versus latitude/longitude for driving routes.
- `npm run test:maps` (5 tests) and production build passed. Browser verification showed an actual Yandex map and marker using a public test point in Moscow.
- Published only `assets/index-B2CxrxB4.js`, `index.html` and `sw.js`; previous assets retained for existing clients. Frontend rollback snapshots: `/home/g/galereya/backups/superwindow-yandex-20260924/`. Backend and CRM data unchanged.
