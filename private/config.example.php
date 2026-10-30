<?php
// Copy this file to config.php (same folder) and fill in the real values.
// config.php holds the intake secret: never commit it and keep this folder
// out of public reach (the .htaccess here blocks it on Apache hosts).

return [
    // The admin app's intake endpoint and its shared secret (INTAKE_API_KEY on Railway).
    // Leave intake_key empty to only send e-mails.
    'intake_url' => 'https://admin.creafluxe.be/api/orders/intake',
    'intake_key' => '',

    // Where new requests go, and the sender address (must be a mailbox on your own domain).
    'notify_to' => 'offerte@creafluxe.be',
    'mail_from' => 'noreply@creafluxe.be',

    // Sites allowed to post the form.
    'allowed_origins' => ['https://creafluxe.be', 'https://www.creafluxe.be'],
];
