---
id: 232
title: Release QA and launch
status: draft
owner: "Worker B (M5)"
depends: [200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 233, 234, 235, 236, 237, 238, 239, 251, 252, 253]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 232 — Release QA and launch

## Goal

The public release ships. Every P0 plan (200–231) is done and verified together on one commit. The full suite passes on three browser engines. A performance pass on the M5 meets the frame budgets. A human runs the acceptance checklist below and signs it off. The public changelog is written, the version is tagged, and the build is live at https://viandwi24.github.io/space-orbital-program/ (and on the production host if the owner chooses one).

## Context

- rancangan §13.5 (human manual test, the step plan 023 left open, plus the release checklist), §14 (P0 waves; G11 release test depends on all), §13.1–13.4 (hosting, CSP, error handling, deploy job; done in plan 202).
- Research 15b §2: release readiness table (static adapter, reference server, CSP without host config, CI e2e on Chromium only and non-blocking, no deploy job, `GAME_VERSION = '1.0.0-rc.1'` in `apps/web/src/lib/public/about.ts:4`).
- Existing pieces:
  - `.github/workflows/pages.yml` deploys `main` to GitHub Pages under the repository path (`BASE_PATH`, `404.html`, `.nojekyll`). Pages is live.
  - `.github/workflows/ci.yml` runs the full suite on `ready/**` tags and on `main`, writing `refs/ci/pass/<sha>` or `refs/ci/fail/<sha>`.
  - `docs/architecture/hosting.md` (host requirements, CSP, the GitHub Pages section).
  - `docs/plans/023-release-readiness.md` and `docs/journal/023-release-readiness.md` (v1 checklist; licence line FAIL until the human decides).
  - Plan 202 adds the release checklist doc, the deploy job, release tags, `_headers` and the meta CSP fallback.
- ADRs: 0126 (full checks in CI, affected checks on laptops), 0040 (browser support and e2e matrix), 0048 (v1 public release scope), and the roadmap ADRs 0200–0210 whose decisions the checklist exercises.
- Owner questions, defaults used:
  - release scope is every P0 row of the rancangan. Default per owner review (rancangan §15 #13); may change.
  - production host: Cloudflare Pages with `_headers`, GitHub Pages as preview. Default per owner review (rancangan §15 #10); may change. Until the owner decides, GitHub Pages is the public address.
  - no telemetry, or opt-in only. Default per owner review (rancangan §15 #11); may change. This release ships none.
  - music source (ADR 0210 proposed). Default per owner review (rancangan §15 #9); may change.

## Scope

**In:**
- Integration: merge every plan's work, then one `ready/release-qa` tag; CI full suite green on it.
- Cross-engine e2e: the full Playwright suite on Chromium, Firefox and WebKit locally, results in the journal.
- Performance pass on the M5 (production build): frame time per preset at the pad, 3 km, 12 km, orbit and a docking scene; load time; bundle sizes; compared with plan 023's numbers.
- Release checklist (from plan 202) filled line by line with evidence.
- Human acceptance checklist (below), run by the human, results in the journal.
- Public changelog page and `CHANGELOG.md` for the release.
- Version bump, release tag and deploy (below).
- Triage: every issue found is fixed here if small, or becomes a `draft` plan marked release-blocking or post-release.

**Out:** new features. P1 rows. A production host change without the owner's decision.

## Touches

- **Size:** M
- **Edits:**
  - `apps/web/src/lib/public/about.ts` (`GAME_VERSION`), `apps/web/src/lib/public/roadmap.ts` (move shipped items out)
  - `apps/web/src/routes/` (changelog page, if plan 202 did not add one), `CHANGELOG.md` (new)
  - `docs/journal/232-release-qa.md` (new), `docs/architecture/hosting.md`
  - small fixes anywhere found by QA, each listed in the Log
- **Shared contracts:** none.

## Human acceptance checklist

Run on the production build at the public URL, in Chrome or Edge on a laptop, then the starred items in Firefox, Safari and on a tablet. Mark each pass or fail with a note.

1. **Start.** The URL loads under `/space-orbital-program/`; the menu shows the version `1.0.0`; a deep link (`/space-orbital-program/worlds`) loads; an unknown path shows the game's 404 page. *
2. **World shell.** Create a Career world. Move between Space Center, Hangar, Launch, Flight and Mission Center: no full reload, the clock never jumps back, the status bar shows the autosave age. *
3. **Clock and pause.** Pause in Flight; switch tabs; come back: still paused. Hangar pauses by default. In a Hardcore world the pause button is locked with a reason.
4. **Hangar.** Build a rocket by carrying parts: snap, symmetry 4 with inherited children, rotate with WASDQE, Alt-copy, undo. Add a fairing. The pre-flight report warns about a missing chute on a crewed design. No visible gaps between parts at any size. *
5. **First flight, KSP style.** Pod, chute, solid booster, fins, launch clamp. Throttle starts at 50 %. MET starts at liftoff. The situation reads "pre-launch" on the pad. Chute arms by staging, opens when safe, lands under 10 m/s. Recover shows 100 % or 98 %.
6. **Control source.** An empty pod with no probe cannot be throttled; the chip says why.
7. **Orbit and warp.** Reach orbit with a liquid stage and a vacuum engine. Physics warp ×4 works in the atmosphere with the engine on. Asking for 10k× low in orbit gives the highest allowed level and the reason in the time bar.
8. **Power.** Solar output drops to zero in shadow; batteries drain; at zero EC the probe loses control and the bell says so.
9. **Navigation.** Two nodes with typed Δv; AN/DN on the map; warp to Pe; a user alarm stops warp.
10. **Docking.** Launch a second vessel, switch with `]`, rendezvous, dock with RCS, transfer fuel, undock: names come back.
11. **EVA.** Step out, fly the jetpack, grab the ladder, board at the hatch. In Career, boarding from 20 m is refused.
12. **Re-entry.** Heat bars appear on hot parts; the heat shield survives; heating 50 % in a new world visibly lowers the bars.
13. **Panels and HUD.** Vessel panel tabs and the pinned inspector; side panels do not move the camera; at 1280 px only one side panel opens; text is readable at every UI scale. *
14. **Keys.** The KSP profile works as listed in Help; switching to "Orbital classic" restores the old keys; custom binds survive.
15. **Camera and capture.** V cycles four modes with a toast; F2 hides the UI; the screenshot key downloads a PNG.
16. **Sound.** Explosion, decouple, chute, touchdown and RCS are audible and each has a visual sign; music is quiet and its slider works.
17. **Learning.** Each of the four lessons starts in its scene; tooltips explain Ap, Pe and TWR; the glossary opens from Help. *
18. **Fleet.** Mission Center lists vessels with type filters; recover a vessel far from the pad with a lower factor; rename and terminate.
19. **Debug.** In Sandbox, Alt+F12 opens the debug panel; set orbit works. In Career, debug mode marks the world "used cheats". Hardcore is locked.
20. **Saves.** Export all worlds; clear site data; import; worlds come back. The persistent-storage state shows in Settings.
21. **Errors.** A forced error (debug panel) shows the friendly card with "save and reload", and the save survives.
22. **Graphics.** High preset at the pad for two minutes: no shadow flicker. The governor level shows in Debug → Info.
23. **Tablet.** * On an iPad or Android tablet: build, launch and fly to orbit with touch only.

## Public deploy steps

1. Confirm every plan 200–231 is `done` in `docs/STATUS.md` and `bun run docs:check` passes.
2. Set `GAME_VERSION` to `1.0.0` in `apps/web/src/lib/public/about.ts`; write `CHANGELOG.md` and the changelog page from the journals of plans 200–231.
3. Commit, tag `ready/release-qa`, push the tag; wait for `refs/ci/pass/<sha>` (`git fetch origin 'refs/ci/*:refs/ci/*'`).
4. Merge to `main` and push. `.github/workflows/pages.yml` builds with `BASE_PATH=/space-orbital-program` and deploys.
5. Check https://viandwi24.github.io/space-orbital-program/: the menu version reads `1.0.0`, a deep link loads, the 404 page works, a flight starts.
6. Tag `v1.0.0` on the merged commit and push it (the release-tag job from plan 202 runs on it).
7. If the owner chose a header-capable production host: deploy the same build there with the `_headers` file from plan 202, then run `E2E_HEADERS=1 bun run e2e` against it and record the CSP check. GitHub Pages stays as the preview.
8. Record the URLs, commit, tag and CI ref in the journal and in `docs/STATUS.md`.

## Steps

1. Integration tag and CI full suite; fix failures.
2. Local cross-engine e2e run; fix failures.
3. Performance pass on the M5; fix regressions or record them.
4. Fill the release checklist; triage open issues into fixes or draft plans.
5. Hand the human acceptance checklist to the human; fix blocking findings.
6. Changelog, version bump and deploy steps 1–8.

## Acceptance criteria

- [ ] `bun run docs:check` passes and every plan 200–231 has `status: done`.
- [ ] `bun run e2e` passes on Chromium, Firefox and WebKit (all three projects in `apps/web/playwright.config.ts`), with the counts in the journal.
- [ ] Performance: on the M5 at the High preset, median frame time at the pad and in orbit is within plan 023's recorded budget; any regression over 10 % is fixed or recorded with a reason.
- [ ] The release checklist from plan 202 has every line PASS, or FAIL with an owner decision recorded (the licence line stays FAIL until the human decides).
- [ ] `[manual]` the human acceptance checklist above is run by the human, with every item pass or triaged; the journal holds the results.
- [ ] `curl -sI https://viandwi24.github.io/space-orbital-program/` returns 200, and the page's version text reads `1.0.0` after deploy.
- [ ] Tag `v1.0.0` exists on `main`.
- [ ] `bun run check:affected --full --build` passes on the release commit.
- [ ] CI is green on the `ready/release-qa` tag (`refs/ci/pass/<sha>` exists) and on the merge to `main`.

## Docs checklist

- [ ] `docs/STATUS.md` updated (release recorded, next plan is the first P1 plan).
- [ ] `docs/journal/232-release-qa.md` written with the checklist results, performance numbers and deploy record.
- [ ] `docs/architecture/hosting.md` updated with the production host, if chosen.
- [ ] `apps/web/src/lib/public/roadmap.ts` lists only post-release work.
- [ ] `README.md` shows the public URL.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-20 — Preparation by Worker B (M5), before the claim, on branch `prep/232-release-qa` (coordinator's request): the human acceptance checklist as a fillable sheet (`docs/release/1.0.0-acceptance-checklist.md`, items 1–23 plus 24–27 for plans 233–236) and a draft `CHANGELOG.md` from the plans' goals. The integration suite and the deploy wait for 228, 230 and the owner's review of 234.
- 2026-10-20 — Claimed by Worker B (M5) at the coordinator's word: the automated part now (integration, three-engine e2e, performance pass, release notes); the `v1.0.0` tag and the public deploy wait for the owner's review of 234 and the filled acceptance checklist. `status` stays `draft` until then: 232 depends on 234, which is `blocked`, and docs:check refuses an in-progress plan on a blocked one.
- 2026-10-20 — The owner approved plan 234's dish, so 234 is done and 232 is `in-progress`. The `v1.0.0` tag and the public deploy still wait for the owner's filled acceptance checklist (`docs/release/1.0.0-acceptance-checklist.md`).
- 2026-10-20 — Coordinator (owner order): plans 237, 238 and 239 (bugs found in the audit) join the depends; no `v1.0.0` tag or deploy until all three are done on main. After they merge: rebase and rerun the e2es their files touch (the Hangar e2es and a Flight/script e2e). `status` is `draft` again until then (docs:check refuses an in-progress plan on open ones).
- 2026-10-20 — Batch mode (owner's order, worker brief): `GAME_VERSION` is `1.0.0` on this branch, `CHANGELOG.md` is checked against the journals, and the release record is `docs/release/1.0.0-release-checklist.md`. The heavy checks run once on `rel/integration-v1`; Firefox and WebKit wait for it.
- 2026-10-20 — Coordinator (owner order): graphics phases 0 and 1 are in v1.0.0: plans 251 (measurement and M5 baseline), 252 (Retina pixel budget) and 253 (governor) join the depends. They are a second integration batch, after 237–239; then rerun only the e2es they touch (flight, smoke, debug). The M5 performance pass reuses 251's tool and 252's acceptance numbers, without measuring twice. After the 237–239 batch the lock is released and the M5 stays quiet (load ≤ 3, no e2e) for 251's baseline. No `v1.0.0` tag until 237–239 and 251–253 are done.
- 2026-10-20 — Integration run (rel/integration-v1, clean server, Chromium): 90 passed, 6 red, 2 skipped. Triage:
  - `recovery.e2e` was a stale test, not a game bug: before 73 534, credit 26 466, after 73 534; plan 223's pad recovery factor is 100 %, the test divided by 0.98. Fixed.
  - `ui-scale.e2e` was a too-strict test, not a layout bug: staging's scrolled content (plan 215: it scrolls inside its capped box) was measured, and plan 233 moved the left stack to top 80, so it scrolls more. It now judges the visible, clipped part. Fixed.
  - `career-content.e2e` (plan 231) was stale: the board draws one random template a day with five offers of ten days, so 'Rescue or Satellite shows after 20 days' held only by chance. It now steps game days in the Administration until such a row shows. Fixed.
  - `script-off-flight` and `navigation` were plan 239's and plan 224's (Worker C): a removed Script button, and a real alarm overshoot in physics warp (fixed in sim.ts).
  - **Known issue, not blocking:** `eva.e2e` ('step out on Cinder, walk, grab the ladder, climb and board', plan 225) fails intermittently at 'on a ladder' (red on a clean `origin/main` in 2 of 4 runs, flaky on retry); it predates 237–239. A follow-up plan is to be filed after the release.
  - A stale preview server of mine on port 5243 invalidated one run (blank pages, 180 s timeouts). The e2e job script now refuses a busy port and stops its own server on exit.

