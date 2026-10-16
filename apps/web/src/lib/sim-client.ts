/** Main-thread wrapper over the sim Worker: typed messages, command round trips, snapshot fan-out. */
import type { Command, CommandResult, Snapshot } from '@orbital/core';
import {
	parseWorkerMessage,
	type Catalog,
	type ClientMessage,
	type WorkerMessage
} from './messages';

/** The slice of `Worker` the client uses, so tests can pass a double. */
export interface WorkerLike {
	postMessage(message: ClientMessage): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string }) => void) | null;
	terminate(): void;
}

/** What the script host reports: lifecycle changes and print output. */
export type ScriptEvent = Extract<WorkerMessage, { kind: 'script-status' | 'script-log' }>;

/** A stage the sim fired. */
export type StageEvent = Extract<WorkerMessage, { kind: 'stage' }>;

export interface SimClient {
	/** Resolves when the worker has booted the sim (rejects on a boot error). */
	readonly ready: Promise<Catalog>;
	/** Send a command; resolves with the sim's verdict (refusals are values, not rejections). */
	dispatch(command: Command | unknown): Promise<CommandResult>;
	/** Latest snapshot received, or null before the first one. */
	readonly latest: Snapshot | null;
	onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
	onError(listener: (message: string) => void): () => void;
	/** Run `source` against `vessel` in the sim Worker (replaces a running script). */
	startScript(source: string, vessel: number): void;
	stopScript(): void;
	onScript(listener: (event: ScriptEvent) => void): () => void;
	onStage(listener: (event: StageEvent) => void): () => void;
	dispose(): void;
}

export function createSimClient(worker: WorkerLike): SimClient {
	let nextId = 1;
	let latest: Snapshot | null = null;
	let isReady = false;
	let disposed = false;
	const pending = new Map<number, (result: CommandResult) => void>();
	const snapshotListeners = new Set<(snapshot: Snapshot) => void>();
	const errorListeners = new Set<(message: string) => void>();
	const scriptListeners = new Set<(event: ScriptEvent) => void>();
	const stageListeners = new Set<(event: StageEvent) => void>();
	let resolveReady!: (catalog: Catalog) => void;
	let rejectReady!: (error: Error) => void;
	const ready = new Promise<Catalog>((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	// A rejection nobody awaits (page left before boot finished) must not be reported as unhandled.
	ready.catch(() => {});

	const fail = (message: string): void => {
		if (!isReady) rejectReady(new Error(message));
		for (const resolve of pending.values()) resolve({ ok: false, reason: message });
		pending.clear();
		for (const listener of errorListeners) listener(message);
	};

	worker.onmessage = (event) => {
		const message: WorkerMessage | null = parseWorkerMessage(event.data);
		if (!message) {
			fail('sim client: malformed message from the worker');
			return;
		}
		switch (message.kind) {
			case 'ready': {
				isReady = true;
				const { kind: _kind, ...catalog } = message;
				resolveReady(catalog);
				break;
			}
			case 'snapshot':
				latest = message.snapshot;
				for (const listener of snapshotListeners) listener(message.snapshot);
				break;
			case 'result': {
				const resolve = pending.get(message.id);
				if (resolve) {
					pending.delete(message.id);
					resolve(message.result);
				}
				break;
			}
			case 'error':
				fail(message.message);
				break;
			case 'script-status':
			case 'script-log':
				for (const listener of scriptListeners) listener(message);
				break;
			case 'stage':
				for (const listener of stageListeners) listener(message);
				break;
		}
	};
	worker.onerror = (event) => fail(event.message ?? 'sim worker crashed');

	return {
		ready,
		dispatch(command) {
			if (disposed) return Promise.resolve({ ok: false, reason: 'the sim client is disposed' });
			const id = nextId++;
			return new Promise<CommandResult>((resolve) => {
				pending.set(id, resolve);
				worker.postMessage({ kind: 'command', id, command });
			});
		},
		get latest() {
			return latest;
		},
		onSnapshot(listener) {
			snapshotListeners.add(listener);
			return () => snapshotListeners.delete(listener);
		},
		onError(listener) {
			errorListeners.add(listener);
			return () => errorListeners.delete(listener);
		},
		startScript(source, vessel) {
			if (!disposed) worker.postMessage({ kind: 'script-start', source, vessel });
		},
		stopScript() {
			if (!disposed) worker.postMessage({ kind: 'script-stop' });
		},
		onScript(listener) {
			scriptListeners.add(listener);
			return () => scriptListeners.delete(listener);
		},
		onStage(listener) {
			stageListeners.add(listener);
			return () => stageListeners.delete(listener);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			worker.postMessage({ kind: 'dispose' });
			worker.terminate();
			for (const resolve of pending.values()) {
				resolve({ ok: false, reason: 'the sim client is disposed' });
			}
			pending.clear();
			snapshotListeners.clear();
			errorListeners.clear();
			scriptListeners.clear();
			stageListeners.clear();
		}
	};
}

/** Starts the real sim Worker (Vite bundles `sim.worker.ts`; the `new URL` form must stay literal). */
export function startSimWorker(): SimClient {
	const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
	let onmessage: WorkerLike['onmessage'] = null;
	let onerror: WorkerLike['onerror'] = null;
	return createSimClient({
		postMessage: (message) => worker.postMessage(message),
		get onmessage() {
			return onmessage;
		},
		set onmessage(handler) {
			onmessage = handler;
			worker.onmessage = handler ? (event: MessageEvent) => handler({ data: event.data }) : null;
		},
		get onerror() {
			return onerror;
		},
		set onerror(handler) {
			onerror = handler;
			worker.onerror = handler ? (event: ErrorEvent) => handler({ message: event.message }) : null;
		},
		terminate: () => worker.terminate()
	});
}
