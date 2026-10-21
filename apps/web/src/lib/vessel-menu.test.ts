/** Plan 310: the Flight view's vessel menu and hover line. */
import { describe, expect, it } from 'vitest';
import type { EntityId, Snapshot, VesselSnapshot } from '@orbital/core';
import {
	refreshVesselMenu,
	runVesselMenuAction,
	vesselMenu,
	vesselNearPoint,
	vesselTooltip
} from './vessel-menu';

const id = (n: number) => n as EntityId;
const vessel = (n: number, extra: Partial<VesselSnapshot> = {}): VesselSnapshot =>
	({
		id: id(n),
		name: `V${n}`,
		mode: 'flight',
		soi: 'home',
		position: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: { x: 0, y: 0, z: 0, w: 1 },
		parts: [
			{
				id: id(n * 10),
				definition: 'x',
				position: { x: 0, y: 0, z: 0 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				modules: {}
			}
		],
		nextStage: 0,
		...extra
	}) as VesselSnapshot;
const snapshot = (vessels: VesselSnapshot[]): Snapshot =>
	({
		t: 0,
		vessels,
		bodies: [{ id: 'home', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }]
	}) as unknown as Snapshot;
const port = (part: number, free = true) => ({
	part: id(part),
	size: 1.25,
	free,
	position: { x: 0, y: 0, z: 0 },
	direction: { x: 0, y: 1, z: 0 },
	orientation: { x: 0, y: 0, z: 0, w: 1 }
});

describe('vessel menu (plan 310)', () => {
	it('shows distance, relative speed and the free ports of the picked vessel', () => {
		const s = snapshot([
			vessel(1),
			vessel(2, {
				position: { x: 30, y: 40, z: 0 },
				velocity: { x: 0, y: 0.5, z: 0 },
				ports: [port(21), port(22, false), port(23)]
			})
		]);
		const m = vesselMenu(s, id(1), id(2))!;
		expect(m.name).toBe('V2');
		expect(m.distance).toBeCloseTo(50);
		expect(m.relativeSpeed).toBeCloseTo(0.5);
		expect(m.ports.map((p) => p.part)).toEqual([id(21), id(23)]);
		expect(m.controlBlocked).toBeNull();
		expect(m.focusPart).toBe(id(20));
		expect(vesselTooltip(m)).toContain('V2');
		expect(vesselTooltip(m)).toContain('50');
	});

	it('marks the targeted port and uses the target read-out', () => {
		const s = snapshot([
			vessel(1, {
				target: {
					kind: 'vessel',
					id: id(2),
					part: id(23),
					name: 'V2',
					position: { x: 0, y: 12, z: 0 },
					velocity: { x: 0, y: -0.2, z: 0 },
					distance: 12,
					relativeSpeed: 0.2,
					approach: null
				}
			}),
			vessel(2, { position: { x: 0, y: 13, z: 0 }, ports: [port(21), port(23)] })
		]);
		const m = vesselMenu(s, id(1), id(2))!;
		expect(m.targeted).toBe(true);
		expect(m.distance).toBe(12);
		expect(m.ports.find((p) => p.targeted)?.part).toBe(id(23));
	});

	it('refuses control of another agency’s vessel and has no menu for the flown one', () => {
		const s = snapshot([vessel(1), vessel(2, { owner: 'rival' })]);
		expect(vesselMenu(s, id(1), id(2))!.controlBlocked).toContain('agency');
		expect(vesselMenu(s, id(1), id(1))).toBeNull();
		expect(vesselMenu(s, id(1), id(9))).toBeNull();
	});

	it('picks a far vessel by its projected point', () => {
		const s = snapshot([vessel(1), vessel(2, { position: { x: 100, y: 0, z: 0 } })]);
		const project = (w: { x: number }) => ({ x: w.x, y: 50 });
		expect(vesselNearPoint(s, id(1), 108, 55, project)).toBe(id(2));
		expect(vesselNearPoint(s, id(1), 140, 55, project)).toBeNull();
	});
});

describe('vessel menu actions (plan 310, the decouple crash)', () => {
	const fx = () => {
		const calls: string[] = [];
		return {
			calls,
			fx: {
				switchVessel: (v: EntityId) => calls.push(`switch ${v}`),
				command: (c: { type: string }) => calls.push(c.type),
				focusPart: (p: EntityId | null) => calls.push(`focus ${p}`)
			}
		};
	};
	const open = (s: Snapshot) => ({ menu: vesselMenu(s, id(1), id(2))!, x: 5, y: 5 });

	it('switching from the menu switches once and closes it', () => {
		const s = snapshot([vessel(1), vessel(2)]);
		const { calls, fx: f } = fx();
		expect(runVesselMenuAction(open(s), id(1), { kind: 'control' }, f)).toBe(false);
		expect(calls).toEqual(['switch 2']);
	});

	it('an action on a menu that was closed meanwhile does nothing and does not throw', () => {
		const { calls, fx: f } = fx();
		for (const action of [
			{ kind: 'control' },
			{ kind: 'target' },
			{ kind: 'port', part: id(21) },
			{ kind: 'focus' },
			{ kind: 'rename', name: 'X' }
		] as const)
			expect(runVesselMenuAction(null, id(1), action, f)).toBe(false);
		expect(calls).toEqual([]);
	});

	it('targeting keeps the menu open; without a flown vessel nothing is sent', () => {
		const s = snapshot([vessel(1), vessel(2, { ports: [port(21)] })]);
		const { calls, fx: f } = fx();
		expect(runVesselMenuAction(open(s), id(1), { kind: 'port', part: id(21) }, f)).toBe(true);
		expect(runVesselMenuAction(open(s), null, { kind: 'target' }, f)).toBe(true);
		expect(calls).toEqual(['target-set']);
	});

	it('closes when its vessel is destroyed or docked away, or becomes the flown one', () => {
		const s = snapshot([vessel(1), vessel(2)]);
		const o = open(s);
		expect(refreshVesselMenu(o, snapshot([vessel(1)]), id(1))).toBeNull();
		expect(refreshVesselMenu(o, s, id(2))).toBeNull();
		expect(refreshVesselMenu(null, s, id(1))).toBeNull();
	});

	it('opened during a decouple, it follows the new piece as the snapshots arrive', () => {
		// the spent stage appears as vessel 2 next to the flown vessel 1
		const s1 = snapshot([vessel(1), vessel(2, { position: { x: 0, y: -10, z: 0 } })]);
		const o = open(s1);
		const s2 = snapshot([vessel(1), vessel(2, { position: { x: 0, y: -30, z: 0 } })]);
		const next = refreshVesselMenu(o, s2, id(1))!;
		expect(next.menu.distance).toBeCloseTo(30);
		expect(next.x).toBe(5);
	});
});
