---
id: 202
title: "Release operations: error handling, deploy job, hosting headers"
status: done
owner: "Worker B"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 202 — Release operations: error handling, deploy job, hosting headers

## Goal

An uncaught error or rejected promise shows a friendly card with "Save and reload" instead of a dead page. Errors and warnings land in an in-memory log that the debug panel (plan 203) reads. CI deploys on release tags, a header-capable host gets a `_headers` file, GitHub Pages gets a meta CSP fallback, and a release checklist exists.

## Context

- rancangan §13.1–13.5; owner question §15 #10 and #11.
- Research: `refs/reverse-engineering-ksp-ksp2/15b-presentation-release-audit-raw.md` §2:
  - no `window.onerror`, no `unhandledrejection` handler and no `hooks.client.ts`; error UI exists as `+error.svelte`, `<svelte:boundary>` (`apps/web/src/routes/+layout.svelte:89-98`) and the worker crash card (`apps/web/src/lib/sim-client.ts:149`);
  - CSP lives in `apps/web/src/lib/hosting-headers.ts:33-59`; there is no host config file, so a host must compute the script hashes (`docs/architecture/hosting.md:21`);
  - `.github/workflows/ci.yml` has no deploy or release job.
- GitHub Pages under the repository path already works (Lead, commit `ba8bf6a1`: `paths.base` from `BASE_PATH` in `apps/web/vite.config.ts`, `.github/workflows/pages.yml`).
- ADRs: 0126 (CI and `check:affected`), 0038 (script sandbox in an opaque-origin iframe), 0006 (static client).
- Hosting: Cloudflare Pages for production, GitHub Pages as preview. Default per owner review (rancangan §15 #10); may change. No telemetry: default per owner review (rancangan §15 #11); may change.

## Scope

**In:**
- `apps/web/src/hooks.client.ts` with `handleError`, plus `error` and `unhandledrejection` listeners.
- A friendly error card (reuse `apps/web/src/lib/ui/ErrorScreen.svelte`) with "Save and reload" that asks the sim for a save first, then reloads.
- In-memory ring log (`apps/web/src/lib/log-buffer.ts`, new): level, time, source, message; 2000 entries; read API for plan 203.
- CI: a `release` job on `v*` tags that builds with the production base and publishes to the production host; the Pages workflow stays the preview.
- `_headers` generated at build time from `hosting-headers.ts` (hashes included) for a header-capable host; a `<meta http-equiv="Content-Security-Policy">` fallback for GitHub Pages, without `frame-ancestors`.
- `docs/guides/release-checklist.md` (new).

**Out:** crash reporting and analytics (P1, opt-in only); PWA and offline (P2); blocking e2e on more engines (P1).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/hooks.client.ts` (new), `apps/web/src/lib/log-buffer.ts` (new), `apps/web/src/lib/ui/ErrorScreen.svelte`, `apps/web/src/routes/+layout.svelte`, `apps/web/src/lib/sim-client.ts`, `apps/web/src/lib/hosting-headers.ts`, `apps/web/scripts/` (a `_headers` emitter), `apps/web/src/app.html`, `.github/workflows/ci.yml` or a new `.github/workflows/release.yml`, `docs/architecture/hosting.md`, `docs/guides/release-checklist.md` (new)
- **Shared contracts:** **log buffer API** (read by plan 203 and by plan 201's governor events); build output gains `_headers`.

## Design notes

- The log buffer has no dependency on Svelte so the worker bridge and the error hooks can both write to it.
- The meta CSP must keep the sandbox iframe working; ADR 0038's weaker isolation without `frame-ancestors` is recorded in `hosting.md`, not hidden.
- The deploy job needs a secret for the production host. The plan writes the job and the docs; the owner adds the secret.

## Steps

1. Log buffer with tests.
2. `hooks.client.ts`, global listeners and the error card with "Save and reload".
3. `_headers` emitter and the meta CSP fallback; serve-script parity test.
4. Release workflow on `v*` tags with a dry-run mode; Pages stays preview.
5. Release checklist and `hosting.md` update.

## Acceptance criteria

- [x] `apps/web` vitest `log-buffer.test.ts`: entries keep order, the ring drops the oldest past 2000, and a filter by level works.
- [x] `apps/web` vitest `hosting-headers.test.ts` (extended): the emitted `_headers` carries the same CSP and script hashes as `scripts/serve.ts`; the meta fallback has no `frame-ancestors`.
- [x] Chromium e2e `e2e/error-card.e2e.ts`: a page script throws an unhandled rejection; the error card appears, "Save and reload" saves the world and the page reloads into it.
- [x] `E2E_HEADERS=1` Chromium run of `e2e/smoke.e2e.ts` passes with the new headers.
- [x] `bun run check:affected --build --e2e e2e/error-card.e2e.ts` passes.
- [x] The release workflow has a `workflow_dispatch` dry run (`dry_run: true`) that builds with the production base and lists the files it would publish; one run is green and linked in the journal.
- [x] CI green on the `ready/202` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/202-release-operations.md` written.
- [x] `docs/architecture/hosting.md` updated (hosts, `_headers`, meta CSP limits).
- [x] `docs/guides/release-checklist.md` written.
- [x] `docs/research/stack-versions.md` updated for host and SvelteKit hook docs looked up.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker B. The log buffer already existed (plan 203 added it to this plan's API); this plan adds its test and moves the flight page's error capture into the global hooks. One policy for every page, the union of all inline-script hashes: a `_headers` host joins every matching rule, so per-page policies would block each other. The error card sits over a page that may still run, with "Save and reload", "Reload" and "Continue"; "Save and reload" appears only inside a world (the world layout registers `fatalSave`). The release workflow also runs as a dry run on a `dry-run/*` tag, because the agents have no `gh` to start a `workflow_dispatch`. The meta policy is only in the GitHub Pages build (`META_CSP=1`), so the local preview and the e2e suite run as before.
