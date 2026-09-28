<?php

/**
 * Lead API configuration.
 *
 * Secrets and installation-specific IDs must be supplied through environment
 * variables (or constants defined outside the web root). Never commit them.
 */

if (!function_exists('swLeadEnv')) {
    function swLeadEnv($name, $default = null)
    {
        if (defined($name)) {
            return constant($name);
        }

        $value = getenv($name);
        if ($value === false && isset($_SERVER[$name])) {
            $value = $_SERVER[$name];
        }
        if ($value === false && isset($_ENV[$name])) {
            $value = $_ENV[$name];
        }

        return $value === false || $value === '' ? $default : $value;
    }
}

if (!function_exists('swLeadEnvBool')) {
    function swLeadEnvBool($name, $default = false)
    {
        $value = swLeadEnv($name, null);
        if ($value === null) {
            return (bool)$default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}

if (!function_exists('swLeadEnvCsv')) {
    function swLeadEnvCsv($name, array $default = array())
    {
        $value = swLeadEnv($name, null);
        if ($value === null) {
            return $default;
        }

        return array_values(array_filter(array_map('trim', explode(',', (string)$value)), 'strlen'));
    }
}

if (!function_exists('swLeadEnvIntCsv')) {
    function swLeadEnvIntCsv($name, array $default = array())
    {
        $values = swLeadEnvCsv($name, array_map('strval', $default));
        $values = array_values(array_filter(array_map('intval', $values), function ($value) {
            return $value > 0;
        }));
        return $values ?: $default;
    }
}

$legacyB24 = swLeadEnvBool('SUPERWINDOW_LEADS_LEGACY_B24', false);
$b24ProductLabels = json_decode((string)swLeadEnv('SUPERWINDOW_B24_PRODUCT_LABELS_JSON', '{"2945":"1","2947":"2"}'), true);
if (!is_array($b24ProductLabels)) {
    $b24ProductLabels = array('2945' => '1', '2947' => '2');
}

$leadFields = array(
    'b24_id' => 'UF_B24_ENTITY_ID',
    'import_key' => 'UF_IMPORT_KEY',
    'type' => 'UF_LEAD_TYPE',
    'product_type' => 'UF_PRODUCT_TYPE',
    'status' => 'UF_STATUS',
    'title' => 'UF_TITLE',
    'customer_name' => 'UF_CLIENT_NAME',
    'phone' => 'UF_PHONE',
    'email' => 'UF_EMAIL',
    'city' => 'UF_CITY',
    'region' => 'UF_REGION',
    'address' => 'UF_ADDRESS',
    'coordinates' => 'UF_COORDINATES',
    'map_image_url' => 'UF_MAP_IMAGE_URL',
    'volume' => 'UF_VOLUME',
    'budget' => 'UF_BUDGET',
    'reward' => 'UF_REWARD',
    'comment' => 'UF_COMMENT',
    'files' => 'UF_FILES_JSON',
    'warehouse_address' => 'UF_WAREHOUSE_ADDRESS',
    'route' => 'UF_ROUTE_JSON',
    'time_window' => 'UF_TIME_WINDOW',
    // UF_DILER_ID spelling is fixed by the approved Bitrix specification.
    'dealer_id' => 'UF_DILER_ID',
    'taken_at' => 'UF_TAKEN_AT',
    'schedule_deadline' => 'UF_SCHEDULE_DEADLINE',
    'scheduled_at' => 'UF_SCHEDULED_AT',
    'measure_date' => 'UF_MEASURE_DATE',
    'install_date' => 'UF_INSTALL_DATE',
    'delivery_date' => 'UF_DELIVERY_DATE',
    'required_date_filled_at' => 'UF_REQUIRED_DATE_FILLED_AT',
    'expire_at' => 'UF_DATE_EXPIRE',
    'order_id' => 'UF_ORDER_ID',
    'work_order_id' => 'UF_WORK_ORDER_ID',
    'published_at' => 'UF_PUBLISHED_AT',
    'converted_at' => 'UF_CONVERTED_AT',
    'cancellation_reason' => 'UF_CANCELLATION_REASON',
    'source_data' => 'UF_SOURCE_JSON',
    'version' => 'UF_VERSION',
    'created_at' => 'UF_CREATED_AT',
    'updated_at' => 'UF_UPDATED_AT',
);

$workOrderFields = array(
    'lead_id' => 'UF_LEAD_ID',
    'b24_id' => 'UF_B24_ENTITY_ID',
    'order_id' => 'UF_ORDER_ID',
    'dealer_id' => 'UF_DILER_ID',
    'type' => 'UF_TYPE',
    'product_type' => 'UF_PRODUCT_TYPE',
    'reward' => 'UF_REWARD',
    'status' => 'UF_STATUS',
    'display_id' => 'UF_DISPLAY_ID',
    'title' => 'UF_TITLE',
    'customer_name' => $legacyB24 ? 'UF_CLIENT_NAME' : 'UF_CUSTOMER_NAME',
    'phone' => 'UF_PHONE',
    'address' => 'UF_ADDRESS',
    'region' => 'UF_REGION',
    'city' => 'UF_CITY',
    'coordinates' => 'UF_COORDINATES',
    'map_image_url' => 'UF_MAP_IMAGE_URL',
    'warehouse_address' => 'UF_WAREHOUSE_ADDRESS',
    'warehouse' => 'UF_WAREHOUSE_JSON',
    'route' => 'UF_ROUTE_JSON',
    'planned_at' => 'UF_PLANNED_DATE',
    'time_window' => 'UF_TIME_WINDOW',
    'reminder_at' => 'UF_REMINDER_AT',
    'reminder_sent_at' => 'UF_REMINDER_SENT_AT',
    'reminder' => 'UF_REMINDER_JSON',
    'photo_ids' => 'UF_PHOTOS',
    'comment' => 'UF_COMMENT',
    'result_comment' => 'UF_RESULT_COMMENT',
    'fact_date' => 'UF_FACT_DATE',
    'completed_at' => 'UF_COMPLETED_AT',
    'cancellation_reason' => 'UF_CANCELLATION_REASON',
    'version' => 'UF_VERSION',
    'created_at' => 'UF_CREATED_AT',
    'updated_at' => 'UF_UPDATED_AT',
);

$notificationFields = array(
    'dealer_id' => 'UF_DEALER_ID',
    'event' => 'UF_EVENT',
    'title' => 'UF_TITLE',
    'message' => 'UF_MESSAGE',
    'payload' => 'UF_PAYLOAD_JSON',
    'channels' => 'UF_CHANNELS_JSON',
    'delivery' => 'UF_DELIVERY_JSON',
    'in_app_visible' => 'UF_IN_APP_VISIBLE',
    'dedupe_key' => 'UF_DEDUPE_KEY',
    'read_at' => 'UF_READ_AT',
    'created_at' => 'UF_CREATED_AT',
);

$auditFields = array(
    'entity_type' => 'UF_ENTITY_TYPE',
    'entity_id' => 'UF_ENTITY_ID',
    'event' => 'UF_EVENT',
    'actor_id' => 'UF_ACTOR_ID',
    'dealer_id' => 'UF_DEALER_ID',
    'before' => 'UF_BEFORE_JSON',
    'after' => 'UF_AFTER_JSON',
    'meta' => 'UF_META_JSON',
    'created_at' => 'UF_CREATED_AT',
);

$outboxFields = array(
    'aggregate_type' => 'UF_AGGREGATE_TYPE',
    'aggregate_id' => 'UF_AGGREGATE_ID',
    'event' => 'UF_EVENT',
    'payload' => 'UF_PAYLOAD_JSON',
    'status' => 'UF_STATUS',
    'attempts' => 'UF_ATTEMPTS',
    'next_attempt_at' => 'UF_NEXT_ATTEMPT_AT',
    'last_error' => 'UF_LAST_ERROR',
    'created_at' => 'UF_CREATED_AT',
    'updated_at' => 'UF_UPDATED_AT',
    'sent_at' => 'UF_SENT_AT',
);

$preferenceFields = array(
    'dealer_id' => 'UF_DEALER_ID',
    'preferences' => 'UF_PREFERENCES_JSON',
    'created_at' => 'UF_CREATED_AT',
    'updated_at' => 'UF_UPDATED_AT',
);

return array(
    'compatibility' => array(
        // Reuse the existing B24 tables and their string dates/type values.
        'legacy_b24' => $legacyB24,
    ),
    'hlblocks' => array(
        'leads' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_LEADS_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_LEADS_NAME', $legacyB24 ? 'B24Leads' : 'SuperwindowLeads'),
            'fields' => $leadFields,
            'required' => array('b24_id', 'import_key', 'type', 'product_type', 'status', 'title', 'customer_name', 'phone', 'region', 'city', 'address', 'coordinates', 'budget', 'reward', 'comment', 'files', 'dealer_id', 'taken_at', 'schedule_deadline', 'scheduled_at', 'measure_date', 'install_date', 'delivery_date', 'required_date_filled_at', 'expire_at', 'order_id', 'work_order_id', 'published_at', 'converted_at', 'cancellation_reason', 'version', 'created_at', 'updated_at'),
        ),
        'work_orders' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_WORK_ORDERS_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_WORK_ORDERS_NAME', $legacyB24 ? 'B24Works' : 'SuperwindowWorkOrders'),
            'fields' => $workOrderFields,
            'required' => array('lead_id', 'dealer_id', 'type', 'product_type', 'reward', 'status', 'display_id', 'customer_name', 'phone', 'region', 'city', 'address', 'coordinates', 'warehouse', 'route', 'planned_at', 'time_window', 'reminder_at', 'reminder_sent_at', 'reminder', 'photo_ids', 'comment', 'result_comment', 'fact_date', 'completed_at', 'cancellation_reason', 'version', 'created_at', 'updated_at'),
        ),
        'notifications' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_NOTIFICATIONS_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_NOTIFICATIONS_NAME', 'SuperwindowLeadNotifications'),
            'fields' => $notificationFields,
            'required' => array('dealer_id', 'event', 'title', 'message', 'payload', 'channels', 'delivery', 'in_app_visible', 'dedupe_key', 'read_at', 'created_at'),
        ),
        'audit' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_AUDIT_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_AUDIT_NAME', 'SuperwindowLeadAudit'),
            'fields' => $auditFields,
            'required' => array('entity_type', 'entity_id', 'event', 'actor_id', 'dealer_id', 'before', 'after', 'meta', 'created_at'),
        ),
        'outbox' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_OUTBOX_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_OUTBOX_NAME', 'SuperwindowB24Outbox'),
            'fields' => $outboxFields,
            'required' => array('aggregate_type', 'aggregate_id', 'event', 'payload', 'status', 'attempts', 'next_attempt_at', 'last_error', 'created_at', 'updated_at', 'sent_at'),
        ),
        'preferences' => array(
            'id' => (int)swLeadEnv('SUPERWINDOW_LEADS_HL_PREFERENCES_ID', 0),
            'name' => (string)swLeadEnv('SUPERWINDOW_LEADS_HL_PREFERENCES_NAME', 'SuperwindowLeadNotificationPreferences'),
            'fields' => $preferenceFields,
            'required' => array('dealer_id', 'preferences', 'created_at', 'updated_at'),
            'optional' => true,
        ),
    ),
    'auth' => array(
        'import_api_key' => (string)swLeadEnv('SUPERWINDOW_LEADS_IMPORT_API_KEY', ''),
        'cron_api_key' => (string)swLeadEnv('SUPERWINDOW_LEADS_CRON_API_KEY', ''),
        'admin_group_ids' => array_map('intval', swLeadEnvCsv('SUPERWINDOW_LEADS_ADMIN_GROUP_IDS')),
        'dealer_group_ids' => array_map('intval', swLeadEnvCsv('SUPERWINDOW_LEADS_DEALER_GROUP_IDS')),
        'dealer_user_field' => (string)swLeadEnv('SUPERWINDOW_LEADS_DEALER_USER_FIELD', ''),
        'dealer_region_user_field' => (string)swLeadEnv('SUPERWINDOW_LEADS_DEALER_REGION_USER_FIELD', ''),
    ),
    'cors_origins' => swLeadEnvCsv('SUPERWINDOW_LEADS_CORS_ORIGINS'),
    'storage' => array(
        // Bitrix StringType is backed by a DB text column; keep payloads below TEXT limits.
        'max_json_bytes' => max(4096, min(60000, (int)swLeadEnv('SUPERWINDOW_LEADS_MAX_JSON_BYTES', 56000))),
    ),
    'lead' => array(
        'schedule_timeout_seconds' => max(300, (int)swLeadEnv('SUPERWINDOW_LEADS_SCHEDULE_TIMEOUT_SECONDS', 86400)),
        'default_ttl_seconds' => max(3600, (int)swLeadEnv('SUPERWINDOW_LEADS_DEFAULT_TTL_SECONDS', 604800)),
        'deadline_reminder_offsets_seconds' => swLeadEnvIntCsv('SUPERWINDOW_LEADS_DEADLINE_REMINDER_OFFSETS_SECONDS', array(43200, 3600)),
        'max_page_size' => max(1, min(200, (int)swLeadEnv('SUPERWINDOW_LEADS_MAX_PAGE_SIZE', 50))),
    ),
    'work_order' => array(
        'required_photo_types' => array('delivery', 'installation'),
        'min_photos' => max(1, (int)swLeadEnv('SUPERWINDOW_LEADS_MIN_COMPLETION_PHOTOS', 1)),
        'max_photos' => max(1, min(20, (int)swLeadEnv('SUPERWINDOW_LEADS_MAX_COMPLETION_PHOTOS', 10))),
        'max_photo_bytes' => max(1024, (int)swLeadEnv('SUPERWINDOW_LEADS_MAX_PHOTO_BYTES', 10485760)),
        'upload_dir' => trim((string)swLeadEnv('SUPERWINDOW_LEADS_PHOTO_UPLOAD_DIR', 'superwindow/work-orders'), '/\\'),
        'reminder_seconds' => max(300, (int)swLeadEnv('SUPERWINDOW_LEADS_WORK_ORDER_REMINDER_SECONDS', 7200)),
    ),
    'sale_order' => array(
        'person_type_id' => max(1, (int)swLeadEnv('SUPERWINDOW_LEADS_ORDER_PERSON_TYPE_ID', 1)),
        'property_codes' => array(
            'lead_id' => (string)swLeadEnv('SUPERWINDOW_LEADS_ORDER_PROP_LEAD_ID', 'SOURCE_LEAD_ID'),
            'product_type' => (string)swLeadEnv('SUPERWINDOW_LEADS_ORDER_PROP_PRODUCT_TYPE', 'LEAD_PRODUCT_TYPE'),
            'budget' => (string)swLeadEnv('SUPERWINDOW_LEADS_ORDER_PROP_BUDGET', 'LEAD_BUDGET'),
        ),
    ),
    'notifications' => array(
        'channels' => array('in_app', 'push', 'sms', 'email'),
        'events' => array('new_lead', 'deadline_reminder', 'lead_returned', 'work_order', 'cancelled'),
        // External transports are opt-in; intents are still recorded in delivery JSON.
        'external_delivery_enabled' => swLeadEnvBool('SUPERWINDOW_LEADS_EXTERNAL_NOTIFICATIONS_ENABLED', false),
        'defaults' => array(
            'in_app' => array('new_lead' => true, 'deadline_reminder' => true, 'lead_returned' => true, 'work_order' => true, 'cancelled' => true),
            'push' => array('new_lead' => false, 'deadline_reminder' => false, 'lead_returned' => false, 'work_order' => false, 'cancelled' => false),
            'sms' => array('new_lead' => false, 'deadline_reminder' => false, 'lead_returned' => false, 'work_order' => false, 'cancelled' => false),
            'email' => array('new_lead' => false, 'deadline_reminder' => false, 'lead_returned' => false, 'work_order' => false, 'cancelled' => false),
        ),
        'eligible_dealer_resolver_class' => (string)swLeadEnv('SUPERWINDOW_LEADS_ELIGIBLE_DEALER_RESOLVER_CLASS', ''),
        'max_broadcast_recipients' => max(1, min(5000, (int)swLeadEnv('SUPERWINDOW_LEADS_MAX_BROADCAST_RECIPIENTS', 1000))),
    ),
    'b24' => array(
        'enabled' => swLeadEnvBool('SUPERWINDOW_B24_ENABLED', false),
        'transport' => (string)swLeadEnv('SUPERWINDOW_B24_TRANSPORT', 'existing_bitrix24'),
        'existing_helper_path' => (string)swLeadEnv('SUPERWINDOW_B24_EXISTING_HELPER_PATH', __DIR__ . '/../controllers/Bitrix24.php'),
        'fields' => array(
            'product_type' => (string)swLeadEnv('SUPERWINDOW_B24_FIELD_PRODUCT_TYPE', 'ufCrm31_1787894491'),
            'budget' => (string)swLeadEnv('SUPERWINDOW_B24_FIELD_BUDGET', 'ufCrm31_1787894554021'),
            'reward' => (string)swLeadEnv('SUPERWINDOW_B24_FIELD_REWARD', 'ufCrm31_1787894566488'),
            'expire_at' => (string)swLeadEnv('SUPERWINDOW_B24_FIELD_EXPIRE_AT', 'ufCrm31_1787895372840'),
            'files' => (string)swLeadEnv('SUPERWINDOW_B24_FIELD_FILES', 'ufCrm31_1787895382388'),
        ),
        'product_labels' => $b24ProductLabels,
        'import' => array(
            // Opt-in discovery only: existing portal records are never overwritten.
            'enabled' => swLeadEnvBool('SUPERWINDOW_B24_IMPORT_ENABLED', false),
            'category_id' => max(1, (int)swLeadEnv('SUPERWINDOW_B24_IMPORT_CATEGORY_ID', 75)),
            'max_pages' => max(1, min(10, (int)swLeadEnv('SUPERWINDOW_B24_IMPORT_MAX_PAGES', 2))),
            'max_items' => max(1, min(100, (int)swLeadEnv('SUPERWINDOW_B24_IMPORT_MAX_ITEMS', 20))),
            'time_budget_seconds' => max(5, min(60, (int)swLeadEnv('SUPERWINDOW_B24_IMPORT_TIME_BUDGET_SECONDS', 20))),
        ),
        'stages' => array(
            'available' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_AVAILABLE', 'DT1058_75:PREPARATION'),
            'assigned' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_ASSIGNED', 'DT1058_75:CLIENT'),
            'in_work' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_IN_WORK', 'DT1058_75:UC_51L019'),
            'converted' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_CONVERTED', 'DT1058_75:FAIL'),
            'done' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_DONE', 'DT1058_75:SUCCESS'),
            'cancelled' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_CANCELLED', ''),
            'expired' => (string)swLeadEnv('SUPERWINDOW_B24_STAGE_EXPIRED', ''),
        ),
        // A future adapter/sink receives queued normalized events. Keep credentials outside source control.
        'event_sink_url' => (string)swLeadEnv('SUPERWINDOW_B24_EVENT_SINK_URL', ''),
        'event_sink_token' => (string)swLeadEnv('SUPERWINDOW_B24_EVENT_SINK_TOKEN', ''),
        'timeout_seconds' => max(2, min(60, (int)swLeadEnv('SUPERWINDOW_B24_TIMEOUT_SECONDS', 15))),
        'batch_size' => max(1, min(100, (int)swLeadEnv('SUPERWINDOW_B24_BATCH_SIZE', 25))),
        'max_attempts' => max(1, (int)swLeadEnv('SUPERWINDOW_B24_MAX_ATTEMPTS', 10)),
    ),
);
