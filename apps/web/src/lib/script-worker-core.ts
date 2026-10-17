/**
 * The logic of the script Worker (ADR 0031), free of `self`/`postMessage` so tests can drive it
 * with a double. `script.worker.ts` wires it to the real worker scope.
 */
import type { ScriptRunner, ScriptRunnerOptions, SyntaxCheck } from '@orbital/scripting';
import { scriptBodyState } from './script-body-state.ts';
import { scriptDate } from './script-date.ts';
import {
	parseToScriptWorker,
	type FromScriptWorker,
	type ScriptWorkerLike,
	type ToScriptWorker
} from './script-protocol.ts';

export interface ScriptWorkerCoreOptions {
	createRunner(source: string, options: ScriptRunnerOptions): Promise<ScriptRunner>;
	/** Compile `source` without running it (plan 058). Absent: checks are not answered. */
	checkSyntax?(source: string): Promise<SyntaxCheck>;
	post(message: FromScriptWorker): void;
	/** Wall clock in ms for the budget (`performance.now`). */
	now(): number;
}

export interface ScriptWorkerCore {
	handle(data: unknown): void;
}

export function createScriptWorkerCore(options: ScriptWorkerCoreOptions): ScriptWorkerCore {
	let runner: ScriptRunner | null = null;
	let started = false;
	let lines: string[] = [];

	const startRunner = (message: Extract<ToScriptWorker, { kind: 'start' }>): void => {
		started = true;
		options
			.createRunner(message.source, {
				vessel: message.vessel,
				...message.env,
				bodyState: scriptBodyState(message.env.bodies),
				date: scriptDate(message.env),
				budgetMs: message.budgetMs,
				firstTickBudgetMs: message.firstTickBudgetMs,
				...(message.fuelPolls === undefined ? {} : { fuelPolls: message.fuelPolls }),
				now: options.now,
				onPrint: (line) => void lines.push(line)
			})
			.then(
				(created) => {
					runner = created;
					options.post({ kind: 'ready' });
				},
				(error: unknown) =>
					options.post({
						kind: 'boot-failed',
						error: error instanceof Error ? error.message : String(error)
					})
			);
	};

	const tick = (message: Extract<ToScriptWorker, { kind: 'tick' }>): void => {
		const active = runner;
		if (!active) return;
		try {
			const result = active.tick(message.snapshot, message.verdicts);
			const out = lines;
			lines = [];
			options.post({
				kind: 'result',
				commands: result.commands,
				seqs: result.seqs,
				status: result.status,
				...(active.error === undefined ? {} : { error: active.error }),
				...(active.errorLine === undefined ? {} : { errorLine: active.errorLine }),
				elapsedMs: result.elapsedMs,
				lines: out
			});
			if (result.status !== 'running') runner = null;
		} catch (error) {
			// The vessel is not in the snapshot any more: the runner has disposed itself.
			runner = null;
			const out = lines;
			lines = [];
			options.post({
				kind: 'result',
				commands: [],
				status: 'failed',
				error: error instanceof Error ? error.message : String(error),
				elapsedMs: 0,
				lines: out
			});
		}
	};

	return {
		handle(data) {
			const message = parseToScriptWorker(data);
			if (!message) return;
			if (message.kind === 'check') {
				const { id } = message;
				// A check never touches the running script (its runner, its status, its output).
				options.checkSyntax?.(message.source).then(
					(result) => options.post({ kind: 'checked', id, ...result }),
					(error: unknown) =>
						options.post({
							kind: 'checked',
							id,
							ok: false,
							message: `could not check: ${error instanceof Error ? error.message : String(error)}`
						})
				);
				return;
			}
			if (message.kind === 'start') {
				if (!started) startRunner(message); // one script per Worker: a second start is ignored
				return;
			}
			tick(message);
		}
	};
}

/**
 * A script Worker running in this thread: messages are delivered synchronously. For tests of the
 * sim host that do not need a real thread (the real thing is `script.worker.ts`).
 */
export function createInProcessScriptWorker(
	createRunner: ScriptWorkerCoreOptions['createRunner'],
	now: () => number
): ScriptWorkerLike {
	const worker: ScriptWorkerLike = {
		onmessage: null,
		onerror: null,
		postMessage: (message) => core.handle(message),
		terminate: () => {
			worker.onmessage = null;
		}
	};
	const core = createScriptWorkerCore({
		createRunner,
		now,
		post: (message) => worker.onmessage?.({ data: message })
	});
	return worker;
}
