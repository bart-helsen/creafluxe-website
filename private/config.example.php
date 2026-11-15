<?php
// Copy this file to config.php (same folder) and fill in the real values.
// config.php holds the intake secret: never commit it and keep this folder
// out of public reach (the .htaccess here blocks it on Apache hosts).

return [
    // The admin app's intake endpoint and its shared secret (INTAKE_API_KEY on Railway).
    // Leave intake_key empty to only send e-mails.
    'intake_url' => 'https://admin.creafluxe.be/api/orders/intake',
    'intake_key' => '',

    // The admin app the Materialen page reads its photos from (optional; this is the default).
    'admin_url' => 'https://admin.creafluxe.be',

    // Where new requests go, and the sender address (must be a mailbox on your own domain).
    // Every request mail carries an aanvraag.json attachment the admin app can read.
    // If the admin app picks requests up from this mailbox, leave intake_key empty,
    // otherwise each request arrives twice (once by mail, once through the intake).
    'notify_to' => 'offer@creafluxe.be',
    'mail_from' => 'noreply@creafluxe.be',

    // Sites allowed to post the form.
    'allowed_origins' => ['https://creafluxe.be', 'https://www.creafluxe.be'],
];
