# 229 — Lessons: landing, maneuver nodes, rendezvous and docking, transfers

**Plan:** [plans/229-lessons-past-first-orbit.md](../plans/229-lessons-past-first-orbit.md) · **Session:** Worker E (Agent 3, Linux Mint, 6 CPU, 8 GB), 2026-10-19 · **ADRs:** [0200](../decisions/0200-debug-panel-cheats-set-state-debug-api.md), [0213](../decisions/0213-debug-access-rule-and-debug-state-in-world-info.md), [0201](../decisions/0201-one-sim-per-world-base-layout-clock-states-pause.md), [0060](../decisions/0060-release-settings-onboarding-and-descriptor-hooks.md) · No new ADR: the permissions are a filter in the web client, inside the existing models.

## What was done

| Where | What |
|---|---|
| `lib/onboarding/lessons.ts` (new) | The lesson model:<ul><li>`Lesson` with its design, setup calls named after the `DebugApi` functions, blocked actions and places with reasons, steps, goal, debrief and hint.</li><li>`LessonObservation` and `observeLesson` (surface speed from the body's spin, landed, nodes, target, a joined port).</li><li>`advanceLesson`, `restartLesson`, `runLessonSetup`, `blockedAction`, `blockedPlace`.</li><li>The four lessons.</li></ul> |
| `lib/onboarding/lesson-world.ts` (new) | The lesson world:<ul><li>`startLesson` makes a Sandbox world with seed 229, marked `lesson`, and enters it in place of the player's world.</li><li>The session in `orbital.lesson` keeps the previous world.</li><li>`endLessonSession` and `leaveLesson`, and `sweepLessonWorlds`.</li></ul> |
| `lib/onboarding/lesson-gate.svelte.ts` (new) | `lessonKeymap`: the blocked actions taken out of the keymap, with their reasons; `placeBlocked`; the notice |
| `lib/hud/LessonCard.svelte` (new) | The flight card:<ul><li>the step;</li><li>"The clock waits until you press Begin" with Begin;</li><li>a blocked control's reason;</li><li>Leave the lesson;</li><li>the debrief and hint, with Back to lessons.</li></ul> |
| `routes/lessons/` (new) | The Lessons page: a grid of lesson cards with status and a detail panel (steps, Start or Restart), after the Worlds screen of `refs/space-orbital-program-ui-v2/source/v1/Worlds.dc.html` |
| `routes/(world)/flight/+page.svelte` | In a lesson world:<ul><li>the lesson's design;</li><li>the setup through `createDebugApi` on the first flying HUD;</li><li>the clock held (`worldSession.hold('lesson')`) until Begin;</li><li>the lesson observation and progress;</li><li>the keymap filter;</li><li>no first-flight guide.</li></ul> |
| `routes/(world)/+layout.svelte` | `beforeNavigate` cancels a move to a closed place and shows the reason |
| `lib/worlds/worlds.ts`, `save/world-record.ts` | `WorldRecord.lesson`; `list()` leaves lesson worlds out; `lessonWorlds()`; `create(…, { lesson })` |
| `lib/settings` | `lessons` progress, additive in format 4 with default `{}`; `settings.setLesson` |
| Home, Worlds, Help | The main menu's Lessons entry and the Controls dialog's link. Home and Worlds end a lesson left running (a quit from the pause menu) |
| tests | `onboarding/lessons.test.ts` (28: the step tables, never skipping, the goal, setups against the debug API, the keymap filter, the places, the card); `worlds.test.ts` (+1); `settings.test.ts` (round trip with lessons); `e2e/lessons.e2e.ts` (2) |
| docs | `docs/architecture/overview.md` "Lessons (plan 229)" |

## Decisions and deviations

- **The transfer lesson goes to Cinder.** The stock system has only Home and its moon, so there is no interplanetary target without the Sol mod. The steps are the plan's: window, node, warp, burn, sphere change. Default noted in the Log.
- **The clock waits on the first card.** The landing scene starts falling at 30 km. On this laptop the headless flight page takes about 15 s per evaluation, so the e2e first read the altitude a few km lower. A lesson now holds the world clock (the same hold menus use) until Begin. This is better for a player too, who can read the card before anything moves.
- **Permissions filter keys and navigation, not the sim.** Blocked actions vanish from the keymap, held axes too, and a try shows the reason on the card. The (world) layout cancels a move to the Hangar, Launch, R&D, Administration, the Astronaut Complex, Mods or the Test Stand. HUD buttons and touch controls are not filtered; that is for a later plan if lessons need it.
- **Leaving saves, then removes.** Leaving the world autosaves first (ADR 0201), so the session ends and the lesson world goes on the next outside page (Lessons, Home, Worlds), not before the navigation. A quit from the pause menu ends the lesson the same way.
  - The first version restored the player's active world before navigating, which aimed the exit autosave at the player's world. On the landing lesson that save never finished.
  - Leave now only navigates. It also lets go of the "wait for Begin" hold, because the exit save needs a running clock.
  - It skips the "leave an active flight?" question: the lesson world goes away anyway.
- **This machine is slow for e2e.** Chromium on SwiftShader at 1440 × 900 on 6 CPUs takes about 15 s per page evaluation, and an autosave takes about 100 s. The e2e gives a lesson exit 5 minutes and the four-lesson test 40 minutes. CI and the Macs are much faster.
- **Progress is additive in format 4** (`lessons`, default `{}`), like `debug` and `time` were in format 3. There is no new format number.
- **`LessonCard` takes the keymap as a prop.** The card does not import the settings store, so its vitest runs on this machine too: Bun's vitest here cannot load `settings.ts`'s `import { z } from 'zod'`.
- **The used-cheats mark** lands on the lesson world only (ADR 0213). That world is removed, so the player's worlds never carry it.

## Verification

- `bunx vitest run src/lib/onboarding src/lib/worlds/worlds.test.ts`: 36 passed.
- `bun run check` (svelte-check): 0 errors.
- Chromium e2e `e2e/lessons.e2e.ts`: see the Log (run here on the system Chromium with a local config, port 5270, `E2E_WORKERS=1`).
- `[manual]` A human completes the maneuver-node lesson by the cards alone: **not done here**. The plan stays blocked on this item for the owner (see the Log).
