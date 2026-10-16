# zod v4 (as used by `packages/core`)

**Checked:** 2026-10-16 · **Version in use:** 4.6.7 (catalog; `packages/core/node_modules/zod/package.json`)

Source: https://zod.dev/api

What we rely on (all exercised by `packages/core/test`):
- `import * as z from 'zod'` (v4 style namespace import).
- `z.object`, `z.string().regex(re, msg)`, `z.number().positive()/.nonnegative()/.lt()`, `z.int()` (top-level integer schema in v4), `z.array`, `z.tuple`, `z.record(keySchema, valueSchema)` (v4 requires both args), `z.enum([...])`, `z.literal`, `z.unknown`, `.optional()`.
- `z.infer<typeof S>` for output types, `schema.safeParse(x)` → `{ success: true, data } | { success: false, error }`.
- `z.object` strips unknown keys on parse; the registry therefore validates with `safeParse` but stores the *original* definition.
- Error formatting: `z.prettifyError(error)` (v4); the zod.dev/api excerpt did not document it, so it was confirmed by running it (messages show up in the `registry.test.ts` assertions such as `/density/`).
