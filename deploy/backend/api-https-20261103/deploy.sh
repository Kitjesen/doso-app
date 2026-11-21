#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
cd -- "$(dirname -- "$0")"
domain=api-test.dosorobotics.com
site=/etc/nginx/sites-available/doso-api

case "${1:-}" in
  prepare)
    [[ ! -e "$site" && ! -e /etc/nginx/sites-enabled/doso-api ]] || { echo 'API site already exists; inspect before changing'; exit 1; }
    nginx -t
    backup="/opt/doso-backend-shadow/backups/https-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$backup"
    cp -a /etc/nginx "$backup/nginx"
    install -d -m 755 /var/lib/doso-acme/.well-known/acme-challenge
    printf 'doso-api-http-challenge-ready\n' > /var/lib/doso-acme/.well-known/acme-challenge/doso-readiness
    chmod 644 /var/lib/doso-acme/.well-known/acme-challenge/doso-readiness
    install -m 644 http-acme.conf "$site"
    ln -s "$site" /etc/nginx/sites-enabled/doso-api
    nginx -t
    systemctl reload nginx
    printf 'HTTP_PREPARED backup=%s\n' "$backup"
    ;;
  activate)
    [[ -L /etc/nginx/sites-enabled/doso-api ]] || { echo 'Prepare the HTTP challenge first'; exit 1; }
    [[ $(curl --fail --silent --show-error "http://$domain/.well-known/acme-challenge/doso-readiness") == doso-api-http-challenge-ready ]] || { echo 'Public HTTP challenge unavailable'; exit 1; }
    if ! command -v certbot >/dev/null; then
      apt-get update -qq
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot
    fi
    certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --webroot -w /var/lib/doso-acme -d "$domain" --keep-until-expiring
    cat http-acme.conf https.conf > "$site"
    nginx -t
    systemctl reload nginx
    install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\n/usr/sbin/nginx -t && /bin/systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/doso-nginx
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/doso-nginx
    systemctl enable --now certbot.timer
    openssl x509 -in "/etc/letsencrypt/live/$domain/fullchain.pem" -noout -subject -issuer -dates
    printf 'HTTPS_ACTIVE\n'
    ;;
  renew-test)
    certbot renew --cert-name "$domain" --dry-run
    ;;
  *) echo 'Usage: deploy.sh prepare|activate|renew-test'; exit 2 ;;
esac
