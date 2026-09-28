<?php

/**
 * Reuses the deployed Bitrix24 transport; its webhook remains outside this repo.
 * Current field IDs and product enum values were verified with crm.item.fields.
 */
class SwLeadExistingB24Adapter
{
    private $repository;

    public function __construct(SwLeadRepository $repository)
    {
        $this->repository = $repository;
    }

    public function deliver(array $event)
    {
        $this->loadTransport();
        $lead = null;
        $work = null;
        if ($event['aggregate_type'] === 'lead') {
            $lead = $this->repository->get('leads', (int)$event['aggregate_id']);
            if ($lead && !empty($lead['work_order_id'])) {
                $work = $this->repository->get('work_orders', (int)$lead['work_order_id']);
            }
        } elseif ($event['aggregate_type'] === 'work_order') {
            $work = $this->repository->get('work_orders', (int)$event['aggregate_id']);
            if ($work && !empty($work['lead_id'])) {
                $lead = $this->repository->get('leads', (int)$work['lead_id']);
            }
        }
        if (!$lead && !$work) {
            return array('success' => false, 'retryable' => false, 'error' => 'b24_aggregate_not_found');
        }

        // Reconcile current state, not an old event snapshot. A delayed retry must
        // never undo a newer assignment, schedule or completion in Bitrix24.
        $externalId = $lead && !empty($lead['b24_id']) ? $lead['b24_id'] : (isset($work['b24_id']) ? $work['b24_id'] : '');
        if (!ctype_digit((string)$externalId) || (int)$externalId <= 0) {
            return array('success' => false, 'retryable' => false, 'error' => 'b24_entity_id_missing');
        }
        if ($lead && $work && !empty($work['b24_id']) && (string)$lead['b24_id'] !== (string)$work['b24_id']) {
            return array('success' => false, 'retryable' => false, 'error' => 'b24_entity_id_mismatch');
        }

        $snapshot = $lead ?: array();
        $status = isset($snapshot['status']) ? $snapshot['status'] : '';
        if ($work && !in_array($status, array('cancelled', 'expired', 'available'), true)) {
            $status = isset($work['status']) ? $work['status'] : $status;
            $snapshot['dealer_id'] = isset($work['dealer_id']) ? $work['dealer_id'] : null;
            $type = self::normalizeType(isset($work['type']) ? $work['type'] : '');
            $dateField = array('measure' => 'measure_date', 'install' => 'install_date', 'delivery' => 'delivery_date');
            if (isset($dateField[$type]) && array_key_exists('planned_at', $work)) {
                $snapshot[$dateField[$type]] = $work['planned_at'];
            }
        }

        $stage = self::stageForStatus($status);
        if ($stage === '') {
            // In-work/done stages were absent from the existing transport. Do not
            // guess a successful stage or consume retry attempts until configured.
            return array('success' => false, 'blocked' => true, 'error' => 'b24_stage_unconfigured:' . $status);
        }
        $fields = isset($event['event']) && $event['event'] === 'lead.sync_requested' ? self::leadFields($snapshot) : self::workflowFields($snapshot);
        $fields['stageId'] = $stage;
        $result = bitrix24UpdateLead((int)$externalId, $fields);
        return self::checkAcknowledgement($result, (int)$externalId);
    }

    public function loadTransport()
    {
        if (!function_exists('bitrix24UpdateLead')) {
            $path = (string)swLeadConfig('b24.existing_helper_path', __DIR__ . '/../controllers/Bitrix24.php');
            if (!is_file($path)) {
                throw new SwLeadApiException(503, 'b24_transport_unavailable', 'Существующий транспорт Битрикс24 не найден');
            }
            require_once $path;
        }
        if (!function_exists('bitrix24UpdateLead')) {
            throw new SwLeadApiException(503, 'b24_transport_unavailable', 'Существующий транспорт Битрикс24 недоступен');
        }
    }

    public static function checkAcknowledgement($result, $externalId)
    {
        if (!is_array($result) || empty($result['success'])) {
            // Do not persist raw curl errors, response bodies or URLs containing
            // webhook credentials/customer data in the outbox error field.
            $code = is_array($result) && isset($result['error']) ? (string)$result['error'] : '';
            $safeCode = preg_match('/^[A-Z0-9_]{1,80}$/iD', $code) ? $code : 'request_failed';
            $http = is_array($result) && isset($result['httpCode']) ? (int)$result['httpCode'] : 0;
            $permanent = in_array($safeCode, array('ERROR_NOT_FOUND', 'NOT_FOUND', 'ERROR_ARGUMENT'), true);
            return array('success' => false, 'retryable' => !$permanent, 'error' => 'b24_' . $safeCode . ($http ? ':HTTP_' . $http : ''));
        }
        // crm.item.update acknowledges the updated item. The legacy helper alone
        // reports success even for a JSON HTTP error without a result.
        $ackId = isset($result['data']['item']['id']) ? (int)$result['data']['item']['id'] : 0;
        if ($ackId !== (int)$externalId) {
            return array('success' => false, 'retryable' => true, 'error' => 'b24_update_not_acknowledged');
        }
        return array('success' => true);
    }

    public static function workflowFields(array $lead)
    {
        $fields = array();
        foreach (array('dealer_id', 'measure_date', 'install_date', 'delivery_date') as $local) {
            if (array_key_exists($local, $lead)) {
                $fields[self::remoteField($local)] = $local === 'dealer_id' ? (!empty($lead[$local]) ? (string)(int)$lead[$local] : '') : self::dateValue($lead[$local]);
            }
        }
        return $fields;
    }

    public static function leadFields(array $lead)
    {
        $fields = self::workflowFields($lead);
        foreach (array('title', 'customer_name', 'phone', 'comment') as $local) {
            if (array_key_exists($local, $lead)) {
                $fields[self::remoteField($local)] = $lead[$local] === null ? '' : $lead[$local];
            }
        }
        if (array_key_exists('address', $lead)) {
            $fields[self::remoteField('address')] = self::addressForB24($lead);
        }
        if (array_key_exists('product_type', $lead)) {
            $fields[self::remoteField('product_type')] = self::productId($lead['product_type']);
        }
        foreach (array('budget', 'reward') as $local) {
            if (array_key_exists($local, $lead)) {
                $value = self::normalizeMoney($lead[$local]);
                $fields[self::remoteField($local)] = $value === null ? '' : $value;
            }
        }
        if (array_key_exists('type', $lead)) {
            $types = array('measure' => '2939', 'install' => '2941', 'delivery' => '2943');
            $type = self::normalizeType($lead['type']);
            if (isset($types[$type])) {
                $fields[self::remoteField('type')] = $types[$type];
            }
        }
        if (array_key_exists('expire_at', $lead)) {
            $fields[self::remoteField('expire_at')] = self::dateValue($lead['expire_at']);
        }
        return $fields;
    }

    public static function remoteField($logical)
    {
        $fields = array(
            'title' => 'title', 'customer_name' => 'ufCrm31_1787832509',
            'phone' => 'ufCrm31_1787832518', 'address' => 'ufCrm31_1787832525',
            'product_type' => 'ufCrm31_1787894491', 'type' => 'ufCrm31_1787832486',
            'budget' => 'ufCrm31_1787894554021', 'reward' => 'ufCrm31_1787894566488',
            'comment' => 'ufCrm31_1787832625', 'measure_date' => 'ufCrm31_1787832632',
            'install_date' => 'ufCrm31_1787832639', 'delivery_date' => 'ufCrm31_1787832659',
            'expire_at' => 'ufCrm31_1787895372840', 'files' => 'ufCrm31_1787895382388',
            'dealer_id' => 'ufCrm31_1787832684',
        );
        if (!isset($fields[$logical])) {
            throw new InvalidArgumentException('b24_unknown_field');
        }
        return (string)swLeadConfig('b24.fields.' . $logical, $fields[$logical]);
    }

    public static function sourceFieldCandidates($logical)
    {
        $legacy = array('product_type' => 'ufCrm31_1787832533', 'budget' => 'ufCrm31_1787832541', 'reward' => 'ufCrm31_1787832619', 'expire_at' => 'ufCrm31_1787832673');
        $fields = array(self::remoteField($logical));
        if (isset($legacy[$logical])) { $fields[] = $legacy[$logical]; }
        return array_values(array_unique($fields));
    }

    public static function readSourceField(array $item, $logical, &$found = null, &$fieldUsed = null)
    {
        $found = false;
        $fieldUsed = null;
        foreach (self::sourceFieldCandidates($logical) as $field) {
            // A current explicit null/false is authoritative, not a reason to
            // resurrect the old field's stale value.
            if (array_key_exists($field, $item)) {
                $found = true;
                $fieldUsed = $field;
                return $item[$field];
            }
        }
        return null;
    }

    public static function productLabels()
    {
        $configured = swLeadConfig('b24.product_labels', array('2945' => '1', '2947' => '2'));
        $labels = array();
        foreach (is_array($configured) ? $configured : array() as $id => $label) {
            if (ctype_digit((string)$id) && (int)$id > 0 && is_scalar($label) && trim((string)$label) !== '') {
                $labels[(string)$id] = trim((string)$label);
            }
        }
        return $labels;
    }

    public static function productLabel($value)
    {
        if ($value === null || $value === false || $value === '') { return ''; }
        if (!is_scalar($value)) { throw new SwLeadApiException(422, 'invalid_source_shape', 'Некорректный тип продукта'); }
        $value = trim((string)$value);
        $labels = self::productLabels();
        return array_key_exists($value, $labels) ? $labels[$value] : $value;
    }

    public static function productId($value)
    {
        if ($value === null || $value === false || $value === '') { return ''; }
        if (!is_scalar($value)) { throw new SwLeadApiException(422, 'b24_product_unmapped', 'Тип продукта не сопоставлен с Битрикс24'); }
        $value = trim((string)$value);
        $labels = self::productLabels();
        if (array_key_exists($value, $labels)) { return $value; }
        $ids = array_keys($labels, $value, true);
        if (count($ids) === 1) { return (string)$ids[0]; }
        throw new SwLeadApiException(422, 'b24_product_unmapped', 'Тип продукта не сопоставлен с Битрикс24');
    }

    public static function normalizeMoney($value)
    {
        if ($value === null || $value === false || $value === '') { return null; }
        if (is_int($value) || is_float($value)) {
            if (is_finite((float)$value) && $value >= 0) { return (float)$value; }
        } elseif (is_string($value)) {
            $value = str_replace(array(' ', "\xC2\xA0", "\xE2\x80\xAF"), '', trim($value));
            if ($value === '') { return null; }
            if (preg_match('/^\d+(?:[.,]\d+)?(?:\|[A-Z]{3})?$/D', $value)) {
                $number = (float)str_replace(',', '.', explode('|', $value)[0]);
                if (is_finite($number)) { return $number; }
            }
        }
        throw new SwLeadApiException(422, 'invalid_source_value', 'Некорректная сумма в источнике');
    }

    private static function addressForB24(array $lead)
    {
        $address = isset($lead['address']) && is_scalar($lead['address']) ? (string)$lead['address'] : '';
        // Legacy records already contain the original Bitrix composite value.
        if (strpos($address, '|') !== false || $address === '') { return $address; }
        $source = isset($lead['source_data']) && is_array($lead['source_data']) ? $lead['source_data'] : array();
        $meta = isset($source['sourceAddress']) && is_array($source['sourceAddress']) ? $source['sourceAddress'] : array();
        $coordinates = isset($lead['coordinates']) && is_array($lead['coordinates']) ? $lead['coordinates'] : array();
        $latitude = isset($coordinates['latitude']) ? $coordinates['latitude'] : null;
        $longitude = isset($coordinates['longitude']) ? $coordinates['longitude'] : null;
        $pair = is_numeric($latitude) && is_numeric($longitude) && is_finite((float)$latitude) && is_finite((float)$longitude) && abs((float)$latitude) <= 90 && abs((float)$longitude) <= 180
            ? (string)(float)$latitude . ';' . (string)(float)$longitude : ';';
        $locationId = isset($meta['locationId']) && is_scalar($meta['locationId']) && ctype_digit((string)$meta['locationId']) && (int)$meta['locationId'] > 0 ? (string)(int)$meta['locationId'] : '';
        return $meta || $pair !== ';' ? $address . '|' . $pair . '|' . $locationId : $address;
    }

    public static function stageForStatus($status)
    {
        $configured = trim((string)swLeadConfig('b24.stages.' . $status, ''));
        if ($configured !== '') {
            return $configured;
        }
        $constants = array(
            'available' => 'B24_LEAD_STAGE_PUBLISHED',
            'assigned' => 'B24_LEAD_STAGE_ASSIGNED',
            'in_work' => 'B24_LEAD_STAGE_IN_WORK',
            'done' => 'B24_LEAD_STAGE_DONE',
        );
        return isset($constants[$status]) && defined($constants[$status]) ? trim((string)constant($constants[$status])) : '';
    }

    public static function normalizeType($value)
    {
        $types = array('2939' => 'measure', 'measurement' => 'measure', 'замер' => 'measure', '2941' => 'install', 'installation' => 'install', 'монтаж' => 'install', '2943' => 'delivery', 'доставка' => 'delivery');
        $value = trim((string)$value);
        $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        return isset($types[$value]) ? $types[$value] : $value;
    }

    public static function dateValue($value)
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (is_object($value) && method_exists($value, 'format')) {
            return $value->format('Y-m-d\TH:i:sP');
        }
        try {
            return (new DateTimeImmutable((string)$value))->format('Y-m-d\TH:i:sP');
        } catch (Exception $exception) {
            throw new SwLeadApiException(422, 'b24_date_invalid', 'Некорректная дата для синхронизации Битрикс24');
        }
    }
}
