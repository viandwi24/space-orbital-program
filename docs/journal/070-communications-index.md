# 070 — Communications (index)

**Plan:** [plans/070-communications.md](../plans/070-communications.md) · **Session:** Agent 1 (Lead), 2026-10-18 · **ADRs:** [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md) (the comms programme), 0109 (control needs a command source)

**Status when written: index closed; every tier plan done.**

The communications programme of ADR 0101 was built in eight plans, merged between 2026-10-17 and 2026-10-18:

| Tier | Plan | Journal | Checkpoint |
|---|---|---|---|
| 1 | 114: antennas, line of sight, ground stations, control states, real blackout | [114](114-comms-tier-1-model.md) | `cp/f4-114-comms-1` |
| 1 | 115: link badge, Comms tab, Network layer | [115](115-comms-tier-1-interface.md) | `cp/f4-115-comms-1-ui` |
| 2 | 116: link budget, bands, rates, inspector | [116](116-comms-tier-2-link-budget.md) | `cp/f4-116-comms-2` |
| 3 | 117: pointing, routing, capacity, latency, the delay rule (save format 7) | [117](117-comms-tier-3-routing-latency-delay.md) | `cp/f4-117-comms-3` |
| 3 | 118: contact timeline, coverage map, constellation planner | [118](118-comms-planning-tools.md) | `cp/f4-118-comms-tools` |
| 4 | 119: queues, store-and-forward, contact windows (save format 8) | [119](119-comms-tier-4-queues-store-and-forward.md) | `cp/f4-119-comms-4` |
| 5 | 120: channels, licences, interference, encryption | [120](120-comms-tier-5-channels-licences-interference.md) | `cp/f4-120-comms-5` |
| 6 | 121: suit radios, voice, broadcasts | [121](121-comms-tier-6-suit-radios-voice-broadcast.md) | `cp/f4-121-comms-6` |

Nothing was built under this index itself. The public roadmap lists each tier as its own item (plan 076); the index's own item stays and now reads as shipped.
