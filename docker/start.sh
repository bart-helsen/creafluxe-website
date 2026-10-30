#!/bin/sh
# Start Apache on the port Railway assigns ($PORT), default 80.
set -e

PORT="${PORT:-80}"
sed -ri "s/^Listen [0-9]+/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \*:[0-9]+>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

# NOINDEX=1 keeps search engines away from the test site.
if [ "${NOINDEX:-0}" = "1" ]; then
  a2enconf -q noindex
fi

exec apache2-foreground
