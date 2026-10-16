# bun:test (as used by `packages/kepler` and other packages)

**Checked:** 2026-10-16 · **Bun in use:** 1.4.2 (docs site banner shows 1.4.3)

Sources:
- https://bun.com/docs/test/writing-tests
- https://bun.com/docs/test/discovery

What we rely on:
- Import `describe`, `test`, `expect` from `bun:test` (Jest-compatible API).
- Number matchers used: `toBeLessThan`, `toBeLessThanOrEqual`, `toBeGreaterThan`, `toBeCloseTo`; `toThrow` for error cases. `test.each` exists (array rows are spread into arguments).
- Default per-test timeout is 5000 ms (override via third argument to `test`). Keep randomized suites well under it.
- Discovery: files matching `*.test.{ts,…}`, `*_test.*`, `*.spec.*`, `*_spec.*`; `node_modules` and hidden dirs excluded. Helper modules must not match these patterns (e.g. `test/helpers.ts`).
- Positional args are **substring filters on the path**, not globs: `bun test packages/kepler` runs every test file whose path contains `packages/kepler`. Args starting with `./` or `/` are exact paths.
