# Journal

One entry per executed plan: `NNN-slug.md` (same number as the plan). Append-only. This is where context that does not belong in code or architecture docs survives: why a step took three attempts, which approach was abandoned, what the next agent should watch out for.

## Template

```md
# NNN — Title

**Plan:** plans/NNN-slug.md · **Session(s):** label(s) · **Date:** YYYY-MM-DD

## What was done
Short, factual. Commands run for scaffolding (copy-pasteable).

## What surprised me
Deviations from the plan, tool quirks, numeric gotchas.

## Decisions made (link ADRs)

## Open questions / follow-ups
Each should map to a draft plan or an issue in STATUS.md.

## Verification output
Trimmed output of the acceptance-criteria commands.
```

Screenshots or other assets go in `journal/assets/NNN-*.png`.
