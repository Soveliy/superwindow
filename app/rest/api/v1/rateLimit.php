<?php

// Лимит 100 запросов в минуту (базовая защита)
function rateLimit($limit = 100, $seconds = 60)
{
    $ip = $_SERVER['REMOTE_ADDR'];
    $uri = $_SERVER['REQUEST_URI'];

    $key = md5($ip . '|' . $uri);

    $dir = $_SERVER['DOCUMENT_ROOT'] . '/upload/tmp/api_limit/';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $file = $dir . $key;

    $fp = fopen($file, 'c+');
    flock($fp, LOCK_EX);

    $data = json_decode(stream_get_contents($fp), true);

    if (!$data) {
        $data = ['count' => 0, 'time' => time()];
    }

    if (time() - $data['time'] < $seconds) {
        $data['count']++;
    } else {
        $data = ['count' => 1, 'time' => time()];
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));

    flock($fp, LOCK_UN);
    fclose($fp);

    if ($data['count'] > $limit) {
        http_response_code(429);
        header('Retry-After: '.$seconds);
        exit(json_encode(['error' => 'Too many requests']));
    }
}

function basicFilter()
{
    // если пустой User-Agent - почти всегда бот
    if (empty($_SERVER['HTTP_USER_AGENT'])) {
        http_response_code(403);
        exit;
    }

    // только JSON/ajax
    // if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    //     http_response_code(405);
    //     exit;
    // }
}