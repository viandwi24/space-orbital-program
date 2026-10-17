# 0111 — World rules: typed definitions, values in the world info, `set-rule` and the changelog

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [078](../plans/078-world-rules-presets-and-changelog.md)
**Builds on:** ADR 0094 points 3 and 4 (modes are presets over rules; rules change mid-game), ADR 0104 (every system ships a define point), ADR 0110 (world info), ADR 0109 (preset defaults)

## Context

Plan 078 adds `defineRule` and `definePreset`, the stock rules and presets, and the `set-rule` command. Open questions: where the values and the changelog live, how a value is resolved when a world was made before a rule existed, when a change takes effect, and what counts as an identity rule.

## Decision

1. **Definitions** (core, zod-validated at registration, new registries `rules` and `presets`, report kinds `rule` and `preset`):
   - `RuleDefinition`: `id`, `label`, `category`, `type` (`boolean`; `enum` with `values`; `number` with `min`, `max`, optional `integer`), `default`, optional `presets` (preset id to value), `changeable` (false = identity, fixed at creation) and an optional `description`.
   - `PresetDefinition`: `id`, `label`, optional `description`, optional `values` (rule id to value).
   - Every default and preset value must fit its rule's type; a registration that does not is a `RegistryError`. A preset value for a rule that is not loaded is ignored (the rule may come from a mod that is not installed).
2. **Values live in the world info** (`WorldInfo.rules`, saved in `SimSave.worldInfo`), with two new fields: `preset` (the preset id the world was created with, `stock.sandbox` for the Legacy world) and `changelog` (`{ time, rule, from, to }` entries). Both are additive inside format 5: `worldInfoSchema` gives them defaults, and `readSimSave` now signs every result it returns over the parsed data (the checksum is still verified against the raw bytes first), so a save read twice passes even when the parse filled a default.
3. **Resolution.** For each registered rule the value is, in order: the world's own `rules[id]`, the preset's `values[id]`, the rule's `presets[preset]`, the rule's `default`. A new run stores the resolved value of every registered rule, so later changes to a mod's defaults do not change an existing world. On resume, a registered rule missing from the map (a mod added since) is resolved the same way and stored. An id in the map that no loaded mod registers is **kept** in the save and listed in `Sim.unknownRules`. A value of a registered rule that does not fit its type refuses the run (`RangeError` for `createSim({ world })`, `SaveError` `damaged` on resume).
4. **`set-rule { rule, value }`** is validated: an unknown id is refused (`unknown rule "<id>"`), an identity name (`system`, `variant`, `gravityModel`, `seed`, `primarySite`) or a rule with `changeable: false` is refused with reason **`identity rule`**, and a value of the wrong type with the rule's expected type. An accepted change is written at once: commands arrive between steps, so it takes effect from the next step. It appends one changelog entry at the current sim time and emits `world:rule-changed`. Setting the value a rule already has is accepted and logs nothing.
5. **Reading rules.** `Snapshot.rules` (optional field) carries the resolved values for the HUD; the object is rebuilt only after a change. Systems read rules through `SystemContext.rules.get(id)`; a lookup is a map read, no per-step cost.
6. **Stock** registers the presets `stock.sandbox`, `stock.science`, `stock.career` and `stock.career-hardcore` (ADR 0109), and the rules of ADRs 0095 to 0101 and 0109, inert until their systems exist.

## Alternatives considered

- **Store only changed values and resolve on every read** — rejected: a world would silently change when a mod changes a default, against ADR 0094 ("a preset is a set of values at creation").
- **Queue `set-rule` and apply it inside the next step** — rejected: a save taken between the command and the step would lose the change unless the queue were saved too; applying at dispatch is equivalent because nothing runs between steps.
- **A format 6 bump for `preset` and `changelog`** — rejected: both have safe defaults, which ADR 0050 point 6 treats as additive.

## Consequences

- Create World (plan 087) writes `preset` and any edited values into `WorldInfo.rules`; the web world record's changelog mirrors the sim's.
- Systems behind the rules (095 economy, 103 science, 106/107 crew, 114 to 121 comms, 127 range safety, 130 reliability, 126 agencies) read them through `SystemContext.rules`.
- `API_VERSION` 0.1.27 (additive SDK and protocol).
