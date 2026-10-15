# Docs maintenance — the end-of-plan checklist

The docs stay useful only if every plan leaves them accurate. Run this list before declaring a plan done. `bun run docs:check` verifies the mechanical parts; the rest is judgement.

## Checklist

1. **Plan file** — `status: done` (or `blocked`), `updated:` date, every acceptance criterion ticked with evidence in the `## Log` or journal.
2. **`docs/STATUS.md`** — board row updated; "Current plan" / "Next plan" set; new open issues added, resolved ones removed; "Recent journal entries" prepended; phase marker if a phase completed.
3. **Journal** — `docs/journal/NNN-slug.md` written using the template. Include exact scaffold commands and trimmed verification output.
4. **Architecture docs** — any `docs/architecture/*.md` whose description no longer matches the code is updated *to the code*. Design-target examples (e.g. in `plugin-system.md`) must compile against the shipped API in spirit.
5. **ADRs** — every non-trivial decision made during the plan has an ADR (`accepted`), linked from the plan and the index. Superseded ADRs get their status line updated.
6. **Research** — everything looked up online is in `docs/research/` with URL and date.
7. **Glossary** — new terms added; renamed concepts updated everywhere (`grep`).
8. **AGENTS.md / README.md** — only if commands, layout, or rules changed.
9. **New draft plans** — for every piece of scope you pushed out, a `draft` plan exists with a board row.

## What not to do

- Do not edit a `done` plan's body; add a new plan.
- Do not rewrite an ADR; supersede it.
- Do not paste large code into docs; link to files and line ranges change — describe the API instead.
- Do not leave TODOs in docs without a plan number.
