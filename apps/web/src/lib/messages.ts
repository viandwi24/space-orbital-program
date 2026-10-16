/**
 * Main thread <-> sim Worker protocol (plain data, structured-clone safe). Commands travel as
 * `unknown`: the sim validates them with `commandSchema` (ADR 0016), the client does not duplicate that.
 */
import type {
	BodyDefinition,
	CommandResult,
	PartDefinition,
	ResourceDefinition,
	SimSave,
	Snapshot
} from '@orbital/core';

/** Content the worker booted with; the main thread builds part shapes and the VAB palette from it. */
export interface Catalog {
	/** Ids of the booted plugins, in boot order. */
	plugins: string[];
	parts: PartDefinition[];
	bodies: BodyDefinition[];
	resources: ResourceDefinition[];
}

/** Script lifecycle as the page sees it: the runner's statuses plus the two the host adds. */
export type ScriptState = 'starting' | 'running' | 'finished' | 'failed' | 'terminated' | 'stopped';

/** Sim events the page turns into toasts (plan 021). Plain data, one flat union. */
export type SimEvent =
	| { type: 'stage'; vessel: number; stage: number }
	| { type: 'flameout'; part: number }
	| {
			type: 'part-damaged';
			vessel: number;
			part: number;
			definition: string;
			speed: number;
			outcome: 'broken' | 'destroyed';
			cause?: 'impact' | 'overheat';
			temperature?: number;
	  }
	| { type: 'mode-changed'; vessel: number; mode: 'flight' | 'on-rails'; reason: string }
	| { type: 'vessel-destroyed'; vessel: number; reason: string };

/**
 * The page-made end of the channel to the script Worker inside the sandbox iframe (ADR 0038): a
 * `MessagePort` in the browser (transferred with `script-start`), a double in tests.
 */
export interface ScriptPortLike {
	postMessage(message: unknown): void;
	onmessage: ((event: MessageEvent) => void) | null;
	close(): void;
}

export type ClientMessage =
	/**
	 * First message to the sim Worker (plan 043): boots the sim, from `save` when the player loads a
	 * game. `save` is validated by `createSim`, so it travels as `unknown`.
	 */
	| { kind: 'init'; save?: unknown }
	/** Ask for the whole simulation as a `SimSave`; answered with `saved` or `save-error`. */
	| { kind: 'save'; id: number }
	| { kind: 'command'; id: number; command: unknown }
	/** Freeze or resume the simulation clock (the Esc menu); scripts pause with it. */
	| { kind: 'pause'; paused: boolean }
	| { kind: 'script-start'; source: string; vessel: number; port?: ScriptPortLike }
	| { kind: 'script-stop' }
	| { kind: 'dispose' };

export type WorkerMessage =
	| ({ kind: 'ready' } & Catalog)
	| { kind: 'snapshot'; snapshot: Snapshot }
	| { kind: 'result'; id: number; result: CommandResult }
	| { kind: 'saved'; id: number; save: SimSave }
	| { kind: 'save-error'; id: number; message: string }
	| { kind: 'error'; message: string }
	| {
			kind: 'script-status';
			status: ScriptState;
			error?: string;
			/** 1-based line of the script where `error` happened, when the engine said. */
			errorLine?: number;
			/** Guest time of the last tick and the worst one so far, ms. */
			lastMs: number;
			maxMs: number;
	  }
	| { kind: 'script-log'; lines: string[] }
	/** A stage fired in the sim (`stage:activated`), whoever sent the command: page, autopilot or script. */
	| { kind: 'stage'; vessel: number; stage: number }
	/** Other sim events worth a toast (flameout, damage, mode changes, loss). */
	| { kind: 'sim-event'; event: Exclude<SimEvent, { type: 'stage' }> };

const SCRIPT_STATES: readonly unknown[] = [
	'starting',
	'running',
	'finished',
	'failed',
	'terminated',
	'stopped'
];

const SIM_EVENT_TYPES: readonly unknown[] = [
	'flameout',
	'part-damaged',
	'mode-changed',
	'vessel-destroyed'
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Shallow runtime check of an incoming worker message; the payloads come from our own worker. */
export function parseWorkerMessage(data: unknown): WorkerMessage | null {
	if (!isRecord(data)) return null;
	switch (data.kind) {
		case 'ready':
			return Array.isArray(data.plugins) &&
				Array.isArray(data.parts) &&
				Array.isArray(data.bodies) &&
				Array.isArray(data.resources)
				? (data as unknown as WorkerMessage)
				: null;
		case 'snapshot':
			return isRecord(data.snapshot) && typeof data.snapshot.t === 'number'
				? (data as unknown as WorkerMessage)
				: null;
		case 'result':
			return typeof data.id === 'number' && isRecord(data.result) && 'ok' in data.result
				? (data as unknown as WorkerMessage)
				: null;
		case 'saved':
			return typeof data.id === 'number' && isRecord(data.save)
				? (data as unknown as WorkerMessage)
				: null;
		case 'save-error':
			return typeof data.id === 'number' && typeof data.message === 'string'
				? (data as unknown as WorkerMessage)
				: null;
		case 'error':
			return typeof data.message === 'string' ? (data as unknown as WorkerMessage) : null;
		case 'script-status':
			return SCRIPT_STATES.includes(data.status) &&
				typeof data.lastMs === 'number' &&
				typeof data.maxMs === 'number' &&
				(data.error === undefined || typeof data.error === 'string') &&
				(data.errorLine === undefined ||
					(typeof data.errorLine === 'number' &&
						Number.isInteger(data.errorLine) &&
						data.errorLine >= 1))
				? (data as unknown as WorkerMessage)
				: null;
		case 'script-log':
			return Array.isArray(data.lines) && data.lines.every((l) => typeof l === 'string')
				? (data as unknown as WorkerMessage)
				: null;
		case 'stage':
			return typeof data.vessel === 'number' &&
				typeof data.stage === 'number' &&
				Number.isInteger(data.stage) &&
				data.stage >= 0
				? (data as unknown as WorkerMessage)
				: null;
		case 'sim-event':
			return isRecord(data.event) && SIM_EVENT_TYPES.includes(data.event.type)
				? (data as unknown as WorkerMessage)
				: null;
		default:
			return null;
	}
}

/** Shallow runtime check of an incoming client message (worker side). */
export function parseClientMessage(data: unknown): ClientMessage | null {
	if (!isRecord(data)) return null;
	if (data.kind === 'dispose') return { kind: 'dispose' };
	if (data.kind === 'init') {
		return data.save === undefined ? { kind: 'init' } : { kind: 'init', save: data.save };
	}
	if (data.kind === 'save' && typeof data.id === 'number') return { kind: 'save', id: data.id };
	if (data.kind === 'script-stop') return { kind: 'script-stop' };
	if (data.kind === 'pause' && typeof data.paused === 'boolean') {
		return { kind: 'pause', paused: data.paused };
	}
	if (
		data.kind === 'script-start' &&
		typeof data.source === 'string' &&
		typeof data.vessel === 'number'
	) {
		if (data.port === undefined) {
			return { kind: 'script-start', source: data.source, vessel: data.vessel };
		}
		if (
			isRecord(data.port) &&
			typeof data.port.postMessage === 'function' &&
			typeof data.port.close === 'function'
		) {
			return {
				kind: 'script-start',
				source: data.source,
				vessel: data.vessel,
				port: data.port as unknown as ScriptPortLike
			};
		}
		return null;
	}
	if (data.kind === 'command' && typeof data.id === 'number') {
		return { kind: 'command', id: data.id, command: data.command };
	}
	return null;
}
