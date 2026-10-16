/**
 * Worker-side host of the sim: owns the clock, steps the sim from wall time, answers commands and
 * streams snapshots. Kept free of `self`/`postMessage` so Node tests drive it with a mock `post`;
 * `sim.worker.ts` wires it to the real worker scope.
 */
import type { Sim } from '@orbital/sim';
import { parseClientMessage, type Catalog, type WorkerMessage } from './messages';

/** Largest wall delta handed to `sim.step`, s: a stalled tab must not trigger a burst of steps. */
export const MAX_WALL_DELTA = 0.1;
/** Loop period, ms (about 60 Hz; browsers may clamp it). */
export const TICK_MS = 16;

export interface SimHostOptions {
	createSim(): Promise<Sim>;
	post(message: WorkerMessage): void;
	/** Wall clock in ms (`performance.now`). */
	now(): number;
	/** Schedules `tick` repeatedly; returns a canceller. Tests leave it out and call `tick` themselves. */
	schedule?(tick: () => void, periodMs: number): () => void;
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
			sim.step(delta);
			options.post({ kind: 'snapshot', snapshot: sim.snapshot() });
		} catch (error) {
			// A throwing sim is not recoverable mid-step: stop the loop and report.
			cancel?.();
			cancel = null;
			fail(error);
		}
	}

	function dispose(): void {
		disposed = true;
		cancel?.();
		cancel = null;
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
