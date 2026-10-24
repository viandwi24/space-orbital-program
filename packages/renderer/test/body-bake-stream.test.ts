/**
 * Plan 403: the bake and evict manager. A camera path past three bodies: bakes start nearest first,
 * the resident ones never exceed the preset's budget, the farthest goes first when room is needed,
 * and nothing resident is baked again.
 */
import { describe, expect, test } from 'bun:test';
import { BODY_BAKE, BodyBakeManager, bakeBytes } from '../src/body-bake-model.ts';
import { PRESETS } from '../src/presets.ts';

const MB = 1_048_576;
const SIZE = { width: 1024, height: 512 };
const ONE = bakeBytes(SIZE);

/** Drives the manager like the scene: update, evict, start, and finish what started. */
function run(budget: number, steps: Array<Record<string, number>>) {
	const m = new BodyBakeManager(budget, () => ONE);
	const started: string[] = [];
	const evicted: string[] = [];
	let peak = 0;
	for (const wanted of steps) {
		m.update(new Map(Object.entries(wanted)));
		for (const id of m.evictions()) {
			m.evict(id);
			evicted.push(id);
		}
		for (;;) {
			const job = m.next();
			if (job === undefined) break;
			evicted.push(...job.evict);
			started.push(job.id);
			peak = Math.max(peak, m.used);
			m.done(job.id);
		}
		peak = Math.max(peak, m.used);
	}
	return { m, started, evicted, peak };
}

describe('the bake and evict manager', () => {
	test('the budgets grow with the preset and one bake fits each', () => {
		expect(BODY_BAKE.low.size).toBeNull();
		expect(BODY_BAKE.medium.budgetBytes).toBeLessThan(BODY_BAKE.high.budgetBytes);
		for (const p of ['medium', 'high'] as const) {
			expect(bakeBytes(BODY_BAKE[p].size!)).toBeLessThanOrEqual(BODY_BAKE[p].budgetBytes);
		}
		expect(Object.keys(BODY_BAKE).sort()).toEqual(Object.keys(PRESETS).sort());
		// the lower targets share system memory: Medium's whole budget is small
		expect(BODY_BAKE.medium.budgetBytes).toBeLessThanOrEqual(32 * MB);
	});

	test('nearest first, one at a time', () => {
		const m = new BodyBakeManager(10 * ONE, () => ONE);
		m.update(
			new Map([
				['far', 9],
				['near', 1],
				['mid', 4]
			])
		);
		expect(m.next()?.id).toBe('near');
		expect(m.next()).toBeUndefined();
		m.done('near');
		expect(m.next()?.id).toBe('mid');
		m.done('mid');
		expect(m.next()?.id).toBe('far');
	});

	test('a camera path past three bodies stays inside a two-bake budget, takes the room of the body it left, rebakes nothing resident', () => {
		const { m, started, evicted, peak } = run(2 * ONE, [
			{ a: 1, b: 5, c: 9 },
			{ a: 1, b: 5, c: 9 }, // still: nothing again
			{ b: 1, c: 5 }, // the camera moved on: a is no longer in view
			{ b: 2, c: 1 }
		]);
		expect(peak).toBeLessThanOrEqual(2 * ONE);
		// a and b are baked first (the budget holds two); c waits while both are in view
		expect(started.slice(0, 2)).toEqual(['a', 'b']);
		// once a is out of view its room goes to c
		expect(started).toEqual(['a', 'b', 'c']);
		expect(evicted).toEqual(['a']);
		expect(m.ready()).toEqual(['b', 'c']);
	});

	test('two bodies in view over a budget of one never take turns: the first stays, the second waits', () => {
		const m = new BodyBakeManager(ONE, () => ONE);
		const starts: string[] = [];
		for (let frame = 0; frame < 50; frame++) {
			// the nearer one swaps every frame, as a camera between two bodies might
			m.update(
				new Map([
					['a', frame % 2 ? 1 : 2],
					['b', frame % 2 ? 2 : 1]
				])
			);
			expect(m.evictions()).toEqual([]);
			const job = m.next();
			if (job) {
				starts.push(job.id);
				expect(job.evict).toEqual([]);
				m.done(job.id);
			}
		}
		expect(starts).toEqual(['b']);
		expect(m.ready()).toEqual(['b']);
	});

	test('a body that is no longer wanted keeps its bake until the room is needed, then goes first', () => {
		const m = new BodyBakeManager(2 * ONE, () => ONE);
		m.update(new Map([['a', 1]]));
		m.done(m.next()!.id);
		m.update(new Map());
		expect(m.ready()).toEqual(['a']);
		expect(m.evictions()).toEqual([]);
		m.update(new Map([['b', 3]]));
		const b = m.next()!;
		expect(b).toEqual({ id: 'b', evict: [] });
		m.done(b.id);
		m.update(
			new Map([
				['b', 3],
				['c', 2]
			])
		);
		// the third bake needs the room: the one nobody wants goes, and the budget holds
		const c = m.next()!;
		expect(c).toEqual({ id: 'c', evict: ['a'] });
		expect(m.used).toBeLessThanOrEqual(2 * ONE);
		expect(m.ready()).toEqual(['b']);
	});

	test('a failed job may be asked for again; a queued job that is no longer wanted leaves', () => {
		const m = new BodyBakeManager(2 * ONE, () => ONE);
		m.update(
			new Map([
				['a', 1],
				['b', 2]
			])
		);
		expect(m.next()?.id).toBe('a');
		m.fail('a');
		m.update(new Map([['a', 1]]));
		expect(m.state('b')).toBeUndefined();
		expect(m.next()?.id).toBe('a');
	});

	test('the nearest does not start when the budget would drop a nearer bake', () => {
		const m = new BodyBakeManager(ONE, () => ONE);
		m.update(new Map([['near', 1]]));
		m.done(m.next()!.id);
		m.update(
			new Map([
				['near', 1],
				['far', 8]
			])
		);
		expect(m.next()).toBeUndefined();
		expect(m.evictions()).toEqual([]);
	});
});
