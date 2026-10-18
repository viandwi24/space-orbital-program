/**
 * Worker-side host of the sim: owns the clock, steps the sim from wall time, answers commands and
 * streams snapshots. Kept free of `self`/`postMessage` so Node tests drive it with a mock `post`;
 * `sim.worker.ts` wires it to the real worker scope.
 */
import {
	entityId,
	sitesOf,
	terrainSeedOf,
	zonesOf,
	type Command,
	type CommandResult,
	hillsSeedOf
} from '@orbital/core';
import type { CommandVerdict } from '@orbital/scripting';
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
/**
 * A warp request made while a script runs waits at most this long (wall ms) for the vessel to go
 * on rails (2 s of idle sim time at 1x plus margin) before it is refused (ADR 0039).
 */
export const WARP_PENDING_MS = 8000;
/**
 * Deterministic work budget of one script tick, interrupt polls (plan 032). The engine polls about
 * once per 10 000 operations: 100 polls per ms on an idle desktop, so 20 000 is about the 200 ms
 * wall budget there, and a runaway ends at the same place on every machine and in every replay.
 */
export const SCRIPT_FUEL_POLLS = 20_000;
/** Why the host does not pass a script's attitude demand to the sim while warp is requested or active. */
export const HELD_REASON =
	'held while time warp is requested or active (on rails the attitude is frozen); it is applied again at warp 1';
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
	/** Override of the deterministic work budget, interrupt polls per tick (`Infinity`: wall clock only). */
	scriptFuelPolls?: number;
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
/** A request to run the clock faster: `warp` to a factor, or `warp-to` a time (plan 045). */
type WarpCommand = Extract<Command, { type: 'warp' | 'warp-to' }>;
const isWarp = (c: unknown): c is WarpCommand =>
	isRecord(c) &&
	(c.type === 'warp' || c.type === 'warp-to') &&
	typeof c.factor === 'number' &&
	Number.isFinite(c.factor) &&
	(c.type === 'warp' || (typeof c.time === 'number' && Number.isFinite(c.time)));

/** The home terrain and primary site of the sim's world (plan 084, ADR 0142). */
function worldTerrainOf(sim: Sim): Pick<Catalog, 'terrain' | 'launchSite'> {
	const root = sim.registries.bodies.get(sim.home);
	if (!root) return {};
	const zones = zonesOf(sitesOf(sim.worldInfo), root.id);
	if (zones.length === 0) return {};
	return {
		terrain: { seed: terrainSeedOf(sim.worldInfo), zones },
		launchSite: { latitude: zones[0]!.latitude, longitude: zones[0]!.longitude }
	};
}

/** The seed and zones of every later hills body (plan 071, ADR 0121 point 1), for the renderer's bakes. */
function bodyTerrainOf(sim: Sim): Catalog['bodyTerrain'] {
	const out: NonNullable<Catalog['bodyTerrain']> = {};
	const worldSeed = terrainSeedOf(sim.worldInfo);
	for (const b of sim.registries.bodies.list()) {
		if (b.terrain?.kind !== 'hills' || b.id === sim.home) continue;
		out[b.id] = {
			seed: hillsSeedOf(b, worldSeed, false),
			zones: zonesOf(sitesOf(sim.worldInfo), b.id)
		};
	}
	return out;
}

export function catalogOf(sim: Sim): Catalog {
	return {
		plugins: [...sim.report.order],
		parts: sim.registries.parts.list(),
		bodies: sim.registries.bodies.list(),
		resources: sim.registries.resources.list(),
		epoch: { ...sim.worldInfo.epoch },
		achievements: sim.registries.achievements.list(),
		worldId: sim.worldInfo.id,
		home: sim.home,
		bodyTerrain: bodyTerrainOf(sim),
		...worldTerrainOf(sim)
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
	/** Answers to the script's commands, offered with its next snapshot (ADR 0039, plan 032). */
	let verdicts: CommandVerdict[] = [];
	/** Last accepted throttle per vessel: a script that burns cannot be put on rails. */
	const throttles = new Map<number, number>();
	/** Warp hold (ADR 0039): the script's attitude is not passed on; the latest one waits here. */
	let holding = false;
	let heldAttitude: Command | undefined;
	let pendingWarp: {
		command: WarpCommand;
		since: number;
		reply: (r: CommandResult) => void;
	} | null = null;

	const dispatchTracked = (command: Command): CommandResult => {
		const result = sim!.dispatch(command);
		if (result.ok && command.type === 'throttle')
			throttles.set(Number(command.vessel), command.value);
		return result;
	};
	/** Remember the throttle of a page command the sim accepted. */
	const trackThrottle = (command: unknown, result: CommandResult): CommandResult => {
		if (result.ok && isRecord(command) && command.type === 'throttle') {
			throttles.set(Number(command.vessel), Number(command.value));
		}
		return result;
	};
	/** End the hold and give the vessel the attitude the script last asked for. */
	const releaseHold = (): void => {
		holding = false;
		const attitude = heldAttitude;
		heldAttitude = undefined;
		if (attitude && sim) dispatchTracked(attitude);
	};
	const cancelPending = (why: string): void => {
		const request = pendingWarp;
		pendingWarp = null;
		request?.reply({ ok: false, reason: why });
	};
	/**
	 * Time warp. Without a script it is the sim's own rule. With one, a vessel still in flight is
	 * given the chance to go on rails: the script's attitude demand is zeroed and held and the
	 * request waits for the vessel's idle time (ADR 0039).
	 */
	function requestWarp(command: WarpCommand, reply: (r: CommandResult) => void): void {
		if (!sim) return reply({ ok: false, reason: 'the simulation is not ready yet' });
		const { factor } = command;
		cancelPending('superseded by a newer time warp request');
		const direct = (): void => {
			const result = sim!.dispatch(command);
			if (result.ok && factor <= 1) releaseHold();
			else if (result.ok && session) holding = true;
			reply(result);
		};
		if (factor <= 1 || !session) return direct();
		const vessel = sim.snapshot().vessels.find((v) => Number(v.id) === scriptVessel);
		if (!vessel || vessel.mode === 'on-rails') return direct();
		if ((throttles.get(scriptVessel) ?? 0) > 0) {
			return reply({
				ok: false,
				reason: 'the script is burning (throttle above 0); cut the throttle before time warp'
			});
		}
		holding = true;
		dispatchTracked({
			type: 'attitude',
			vessel: entityId(scriptVessel),
			pitch: 0,
			yaw: 0,
			roll: 0
		});
		pendingWarp = { command, since: options.now(), reply };
	}
	/** Retry a waiting request: accepted once the vessel is on rails, refused after `WARP_PENDING_MS`. */
	function servicePendingWarp(): void {
		const request = pendingWarp;
		if (!request || !sim) return;
		const result = sim.dispatch(request.command);
		if (result.ok) {
			pendingWarp = null;
			request.reply(result);
		} else if (options.now() - request.since > WARP_PENDING_MS) {
			pendingWarp = null;
			releaseHold();
			request.reply(result);
		}
	}
	/** The script ended (finished, failed, stopped, terminated): nothing holds the vessel any more. */
	function scriptGone(): void {
		const waiting = pendingWarp !== null;
		const request = pendingWarp;
		pendingWarp = null;
		releaseHold();
		if (waiting && request && sim) request.reply(sim.dispatch(request.command));
	}

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
		scriptGone();
	};
	/** Commands a script may issue (what the runner builds); the Worker is not trusted to stay within them. */
	const SCRIPT_COMMANDS: readonly string[] = [
		'throttle',
		'attitude',
		'stage',
		'action',
		// Plans 042, 045 and 035: stability assist, maneuver nodes and the target (the runner builds them
		// with the script's own vessel; the host checks it again like the others).
		'sas',
		'node-set',
		'node-remove',
		'target-set'
	];
	const allowed = (command: Command): boolean =>
		command.type === 'warp' ||
		command.type === 'warp-to' ||
		(SCRIPT_COMMANDS.includes(command.type) &&
			'vessel' in command &&
			Number(command.vessel) === scriptVessel);

	function onScriptResult(active: ScriptSession, result: ScriptResult): void {
		if (active !== session || !sim) return;
		lastMs = result.elapsedMs;
		maxMs = Math.max(maxMs, result.elapsedMs);
		lines.push(...result.lines);
		result.commands.forEach((command, index) => {
			const seq = result.seqs?.[index];
			const answer = (r: CommandResult): void => {
				if (!r.ok) {
					const text = `! ${command.type}: ${r.reason}`;
					if (text !== lastRefusal) lines.push(text);
					lastRefusal = text;
				}
				if (seq !== undefined) {
					verdicts.push({ seq, ok: r.ok, ...(r.ok ? {} : { reason: r.reason }) });
				}
			};
			if (!allowed(command)) {
				lines.push(`! ${String((command as { type?: unknown }).type)}: not allowed for scripts`);
				if (seq !== undefined) verdicts.push({ seq, ok: false, reason: 'not allowed for scripts' });
				return;
			}
			if (command.type === 'warp' || command.type === 'warp-to')
				return requestWarp(command, answer);
			if (holding) {
				if (command.type === 'attitude') {
					if (command.pitch !== 0 || command.yaw !== 0 || command.roll !== 0) {
						heldAttitude = command;
						return answer({ ok: false, reason: HELD_REASON });
					}
					heldAttitude = undefined; // a zero demand: nothing to give back later
				} else if (
					pendingWarp &&
					(command.type === 'stage' ||
						command.type === 'action' ||
						(command.type === 'throttle' && command.value > 0))
				) {
					cancelPending(`the script issued ${command.type} while time warp was pending`);
					releaseHold();
				}
			}
			answer(dispatchTracked(command));
		});
		flushLines();
		if (result.status !== 'running') {
			session = null; // the session closed itself
			scriptGone();
			flushLines();
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
		verdicts = [];
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
				...((options.scriptFuelPolls ?? SCRIPT_FUEL_POLLS) === Infinity
					? {}
					: { fuelPolls: options.scriptFuelPolls ?? SCRIPT_FUEL_POLLS }),
				env: {
					bodies: sim.registries.bodies.list(),
					parts: sim.registries.parts.list(),
					resources: sim.registries.resources.list(),
					epoch: { ...sim.worldInfo.epoch }
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
					scriptGone();
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
			// The sim ends a warp itself (a finished `warp-to`, a change of sphere): the script's
			// attitude must not stay held after that (ADR 0039).
			if (holding && !pendingWarp && sim.warp <= 1) releaseHold();
			const snapshot = sim.snapshot();
			session?.poll();
			if (!paused) {
				servicePendingWarp();
				flushLines();
				// The script may answer within this call (an in-process double): new verdicts must survive.
				const batch = verdicts;
				verdicts = [];
				if (session && !session.tick(snapshot, batch)) verdicts = [...batch, ...verdicts];
			}
			options.post({ kind: 'snapshot', snapshot, warp: sim.warp });
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
					created.events.on('milestone:reached', (e) =>
						options.post({
							kind: 'sim-event',
							event: {
								type: 'milestone',
								id: e.id,
								kind: e.kind,
								...(e.body === undefined ? {} : { body: e.body }),
								vessel: Number(e.vessel),
								crewed: e.crewed,
								time: e.time
							}
						})
					),
					created.events.on('part:failed', (e) =>
						options.post({
							kind: 'sim-event',
							event: {
								type: 'part-failed',
								vessel: Number(e.vessel),
								part: Number(e.part),
								mode: e.mode,
								label: created.registries.failureModes.get(e.mode)?.label ?? e.mode
							}
						})
					),
					created.events.on('vessel:soi-changed', (e) =>
						options.post({
							kind: 'sim-event',
							event: { type: 'soi-changed', vessel: Number(e.vessel), from: e.from, to: e.to }
						})
					),
					created.events.on('vessel:maneuver-complete', (e) =>
						options.post({
							kind: 'sim-event',
							event: { type: 'maneuver-complete', vessel: Number(e.vessel), node: e.node }
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
			// `init` and `save` are answered by the Worker entry (save/worker-save.ts), not by the host.
			if (message.kind === 'init' || message.kind === 'save') return;
			if (!sim) {
				options.post({
					kind: 'result',
					id: message.id,
					result: { ok: false, reason: 'the simulation is not ready yet' }
				});
				return;
			}
			const command = message.command;
			if (isWarp(command)) {
				requestWarp(command, (result) => options.post({ kind: 'result', id: message.id, result }));
				return;
			}
			options.post({
				kind: 'result',
				id: message.id,
				result: trackThrottle(command, sim.dispatch(command))
			});
		},
		tick,
		dispose
	};
}
