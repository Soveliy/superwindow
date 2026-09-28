<?php

use Bitrix\Highloadblock\HighloadBlockTable;
use Bitrix\Main\Application;
use Bitrix\Main\Loader;

class SwLeadRepository
{
    private static $metadata = array();

    public function metadata($blockKey)
    {
        if (isset(self::$metadata[$blockKey])) {
            return self::$metadata[$blockKey];
        }

        if (!Loader::includeModule('highloadblock')) {
            throw new SwLeadApiException(503, 'highloadblock_module_unavailable', 'Модуль highloadblock недоступен');
        }

        $blockConfig = swLeadConfig('hlblocks.' . $blockKey, null);
        if (!is_array($blockConfig)) {
            throw new SwLeadApiException(503, 'storage_not_configured', 'Хранилище не настроено', array('block' => $blockKey));
        }

        $block = null;
        if ((int)$blockConfig['id'] > 0) {
            $block = HighloadBlockTable::getById((int)$blockConfig['id'])->fetch();
        }
        if (!$block && trim((string)$blockConfig['name']) !== '') {
            $block = HighloadBlockTable::getList(array(
                'filter' => array('=NAME' => (string)$blockConfig['name']),
                'limit' => 1,
            ))->fetch();
        }

        if (!$block) {
            throw new SwLeadApiException(503, 'storage_not_configured', 'HL-блок не найден', array(
                'block' => $blockKey,
                'configuredName' => (string)$blockConfig['name'],
            ));
        }

        $entity = HighloadBlockTable::compileEntity($block);
        $dataClass = $entity->getDataClass();
        $available = array();
        foreach ($entity->getFields() as $fieldName => $field) {
            $available[$fieldName] = true;
        }

        $missing = array();
        foreach ((array)$blockConfig['required'] as $logicalName) {
            $physicalName = isset($blockConfig['fields'][$logicalName]) ? $blockConfig['fields'][$logicalName] : '';
            if ($physicalName === '' || !isset($available[$physicalName])) {
                $missing[] = $physicalName !== '' ? $physicalName : $logicalName;
            }
        }
        if ($missing) {
            throw new SwLeadApiException(503, 'storage_schema_error', 'В HL-блоке отсутствуют обязательные поля', array(
                'block' => $blockKey,
                'missingFields' => $missing,
            ));
        }

        $userTypes = array();
        $queryFields = array();
        $legacy = (bool)swLeadConfig('compatibility.legacy_b24', false) && in_array($blockKey, array('leads', 'work_orders'), true);
        if ($legacy) {
            $userFields = CUserTypeEntity::GetList(array(), array('ENTITY_ID' => 'HLBLOCK_' . (int)$block['ID']));
            while ($userField = $userFields->Fetch()) {
                $userTypes[$userField['FIELD_NAME']] = (string)$userField['USER_TYPE_ID'];
            }
            foreach ($blockConfig['fields'] as $logical => $physical) {
                if (!isset($available[$physical]) || !isset($userTypes[$physical]) || $userTypes[$physical] !== 'string') {
                    continue;
                }
                if ($this->isDateField($logical)) {
                    $alias = 'SW_DATE_' . strtoupper($logical);
                    // Legacy integrations use both DD-MM-YYYY and Bitrix DD.MM.YYYY;
                    // B24 can also supply ISO dates. Parse at query time so updates
                    // through the old importer are immediately visible to cron.
                    $expression = "STR_TO_DATE(CONCAT(SUBSTRING(REPLACE(REPLACE(%s, 'T', ' '), '.', '-'), 1, 10), ' ', COALESCE(NULLIF(SUBSTRING(%s, 12, 8), ''), '00:00:00')), CASE WHEN %s REGEXP '^[0-9]{4}-' THEN '%%Y-%%m-%%d %%H:%%i:%%s' ELSE '%%d-%%m-%%Y %%H:%%i:%%s' END)";
                    if (!$entity->hasField($alias)) {
                        $entity->addField(new \Bitrix\Main\Entity\ExpressionField($alias, $expression, array($physical, $physical, $physical), array('data_type' => 'datetime')));
                    }
                    $queryFields[$logical] = $alias;
                } elseif (in_array($logical, array('budget', 'reward', 'lead_id'), true)) {
                    $alias = 'SW_NUMBER_' . strtoupper($logical);
                    if (!$entity->hasField($alias)) {
                        $entity->addField(new \Bitrix\Main\Entity\ExpressionField($alias, "CAST(REPLACE(REPLACE(SUBSTRING_INDEX(%s, '|', 1), ' ', ''), ',', '.') AS DECIMAL(18, 2))", array($physical), array('data_type' => 'float')));
                    }
                    $queryFields[$logical] = $alias;
                }
            }
            if ($blockKey === 'leads' && isset($available[$blockConfig['fields']['schedule_deadline']], $available[$blockConfig['fields']['taken_at']])) {
                $alias = 'SW_EFFECTIVE_SCHEDULE_DEADLINE';
                $timeout = (int)swLeadConfig('lead.schedule_timeout_seconds', 86400);
                if (!$entity->hasField($alias)) {
                    $entity->addField(new \Bitrix\Main\Entity\ExpressionField($alias, 'COALESCE(%s, DATE_ADD(%s, INTERVAL ' . $timeout . ' SECOND))', array(isset($queryFields['schedule_deadline']) ? $queryFields['schedule_deadline'] : $blockConfig['fields']['schedule_deadline'], isset($queryFields['taken_at']) ? $queryFields['taken_at'] : $blockConfig['fields']['taken_at']), array('data_type' => 'datetime')));
                }
                $queryFields['schedule_deadline'] = $alias;
            }
        }

        self::$metadata[$blockKey] = array(
            'hlblock_id' => (int)$block['ID'],
            'block_key' => $blockKey,
            'legacy' => $legacy,
            'user_types' => $userTypes,
            'query_fields' => $queryFields,
            'config' => $blockConfig,
            'entity' => $entity,
            'class' => $dataClass,
            'available' => $available,
            'table' => $dataClass::getTableName(),
        );

        return self::$metadata[$blockKey];
    }

    public function get($blockKey, $id)
    {
        $rows = $this->find($blockKey, array('=ID' => (int)$id), array(), 1, 0);
        return isset($rows[0]) ? $rows[0] : null;
    }

    /**
     * Lock and return a row inside a transaction already started by the caller.
     */
    public function getForUpdate($blockKey, $id)
    {
        $meta = $this->metadata($blockKey);
        $table = (string)$meta['table'];
        if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
            throw new SwLeadApiException(503, 'storage_schema_error', 'Некорректное имя таблицы');
        }
        Application::getConnection()->query('SELECT ID FROM `' . $table . '` WHERE ID = ' . (int)$id . ' FOR UPDATE')->fetch();
        return $this->get($blockKey, (int)$id);
    }

    public function supports($blockKey, $logicalField)
    {
        $meta = $this->metadata($blockKey);
        if ($logicalField === 'ID') {
            return true;
        }
        if (!isset($meta['config']['fields'][$logicalField])) {
            return false;
        }
        return isset($meta['available'][$meta['config']['fields'][$logicalField]]);
    }

    public function findOne($blockKey, array $filter, array $order = array())
    {
        $rows = $this->find($blockKey, $filter, $order, 1, 0);
        return isset($rows[0]) ? $rows[0] : null;
    }

    public function find($blockKey, array $filter = array(), array $order = array(), $limit = 0, $offset = 0)
    {
        $meta = $this->metadata($blockKey);
        $dataClass = $meta['class'];
        $params = array(
            'select' => $this->selectFields($meta),
            'filter' => $this->mapFilter($meta, $filter),
        );
        if ($order) {
            $params['order'] = $this->mapOrder($meta, $order);
        }
        if ((int)$limit > 0) {
            $params['limit'] = (int)$limit;
        }
        if ((int)$offset > 0) {
            $params['offset'] = (int)$offset;
        }

        try {
            $result = $dataClass::getList($params);
            $rows = array();
            while ($row = $result->fetch()) {
                $rows[] = $this->toLogical($meta, $row);
            }
            return $rows;
        } catch (Throwable $exception) {
            throw new SwLeadApiException(503, 'storage_query_failed', 'Не удалось прочитать данные', array('block' => $blockKey));
        }
    }

    public function count($blockKey, array $filter = array())
    {
        $meta = $this->metadata($blockKey);
        $dataClass = $meta['class'];
        try {
            return (int)$dataClass::getCount($this->mapFilter($meta, $filter));
        } catch (Throwable $exception) {
            throw new SwLeadApiException(503, 'storage_query_failed', 'Не удалось посчитать записи', array('block' => $blockKey));
        }
    }

    public function add($blockKey, array $values)
    {
        $meta = $this->metadata($blockKey);
        $dataClass = $meta['class'];
        try {
            $result = $dataClass::add($this->fromLogical($meta, $values));
        } catch (SwLeadApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            throw new SwLeadApiException(503, 'storage_write_failed', 'Не удалось создать запись', array('block' => $blockKey));
        }
        if (!$result->isSuccess()) {
            throw new SwLeadApiException(503, 'storage_write_failed', 'Не удалось создать запись', array(
                'block' => $blockKey,
                'errors' => $result->getErrorMessages(),
            ));
        }

        return (int)$result->getId();
    }

    public function update($blockKey, $id, array $values)
    {
        $meta = $this->metadata($blockKey);
        $dataClass = $meta['class'];
        try {
            $result = $dataClass::update((int)$id, $this->fromLogical($meta, $values));
        } catch (SwLeadApiException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            throw new SwLeadApiException(503, 'storage_write_failed', 'Не удалось обновить запись', array('block' => $blockKey));
        }
        if (!$result->isSuccess()) {
            throw new SwLeadApiException(503, 'storage_write_failed', 'Не удалось обновить запись', array(
                'block' => $blockKey,
                'errors' => $result->getErrorMessages(),
            ));
        }
    }

    public function locked($blockKey, $id, $callback)
    {
        $meta = $this->metadata($blockKey);
        $table = (string)$meta['table'];
        if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) {
            throw new SwLeadApiException(503, 'storage_schema_error', 'Некорректное имя таблицы');
        }

        $connection = Application::getConnection();
        $connection->startTransaction();
        try {
            $connection->query('SELECT ID FROM `' . $table . '` WHERE ID = ' . (int)$id . ' FOR UPDATE')->fetch();
            $current = $this->get($blockKey, (int)$id);
            $result = call_user_func($callback, $current);
            $connection->commitTransaction();
            return $result;
        } catch (Throwable $exception) {
            $connection->rollbackTransaction();
            throw $exception;
        }
    }

    public function withImportLock($externalId, $callback)
    {
        return $this->withNamedLock('lead_import', $externalId, $callback, 'import_busy');
    }

    public function withNamedLock($namespace, $key, $callback, $errorCode = 'resource_busy')
    {
        $connection = Application::getConnection();
        $safeNamespace = preg_replace('/[^a-z0-9_]+/i', '_', (string)$namespace);
        $lockName = 'sw_' . substr($safeNamespace, 0, 16) . '_' . substr(hash('sha256', (string)$key), 0, 32);
        $helper = $connection->getSqlHelper();
        $quoted = $helper->forSql($lockName, 64);
        $locked = false;

        try {
            $row = $connection->query("SELECT GET_LOCK('" . $quoted . "', 5) AS L")->fetch();
            $locked = is_array($row) && (int)$row['L'] === 1;
        } catch (Throwable $exception) {
            // A unique DB index on UF_B24_ENTITY_ID remains the final race guard.
            $locked = false;
        }

        if (!$locked) {
            throw new SwLeadApiException(409, (string)$errorCode, 'Операция с этой записью уже выполняется, повторите запрос');
        }

        try {
            return call_user_func($callback);
        } finally {
            try {
                $connection->queryExecute("SELECT RELEASE_LOCK('" . $quoted . "')");
            } catch (Throwable $exception) {
                // The DB releases advisory locks when the connection closes.
            }
        }
    }

    public function transaction($callback)
    {
        $connection = Application::getConnection();
        $connection->startTransaction();
        try {
            $result = call_user_func($callback);
            $connection->commitTransaction();
            return $result;
        } catch (Throwable $exception) {
            $connection->rollbackTransaction();
            throw $exception;
        }
    }

    private function selectFields(array $meta)
    {
        $select = array('ID');
        foreach ($meta['config']['fields'] as $physicalName) {
            if (isset($meta['available'][$physicalName])) {
                $select[] = $physicalName;
            }
        }
        return array_values(array_unique($select));
    }

    private function mapFilter(array $meta, array $filter)
    {
        $mapped = array();
        foreach ($filter as $key => $value) {
            if (is_int($key)) {
                $mapped[$key] = is_array($value) ? $this->mapFilter($meta, $value) : $value;
                continue;
            }

            if ($key === 'LOGIC') {
                $mapped[$key] = $value;
                continue;
            }

            preg_match('/^([^A-Za-z0-9_]*)(.+)$/', (string)$key, $matches);
            $operator = isset($matches[1]) ? $matches[1] : '';
            $logical = isset($matches[2]) ? $matches[2] : (string)$key;
            $physical = $logical === 'ID' ? 'ID' : (isset($meta['query_fields'][$logical]) ? $meta['query_fields'][$logical] : (isset($meta['config']['fields'][$logical]) ? $meta['config']['fields'][$logical] : $logical));
            $mapped[$operator . $physical] = $this->filterValue($logical, $value);
            if (!empty($meta['legacy']) && $logical === 'type') {
                $aliases = $this->legacyTypeAliases($value);
                $mapped[$operator . $physical] = $aliases;
            }
        }
        return $mapped;
    }

    private function mapOrder(array $meta, array $order)
    {
        $mapped = array();
        foreach ($order as $logical => $direction) {
            $physical = $logical === 'ID' ? 'ID' : (isset($meta['query_fields'][$logical]) ? $meta['query_fields'][$logical] : (isset($meta['config']['fields'][$logical]) ? $meta['config']['fields'][$logical] : $logical));
            $mapped[$physical] = strtoupper((string)$direction) === 'ASC' ? 'ASC' : 'DESC';
        }
        return $mapped;
    }

    private function filterValue($logical, $value)
    {
        if ($this->isDateField($logical)) {
            if (is_array($value)) {
                return array_map('swLeadDateForStorage', $value);
            }
            return swLeadDateForStorage($value);
        }
        return $value;
    }

    private function fromLogical(array $meta, array $values)
    {
        $mapped = array();
        foreach ($values as $logical => $value) {
            if (!isset($meta['config']['fields'][$logical])) {
                continue;
            }
            $physical = $meta['config']['fields'][$logical];
            if (!isset($meta['available'][$physical])) {
                continue;
            }
            if ($this->isMultipleFileField($logical)) {
                $value = $this->normalizeFileIds($value);
            } elseif ($this->isJsonField($logical) && !is_string($value)) {
                $value = swLeadJsonEncode($value);
                $maxBytes = (int)swLeadConfig('storage.max_json_bytes', 56000);
                if (strlen($value) > $maxBytes) {
                    throw new SwLeadApiException(422, 'storage_value_too_large', 'Структурированное значение превышает допустимый размер', array(
                        'field' => $logical,
                        'maxBytes' => $maxBytes,
                    ));
                }
            } elseif ($this->isDateField($logical)) {
                $value = swLeadDateForStorage($value);
                if ($value !== null && !empty($meta['legacy']) && isset($meta['user_types'][$physical]) && $meta['user_types'][$physical] === 'string') {
                    $value = $value->format('d-m-Y H:i:s');
                }
            } elseif (!empty($meta['legacy']) && $logical === 'type') {
                $value = $this->legacyTypeForStorage($meta['block_key'], $value);
            } elseif (!empty($meta['legacy']) && $logical === 'b24_id' && isset($meta['user_types'][$physical]) && $meta['user_types'][$physical] === 'integer') {
                if ($value !== null && $value !== '' && !ctype_digit((string)$value)) {
                    throw new SwLeadApiException(422, 'invalid_b24_id', 'Идентификатор Битрикс24 должен быть целым числом');
                }
                $value = $value === null || $value === '' ? null : (int)$value;
            }
            $mapped[$physical] = $value;
        }
        return $mapped;
    }

    private function toLogical(array $meta, array $row)
    {
        $logical = array('id' => isset($row['ID']) ? (int)$row['ID'] : 0);
        foreach ($meta['config']['fields'] as $name => $physical) {
            if (!array_key_exists($physical, $row)) {
                continue;
            }
            $value = $row[$physical];
            if ($this->isMultipleFileField($name)) {
                $value = $this->normalizeFileIds($value);
            } elseif ($this->isJsonField($name)) {
                // Existing integrations may store coordinates as "lat, lon".
                $value = swLeadJsonDecode($value, $name === 'coordinates' ? $value : array());
            } elseif ($this->isDateField($name)) {
                $value = swLeadIso($value);
            } elseif (in_array($name, array('dealer_id', 'lead_id', 'version', 'attempts', 'entity_id', 'actor_id', 'aggregate_id', 'in_app_visible'), true)) {
                $value = $value === null || $value === '' ? null : (int)$value;
            } elseif (in_array($name, array('budget', 'reward'), true)) {
                $value = $value === null || $value === '' ? null : (float)str_replace(array(' ', ','), array('', '.'), (string)$value);
            } elseif (!empty($meta['legacy']) && $name === 'type') {
                $value = $this->normalizeLegacyType($value);
            }
            $logical[$name] = $value;
        }
        if (!empty($meta['legacy'])) {
            $logical['version'] = max(1, (int)(isset($logical['version']) ? $logical['version'] : 1));
            // Old records predate the additive metadata fields. Keep read paths
            // usable without rewriting existing business data in the installer.
            $logical['created_at'] = !empty($logical['created_at']) ? $logical['created_at'] : (!empty($logical['taken_at']) ? $logical['taken_at'] : null);
            $logical['updated_at'] = !empty($logical['updated_at']) ? $logical['updated_at'] : $logical['created_at'];
            if ($meta['block_key'] === 'leads' && empty($logical['schedule_deadline']) && !empty($logical['taken_at'])) {
                $logical['schedule_deadline'] = swLeadIso(swLeadParseDateTime($logical['taken_at'], 'takenAt', true)->modify('+' . (int)swLeadConfig('lead.schedule_timeout_seconds', 86400) . ' seconds'));
            }
        }
        return $logical;
    }

    private function normalizeLegacyType($value)
    {
        $value = trim((string)$value);
        $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        $types = array('measure' => 'measurement', 'measurement' => 'measurement', 'замер' => 'measurement', '2939' => 'measurement', 'install' => 'installation', 'installation' => 'installation', 'монтаж' => 'installation', '2941' => 'installation', 'delivery' => 'delivery', 'доставка' => 'delivery', '2943' => 'delivery');
        return isset($types[$value]) ? $types[$value] : $value;
    }

    private function legacyTypeForStorage($blockKey, $value)
    {
        $normalized = $this->normalizeLegacyType($value);
        $types = $blockKey === 'work_orders'
            ? array('measurement' => 'замер', 'installation' => 'монтаж', 'delivery' => 'доставка')
            : array('measurement' => 'measure', 'installation' => 'install', 'delivery' => 'delivery');
        return isset($types[$normalized]) ? $types[$normalized] : $value;
    }

    private function legacyTypeAliases($value)
    {
        $all = array(
            'measurement' => array('measurement', 'measure', 'замер', '2939'),
            'installation' => array('installation', 'install', 'монтаж', '2941'),
            'delivery' => array('delivery', 'доставка', '2943'),
        );
        $aliases = array();
        foreach ((array)$value as $item) {
            $type = $this->normalizeLegacyType($item);
            $aliases = array_merge($aliases, isset($all[$type]) ? $all[$type] : array($item));
        }
        return array_values(array_unique($aliases));
    }

    private function isJsonField($logical)
    {
        return in_array($logical, array('coordinates', 'files', 'route', 'warehouse', 'reminder', 'source_data', 'payload', 'channels', 'delivery', 'before', 'after', 'meta', 'preferences'), true);
    }

    private function isDateField($logical)
    {
        return substr((string)$logical, -3) === '_at' || in_array($logical, array('schedule_deadline', 'expire_at', 'fact_date', 'measure_date', 'install_date', 'delivery_date'), true);
    }

    private function isMultipleFileField($logical)
    {
        return $logical === 'photo_ids';
    }

    private function normalizeFileIds($value)
    {
        $ids = array();
        $queue = is_array($value) ? array_values($value) : array($value);
        while ($queue) {
            $item = array_shift($queue);
            if (is_array($item)) {
                if (isset($item['ID']) || isset($item['id']) || isset($item['VALUE'])) {
                    $queue[] = isset($item['ID']) ? $item['ID'] : (isset($item['id']) ? $item['id'] : $item['VALUE']);
                } else {
                    foreach ($item as $nested) {
                        $queue[] = $nested;
                    }
                }
                continue;
            }
            $id = (int)$item;
            if ($id > 0) {
                $ids[$id] = $id;
            }
        }
        return array_values($ids);
    }
}
