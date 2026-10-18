/** Main-thread wrapper over the sim Worker: typed messages, command round trips, snapshot fan-out. */
import type { ReplayFile } from '@orbital/core';
import type { Command, CommandResult, SimSave, Snapshot, WorldInfo } from '@orbital/core';
import {
	parseWorkerMessage,
	type Catalog,
	type ClientMessage,
	type WorkerMessage
} from './messages';
import { activeBundles } from './mods/runtime';

/** The slice of `Worker` the client uses, so tests can pass a double. */
export interface WorkerLike {
	postMessage(message: ClientMessage, transfer?: Transferable[]): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	onerror: ((event: { message?: string }) => void) | null;
	terminate(): void;
}

/** What the script host reports: lifecycle changes and print output. */
export type ScriptEvent = Extract<WorkerMessage, { kind: 'script-status' | 'script-log' }>;

/** A stage the sim fired. */
export type StageEvent = Extract<WorkerMessage, { kind: 'stage' }>;

/** Any other sim event forwarded for toasts. */
export type SimEventMessage = Extract<WorkerMessage, { kind: 'sim-event' }>['event'];

export interface SimClient {
	/** Resolves when the worker has booted the sim (rejects on a boot error). */
	readonly ready: Promise<Catalog>;
	/** Send a command; resolves with the sim's verdict (refusals are values, not rejections). */
	dispatch(command: Command | unknown): Promise<CommandResult>;
	/** Latest snapshot received, or null before the first one. */
	readonly latest: Snapshot | null;
	/** Wall time of the sim step behind the latest snapshot, ms; null before the first. */
	readonly stepMs: number | null;
	/** `warp` is the sim's current time warp when the worker reports it. */
	onSnapshot(listener: (snapshot: Snapshot, warp?: number) => void): () => void;
	onError(listener: (message: string) => void): () => void;
	/**
	 * Run `source` against `vessel` (replaces a running script). `port` is the sim Worker's end of
	 * the channel to the script Worker in the sandbox iframe (ADR 0038); it is transferred.
	 */
	startScript(source: string, vessel: number, port: MessagePort): void;
	stopScript(): void;
	onScript(listener: (event: ScriptEvent) => void): () => void;
	onStage(listener: (event: StageEvent) => void): () => void;
	onSimEvent(listener: (event: SimEventMessage) => void): () => void;
	/** Freeze or resume the simulation clock. */
	setPaused(paused: boolean): void;
	/** The whole simulation as plain data (plan 043); rejects with the worker's reason. */
	save(): Promise<SimSave>;
	/** The flight recorded since the sim booted, as a replay file (plan 131); null when not ready. */
	replay(name: string): Promise<ReplayFile | null>;
	dispose(): void;
}

export function createSimClient(worker: WorkerLike): SimClient {
	let nextId = 1;
	let latest: Snapshot | null = null;
	let stepMs: number | null = null;
	let isReady = false;
	let disposed = false;
	const pending = new Map<number, (result: CommandResult) => void>();
	const pendingSaves = new Map<
		number,
		{ resolve: (s: SimSave) => void; reject: (e: Error) => void }
	>();
	const pendingReplays = new Map<number, (replay: ReplayFile | null) => void>();
	const snapshotListeners = new Set<(snapshot: Snapshot, warp?: number) => void>();
	const errorListeners = new Set<(message: string) => void>();
	const scriptListeners = new Set<(event: ScriptEvent) => void>();
	const stageListeners = new Set<(event: StageEvent) => void>();
	const simEventListeners = new Set<(event: SimEventMessage) => void>();
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
		for (const request of pendingSaves.values()) request.reject(new Error(message));
		pendingSaves.clear();
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
				stepMs = message.stepMs ?? null;
				for (const listener of snapshotListeners) listener(message.snapshot, message.warp);
				break;
			case 'result': {
				const resolve = pending.get(message.id);
				if (resolve) {
					pending.delete(message.id);
					resolve(message.result);
				}
				break;
			}
			case 'replay': {
				const resolve = pendingReplays.get(message.id);
				pendingReplays.delete(message.id);
				resolve?.(message.replay);
				break;
			}
			case 'saved': {
				const request = pendingSaves.get(message.id);
				pendingSaves.delete(message.id);
				request?.resolve(message.save);
				break;
			}
			case 'save-error': {
				const request = pendingSaves.get(message.id);
				pendingSaves.delete(message.id);
				request?.reject(new Error(message.message));
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
			case 'sim-event':
				for (const listener of simEventListeners) listener(message.event);
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
		get stepMs() {
			return stepMs;
		},
		onSnapshot(listener) {
			snapshotListeners.add(listener);
			return () => snapshotListeners.delete(listener);
		},
		onError(listener) {
			errorListeners.add(listener);
			return () => errorListeners.delete(listener);
		},
		startScript(source, vessel, port) {
			if (!disposed) worker.postMessage({ kind: 'script-start', source, vessel, port }, [port]);
			else port.close();
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
		onSimEvent(listener) {
			simEventListeners.add(listener);
			return () => simEventListeners.delete(listener);
		},
		setPaused(paused) {
			if (!disposed) worker.postMessage({ kind: 'pause', paused });
		},
		replay(name) {
			if (disposed) return Promise.resolve(null);
			const id = nextId++;
			return new Promise<ReplayFile | null>((resolve) => {
				pendingReplays.set(id, resolve);
				worker.postMessage({ kind: 'replay', id, name });
			});
		},
		save() {
			if (disposed) return Promise.reject(new Error('the sim client is disposed'));
			const id = nextId++;
			return new Promise<SimSave>((resolve, reject) => {
				pendingSaves.set(id, { resolve, reject });
				worker.postMessage({ kind: 'save', id });
			});
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
			for (const request of pendingSaves.values()) {
				request.reject(new Error('the sim client is disposed'));
			}
			pendingSaves.clear();
			for (const resolve of pendingReplays.values()) resolve(null);
			pendingReplays.clear();
			snapshotListeners.clear();
			errorListeners.clear();
			scriptListeners.clear();
			stageListeners.clear();
			simEventListeners.clear();
		}
	};
}

/**
 * Starts the real sim Worker (Vite bundles `sim.worker.ts`; the `new URL` form must stay literal).
 * With `resume` the sim continues that save instead of starting empty (plan 043); a save that
 * cannot be resumed makes `ready` reject with the reason.
 */
export function startSimWorker(
	options: { resume?: SimSave; world?: WorldInfo; ephemeris?: ArrayBuffer } = {}
): SimClient {
	const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
	// The Worker boots on this first message, so a save is in place before the sim is built.
	// It also carries the mods the page decided to run, so both sides load the same set (ADR 0057).
	const mods = activeBundles();
	worker.postMessage(
		{
			kind: 'init',
			...(options.resume === undefined ? {} : { save: options.resume }),
			...(options.world === undefined ? {} : { world: options.world }),
			...(mods.length === 0 ? {} : { mods }),
			...(options.ephemeris === undefined ? {} : { ephemeris: options.ephemeris })
		},
		options.ephemeris ? [options.ephemeris] : []
	);
	let onmessage: WorkerLike['onmessage'] = null;
	let onerror: WorkerLike['onerror'] = null;
	return createSimClient({
		postMessage: (message, transfer) => worker.postMessage(message, transfer ?? []),
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
