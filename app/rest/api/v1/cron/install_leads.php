<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$apply = in_array('--apply', $argv, true);
if (in_array('--help', $argv, true) || in_array('-h', $argv, true)) {
    fwrite(STDOUT, "Usage: php install_leads.php [--dry-run] [--apply]\nDefault mode is dry-run. --apply creates missing HL blocks, fields and indexes.\n");
    exit(0);
}

define('NO_KEEP_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);

$documentRoot = getenv('SUPERWINDOW_DOCUMENT_ROOT');
$candidates = array_filter(array($documentRoot, dirname(__DIR__, 5), dirname(__DIR__, 4)));
foreach ($candidates as $candidate) {
    $prolog = rtrim($candidate, '/\\') . '/bitrix/modules/main/include/prolog_before.php';
    if (is_file($prolog)) {
        $_SERVER['DOCUMENT_ROOT'] = rtrim($candidate, '/\\');
        require $prolog;
        break;
    }
}
if (empty($_SERVER['DOCUMENT_ROOT']) || !defined('B_PROLOG_INCLUDED')) {
    fwrite(STDERR, "Bitrix document root was not found. Set SUPERWINDOW_DOCUMENT_ROOT.\n");
    exit(2);
}

require_once dirname(__DIR__) . '/services/LeadApiSupport.php';

if (!\Bitrix\Main\Loader::includeModule('highloadblock')) {
    fwrite(STDERR, "Bitrix highloadblock module is unavailable.\n");
    exit(2);
}

$legacyB24 = (bool)swLeadConfig('compatibility.legacy_b24', false);
$tables = array(
    'leads' => $legacyB24 ? 'b24_leads' : 'sw_leads',
    'work_orders' => $legacyB24 ? 'b24_works' : 'sw_work_orders',
    'notifications' => 'sw_lead_notifications',
    'audit' => 'sw_lead_audit',
    'outbox' => 'sw_b24_outbox',
    'preferences' => 'sw_lead_notify_preferences',
);

$dateFields = array('taken_at', 'schedule_deadline', 'scheduled_at', 'measure_date', 'install_date', 'delivery_date', 'required_date_filled_at', 'expire_at', 'published_at', 'converted_at', 'planned_at', 'reminder_at', 'reminder_sent_at', 'fact_date', 'completed_at', 'created_at', 'updated_at', 'read_at', 'next_attempt_at', 'sent_at');
$integerFields = array('dealer_id', 'lead_id', 'work_order_id', 'version', 'attempts', 'entity_id', 'actor_id', 'aggregate_id', 'in_app_visible');
$doubleFields = array('budget', 'reward');
$fileFields = array('photo_ids');
$largeFields = array('comment', 'files', 'route', 'warehouse', 'reminder', 'source_data', 'payload', 'delivery', 'channels', 'before', 'after', 'meta', 'preferences', 'last_error', 'message');
$operations = array();
$errors = array();
$blockRows = array();

if (!\Bitrix\Main\Loader::includeModule('sale')) {
    $errors[] = array('component' => 'sale_order_properties', 'errors' => array('Bitrix sale module is unavailable'));
} else {
    $personTypeId = (int)swLeadConfig('sale_order.person_type_id', 1);
    $propertyCodes = (array)swLeadConfig('sale_order.property_codes', array());
    $propertyDefinitions = array(
        'lead_id' => array('name' => 'Источник: лид', 'type' => 'STRING', 'sort' => 910),
        'product_type' => array('name' => 'Тип продукта из лида', 'type' => 'STRING', 'sort' => 920),
        'budget' => array('name' => 'Бюджет лида', 'type' => 'NUMBER', 'sort' => 930),
    );
    $propertyGroup = CSaleOrderPropsGroup::GetList(array('SORT' => 'ASC'), array('PERSON_TYPE_ID' => $personTypeId))->Fetch();
    $propertyGroupId = $propertyGroup ? (int)$propertyGroup['ID'] : 0;
    $propertyGroupPlanned = false;

    foreach ($propertyDefinitions as $logical => $definition) {
        if (empty($propertyCodes[$logical])) {
            $errors[] = array('component' => 'sale_order_properties', 'logical' => $logical, 'errors' => array('Property code is empty'));
            continue;
        }
        $code = (string)$propertyCodes[$logical];
        $existingProperty = CSaleOrderProps::GetList(array(), array('PERSON_TYPE_ID' => $personTypeId, 'CODE' => $code))->Fetch();
        if ($existingProperty) {
            // Legacy CSaleOrderProps exposes a D7 STRING property as TEXT.
            $compatiblePropertyTypes = $definition['type'] === 'STRING' ? array('STRING', 'TEXT') : array($definition['type']);
            if (!in_array((string)$existingProperty['TYPE'], $compatiblePropertyTypes, true)) {
                $errors[] = array('component' => 'sale_order_properties', 'code' => $code, 'errors' => array('Expected type ' . $definition['type'] . ', got ' . $existingProperty['TYPE']));
            }
            if ((string)$existingProperty['ACTIVE'] !== 'Y') {
                $operations[] = array('action' => 'activate_order_property', 'code' => $code, 'id' => (int)$existingProperty['ID']);
                if ($apply && !CSaleOrderProps::Update((int)$existingProperty['ID'], array('ACTIVE' => 'Y'))) {
                    $errors[] = array('component' => 'sale_order_properties', 'code' => $code, 'errors' => array('Cannot activate existing property'));
                }
            }
            continue;
        }

        if ($propertyGroupId <= 0) {
            if (!$propertyGroupPlanned) {
                $operations[] = array('action' => 'create_order_property_group', 'personTypeId' => $personTypeId, 'name' => 'Интеграция лидов');
                $propertyGroupPlanned = true;
            }
            if ($apply) {
                $propertyGroupId = (int)CSaleOrderPropsGroup::Add(array(
                    'PERSON_TYPE_ID' => $personTypeId,
                    'NAME' => 'Интеграция лидов',
                    'SORT' => 900,
                ));
                if ($propertyGroupId <= 0) {
                    $errors[] = array('component' => 'sale_order_properties', 'errors' => array('Cannot create property group'));
                    break;
                }
            }
        }

        $operations[] = array('action' => 'create_order_property', 'code' => $code, 'type' => $definition['type'], 'personTypeId' => $personTypeId);
        if ($apply) {
            $propertyId = (int)CSaleOrderProps::Add(array(
                'PERSON_TYPE_ID' => $personTypeId,
                'NAME' => $definition['name'],
                'TYPE' => $definition['type'],
                'REQUIED' => 'N',
                'DEFAULT_VALUE' => '',
                'SORT' => $definition['sort'],
                'USER_PROPS' => 'N',
                'IS_LOCATION' => 'N',
                'PROPS_GROUP_ID' => $propertyGroupId,
                'DESCRIPTION' => 'Системное свойство Superwindow Leads',
                'IS_EMAIL' => 'N',
                'IS_PROFILE_NAME' => 'N',
                'IS_PAYER' => 'N',
                'IS_FILTERED' => 'Y',
                'UTIL' => 'Y',
                'ACTIVE' => 'Y',
                'MULTIPLE' => 'N',
                'CODE' => $code,
            ));
            if ($propertyId <= 0) {
                $errors[] = array('component' => 'sale_order_properties', 'code' => $code, 'errors' => array('Cannot create order property'));
            }
        }
    }
}

foreach ($tables as $blockKey => $tableName) {
    $config = swLeadConfig('hlblocks.' . $blockKey, array());
    $block = null;
    if (!empty($config['id'])) {
        $block = \Bitrix\Highloadblock\HighloadBlockTable::getById((int)$config['id'])->fetch();
    }
    if (!$block && !empty($config['name'])) {
        $block = \Bitrix\Highloadblock\HighloadBlockTable::getList(array('filter' => array('=NAME' => $config['name']), 'limit' => 1))->fetch();
    }

    if (!$block) {
        $operations[] = array('action' => 'create_hlblock', 'block' => $blockKey, 'name' => $config['name'], 'table' => $tableName);
        if ($apply) {
            $create = \Bitrix\Highloadblock\HighloadBlockTable::add(array('NAME' => $config['name'], 'TABLE_NAME' => $tableName));
            if (!$create->isSuccess()) {
                $errors[] = array('block' => $blockKey, 'errors' => $create->getErrorMessages());
                continue;
            }
            $block = \Bitrix\Highloadblock\HighloadBlockTable::getById((int)$create->getId())->fetch();
        }
    }
    if (!$block) {
        foreach ((array)$config['fields'] as $logical => $fieldName) {
            $type = in_array($logical, $fileFields, true) ? 'file(multiple)' : (in_array($logical, $dateFields, true) ? 'datetime' : (in_array($logical, $integerFields, true) ? 'integer' : (in_array($logical, $doubleFields, true) ? 'double' : 'string(text-backed)')));
            $operations[] = array('action' => 'create_field_after_block', 'block' => $blockKey, 'field' => $fieldName, 'logical' => $logical, 'type' => $type);
        }
        continue;
    }
    $blockRows[$blockKey] = $block;
    $entityId = 'HLBLOCK_' . (int)$block['ID'];

    foreach ((array)$config['fields'] as $logical => $fieldName) {
        $type = in_array($logical, $fileFields, true) ? 'file' : (in_array($logical, $dateFields, true) ? 'datetime' : (in_array($logical, $integerFields, true) ? 'integer' : (in_array($logical, $doubleFields, true) ? 'double' : 'string')));
        if ($legacyB24 && in_array($blockKey, array('leads', 'work_orders'), true) && $logical === 'b24_id') {
            $type = 'integer';
        }
        $multiple = in_array($logical, $fileFields, true) ? 'Y' : 'N';
        $existing = CUserTypeEntity::GetList(array(), array('ENTITY_ID' => $entityId, 'FIELD_NAME' => $fieldName))->Fetch();
        if ($existing) {
            $compatibleTypes = array($type);
            if ($legacyB24 && in_array($blockKey, array('leads', 'work_orders'), true) && (in_array($logical, $dateFields, true) || in_array($logical, $doubleFields, true) || $logical === 'lead_id')) {
                $compatibleTypes[] = 'string';
            }
            if (!in_array((string)$existing['USER_TYPE_ID'], $compatibleTypes, true) || (string)$existing['MULTIPLE'] !== $multiple) {
                $errors[] = array(
                    'block' => $blockKey,
                    'field' => $fieldName,
                    'errors' => array('Expected user-field type ' . $type . ' (MULTIPLE=' . $multiple . '), got ' . $existing['USER_TYPE_ID'] . ' (MULTIPLE=' . $existing['MULTIPLE'] . ').'),
                );
            }
            continue;
        }
        $operations[] = array('action' => 'create_field', 'block' => $blockKey, 'field' => $fieldName, 'logical' => $logical, 'type' => $type, 'multiple' => $multiple === 'Y');
        if (!$apply) {
            continue;
        }

        $settings = array();
        if ($type === 'string') {
            $settings = array('SIZE' => in_array($logical, $largeFields, true) ? 100 : 40, 'ROWS' => in_array($logical, $largeFields, true) ? 8 : 1, 'DEFAULT_VALUE' => '');
        }
        $userField = new CUserTypeEntity();
        $fieldId = $userField->Add(array(
            'ENTITY_ID' => $entityId,
            'FIELD_NAME' => $fieldName,
            'USER_TYPE_ID' => $type,
            'XML_ID' => 'SW_' . strtoupper($blockKey . '_' . $logical),
            'SORT' => 100,
            'MULTIPLE' => $multiple,
            'MANDATORY' => 'N',
            'SHOW_FILTER' => 'N',
            'SHOW_IN_LIST' => 'Y',
            'EDIT_IN_LIST' => 'Y',
            'IS_SEARCHABLE' => 'N',
            'EDIT_FORM_LABEL' => array('ru' => $logical, 'en' => $logical),
            'LIST_COLUMN_LABEL' => array('ru' => $logical, 'en' => $logical),
            'LIST_FILTER_LABEL' => array('ru' => $logical, 'en' => $logical),
            'SETTINGS' => $settings,
        ));
        if (!$fieldId) {
            $errors[] = array('block' => $blockKey, 'field' => $fieldName, 'errors' => array($userField->LAST_ERROR));
        }
    }
}

$indexes = array(
    'leads' => array(
        // Bitrix stores string user fields as TEXT on supported installations.
        // Prefixes cover the full allowed external ID/status, including UNIQUE.
        array('name' => 'ux_sw_leads_b24', 'unique' => true, 'fields' => array('b24_id'), 'prefixes' => array('b24_id' => 100)),
        array('name' => 'ix_sw_leads_status', 'unique' => false, 'fields' => array('status'), 'prefixes' => array('status' => 32)),
        array('name' => 'ix_sw_leads_dealer_status', 'unique' => false, 'fields' => array('dealer_id', 'status'), 'prefixes' => array('status' => 32)),
        array('name' => 'ix_sw_leads_expire', 'unique' => false, 'fields' => array('expire_at'), 'prefixes' => array('expire_at' => 32)),
        array('name' => 'ix_sw_leads_schedule_due', 'unique' => false, 'fields' => array('schedule_deadline')),
    ),
    'work_orders' => array(
        array('name' => 'ux_sw_work_lead', 'unique' => true, 'fields' => array('lead_id'), 'prefixes' => array('lead_id' => 20)),
        array('name' => 'ix_sw_work_dealer_status', 'unique' => false, 'fields' => array('dealer_id', 'status'), 'prefixes' => array('status' => 32)),
        array('name' => 'ix_sw_work_planned', 'unique' => false, 'fields' => array('planned_at'), 'prefixes' => array('planned_at' => 32)),
        array('name' => 'ix_sw_work_reminder', 'unique' => false, 'fields' => array('reminder_at')),
    ),
    'notifications' => array(array('name' => 'ix_sw_notify_dealer_visible', 'unique' => false, 'fields' => array('dealer_id', 'in_app_visible', 'created_at'))),
    'outbox' => array(array('name' => 'ix_sw_outbox_status_due', 'unique' => false, 'fields' => array('status', 'next_attempt_at'), 'prefixes' => array('status' => 32))),
    'preferences' => array(array('name' => 'ux_sw_pref_dealer', 'unique' => true, 'fields' => array('dealer_id'))),
);

if ($apply && class_exists('CUserTypeEntity')) {
    global $CACHE_MANAGER;
    if (is_object($CACHE_MANAGER)) {
        $CACHE_MANAGER->ClearByTag('USER_FIELD');
    }
}

// Bitrix StringType is expected to use TextField storage. Verify the actual
// target schema so JSON/audit data can never be silently truncated to varchar.
foreach ($blockRows as $blockKey => $block) {
    $tableName = (string)$block['TABLE_NAME'];
    $config = swLeadConfig('hlblocks.' . $blockKey, array());
    if (!preg_match('/^[A-Za-z0-9_]+$/', $tableName)) {
        continue;
    }
    foreach ($largeFields as $logical) {
        if (empty($config['fields'][$logical])) {
            continue;
        }
        $physical = $config['fields'][$logical];
        try {
            $connection = \Bitrix\Main\Application::getConnection();
            $column = $connection->query("SHOW COLUMNS FROM `" . $tableName . "` WHERE Field = '" . $connection->getSqlHelper()->forSql($physical) . "'")->fetch();
            if ($column && !preg_match('/(?:^|\b)(?:medium|long)?text\b|\bjson\b|\bblob\b/i', (string)$column['Type'])) {
                $errors[] = array(
                    'block' => $blockKey,
                    'field' => $physical,
                    'errors' => array('Large field uses unsafe DB type ' . $column['Type'] . '; migrate it to TEXT/MEDIUMTEXT before enabling the API.'),
                );
            }
        } catch (Throwable $exception) {
            $errors[] = array('block' => $blockKey, 'field' => $physical, 'errors' => array('Cannot verify DB column type: ' . $exception->getMessage()));
        }
    }
}

foreach ($indexes as $blockKey => $blockIndexes) {
    if (empty($blockRows[$blockKey])) {
        continue;
    }
    $config = swLeadConfig('hlblocks.' . $blockKey, array());
    $tableName = (string)$blockRows[$blockKey]['TABLE_NAME'];
    if (!preg_match('/^[A-Za-z0-9_]+$/', $tableName)) {
        $errors[] = array('block' => $blockKey, 'errors' => array('Unsafe table name'));
        continue;
    }
    foreach ($blockIndexes as $index) {
        $physicalFields = array();
        foreach ($index['fields'] as $logical) {
            if (!isset($config['fields'][$logical])) {
                continue 2;
            }
            $physicalFields[] = $config['fields'][$logical];
        }
        try {
            $connection = \Bitrix\Main\Application::getConnection();
            $columns = array();
            $columnPrefixes = array();
            foreach ($index['fields'] as $logical) {
                $field = $config['fields'][$logical];
                if (!preg_match('/^[A-Za-z0-9_]+$/', $field)) {
                    throw new RuntimeException('Unsafe field name');
                }
                $column = $connection->query("SHOW COLUMNS FROM `" . $tableName . "` WHERE Field = '" . $connection->getSqlHelper()->forSql($field) . "'")->fetch();
                if (!$column) {
                    if ($apply) {
                        throw new RuntimeException('Missing index field ' . $field);
                    }
                    // During dry-run the missing field is already scheduled above.
                    $column = array('Type' => in_array($logical, $dateFields, true) || in_array($logical, $integerFields, true) || in_array($logical, $doubleFields, true) ? 'numeric-or-datetime' : 'text');
                }
                $prefix = null;
                if (preg_match('/(?:text|blob)/i', (string)$column['Type'])) {
                    $prefix = isset($index['prefixes'][$logical]) ? (int)$index['prefixes'][$logical] : 0;
                    if ($prefix <= 0) {
                        throw new RuntimeException('TEXT index requires a configured prefix for ' . $field);
                    }
                }
                $columns[] = '`' . $field . '`' . ($prefix !== null ? '(' . $prefix . ')' : '');
                $columnPrefixes[$field] = $prefix;
            }

            $existingResult = $connection->query("SHOW INDEX FROM `" . $tableName . "` WHERE Key_name='" . $connection->getSqlHelper()->forSql($index['name']) . "'");
            $existingIndex = array();
            while ($indexColumn = $existingResult->fetch()) {
                $existingIndex[(int)$indexColumn['Seq_in_index']] = $indexColumn;
            }
            if ($existingIndex) {
                ksort($existingIndex);
                $existingIndex = array_values($existingIndex);
                if (count($existingIndex) !== count($physicalFields)) {
                    throw new RuntimeException('Existing index has different columns; review it before replacing');
                }
                foreach ($physicalFields as $position => $field) {
                    $actual = $existingIndex[$position];
                    $expectedPrefix = $columnPrefixes[$field];
                    if ((string)$actual['Column_name'] !== $field || (bool)$actual['Non_unique'] === (bool)$index['unique'] || ($actual['Sub_part'] !== null && ($expectedPrefix === null || (int)$actual['Sub_part'] < $expectedPrefix))) {
                        throw new RuntimeException('Existing index does not cover the required columns/uniqueness; review it before replacing');
                    }
                }
                continue;
            }
            $operations[] = array('action' => 'create_index', 'block' => $blockKey, 'name' => $index['name'], 'unique' => $index['unique'], 'fields' => $physicalFields, 'prefixes' => $columnPrefixes);
            if (!$apply) {
                continue;
            }
            $connection->queryExecute('CREATE ' . ($index['unique'] ? 'UNIQUE ' : '') . 'INDEX `' . $index['name'] . '` ON `' . $tableName . '` (' . implode(', ', $columns) . ')');
        } catch (Throwable $exception) {
            $errors[] = array('block' => $blockKey, 'index' => $index['name'], 'errors' => array($exception->getMessage()));
        }
    }
}

$output = array(
    'success' => !$errors,
    'mode' => $apply ? 'apply' : 'dry-run',
    'operations' => $operations,
    'errors' => $errors,
    'note' => 'Run dry-run again after --apply; an empty operation list means the schema is reproducible and complete.',
);
fwrite($errors ? STDERR : STDOUT, json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n");
exit($errors ? 1 : 0);
