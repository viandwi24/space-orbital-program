# 0061 — Remappable keys: one binding table, settings format 2

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/053-remappable-keys-audio-and-small-screens.md
**Amends:** ADR 0060 (point 3: the read-only key list; the settings value gains `bindings`, `audio` and `touch`, `v` 1 to 2).

## Context

ADR 0060 kept the documented keys as a read-only list because the handlers (`flight-loop.ts`, `vab/controller.svelte.ts`, the maneuver planner, the SAS buttons) were `switch` statements on key names. Players with other layouts, one hand, or habits from other games need to change them.

## Decision

1. **Actions and a table.** `lib/keybindings.ts` defines every remappable action once: `{ id, scope, group, label, defaults }`. Scopes: `flight` (the map view's keys share it: they are active together and must not clash) and `vab`. Bindings are stored as **key ids**: `KeyboardEvent.code` for letters, digits and named keys (`KeyW`, `Digit1`, `Space`, `F5`, `Tab`, `Delete`), the character itself for punctuation (`,` `.` `/` `?` `[` `]`) so it works on any layout (the flight handler already did this for comma and period), and Right Shift/Ctrl/Alt folded onto the left key. One action may hold several keys (`help` is `?` and `F1`).
2. **A resolver, not switches.** `createKeymap(table)` gives `actionFor(scope, keyId)` and `keysOf(action)`; handlers translate the event once (`keyIdOf(e)`) and branch on the action id. Continuous controls (throttle, pitch, yaw, roll) ask whether any key of the action is held.
3. **Fixed keys stay fixed**, listed read-only: Esc (pause menu, closes dialogs, cancels placing), `Ctrl+Z`, `Ctrl+Y`, `Ctrl+S` in the VAB, the arrow, `+` and `-` camera keys of the VAB canvas, and `Backspace` as a second Delete. They are reserved: no action may take them.
4. **Clashes are refused, not silently resolved.** `rebind(table, action, key)` reports the action that already uses the key in the same scope; the dialog shows "X is already used by Y" with Swap (the two actions exchange keys) or Cancel. Reset per action and for all. A stored table is validated on load: unknown actions and reserved or clashing keys fall back to the default of that action, so a corrupt or old value never leaves the game without a key for stage or throttle.
5. **Settings format 2** (`orbital.settings`): `{ v: 2, units, tutorial, bindings: { [action]: keyId[] }, audio: { master, effects, ui, muted }, touch: 'auto' | 'on' | 'off' }`. Only overrides are stored, so an action added later takes its default. `v: 1` values migrate (units and tutorial kept, the rest defaulted); any other version or garbage gives the defaults, as before. The migration is a zod transform with a vitest table.
6. **Every place that names a key reads the table:** the help overlay and the settings dialog, the SAS button tooltips, and the first-flight guide (its texts carry `{key:action}` placeholders resolved against the current table, replacing the literal "Press Z" strings).

## Alternatives considered

- **Store `e.key`:** layout and Shift dependent (`Shift+1` is `!`), letters differ by case. Rejected; `code` for letters is what the flight loop already used.
- **Free-form chords (`Ctrl+K`):** the combos the VAB uses are fixed and nothing else needs modifiers; chords would need a second clash model. Rejected for 1.x.
- **A separate storage key for bindings:** one versioned value is how settings already work (ADR 0060); a second key would need its own migration.
- **Auto-swap on a clash without asking:** surprising, and it hides which action lost its key.

## Consequences

- `maneuver.ts` `NODE_KEYS` and `hud/sas-model.ts` key codes become action ids; their tests change.
- The tutorial test table pins the placeholders.
- Gamepads are still out of scope.
