# 078 — World rules, presets and the rule changelog

**Plan:** plans/078-world-rules-presets-and-changelog.md · **Session:** Agent 1 (Lead, MacBook Pro M5), 2026-10-17 · **ADRs:** [0111](../decisions/0111-world-rules-values-in-world-info-set-rule-and-changelog.md) (new), [0094](../decisions/0094-worlds-are-saves-modes-are-presets-over-rules.md), [0104](../decisions/0104-every-system-ships-a-define-point-and-typed-patches.md), [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md) · **Research:** none (no new tool)

**Status when written: criteria met** (output in the plan's Log).

## What was done

| Where | What |
|---|---|
| `packages/core/src/rules.ts` | `RuleDefinition` (boolean, enum, number), `PresetDefinition`, schemas that check defaults and preset values, `ruleValueProblem`, `presetValue`, `resolveRules`, `IDENTITY_RULES`, `DEFAULT_PRESET` |
| `packages/core` registry, plugin, definitions, protocol, events, world, schemas, save | registries `rules` and `presets` (report kinds `rule`, `preset`), `ctx.rules` / `ctx.presets`, preset values checked after boot, `SystemContext.rules`, `set-rule` command, `world:rule-changed`, `Snapshot.rules`, `WorldInfo.preset` and `changelog` (additive in format 5), every `readSimSave` result re-signed; `API_VERSION` 0.1.27 |
| `packages/sdk` | `defineRule`, `definePreset`, schemas and types re-exported; `test/rules.test.ts` |
| `packages/sim` | rules resolved at `createSim` (new run and resume), `Sim.unknownRules`, `worldInfo` getter refreshed after a change, `setRule` in `commands.ts`, snapshot view cached; `test/rules.test.ts` |
| `mods/stock/src/rules.ts` | 22 rules (economy 3, science 3, crew 8, comms 4, launch 2, agency 2) and 4 presets (Sandbox, Science, Career, Career hardcore) |

## Decisions and surprises

- **Values are resolved once and stored.** A world remembers every rule's value (ADR 0111 point 3), so a mod changing a default never changes an old world. The cost is that a format 5 save of the Legacy world written by 077 (empty `rules`) gains the stock values at its next load; the resume tests of 077 that compared the world info verbatim now compare it with the resolved rules.
- **Additive fields in a format** exposed the same checksum trap as in 077: a zod default on read makes the parsed save differ from the signed bytes. `readSimSave` now signs every result it returns, after checking the raw bytes, which removes the whole class of problem.
- **`set-rule` applies at dispatch**, not queued into the next step: commands arrive between steps, so the effect is the same, and a save in between cannot lose the change.
- Hardcore Career keeps three rival agencies: ADR 0109 sets the crew aspects to full and says nothing about agencies.
- Reliability is off in every stock preset; the "engineer" preset of ADR 0094 point 3 is left to plan 130 (reliability), which can add it with `definePreset`.

## Not met / not done

- No UI: Create World (087) and the world details (changelog view) are later plans.
- Every stock rule is inert until its system ships (095, 103, 106/107, 114 to 121, 126, 127, 130).
- `stock.crew-return-days` is used only when `stock.crew-death` is `return` (plan 107).
