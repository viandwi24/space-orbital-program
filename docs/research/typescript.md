# TypeScript: module augmentation

**Checked:** 2026-10-16 · Source: https://www.typescriptlang.org/docs/handbook/declaration-merging.html (section "Module Augmentation")

- `declare module "<specifier>" { interface X { ... } }` merges into the named module's existing declarations; the specifier is resolved like an import/export specifier. You cannot declare new top-level declarations in an augmentation, only patch existing ones, and default exports cannot be augmented.
- The page does not say whether an interface that a module only *re-exports* can be augmented through the re-exporting specifier. That was settled empirically: see `packages/sdk/test/define.test-d.ts` and the result recorded in `architecture/plugin-system.md` and ADR 0013.
