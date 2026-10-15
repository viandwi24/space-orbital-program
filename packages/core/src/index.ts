/**
 * @orbital/core — environment-neutral runtime core.
 *
 * RULES (see docs/architecture/boundaries.md):
 *  - No DOM, no Bun/Node globals, no rendering, no I/O. Pure TypeScript.
 *  - Everything here must be runnable identically in a Web Worker, the browser main thread, Bun, and Node.
 *
 * Implemented by plans in docs/plans/. This file only establishes the package.
 */
export const CORE_VERSION = '0.0.0';

/** Public API version of the mod/plugin contract. Bump per docs/conventions/versioning.md. */
export const API_VERSION = '0.1.0';
