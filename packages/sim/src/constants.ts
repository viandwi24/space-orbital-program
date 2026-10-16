/** Tunables of the sim. Values are SI. Each one is documented in architecture/simulation.md. */

/** Fixed flight step, s (50 Hz). */
export const SIM_DT = 0.02;
/** Largest chunk of simulated time propagated in one on-rails step, s. */
export const RAILS_MAX_STEP = 10;
/** A vessel with no force or torque applied for this long may go on rails, s. */
export const RAILS_IDLE_TIME = 2;
/** Highest accepted warp factor. */
export const MAX_WARP = 1e6;
/** Flight frame re-anchors when its focus vessel is farther than this from the frame origin, m. */
export const REANCHOR_DISTANCE = 1_000;
/** A vessel loaded or woken within this distance of a frame's origin joins that frame, m. */
export const PHYSICS_RANGE = 2_500;
/** Default number of simultaneously active flight frames (one physics backend each). */
export const DEFAULT_MAX_FLIGHT_FRAMES = 2;

/** Dimensionless drag coefficient used for every part (no per-part data yet). */
export const DRAG_COEFFICIENT = 0.3;
/** Specific gas constant of air, J/(kg·K). */
export const AIR_GAS_CONSTANT = 287.05;
/** Reference air temperature used to turn pressure into density, K. */
export const AIR_TEMPERATURE = 288.15;

/** Box used for a part without a `shape`, edge length in m. */
export const FALLBACK_PART_SIZE = 1;

/** An uncontrolled vessel hitting the ground faster than this (radial speed relative to the ground) is destroyed, m/s. */
export const CRASH_SPEED = 10;
