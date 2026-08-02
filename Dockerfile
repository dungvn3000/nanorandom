FROM caddy:2-alpine

LABEL org.opencontainers.image.title="NanoRandom"
LABEL org.opencontainers.image.description="Client-side BIP39 seed phrase generator from live Nano blockhashes"
LABEL org.opencontainers.image.source="https://github.com/dungvn3000/nanorandom"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.authors="tadu.cloud"

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html /srv/index.html
COPY css/ /srv/css/
COPY js/ /srv/js/
COPY favicon.png /srv/favicon.png
COPY favicon-512.png /srv/favicon-512.png
COPY og-image.png /srv/og-image.png
COPY robots.txt /srv/robots.txt
COPY sitemap.xml /srv/sitemap.xml
COPY site.webmanifest /srv/site.webmanifest

EXPOSE 80
