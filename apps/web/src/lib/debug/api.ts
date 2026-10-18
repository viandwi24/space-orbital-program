/**
 * The debug API (plan 203, ADR 0200 point 9): the same sim commands the Debug panel sends, as
 * functions for the panel, the e2e helpers and the console. `window.__orbitalDebug` holds it while
 * the world allows debug tools (Sandbox always, other modes with Debug mode on). Each call resolves
 * with the sim's verdict once a snapshot taken after the change has arrived.
 */
import type {
	BodyDefinition,
	Command,
	CommandResult,
	DebugCheat,
	DebugLocation,
	DebugOrbit,
	DebugSnapshot,
	EntityId,
	Snapshot,
	VesselDesign
} from '@orbital/core';
import { logBuffer, type LogEntry } from '../log-buffer';
import { fromApsides } from './model';

/** What the flight gives the API. */
export interface DebugHost {
	snapshot(): Snapshot | null;
	/** The focused vessel, or null. */
	vessel(): EntityId | null;
	send(command: Command): Promise<CommandResult>;
	onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
	bodies(): readonly BodyDefinition[];
	/** The body the world starts on. */
	home(): string;
}

/** An orbit by apoapsis and periapsis altitudes (m) or by elements; angles in rad, default 0. */
export type OrbitSpec =
	| {
			body?: string;
			apoapsis: number;
			periapsis: number;
			i?: number;
			raan?: number;
			argp?: number;
			m0?: number;
	  }
	| { body?: string; a: number; e?: number; i?: number; raan?: number; argp?: number; m0?: number };

export interface DebugApi {
	state(): DebugSnapshot | null;
	setDebugMode(on: boolean): Promise<CommandResult>;
	setCheat(cheat: DebugCheat, on?: boolean): Promise<CommandResult>;
	grant(what: { funds?: number; science?: number; reputation?: number; tech?: boolean }): Promise<CommandResult>;
	/** The focused vessel (or `vessel`) on rails in `orbit`; with `design`, a new vessel there. */
	setOrbit(
		orbit: OrbitSpec,
		options?: { vessel?: EntityId; design?: VesselDesign }
	): Promise<CommandResult>;
	setLocation(location: DebugLocation, vessel?: EntityId): Promise<CommandResult>;
	setResource(spec: {
		part?: EntityId;
		resource?: string;
		fraction?: number;
		amount?: number;
		vessel?: EntityId;
	}): Promise<CommandResult>;
	setTemperature(spec: { part?: EntityId; temperature: number; vessel?: EntityId }): Promise<CommandResult>;
	setCrewLevel(member: string, level: number): Promise<CommandResult>;
	/** The log's entries, oldest first. */
	log(): readonly LogEntry[];
}

/** How long a call waits for the snapshot that shows its change, ms. */
const SNAPSHOT_WAIT_MS = 3000;

const noVessel: CommandResult = { ok: false, reason: 'no vessel in focus' };

/** Elements for `spec` around its body (the focused vessel's, else home). */
export function orbitOf(spec: OrbitSpec, bodies: readonly BodyDefinition[], fallback: string): DebugOrbit | string {
	const body = bodies.find((b) => b.id === (spec.body ?? fallback));
	if (!body) return `unknown body "${spec.body ?? fallback}"`;
	const shape =
		'apoapsis' in spec
			? fromApsides(body.radius, spec.apoapsis, spec.periapsis)
			: { a: spec.a, e: spec.e ?? 0 };
	return {
		body: body.id as DebugOrbit['body'],
		...shape,
		i: spec.i ?? 0,
		raan: spec.raan ?? 0,
		argp: spec.argp ?? 0,
		m0: spec.m0 ?? 0
	};
}

export function createDebugApi(host: DebugHost): DebugApi {
	/** Send, then wait for a snapshot taken after the sim applied it (a refusal resolves at once). */
	async function apply(command: Command): Promise<CommandResult> {
		const before = host.snapshot()?.t ?? -Infinity;
		const result = await host.send(command);
		logBuffer.add(
			result.ok ? 'info' : 'warn',
			'debug',
			result.ok ? `${command.type} applied` : `${command.type} refused: ${result.reason}`
		);
		if (!result.ok) return result;
		// a paused sim sends no snapshot: give up waiting after a while, the change is applied anyway
		await new Promise<void>((resolve) => {
			const finish = (): void => {
				clearTimeout(timer);
				off();
				resolve();
			};
			const timer = setTimeout(finish, SNAPSHOT_WAIT_MS);
			const off = host.onSnapshot((s) => {
				if (s.t > before) finish();
			});
		});
		return result;
	}
	const focused = (vessel?: EntityId): EntityId | null => vessel ?? host.vessel();
	const bodyOfFocus = (): string => {
		const id = host.vessel();
		const v = id === null ? undefined : host.snapshot()?.vessels.find((x) => x.id === id);
		return v?.soi ?? host.home();
	};

	return {
		state: () => host.snapshot()?.debug ?? null,
		setDebugMode: (on) => apply({ type: 'debug-mode', on }),
		setCheat: (cheat, on = true) => apply({ type: 'debug-cheat', cheat, on }),
		grant: (what) => apply({ type: 'debug-grant', ...what }),
		async setOrbit(spec, options = {}) {
			const orbit = orbitOf(spec, host.bodies(), bodyOfFocus());
			if (typeof orbit === 'string') return { ok: false, reason: orbit };
			if (options.design) return apply({ type: 'debug-set-orbit', design: options.design, orbit });
			const vessel = focused(options.vessel);
			return vessel === null ? noVessel : apply({ type: 'debug-set-orbit', vessel, orbit });
		},
		async setLocation(location, vessel) {
			const id = focused(vessel);
			return id === null ? noVessel : apply({ type: 'debug-set-location', vessel: id, location });
		},
		async setResource({ vessel, ...spec }) {
			const id = focused(vessel);
			return id === null ? noVessel : apply({ type: 'debug-set-resource', vessel: id, ...spec });
		},
		async setTemperature({ vessel, ...spec }) {
			const id = focused(vessel);
			return id === null ? noVessel : apply({ type: 'debug-set-temperature', vessel: id, ...spec });
		},
		setCrewLevel: (member, level) => apply({ type: 'debug-set-crew-level', member, level }),
		log: () => logBuffer.entries()
	};
}

/** The global the e2e helpers and the console use. */
export const DEBUG_GLOBAL = '__orbitalDebug';

/**
 * Keep `target.__orbitalDebug` in step with the world: present while debug tools are allowed.
 * Returns the remover.
 */
export function exposeDebugApi(target: object, api: DebugApi, host: DebugHost): () => void {
	const slot = target as Record<string, unknown>;
	const sync = (s: Snapshot): void => {
		if (s.debug?.allowed) slot[DEBUG_GLOBAL] = api;
		else delete slot[DEBUG_GLOBAL];
	};
	const latest = host.snapshot();
	if (latest) sync(latest);
	const off = host.onSnapshot(sync);
	return () => {
		off();
		delete slot[DEBUG_GLOBAL];
	};
}
