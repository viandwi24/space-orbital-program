# 202 — Release operations: error handling, deploy job, hosting headers

**Plan:** [plans/202-release-operations.md](../plans/202-release-operations.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0126](../decisions/0126-full-checks-in-ci-affected-checks-on-laptops.md), 0038, 0006 · **Research:** Cloudflare Pages headers, redirects, serving and direct-upload docs; SvelteKit hooks (`research/stack-versions.md`)

## What was done

| Where | What |
|---|---|
| `src/hooks.client.ts` | `init` listens for uncaught errors and unhandled rejections; `handleError` logs navigation errors and keeps SvelteKit's page |
| `lib/fatal-error.svelte.ts` | the card's state: every error to the log buffer, the first one on the card, browser noise (`ResizeObserver loop`) as a warning |
| `ErrorScreen.svelte`, root layout | an overlay card with "Save and reload" (inside a world: the world layout registers `fatalSave`, an autosave past the gap), "Reload" and "Continue" |
| log buffer | its test; the flight page's own error capture is gone (the hooks do it for every page) |
| `scripts/site-policy.ts`, `emit-headers.ts`, `serve.ts` | one policy for every page (all inline-script hashes and the sandbox bootstrap); `build/_headers` after every build; with `META_CSP=1` a `<meta>` policy without `frame-ancestors` in every page |
| workflows | `release.yml`: a `v*` tag builds at the root and publishes to Cloudflare Pages; dry run by `workflow_dispatch` or a `dry-run/*` tag; it names any missing secret. `pages.yml` builds with `META_CSP=1` |
| docs | `architecture/hosting.md` (hosts, `_headers`, the meta policy's limits), `guides/release-checklist.md`, `research/stack-versions.md` |

## What surprised me

- **A `_headers` host joins every matching rule.** Per-page policies on `/*` and `/flight` would both apply, each blocking the other's start-up script. So there is one policy for the whole site (six distinct inline scripts in this build, about 700 characters).
- **Cloudflare follows `_redirects` even where a file exists**, so the SPA fallback is `404.html` (a copy of `200.html`), as on GitHub Pages.
- **SvelteKit 3 moved the hook types** to `@sveltejs/kit/hooks`, and `handleError` gets `kind` and `error` (no status or message to read).

## Decisions made (link ADRs)

- No new ADR. The hosting choices are the owner-review defaults (rancangan §15 #10), recorded in `hosting.md`; the plan's Log has the rest.

## Open questions / follow-ups

- The owner adds the Cloudflare secrets and variables (`release.yml` header, release checklist) before the first `v*` tag.
- Crash reporting stays out (P1, opt-in only).

## Verification output

```
(filled in at handover)
```
