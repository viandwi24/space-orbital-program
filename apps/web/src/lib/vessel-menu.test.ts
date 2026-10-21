/** Plan 310: the Flight view's vessel menu and hover line. */
import { describe, expect, it } from 'vitest';
import type { EntityId, Snapshot, VesselSnapshot } from '@orbital/core';
import { vesselMenu, vesselNearPoint, vesselTooltip } from './vessel-menu';

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
