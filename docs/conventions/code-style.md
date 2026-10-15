# Code style

- **TypeScript strict** (`tsconfig.base.json`). No `any` outside tests and adapter boundaries; prefer `unknown` + narrowing.
- **Plain data, pure functions** in `core`, `kepler`, `sim`, `sdk`, mods: state is serializable; behaviour is functions on definitions. Classes only where a library forces them (adapters).
- **Imports:** `verbatimModuleSyntax` is on — use `import type` for types. Import workspace packages by name (`@orbital/core`), never by relative path across packages.
- **File naming:** kebab-case files, PascalCase types, camelCase values. Ids in data are `"<plugin>.<kebab-name>"`.
- **Units:** SI numbers; helper names (`km()`, `kN()`) only at definition sites.
- **Errors:** throw `Error` subclasses with actionable messages that name ids/plugins involved. Never swallow.
- **Comments:** explain *why* and cite algorithms (e.g. "Vallado Alg. 9"). No commented-out code.
- **Formatting:** Prettier (root config via `sv` defaults: tabs in `apps/web` as generated; packages use the root `.prettierrc` if added — keep whatever `bun run format` produces).
- **Commits:** `type(scope): summary` — types `feat|fix|refactor|test|docs|chore`, scope = package or `docs`/`plan-NNN`. One plan may be several commits; the last commit of a plan is `docs(plan-NNN): complete`. Do not use the `gh` CLI.
- **Dependencies:** adding one requires checking its docs online, adding it to the root `catalog` if shared, and noting it in `docs/research/stack-versions.md`.
