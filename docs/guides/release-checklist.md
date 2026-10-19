# Release checklist

How a version of Orbital goes to the production host (plan 202). The preview on GitHub Pages follows `main` by itself (`pages.yml`); a release is a `v*` tag (`release.yml`), which builds at the site root and publishes to Cloudflare Pages with the generated `_headers`.

## Once, before the first release

1. Create the Cloudflare Pages project (Direct Upload) and note its name.
2. In the repository, Settings → Secrets and variables → Actions:
   - secrets `CLOUDFLARE_API_TOKEN` (permission: Account · Cloudflare Pages · Edit) and `CLOUDFLARE_ACCOUNT_ID`;
   - variables `CLOUDFLARE_PROJECT` (the project name) and `PRODUCTION_URL` (`https://…`, no trailing slash; the Open Graph image addresses use it).
3. Run the workflow once as a dry run: Actions → Release → Run workflow, "dry_run" ticked. The log lists the files and the `_headers` it would publish.

## Every release

1. `main` is green: the latest `CI` run on `main` passed.
2. `docs/STATUS.md` names the plans in this release; the public roadmap notes (`apps/web/src/lib/public/roadmap.ts`) say what changed for players.
3. Locally, on `main`:
   ```sh
   bun run check:affected --full
   bun run build
   E2E_HEADERS=1 E2E_WORKERS=1 bun --cwd apps/web x playwright test e2e/smoke.e2e.ts --project=chromium
   ```
   The last line runs the smoke suite against `scripts/serve.ts`, which sends the same headers as `_headers`.
4. Tag and push: `git tag -a v<x.y.z> -m "Orbital <x.y.z>" && git push origin v<x.y.z>`.
5. Watch the Release run. It fails early with the names of any missing secret or variable.
6. On the production address:
   - the menu, a new Sandbox world, the Hangar, a launch and a flight work;
   - the browser console shows no Content-Security-Policy violation;
   - the response headers of `/` and `/flight` carry `Content-Security-Policy`, and a file under `/_app/immutable/` carries `Cache-Control: … immutable` and no policy;
   - a script in the script panel runs (the sandbox started under the policy).
7. Note the version and the date in the journal of the plan that asked for the release, or in `STATUS.md`.

## If something is wrong

- **The site is broken:** in the Cloudflare dashboard, roll the project back to the previous deployment. Then fix forward on `main` and tag again.
- **A policy violation:** the inline-script hashes come from the build itself (`scripts/site-policy.ts`). A violation usually means a page was changed after the build. Rebuild instead of editing `_headers` by hand.
