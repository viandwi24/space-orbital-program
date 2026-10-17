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
	fn('wait', 'wait(seconds): Promise', 'Resolve after that much simulation time. Use with await.'),
	fn(
		'waitUntil',
		'waitUntil(fn): Promise',
		'Poll fn every tick until it returns something truthy.'
	),
	fn('nextTick', 'nextTick(): Promise', 'Resolve on the next tick; use it in every loop.'),
	fn('time', 'time(): number', 'Simulation time in seconds.'),
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
