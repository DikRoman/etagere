<?php
/** Copy to /www/etagere.online/mail-config.php on Reg.ru hosting (not in git). */
return [
    'relay_secret' => 'etagere-mail-relay-2026',
    'from_email' => 'noreply@etagere.ru',
    'from_name' => 'Etagere',
    'reply_to' => 'hello@etagere.ru',
    'site_url' => 'https://etagere.ru',
    // Reg.ru SMTP — enables DKIM signing when mailbox exists on hosting
    'smtp_host' => 'mail.hosting.reg.ru',
    'smtp_port' => 465,
    'smtp_secure' => true,
    'smtp_user' => 'noreply@etagere.ru',
    'smtp_pass' => 'YOUR_MAILBOX_PASSWORD',
];
