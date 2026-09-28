# Backend Contract

## Authentication

- `POST /local/rest/api/v1/?action=user_login`
- `POST /local/rest/api/v1/?action=user_logout`

## Orders

- `GET /orders`
- `GET /orders/:orderId`
- `POST /orders`
- `PATCH /orders/:orderId`

## Calculator Ajax Handlers

- `POST /local/rest/api/v1/?action=product_add`
- `POST /local/rest/api/v1/?action=product_price`
- `POST /local/rest/api/v1/?action=service_add`
- `POST /local/rest/api/v1/?action=basket_del`
- `POST /local/rest/api/v1/?action=user_register_or_get`
- `POST /local/rest/api/v1/?action=order_create`
- `POST /local/rest/api/v1/?action=order_refresh`
- `POST /local/rest/api/v1/?action=order_payment_update`
- `POST /local/rest/api/v1/?action=order_get`

Payloads are currently sent as JSON.

## Settings

- `GET /settings/production-dates`
- `PATCH /settings/production-dates`
- `GET /profile/me`
- `PATCH /profile/me`

## Notes

- The UI currently keeps drafts in `localStorage`, but window, service, and full-order save actions now also send JSON requests to the REST handlers above.
- The app now uses `/calc/` as the production base path and does not auto-redirect from the root route.

## Leads API (`/local/rest/api/v1/`)

Integration configuration below reflects the 2026-09-24 implementation. The application entry point is
`/calc/` on `galereya.beget.tech` (leads: `/calc/leads`); API handlers stay under `/local/rest/api/v1/`.
The configuration and verification procedure are documented here independently of deployment acceptance.

All endpoints below use the existing query-action router. Successful responses have the form
`{"success":true,"data":...,"meta":...,"requestId":"..."}`. Errors use an appropriate HTTP status and
`{"success":false,"error":{"code":"...","message":"...","details":...},"requestId":"..."}`.

Authenticated mutating requests must include the session cookie and the `token` returned by `user_login`
as `X-Bitrix-Csrf-Token`. Import uses `X-API-Key` instead of a user session. Do not put keys into URLs.

| Action | Method | Purpose |
| --- | --- | --- |
| `leads_list` | GET | `scope=available\|my\|archive`, optional `region`, `type`, `budget_min`, `budget_max`, `search`, pagination |
| `lead_get` | GET | Lead detail by `lead_id` (internal ID or B24 external ID) |
| `lead_take` | POST | Atomically take an available lead; accepts `lead_id`, optional `expected_version` |
| `lead_schedule` | POST | Set the mandatory date within 24 hours; accepts `date`, optional `time_from`, `time_to`, `expected_version`, and writes the type-specific HL date plus normalized `UF_SCHEDULED_AT` |
| `lead_measurement_convert` | POST | Idempotently link a measurement lead to `order_id`; a different second order returns 409 |
| `lead_convert` | POST | Generic idempotent link to `order_id` or `work_order_id` |
| `lead_import` | POST | API-key protected B24 upsert; accepts one lead or `{ "leads": [...] }` and `Idempotency-Key` |
| `work_orders_list` | GET | Dealer-owned work orders, `scope=active\|archive`, optional `type`, `search` |
| `work_order_get` | GET | Dealer-owned work-order detail by `work_order_id` |
| `work_order_update` | POST | Update `plannedVisit`, `status`, `comment`, and/or `reminder` with optimistic version check |
| `work_order_complete` | POST | Complete with `actual_date` and required photos (JSON data URLs or multipart `photos[]`) |
| `notifications_list` | GET | Current dealer notifications |
| `notification_read` | POST | Mark one dealer-owned notification read |
| `notifications_read_all` | POST | Mark current dealer notifications read |
| `lead_notification_preferences_get` | GET | Effective per-dealer preferences and whether persistent storage is installed |
| `lead_notification_preferences_update` | POST | Store channel/event preference matrix |
| `lead_b24_outbox_flush` | POST | Optional HTTP outbox worker protected by `X-Cron-Key`; uses the same persistent outbox as the scheduled worker |

Compatibility aliases are kept in `router.php`: `leads`, `work_orders`, `notifications`, `work_order_plan`,
`lead_convert_measurement`, and `notification_preferences_get/update`.

Existing `hl_leads`, `hl_lead_get`, `hl_leads_my`, `hl_works`, `hl_works_my`, and `hl_work_get` routes are
bridged to the same ownership-checked services by `controllers/LeadLegacyBridge.php`. Legacy mutations
(`hl_lead_take`, `hl_lead_set_date`, `hl_work_date`, `hl_work_complete`, `hl_work_photo_add`) now require
POST, an authenticated session, and CSRF. `b24_lead_import` and `hl_lead_sync` require POST and either an
administrator session with CSRF or a configured import API key. Direct CRM inspection routes are restricted
to administrators. Old public GET mutation links are no longer a supported integration contract.

Lead statuses are `available`, `assigned`, `in_work`, `converted`, `expired`, and `cancelled`. Work-order
statuses are `assigned`, `in_work`, `done`, and `cancelled`; its types are only `installation` and
`delivery`. Scheduling a measurement keeps it `in_work` until the standard order is successfully saved.
Scheduling installation/delivery creates one idempotent work order with initial status `assigned` and converts the lead. Server-side code
that creates the standard order can call
`swLeadConvertMeasurementAfterOrder($leadId, $orderId, $dealerId, $expectedVersion)` after a successful
`$order->save()`; this helper does not consume the HTTP body. The existing `order_create` handler already
does this when `sourceLeadId`/`sourceLeadVersion` are present: it serializes concurrent attempts, copies the
trusted product type, budget, client name, phone, and address from the owner-only lead into Sale order properties,
saves the order, and
then converts the lead. A retry finds the order by `SOURCE_LEAD_ID`, so an interrupted post-save link does not
create a duplicate.

The API returns camelCase objects matching `features/leads/model/leads.types.ts`. An available lead viewed by
a non-owner has both client name and phone masked, and exact address, coordinates, attachments, source data,
and factory notes are excluded. Only the owner (or a configured admin) receives private fields. Ownership is
checked again for every lead, work-order, file-completion, and notification mutation.

Lead responses expose the normalized `scheduledVisit` and, when filled, the exact `measureDate`, `installDate`,
or `deliveryDate`. These map to `UF_MEASURE_DATE`, `UF_INSTALL_DATE`, and `UF_DELIVERY_DATE` respectively.

JPEG, PNG, and WebP completion photos are content-inspected, limited by count/size, stored through `CFile`,
and mandatory for both delivery and installation. Client-provided MIME names are not trusted.

### B24 import example

```json
{
  "externalId": "1042",
  "serviceType": "measurement",
  "measureDate": "2026-09-07T09:00:00+03:00",
  "title": "Окна в квартиру",
  "productType": "ПВХ-окна",
  "customer": { "name": "Иван Иванов", "phone": "+7 900 000-00-00" },
  "location": { "region": "Курская область", "city": "Курск", "address": "..." },
  "budget": { "min": 100000, "max": 150000, "currency": "RUB" },
  "reward": { "amount": 5000, "currency": "RUB" },
  "expiresAt": "2026-09-10T12:00:00+03:00"
}
```

Required headers: `Content-Type: application/json`, `X-API-Key: <environment key>`, and a stable
`Idempotency-Key`. `UF_B24_ENTITY_ID` is unique; retries with the same idempotency key return the existing
result, while later B24 snapshots update source fields without stealing ownership or resetting workflow.
Import payloads are full source snapshots, not partial patches: omitted source/contact fields may be cleared.
CRM may refresh contact, address, product, budget, reward, and note fields. It cannot replace the local dealer,
taken/deadline timestamps, or linked order IDs; an owned lead also keeps its workflow type and planned dates.
Existing work orders retain their captured client/work details. A repeated import does not reopen a local
workflow; explicit cancellation is the supported inbound status transition.
An inbound `cancelled` status also locks and cancels an active linked installation/delivery work order in the
same transaction, writes audit/outbox events, and sends one deduplicated dealer notification. Replaying an old
idempotency key repairs a previously missed linked-order cancellation without duplicating events.

### Existing B24 storage and additive HL setup

The source of truth is `rest/api/v1/config/leads.php`. This installation uses
`SUPERWINDOW_LEADS_LEGACY_B24=true` to reuse existing data:

| Logical storage | Existing HL block | Table | Observed ID |
| --- | --- | --- | --- |
| Leads | `B24Leads` | `b24_leads` | 10 |
| Work orders | `B24Works` | `b24_works` | 11 |

IDs/names can be overridden in configuration. Legacy mode preserves existing field types and values:
string dates remain `DD-MM-YYYY HH:MM:SS`, lead types remain `measure` / `install` / `delivery`, and work
types remain `монтаж` / `доставка`. Both existing blocks use `UF_CLIENT_NAME`. Reads normalize types to
`measurement` / `installation` / `delivery` and dates to API values; date/budget filtering and sorting use
typed SQL expressions rather than lexicographic comparison of legacy strings. Existing string budgets,
rewards and work lead IDs are accepted; integer `UF_B24_ENTITY_ID` requires a positive numeric CRM ID.
New metadata fields can use native datetime/number types alongside the existing fields.

The additional support blocks are:

- `SuperwindowLeadNotifications`
- `SuperwindowLeadAudit`
- `SuperwindowB24Outbox`
- `SuperwindowLeadNotificationPreferences`

Without legacy mode, the standalone defaults are `SuperwindowLeads` and `SuperwindowWorkOrders`.
Do not install those parallel business-data blocks for this existing B24 deployment.

The approved legacy field spellings are preserved: lead type is `UF_LEAD_TYPE`, client name is
`UF_CLIENT_NAME`, dealer is `UF_DILER_ID`, notes are `UF_COMMENT`, and the required-date timestamp is
`UF_REQUIRED_DATE_FILLED_AT`. The three type-specific lead dates are `UF_MEASURE_DATE`, `UF_INSTALL_DATE`,
and `UF_DELIVERY_DATE`. Work orders use `UF_PLANNED_DATE` and a real multiple file field `UF_PHOTOS`.
Product type, budget, reward, actual date, audit snapshots, notification deliveries, and outbox payload fields
are all declared in the config field maps.

Use the idempotent CLI installer. It is dry-run by default and only mutates the database with explicit
`--apply`:

```bash
SUPERWINDOW_DOCUMENT_ROOT=/home/site/public_html php local/rest/api/v1/cron/install_leads.php
SUPERWINDOW_DOCUMENT_ROOT=/home/site/public_html php local/rest/api/v1/cron/install_leads.php --apply
```

Run the installer with the same runtime configuration as the API, including legacy mode. It creates only
missing blocks/fields/indexes and the three Sale order properties
`SOURCE_LEAD_ID`, `LEAD_PRODUCT_TYPE`, and `LEAD_BUDGET`; it never deletes or rewrites business data. Review
its JSON plan before applying. Important unique indexes cover B24 external lead ID, one work order per lead,
and one notification-preference row per dealer. It also verifies that JSON/audit columns are really backed by
`TEXT` (not `VARCHAR`) on the target Bitrix version, including attachment metadata, and stops on an unsafe type.
The installer separately verifies that `UF_PHOTOS` has user-field type `file` with `MULTIPLE=Y`. Deploy to staging first and
back up the Bitrix database.

If an earlier prototype schema was installed, rerun dry-run and `--apply`: the exact TЗ fields are added without
deleting `UF_PLANNED_AT` or `UF_PHOTO_IDS_JSON`. Prototype values are not migrated automatically; migrate any
real data before removing those obsolete fields. An existing `UF_PHOTOS` with a non-file or non-multiple type is
reported as a schema error instead of being rewritten destructively.

### Runtime configuration

No integration secret is stored in this repository. `swLeadEnv` accepts constants as well as environment
variables. The server configuration is loaded through Bitrix `local/php_interface/init.php` from
`local/php_interface/include/superwindow_leads.php`, so web, CLI and Bitrix agents share the same
settings. Keep that private installation configuration and the existing webhook helper out of the repository.

- `SUPERWINDOW_LEADS_LEGACY_B24=true` — reuse `B24Leads` / `B24Works` and preserve their existing field types.
- `SUPERWINDOW_LEADS_IMPORT_API_KEY` — required for inbound robot/server-to-server POST import; it is not yet configured. Automatic discovery below uses the existing private CRM transport and does not require a public import key. An administrator can still use the guarded legacy import/sync routes with session + CSRF.
- `SUPERWINDOW_LEADS_CRON_API_KEY` — only needed for optional HTTP outbox flush; it is not required by CLI or the Bitrix agent and is not yet configured.
- `SUPERWINDOW_LEADS_HL_*_ID` / `SUPERWINDOW_LEADS_HL_*_NAME` — optional block overrides; names work by default.
- `SUPERWINDOW_LEADS_ADMIN_GROUP_IDS` — comma-separated Bitrix group IDs with cross-owner read access.
- `SUPERWINDOW_LEADS_DEALER_GROUP_IDS` — eligible dealer groups used to fan out new-lead notifications; empty is a safe no-op.
- `SUPERWINDOW_LEADS_DEALER_USER_FIELD` — optional user field containing an external dealer ID; user ID is the default.
- `SUPERWINDOW_LEADS_DEALER_REGION_USER_FIELD` — optional user field used to match dealer regions (`*` permits all regions).
- `SUPERWINDOW_LEADS_ELIGIBLE_DEALER_RESOLVER_CLASS` — optional project resolver with `resolve(array $lead): array` for custom rights/region matching.
- `SUPERWINDOW_LEADS_DEADLINE_REMINDER_OFFSETS_SECONDS` — comma-separated thresholds, default `43200,3600` (12h and 1h).
- `SUPERWINDOW_LEADS_CORS_ORIGINS` — explicit comma-separated credentialed origins; empty means same-origin only.
- `SUPERWINDOW_B24_ENABLED` — enables outbox delivery. Its repository default is `false`; runtime configuration opts in to the existing transport. Disabled delivery leaves domain events pending.
- `SUPERWINDOW_B24_TRANSPORT=existing_bitrix24` — reuse the server's private `bitrix24UpdateLead` helper.
- `SUPERWINDOW_B24_IMPORT_ENABLED` — opt-in discovery of new published CRM leads; repository default `false`.
- `SUPERWINDOW_B24_IMPORT_CATEGORY_ID` — pipeline category, default75 for entity1058 in the existing helper.
- `SUPERWINDOW_B24_IMPORT_MAX_PAGES`, `..._MAX_ITEMS`, `..._TIME_BUDGET_SECONDS` — bounded discovery work per run, defaults2/20/20. The time budget is checked between calls; an in-flight legacy transport request can take up to30 seconds.
- `SUPERWINDOW_B24_EXISTING_HELPER_PATH` — defaults to `local/rest/api/v1/controllers/Bitrix24.php` relative to the deployed API package; works from web requests, CLI and agents.
- `SUPERWINDOW_B24_STAGE_AVAILABLE`, `..._ASSIGNED`, `..._IN_WORK`, `..._CONVERTED`, `..._DONE`, `..._CANCELLED`, `..._EXPIRED` — explicit stage overrides; see the mapping below.
- `SUPERWINDOW_B24_EVENT_SINK_URL` and `SUPERWINDOW_B24_EVENT_SINK_TOKEN` — used only if `SUPERWINDOW_B24_TRANSPORT=event_sink` is explicitly selected.
- `SUPERWINDOW_LEADS_EXTERNAL_NOTIFICATIONS_ENABLED=0` — safe default; in-app messages work and push/SMS/email intents are retained but not sent.

### Existing Bitrix24 transport

`services/LeadB24Adapter.php` uses the existing private `controllers/Bitrix24.php`; no webhook is copied into
new source files. The CRM entity type is `1058`. The field IDs match the existing B24 sync controller: dealer
`ufCrm31_1787832684`, measurement date `ufCrm31_1787832632`, installation date `ufCrm31_1787832639`, and
delivery date `ufCrm31_1787832659`. Type enumeration IDs are `2939` / `2941` / `2943` respectively.

The current project fields were verified using `crm.item.fields` on 2026-09-24:

| Portal field | Current CRM field | Interpretation |
| --- | --- | --- |
| Product | `ufCrm31_1787894491` | Enum2945 → label `1`, enum2947 → label `2` |
| Budget | `ufCrm31_1787894554021` | Nonnegative amount; empty stays null |
| Reward | `ufCrm31_1787894566488` | Nonnegative amount; empty stays null |
| Expiry | `ufCrm31_1787895372840` | Source datetime; absent uses the portal default TTL |
| Source files | `ufCrm31_1787895382388` | Safe source IDs only; authenticated downloads are not implemented |

Retired project-field IDs remain fallback aliases only when the current key is absent; an explicit current
null/false never revives stale values. `SUPERWINDOW_B24_FIELD_PRODUCT_TYPE`, `..._BUDGET`, `..._REWARD`,
`..._EXPIRE_AT`, `..._FILES` can override field IDs. `SUPERWINDOW_B24_PRODUCT_LABELS_JSON` configures actual
enum labels and their reverse mapping for manual sync; unknown labels are not sent as invented IDs.
The address field `ufCrm31_1787832525` is parsed as `TEXT|LAT;LON|LOCATION_ID`: readable address and validated
coordinates are separate, and safe location metadata is retained. City/region are not guessed from text.
File URLs carrying application authorization are never persisted or exposed as download links.

Stage labels were checked against the existing CRM; do not infer semantics from the old PHP constant names:

| Portal state | CRM stage | CRM label |
| --- | --- | --- |
| `available` | `DT1058_75:PREPARATION` | Опубликован |
| `assigned` | `DT1058_75:CLIENT` | Закреплён за дилером |
| `in_work` | `DT1058_75:UC_51L019` | В работе |
| `converted` | `DT1058_75:FAIL` | Конвертирован |
| `done` | `DT1058_75:SUCCESS` | Выполнен |
| `cancelled`, `expired` | Unconfigured | No confirmed matching CRM stages |

`FAIL` is **not** cancellation in this pipeline. Events requiring an unconfigured stage stay in `retry`
with an explicit configuration error and do not consume delivery attempts or falsely become `sent`.
Normal transient errors use bounded exponential retries. The worker serializes concurrent flushes and reads
current lead/work state before delivery, so a delayed event cannot restore its stale owner/date/status snapshot.
For linked work orders, the current work state supplies the active stage. A response is successful only when
`crm.item.update` acknowledges the intended item ID; the legacy helper's bare `success=true` is insufficient.

`B24SyncController.php` preserves `bitrix24ImportLead` and `syncB24LeadHL`. Import fetches the current CRM item
and passes it through the protected shared import service. Manual sync queues a full mapped snapshot through
the durable outbox and returns `queued=true`, `synced=false`, `status=pending`, and `outbox_id`. That response
confirms local persistence, not remote delivery; it does not write the absent `UF_SYNCED_AT` field or invent a
`synced_at` timestamp. Ordinary workflow events send the mapped owner/dates/stage fields. Work photos and
actual completion dates remain stored on the portal; no unsupported CRM photo/factual-date field is invented.

### Automatic discovery of published CRM leads

`services/LeadB24ImportService.php` is an opt-in inbound poller used by the same worker. It only creates
previously unseen external IDs. It does not refresh existing portal records or infer cancellation/deletion
from absence in the CRM list. An atomic create-only check under the shared import lock also protects the
race where another import creates the ID between list/get and save.

Discovery reads the published stage in the configured category, then refetches each new candidate. Wrong
category/stage, assigned dealer, unsupported type and expired candidates are rejected before publication.
CRM planning dates remain source metadata; they do not count as a dealer's appointment and cannot bypass
the 24-hour scheduling rule. No CRM update request is sent by discovery.

The legacy helper omits API pagination metadata, so discovery uses descending-ID keyset pagination.
Progress, backoff and a sanitized summary are stored in Bitrix options. A completed scan resets to the
head, allowing previously hidden/older newly published CRM items to be discovered later. A named lock
serializes concurrent runs; limits bound work and transient failures are retried with backoff. Existing
records are skipped without version changes, duplicate audits or broadcast notifications.

CLI entry point (replace the document root/PHP binary for the host):

```bash
SUPERWINDOW_DOCUMENT_ROOT=/path/to/bitrix/public_html php /path/to/api/cron/import_b24.php --dry-run
SUPERWINDOW_DOCUMENT_ROOT=/path/to/bitrix/public_html php /path/to/api/cron/import_b24.php --status
SUPERWINDOW_DOCUMENT_ROOT=/path/to/bitrix/public_html php /path/to/api/cron/import_b24.php --apply
```

The default is read-only dry run: it makes CRM reads but does not write business records or its cursor.
`--apply` requires runtime opt-in; `--status` only reads local progress. Keep credentials in the existing
server helper and never put them into a command URL, frontend bundle or repository.

### Bounded source-field repair

`cron/repair_b24_fields.php --ids=123,456` previews missing-field repair for 1–20 explicit unique CRM IDs.
Only `--apply` writes. Back up the selected rows and verify raw `UF_SOURCE_JSON` is empty or a valid JSON
object/array before use: the legacy repository decodes malformed JSON as an empty array.
The repair refetches CRM details, then verifies unchanged lead/work snapshots under import and row locks.
It fills only empty product/budget/reward, retaining actual zero and all nonempty local values. Expiry can
replace only a confirmed synthetic default with no previous explicit source expiry. Composite address cleanup,
missing coordinates and absent `sourceAddress` metadata require an exact original/clean address match.
Active linked work receives only missing project/reward/address data; terminal work is untouched.
Owner/relation conflicts are rejected. No status, ownership, workflow dates, notifications or CRM writes change.
Changed rows receive a version increment and a field-name-only audit event; repeat runs are no-ops.

### Current integration boundaries

- Existing private B24 outbound transport, confirmed field/stage mappings and opt-in discovery of new published leads are supported. Existing-record refresh and CRM-side cancellation/deletion propagation are not automatic. Optional robot import still needs a configured API key and a POST caller; the code does not provision an external B24 robot.
- Cancellation/expiry stages remain unconfigured and visibly retryable. Missing mappings are not treated as successful synchronization.
- Push, SMS, and email delivery adapters are not included yet; the API stores channel preferences and delivery intents, while in-app notifications are fully functional.
- Notification rows store `UF_IN_APP_VISIBLE`; list, single-read, and read-all operations expose only rows whose in-app channel was enabled for that event. External-only intents remain queued/stored without appearing in the in-app feed.
- Dealer fan-out is a safe no-op until dealer group IDs/region fields or a custom eligible-dealer resolver are configured.
- Atomic row locks, advisory locks, installer introspection, and indexes target the MySQL/MariaDB stack used by this Bitrix deployment.

### Worker scheduling

The hosting account has no CLI `crontab` available. The integration therefore provides
`cron/agent.php` / `swLeadWorkerAgent();` as a Bitrix `CAgent` with interval `300` seconds, loaded from the same
Bitrix init configuration. This is a page-hit scheduling fallback: an overdue agent starts on a later Bitrix
request, so a quiet site can process deadlines later than five minutes. Registration/configuration alone is
not evidence that a scheduled run or external B24 delivery has succeeded.

The shared worker handles available-lead expiry,
24-hour returns, distinct 12-hour and 1-hour deadline reminders, work-order reminders, planned-to-in-work transitions, audit records, and
the integration outbox. Advisory locks prevent overlapping workers. Legacy pre-created untouched work orders
are cancelled when an unscheduled lead is returned, and can be safely reused when that lead is taken and
scheduled again.

When a reliable host scheduler becomes available, run `cron/leads.php` every five minutes instead. The CLI
entry point also has a non-blocking process lock and disables incidental Bitrix-agent execution on bootstrap.
Use the correct web root/PHP path for the host:

```cron
*/5 * * * * SUPERWINDOW_DOCUMENT_ROOT=/home/site/public_html /usr/bin/php /home/site/public_html/local/rest/api/v1/cron/leads.php >> /home/site/logs/superwindow-leads-cron.log 2>&1
```

### Verification commands

Standalone checks require PHP CLI but do not bootstrap Bitrix, connect to a database, or send B24 requests:

```bash
php app/rest/api/v1/tests/lead_legacy_compatibility.php
php app/rest/api/v1/tests/LeadB24AdapterTest.php
php app/rest/api/v1/tests/LeadB24ImportTest.php
php app/rest/api/v1/tests/LeadB24ImportTest.php --disabled
php app/rest/api/v1/tests/LeadB24FieldMappingTest.php
php app/rest/api/v1/tests/LeadB24FieldMappingTest.php --custom-labels
php app/rest/api/v1/tests/LeadB24FieldRepairTest.php
```

On the server, set `BITRIX_ROOT` to the actual Bitrix document root. Run the installer without `--apply` to
inspect the additive schema plan, then use the smoke check's read-only mode:

```bash
BITRIX_ROOT=/path/to/bitrix/public_html
SUPERWINDOW_DOCUMENT_ROOT="$BITRIX_ROOT" php "$BITRIX_ROOT/local/rest/api/v1/cron/install_leads.php"
SUPERWINDOW_DOCUMENT_ROOT="$BITRIX_ROOT" php "$BITRIX_ROOT/local/rest/api/v1/tests/server_smoke.php"
```

The read-only smoke checks cover storage metadata, normalized legacy filters/sorting, contact masking and
cross-owner access. To exercise synthetic take/schedule/start/complete/archive flows with real ORM and file
storage, use the explicit transactional mode:

```bash
SUPERWINDOW_DOCUMENT_ROOT="$BITRIX_ROOT" php "$BITRIX_ROOT/local/rest/api/v1/tests/server_smoke.php" --transactional
```

This mode checks InnoDB first, scopes mutations to synthetic records, uses SQL savepoints under one outer
transaction, and always rolls the database back. Tiny test PNGs are deleted via `CFile::Delete` before
rollback; afterwards it verifies missing synthetic rows/files and unchanged row counts. Its test outbox
disables external delivery, and bootstrap disables incidental agent execution. JSON output reports individual
checks plus `rollbackVerified`, `fileCleanupVerified`, and `networkCalls: 0`; failures return a nonzero exit code.
Do not use a normal worker run as a read-only smoke test: it processes real due leads and queued CRM events.
