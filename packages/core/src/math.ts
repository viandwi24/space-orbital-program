/**
 * Shared plain-data math types. `Vec3` is the kepler type re-exported (type only, so core has no
 * runtime dependency on kepler); `Quat` is unit-length `{x, y, z, w}` (units-and-frames.md).
 */
import type { Vec3 } from '@orbital/kepler';

export type { Vec3 };

export type Quat = { x: number; y: number; z: number; w: number };

/** A rigid transform: position plus orientation in some frame. */
export type Transform = { position: Vec3; rotation: Quat };
