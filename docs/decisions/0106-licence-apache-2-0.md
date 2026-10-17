# 0106 — Licence: Apache-2.0

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decision "licence", 2026-10-17); delivered by plan 075 (the `LICENSE` file itself is added with this ADR)
**Research:** `docs/research/licence.md` (text source and date).

## Context

The licence was the only FAIL on the v1 release checklist (journal 023) and an agent must not choose it. The owner chose a permissive open-source licence, and in chat: Apache-2.0. It affects contributors, modders and assets.

## Decision

1. The game's code and docs are licensed under the **Apache License, Version 2.0**. The root `LICENSE` holds the unmodified text from https://www.apache.org/licenses/LICENSE-2.0.txt (checked 2026-10-17).
2. **Package metadata**: every workspace `package.json` gets `"license": "Apache-2.0"` (plan 075).
3. **Headers policy**: no per-file licence header is required; the root `LICENSE` and package metadata are the statement. A `NOTICE` file is added only if a dependency's licence requires one to be carried (plan 075 checks the dependency list on the Credits page).
4. **Contributions** are accepted under the same licence (Apache-2.0 section 5, inbound = outbound); no contributor licence agreement.
5. **Mods** are separate works under their authors' licences; the SDK's licence lets closed and open mods use it. The mod manifest may state a licence (optional field, plan 075).
6. **Assets**: everything shipped is code-generated (ADR 0025, 0062) or third-party under its own licence (fonts under OFL, listed on the Credits page). The licence grants no trademark rights (section 6), which covers the product name.

## Alternatives considered

- **MIT** — equally permissive, but without Apache's explicit patent grant and contribution terms.
- **A copyleft licence** (GPL, MPL) — not chosen by the owner: a higher barrier for modders and contributors.

## Consequences

- Anyone may make a closed version (the owner accepted this).
- Until plan 075 lands, the in-game Credits page and the README status line still read "to be decided"; the README's Licence section is updated with this ADR.
- STATUS: the "licence undecided" issue is replaced by the remaining metadata work of plan 075.
