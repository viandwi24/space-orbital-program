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

export type ClientMessage = { kind: 'command'; id: number; command: unknown } | { kind: 'dispose' };

export type WorkerMessage =
	| ({ kind: 'ready' } & Catalog)
	| { kind: 'snapshot'; snapshot: Snapshot }
	| { kind: 'result'; id: number; result: CommandResult }
	| { kind: 'error'; message: string };

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
		default:
			return null;
	}
}

/** Shallow runtime check of an incoming client message (worker side). */
export function parseClientMessage(data: unknown): ClientMessage | null {
	if (!isRecord(data)) return null;
	if (data.kind === 'dispose') return { kind: 'dispose' };
	if (data.kind === 'command' && typeof data.id === 'number') {
		return { kind: 'command', id: data.id, command: data.command };
	}
	return null;
}
