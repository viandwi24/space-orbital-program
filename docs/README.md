# docs/

This directory is the memory of Space Orbital Program (code name `orbital`, ADR 0105). It is designed so that an agent (or human) with no prior context can pick up the next plan and continue, and so that it never goes stale: every plan ends by updating it (see `conventions/docs-maintenance.md`).

## Reading order for a newcomer

1. `STATUS.md` — where we are.
2. `product/spec.md` — what we are building and what we are not. `product/visual-direction.md` — the visual/UI bar for anything the player sees (ADR 0025).
3. `architecture/overview.md` → `boundaries.md` → `plugin-system.md` → `simulation.md`.
4. `decisions/README.md` — the ADR index; skim titles, read the ones your plan links.
5. `plans/README.md` — how plans work; then your plan.

## Directory guide

| Directory | Purpose | Mutability |
|---|---|---|
| `product/` | product spec, glossary, scope and non-goals | changes only through an ADR |
| `architecture/` | current design of the system | updated whenever a plan changes the design |
| `decisions/` | Architecture Decision Records, numbered `NNNN-slug.md` | append-only; supersede instead of edit |
| `plans/` | numbered work plans `NNN-slug.md` with acceptance criteria | status field changes; body frozen once `in-progress` |
| `journal/` | one entry per executed plan: what happened, surprises, open questions | append-only |
| `research/` | facts verified from the internet, with date and source | updated whenever something is looked up |
| `guides/` | how-tos for people building on the project (mod authors) | updated when the SDK or stock changes |
| `roadmap/` | the three-agent team roadmap: machines, lanes, checkpoints, claims, start prompts (`roadmap/README.md`) | Lead updates `checkpoints.md` and `claims.md` at each merge |
| `conventions/` | how we write code, tests, versions, docs | rarely |
| `STATUS.md` | the single living summary | every plan |

## Principles

- **One place per fact.** Architecture lives in `architecture/`, the reason it is that way lives in `decisions/`, the work to get there lives in `plans/`, the story of doing it lives in `journal/`. Do not duplicate; link.
- **Acceptance criteria are executable.** A plan's criteria must be verifiable by running a command or a test, not by opinion.
- **Decisions are immutable.** To change one, write a new ADR that supersedes it.
- **Verified, dated facts.** Anything about external tools (versions, CLI flags, APIs) comes from the official docs and is recorded in `research/` with the date it was checked.
