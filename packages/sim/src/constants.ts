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

/** Half extents of a ground tile (ADR 0019), m: 400 x 200 x 400, top face on the reference sphere. */
export const GROUND_TILE_HALF = { x: 200, y: 100, z: 200 };
/** A vessel whose centre of mass is lower than this above the surface gets a ground tile, m. */
export const GROUND_TILE_ENTER = 300;
/** ... and loses it again above this, m (hysteresis). */
export const GROUND_TILE_EXIT = 400;
/** Coulomb friction of the ground tile and of every part collider. */
export const GROUND_FRICTION = 0.8;
/** Contact points farther apart than this (m) do not count as touching. */
export const CONTACT_DISTANCE = 0.02;
/** Impact tolerance of a part that does not declare one, m/s. */
export const DEFAULT_IMPACT_TOLERANCE = 6;
/** Impact speed above `tolerance * DESTROY_FACTOR` destroys a part; between 1x and that it breaks off. */
export const DESTROY_FACTOR = 2;

/** Uncontrolled debris at rest on the ground for this long is removed, s (ADR 0021). */
export const DEBRIS_REST_TIME = 10;
/** ... when its speed relative to the rotating ground is below this, m/s. */
export const DEBRIS_REST_SPEED = 0.1;

/** A controlled vessel landed, force-free and at rest this long goes on surface rails, s (ADR 0024). */
export const SURFACE_REST_TIME = 2;
/** ... "at rest" means slower than this relative to the ground under its centre of mass, m/s ... */
export const SURFACE_REST_SPEED = 0.05;
/** ... and turning slower than this relative to the ground, rad/s. */
export const SURFACE_REST_SPIN = 0.01;

/** Stefan-Boltzmann constant, W/(m²·K⁴) (exact since the 2019 SI revision). */
export const STEFAN_BOLTZMANN = 5.670374419e-8;
/** Grey-body emissivity of every part's skin (ADR 0023). */
export const EMISSIVITY = 0.8;
/** Sutton-Graves constant for air, W·s³/(kg^0.5·m^1.5): `q = k·√(ρ/r_n)·v³` (ADR 0023). */
export const SUTTON_GRAVES_K = 1.74e-4;
/** Heat capacity per unit surface area of a part's skin, J/(m²·K): 3 mm of aluminium, 2700·900·0.003. */
export const SKIN_HEAT_CAPACITY = 2_700 * 900 * 0.003;
/** Temperature of the surroundings a part starts at and radiates towards, K. */
export const AMBIENT_TEMPERATURE = AIR_TEMPERATURE;
/** Temperature above which a part that declares no `maxTemperature` fails, K. */
export const DEFAULT_MAX_TEMPERATURE = 1_000;
/** Newton iterations of the implicit temperature update (converges in 4-6 from above). */
export const THERMAL_ITERATIONS = 12;
