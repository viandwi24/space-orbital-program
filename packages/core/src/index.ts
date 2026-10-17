/**
 * @orbital/core — environment-neutral runtime core.
 *
 * RULES (see docs/architecture/boundaries.md):
 *  - No DOM, no Bun/Node globals, no rendering, no I/O. Pure TypeScript.
 *  - Everything here must be runnable identically in a Web Worker, the browser main thread, Bun, and Node.
 */
export { CORE_VERSION, API_VERSION } from './version.ts';
export * from './math.ts';
export * from './ids.ts';
export * from './units.ts';
export * from './events.ts';
export * from './world.ts';
export * from './calendar.ts';
export * from './schemas.ts';
export * from './definitions.ts';
export * from './module-info.ts';
export * from './registry.ts';
export * from './physics-backend.ts';
export * from './protocol.ts';
export * from './protocol-schemas.ts';
export * from './design.ts';
export * from './rng.ts';
export * from './noise.ts';
export * from './planet-map.ts';
export * from './terrain.ts';
export * from './moon-terrain.ts';
export * from './body-terrain.ts';
export * from './stones.ts';
export * from './semver.ts';
export * from './patch.ts';
export * from './plugin.ts';
export * from './save.ts';
export * from './rules.ts';
export * from './mods.ts';
export * from './mod-assets.ts';
