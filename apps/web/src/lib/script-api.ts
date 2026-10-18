/**
 * The script API as a typed table (plan 036): every global and every `ship` member with a
 * signature and a one-line description. The editor's completions, its "unknown ship member"
 * check and the highlighter's API colour all read it; `script-api.test.ts` runs a real script
 * runner and fails when this table and what the sandbox really defines drift apart.
 * The reference with examples is `docs/guides/scripting.md`.
 */

export interface ApiEntry {
	name: string;
	/** What the completion list shows next to the name. */
	signature: string;
	/** One line, plain words. */
	doc: string;
	kind: 'function' | 'value';
	/** A `ship` member the script may assign (`ship.throttle = 1`). */
	writable?: boolean;
	/** What accepting the entry inserts, when it is more than the name (`time: ` for an object key). */
	insert?: string;
}

const fn = (name: string, signature: string, doc: string): ApiEntry => ({
	name,
	signature,
	doc,
	kind: 'function'
});
const value = (name: string, signature: string, doc: string, writable = false): ApiEntry => ({
	name,
	signature,
	doc,
	kind: 'value',
	...(writable ? { writable } : {})
});

/** The names the script API adds to the global scope. */
export const GLOBALS: readonly ApiEntry[] = [
	value('ship', 'ship', 'Telemetry of your vessel and its setpoints (throttle, attitude, sas).'),
	fn('stage', 'stage(): Promise<{ ok, reason? }>', 'Fire the next stage.'),
	fn(
		'action',
		'action(part, module, action, ...args)',
		'Call a module action of a part, e.g. deploy landing legs.'
	),
	fn(
		'runExperiment',
		'runExperiment(partOrExperimentId): Promise<{ ok, reason? }>',
		'Start an experiment: by part id, or the first one of that experiment id.'
	),
	fn('wait', 'wait(seconds): Promise', 'Resolve after that much simulation time. Use with await.'),
	fn(
		'waitUntil',
		'waitUntil(fn): Promise',
		'Poll fn every tick until it returns something truthy.'
	),
	fn('nextTick', 'nextTick(): Promise', 'Resolve on the next tick; use it in every loop.'),
	fn('time', 'time(): number', 'Simulation time in seconds.'),
	fn(
		'date',
		'date(t?): { text, julianDate }',
		'Game date at simulation time t (default: now) in the world calendar.'
	),
	fn('print', 'print(...values)', 'Write a line to the panel log.'),
	fn('warp', 'warp(factor): Promise<{ ok, reason? }>', 'Ask for time warp, 1 to 100 000.'),
	fn(
		'warpTo',
		'warpTo(time, factor = 100000): Promise',
		'Time warp that slows down and stops at that simulation time.'
	),
	fn(
		'addNode',
		'addNode({ time, prograde, normal, radial }): Promise',
		'Plan a maneuver node; it appears in ship.nodes on a later tick.'
	),
	fn('setNode', 'setNode(id, { time?, prograde?, normal?, radial? }): Promise', 'Change a node.'),
	fn('removeNode', 'removeNode(id?): Promise', 'Remove one node, or all of them.'),
	fn(
		'setTarget',
		'setTarget(spec): Promise<{ ok, reason? }>',
		'Choose a target: a body id, a vessel id, an entry of ship.targets, or null.'
	),
	value(
		'bodies',
		'bodies[id]',
		'Data of every body by id; bodies[id].state(t) is its position and velocity at time t.'
	)
];

/**
 * Members of `debug` (plan 203, ADR 0200 point 9). The global exists only while the world allows
 * the debug tools (Sandbox, or Debug mode on), so it is not in `GLOBALS`.
 */
export const DEBUG: readonly ApiEntry[] = [
	fn(
		'setOrbit',
		'debug.setOrbit({ body?, apoapsis, periapsis } | { body?, a, e, i?, raan?, argp?, m0? }): Promise',
		'Put this vessel on rails in that orbit; altitudes in m, angles in rad.'
	),
	fn(
		'setLocation',
		"debug.setLocation({ kind: 'surface' | 'air' | 'site', ... }): Promise",
		'Put this vessel landed somewhere, or in the air at an altitude and speed.'
	),
	fn(
		'setResource',
		'debug.setResource({ part?, resource?, fraction? | amount? }): Promise',
		'Fill, empty or set a tank: every part and resource unless named.'
	),
	fn(
		'setTemperature',
		'debug.setTemperature({ part?, temperature }): Promise',
		'Set the skin temperature of a part, or every part, in kelvin.'
	),
	fn(
		'setCheat',
		'debug.setCheat(cheat, on = true): Promise',
		"Switch a cheat such as 'infinite-fuel' or 'no-crash-damage'."
	),
	fn('log', 'debug.log(...values)', 'Write a line marked [debug] to the panel log.')
];

/** Members of `ship`. */
export const SHIP: readonly ApiEntry[] = [
	value('throttle', 'number 0..1', 'Engine throttle; assign to set it.', true),
	value(
		'attitude',
		'{ pitch, yaw, roll }',
		'Steering demand for the reaction wheels, each -1..1.',
		true
	),
	value(
		'sas',
		"'off' | 'hold' | 'prograde' | ...",
		'Stability assist mode; assign to change it.',
		true
	),
	value('t', 'number', 'Simulation time, s.'),
	value('mode', "'flight' | 'on-rails'", 'Coasting or parked on rails, or in flight.'),
	value('body', 'string', 'Id of the body whose influence you are in.'),
	value('bodyRadius', 'number', 'Radius of that body, m.'),
	value('mu', 'number', 'Gravitational parameter of that body, m^3/s^2.'),
	value('position', '{ x, y, z }', 'Relative to the body centre, m, inertial axes.'),
	value('velocity', '{ x, y, z }', 'Relative to the body, m/s, inertial axes.'),
	value('altitude', 'number', 'Height above the body sphere, m.'),
	value('speed', 'number', 'Length of velocity, m/s.'),
	value('up', '{ x, y, z }', 'Unit vector away from the body centre.'),
	value('orientation', '{ x, y, z, w }', 'Rotation quaternion of the root part.'),
	value('nose', '{ x, y, z }', 'The direction the engines push, inertial axes.'),
	value('mass', 'number', 'Current mass in kg, propellant included.'),
	value('inertia', 'number', 'Estimated transverse moment of inertia, kg m^2.'),
	value(
		'orbit',
		'{ a, e, i, raan, argp, m0, epoch } | null',
		'Orbital elements, or null without an orbit.'
	),
	value('apoapsis', 'number | null', 'Apoapsis altitude, m.'),
	value('periapsis', 'number | null', 'Periapsis altitude, m.'),
	value('eccentricity', 'number | null', 'Orbital eccentricity.'),
	value('parts', '[{ id, definition, position, mass, modules }]', 'Every part of the vessel.'),
	value(
		'engines',
		'[{ part, module, thrust, ispVacuum, ispSeaLevel, ignited, throttle, flameout }]',
		'The engines still attached.'
	),
	value('wheels', '[{ part, module, torque, enabled }]', 'The reaction wheels still attached.'),
	value(
		'nodes',
		'[{ id, time, prograde, normal, radial, dv, body, vector }]',
		'Maneuver nodes in time order; the burn that is left.'
	),
	value(
		'target',
		'{ kind, id, name, position, velocity, distance, relativeSpeed, approach } | null',
		'The target and where it is relative to you.'
	),
	value('targets', '[{ kind, id, name }]', 'Every body and other vessel you could target.'),
	value(
		'science',
		'{ situation, experiments: [{ part, experiment, state, reason, progress }] }',
		'The science situation and each experiment aboard: READY, RUNNING, PAUSED or INVALID.'
	),
	value('refusals', '[{ command, reason }]', 'Commands the game refused since the last tick.')
];

/** `ship` members the editor knows, by name. */
export const SHIP_NAMES: ReadonlySet<string> = new Set(SHIP.map((e) => e.name));
/** Global API names (what the highlighter colours). */
export const GLOBAL_NAMES: ReadonlySet<string> = new Set(GLOBALS.map((e) => e.name));
/** Members of `ship` a script may assign. */
export const SHIP_WRITABLE: ReadonlySet<string> = new Set(
	SHIP.filter((e) => e.writable).map((e) => e.name)
);

// ---- Members below the top level (plan 058) ------------------------------------------------------

const field = (name: string, signature: string, doc: string): ApiEntry => ({
	name,
	signature,
	doc,
	kind: 'value'
});

const VEC3: readonly ApiEntry[] = [
	field('x', 'number', 'First inertial axis, in the unit of the vector.'),
	field('y', 'number', 'Second inertial axis; +Y is the vessel nose at launch.'),
	field('z', 'number', 'Third inertial axis (right-handed).')
];
const ORBIT: readonly ApiEntry[] = [
	field('a', 'number', 'Semi-major axis, m (negative on a hyperbola).'),
	field('e', 'number', 'Eccentricity.'),
	field('i', 'number', 'Inclination, rad.'),
	field('raan', 'number', 'Longitude of the ascending node, rad.'),
	field('argp', 'number', 'Argument of periapsis, rad.'),
	field('m0', 'number', 'Mean anomaly at the epoch, rad.'),
	field('epoch', 'number', 'Simulation time of m0, s.')
];
const RELATIVE_APPROACH: readonly ApiEntry[] = [
	field('time', 'number', 'Simulation time of the closest approach, s.'),
	field('distance', 'number', 'Distance at the closest approach, m.'),
	field('relativeSpeed', 'number', 'Relative speed at the closest approach, m/s.')
];

/**
 * The members of the nested objects of the script API, by the path that leads to them. A path is the
 * chain as written with every index replaced by `[]`: `ship.nodes[0].vector` is `ship.nodes[].vector`.
 * `script-api-members.test.ts` runs a real script and fails when a table and the sandbox disagree.
 */
export const MEMBERS: Readonly<Record<string, readonly ApiEntry[]>> = {
	'ship.position': VEC3,
	'ship.velocity': VEC3,
	'ship.up': VEC3,
	'ship.nose': VEC3,
	'ship.orientation': [...VEC3, field('w', 'number', 'Scalar part of the rotation quaternion.')],
	'ship.attitude': [
		field('pitch', 'number -1..1', 'Pitch demand for the reaction wheels.'),
		field('yaw', 'number -1..1', 'Yaw demand for the reaction wheels.'),
		field('roll', 'number -1..1', 'Roll demand for the reaction wheels.')
	],
	'ship.orbit': ORBIT,
	'ship.parts[]': [
		field('id', 'number', 'Part instance id, the `part` argument of action().'),
		field('definition', 'string', 'Definition id, e.g. stock.engine-lv.'),
		field('position', '{ x, y, z }', 'Relative to the vessel root, m.'),
		field('mass', 'number', 'Dry mass, kg.'),
		field('modules', 'object', 'State of each module of the part, by module id.')
	],
	'ship.parts[].position': VEC3,
	'ship.engines[]': [
		field('part', 'number', 'Part instance id.'),
		field('module', 'string', 'Module id, the `module` argument of action().'),
		field('thrust', 'number', 'Vacuum thrust at full throttle, N.'),
		field('ispVacuum', 'number', 'Specific impulse in vacuum, s.'),
		field('ispSeaLevel', 'number', 'Specific impulse at sea level, s.'),
		field('ignited', 'boolean', 'The engine is burning.'),
		field('throttle', 'number', 'Throttle the engine reports, 0..1.'),
		field('flameout', 'boolean', 'The engine stopped for lack of propellant.')
	],
	'ship.science': [
		field(
			'situation',
			'string | null',
			'Science situation, e.g. stock.landed; null without experiments.'
		),
		field('experiments', 'array', 'Each experiment module aboard.')
	],
	'ship.science.experiments[]': [
		field('part', 'number', 'Part instance id, the argument of runExperiment().'),
		field('experiment', 'string', 'Experiment id, e.g. stock.temperature.'),
		field('state', 'string', 'READY, RUNNING, PAUSED or INVALID.'),
		field('reason', 'string | null', 'Why it is PAUSED or INVALID.'),
		field('progress', 'number', 'Run progress, 0..1.')
	],
	'ship.wheels[]': [
		field('part', 'number', 'Part instance id.'),
		field('module', 'string', 'Module id, the `module` argument of action().'),
		field('torque', 'number', 'Maximum torque per axis, N m.'),
		field('enabled', 'boolean', 'The wheel is switched on.')
	],
	'ship.nodes[]': [
		field('id', 'number', 'Node id, the first argument of setNode and removeNode.'),
		field('time', 'number', 'Simulation time of the burn, s.'),
		field('prograde', 'number', 'Burn left along the velocity, m/s.'),
		field('normal', 'number', 'Burn left along r x v, m/s.'),
		field('radial', 'number', 'Burn left along prograde x normal, m/s.'),
		field('dv', 'number', 'Size of the burn that is left, m/s.'),
		field('body', 'string | null', 'Body whose influence the node is in.'),
		field(
			'vector',
			'{ x, y, z } | null',
			'The burn in inertial axes, m/s; null if the path never reaches it.'
		)
	],
	'ship.nodes[].vector': VEC3,
	'ship.target': [
		field('kind', "'body' | 'vessel'", 'What kind of target it is.'),
		field('id', 'string | number', 'Body id, or vessel id.'),
		field('name', 'string', 'Display name of the target.'),
		field('position', '{ x, y, z }', 'Target minus ship, m, inertial axes.'),
		field('velocity', '{ x, y, z }', 'Target minus ship, m/s, inertial axes.'),
		field('distance', 'number', 'Distance to the target, m.'),
		field('relativeSpeed', 'number', 'Speed relative to the target, m/s.'),
		field(
			'approach',
			'{ time, distance, relativeSpeed } | null',
			'Closest approach within the next orbit.'
		)
	],
	'ship.target.position': VEC3,
	'ship.target.velocity': VEC3,
	'ship.target.approach': RELATIVE_APPROACH,
	'ship.targets[]': [
		field('kind', "'body' | 'vessel'", 'What kind of target it is.'),
		field('id', 'string | number', 'Body id, or vessel id.'),
		field('name', 'string', 'Display name.')
	],
	'ship.refusals[]': [
		field('command', 'string', 'The command the game refused.'),
		field('reason', 'string', 'Why it was refused.')
	],
	'bodies[]': [
		field('id', 'string', 'Body id.'),
		field('radius', 'number', 'Radius, m.'),
		field('mass', 'number', 'Mass, kg.'),
		field('mu', 'number', 'Gravitational parameter, m^3/s^2.'),
		field('rotationPeriod', 'number', 'Rotation period, s.'),
		field(
			'atmosphere',
			'{ scaleHeight, surfacePressure, height } | undefined',
			'Absent on a body without air.'
		),
		field('parent', 'string | undefined', 'Id of the body it orbits; absent for the root.'),
		field(
			'orbit',
			'{ a, e, i, raan, argp, m0, epoch } | undefined',
			'Orbit around the parent; absent for the root.'
		),
		{
			name: 'state',
			signature: "state(t, frame = 'parent')",
			doc: 'Position and velocity at simulation time t, relative to the parent or the system centre.',
			kind: 'function'
		}
	],
	'bodies[].atmosphere': [
		field('scaleHeight', 'number', 'Height over which the pressure falls by e, m.'),
		field('surfacePressure', 'number', 'Pressure at the surface, Pa.'),
		field('height', 'number', 'Height of the atmosphere, m.')
	],
	'bodies[].orbit': ORBIT
};

/** Keys of the object literal given to `addNode` and `setNode`. */
export const NODE_FIELDS: readonly ApiEntry[] = [
	{ ...field('time', 'number', 'Simulation time of the burn, s.'), insert: 'time: ' },
	{ ...field('prograde', 'number', 'Burn along the velocity, m/s.'), insert: 'prograde: ' },
	{ ...field('normal', 'number', 'Burn along r x v, m/s.'), insert: 'normal: ' },
	{ ...field('radial', 'number', 'Burn along prograde x normal, m/s.'), insert: 'radial: ' }
];
