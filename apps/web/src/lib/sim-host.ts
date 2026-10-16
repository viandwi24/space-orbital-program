/**
 * Worker-side host of the sim: owns the clock, steps the sim from wall time, answers commands and
 * streams snapshots. Kept free of `self`/`postMessage` so Node tests drive it with a mock `post`;
 * `sim.worker.ts` wires it to the real worker scope.
 */
import type { Command } from '@orbital/core';
import type { Sim } from '@orbital/sim';
import {
	parseClientMessage,
	type Catalog,
	type ScriptPortLike,
	type ScriptState,
	type WorkerMessage
} from './messages';
import { createScriptSession, type ScriptResult, type ScriptSession } from './script-channel';
import type { ScriptWorkerLike } from './script-protocol';

/** Largest wall delta handed to `sim.step`, s: a stalled tab must not trigger a burst of steps. */
export const MAX_WALL_DELTA = 0.1;
/** Loop period, ms (about 60 Hz; browsers may clamp it). */
export const TICK_MS = 16;
/**
 * Wall-clock budget of one script tick, ms (the runner terminates the script past it; ADR 0020).
 * 10 ms until plan 030. The script no longer runs on the sim's thread (ADR 0031), so the budget
 * only bounds a runaway, and a wall-clock budget is load-sensitive: a 0.4 ms sample tick spiked
 * to 23.8, 45.3 and 220.3 ms on a busy machine with software rendering and was killed for it
 * (journal 030, ADR 0038). Stays below the channel watchdog (500 ms).
 */
export const SCRIPT_BUDGET_MS = 200;
/**
 * Budget of a script's first tick, ms: a cold QuickJS can overrun the budget for a harmless script on a
 * loaded machine (journal 017/018). Stays below the channel watchdog (500 ms).
 */
export const SCRIPT_FIRST_TICK_BUDGET_MS = 300;
/** While a script runs, its timing is reported at most this often, ms. */
export const SCRIPT_STATUS_MS = 500;
/** Lines of print output and refusals forwarded per tick; the rest of a flood is dropped. */
export const MAX_LOG_LINES_PER_TICK = 50;

export interface SimHostOptions {
	createSim(): Promise<Sim>;
	post(message: WorkerMessage): void;
	/** Wall clock in ms (`performance.now`). */
	now(): number;
	/** Schedules `tick` repeatedly; returns a canceller. Tests leave it out and call `tick` themselves. */
	schedule?(tick: () => void, periodMs: number): () => void;
	/**
	 * The script Worker for one Run (ADR 0031): in the browser, an adapter over the `port` the page
	 * sent with `script-start`, whose other end is the Worker in the sandbox iframe (ADR 0038).
	 * Without it, or without a port where one is needed, `script-start` is answered with a
	 * `failed` status.
	 */
	spawnScriptWorker?(port: ScriptPortLike | undefined): ScriptWorkerLike;
	/** Overrides of the per-tick script budgets, ms (tests of plumbing must not depend on machine speed). */
	scriptBudgetMs?: number;
	scriptFirstTickBudgetMs?: number;
	/** Overrides of the channel deadlines, ms (tests). */
	scriptWatchdogMs?: number;
	scriptBootTimeoutMs?: number;
}

export interface SimHost {
	/** Boot the sim, post `ready`, start the loop. */
	start(): Promise<void>;
	/** Handle one raw message from the main thread. */
	handle(data: unknown): void;
	/** One loop iteration: step by the wall time since the last one and post a snapshot. */
	tick(): void;
	dispose(): void;
}

export function catalogOf(sim: Sim): Catalog {
	return {
		plugins: [...sim.report.order],
		parts: sim.registries.parts.list(),
		bodies: sim.registries.bodies.list(),
		resources: sim.registries.resources.list()
	};
}

export function createSimHost(options: SimHostOptions): SimHost {
	let sim: Sim | null = null;
	let last = 0;
	let cancel: (() => void) | null = null;
	let disposed = false;
	let unsubscribeEvents: (() => void)[] = [];
	let paused = false;

	// --- script (plan 018, ADR 0031): the runner lives in its own Worker, fed after each sim step --
	let session: ScriptSession | null = null;
	/** The vessel the running script controls; commands for any other are dropped. */
	let scriptVessel = -1;
	let lastMs = 0;
	let maxMs = 0;
	let lastStatusAt = 0;
	let lines: string[] = [];
	let lastRefusal = '';

	const postStatus = (status: ScriptState, error?: string, errorLine?: number): void => {
		lastStatusAt = options.now();
		options.post({
			kind: 'script-status',
			status,
			...(error === undefined ? {} : { error }),
			...(errorLine === undefined ? {} : { errorLine }),
			lastMs,
			maxMs
		});
	};
	const flushLines = (): void => {
		if (lines.length === 0) return;
		const out = lines.slice(0, MAX_LOG_LINES_PER_TICK);
		if (lines.length > out.length) out.push(`... ${lines.length - out.length} more lines dropped`);
		lines = [];
		options.post({ kind: 'script-log', lines: out });
	};
	const endScript = (): void => {
		session?.close();
		session = null;
	};
	/** Commands a script may issue (what the runner builds); the Worker is not trusted to stay within them. */
	const SCRIPT_COMMANDS: readonly string[] = ['throttle', 'attitude', 'stage', 'action'];
	const allowed = (command: Command): boolean =>
		SCRIPT_COMMANDS.includes(command.type) &&
		'vessel' in command &&
		Number(command.vessel) === scriptVessel;

	function onScriptResult(active: ScriptSession, result: ScriptResult): void {
		if (active !== session || !sim) return;
		lastMs = result.elapsedMs;
		maxMs = Math.max(maxMs, result.elapsedMs);
		lines.push(...result.lines);
		for (const command of result.commands) {
			if (!allowed(command)) {
				lines.push(`! ${String((command as { type?: unknown }).type)}: not allowed for scripts`);
				continue;
			}
			const verdict = sim.dispatch(command);
			if (!verdict.ok) {
				const text = `! ${command.type}: ${verdict.reason}`;
				if (text !== lastRefusal) lines.push(text);
				lastRefusal = text;
			}
		}
		flushLines();
		if (result.status !== 'running') {
			session = null; // the session closed itself
			postStatus(result.status, result.error, result.errorLine);
		} else if (options.now() - lastStatusAt >= SCRIPT_STATUS_MS) {
			postStatus('running');
		}
	}

	function startScript(source: string, vessel: number, port: ScriptPortLike | undefined): void {
		endScript();
		lastMs = 0;
		maxMs = 0;
		lines = [];
		lastRefusal = '';
		// A port that is not used must not stay open in the sandbox.
		const refuse = (why: string): void => {
			port?.close();
			postStatus('failed', why);
		};
		if (!sim) return refuse('the simulation is not ready yet');
		if (!options.spawnScriptWorker) return refuse('scripting is not available');
		if (!sim.snapshot().vessels.some((v) => Number(v.id) === vessel)) {
			return refuse(`vessel ${vessel} does not exist`);
		}
		postStatus('starting');
		scriptVessel = vessel;
		let created: ScriptSession;
		try {
			created = createScriptSession({
				worker: options.spawnScriptWorker(port),
				now: options.now,
				source,
				vessel,
				budgetMs: options.scriptBudgetMs ?? SCRIPT_BUDGET_MS,
				firstTickBudgetMs: options.scriptFirstTickBudgetMs ?? SCRIPT_FIRST_TICK_BUDGET_MS,
				env: {
					bodies: sim.registries.bodies.list(),
					parts: sim.registries.parts.list(),
					resources: sim.registries.resources.list()
				},
				...(options.scriptWatchdogMs === undefined ? {} : { watchdogMs: options.scriptWatchdogMs }),
				...(options.scriptBootTimeoutMs === undefined
					? {}
					: { bootTimeoutMs: options.scriptBootTimeoutMs }),
				onReady: () => {
					if (created === session) postStatus('running');
				},
				onResult: (result) => onScriptResult(created, result),
				onDead: (status, error) => {
					if (created !== session) return;
					session = null;
					flushLines();
					postStatus(status, error);
				}
			});
		} catch (error) {
			return refuse(error instanceof Error ? error.message : String(error));
		}
		session = created;
	}

	function stopScript(): void {
		endScript();
		lines = [];
		postStatus('stopped');
	}

	const fail = (error: unknown): void => {
		options.post({
			kind: 'error',
			message: error instanceof Error ? error.message : String(error)
		});
	};

	function tick(): void {
		if (!sim) return;
		try {
			const now = options.now();
			const delta = Math.min(Math.max((now - last) / 1000, 0), MAX_WALL_DELTA);
			last = now;
			// Paused: the clock moves on (resuming must not burst) but nothing steps or ticks.
			if (!paused) sim.step(delta);
			const snapshot = sim.snapshot();
			session?.poll();
			if (!paused) session?.tick(snapshot);
			options.post({ kind: 'snapshot', snapshot });
		} catch (error) {
			// A throwing sim is not recoverable mid-step: stop the loop and report.
			cancel?.();
			cancel = null;
			fail(error);
		}
	}

	function dispose(): void {
		disposed = true;
		endScript();
		cancel?.();
		cancel = null;
		for (const off of unsubscribeEvents) off();
		unsubscribeEvents = [];
		sim?.dispose();
		sim = null;
	}

	return {
		async start() {
			try {
				const created = await options.createSim();
				if (disposed) {
					created.dispose();
					return;
				}
				sim = created;
				// The page's stage counter follows what the sim fired, not what the page asked for.
				unsubscribeEvents = [
					created.events.on('stage:activated', (e) =>
						options.post({ kind: 'stage', vessel: Number(e.vessel), stage: e.stage })
					),
					created.events.on('stock:engine-flameout', (e) =>
						options.post({ kind: 'sim-event', event: { type: 'flameout', part: Number(e.part) } })
					),
					created.events.on('part:damaged', (e) =>
						options.post({
							kind: 'sim-event',
							event: {
								type: 'part-damaged',
								vessel: Number(e.vessel),
								part: Number(e.part),
								definition: e.definition,
								speed: e.speed,
								outcome: e.outcome,
								...(e.cause === undefined ? {} : { cause: e.cause }),
								...(e.temperature === undefined ? {} : { temperature: e.temperature })
							}
						})
					),
					created.events.on('vessel:mode-changed', (e) =>
						options.post({
							kind: 'sim-event',
							event: {
								type: 'mode-changed',
								vessel: Number(e.vessel),
								mode: e.mode,
								reason: e.reason
							}
						})
					),
					created.events.on('vessel:destroyed', (e) =>
						options.post({
							kind: 'sim-event',
							event: { type: 'vessel-destroyed', vessel: Number(e.vessel), reason: e.reason }
						})
					)
				];
				last = options.now();
				options.post({ kind: 'ready', ...catalogOf(created) });
				cancel = options.schedule?.(tick, TICK_MS) ?? null;
			} catch (error) {
				fail(error);
			}
		},
		handle(data) {
			const message = parseClientMessage(data);
			if (!message) {
				fail(new Error('sim worker: unrecognised message'));
				return;
			}
			if (message.kind === 'dispose') {
				dispose();
				return;
			}
			if (message.kind === 'script-start') {
				startScript(message.source, message.vessel, message.port);
				return;
			}
			if (message.kind === 'pause') {
				paused = message.paused;
				return;
			}
			if (message.kind === 'script-stop') {
				stopScript();
				return;
			}
			if (!sim) {
				options.post({
					kind: 'result',
					id: message.id,
					result: { ok: false, reason: 'the simulation is not ready yet' }
				});
				return;
			}
			options.post({ kind: 'result', id: message.id, result: sim.dispatch(message.command) });
		},
		tick,
		dispose
	};
}
