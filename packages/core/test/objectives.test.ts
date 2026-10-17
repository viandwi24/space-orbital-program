/** The objective tree evaluator (plan 098, ADR 0175). */
import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import {
	evaluateObjectives,
	type LeafResults,
	type ObjectiveDefinition,
	type ObjectiveNode,
	type ObjectiveView
} from '../src/index.ts';

/** A leaf that is done once `view.time` reaches `at`, and fails when `failAt` is reached. */
const timed: ObjectiveDefinition<{ at: number; failAt?: number }> = {
	id: 't.timed',
	label: 'Timed',
	params: z.object({ at: z.number(), failAt: z.number().optional() }),
	evaluate: (p, view) =>
		p.failAt !== undefined && view.time >= p.failAt
			? { status: 'failed', progress: 0 }
			: view.time >= p.at
				? { status: 'done', progress: 1 }
				: { status: 'active', progress: view.time / p.at }
};
/** Done exactly while `view.time` is in `[from, to)`: shows stickiness. */
const window: ObjectiveDefinition<{ from: number; to: number }> = {
	id: 't.window',
	label: 'Window',
	params: z.object({ from: z.number(), to: z.number() }),
	evaluate: (p, view) => ({
		status: view.time >= p.from && view.time < p.to ? 'done' : 'active',
		progress: 0
	})
};
const before: ObjectiveDefinition<{ time: number }> = {
	id: 't.before',
	label: 'Before',
	params: z.object({ time: z.number() }),
	constraint: true,
	evaluate: (p, view) =>
		view.time <= p.time ? { status: 'done', progress: 1 } : { status: 'failed', progress: 0 }
};
const defs = new Map<string, ObjectiveDefinition>([
	[timed.id, timed as ObjectiveDefinition],
	[window.id, window as ObjectiveDefinition],
	[before.id, before as ObjectiveDefinition]
]);
const lookup = (id: string) => defs.get(id);
const view = (time: number): ObjectiveView => ({ time, home: 'h', vessels: [] });

function run(node: ObjectiveNode, times: number[]) {
	let leaves: LeafResults = {};
	let last = { status: 'active' as string, progress: 0 };
	for (const t of times) {
		const r = evaluateObjectives(node, leaves, lookup, view(t));
		leaves = r.leaves;
		last = r;
	}
	return { ...last, leaves };
}

const at = (n: number) => ({ objective: 't.timed', params: { at: n } });

describe('objective trees', () => {
	test('all: done when every child is, failed when one fails; progress is the mean', () => {
		expect(run({ all: [at(10), at(20)] }, [10]).status).toBe('active');
		expect(run({ all: [at(10), at(20)] }, [10]).progress).toBeCloseTo(0.75, 12);
		expect(run({ all: [at(10), at(20)] }, [10, 20]).status).toBe('done');
		expect(
			run({ all: [at(10), { objective: 't.timed', params: { at: 99, failAt: 5 } }] }, [5]).status
		).toBe('failed');
	});

	test('any: done when one child is; failed only when all fail', () => {
		expect(run({ any: [at(10), at(20)] }, [10]).status).toBe('done');
		const failing = (n: number) => ({ objective: 't.timed', params: { at: 99, failAt: n } });
		expect(run({ any: [failing(5), at(20)] }, [5]).status).toBe('active');
		expect(run({ any: [failing(5), failing(6)] }, [6]).status).toBe('failed');
	});

	test('sequence: a later step done first counts for nothing', () => {
		const seq = {
			sequence: [
				{ objective: 't.window', params: { from: 10, to: 11 } },
				{ objective: 't.window', params: { from: 0, to: 5 } }
			]
		};
		// The second step's window is at t 0..5, before the first step's: evaluated in order, it never counts.
		expect(run(seq, [0, 1, 10, 12]).status).toBe('active');
		expect(run(seq, [0, 1, 10, 12]).leaves['0.1']!.status).toBe('active'); // opened at t 10, outside its window
		// In order: the first at t 10, the second at its window afterwards.
		const ordered = {
			sequence: [
				{ objective: 't.window', params: { from: 0, to: 5 } },
				{ objective: 't.window', params: { from: 10, to: 11 } }
			]
		};
		expect(run(ordered, [1, 10]).status).toBe('done');
	});

	test('a sequence can move several steps in one evaluation', () => {
		expect(run({ sequence: [at(1), at(2), at(3)] }, [5]).status).toBe('done');
	});

	test('leaves are sticky once done; constraint leaves are re-evaluated and fail their tree', () => {
		const sticky = { all: [{ objective: 't.window', params: { from: 0, to: 2 } }, at(10)] };
		expect(run(sticky, [1, 10]).status).toBe('done'); // the window closed at 2, the leaf stayed done
		const limited = { all: [at(10), { objective: 't.before', params: { time: 8 } }] };
		expect(run(limited, [1, 9]).status).toBe('failed');
		expect(run(limited, [1, 9]).leaves['0.1']!.status).toBe('failed');
		expect(
			run({ all: [at(5), { objective: 't.before', params: { time: 8 } }] }, [1, 5]).status
		).toBe('done');
	});

	test('the evaluation is pure: the input leaves are not changed', () => {
		const leaves: LeafResults = {};
		evaluateObjectives({ all: [at(1)] }, leaves, lookup, view(5));
		expect(leaves).toEqual({});
	});
});
