/**
 * @orbital/renderer — Three.js renderer. Reads snapshots, never mutates sim state (ADR 0003).
 * Imports only `@orbital/core` and `three` (boundaries.md).
 */
export const RENDERER_VERSION = '0.1.0';

export * from './origin.ts';
export * from './orbit-line.ts';
export * from './camera-rig.ts';
export * from './scene.ts';
export * from './map.ts';
export * from './renderer.ts';
