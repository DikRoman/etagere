<?php
/**
 * Mail relay for Étagère (host on Reg.ru, called from VPS over HTTP).
 * Prefer SMTP (mail-config.php) for DKIM; falls back to mail().
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'json']);
    exit;
}

$configFile = __DIR__ . '/mail-config.php';
$config = is_file($configFile) ? (include $configFile) : [];
$secret = $config['relay_secret'] ?? 'etagere-mail-relay-2026';

if (($data['secret'] ?? '') !== $secret) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$to = trim($data['to'] ?? '');
$subject = trim($data['subject'] ?? '');
$text = trim($data['text'] ?? '');
$html = trim($data['html'] ?? '');

if (!$to || !$subject || !$text) {
    http_response_code(400);
    echo json_encode(['error' => 'fields']);
    exit;
}

if ($html === '') {
    $html = nl2br(htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
}

$fromEmail = $config['from_email'] ?? 'noreply@etagere.ru';
$fromName = $config['from_name'] ?? 'Etagere';
$replyTo = $config['reply_to'] ?? $fromEmail;
$siteUrl = rtrim($config['site_url'] ?? 'https://etagere.ru', '/');

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFrom = '=?UTF-8?B?' . base64_encode($fromName) . '?= <' . $fromEmail . '>';
$messageId = '<' . bin2hex(random_bytes(12)) . '@etagere.ru>';
$boundary = 'etagere_' . bin2hex(random_bytes(8));

$body = buildMimeBody($boundary, $text, $html);
$headers = implode("\r\n", [
    'MIME-Version: 1.0',
    'From: ' . $encodedFrom,
    'Reply-To: ' . $replyTo,
    'Return-Path: ' . $fromEmail,
    'Message-ID: ' . $messageId,
    'X-Mailer: Etagere Mail Relay',
    'List-Unsubscribe: <' . $siteUrl . '>',
    'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
]);

$ok = false;
if (!empty($config['smtp_host']) && !empty($config['smtp_user']) && !empty($config['smtp_pass'])) {
    $ok = smtpSend($config, $fromEmail, $to, $encodedSubject, $headers, $body);
}

if (!$ok) {
    $plainHeaders = implode("\r\n", [
        'MIME-Version: 1.0',
        'From: ' . $encodedFrom,
        'Reply-To: ' . $replyTo,
        'Return-Path: ' . $fromEmail,
        'Message-ID: ' . $messageId,
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ]);
    $ok = @mail($to, $encodedSubject, $body, $plainHeaders);
}

echo json_encode(['ok' => (bool) $ok]);
exit;

function buildMimeBody(string $boundary, string $text, string $html): string
{
    $wrap = static function (string $part): string {
        return chunk_split(base64_encode($part), 76, "\r\n");
    };

    $out = '';
    $out .= '--' . $boundary . "\r\n";
    $out .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $out .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $out .= $wrap($text) . "\r\n";
    $out .= '--' . $boundary . "\r\n";
    $out .= "Content-Type: text/html; charset=UTF-8\r\n";
    $out .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $out .= $wrap($html) . "\r\n";
    $out .= '--' . $boundary . "--\r\n";
    return $out;
}

function smtpSend(array $config, string $fromEmail, string $to, string $subject, string $headers, string $body): bool
{
    $host = $config['smtp_host'];
    $port = (int) ($config['smtp_port'] ?? 465);
    $user = $config['smtp_user'];
    $pass = $config['smtp_pass'];
    $secure = ($config['smtp_secure'] ?? true) !== false;
    $remote = ($secure ? 'ssl://' : '') . $host . ':' . $port;

    $fp = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
    if (!$fp) {
        return false;
    }

    stream_set_timeout($fp, 20);
    $read = static function () use ($fp): string {
        $data = '';
        while ($line = fgets($fp, 515)) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $data;
    };
    $write = static function (string $cmd) use ($fp): void {
        fwrite($fp, $cmd . "\r\n");
    };

    $read();
    $write('EHLO etagere.ru');
    $read();
    $write('AUTH LOGIN');
    $read();
    $write(base64_encode($user));
    $read();
    $write(base64_encode($pass));
    if (!str_starts_with($read(), '235')) {
        fclose($fp);
        return false;
    }

    $write('MAIL FROM:<' . $fromEmail . '>');
    if (!str_starts_with($read(), '250')) {
        fclose($fp);
        return false;
    }
    $write('RCPT TO:<' . $to . '>');
    if (!str_starts_with($read(), '250')) {
        fclose($fp);
        return false;
    }
    $write('DATA');
    if (!str_starts_with($read(), '354')) {
        fclose($fp);
        return false;
    }

    $message = 'Subject: ' . $subject . "\r\n";
    $message .= 'To: <' . $to . ">\r\n";
    $message .= $headers . "\r\n\r\n";
    $message .= $body . "\r\n.\r\n";
    fwrite($fp, $message);
    $ok = str_starts_with($read(), '250');
    $write('QUIT');
    fclose($fp);
    return $ok;
}
