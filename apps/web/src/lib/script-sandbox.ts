/**
 * Page side of the script sandbox (ADR 0038). `open()` makes a fresh `<iframe sandbox="allow-scripts">`
 * (opaque origin, no network by its own CSP), starts the script Worker in it and returns the
 * MessagePort whose other end the page transfers to the sim Worker with `script-start`. `close()`
 * removes the iframe, which kills the Worker in it: that is the hard stop for a script that is
 * stuck inside a native builtin, and it needs only the (live) main thread.
 *
 * Dependencies (the iframe, the assets) are injected so the lifecycle is testable without a DOM;
 * `script-sandbox-web.ts` wires the real ones.
 */
import { isContained, type ContainmentReport, type Sentinel } from './script-sandbox-probe';
import type { SandboxEvent, SandboxInit } from './script-sandbox-frame';

/** The `sandbox` attribute of the iframe: scripts only. Never add `allow-same-origin` (ADR 0038). */
export const SANDBOX_ATTRIBUTE = 'allow-scripts';
/** The iframe must report back within this, ms. */
export const SANDBOX_START_TIMEOUT_MS = 8_000;

export interface SandboxAssets {
	/** Text of the bundled script Worker. */
	workerSource: string;
	/** QuickJS `.wasm` bytes; each Run gets a copy. */
	wasm: ArrayBuffer;
	/** The iframe's `srcdoc` (`buildSandboxDocument`). */
	document: string;
}

export interface SandboxFrameHandle {
	/** Resolves when the iframe document has loaded (its bootstrap script has run). */
	readonly loaded: Promise<void>;
	post(message: SandboxInit, transfer: Transferable[]): void;
	/** Events from the iframe (already filtered to this iframe's window). */
	onEvent(listener: (data: unknown) => void): void;
	remove(): void;
}

export interface ScriptSandboxDeps {
	createFrame(document: string): SandboxFrameHandle;
	loadAssets(): Promise<SandboxAssets>;
	/** A URL in the game origin for the containment self-test. */
	probeUrl: string;
	/**
	 * Plant data in the game origin for the self-test to look for (a cookie, a cache); `remove`
	 * takes it away again once both reports are in. Optional: without it the self-test is stricter
	 * and, in a browser that answers instead of throwing (WebKit), reports "reachable".
	 */
	plantSentinel?(): Promise<{ sentinel: Sentinel; remove(): void }>;
	startTimeoutMs?: number;
}

/** What the page knows about the sandbox it last started. */
export interface SandboxStatus {
	state: 'none' | 'starting' | 'started' | 'failed';
	reports: ContainmentReport[];
	error?: string;
	/** Every context opaque and nothing reachable (needs both the frame and the worker report). */
	contained: boolean;
}

export interface ScriptSandbox {
	/** Start a fresh sandbox (closing the previous one) and return the port for the sim Worker. */
	open(): Promise<MessagePort>;
	/** Remove the iframe (and with it the Worker). Idempotent. */
	close(): void;
	readonly status: SandboxStatus;
	onStatus(listener: (status: SandboxStatus) => void): () => void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseEvent(data: unknown): SandboxEvent | null {
	if (!isRecord(data)) return null;
	if (data.kind === 'sandbox-started') return { kind: 'sandbox-started' };
	if (data.kind === 'sandbox-error' && typeof data.message === 'string') {
		return { kind: 'sandbox-error', message: data.message };
	}
	if (
		data.kind === 'sandbox-report' &&
		isRecord(data.report) &&
		(data.report.context === 'frame' || data.report.context === 'worker') &&
		typeof data.report.origin === 'string' &&
		typeof data.report.opaque === 'boolean' &&
		isRecord(data.report.probes)
	) {
		return data as unknown as SandboxEvent;
	}
	return null;
}

export function createScriptSandbox(deps: ScriptSandboxDeps): ScriptSandbox {
	const listeners = new Set<(status: SandboxStatus) => void>();
	let frame: SandboxFrameHandle | null = null;
	let generation = 0;
	let assets: Promise<SandboxAssets> | null = null;
	let state: SandboxStatus['state'] = 'none';
	let reports: ContainmentReport[] = [];
	let error: string | undefined;
	let planted: { remove(): void } | null = null;
	const unplant = (): void => {
		const current = planted;
		planted = null;
		current?.remove();
	};

	const snapshot = (): SandboxStatus => ({
		state,
		reports,
		...(error === undefined ? {} : { error }),
		// Contained means both contexts have reported and everything is shut.
		contained:
			state === 'started' &&
			reports.some((r) => r.context === 'frame') &&
			reports.some((r) => r.context === 'worker') &&
			isContained(reports)
	});
	const publish = (): void => {
		const status = snapshot();
		for (const listener of listeners) listener(status);
	};
	const set = (next: SandboxStatus['state'], why?: string): void => {
		state = next;
		error = why;
		publish();
	};

	function close(): void {
		unplant();
		generation += 1;
		frame?.remove();
		frame = null;
	}

	return {
		async open() {
			close();
			const mine = generation;
			reports = [];
			set('starting');
			try {
				assets ??= deps.loadAssets();
				const loaded = await assets.catch((e: unknown) => {
					assets = null; // retry on the next Run
					throw e;
				});
				if (mine !== generation) throw new Error('the sandbox was closed while starting');
				const created = deps.createFrame(loaded.document);
				frame = created;
				const channel = new MessageChannel();
				const started = new Promise<void>((resolve, reject) => {
					const timer = setTimeout(
						() => reject(new Error('the script sandbox did not start')),
						deps.startTimeoutMs ?? SANDBOX_START_TIMEOUT_MS
					);
					created.onEvent((data) => {
						if (mine !== generation) return;
						const event = parseEvent(data);
						if (!event) return;
						if (event.kind === 'sandbox-started') {
							clearTimeout(timer);
							resolve();
						} else if (event.kind === 'sandbox-error') {
							clearTimeout(timer);
							reject(new Error(event.message));
							set('failed', event.message);
						} else {
							reports = [
								...reports.filter((r) => r.context !== event.report.context),
								event.report
							];
							publish();
							if (
								reports.some((r) => r.context === 'frame') &&
								reports.some((r) => r.context === 'worker')
							) {
								unplant();
							}
						}
					});
				});
				// A rejection on a sandbox that was closed meanwhile must not surface as unhandled.
				started.catch(() => {});
				await created.loaded;
				unplant();
				const plant = await deps.plantSentinel?.().catch(() => undefined);
				if (mine !== generation) {
					plant?.remove();
					throw new Error('the sandbox was closed while starting');
				}
				planted = plant ?? null;
				const wasm = loaded.wasm.slice(0);
				created.post(
					{
						kind: 'sandbox-init',
						workerSource: loaded.workerSource,
						wasm,
						port: channel.port2,
						probeUrl: deps.probeUrl,
						...(plant === undefined ? {} : { sentinel: plant.sentinel })
					},
					[channel.port2, wasm]
				);
				await started;
				if (mine !== generation) throw new Error('the sandbox was closed while starting');
				set('started');
				return channel.port1;
			} catch (e) {
				if (mine === generation) {
					close();
					set('failed', e instanceof Error ? e.message : String(e));
				}
				throw e;
			}
		},
		close() {
			close();
			if (state === 'starting' || state === 'started') set('none');
		},
		get status() {
			return snapshot();
		},
		onStatus(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
