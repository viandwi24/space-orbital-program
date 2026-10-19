# Hosting

Orbital is a static site (SvelteKit `adapter-static`, ADR 0006): `bun run build` writes `apps/web/build/`, which any static host can serve. Nothing runs on a server and the game makes no requests of its own beyond its files (and the mod package a player asks to download by address, ADR 0057). This page lists what the host must do so that every feature works; it was checked in plan 023 against `apps/web/scripts/serve.ts`, a small server that does exactly this.

## What the host must do

| Requirement | Why |
|---|---|
| Serve `/_app/**`, `/sandbox/**`, `*.wasm` with correct types (`text/javascript`, `application/wasm`, `text/css`) | module scripts and WebAssembly refuse a wrong type |
| Serve `/flight`, `/vab`, `/mods`, `/credits`, `/roadmap` and `/` as their prerendered `.html`; send unknown paths to `200.html` with status 200 (or 404.html with 404) | SvelteKit's static fallback; the game's own error page handles the rest |
| `Content-Security-Policy` on HTML as below | the script sandbox (ADR 0038) and the CSP for the page; without it the game still runs, the policy is defence in depth |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` empty for camera, microphone, geolocation, payment | hardening; the game uses none of them |
| `Cache-Control: public, max-age=31536000, immutable` for `/_app/immutable/**`; `no-cache` for HTML and `/sandbox/**` | hashed assets never change; HTML must revalidate after a release |
| gzip or brotli for text and `.wasm` | the physics and script engines are about 2 MB uncompressed |
| HTTPS | `crypto.subtle`, IndexedDB persistence and service workers need a secure context (localhost counts) |

Optional: `Cross-Origin-Opener-Policy: same-origin` (the reference server sends it; nothing needs it yet, it keeps `SharedArrayBuffer` possible for a later plan).

## The Content-Security-Policy

The pages carry two kinds of inline script: the SvelteKit start-up script (different per page) and, inside the script sandbox's `srcdoc` iframe, its bootstrap. A `srcdoc` document inherits its parent's policy as well as its own, so the page policy must allow the bootstrap's hash too. `apps/web/src/lib/hosting-headers.ts` computes the policy.

Since plan 202 there is **one policy for every page**: `scripts/site-policy.ts` hashes every inline script of the build (six distinct ones in October 2026) and the sandbox bootstrap. A `_headers` host joins every rule that matches a path into one header, so a policy on `/*` and another on `/flight` would both apply and block each other's hashes; allowing a hash that another page of the same site uses costs nothing. `scripts/serve.ts` and the build's `_headers` send this same policy (the vitest `hosting-headers.test.ts` checks it against the running server).

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' blob: 'sha256-<page inline script>' 'sha256-<sandbox bootstrap>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https: blob: data:;
worker-src 'self' blob:;
frame-src about:;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

Why each non-obvious part:

- `'wasm-unsafe-eval'`: Rapier and QuickJS compile WebAssembly (the sandbox document repeats it for its own scope).
- `blob:` in `script-src`: a mod package is a JavaScript module imported from a blob URL (`importModBundle`, ADR 0057). A game without mods could drop it; the Mods page would then report that a mod failed to load.
- `worker-src blob:`: the sandbox frame turns the script Worker's text into a blob Worker. The sim Worker is `'self'`.
- `frame-src about:`: the sandbox iframe is a `srcdoc` document (`about:srcdoc`).
- `connect-src https:`: the Mods page downloads a package from an address the player types. A host that does not want this can restrict it to `'self'` and the player installs from a file instead.
- `style-src 'unsafe-inline'`: Svelte and the canvas widgets set inline styles; there is no inline style hash story for those.

A failing policy shows up as "the script sandbox did not start" (scripts fail closed, the rest of the game runs) or "A mod could not be loaded" on the Mods page.

## Reference server and a check

```sh
bun run build
bun --cwd apps/web scripts/serve.ts 4173      # the build with the headers above
E2E_HEADERS=1 bun run e2e                      # the Playwright suite against those headers
```

Plan 023 ran the smoke suite against `scripts/serve.ts` in Chromium, Firefox and WebKit (journal 023). The unit test `hosting-headers.test.ts` pins the policy's key parts.

## Hosts (plan 202)

| Host | Role | Headers | Workflow |
|---|---|---|---|
| Cloudflare Pages | production, at the site root | `build/_headers`: the policy and the security headers on `/*`, taken off the asset paths (`! Content-Security-Policy`), a year of caching for `/_app/immutable/*` | `release.yml` on a `v*` tag (dry run by hand or with a `dry-run/*` tag) |
| GitHub Pages | preview of `main`, under `/<repo>` | none: the policy is a `<meta>` in every page (`META_CSP=1`) | `pages.yml` on every push to `main` |

**`_headers`:** written by `scripts/emit-headers.ts` after every `vite build`. The policy is one line of about 700 characters (Cloudflare's limit is 2 000 per line and 100 rules). Unknown paths get `404.html` (a copy of `200.html`, status 404) and the client router shows the page or the game's error page; a `_redirects` rewrite of `/*` is not used, because Cloudflare follows redirects even where a file exists.

**The meta policy's limits:** a `<meta http-equiv="Content-Security-Policy">` cannot carry `frame-ancestors` (browsers ignore it there), so on GitHub Pages another site may frame the game. ADR 0038's script sandbox does not depend on it: the sandbox is an opaque-origin `srcdoc` frame inside our page either way. The meta comes right after `<meta charset>`, before any script, so it covers the start-up script. Report-only and `sandbox` directives are not possible in a meta policy either; we use neither.

## GitHub Pages

`.github/workflows/pages.yml` publishes `main` to <https://viandwi24.github.io/space-orbital-program/>.

**What the workflow does:**

- It builds with `BASE_PATH=/<repo>`. That is SvelteKit's `paths.base` in `apps/web/vite.config.ts`, empty everywhere else.
- It sets `VITE_SITE_URL` to the Pages address.
- It copies `200.html` to `404.html`, so an unknown path gets the game's own error page with status 404, and it adds `.nojekyll`.
- It deploys with `actions/deploy-pages`.

**The one-time setting:** Settings → Pages → Source: **GitHub Actions**.

**How the code handles the base path:**

- In-app links and navigation go through `resolve()` from `$app/paths`, and static files through `asset()`.
- The sandbox and the ephemeris read paths relative to the page.
- A new link must not hard-code a root path such as `href="/vab"`.

**What Pages does not do:**

- It cannot send the headers above. The policy comes as a `<meta>` instead (above, without `frame-ancestors`); there is no `Cache-Control` of our own: Pages caches for 10 minutes.
- The game runs without the other headers, as the table says.

The build was checked on a local server that mimics Pages (`/<repo>/` prefix, `x` → `x.html`, `404.html`): the menu, Hangar, Launch and a flight.

## Not decided here

The domain, the CDN and the licence of the game are the human's decisions (`STATUS.md`, known issues); `VITE_SITE_URL=https://example.org bun run build` makes the Open Graph image addresses absolute for that domain.
