/**
 * The script runner: one QuickJS runtime per script, stepped once per sim tick with a snapshot,
 * returning the validated commands the script issued (ADR 0020). It never touches the sim: the
 * host dispatches the commands, so the same runner works in-process, in a Worker or over the web
 * protocol.
 */
import {
	GRAVITATIONAL_CONSTANT,
	commandSchema,
	entityId,
	type Command,
	type Snapshot
} from '@orbital/core';
import type {
	QuickJSContext,
	QuickJSHandle,
	QuickJSRuntime,
	QuickJSWASMModule
} from 'quickjs-emscripten-core';
import { PRELUDE } from './prelude.ts';
import { buildTelemetry, type ScriptEnvironment } from './telemetry.ts';

export interface ScriptRunnerOptions extends ScriptEnvironment {
	/** The vessel the script controls; scripts cannot address any other. */
	vessel: number;
	/** Wall-clock budget per tick, ms: all guest work (telemetry update, script, promise jobs). Default 10. */
	budgetMs?: number;
	/**
	 * Budget of the script's first tick only, ms. A cold WASM module (first call of every function)
	 * can take longer than `budgetMs` for a harmless script on a slow or loaded machine (journal
	 * 017, 018); the host that has a hard backstop (a Worker it can terminate) allows more. Default
	 * `budgetMs`.
	 */
	firstTickBudgetMs?: number;
	/** Guest heap limit, bytes. Default 16 MiB. */
	memoryLimitBytes?: number;
	/** Guest stack limit, bytes. Default 256 KiB. */
	maxStackBytes?: number;
	/**
	 * Deterministic work budget per tick: the number of times the engine polls the interrupt handler
	 * (about once per 10 000 bytecode operations; plan 032). A tick that polls more is terminated
	 * with the same error on every machine, however busy, and a replay ends where it ended before.
	 * The wall-clock `budgetMs` still applies as the backstop. Default: no fuel limit.
	 */
	fuelPolls?: number;
	/** Seed of the guest's `Math.random`. Default 1. */
	seed?: number;
	/** Wall clock in ms, used only by the budget. Default `Date.now`. */
	now?: () => number;
	/** Receives each `print()` line (also kept in `runner.logs`). */
	onPrint?: (line: string) => void;
}

/**
 * `running`: the script has not returned (it may be waiting). `finished`: it returned.
 * `failed`: it threw (or did not compile). `terminated`: stopped by the host for exceeding the
 * budget or the memory limit; the runtime is gone and the script cannot be resumed.
 */
export type ScriptStatus = 'running' | 'finished' | 'failed' | 'terminated';

/** The host's answer to a command an earlier tick issued (plan 032, ADR 0039). */
export interface CommandVerdict {
	/** The `seqs` entry of the command. */
	seq: number;
	ok: boolean;
	/** Why it was refused, when `ok` is false. */
	reason?: string;
}

export interface TickResult {
	/** Validated commands issued during this tick, in order. */
	commands: Command[];
	/** Sequence number of each command (same order); `tick` takes the verdicts for them next time. */
	seqs: number[];
	status: ScriptStatus;
	/** Wall time spent in the guest during this tick, ms. */
	elapsedMs: number;
}

export interface ScriptRunner {
	readonly status: ScriptStatus;
	/** Why the script `failed` or was `terminated`. */
	readonly error: string | undefined;
	/** 1-based line of `source` where a `failed` script threw (or failed to compile), when known. */
	readonly errorLine: number | undefined;
	/** `print()` output, oldest first (capped at the last 1000 lines). */
	readonly logs: readonly string[];
	/**
	 * Advance the script to `snapshot.t`. Call after every `sim.step` and dispatch the commands.
	 * `verdicts` answers commands of earlier ticks (by `seqs`): promises of `stage()`, `action()`
	 * and `warp()` settle and `ship.refusals` lists the refused ones.
	 */
	tick(snapshot: Snapshot, verdicts?: readonly CommandVerdict[]): TickResult;
	/** Free the QuickJS runtime. Idempotent. */
	dispose(): void;
}

/** Highest factor a script may ask for: the top step of the HUD (ADR 0039). */
export const MAX_SCRIPT_WARP = 100_000;
/** `cmd` result for a command that was not sent (a repeated setpoint). */
const NOT_SENT = -1;

const MAX_LOG_LINES = 1000;
const MAX_LOG_CHARS = 1000;
/** Promise jobs run per `executePendingJobs` call, so the budget is checked between batches. */
const JOB_BATCH = 256;

/** Lines the runner adds before the script in the compiled function (see `runTick`). */
const SOURCE_LINE_OFFSET = 2;
const SCRIPT_FRAME = /\bscript\.js:(\d+)/;

/** The script line a guest stack points at: its first frame in `script.js`, minus the wrapper. */
export function scriptErrorLine(stack: string | undefined): number | undefined {
	const match = stack === undefined ? null : SCRIPT_FRAME.exec(stack);
	if (!match) return undefined;
	const line = Number(match[1]) - SOURCE_LINE_OFFSET;
	return line >= 1 ? line : undefined;
}

/** Rewrite the engine's `script.js:7:13` frames to the line numbers of the player's source. */
function mapFrames(frames: string): string {
	return frames.replace(/\bscript\.js:(\d+):(\d+)/g, (whole, line: string, column: string) => {
		const mapped = Number(line) - SOURCE_LINE_OFFSET;
		return mapped >= 1 ? `line ${mapped}:${column}` : whole;
	});
}

/** Raised by guest code, with the guest error's name and message. */
class GuestError extends Error {
	readonly guestName: string;
	constructor(name: string, message: string, stack?: string) {
		super(message);
		this.guestName = name;
		if (stack) this.stack = stack;
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The `bodies` global: what a script may know about every body in the registry. */
function bodiesOf(env: ScriptEnvironment): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const b of env.bodies) {
		out[String(b.id)] = {
			id: String(b.id),
			radius: b.radius,
			mass: b.mass,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			rotationPeriod: b.rotationPeriod,
			...(b.atmosphere ? { atmosphere: { ...b.atmosphere } } : {}),
			...(b.parent === undefined ? {} : { parent: String(b.parent) }),
			...(b.orbit ? { orbit: { ...b.orbit } } : {})
		};
	}
	return out;
}

/**
 * Build a runner for `source` (the body of an async function, so `await wait(1)` works at top
 * level) in a WASM module the host built itself. A bundled host (the web client's Worker, plan 015
 * / ADR 0022) loads the `.wasm` from an explicit asset URL; `createScriptRunner` (default-module.ts)
 * uses the shared `getQuickJS()` module instead.
 */
export async function createScriptRunnerIn(
	QuickJS: QuickJSWASMModule,
	source: string,
	options: ScriptRunnerOptions
): Promise<ScriptRunner> {
	const budgetMs = options.budgetMs ?? 10;
	const firstTickBudgetMs = options.firstTickBudgetMs ?? budgetMs;
	if (!(budgetMs > 0) || !(firstTickBudgetMs > 0))
		throw new Error('createScriptRunner: budgetMs must be > 0');
	const now = options.now ?? Date.now;
	const vessel = entityId(options.vessel);
	const runtime: QuickJSRuntime = QuickJS.newRuntime();
	runtime.setMemoryLimit(options.memoryLimitBytes ?? 16 * 1024 * 1024);
	runtime.setMaxStackSize(options.maxStackBytes ?? 256 * 1024);
	const context: QuickJSContext = runtime.newContext();

	const fuelPolls = options.fuelPolls ?? Infinity;
	let polls = 0;
	let fuelOut = false;
	let deadline = Infinity;
	/** The budget of the tick in progress (the first tick may have a larger one). */
	let allowance = firstTickBudgetMs;
	runtime.setInterruptHandler(() => {
		if (++polls > fuelPolls) {
			fuelOut = true;
			return true;
		}
		return now() > deadline;
	});

	let status: ScriptStatus = 'running';
	let error: string | undefined;
	let errorLine: number | undefined;
	let started = false;
	let disposed = false;
	let pending: Command[] = [];
	let pendingSeqs: number[] = [];
	let nextSeq = 1;
	let lastThrottle: number | undefined;
	let lastAttitude: string | undefined;
	let lastSas: string | undefined;
	const logs: string[] = [];
	const handles: QuickJSHandle[] = [];

	const own = (h: QuickJSHandle): QuickJSHandle => {
		handles.push(h);
		return h;
	};

	/** Call a guest function; a guest exception becomes a GuestError. Returns the dumped value. */
	function call(fn: QuickJSHandle, ...args: QuickJSHandle[]): unknown {
		const result = context.callFunction(fn, context.undefined, ...args);
		if (result.error) {
			const e = context.dump(result.error) as unknown;
			result.error.dispose();
			throw toGuestError(e);
		}
		const value = context.dump(result.value) as unknown;
		result.value.dispose();
		return value;
	}

	function toGuestError(e: unknown): GuestError {
		if (isRecord(e)) {
			return new GuestError(
				String(e.name ?? 'Error'),
				String(e.message ?? ''),
				typeof e.stack === 'string' ? e.stack : undefined
			);
		}
		return new GuestError('Error', String(e));
	}

	/**
	 * Host side of `cmd(kind, json)`. Builds the command from named fields only (the vessel is
	 * fixed by the runner) and validates it with core's `commandSchema`; a bad value throws into
	 * the script, so the script sees a normal exception and nothing invalid reaches the sim.
	 */
	function issue(kind: string, payload: string): number {
		let p: unknown;
		try {
			p = JSON.parse(payload);
		} catch {
			throw new Error('invalid command payload');
		}
		if (!isRecord(p)) throw new Error('invalid command payload');
		let candidate: unknown;
		switch (kind) {
			case 'throttle':
				candidate = { type: 'throttle', vessel, value: p.value };
				break;
			case 'attitude':
				candidate = { type: 'attitude', vessel, pitch: p.pitch, yaw: p.yaw, roll: p.roll };
				break;
			case 'sas':
				candidate = { type: 'sas', vessel, mode: p.mode };
				break;
			case 'stage':
				candidate = { type: 'stage', vessel };
				break;
			case 'action':
				candidate = {
					type: 'action',
					vessel,
					part: p.part,
					module: p.module,
					action: p.action,
					args: p.args
				};
				break;
			case 'warp':
				if (typeof p.factor === 'number' && p.factor > MAX_SCRIPT_WARP) {
					throw new RangeError(`warp: factor must be 1 to ${MAX_SCRIPT_WARP}`);
				}
				candidate = { type: 'warp', factor: p.factor };
				break;
			default:
				throw new Error(`unknown command "${kind}"`);
		}
		const parsed = commandSchema.safeParse(candidate);
		if (!parsed.success) {
			throw new RangeError(`${kind}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
		}
		const command = parsed.data;
		// A repeated setpoint is not news: one tick of `ship.throttle = 1` loops costs no commands.
		if (command.type === 'throttle') {
			if (command.value === lastThrottle) return NOT_SENT;
			lastThrottle = command.value;
		} else if (command.type === 'attitude') {
			const key = `${command.pitch},${command.yaw},${command.roll}`;
			if (key === lastAttitude) return NOT_SENT;
			lastAttitude = key;
		} else if (command.type === 'sas') {
			if (command.mode === lastSas) return NOT_SENT;
			lastSas = command.mode;
		}
		const seq = nextSeq++;
		pending.push(command);
		pendingSeqs.push(seq);
		return seq;
	}

	function print(line: string): void {
		const clipped = line.length > MAX_LOG_CHARS ? line.slice(0, MAX_LOG_CHARS) + '...' : line;
		logs.push(clipped);
		if (logs.length > MAX_LOG_LINES) logs.shift();
		options.onPrint?.(clipped);
	}

	/** Classify a guest error: resource exhaustion terminates, anything else is a script failure. */
	function settle(e: GuestError): void {
		if (e.guestName === 'InternalError' && e.message === 'interrupted') {
			stop(
				'terminated',
				fuelOut
					? `work budget exceeded (${fuelPolls} interrupt polls per tick)`
					: `time budget exceeded (${allowance} ms per tick)`
			);
		} else if (e.guestName === 'InternalError' && /out of memory/i.test(e.message)) {
			stop('terminated', 'memory limit exceeded');
		} else {
			const frames = mapFrames((e.stack ?? '').split('\n').slice(0, 12).join('\n'));
			stop('failed', `${e.guestName}: ${e.message}${frames ? '\n' + frames : ''}`);
			errorLine = scriptErrorLine(e.stack);
		}
	}

	const current = (): ScriptStatus => status;

	function stop(next: ScriptStatus, why: string): void {
		status = next;
		error = why;
	}

	// ---- boot: host object, prelude ------------------------------------------------------
	const host = own(context.newObject());
	const bind = (name: string, fn: (...args: QuickJSHandle[]) => void): void => {
		const h = context.newFunction(name, fn);
		context.setProp(host, name, h);
		h.dispose();
	};
	const cmd = context.newFunction('cmd', (kind, payload) =>
		context.newNumber(issue(context.getString(kind), context.getString(payload)))
	);
	context.setProp(host, 'cmd', cmd);
	cmd.dispose();
	bind('print', (line) => print(context.getString(line)));
	bind('done', (ok, name, message, stack) => {
		if (context.dump(ok) === true) status = 'finished';
		else
			settle(
				new GuestError(
					context.getString(name),
					context.getString(message),
					context.getString(stack)
				)
			);
	});

	const preludeResult = context.evalCode(PRELUDE, 'prelude.js');
	const prelude = own(context.unwrapResult(preludeResult));
	const seed = context.newNumber(options.seed ?? 1);
	const bodiesJson = context.newString(JSON.stringify(bodiesOf(options)));
	const apiResult = context.callFunction(prelude, context.undefined, host, seed, bodiesJson);
	seed.dispose();
	bodiesJson.dispose();
	const api = own(context.unwrapResult(apiResult));
	const update = own(context.getProp(api, 'update'));
	const start = own(context.getProp(api, 'start'));

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		for (const h of handles) if (h.alive) h.dispose();
		context.dispose();
		runtime.dispose();
	}

	/** Run promise jobs until none are left, checking the budget between batches. */
	function pump(): void {
		for (;;) {
			const result = runtime.executePendingJobs(JOB_BATCH);
			if (result.error) {
				const e = context.dump(result.error) as unknown;
				result.error.dispose();
				throw toGuestError(e);
			}
			if (result.value === 0) return;
			if (now() > deadline) throw new GuestError('InternalError', 'interrupted');
		}
	}

	function runTick(snapshot: Snapshot, verdicts: readonly CommandVerdict[]): void {
		const json = JSON.stringify(buildTelemetry(snapshot, options.vessel, options));
		const arg = context.newString(json);
		const answers = context.newString(JSON.stringify(verdicts));
		try {
			call(update, arg, answers);
		} finally {
			arg.dispose();
			answers.dispose();
		}
		if (!started) {
			started = true;
			// Two lines come before `source` (SOURCE_LINE_OFFSET): error lines are mapped back.
			const wrapped = `(async function () {\n'use strict';\n${source}\n})`;
			const compiled = context.evalCode(wrapped, 'script.js');
			if (compiled.error) {
				const e = context.dump(compiled.error) as unknown;
				compiled.error.dispose();
				throw toGuestError(e);
			}
			const fn = own(compiled.value);
			call(start, fn);
		}
		pump();
	}

	return {
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get errorLine() {
			return errorLine;
		},
		get logs() {
			return logs;
		},
		tick(snapshot, verdicts = []) {
			if (disposed || status !== 'running') {
				return { commands: [], seqs: [], status, elapsedMs: 0 };
			}
			const began = now();
			allowance = started ? budgetMs : firstTickBudgetMs;
			deadline = began + allowance;
			polls = 0;
			pending = [];
			pendingSeqs = [];
			try {
				runTick(snapshot, verdicts);
			} catch (e) {
				if (e instanceof GuestError) {
					settle(e);
				} else {
					// Host-side failure (bad snapshot, vessel gone): not the script's fault, rethrow.
					dispose();
					throw e;
				}
			}
			deadline = Infinity;
			const elapsedMs = now() - began;
			if (current() !== 'running') dispose();
			const commands = pending;
			const seqs = pendingSeqs;
			pending = [];
			pendingSeqs = [];
			return { commands, seqs, status: current(), elapsedMs };
		},
		dispose
	};
}
