/**
 * Sim-Worker side of the script Worker (ADR 0031): one session per Run. It sends the controlled
 * vessel's snapshot while the script Worker is idle (never queues: a busy script just sees fewer
 * snapshots), passes results on, and kills the Worker when it boots too slowly or stops answering.
 * The channel never blocks: all it does per sim tick is a `postMessage` and two clock reads.
 */
import type { Snapshot } from '@orbital/core';
import type { CommandVerdict, ScriptEnvironment } from '@orbital/scripting';
import {
	parseFromScriptWorker,
	type FromScriptWorker,
	type ScriptWorkerLike
} from './script-protocol';

/** A script tick answered later than this, ms of wall time, gets its Worker terminated. */
export const SCRIPT_WATCHDOG_MS = 500;
/** The script Worker must report `ready` within this, ms (it loads a 0.5 MB WASM module). */
export const SCRIPT_BOOT_TIMEOUT_MS = 10_000;

export type ScriptResult = Extract<FromScriptWorker, { kind: 'result' }>;

export interface ScriptSessionOptions {
	worker: ScriptWorkerLike;
	now(): number;
	source: string;
	vessel: number;
	budgetMs: number;
	firstTickBudgetMs: number;
	/** Deterministic work budget per tick, interrupt polls; omitted: wall clock only. */
	fuelPolls?: number;
	env: ScriptEnvironment;
	/** The script's saved memory and whether this run resumes it (plan 315, ADR 0273). */
	memory?: Record<string, unknown>;
	resumed?: boolean;
	watchdogMs?: number;
	bootTimeoutMs?: number;
	/** The runner is created; ticks start flowing. */
	onReady(): void;
	/** A tick finished (also the last one: `status` is then not `running`). */
	onResult(result: ScriptResult): void;
	/** The session ended without a result: boot failure, crash, or the Worker stopped answering. */
	onDead(status: 'failed' | 'terminated', error: string): void;
}

export interface ScriptSession {
	/**
	 * Offer the current snapshot (with the host's answers to earlier commands); sent only when the
	 * script Worker is ready and idle. Returns whether it was sent: unsent verdicts must be offered again.
	 */
	tick(snapshot: Snapshot, verdicts?: readonly CommandVerdict[]): boolean;
	/** Check the boot and answer deadlines (called every sim tick, also while paused). */
	poll(): void;
	/** Terminate the Worker. Idempotent; no callback fires afterwards. */
	close(): void;
}

/**
 * What a script's Worker is sent each tick: the controlled vessel in full, and the others without
 * their parts, so the script can list what it may target (`ship.targets`: id and name, plan 035)
 * without the clone paying for part data it never reads. No bodies: their data is static.
 */
export function scriptView(snapshot: Snapshot, vessel: number): Snapshot {
	return {
		t: snapshot.t,
		vessels: snapshot.vessels.map((v) => (Number(v.id) === vessel ? v : { ...v, parts: [] })),
		bodies: []
	};
}

export function createScriptSession(options: ScriptSessionOptions): ScriptSession {
	const { worker, now } = options;
	const watchdogMs = options.watchdogMs ?? SCRIPT_WATCHDOG_MS;
	const bootTimeoutMs = options.bootTimeoutMs ?? SCRIPT_BOOT_TIMEOUT_MS;
	let closed = false;
	let ready = false;
	/** Wall time the unanswered tick was sent at, or null while idle. */
	let inflightSince: number | null = null;
	const bootStarted = now();

	const close = (): void => {
		if (closed) return;
		closed = true;
		worker.onmessage = null;
		worker.onerror = null;
		worker.terminate();
	};
	const die = (status: 'failed' | 'terminated', error: string): void => {
		if (closed) return;
		close();
		options.onDead(status, error);
	};

	worker.onmessage = (event) => {
		if (closed) return;
		const message = parseFromScriptWorker(event.data);
		if (!message) return die('failed', 'script worker sent a malformed message');
		if (message.kind === 'ready') {
			ready = true;
			options.onReady();
		} else if (message.kind === 'boot-failed') {
			die('failed', message.error);
		} else if (message.kind === 'checked') {
			// Answers to syntax checks go to the page's checker, never to a running script's channel.
		} else {
			inflightSince = null;
			options.onResult(message);
			if (message.status !== 'running') close();
		}
	};
	worker.onerror = (event) =>
		die('failed', `script worker crashed: ${event.message ?? 'unknown error'}`);
	worker.postMessage({
		kind: 'start',
		source: options.source,
		vessel: options.vessel,
		budgetMs: options.budgetMs,
		firstTickBudgetMs: options.firstTickBudgetMs,
		...(options.fuelPolls === undefined ? {} : { fuelPolls: options.fuelPolls }),
		env: options.env,
		...(options.memory === undefined ? {} : { memory: options.memory }),
		...(options.resumed === undefined ? {} : { resumed: options.resumed })
	});

	return {
		tick(snapshot, verdicts = []) {
			if (closed || !ready || inflightSince !== null) return false;
			inflightSince = now();
			worker.postMessage({
				kind: 'tick',
				snapshot: scriptView(snapshot, options.vessel),
				...(verdicts.length === 0 ? {} : { verdicts: [...verdicts] })
			});
			return true;
		},
		poll() {
			if (closed) return;
			const at = now();
			if (!ready && at - bootStarted > bootTimeoutMs) {
				die('failed', `script worker did not start within ${bootTimeoutMs} ms`);
			} else if (inflightSince !== null && at - inflightSince > watchdogMs) {
				die(
					'terminated',
					`script stopped responding (no answer within ${watchdogMs} ms); its worker was terminated`
				);
			}
		},
		close
	};
}
