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
export * from './body-rotation.ts';
export * from './seasons.ts';
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
export * from './terrain-gradient.ts';
export * from './sites.ts';
export * from './site-templates.ts';
export * from './comms.ts';
export * from './systems.ts';
export * from './regions.ts';
export * from './dossier.ts';
export * from './life-support.ts';
export * from './categories.ts';
export * from './moon-terrain.ts';
export * from './body-terrain.ts';
export * from './stones.ts';
export * from './semver.ts';
export * from './data.ts';
export * from './action-groups.ts';
export * from './objectives.ts';
export * from './crew.ts';
export * from './patch.ts';
export * from './plugin.ts';
export * from './save.ts';
export * from './rules.ts';
export * from './economy.ts';
export * from './buildings.ts';
export * from './mods.ts';
export * from './mod-assets.ts';
// One interface for orbit prediction (plan 080, ADR 0173); the patched provider lives in kepler.
export type { TrajectoryCapabilities, TrajectoryModel, TrajectoryProvider } from '@orbital/kepler';
export * from './science.ts';
export * from './milestones.ts';
export * from './tech-tree.ts';
export * from './scenarios.ts';
export * from './panels.ts';
export * from './range-safety.ts';
export * from './reliability.ts';
