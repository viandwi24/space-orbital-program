/**
 * Logic of the sandbox iframe document (ADR 0038), free of `window` so tests can drive it with
 * doubles; `script-sandbox-frame-main.ts` wires it to the real window.
 *
 * The iframe is `<iframe sandbox="allow-scripts">` without `allow-same-origin`: an opaque origin,
 * so no game-origin storage, cookies or IndexedDB, and its own meta CSP forbids every network
 * request. It builds the script Worker from a blob (a blob worker inherits that CSP and the
 * opaque origin), hands it the MessagePort that leads to the sim Worker, and relays only the
 * Worker's self-test report and errors to the page.
 */
import {
	probeContainment,
	type ContainmentReport,
	type ProbeScope,
	type Sentinel
} from './script-sandbox-probe';

/** Page -> iframe, once per iframe. */
export interface SandboxInit {
	kind: 'sandbox-init';
	/** The bundled script Worker (classic script text). */
	workerSource: string;
	/** The QuickJS `.wasm` bytes (the Worker has no network to fetch them). */
	wasm: ArrayBuffer;
	/** Port whose other end is in the sim Worker. */
	port: MessagePort;
	/** A URL in the game origin, for the containment self-test. */
	probeUrl: string;
	/** Names of data the page planted in the game origin for the self-test to look for. */
	sentinel?: Sentinel;
}

/** Iframe -> page. */
export type SandboxEvent =
	| { kind: 'sandbox-started' }
	| { kind: 'sandbox-report'; report: ContainmentReport }
	| { kind: 'sandbox-error'; message: string };

export interface FrameWorker {
	postMessage(message: unknown, transfer: Transferable[]): void;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

export interface FrameEnv {
	/** `window.origin`: the string "null" in a sandbox without `allow-same-origin`. */
	origin: string;
	/** Who may talk to this document: only messages from here are acted on. */
	parent: unknown;
	postToParent(event: SandboxEvent): void;
	/** Build the Worker from script text (a blob URL in the browser). */
	createWorker(source: string): FrameWorker;
	probeScope: ProbeScope;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseSandboxInit(data: unknown): SandboxInit | null {
	if (
		isRecord(data) &&
		data.kind === 'sandbox-init' &&
		typeof data.workerSource === 'string' &&
		data.wasm instanceof ArrayBuffer &&
		data.port instanceof MessagePort &&
		typeof data.probeUrl === 'string' &&
		(data.sentinel === undefined ||
			(isRecord(data.sentinel) &&
				(data.sentinel.cookie === undefined || typeof data.sentinel.cookie === 'string') &&
				(data.sentinel.cache === undefined || typeof data.sentinel.cache === 'string')))
	) {
		return data as unknown as SandboxInit;
	}
	return null;
}

export interface SandboxFrame {
	/** Feed a `message` event of the iframe window. */
	handle(event: { data: unknown; source: unknown }): void;
}

export function createSandboxFrame(env: FrameEnv): SandboxFrame {
	let started = false;
	const fail = (message: string): void => env.postToParent({ kind: 'sandbox-error', message });
	return {
		handle(event) {
			if (started || event.source !== env.parent) return;
			const init = parseSandboxInit(event.data);
			if (!init) return;
			started = true;
			// Fail closed: opened as a normal page (or with allow-same-origin) this document would
			// share the game's origin, so it refuses to run any code.
			if (env.origin !== 'null') {
				return fail('the sandbox frame has the game origin; refusing to run scripts');
			}
			let worker: FrameWorker;
			try {
				worker = env.createWorker(init.workerSource);
			} catch (error) {
				return fail(`cannot start the script worker: ${String(error)}`);
			}
			worker.onmessage = (message) => {
				const data = message.data;
				if (isRecord(data) && data.kind === 'report' && isRecord(data.report)) {
					env.postToParent({
						kind: 'sandbox-report',
						report: data.report as unknown as ContainmentReport
					});
				}
			};
			worker.onerror = (e) => fail(`script worker crashed: ${e.message ?? 'unknown error'}`);
			worker.postMessage(
				{
					kind: 'init',
					port: init.port,
					wasm: init.wasm,
					probeUrl: init.probeUrl,
					...(init.sentinel === undefined ? {} : { sentinel: init.sentinel })
				},
				[init.port, init.wasm]
			);
			env.postToParent({ kind: 'sandbox-started' });
			void probeContainment(env.probeScope, {
				context: 'frame',
				target: init.probeUrl,
				...(init.sentinel === undefined ? {} : { sentinel: init.sentinel })
			}).then((report) => env.postToParent({ kind: 'sandbox-report', report }));
		}
	};
}
