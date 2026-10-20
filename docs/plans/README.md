# Plans

A plan is the unit of work an agent picks up in one or a few sessions. Plans are numbered `NNN-slug.md` and never renumbered.

## Lifecycle

```
draft ──► ready ──► in-progress ──► done
                        │
                        └──► blocked ──► (new plan or ADR) ──► ready
```

- **draft** — intent is clear, but Steps/Acceptance criteria need refinement. An agent may refine a draft into `ready` as its own small task (and say so in the journal), but should not implement a draft.
- **ready** — an agent can start it with no questions.
- **in-progress** — exactly one owner. The body is frozen; only `status`, `owner`, and the `## Log` section change.
- **done** — all acceptance criteria verified by running them; docs checklist complete; journal entry written.
- **blocked** — stopped; the reason is in the plan's `## Log` and in `STATUS.md`.

## Frontmatter

```yaml
---
id: 002
title: Kepler orbital mechanics
status: ready            # draft | ready | in-progress | done | blocked | dropped (the owner cancelled it)
owner: ""                # agent/session label when in-progress
depends: []              # plan ids that must be done first
phase: 0
created: 2026-10-16
updated: 2026-10-16
---
```

`tools/docs-check.ts` validates this block.

## Sections (use the template)

1. **Goal** — one paragraph. What exists when this is done that does not exist now.
2. **Context** — which docs to read (specific files/sections), which ADRs apply, which previous journal entries matter.
3. **Scope** — in / out. Out-of-scope discoveries become new `draft` plans.
4. **Design notes** — just enough to start; the architecture docs hold the real design.
5. **Steps** — ordered, each small enough to commit.
6. **Acceptance criteria** — each one is a command to run or a test name, with the expected result. No criterion may require a human's eyes except where explicitly marked `[manual]` (allowed only for UI plans, and must be minimised).
7. **Docs checklist** — which docs this plan must touch.
8. **Log** — appended by the owner while in progress: decisions, blockers, deviations.

## Picking a plan

Take the lowest-numbered `ready` plan whose `depends` are all `done`, unless `STATUS.md` says otherwise.

## Writing a new plan

Copy `000-template.md`, take the next number, set `status: draft`, add a row to `STATUS.md`'s plan board. Keep the acceptance criteria executable from the first draft; that is where the thinking happens.
