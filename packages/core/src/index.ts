/**
 * @orbital/core — environment-neutral runtime core.
 *
 * RULES (see docs/architecture/boundaries.md):
 *  - No DOM, no Bun/Node globals, no rendering, no I/O. Pure TypeScript.
 *  - Everything here must be runnable identically in a Web Worker, the browser main thread, Bun, and Node.
 */
export const CORE_VERSION = '0.0.0';

/** Public API version of the mod/plugin contract. Bump per docs/conventions/versioning.md. */
export const API_VERSION = '0.1.0';

export * from './math.ts';
export * from './ids.ts';
export * from './units.ts';
export * from './events.ts';
export * from './world.ts';
export * from './schemas.ts';
export * from './definitions.ts';
export * from './registry.ts';
export * from './physics-backend.ts';
export * from './protocol.ts';
export * from './rng.ts';
