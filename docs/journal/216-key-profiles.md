# 216 — Key profiles: KSP-compatible default and Orbital classic

**Plan:** plans/216-key-profiles.md · **Session(s):** Worker A (release roadmap) · **Date:** 2026-10-19

## What was done

- **Chords** (`keybindings.ts`): `chordIdOf` puts the held Ctrl, Alt and Cmd in front of the key's `code` (`Alt+Digit2`, `Ctrl+KeyM`); Shift is never a chord modifier (it is the throttle). `keyLabel` shows `Alt+2`; clash checks compare the full chord. In flight, a bound chord is its action, and an unbound chord falls back to its plain key, so Alt+W still pitches in classic.
- **Profiles as data:** `ACTIONS` keeps the classic defaults, `KSP_DEFAULTS` holds where KSP differs, and `profileDefaults`, `resolveBindings`, `createKeymap`, `rebind`, `swapBindings` and `repairBindings` take a profile. `switchProfile` keeps the overrides that do not clash and lists the ones that do, each with "keep mine" or "use profile".
- **Scopes:** map keys have their own clash scope and act first in the map view, only when they do something (a node key with no node selected falls through to the flight key). Backspace left `RESERVED_KEYS` and is Abort, and still removes the selected node in the map.
- **New actions:** gear (G) and lights (U) are wired to their stock groups. The rest are declared `pending` and hidden from the controls list and the help until their plans wire them: Abort, fine control, RCS and translation, the yaw and roll trims and their reset, vessel switching, the camera keys, hide UI, screenshot and stop warp.
- **Settings format 4:** `keyProfile` and `keyNotice`. A format 2 or 3 value with overrides becomes `classic` with the same overrides; one without becomes `ksp`. Either way a one-time note names the keys in force (root layout). New players get `ksp` with no note.
- **Controls editor:** a profile selector, the clash list on a switch, chord capture, and a notice banner while the note is due.

## What surprised me

- The flight page never passed the settings keymap to `startFlight`, so since plan 053 a player's rebinds did not apply in flight (the HUD labels did show them). It does now.
- KSP's screenshot key F1 is our help, and plan 203 put the debug panel on Alt+F12, so the screenshot key is F10 (ADR 0206 updated).
- The vessel panel lists groups only for a vessel in flight; a vessel on the pad goes on rails after 2 s. The e2e presses B first: the action-group command wakes the vessel.
- The glider example has no wheels, so the e2e imports a pod, a tank and a wheel.

## Decisions made (link ADRs)

- ADR 0206: profiles, chords, map-only node keys, migration; updated for the F10 screenshot and B as a toggle.

## Profiles

| Action | Mode | KSP | Orbital classic |
|---|---|---|---|
| Throttle up | flight | Shift | Shift |
| Throttle down | flight | Ctrl | Ctrl |
| Full throttle | flight | Z | Z |
| Cut throttle | flight | X | X |
| Pitch + | flight | W | W |
| Pitch − | flight | S | S |
| Yaw − | flight | A | A |
| Yaw + | flight | D | D |
| Roll − | flight | Q | Q |
| Roll + | flight | E | E |
| Fire the next stage | flight | Space | Space |
| SAS on (hold attitude), off | flight | T | T |
| Hold attitude | flight | Alt+1 | 1 |
| Custom group 1 | flight | 1, Num 1 | Num 1 |
| Custom group 2 | flight | 2, Num 2 | Num 2 |
| Custom group 3 | flight | 3, Num 3 | Num 3 |
| Custom group 4 | flight | 4, Num 4 | Num 4 |
| Custom group 5 | flight | 5, Num 5 | Num 5 |
| Custom group 6 | flight | 6, Num 6 | Num 6 |
| Custom group 7 | flight | 7, Num 7 | Num 7 |
| Custom group 8 | flight | 8, Num 8 | Num 8 |
| Custom group 9 | flight | 9, Num 9 | Num 9 |
| Custom group 10 | flight | 0, Num 0 | Num 0 |
| Prograde | flight | Alt+2 | 2 |
| Retrograde | flight | Alt+3 | 3 |
| Normal | flight | Alt+4 | 4 |
| Antinormal | flight | Alt+5 | 5 |
| Radial out | flight | Alt+6 | 6 |
| Radial in | flight | Alt+7 | 7 |
| Point at the maneuver node | flight | Alt+8 | 8 |
| Point at the target | flight | Alt+9 | 9 |
| Point away from the target | flight | Alt+0 | 0 |
| Level wings (aircraft) | flight | ; | ; |
| Trim nose up | flight | Alt+S | ] |
| Trim nose down | flight | Alt+W | [ |
| Brakes on or off | flight | B | C |
| Map view | flight | M | M |
| Speed reference: auto, surface, orbit, target | flight | — | V |
| Next target: each body, each other vessel, none | flight | Y | Y |
| Time warp down | flight | , | , |
| Time warp up | flight | . | . |
| Quicksave | flight | F5 | F5 |
| Quickload | flight | F9 | F9 |
| Show the controls list | flight | ?, F1 | ?, F1 |
| Debug panel (hold Alt) | flight | F12 | F12 |
| Pause or resume the world clock | flight | P | P |
| Mute or unmute sound | flight | Ctrl+M | N |
| Landing gear up or down | flight | G | G |
| Lights on or off | flight | U | U |
| Abort (later plan) | flight | Backspace | Backspace |
| Fine control (later plan) | flight | Caps Lock | Caps Lock |
| RCS on or off (later plan) | flight | R | R |
| Translate forward (later plan) | flight | H | H |
| Translate back (later plan) | flight | N | — |
| Translate left (later plan) | flight | J | J |
| Translate right (later plan) | flight | L | L |
| Translate down (later plan) | flight | I | I |
| Translate up (later plan) | flight | K | K |
| Trim yaw left (later plan) | flight | Alt+A | Alt+A |
| Trim yaw right (later plan) | flight | Alt+D | Alt+D |
| Trim roll left (later plan) | flight | Alt+Q | Alt+Q |
| Trim roll right (later plan) | flight | Alt+E | Alt+E |
| Reset the trim (later plan) | flight | Alt+X | Alt+X |
| Next vessel (later plan) | flight | ] | Page Down |
| Previous vessel (later plan) | flight | [ | Page Up |
| Camera mode (later plan) | flight | V | — |
| Reset the camera (later plan) | flight | ` | ` |
| Hide the interface (later plan) | flight | F2 | F2 |
| Screenshot (later plan) | flight | F10 | F10 |
| Stop time warp (later plan) | flight | / | / |
| Look at the next body | map | Tab | Tab |
| Selected node: prograde up | map | I | I |
| Selected node: prograde down | map | K | K |
| Selected node: normal up | map | L | L |
| Selected node: normal down | map | J | J |
| Selected node: radial out | map | O | O |
| Selected node: radial in | map | U | U |
| Remove the selected node | map | Delete | Delete |
| Symmetry: 1, 2, 3, 4, 6-way | vab | X | X |
| Turn radial sites, or a selected radial part | vab | Q | Q |
| Turn the other way | vab | E | E |
| Choose the next site | vab | Tab | Tab |
| Place the part | vab | Enter, Space | Enter, Space |
| Select the previous part | vab | [ | [ |
| Select the next part | vab | ] | ] |
| Carry the selected part (Shift: the whole group) | vab | M, G | M, G |
| Detach the selected part | vab | D | D |
| Delete the selected part (Shift: with what hangs on it) | vab | Delete | Delete |
| Save the selection as a sub-assembly | vab | A | A |
| Frame the vessel | vab | F | F |
| Search the catalogue | vab | / | / |

## Open questions / follow-ups

- Brakes are a toggle on B, not KSP's hold.
- The pending actions get their handlers in plans 205/206 (stop warp), 211 (RCS, fine control), 221 (vessel switching), 225 (EVA) and 226 (camera, hide UI, screenshot).

## Verification output

See the plan's Log.
