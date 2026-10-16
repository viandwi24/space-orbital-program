/**
 * The seeded lattice noise lives in `@orbital/core` since plan 031 (the terrain height function
 * reads it, ADR 0043); this module keeps the renderer-internal import path of the ground, the
 * hangar and the part textures.
 */
export { fbm3, hash3, valueNoise3 } from '@orbital/core';
