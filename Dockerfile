FROM ghcr.io/every-app/open-seo:v0.1.10

# Render's free runtime has 512 MB of memory. Build the UI into the image on
# Render's build workers so the application does not need to compile at boot.
ENV AUTH_MODE=local_noauth
ENV VITE_SHOW_DEVTOOLS=false

COPY deploy/docker/docker-entrypoint.sh deploy/docker/docker-entrypoint.sh
COPY deploy/docker/basic-auth-proxy.mjs deploy/docker/basic-auth-proxy.mjs

RUN pnpm run build \
    && fingerprint="$(env | grep -E '^(VITE_|AUTH_MODE|BYPASS_EMAIL_VERIFICATION|POSTHOG_PUBLIC_KEY|POSTHOG_HOST|TURNSTILE_SITE_KEY|POSTHOG_SOURCEMAPS)' | sort | sha256sum | cut -d' ' -f1)" \
    && test -n "$fingerprint" \
    && printf '%s' "$fingerprint" > dist/.openseo-build-env

CMD ["sh", "deploy/docker/docker-entrypoint.sh"]
