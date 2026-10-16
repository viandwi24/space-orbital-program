/**
 * @orbital/physics — Rapier adapter and mock backend for the `PhysicsBackend` interface that
 * lives in `@orbital/core`. The ONLY package allowed to import @dimforge/rapier3d-compat.
 */
export { API_VERSION } from '@orbital/core';
export const PHYSICS_VERSION = '0.0.0';

export { createRapierBackend } from './rapier-backend.ts';
export type { RapierBackendOptions } from './rapier-backend.ts';
export { createMockBackend } from './mock-backend.ts';
export { deriveInertia } from './inertia.ts';
