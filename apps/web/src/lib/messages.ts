/**
 * Main thread <-> sim Worker protocol (plain data, structured-clone safe). Commands travel as
 * `unknown`: the sim validates them with `commandSchema` (ADR 0016), the client does not duplicate that.
 */
import type {
	BodyDefinition,
	CommandResult,
	PartDefinition,
	ResourceDefinition,
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

export type ClientMessage =
	| { kind: 'command'; id: number; command: unknown }
	| { kind: 'script-start'; source: string; vessel: number }
	| { kind: 'script-stop' }
	| { kind: 'dispose' };

export type WorkerMessage =
	| ({ kind: 'ready' } & Catalog)
	| { kind: 'snapshot'; snapshot: Snapshot }
	| { kind: 'result'; id: number; result: CommandResult }
	| { kind: 'error'; message: string }
	| {
			kind: 'script-status';
			status: ScriptState;
			error?: string;
			/** Guest time of the last tick and the worst one so far, ms. */
			lastMs: number;
			maxMs: number;
	  }
	| { kind: 'script-log'; lines: string[] }
	/** A stage fired in the sim (`stage:activated`), whoever sent the command: page, autopilot or script. */
	| { kind: 'stage'; vessel: number; stage: number };

const SCRIPT_STATES: readonly unknown[] = [
	'starting',
	'running',
	'finished',
	'failed',
	'terminated',
	'stopped'
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
		case 'error':
			return typeof data.message === 'string' ? (data as unknown as WorkerMessage) : null;
		case 'script-status':
			return SCRIPT_STATES.includes(data.status) &&
				typeof data.lastMs === 'number' &&
				typeof data.maxMs === 'number' &&
				(data.error === undefined || typeof data.error === 'string')
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
		default:
			return null;
	}
}

/** Shallow runtime check of an incoming client message (worker side). */
export function parseClientMessage(data: unknown): ClientMessage | null {
	if (!isRecord(data)) return null;
	if (data.kind === 'dispose') return { kind: 'dispose' };
	if (data.kind === 'script-stop') return { kind: 'script-stop' };
	if (
		data.kind === 'script-start' &&
		typeof data.source === 'string' &&
		typeof data.vessel === 'number'
	) {
		return { kind: 'script-start', source: data.source, vessel: data.vessel };
	}
	if (data.kind === 'command' && typeof data.id === 'number') {
		return { kind: 'command', id: data.id, command: data.command };
	}
	return null;
}
