import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import { SnapshotDecoder, SnapshotEncoder } from './snapshot-delta';

const part = (id: number, y: number, extra: Record<string, unknown> = {}) => ({
	id,
	definition: 'stock.tank-small',
	position: { x: 0, y, z: 0 },
	orientation: { x: 0, y: 0, z: 0, w: 1 },
	modules: { 'stock.tank': { fill: 1 } },
	temperature: 290 + y,
	maxTemperature: 1200,
	index: id,
	resources: [{ resource: 'fuel', amount: 100 - id }],
	...extra
});

const vessel = (id: number, y: number, parts = [part(id * 10, 0), part(id * 10 + 1, 1)]) => ({
	id,
	name: `V${id}`,
	position: { x: 1, y, z: 3 },
	velocity: { x: 0, y: y * 2, z: 0 },
	orientation: { x: 0, y: 0, z: 0, w: 1 },
	actions: [{ id: 'stage', label: 'Stage' }],
	crew: [],
	parts
});

const snap = (t: number, vessels: ReturnType<typeof vessel>[], extra: object = {}): Snapshot =>
	({
		t,
		vessels,
		bodies: [{ id: 'home', radius: 600000 }],
		rules: { drag: true },
		...extra
	}) as unknown as Snapshot;

function pair() {
	return { enc: new SnapshotEncoder(), dec: new SnapshotDecoder() };
}
const send = (p: ReturnType<typeof pair>, s: Snapshot) => {
	const wire = p.enc.encode(s);
	// the worker's postMessage clones it
	return { wire, out: p.dec.decode(structuredClone(wire)) };
};

describe('snapshot deltas (plan 365, ADR 0358)', () => {
	it('sends the first snapshot whole and every later one as the same data', () => {
		const p = pair();
		const a = snap(1, [vessel(1, 0)]);
		const first = send(p, a);
		expect(first.out).toEqual(a);
		expect(first.wire.same).toBeUndefined();
		const b = snap(2, [vessel(1, 5)]);
		const second = send(p, b);
		expect(second.out).toEqual(b);
	});

	it('leaves out what did not change and gives the decoder the earlier objects', () => {
		const p = pair();
		const first = send(p, snap(1, [vessel(1, 0)]));
		const second = send(p, snap(2, [vessel(1, 5)]));
		expect(second.wire.same).toEqual(expect.arrayContaining(['bodies', 'rules']));
		expect((second.wire as Record<string, unknown>).bodies).toBeUndefined();
		expect(second.out.bodies).toBe(first.out.bodies);
		expect(second.out.rules).toBe(first.out.rules);
		const v = second.wire.vessels[0]!;
		expect(v.same).toEqual(expect.arrayContaining(['actions', 'crew']));
		expect(second.out.vessels[0]!.actions).toBe(first.out.vessels[0]!.actions);
		for (const wp of v.parts) expect(wp.same).toBe(true);
		// the parts' transforms and temperature still arrive each time
		expect(second.out.vessels[0]!.parts[1]!.position).toEqual({ x: 0, y: 1, z: 0 });
		expect(second.out.vessels[0]!.parts[1]!.modules).toBe(first.out.vessels[0]!.parts[1]!.modules);
	});

	it('is smaller than the whole snapshot once the world is quiet', () => {
		const p = pair();
		const many = (y: number) =>
			snap(
				y,
				[1, 2, 3].map((i) =>
					vessel(
						i,
						y,
						Array.from({ length: 20 }, (_, k) => part(i * 100 + k, k + y))
					)
				)
			);
		send(p, many(0));
		const next = many(1);
		const wire = p.enc.encode(next);
		expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(next).length * 0.6);
	});

	it('sends a changed field, a changed part and a part that moved to another vessel whole', () => {
		const p = pair();
		send(p, snap(1, [vessel(1, 0), vessel(2, 0)]));
		const b = snap(
			2,
			[
				vessel(1, 1, [part(10, 0, { resources: [{ resource: 'fuel', amount: 7 }] }), part(11, 1)]),
				vessel(2, 1, [part(20, 0), part(21, 1)])
			],
			{ rules: { drag: false } }
		);
		const r = send(p, b);
		expect(r.out).toEqual(b);
		expect(r.wire.same).not.toContain('rules');
		expect(r.wire.vessels[0]!.parts[0]!.same).toBeUndefined();
		expect(r.wire.vessels[0]!.parts[1]!.same).toBe(true);
		// part 11 leaves vessel 1 for vessel 2 (a dock or a split): still the same data, whole
		const c = snap(3, [
			vessel(1, 2, [part(10, 0, { resources: [{ resource: 'fuel', amount: 7 }] })]),
			vessel(2, 2, [part(20, 0), part(21, 1), part(11, 1)])
		]);
		expect(send(p, c).out).toEqual(c);
	});

	it('brings a new vessel whole, forgets a gone one, and a key that went away and came back', () => {
		const p = pair();
		send(p, snap(1, [vessel(1, 0)], { paused: true }));
		const noPause = snap(2, [vessel(1, 1), vessel(2, 0)]);
		expect(send(p, noPause).out).toEqual(noPause);
		expect(send(p, noPause).out).not.toHaveProperty('paused');
		const back = snap(3, [vessel(2, 1)], { paused: true });
		const r = send(p, back);
		expect(r.out).toEqual(back);
		const again = snap(4, [vessel(1, 1), vessel(2, 1)], { paused: true });
		expect(send(p, again).out).toEqual(again);
	});

	it('sends a part whose temperature went away without it', () => {
		const p = pair();
		send(p, snap(1, [vessel(1, 0)]));
		const bare = vessel(1, 1);
		delete (bare.parts[0] as { temperature?: number }).temperature;
		const r = send(p, snap(2, [bare]));
		expect(r.out.vessels[0]!.parts[0]).not.toHaveProperty('temperature');
	});
});
