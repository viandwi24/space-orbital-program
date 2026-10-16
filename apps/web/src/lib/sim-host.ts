/**
 * Worker-side host of the sim: owns the clock, steps the sim from wall time, answers commands and
 * streams snapshots. Kept free of `self`/`postMessage` so Node tests drive it with a mock `post`;
 * `sim.worker.ts` wires it to the real worker scope.
 */
import type { ScriptRunner, ScriptRunnerOptions } from '@orbital/scripting';
import type { Sim } from '@orbital/sim';
import { parseClientMessage, type Catalog, type ScriptState, type WorkerMessage } from './messages';

/** Largest wall delta handed to `sim.step`, s: a stalled tab must not trigger a burst of steps. */
export const MAX_WALL_DELTA = 0.1;
/** Loop period, ms (about 60 Hz; browsers may clamp it). */
export const TICK_MS = 16;
/** Wall-clock budget of one script tick, ms (the runner terminates the script past it; ADR 0020). */
export const SCRIPT_BUDGET_MS = 10;
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
	 * Creates the script runner (the worker wires `createScriptRunner` with the bundled WASM).
	 * Without it, `script-start` is answered with a `failed` status.
	 */
	createRunner?(source: string, options: ScriptRunnerOptions): Promise<ScriptRunner>;
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

	// --- script (plan 015, ADR 0022): the runner ticks right after each sim step ------------------
	let runner: ScriptRunner | null = null;
	/** Bumped by start/stop so a runner that finishes booting after a stop is discarded. */
	let scriptEpoch = 0;
	let lastMs = 0;
	let maxMs = 0;
	let lastStatusAt = 0;
	let lines: string[] = [];
	let lastRefusal = '';

	const postStatus = (status: ScriptState, error?: string): void => {
		lastStatusAt = options.now();
		options.post({
			kind: 'script-status',
			status,
			...(error === undefined ? {} : { error }),
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
		runner?.dispose();
		runner = null;
	};

	function startScript(source: string, vessel: number): void {
		endScript();
		const epoch = ++scriptEpoch;
		lastMs = 0;
		maxMs = 0;
		lines = [];
		lastRefusal = '';
		if (!sim) return postStatus('failed', 'the simulation is not ready yet');
		if (!options.createRunner) return postStatus('failed', 'scripting is not available');
		if (!sim.snapshot().vessels.some((v) => Number(v.id) === vessel)) {
			return postStatus('failed', `vessel ${vessel} does not exist`);
		}
		postStatus('starting');
		options
			.createRunner(source, {
				vessel,
				bodies: sim.registries.bodies.list(),
				parts: sim.registries.parts.list(),
				resources: sim.registries.resources.list(),
				budgetMs: SCRIPT_BUDGET_MS,
				now: options.now,
				onPrint: (line) => void lines.push(line)
			})
			.then(
				(created) => {
					if (epoch !== scriptEpoch || disposed) {
						created.dispose();
						return;
					}
					runner = created;
					postStatus('running');
				},
				(error: unknown) => {
					if (epoch !== scriptEpoch) return;
					postStatus('failed', error instanceof Error ? error.message : String(error));
				}
			);
	}

	function stopScript(): void {
		++scriptEpoch;
		endScript();
		lines = [];
		postStatus('stopped');
	}

	/** Tick the runner on `snapshot` and dispatch what it issued; ends the script when it is over. */
	function tickScript(snapshot: ReturnType<Sim['snapshot']>): void {
		const active = runner;
		if (!active || !sim) return;
		let result;
		try {
			result = active.tick(snapshot);
		} catch (error) {
			// Not the script's fault (the vessel is gone): the runner has disposed itself.
			runner = null;
			flushLines();
			postStatus('failed', error instanceof Error ? error.message : String(error));
			return;
		}
		lastMs = result.elapsedMs;
		maxMs = Math.max(maxMs, result.elapsedMs);
		for (const command of result.commands) {
			const verdict = sim.dispatch(command);
			if (!verdict.ok) {
				const text = `! ${command.type}: ${verdict.reason}`;
				if (text !== lastRefusal) lines.push(text);
				lastRefusal = text;
			}
		}
		flushLines();
		if (result.status !== 'running') {
			const error = active.error;
			runner = null;
			postStatus(result.status, error);
		} else if (options.now() - lastStatusAt >= SCRIPT_STATUS_MS) {
			postStatus('running');
		}
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
			if (!paused) tickScript(snapshot);
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
		++scriptEpoch;
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
				startScript(message.source, message.vessel);
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
