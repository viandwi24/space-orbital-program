# Licence

The game's licence is Apache-2.0 (ADR 0106, the owner's decision of 2026-10-17).

| Fact | Source | Checked |
|---|---|---|
| Text of the Apache License, Version 2.0, copied unmodified into the root `LICENSE` (202 lines, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`) | https://www.apache.org/licenses/LICENSE-2.0.txt | 2026-10-17 |
| SPDX identifier used in package metadata: `Apache-2.0` | https://www.apache.org/licenses/LICENSE-2.0.txt (title "Apache License, Version 2.0"); SPDX list: `Apache-2.0` "Apache License 2.0", `MIT` "MIT License", `OFL-1.1` "SIL Open Font License 1.1" at https://spdx.org/licenses/ | 2026-10-17 |
| SPDX expressions (for the mod manifest `licence` field, plan 075): `WITH` attaches an exception, a `+` suffix means "or later"; `AND`, `OR` and `LicenseRef-` are defined in the SPDX License Expressions annex linked from the list | https://spdx.org/licenses/ | 2026-10-17 |

## Dependency review for NOTICE (plan 075)

Apache-2.0 §4(d): if a Work includes a `NOTICE` text file as part of its distribution, a redistribution must carry its attribution notices. The OFL 1.1 (condition 2) requires the copyright notice and the licence to go with the font files: as stand-alone text, human-readable headers, or machine-readable metadata that users can easily view.

Shipped runtime dependencies (licence from each installed `package.json`, NOTICE and licence files listed in the installed package, `node_modules/.bun/*`, 2026-10-17):

| Dependency | Version | Licence | NOTICE in the package | Source of the NOTICE check |
|---|---|---|---|---|
| `@dimforge/rapier3d-compat` | 0.21.0 (and 0.12.0, transitive) | Apache-2.0 | none (files: `LICENSE`, `README.md`, `package.json`, `dist`) | installed package; repository root https://github.com/dimforge/rapier.js has `LICENSE` and no `NOTICE` (2026-10-17) |
| `three` | 0.186.1 | MIT | none | installed package |
| `quickjs-emscripten`, `quickjs-emscripten-core`, `@jitl/quickjs-*` | 0.32.0 | MIT | none | installed package |
| `svelte` | 5.57.2 | MIT | none | installed package |
| `@sveltejs/kit` | 3.1.0 | MIT | none | installed package |
| `zod` | 4.6.7 | MIT | none | installed package |
| `@fontsource/barlow-semi-condensed` | 5.3.0 | OFL-1.1 | `LICENSE`: "Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)" | installed package; OFL text https://openfontlicense.org/open-font-license-official-text/ |
| `@fontsource/ibm-plex-mono` | 5.3.0 | OFL-1.1 | `LICENSE`: "Copyright 2017 IBM Corp. All rights reserved." | installed package |

**Decision.** No `NOTICE` file is added. No Apache-2.0 dependency ships one, and the game's own `LICENSE` needs none. For the fonts, the Credits page, which is part of every build, shows each font's copyright line and links the OFL text. A plan that adds a font (086 adds Manrope) adds its copyright line to `credits.ts` the same way. `credits.test.ts` checks that every OFL credit has one.
