# 0206 — Key profile: KSP-compatible default plus an "Orbital classic" profile

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/216-key-profiles.md, plans/226-camera-modes-and-capture.md
**Amends:** ADR 0061 (one binding table) and ADR 0062 point 5 (`mute` on `N`)

## Context

Our bindings clash with KSP habits (`keybindings.ts:57-133`; research docs 12 and 15 §5): C is brake (KSP: IVA), `[`/`]` are aircraft trim (KSP: switch vessel, `keybindings.ts:93-94`), V is the speed reference (KSP: camera mode), N is mute (KSP: RCS back), 1–0 are SAS modes (KSP: action groups), I K J L O U edit nodes (KSP: RCS translation). KSP keys with no action here: R, G, U, Backspace (abort, reserved here), F2, screenshot, `/` stop warp, Caps Lock precision, H N I K J L translation, EVA keys. Verified (doc 16): Backspace runs Abort, backtick resets the camera. Rancangan §12.1.

## Decision

1. **Two profiles in one binding table:** a **KSP-compatible default** and **"Orbital classic"** (today's layout) for existing players (default per owner review, rancangan §15 #7; may change). Settings has a profile selector; per-action rebinding works on top of either.
2. **KSP default:** B brakes (hold), C free until IVA; `[`/`]` switch vessel; trim on Alt+WASDQE, reset Alt+X; V camera mode, speed reference by clicking the speed readout; N RCS back, mute on Ctrl+M; 1–0 action groups, SAS modes on navball buttons and Alt+1..0; R RCS, G gear, U lights, Backspace abort, F2 hide UI, F1 screenshot, `/` stop warp, Caps Lock precision, H N I K J L translation; backtick camera reset.
3. **Pause:** `P` on every page; Space pauses only outside Flight (default per owner review, rancangan §15 #6; may change; see ADR 0201 point 6).
4. **Node keys are scoped:** node editing keys work only while the map is open and a node is selected, so they never clash with translation.
5. **Migration:** a player's custom binds move to the profile they were made on (Orbital classic); a player with no custom binds lands on the KSP default and sees a one-time toast naming the change and the selector.
6. **Camera and capture keys** (plan 226) use this table: V cycles Auto/Free/Orbital/Locked with a toast, F2 hides the UI, F1 saves a PNG.

## Alternatives considered

- **Keep our layout and document the differences** — rejected: KSP players hit the clashes in the first minute.
- **KSP default only** — rejected: existing players' muscle memory deserves a profile.

## Consequences

- Plan 216 delivers the profiles, the selector and the migration; plans 211, 221, 225 and 226 bind their actions in both profiles.
- The tutorial reads the player's actual keys (already the case, `tutorial.ts:41-58`).
- The settings format gains a `profile` field (additive).
