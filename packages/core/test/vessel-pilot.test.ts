/** Plan 310, ADR 0271: the vessel pilot's read-outs and the commands it sends. */
import { describe, expect, test } from 'bun:test';
import {
	createVesselPilot,
	entityId,
	partId,
	type Command,
	type PortSnapshot,
	type VesselSnapshot
} from '../src/index.ts';

const q0 = { x: 0, y: 0, z: 0, w: 1 };
const port = (part: number, direction: { x: number; y: number; z: number }): PortSnapshot => ({
	part: entityId(part),
	size: 1.25,
	free: true,
	position: { x: 0, y: 0, z: 0 },
	direction,
	orientation: q0
});
const vessel = (id: number, extra: Partial<VesselSnapshot>): VesselSnapshot =>
	({
		id: entityId(id),
		name: `V${id}`,
		mode: 'flight',
		soi: 'home',
		position: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: q0,
		parts: [
			{
				id: entityId(id * 10),
				definition: 'x',
				position: { x: 0, y: 0, z: 0 },
				orientation: q0,
				modules: {}
			}
		],
		nextStage: 0,
		...extra
	}) as VesselSnapshot;

describe('vessel pilot (plan 310)', () => {
	// A chaser 20 m below the station's port, 3 m off its axis, closing at 0.4 m/s; ports face to face
	const chaser = vessel(1, {
		controlPart: entityId(11),
		parts: [
			{
				id: entityId(10),
				definition: partId('test.core'),
				position: { x: 0, y: 0, z: 0 },
				orientation: q0,
				modules: {}
			},
			{
				id: entityId(11),
				definition: partId('test.port'),
				position: { x: 0, y: 1, z: 0 },
				orientation: q0,
				modules: {}
			}
		],
		ports: [port(11, { x: 0, y: 1, z: 0 })],
		resources: [
			{ resource: 'mono', amount: 5, capacity: 10, rate: 0, timeToEmpty: null, locked: false }
		],
		target: {
			kind: 'vessel',
			id: entityId(2),
			part: entityId(21),
			name: 'V2',
			position: { x: 3, y: 20, z: 0 },
			velocity: { x: 0, y: -0.4, z: 0 },
			distance: Math.hypot(3, 20),
			relativeSpeed: 0.4,
			approach: null
		}
	});
	const station = vessel(2, { ports: [port(21, { x: 0, y: -1, z: 0 })] });
	const sent: Command[] = [];
	const pilot = createVesselPilot({ t: 7, vessels: [chaser, station] }, entityId(1), (c) =>
		sent.push(c)
	);

	test('reads the port to port alignment', () => {
		expect(pilot.time).toBe(7);
		expect(pilot.controlPort?.part).toBe(entityId(11));
		expect(pilot.targetPort?.part).toBe(entityId(21));
		const a = pilot.alignment()!;
		expect(a.angle).toBeCloseTo(0, 9);
		expect(a.along).toBeCloseTo(20, 9);
		expect(a.lateralDistance).toBeCloseTo(3, 9);
		expect(a.lateral.x).toBeCloseTo(-3, 9);
		expect(a.closing).toBeCloseTo(0.4, 9);
		expect(a.sameSize).toBe(true);
		const rel = pilot.relative()!;
		expect(rel.localPosition).toEqual({ x: 3, y: 20, z: 0 });
		expect(rel.closing).toBeGreaterThan(0.38);
		expect(pilot.resource('mono')).toEqual({ amount: 5, capacity: 10 });
		expect(pilot.resource('other')).toBeUndefined();
	});

	test('every control is a command for its own vessel, clamped', () => {
		sent.length = 0;
		pilot.translate(2, -0.5, Number.NaN);
		pilot.pointAt({ x: 0, y: -1, z: 0 });
		pilot.rcs(true);
		pilot.throttle(3);
		pilot.setTargetPort(entityId(2), entityId(21));
		pilot.controlFrom(null);
		expect(sent).toEqual([
			{
				type: 'attitude',
				vessel: entityId(1),
				pitch: 0,
				yaw: 0,
				roll: 0,
				translate: { x: 1, y: -0.5, z: 0 }
			},
			{ type: 'sas', vessel: entityId(1), mode: 'direction', direction: { x: 0, y: -1, z: 0 } },
			{ type: 'set-rcs', vessel: entityId(1), on: true },
			{ type: 'throttle', vessel: entityId(1), value: 1 },
			{
				type: 'target-set',
				vessel: entityId(1),
				target: { kind: 'vessel', id: entityId(2), part: entityId(21) }
			},
			{ type: 'set-control-part', vessel: entityId(1), part: null }
		]);
	});

	test('no alignment without a control port', () => {
		const p = createVesselPilot(
			{ t: 0, vessels: [{ ...chaser, controlPart: undefined } as VesselSnapshot, station] },
			entityId(1),
			() => undefined
		);
		expect(p.alignment()).toBeUndefined();
		expect(p.controlPart).toBe(entityId(10));
	});
});
