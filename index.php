<?php
declare(strict_types=1);

session_start();

const ADMIN_EMAIL = 'eric.zeigenbein@gmail.com';
const MAX_SERVER_SAVES = 10;
const SAVE_NAME_MAX_LEN = 48;
const SAVE_PAYLOAD_MAX_LEN = 2000000;

function base64url_decode_str(string $value): ?string
{
  $base64 = strtr($value, '-_', '+/');
  $padding = strlen($base64) % 4;
  if ($padding > 0) {
    $base64 .= str_repeat('=', 4 - $padding);
  }
  $decoded = base64_decode($base64, true);
  return is_string($decoded) ? $decoded : null;
}

function current_request_url(): ?string
{
  $host = trim((string) ($_SERVER['HTTP_HOST'] ?? ''));
  if ($host === '') {
    return null;
  }

  $scheme = 'http';
  $forwardedProto = trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
  if ($forwardedProto !== '') {
    $scheme = trim(explode(',', $forwardedProto)[0]);
  } elseif (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
    $scheme = 'https';
  }

  $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
  return sprintf('%s://%s%s', $scheme, $host, $uri);
}

/**
 * @return array{name: string, email: string}|null
 */
function get_authenticated_user(): ?array
{
  $cookieValue = trim((string) ($_COOKIE['user'] ?? ''));
  if ($cookieValue === '') {
    return null;
  }

  $secret = trim((string) (getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''));
  if ($secret !== '') {
    $providedSig = trim((string) ($_COOKIE['user_sig'] ?? ''));
    $expectedSig = hash_hmac('sha256', $cookieValue, $secret);
    if ($providedSig === '' || !hash_equals($expectedSig, $providedSig)) {
      return null;
    }
  }

  $decoded = base64url_decode_str($cookieValue);
  if ($decoded === null) {
    return null;
  }

  $payload = json_decode($decoded, true);
  if (!is_array($payload)) {
    return null;
  }

  $email = strtolower(trim((string) ($payload['email'] ?? '')));
  if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    return null;
  }

  $name = trim((string) ($payload['name'] ?? ''));
  if ($name === '') {
    $name = $email;
  }

  return [
    'name' => $name,
    'email' => $email,
  ];
}

function h(string $value): string
{
  return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

/**
 * @param array<string, mixed> $payload
 */
function json_response(array $payload, int $status = 200): void
{
  http_response_code($status);
  header('Content-Type: application/json; charset=UTF-8');
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

/**
 * @return array<string, mixed>|null
 */
function request_json_body(): ?array
{
  $raw = file_get_contents('php://input');
  if (!is_string($raw) || trim($raw) === '') {
    return null;
  }
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : null;
}

function save_storage_root(): string
{
  $configured = trim((string) getenv('DUNGEON2_SAVE_PATH'));
  if ($configured !== '') {
    return $configured;
  }
  return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'savegames';
}

function save_signing_secret(): string
{
  return trim((string) (
    getenv('DUNGEON2_SAVE_SECRET') ?: getenv('SECURE_AUTH_SECRET') ?: getenv('FLASK_SECRET_KEY') ?: ''
  ));
}

function safe_file_token(string $value): string
{
  return hash('sha256', strtolower(trim($value)));
}

function user_save_file_path(string $email): string
{
  return save_storage_root() . DIRECTORY_SEPARATOR . safe_file_token($email) . '.json';
}

function ensure_save_storage_root(): bool
{
  $root = save_storage_root();
  if (is_dir($root)) {
    return true;
  }
  return mkdir($root, 0700, true) || is_dir($root);
}

function trim_save_name(string $value): string
{
  $normalized = preg_replace('/[\x00-\x1F\x7F]+/u', '', trim($value));
  if (!is_string($normalized)) {
    $normalized = trim($value);
  }
  if (function_exists('mb_substr')) {
    return mb_substr($normalized, 0, SAVE_NAME_MAX_LEN);
  }
  return substr($normalized, 0, SAVE_NAME_MAX_LEN);
}

function default_save_name(int $level, int $depth): string
{
  $safeLevel = max(1, min(9999, $level));
  $safeDepth = max(-1, min(9999, $depth));
  return trim_save_name(sprintf('Lvl %d, Depth %d, %s', $safeLevel, $safeDepth, date('Y-m-d H:i:s')));
}

function save_entry_signature(array $entry, string $secret): string
{
  $parts = [
    (string) ($entry['id'] ?? ''),
    (string) ($entry['name'] ?? ''),
    (string) ($entry['payload'] ?? ''),
    (string) ($entry['level'] ?? ''),
    (string) ($entry['depth'] ?? ''),
    (string) ($entry['created_at'] ?? ''),
    (string) ($entry['updated_at'] ?? ''),
  ];
  return hash_hmac('sha256', implode('|', $parts), $secret);
}

/**
 * @return array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }|null
 */
function normalize_save_entry(array $entry, string $secret): ?array
{
  $id = trim((string) ($entry['id'] ?? ''));
  $payload = trim((string) ($entry['payload'] ?? ''));
  if ($id === '' || !preg_match('/^[a-f0-9]{16,64}$/', $id)) {
    return null;
  }
  if ($payload === '' || strlen($payload) > SAVE_PAYLOAD_MAX_LEN) {
    return null;
  }

  $level = max(1, min(9999, (int) ($entry['level'] ?? 1)));
  $depth = max(-1, min(9999, (int) ($entry['depth'] ?? 0)));
  $createdAt = trim((string) ($entry['created_at'] ?? ''));
  $updatedAt = trim((string) ($entry['updated_at'] ?? ''));
  if ($createdAt === '') {
    $createdAt = date('c');
  }
  if ($updatedAt === '') {
    $updatedAt = $createdAt;
  }
  $nameRaw = trim((string) ($entry['name'] ?? ''));
  $name = $nameRaw === '' ? default_save_name($level, $depth) : trim_save_name($nameRaw);
  if ($name === '') {
    $name = default_save_name($level, $depth);
  }

  $normalized = [
    'id' => $id,
    'name' => $name,
    'payload' => $payload,
    'level' => $level,
    'depth' => $depth,
    'created_at' => $createdAt,
    'updated_at' => $updatedAt,
    'sig' => '',
  ];

  $providedSig = trim((string) ($entry['sig'] ?? ''));
  if ($secret !== '') {
    $expectedSig = save_entry_signature($normalized, $secret);
    if ($providedSig === '' || !hash_equals($expectedSig, $providedSig)) {
      return null;
    }
    $normalized['sig'] = $expectedSig;
  } else {
    $normalized['sig'] = hash('sha256', implode('|', [$id, $payload, $updatedAt]));
  }

  return $normalized;
}

/**
 * @return array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }>
 */
function load_user_saves(string $email, string $secret): array
{
  $file = user_save_file_path($email);
  if (!is_file($file)) {
    return [];
  }
  $raw = file_get_contents($file);
  if (!is_string($raw) || trim($raw) === '') {
    return [];
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    return [];
  }
  $entriesRaw = $decoded['saves'] ?? [];
  if (!is_array($entriesRaw)) {
    return [];
  }

  $entries = [];
  foreach ($entriesRaw as $entry) {
    if (!is_array($entry)) {
      continue;
    }
    $normalized = normalize_save_entry($entry, $secret);
    if ($normalized === null) {
      continue;
    }
    $entries[] = $normalized;
  }

  usort(
    $entries,
    static function (array $a, array $b): int {
      return strcmp((string) $b['updated_at'], (string) $a['updated_at']);
    }
  );

  return array_slice($entries, 0, MAX_SERVER_SAVES);
}

/**
 * @param array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }> $entries
 */
function persist_user_saves(string $email, array $entries, string $secret): bool
{
  if (!ensure_save_storage_root()) {
    return false;
  }

  $normalizedEntries = [];
  foreach (array_slice($entries, 0, MAX_SERVER_SAVES) as $entry) {
    $next = $entry;
    if ($secret !== '') {
      $next['sig'] = save_entry_signature($next, $secret);
    } else {
      $next['sig'] = hash('sha256', implode('|', [$next['id'], $next['payload'], $next['updated_at']]));
    }
    $normalizedEntries[] = $next;
  }

  $payload = [
    'version' => 1,
    'saves' => $normalizedEntries,
  ];
  $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if (!is_string($json)) {
    return false;
  }

  $file = user_save_file_path($email);
  $written = file_put_contents($file, $json . PHP_EOL, LOCK_EX) !== false;
  if ($written) {
    @chmod($file, 0600);
  }
  return $written;
}

/**
 * @param array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * } $entry
 * @return array{id: string, name: string, level: int, depth: int, created_at: string, updated_at: string}
 */
function save_entry_public_meta(array $entry): array
{
  return [
    'id' => (string) $entry['id'],
    'name' => (string) $entry['name'],
    'level' => (int) $entry['level'],
    'depth' => (int) $entry['depth'],
    'created_at' => (string) $entry['created_at'],
    'updated_at' => (string) $entry['updated_at'],
  ];
}

/**
 * @param array<int, array{
 *   id: string,
 *   name: string,
 *   payload: string,
 *   level: int,
 *   depth: int,
 *   created_at: string,
 *   updated_at: string,
 *   sig: string
 * }> $entries
 * @return array<int, array{id: string, name: string, level: int, depth: int, created_at: string, updated_at: string}>
 */
function save_entries_public_meta(array $entries): array
{
  $out = [];
  foreach ($entries as $entry) {
    $out[] = save_entry_public_meta($entry);
  }
  return $out;
}

$user = get_authenticated_user();
$userEmail = strtolower(trim((string) ($user['email'] ?? '')));
$isAdminUser = $userEmail !== '' && $userEmail === ADMIN_EMAIL;

$currentUrl = current_request_url();
$loginUrl = 'https://secure.blahpunk.com/oauth_login';
$logoutUrl = 'https://secure.blahpunk.com/logout';
if ($currentUrl !== null) {
  $loginUrl .= '?next=' . rawurlencode($currentUrl);
  $logoutUrl .= '?next=' . rawurlencode($currentUrl);
}

$authHref = $user !== null ? $logoutUrl : $loginUrl;
$authLabel = $user !== null ? 'Logout' : 'Login with Google';

if (empty($_SESSION['savegames_csrf'])) {
  $_SESSION['savegames_csrf'] = bin2hex(random_bytes(32));
}
$saveGamesCsrf = (string) $_SESSION['savegames_csrf'];

$apiMode = trim((string) ($_GET['api'] ?? ''));
if ($apiMode === 'savegames') {
  if ($user === null || $userEmail === '') {
    json_response(['ok' => false, 'error' => 'Please log in to manage save games.'], 401);
  }

  $saveSecret = save_signing_secret();
  if ($saveSecret === '') {
    json_response(['ok' => false, 'error' => 'Server save signing key is not configured.'], 500);
  }

  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  $entries = load_user_saves($userEmail, $saveSecret);

  if ($method === 'GET') {
    $loadId = trim((string) ($_GET['load'] ?? ''));
    if ($loadId !== '') {
      $found = null;
      foreach ($entries as $entry) {
        if ($entry['id'] === $loadId) {
          $found = $entry;
          break;
        }
      }
      if ($found === null) {
        json_response(['ok' => false, 'error' => 'Save not found.'], 404);
      }
      json_response([
        'ok' => true,
        'save' => [
          'id' => (string) $found['id'],
          'name' => (string) $found['name'],
          'payload' => (string) $found['payload'],
          'level' => (int) $found['level'],
          'depth' => (int) $found['depth'],
          'created_at' => (string) $found['created_at'],
          'updated_at' => (string) $found['updated_at'],
        ],
      ]);
    }

    json_response([
      'ok' => true,
      'max_saves' => MAX_SERVER_SAVES,
      'name_max_len' => SAVE_NAME_MAX_LEN,
      'saves' => save_entries_public_meta($entries),
    ]);
  }

  if ($method !== 'POST') {
    json_response(['ok' => false, 'error' => 'Method not allowed.'], 405);
  }

  $csrfHeader = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
  if ($csrfHeader === '' || !hash_equals($saveGamesCsrf, $csrfHeader)) {
    json_response(['ok' => false, 'error' => 'CSRF validation failed.'], 403);
  }

  $body = request_json_body();
  if ($body === null) {
    json_response(['ok' => false, 'error' => 'Invalid JSON body.'], 400);
  }

  $action = trim((string) ($body['action'] ?? ''));
  if ($action === 'delete') {
    $targetId = trim((string) ($body['id'] ?? ''));
    if ($targetId === '') {
      json_response(['ok' => false, 'error' => 'Missing save id.'], 400);
    }

    $nextEntries = [];
    $deleted = false;
    foreach ($entries as $entry) {
      if ($entry['id'] === $targetId) {
        $deleted = true;
        continue;
      }
      $nextEntries[] = $entry;
    }
    if (!$deleted) {
      json_response(['ok' => false, 'error' => 'Save not found.'], 404);
    }
    if (!persist_user_saves($userEmail, $nextEntries, $saveSecret)) {
      json_response(['ok' => false, 'error' => 'Failed to delete save.'], 500);
    }
    json_response([
      'ok' => true,
      'message' => 'Save deleted.',
      'max_saves' => MAX_SERVER_SAVES,
      'name_max_len' => SAVE_NAME_MAX_LEN,
      'saves' => save_entries_public_meta($nextEntries),
    ]);
  }

  if ($action !== 'save') {
    json_response(['ok' => false, 'error' => 'Unsupported action.'], 400);
  }

  $payload = trim((string) ($body['payload'] ?? ''));
  if ($payload === '') {
    json_response(['ok' => false, 'error' => 'Missing save payload.'], 400);
  }
  if (strlen($payload) > SAVE_PAYLOAD_MAX_LEN) {
    json_response(['ok' => false, 'error' => 'Save payload is too large.'], 413);
  }

  $level = max(1, min(9999, (int) ($body['level'] ?? 1)));
  $depth = max(-1, min(9999, (int) ($body['depth'] ?? 0)));
  $nameInput = trim((string) ($body['name'] ?? ''));
  $name = trim_save_name($nameInput);
  if ($name === '') {
    $name = default_save_name($level, $depth);
  }

  $overwriteId = trim((string) ($body['overwrite_id'] ?? ''));
  $nowIso = date('c');
  $updatedEntry = null;

  if ($overwriteId !== '') {
    foreach ($entries as $idx => $entry) {
      if ($entry['id'] !== $overwriteId) {
        continue;
      }
      $entries[$idx]['name'] = $name;
      $entries[$idx]['payload'] = $payload;
      $entries[$idx]['level'] = $level;
      $entries[$idx]['depth'] = $depth;
      $entries[$idx]['updated_at'] = $nowIso;
      $updatedEntry = $entries[$idx];
      break;
    }
    if ($updatedEntry === null) {
      json_response(['ok' => false, 'error' => 'Overwrite target not found.'], 404);
    }
  } else {
    if (count($entries) >= MAX_SERVER_SAVES) {
      json_response([
        'ok' => false,
        'error' => 'Save slot limit reached. Delete or overwrite an existing save.',
        'code' => 'SAVE_LIMIT_REACHED',
        'max_saves' => MAX_SERVER_SAVES,
        'name_max_len' => SAVE_NAME_MAX_LEN,
        'saves' => save_entries_public_meta($entries),
      ], 409);
    }
    $id = bin2hex(random_bytes(16));
    $updatedEntry = [
      'id' => $id,
      'name' => $name,
      'payload' => $payload,
      'level' => $level,
      'depth' => $depth,
      'created_at' => $nowIso,
      'updated_at' => $nowIso,
      'sig' => '',
    ];
    $entries[] = $updatedEntry;
  }

  usort(
    $entries,
    static function (array $a, array $b): int {
      return strcmp((string) $b['updated_at'], (string) $a['updated_at']);
    }
  );

  if (!persist_user_saves($userEmail, $entries, $saveSecret)) {
    json_response(['ok' => false, 'error' => 'Could not persist save data.'], 500);
  }

  $entries = load_user_saves($userEmail, $saveSecret);
  $savedMeta = null;
  foreach ($entries as $entry) {
    if ($entry['id'] === ($updatedEntry['id'] ?? '')) {
      $savedMeta = save_entry_public_meta($entry);
      break;
    }
  }
  if ($savedMeta === null) {
    $savedMeta = save_entry_public_meta($updatedEntry);
  }

  json_response([
    'ok' => true,
    'message' => $overwriteId !== '' ? 'Save overwritten.' : 'Game saved.',
    'save' => $savedMeta,
    'max_saves' => MAX_SERVER_SAVES,
    'name_max_len' => SAVE_NAME_MAX_LEN,
    'saves' => save_entries_public_meta($entries),
  ]);
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DungeonPunk!</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }

      html, body { height: 100%; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial;
        background: #0b0e14;
        color: #e6e6e6;

        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 100vh;
        overflow: auto; /* allow page scroll */
      }

      header {
        padding: 10px 12px;
        border-bottom: 1px solid #1e2533;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      header .title { font-weight: 800; letter-spacing: 0.3px; margin-right: 8px; }
      #headerInfo {
        margin-left: auto;
        text-align: right;
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.9;
        white-space: nowrap;
      }
      #debugMenuWrap {
        position: relative;
      }
      #debugMenu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 210px;
        background: #101a2b;
        border: 1px solid #27314a;
        border-radius: 10px;
        padding: 8px 10px;
        display: none;
        z-index: 1800;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
      }
      #debugMenu.show {
        display: block;
      }
      .debugToggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        padding: 6px 2px;
        cursor: pointer;
        user-select: none;
      }
      .debugToggle input {
        width: 16px;
        height: 16px;
        accent-color: #5ca7ff;
      }
      .debugTeleport {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #27314a;
        display: grid;
        gap: 6px;
      }
      .debugTeleportLabel {
        font-size: 12px;
        opacity: 0.9;
      }
      .debugTeleportRow {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .debugTeleportRow input {
        width: 100%;
        min-width: 0;
        height: 30px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 4px 8px;
        font-size: 13px;
      }
      .debugTeleportRow button {
        height: 30px;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 13px;
      }
      button, .headerAuthLink {
        background: #182032;
        color: #e6e6e6;
        border: 1px solid #27314a;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
      }
      .headerAuthLink {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        line-height: 1;
      }
      .headerAuthLink:visited {
        color: #e6e6e6;
      }
      button:hover, .headerAuthLink:hover { filter: brightness(1.1); }
      .meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        opacity: 0.95;
        font-size: 13px;
        white-space: pre;
        background: transparent;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        pointer-events: none;
      }
      .meta .meta-seed, .meta .meta-pos { opacity: 0.9; font-size: 12px; }
      .meta .meta-row { display: flex; gap: 12px; margin-top: 6px; justify-content: flex-end; }
      .meta .meta-col { display: flex; gap: 8px; align-items: baseline; min-width: 64px; justify-content: flex-end; }
      .meta .meta-col .label { opacity: 0.85; font-weight: 700; font-size: 13px; }
      .meta .meta-col .val { color: #fff; font-weight: 900; font-size: 15px; margin-left: 6px; }

      /* HP low flashing */
      .meta .val.hp.hp-low, #vitalsDisplay .hp.hp-low { color: #ff6b6b; animation: hp-pulse 1s ease-in-out infinite; }
      @keyframes hp-pulse {
        0%,100% { text-shadow: 0 0 0 rgba(255,107,107,0.0); transform: scale(1); }
        50% { text-shadow: 0 0 8px rgba(255,107,107,0.9); transform: scale(1.03); }
      }

      /* MAIN 2-COLUMN LAYOUT */
      #wrap {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 380px;
        gap: 12px;
        padding: 10px;
        overflow: visible;
        align-items: stretch;
      }

      /* LEFT COLUMN: dungeon view (maximized) */
      #leftCol {
        min-height: 0;
        display: grid;
        grid-template-rows: 1fr;
        gap: 10px;
        overflow: visible;
      }

      /* Main canvas container: center a square canvas that fills the available height */
      #mainCanvasWrap {
        min-height: 0;
        position: relative;
        display: flex;
        align-items: center;   /* center vertically */
        justify-content: center; /* center horizontally */
        overflow: visible; /* avoid internal scrollbars */
        border: 1px solid #27314a;
        border-radius: 12px;
        background: #070a10;
        padding: 8px;
      }

      canvas#c {
        display: block;
        image-rendering: auto;
        margin: 0;

        /* Default (mobile-first): keep previous square behavior. */
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        max-width: 100%;
        max-height: 100%;
        box-sizing: border-box;
        object-fit: contain;
      }

      /* Desktop: allow rectangular viewport to reveal more tiles as window grows. */
      @media (min-width: 761px) {
        canvas#c {
          width: 100%;
          height: 100%;
          aspect-ratio: auto;
          object-fit: contain;
        }
      }

      /* When the viewport is taller than it is wide (portrait), make the
         main view use the full available height and compute width from
         the 1:1 aspect so the canvas remains a full-size square. */
      @media (max-aspect-ratio: 1/1), (orientation: portrait) {
        canvas#c {
          width: auto;
          height: 100%;
        }
        /* Ensure the canvas container uses the full row height */
        #mainCanvasWrap { align-items: stretch; }
      }

      #logPanel {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 0;
        position: absolute;
        bottom: 12px;
        left: 12px;
        z-index: 1200;
        width: min(56%, 520px);
        max-width: calc(100% - 32px);
        pointer-events: auto;
      }
      #invOverlay {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 1300;
        max-width: min(42%, 420px);
        pointer-events: auto;
      }
      #invOverlay .panel { background: transparent; border: none; padding: 0; }
      #invOverlay h3 { margin: 0 0 6px 0; font-size: 13px; }
      #invSections {
        display: grid;
        gap: 4px;
      }
      .invSectionToggle {
        width: 100%;
        text-align: left;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 8px;
        background: rgba(20, 30, 48, 0.82);
        border: 1px solid #2b3956;
      }
      .invSectionBody.hidden {
        display: none;
      }

      #metaWrap { position: absolute; top: 12px; right: 12px; z-index: 1300; pointer-events: none; display:flex; flex-direction:column; align-items:flex-end }
      #logTitle { display: none; }
      #logTitle {
        font-weight: 700;
        margin: 0 0 6px 0;
      }

      #log {
        border: 1px solid #24304a;
        border-radius: 10px;
        padding: 10px;
        background: #070b12;
        /* a compact overlay height and scrollable */
        font-size: 13px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }
      #mobileOverlayBackdrop {
        position: fixed;
        inset: 0;
        z-index: 1360;
        display: none;
        background: rgba(0, 0, 0, 0.42);
      }
      #mobileOverlayBackdrop.show {
        display: block;
      }
      #mobileQuickBar {
        display: none;
        gap: 8px;
        margin-top: 6px;
      }
      #logTicker {
        display: none;
        margin-top: 6px;
        padding: 2px 6px;
        border-radius: 8px;
        border: 1px solid rgba(50, 66, 98, 0.55);
        background: rgba(8, 12, 18, 0.55);
        font-size: 12px;
        line-height: 1.25;
        opacity: 0.92;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #deathOverlay {
        position: absolute;
        inset: 0;
        z-index: 1600;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        background: rgba(0, 0, 0, 0.55);
      }
      #deathOverlay.show {
        display: flex;
      }
      #newDungeonConfirmOverlay {
        position: fixed;
        inset: 0;
        z-index: 1750;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0, 0, 0, 0.62);
      }
      #newDungeonConfirmOverlay.show {
        display: flex;
      }
      #newDungeonConfirmCard {
        width: min(560px, 94vw);
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.99);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        padding: 18px 16px;
      }
      #newDungeonConfirmTitle {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
      }
      #newDungeonConfirmText {
        margin: 0 0 10px 0;
        font-size: 13px;
        color: #c9d4e8;
      }
      #newDungeonConfirmSummary {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: #0b1322;
        padding: 10px;
        font-size: 13px;
        line-height: 1.35;
        white-space: pre-wrap;
      }
      #newDungeonConfirmButtons {
        margin-top: 12px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      #newDungeonConfirmStart {
        background: #25406f;
        border-color: #3f68a3;
      }
      #saveGameOverlay {
        position: fixed;
        inset: 0;
        z-index: 1725;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0, 0, 0, 0.65);
      }
      #saveGameOverlay.show {
        display: flex;
      }
      #saveGameCard {
        width: min(860px, 96vw);
        height: min(720px, 92vh);
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.99);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto auto 1fr auto;
        overflow: hidden;
      }
      #saveGameHeader {
        padding: 12px 14px 10px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      #saveGameTitle {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
      }
      #saveGameMode {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        font-size: 13px;
        opacity: 0.92;
      }
      #saveGameNameRow {
        padding: 8px 14px;
        border-bottom: 1px solid #1f2a40;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
      }
      #saveGameNameInput {
        width: 100%;
        min-width: 0;
        height: 36px;
        border-radius: 8px;
        border: 1px solid #32415f;
        background: #0a1220;
        color: #e6e6e6;
        padding: 6px 10px;
        font-size: 14px;
      }
      #saveGameList {
        min-height: 0;
        overflow: auto;
        padding: 10px 14px;
        display: grid;
        gap: 8px;
        align-content: start;
      }
      .saveGameEmpty {
        opacity: 0.82;
        font-size: 13px;
      }
      .saveGameRow {
        border: 1px solid #2b3956;
        border-radius: 10px;
        background: rgba(12, 18, 30, 0.9);
        padding: 10px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
      }
      .saveGameRowMain {
        min-width: 0;
      }
      .saveGameRowName {
        font-size: 14px;
        font-weight: 700;
        color: #f2f6ff;
        margin-bottom: 4px;
        overflow-wrap: anywhere;
      }
      .saveGameRowMeta {
        font-size: 12px;
        color: #b8c6df;
        opacity: 0.92;
      }
      .saveGameRowActions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .saveGameRowActions button {
        min-width: 84px;
        padding: 6px 10px;
        border-radius: 8px;
        font-size: 12px;
      }
      .saveGameDanger {
        background: #382130;
        border-color: #603249;
      }
      #saveGameFooter {
        border-top: 1px solid #1f2a40;
        padding: 8px 14px 12px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #saveGameStatus {
        font-size: 12px;
        opacity: 0.9;
        min-height: 1.2em;
      }
      #shopOverlay {
        position: fixed;
        inset: 0;
        z-index: 1700;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.65);
        padding: 12px;
      }
      #shopOverlay.show {
        display: flex;
      }
      #shopCard {
        width: min(980px, 96vw);
        height: min(760px, 92vh);
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.98);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        overflow: hidden;
      }
      #shopHeader {
        padding: 12px 14px 8px 14px;
        border-bottom: 1px solid #27314a;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #shopTitle {
        margin: 0;
        font-size: 19px;
        font-weight: 800;
      }
      #shopCloseBtn {
        min-width: 84px;
      }
      #shopMeta {
        padding: 8px 14px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        border-bottom: 1px solid #1f2a40;
      }
      #shopTabs {
        padding: 8px 14px;
        display: flex;
        gap: 8px;
        border-bottom: 1px solid #1f2a40;
      }
      .shopTab {
        min-width: 120px;
      }
      .shopTab.active {
        background: #25406f;
        border-color: #3f68a3;
      }
      #shopBody {
        min-height: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 10px 14px;
      }
      .shopListWrap {
        border: 1px solid #24304a;
        border-radius: 10px;
        overflow: auto;
        padding: 6px;
      }
      .shopItemBtn {
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border-radius: 8px;
        margin-bottom: 6px;
        background: #101828;
        border: 1px solid #23314d;
      }
      .shopItemBtn:last-child {
        margin-bottom: 0;
      }
      .shopItemBtn.active {
        background: #223554;
        border-color: #4f79b7;
      }
      #shopDetail {
        border: 1px solid #24304a;
        border-radius: 10px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      #shopDetailTitle {
        font-size: 16px;
        font-weight: 700;
      }
      #shopDetailBody {
        white-space: pre-wrap;
        font-size: 13px;
        opacity: 0.95;
      }
      #shopActionBtn {
        margin-top: auto;
      }
      #shopFooter {
        padding: 8px 14px 12px 14px;
        border-top: 1px solid #1f2a40;
        font-size: 12px;
        opacity: 0.86;
      }
      @media (max-width: 780px) {
        #shopBody {
          grid-template-columns: 1fr;
        }
      }
      #deathCard {
        min-width: min(92vw, 440px);
        max-width: min(92vw, 520px);
        padding: 18px 16px;
        border: 1px solid #2a3450;
        border-radius: 12px;
        background: rgba(7, 11, 18, 0.98);
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        text-align: center;
      }
      #deathTitle {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
      }
      #deathText {
        margin: 0 0 14px 0;
        font-size: 13px;
        color: #c9d4e8;
      }
      #deathButtons {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }
      #deathButtons button {
        min-width: 130px;
      }
      #contextActionWrap {
        margin-bottom: 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      #vitalsDisplay {
        margin-bottom: 8px;
        font-size: 18px;
        font-weight: 800;
        color: #ffffff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #vitalsDisplay .lbl {
        opacity: 0.9;
        margin-right: 6px;
        font-weight: 900;
      }
      #vitalsDisplay .sep {
        opacity: 0.65;
        margin: 0 10px;
      }
      #depthDisplay {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.1;
        color: #f2f6ff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      #contextActionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextPotionBtn {
        width: auto;
        min-width: 180px;
        max-width: 100%;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      #contextActionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextPotionBtn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      #contextAttackList {
        display: none;
        width: auto;
        max-width: min(100%, 420px);
        gap: 6px;
        flex-direction: column;
        align-items: flex-start;
      }
      #contextAttackList.grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, max-content));
        justify-content: flex-start;
      }
      .contextAttackBtn {
        width: fit-content;
        min-width: 0;
        max-width: min(100%, 320px);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        text-align: left;
      }
      .contextBtnContent {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
      }
      .contextBtnIcon {
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .contextBtnIcon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .contextBtnGlyph {
        font-size: 16px;
        line-height: 1;
        font-weight: 800;
      }
      .contextBtnText {
        min-width: 0;
        line-height: 1.2;
      }
      #surfaceCompass {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 24px;
        height: 24px;
        z-index: 1450;
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }
      #surfaceCompassArrow {
        font-size: 16px;
        line-height: 1;
        color: #ff5a5a;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        transform-origin: 50% 55%;
      }

      /* RIGHT COLUMN */
      #rightCol {
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: visible;
      }

      /* Smooth transition for layout (panels are always visible) */
      #wrap { transition: grid-template-columns 220ms ease, padding 180ms ease; }

      #miniWrap {
        border: 1px solid #24304a;
        border-radius: 12px;
        padding: 10px;
        background: #070b12;
        flex: 0 0 auto;
      }
      #miniHeader {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      #miniHeader b { font-size: 14px; }
      #miniHeader span { opacity: 0.75; font-size: 12px; }

      /* IMPORTANT: do NOT stretch the minimap; keep it at native canvas pixel size */
      canvas#mini {
        display: block;
        margin: 0 auto;

        /* Allow the canvas to scale down responsively so it remains visible
           on narrow/mobile screens while keeping pixelated rendering. */
        max-width: 100%;
        width: 100%;
        height: auto;
        margin: 0 auto; /* center when there is extra space */
      }

      .legend {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.35;
        opacity: 0.85;
      }
      .dot { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:middle; border:1px solid #1f2a40;}
      .dot.red { background:#ff6b6b; }
      .dot.blue { background:#6bb8ff; }
      .dot.green { background:#7dff6b; }
      .dot.shrine { background:#b8f2e6; }

      .panel {
        border: 1px solid #24304a;
        border-radius: 12px;
        padding: 10px;
        background: #070b12;
        flex: 0 0 auto;
        min-height: 0;
      }
      .panel h3 { margin: 0 0 8px 0; font-size: 14px; }

      #invList { display: grid; gap: 0; }
      #equipBadges {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin: 0 0 8px 0;
      }
      .equipSlot {
        display: grid;
        grid-template-rows: auto auto;
        align-items: start;
        gap: 3px;
        min-width: 0;
      }
      .equipBadge {
        border: 1px solid #2b3956;
        background: rgba(34, 48, 76, 0.9);
        border-radius: 12px;
        padding: 3px;
        min-height: 0;
        overflow: hidden;
      }
      .equipBadgeIcon {
        position: relative;
        width: 100%;
        height: auto;
        aspect-ratio: 1 / 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        line-height: 1;
        color: #9fb4d8;
        overflow: hidden;
      }
      .equipBadgeIcon img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }
      .equipBadgeGlyph {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
      }
      .equipBadgeLabel {
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.25px;
        color: #d6e4ff;
        opacity: 0.92;
        line-height: 1.15;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        width: 100%;
      }
      /* Inventory items are now direct buttons inside #invList */
      #invList > .invLabelBtn {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0 4px;
        margin: 0;
        border: none;
        background: transparent; /* fully transparent */
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      #invList > .invLabelBtn:focus { outline: none; }
      .invRow {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .invIconWrap {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 20px;
      }
      .invIconWrap img {
        width: 20px;
        height: 20px;
        object-fit: contain;
        display: block;
      }
      .invIconGlyph {
        font-weight: 800;
        line-height: 1;
        font-size: 16px;
      }
      .invLabelText {
        min-width: 0;
      }
      .muted { opacity: 0.75; }

      /* Panels below minimap: scroll internally if needed */
      #rightScroll {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 2px;
      }

      #log {
        border: none;
        border-radius: 0;
        padding: 6px 8px;
        background: transparent;

        /* a compact overlay height and scrollable */
        font-size: 13px;
        line-height: 1.35;
        height: calc(6 * 1.35em + 20px);
        overflow: auto;
        white-space: pre-wrap;
      }

      /* Responsive fallback */
      @media (max-width: 980px) {
        body { overflow: auto; }
        #wrap {
          grid-template-columns: 1fr;
          height: auto;
          min-height: unset;
        }
        #leftCol, #rightCol { overflow: visible; }
      }

      /* Mobile touch controls (visible on small screens) */
      #touchControls { display: none; }
      @media (max-width: 760px) {
        body {
          background: #131c2b;
        }
        #metaWrap {
          display: none;
        }
        header {
          background: #162133;
          border-bottom-color: #2c3b57;
        }
        #mainCanvasWrap {
          background: #111a29;
          border-color: #324465;
        }
        canvas#c {
          filter: brightness(1.24) contrast(1.08) saturate(1.08);
        }
        #invOverlay {
          position: fixed;
          left: 10px;
          right: 10px;
          top: auto;
          bottom: 108px;
          max-width: none;
          z-index: 1370;
          transform: translateY(calc(100% + 16px));
          opacity: 0;
          pointer-events: none;
          transition: transform 180ms ease, opacity 160ms ease;
        }
        #invOverlay.show {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        #invOverlay #invPanel .panel {
          background: rgba(7, 11, 18, 0.98) !important;
          border: 1px solid #2b3956 !important;
          border-radius: 12px !important;
          padding: 8px !important;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
        }
        #invOverlay #invSections {
          max-height: min(56vh, 420px);
          overflow: auto;
          padding-right: 2px;
        }
        #logPanel {
          width: calc(100% - 24px);
          max-width: none;
          background: rgba(14, 20, 32, 0.58);
          border: 1px solid #324465;
          border-radius: 12px;
          padding: 8px;
        }
        #vitalsDisplay {
          position: fixed;
          top: 70px;
          left: 12px;
          z-index: 1365;
          margin: 0;
          padding: 4px 8px;
          border: 1px solid #3a4d74;
          border-radius: 8px;
          background: rgba(11, 17, 28, 0.78);
          font-size: 14px;
          pointer-events: none;
        }
        #depthDisplay {
          margin: 0 0 6px 0;
          font-size: 14px;
          font-weight: 800;
        }
        #log {
          display: none;
          height: min(32vh, 220px);
          border: 1px solid #2d3d5b;
          border-radius: 8px;
          background: rgba(7, 11, 18, 0.88);
          padding: 8px;
        }
        #logPanel.log-expanded #log {
          display: block;
        }
        #mobileQuickBar {
          display: flex;
        }
        #mobileQuickBar button {
          flex: 1 1 0;
          min-width: 0;
          padding: 6px 8px;
          font-size: 12px;
          border-radius: 8px;
        }
        #logTicker {
          display: block;
        }
        #logPanel.log-expanded #logTicker {
          display: none;
        }

        /* Fixed to bottom-right: actions at left, D-pad at right */
        #touchControls {
          display: flex;
          position: fixed;
          right: 12px;
          left: auto;
          bottom: 12px;
          flex-direction: row-reverse;
          gap: 10px;
          align-items: center;
          pointer-events: auto;
          z-index: 1200;
          max-width: calc(100vw - 24px);
          flex-wrap: nowrap;
        }

        /* Ensure the canvas/log have space so controls stay visible */
        #mainCanvasWrap { padding-bottom: 168px; }

        /* D-pad: up centered above the middle row (left/center/right), down centered below */
        #dpad { display: flex; flex-direction: column; gap: 8px; align-items: center; }
        #dpad > div { display: flex; gap: 8px; justify-content: center; }

        /* Stack action buttons vertically so they sit to the left of the D-pad */
        #actions { display: flex; flex-direction: column; gap: 8px; align-items: center; }

        /* Table layout for touch controls: left = 3x3 D-pad, right = context buttons */
        #touchTable { display: block; }
        #touchTable table { border-collapse: collapse; }
        #touchTable td { vertical-align: middle; padding: 0 6px; }
        .control-grid { border-collapse: collapse; }
        .control-grid td { padding: 6px; }
        .context-buttons { display: flex; flex-direction: column; gap: 8px; }

        .dpad-btn {
          background: rgba(24,32,50,0.98);
          color: #e6e6e6;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px;
          width: 64px;
          height: 64px;
          font-size: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
          padding: 6px;
        }
        .dpad-btn.center {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          overflow: hidden;
        }
      }
      .dpadCenterIcon {
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transform: scale(2.5);
        transform-origin: center;
        pointer-events: none;
      }
      .dpadCenterIcon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .dpadCenterGlyph {
        font-size: 15px;
        line-height: 1;
        font-weight: 800;
      }
      .dpadCenterFallback {
        font-size: 24px;
        line-height: 1;
        opacity: 0.9;
      }
    </style>
    <!-- Matomo -->
<script>
  var _paq = window._paq = window._paq || [];
  /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function() {
    var u="//anal.blahpunk.com/";
    _paq.push(['setTrackerUrl', u+'matomo.php']);
    _paq.push(['setSiteId', '7']);
    var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
    g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
  })();
</script>
<!-- End Matomo Code -->

  </head>

  <body
    data-can-admin-controls="<?php echo $isAdminUser ? '1' : '0'; ?>"
    data-is-authenticated="<?php echo $user !== null ? '1' : '0'; ?>"
    data-save-csrf="<?php echo h($saveGamesCsrf); ?>"
    data-save-max-slots="<?php echo MAX_SERVER_SAVES; ?>"
    data-save-name-max-len="<?php echo SAVE_NAME_MAX_LEN; ?>"
  >
    <header>
      <div class="title">DungeonPunk!</div>
      <a id="btnHome" class="headerAuthLink" href="https://blahpunk.com/">Home</a>
      <button id="btnNew">New Dungeon</button>
      <?php if ($isAdminUser): ?>
        <button id="btnFog">Toggle fog</button>
      <?php endif; ?>
      <button id="btnExport">Save Game</button>
      <button id="btnImport">Load Game</button>
      <?php if ($isAdminUser): ?>
        <div id="debugMenuWrap">
          <button id="btnDebugMenu" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="debugMenu">Debug</button>
          <div id="debugMenu" aria-hidden="true">
            <label class="debugToggle" for="toggleGodmode">
              <span>Godmode</span>
              <input id="toggleGodmode" type="checkbox" />
            </label>
            <label class="debugToggle" for="toggleFreeShopping">
              <span>Free shopping</span>
              <input id="toggleFreeShopping" type="checkbox" />
            </label>
            <div class="debugTeleport">
              <label class="debugTeleportLabel" for="debugDepthInput">Teleport depth</label>
              <div class="debugTeleportRow">
                <input id="debugDepthInput" type="number" step="1" inputmode="numeric" placeholder="Depth" />
                <button id="debugDepthGo" type="button">Go</button>
              </div>
            </div>
            <div class="debugTeleport">
              <label class="debugTeleportLabel" for="debugLevelInput">Set level</label>
              <div class="debugTeleportRow">
                <input id="debugLevelInput" type="number" min="1" step="1" inputmode="numeric" placeholder="Level" />
                <button id="debugLevelGo" type="button">Go</button>
              </div>
            </div>
          </div>
        </div>
      <?php endif; ?>
      <div id="headerInfo"></div>
      <a id="authBtn" class="headerAuthLink" href="<?php echo h($authHref); ?>"><?php echo h($authLabel); ?></a>
    </header>

    <div id="wrap">
      <!-- LEFT COLUMN -->
      <div id="leftCol">
        <div id="mainCanvasWrap">
          <canvas id="c"></canvas>
          <div id="surfaceCompass" aria-hidden="true"><div id="surfaceCompassArrow">&#9650;</div></div>
          <div id="mobileOverlayBackdrop" aria-hidden="true"></div>

          <div id="invOverlay">
            <div id="invPanel">
              <div class="panel" style="background:transparent;border:none;padding:0;">
                <div id="invSections">
                  <button id="equipSectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Equipment -</button>
                  <div id="equipSectionBody" class="invSectionBody">
                    <div id="equipBadges">
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeWeapon"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelWeapon">Weapon</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeHead"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelHead">Head</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeTorso"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelTorso">Torso</div></div>
                      <div class="equipSlot"><div class="equipBadge"><div class="equipBadgeIcon" id="equipBadgeLegs"></div></div><div class="equipBadgeLabel" id="equipBadgeLabelLegs">Legs</div></div>
                    </div>
                  </div>
                  <button id="inventorySectionToggle" class="invSectionToggle" type="button" aria-expanded="true">Inventory -</button>
                  <div id="inventorySectionBody" class="invSectionBody">
                    <div id="invList"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="metaWrap">
            <div class="meta" id="meta"></div>
            <div id="metaExtras" style="margin-top:8px; text-align:right; pointer-events:none;">
              <div style="font-size:12px; opacity:0.9;">Effects</div>
              <div id="effectsText" class="muted" style="white-space:pre-wrap; font-size:13px;"></div>
            </div>
          </div>

          <div id="logPanel">
            <div id="logTitle">Message log</div>
            <div id="vitalsDisplay">HP: 0/0 | LVL: 1</div>
            <div id="contextActionWrap">
              <button id="contextActionBtn" type="button" title="Contextual action">No action</button>
              <button id="contextPotionBtn" type="button" title="Use potion" style="display:none;">Use Potion</button>
              <div id="contextAttackList"></div>
            </div>
            <div id="depthDisplay">Depth: 0</div>
            <div id="mobileQuickBar" aria-hidden="true">
              <button id="btnMobileGear" type="button" aria-expanded="false" aria-controls="invOverlay">Gear +</button>
              <button id="btnMobileLog" type="button" aria-expanded="false" aria-controls="log">Log +</button>
            </div>
            <div id="logTicker" aria-live="polite"></div>
            <div id="log"></div>
          </div>

          <div id="deathOverlay" aria-hidden="true">
            <div id="deathCard">
              <h2 id="deathTitle">You Died</h2>
              <p id="deathText">Respawn to continue this run, or start a new dungeon.</p>
              <div id="deathButtons">
                <button id="btnRespawn" type="button">Respawn</button>
                <button id="btnNewDungeon" type="button">New Dungeon</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN -->
      <div id="rightCol">
        <div id="miniWrap">
          <div id="miniHeader">
            <b>Minimap</b>
            <span>(M)</span>
          </div>
          <canvas id="mini"></canvas>
          <div class="legend">
            Locked doors need matching keys:
            <div style="margin-top:6px;">
              <span class="dot red"></span>Red &nbsp;
              <span class="dot blue"></span>Blue &nbsp;
              <span class="dot green"></span>Green &nbsp;|&nbsp;
              <span class="dot shrine"></span>Shrine
            </div>
          </div>
        </div>

        <div id="rightScroll">
          <div id="help">
            Move: <code>Arrow</code>/<code>WASD</code> &middot; Wait: <code>.</code>/<code>Space</code><br />
            Pickup: <code>G</code> &middot; Use/Equip: <code>1&ndash;9</code> &middot; Drop: <code>Shift+1&ndash;9</code> &middot; Inventory: <code>I</code><br />
            Doors: bump to open, <code>C</code> close adjacent open door<br />
            
            Interact shrine/take stairs: <code>E</code> &middot; Toggle minimap: <code>M</code> &middot; New dungeon: <code>R</code>
          </div>
        </div>
      </div>
    </div>
    <div id="shopOverlay" aria-hidden="true">
      <div id="shopCard">
        <div id="shopHeader">
          <h2 id="shopTitle">Shopkeeper</h2>
          <button id="shopCloseBtn" type="button">Close</button>
        </div>
        <div id="shopMeta">
          <div id="shopGold">Gold: 0</div>
          <div id="shopRefresh">Refresh in --:--</div>
        </div>
        <div id="shopTabs">
          <button id="shopTabBuy" class="shopTab active" type="button">Buy</button>
          <button id="shopTabSell" class="shopTab" type="button">Sell</button>
        </div>
        <div id="shopBody">
          <div id="shopList" class="shopListWrap"></div>
          <div id="shopDetail">
            <div id="shopDetailTitle">Select an item</div>
            <div id="shopDetailBody">Tap an item to view details.</div>
            <button id="shopActionBtn" type="button" disabled>Choose</button>
          </div>
        </div>
        <div id="shopFooter">Buy and sell with tap-friendly controls. Sell value is 25% of listed item value.</div>
      </div>
    </div>
    <div id="newDungeonConfirmOverlay" aria-hidden="true">
      <div id="newDungeonConfirmCard" role="dialog" aria-modal="true" aria-labelledby="newDungeonConfirmTitle">
        <h2 id="newDungeonConfirmTitle">Start New Dungeon?</h2>
        <p id="newDungeonConfirmText">This action will reset your current run.</p>
        <div id="newDungeonConfirmSummary">Current run summary unavailable.</div>
        <div id="newDungeonConfirmButtons">
          <button id="newDungeonConfirmCancel" type="button">Cancel</button>
          <button id="newDungeonConfirmStart" type="button">Start New Dungeon</button>
        </div>
      </div>
    </div>
    <div id="saveGameOverlay" aria-hidden="true">
      <div id="saveGameCard" role="dialog" aria-modal="true" aria-labelledby="saveGameTitle">
        <div id="saveGameHeader">
          <h2 id="saveGameTitle">Load Game</h2>
          <button id="saveGameCloseBtn" type="button">Close</button>
        </div>
        <div id="saveGameMode">Your save slots are stored securely on the server.</div>
        <div id="saveGameNameRow">
          <input
            id="saveGameNameInput"
            type="text"
            maxlength="<?php echo SAVE_NAME_MAX_LEN; ?>"
            placeholder="Lvl 1, Depth 0, 2026-02-23 12:34:56"
            autocomplete="off"
          />
          <button id="saveGameCreateBtn" type="button">Save New Slot</button>
        </div>
        <div id="saveGameList"></div>
        <div id="saveGameFooter">
          <div id="saveGameStatus"></div>
          <button id="saveGameRefreshBtn" type="button">Refresh</button>
        </div>
      </div>
    </div>

    <script type="module" src="./game.js?v=35"></script>
    <!-- Mobile touch controls (table: left = 3x3 directional, right = context buttons) -->
    <div id="touchControls" aria-hidden="false">
      <div id="touchTable">
        <table role="presentation">
          <tr>
            <td>
              <table class="control-grid" role="presentation">
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="-1" title="Move Up">&#8593;</button></td>
                  <td></td>
                </tr>
                <tr>
                  <td><button class="dpad-btn" data-dx="-1" data-dy="0" title="Move Left">&#8592;</button></td>
                  <td><button class="dpad-btn center" data-dx="0" data-dy="0" title="Context Action"><span class="dpadCenterFallback" aria-hidden="true">&#9679;</span></button></td>
                  <td><button class="dpad-btn" data-dx="1" data-dy="0" title="Move Right">&#8594;</button></td>
                </tr>
                <tr>
                  <td></td>
                  <td><button class="dpad-btn" data-dx="0" data-dy="1" title="Move Down">&#8595;</button></td>
                  <td></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </body>
</html>
