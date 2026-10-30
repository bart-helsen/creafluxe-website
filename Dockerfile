# Creafluxe website on Railway (test.creafluxe.be): PHP 8.3 with Apache.
# Production stays on EasyHost; this image is only for the test site.
FROM php:8.3-apache

# .htaccess files must work (private/.htaccess blocks the config folder),
# and mod_headers is needed for the noindex header.
RUN a2enmod headers rewrite \
 && sed -ri 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

COPY docker/noindex.conf /etc/apache2/conf-available/noindex.conf
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

COPY . /var/www/html/
RUN rm -rf /var/www/html/docker /var/www/html/Dockerfile \
 && chown -R www-data:www-data /var/www/html

CMD ["/usr/local/bin/start.sh"]
