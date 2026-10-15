# Orbital

A web-based, moddable space-flight game in the spirit of Kerbal Space Program. Build rockets from parts, launch, reach orbit, and extend everything through plugins written in TypeScript.

**Status:** pre-alpha, foundation phase. See [`docs/STATUS.md`](docs/STATUS.md).

## Quick start

```sh
bun install
bun run dev        # apps/web on http://localhost:5173
bun test
bun run typecheck
bun run build
```

Requires [Bun](https://bun.com) ≥ 1.4.

## For AI agents and contributors

Start at [`AGENTS.md`](AGENTS.md). The project is developed plan by plan (`docs/plans/`), with decisions recorded as ADRs (`docs/decisions/`) and a living status file.

## Layout

```
apps/web         SvelteKit client
packages/*       core, kepler, physics, sim, sdk, renderer
mods/stock       stock content, written with the public SDK
docs/            spec, architecture, decisions, plans, journal
```

## License

TBD (see `docs/plans/` — a plan will settle this before any public release).
