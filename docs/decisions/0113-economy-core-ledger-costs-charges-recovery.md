# 0113 — Economy core: the ledger in the save, part costs, scheduled charges and recovery

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [095](../plans/095-economy-core-currencies-ledger-costs.md)
**Builds on:** ADR 0098 (economy), ADR 0096 and 0171 (world tick), ADR 0111 (rules), ADR 0050 (save)

## Context

Plan 095 lands the first slice of the economy. Open points: where the ledger lives, how a part's cost and its contents' value are known, how recurring income and costs are declared, which rules the sim reads, and the recovery formula.

## Decision

1. **Ledger and balances** live in the sim core (`SimCore.economy`) and are saved as an **optional** `SimSave.economy = { balances: { funds, science, reputation }, entries: LedgerEntry[] }` inside format 5 (the pattern of ADR 0171 point 8). A save without it starts a fresh ledger: funds from `stock.starting-funds`, science and reputation 0. `LedgerEntry = { time, currency, amount, cause, ref? }`; balances always equal the starting values plus the sum of entries. Every write emits `economy:entry`.
2. **Costs are data.** `PartDefinition.cost` (funds for the dry part) and `ResourceDefinition.price` (funds per unit) are optional, non-negative and patchable (ADR 0170). `designCost(design, registries)` in core adds every part's cost and the value of its initial contents, found through each module's `store` and `state(config)` exactly as the sim fills a new vessel; a part without `cost` adds 0 and is listed in `uncosted`. The sim values a live vessel the same way from its current store amounts, so an untouched vessel recovers at the value it was bought for.
3. **Scheduled charges** are a registry (`ctx.charges.register(defineCharge(...))`, report kind `charge`): `{ id, label, currency, amount, everyDays, when?: { rule, equals }, scaleBy?: rule ids }`. On each world tick whose day is a positive multiple of `everyDays` the sim writes `amount × Π scaleBy values` with the charge id as cause, if `when` holds. `projectBalances(balances, charges, rules, fromDay, days)` (core, pure) uses the same rule to project N days.
4. **Rules the sim reads** are named once in core (`ECONOMY_RULES`): `stock.economy` (on/off), `stock.cost-multiplier` (launch costs), `stock.starting-funds`. Without a loaded `stock.economy` rule the economy is off. With it off nothing is written and no launch is refused; costs are still computed.
5. **Launch:** `load-vessel` with the economy on debits `designCost × cost multiplier` (cause `economy.launch`, `ref` the design name) before the vessel is created, and is refused with "Not enough funds: needs N, has M" when short.
6. **Recovery:** `recover-vessel { vessel }` is accepted for a vessel on surface rails, or in flight with `landed` true and slower than the rest speed. It credits `value × f(d)` (cause `economy.recovery`) with `f(d) = max(0.1, 0.98 − 0.88 × min(1, d / (π R)))`, `d` the great-circle distance on the root body to the nearest recovery site and `R` its radius; a vessel on another body gets 0.1. Until plan 084 the only recovery site is the launch site of ADR 0030 (latitude 0, longitude 0). Then the vessel is removed (`vessel:destroyed`, reason `recovered`). There is no separate speed factor: parts that land hard are already lost by the damage model. `recoveryQuote` (pure) returns the line items for the HUD.
7. **Reputation** decays toward 0 with a 365-day time constant, applied on every 30th day as one entry (cause `economy.reputation-decay`); reputation is clamped to −1 000 … 1 000.
8. **Snapshot:** `economy?: { enabled, funds, science, reputation }`.

## Alternatives considered

- **The ledger as an ECS component** on a singleton entity — rejected for the reason of ADR 0110 point 1 (it renumbers entities).
- **Charges as code in a stock world-tick system** — rejected: the projection must know them as data, and mods add their own (salaries, upkeep) the same way.
- **A speed factor in the recovery formula** — rejected (point 6); it would need a new saved touchdown speed for little gain.

## Consequences

- 096 replaces the operations placeholder with building upkeep charges; 106/107 add salaries; 099 and 101 add income sources and the income-share limit of the career bot.
- `API_VERSION` 0.1.30 (additive SDK, protocol and save fields).
