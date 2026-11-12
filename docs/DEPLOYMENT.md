# Deployment

The studio is a long-running Node.js server. It launches a browser, runs build processes and keeps preview servers alive, so it needs a host with a persistent process and disk. **Serverless platforms (Vercel functions, Netlify functions, Cloudflare Workers) are not suitable.** Use a VM, a container host (Fly.io, Railway, Render, a Kubernetes pod) or your own server.

## Requirements

- Node.js 22.5+
- 2 CPU cores and 2 GB RAM or more (Chromium plus one build at a time)
- A persistent volume for `STUDIO_DATA_DIR`
- Two reachable ports: the studio (default 3000) and the preview listener (default 4100). One port also works; see "Single port".

## Steps

```bash
git clone <your fork> && cd Universal-cloner
npm ci
cp .env.example .env    # then edit
npm run build
npm start               # or: PORT=8080 npx next start -H 0.0.0.0
```

Minimum `.env` for a server:

```
STUDIO_PASSWORD=<long random password>
STUDIO_SECRET=<openssl rand -base64 48>
STUDIO_REQUIRE_SECRET=true
STUDIO_DATA_DIR=/var/lib/cloner-studio
DATABASE_URL=postgres://user:pass@host:5432/cloner     # optional
```

Tables are created automatically on first start (both PostgreSQL and the embedded database). Keep `STUDIO_SECRET` stable: provider keys encrypted with one secret cannot be read with another, and would have to be entered again.

Run it under a process manager (systemd, pm2, the container runtime) so it restarts. On restart, jobs that were running are marked "Interrupted by a server restart" and re-queued automatically from the stage they were in; previews are started again on demand.

## Reverse proxy and previews

Previews should be on a different origin from the studio so generated pages cannot touch the studio's session.

**Two origins (recommended).** Proxy `studio.example.com` to port 3000 and `previews.example.com` to port 4100, and set:

```
PREVIEW_PUBLIC_ORIGIN=https://previews.example.com
```

**Same host, two ports.** With nothing configured, a studio reached at `host:3000` hands out `host:4100/preview/<token>/`. Hosts that map ports to subdomains like `3000-<id>.domain` are detected and get `4100-<id>.domain`.

**Single port.** Set `PREVIEW_GATEWAY=off`. Previews are then served by the studio at `/preview/<token>/` with a `sandbox` Content-Security-Policy, which gives the page an opaque origin. Cookie-based sign-in inside the previewed clone does not work in this mode.

Proxies must forward `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto`; the same-origin check on API writes compares them with the request's `Origin`.

## Docker

No Dockerfile is shipped (it has not been tested in this repository). A working starting point:

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm ci && npx playwright install --with-deps chromium && npm run build
ENV STUDIO_DATA_DIR=/data
VOLUME /data
EXPOSE 3000 4100
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
```

Running in a container is also the simplest way to add a hard boundary around the build and preview processes.

## Hardening checklist

- [ ] `STUDIO_PASSWORD` and `STUDIO_SECRET` set; HTTPS in front
- [ ] `STUDIO_ALLOW_PRIVATE_TARGETS` and `STUDIO_ALLOW_LOCAL_AI` empty unless you need them
- [ ] Data directory on a persistent volume, backed up, not web-served
- [ ] Outbound firewall rules if the host can reach internal networks (the SSRF checks are a second line of defence, not the only one)
- [ ] Container or VM boundary if people other than you will use it

## What is not included

- Multi-user accounts, teams or billing: there is a single shared password.
- A distributed queue: jobs run inside the server process, one at a time.
- A subdomain-per-project router: previews are path-based (`/preview/<token>/`).
