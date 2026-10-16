/**
 * Unit helpers for readable definitions. State is SI everywhere (units-and-frames.md); each helper
 * converts a display-scale number to SI and returns a plain number.
 */

/** Metres → metres (documents intent at call sites). */
export const m = (x: number): number => x;
export const km = (x: number): number => x * 1_000;

export const kg = (x: number): number => x;
export const tonnes = (x: number): number => x * 1_000;

export const newtons = (x: number): number => x;
export const kN = (x: number): number => x * 1_000;

export const seconds = (x: number): number => x;
export const minutes = (x: number): number => x * 60;
export const hours = (x: number): number => x * 3_600;
export const days = (x: number): number => x * 86_400;

/** Degrees → radians. */
export const deg = (x: number): number => (x * Math.PI) / 180;
/** Radians → degrees (display only). */
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/** Newtonian constant of gravitation, m³/(kg·s²) (CODATA 2018). Bodies carry a mass; μ = G·M. */
export const GRAVITATIONAL_CONSTANT = 6.6743e-11;
