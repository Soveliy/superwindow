# Leads frontend core

The public API is exported from `@/features/leads`. All methods return domain
models directly (`Promise<LeadDetails>`, `Promise<LeadSummary[]>`, and so on),
without an additional `data` wrapper.

## Data source

`VITE_LEADS_DATA_SOURCE` accepts in development. Production builds always use
`remote`, even if a stale demo variable is present:

- `auto` (development default) — use local AJAX and fall back to the persistent
  demo repository for read-only calls only when an endpoint is absent, storage
  is not configured, or a response has an unsupported shape;
- `remote` — never fall back, so integration errors stay visible;
- `demo` — always use dealer-scoped demo data in `localStorage`.

The demo repository has the same validation, optimistic `version` checks,
idempotent take/convert/complete calls, 24-hour scheduling deadline, and photo
requirements as the remote contract. Mutations are serialized and use the Web
Locks API when it is available.

Mutations never fall back automatically. A timeout or lost response from
`takeLead`, scheduling, conversion, completion, or notification updates is
reported to the user so the client cannot claim a local success after the
server may already have committed the action. Use explicit `demo` mode for a
fully local walkthrough.

## Local AJAX actions

| Method | Action |
| --- | --- |
| `listLeads` | `leads_list` |
| `getLead` | `lead_get` |
| `takeLead` | `lead_take` |
| `scheduleLead` | `lead_schedule` |
| `convertMeasurementLead` | `lead_measurement_convert` |
| `listWorkOrders` | `work_orders_list` |
| `getWorkOrder` | `work_order_get` |
| `updateWorkOrder` | `work_order_update` |
| `completeWorkOrder` | `work_order_complete` |
| `listNotifications` | `notifications_list` |
| `markNotificationRead` | `notification_read` |
| `markAllRead` | `notifications_read_all` |

Remote responses may be camelCase or snake_case and should use the common
`{ success: true, data }` envelope. HTTP 409 and version mismatches become
`LeadsRepositoryError` with `code === 'conflict'`.

## Privacy boundary

An available lead is sanitized even if an upstream response accidentally
contains private fields: customer name and phone are masked; exact address,
coordinates, map, factory notes, and attachments are removed. They become
available only after an atomic successful `takeLead` response. The backend must
enforce the same boundary because frontend masking is not an authorization
mechanism.

Installation and delivery completion both require at least one image. The demo
and adapter accept up to 10 images of at most 10 MB each.
