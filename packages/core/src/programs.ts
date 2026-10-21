/**
 * Vessel programs (plan 311, ADR 0272): an engaged autopilot or a running player script flies a
 * vessel; the player takes any control channel back by touching it, and the program resumes it
 * `PROGRAM_RESUME_DELAY` seconds of sim time after the player lets go.
 */

/** The control channels a program and the player share (ADR 0272 point 3). */
export const CONTROL_CHANNELS = [
	'pitch',
	'yaw',
	'roll',
	'translateX',
	'translateY',
	'translateZ',
	'throttle',
	'wheelThrottle'
] as const;
export type ControlChannel = (typeof CONTROL_CHANNELS)[number];

/** Sim seconds after the player lets go of a channel before a program may write it again. */
export const PROGRAM_RESUME_DELAY = 1;

/** Largest saved script source and memory, as UTF-16 code units of the JSON text (ADR 0272 point 6). */
export const SCRIPT_SOURCE_MAX = 65_536;
export const SCRIPT_MEMORY_MAX = 65_536;

/** The vessel snapshot's view of its script (no source or memory: those travel on request). */
export interface ScriptProgramView {
	name: string;
	/** True when this run was restarted from a save rather than started by Run. */
	resumed: boolean;
	/** Sim time the script was attached. */
	startedAt: number;
}

/**
 * Why a value cannot be a script's `memory`, or null: a plain JSON object (no functions, cycles,
 * `undefined` in arrays, non-finite numbers) whose JSON text is at most `SCRIPT_MEMORY_MAX` long.
 */
export function scriptMemoryProblem(memory: unknown): string | null {
	if (memory === null || typeof memory !== 'object' || Array.isArray(memory))
		return 'memory must be a plain object';
	let text: string;
	try {
		text = JSON.stringify(memory);
	} catch {
		return 'memory must be JSON (no cycles or BigInt)';
	}
	if (text.length > SCRIPT_MEMORY_MAX)
		return `memory is ${text.length} characters as JSON, over ${SCRIPT_MEMORY_MAX}`;
	if (!sameJson(memory, JSON.parse(text))) return 'memory must hold only JSON values';
	return null;
}

/** Deep equality of a value and its JSON round trip: catches functions, NaN, Infinity, Dates. */
function sameJson(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b || a === null || b === null) return false;
	if (typeof a !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Object.getPrototypeOf(a) !== Object.prototype && !Array.isArray(a)) return false;
	const ka = Object.keys(a as object);
	const kb = Object.keys(b as object);
	if (ka.length !== kb.length) return false;
	return ka.every((k) =>
		sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
	);
}
