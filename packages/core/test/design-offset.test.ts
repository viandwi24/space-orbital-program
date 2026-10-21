/** Design format 4 (plan 279, ADR 0258): the part offset, its migration and the tilt angles of a matrix. */
import { describe, expect, test } from 'bun:test';
import {
	DESIGN_FORMAT_VERSION,
	mat3OfQuat,
	migrateVesselDesign,
	partId,
	resolveVesselDesign,
	tiltMatrix,
	tiltOfMatrix,
	vesselDesignSchema,
	type PartDefinition,
	type VesselDesign
} from '../src/index.ts';

const stackNodes = (h: number) => ({
	top: {
		pos: [0, h / 2, 0] as [number, number, number],
		dir: [0, 1, 0] as [number, number, number]
	},
	bottom: {
		pos: [0, -h / 2, 0] as [number, number, number],
		dir: [0, -1, 0] as [number, number, number]
	}
});
const defs = new Map<string, PartDefinition>([
	[
		'test.pod',
		{
			id: 'test.pod',
			title: 'pod',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.5, height: 1 },
			attach: stackNodes(1)
		}
	],
	[
		'test.tank',
		{
			id: 'test.tank',
			title: 'tank',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.5, height: 2 },
			attach: stackNodes(2)
		}
	],
	[
		'test.plate',
		{
			id: 'test.plate',
			title: 'plate',
			mass: 1,
			shape: { kind: 'box', size: [0.2, 0.4, 0.4] },
			attach: { radial: { pos: [-0.1, 0, 0], dir: [-1, 0, 0] } }
		}
	]
]);
const lookup = { get: (id: string) => defs.get(id) };
const pod = { index: 0, part: partId('test.pod'), parent: null };
const tank = (index: number, parent: number) => ({
	index,
	part: partId('test.tank'),
	parent: { index: parent, parentNode: 'bottom', node: 'top' }
});
const design = (
	parts: VesselDesign['parts'],
	formatVersion: VesselDesign['formatVersion'] = 4
): VesselDesign => ({ formatVersion, name: 'v4', parts, stages: [] });
const ok = (d: VesselDesign) => {
	const r = resolveVesselDesign(d, lookup);
	if (!r.ok) throw new Error(r.errors.join('; '));
	return r.parts;
};
const round = (v: number) => Math.round(v * 1e9) / 1e9 + 0;

describe('the part offset (format 4)', () => {
	test('a stack child moves by its offset; its own child moves with it', () => {
		const parts = ok(
			design([pod, { ...tank(1, 0), offset: { x: 0.3, y: -0.2, z: 0.1 } }, tank(2, 1)])
		);
		// without the offset the tank stands at (0, -1.5, 0) and the next at (0, -3.5, 0)
		expect([parts[1]!.position.x, parts[1]!.position.y, parts[1]!.position.z].map(round)).toEqual([
			0.3, -1.7, 0.1
		]);
		expect([parts[2]!.position.x, parts[2]!.position.y, parts[2]!.position.z].map(round)).toEqual([
			0.3, -3.7, 0.1
		]);
		// an offset alone does not turn anything
		expect(parts.every((p) => !p.tilted)).toBe(true);
	});

	test('the offset is in the parent’s axes: under a tank turned a quarter about Z, +Y of the offset is -X', () => {
		const parts = ok(
			design([
				pod,
				{ ...tank(1, 0), tilt: { x: 0, y: 0, z: Math.PI / 2 } },
				{ ...tank(2, 1), offset: { x: 0, y: 0.5, z: 0 } }
			])
		);
		const plain = ok(
			design([pod, { ...tank(1, 0), tilt: { x: 0, y: 0, z: Math.PI / 2 } }, tank(2, 1)])
		);
		expect(round(parts[2]!.position.x - plain[2]!.position.x)).toBe(-0.5);
		expect(round(parts[2]!.position.y - plain[2]!.position.y)).toBe(0);
	});

	test('offset and tilt together: the tilt pivots about the moved attach point', () => {
		const tilt = { x: 0, y: 0, z: Math.PI / 2 };
		const moved = ok(design([pod, { ...tank(1, 0), tilt, offset: { x: 0.2, y: 0, z: 0 } }]));
		const still = ok(design([pod, { ...tank(1, 0), tilt }]));
		expect(round(moved[1]!.position.x - still[1]!.position.x)).toBe(0.2);
		expect(moved[1]!.rotation).toEqual(still[1]!.rotation);
	});

	test('a radial child takes the offset in its parent’s axes too', () => {
		const radial = {
			index: 1,
			part: partId('test.plate'),
			parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } }
		};
		const a = ok(design([pod, radial]));
		const b = ok(design([pod, { ...radial, offset: { x: 0.1, y: 0.25, z: -0.05 } }]));
		expect(round(b[1]!.position.x - a[1]!.position.x)).toBe(0.1);
		expect(round(b[1]!.position.y - a[1]!.position.y)).toBe(0.25);
		expect(round(b[1]!.position.z - a[1]!.position.z)).toBe(-0.05);
	});

	test('the root ignores an offset, like a tilt', () => {
		const parts = ok(design([{ ...pod, offset: { x: 5, y: 0, z: 0 } }, tank(1, 0)]));
		expect(parts[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
	});

	test('an offset needs format 4 and finite numbers', () => {
		const r = resolveVesselDesign(
			design([pod, { ...tank(1, 0), offset: { x: 1, y: 0, z: 0 } }], 3),
			lookup
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.join('; ')).toContain('formatVersion 4');
		const bad = resolveVesselDesign(
			design([pod, { ...tank(1, 0), offset: { x: Number.NaN, y: 0, z: 0 } }]),
			lookup
		);
		expect(bad.ok).toBe(false);
	});

	test('the schema carries the offset and free placement', () => {
		const d: VesselDesign = {
			...design([pod, { ...tank(1, 0), offset: { x: 0.1, y: 0, z: -0.3 } }]),
			freePlacement: true
		};
		expect(vesselDesignSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
		expect(
			vesselDesignSchema.safeParse({
				...d,
				parts: [pod, { ...tank(1, 0), offset: { x: 'a', y: 0, z: 0 } }]
			}).success
		).toBe(false);
	});
});

describe('migration 3 -> 4', () => {
	test('format 1, 2 and 3 designs resolve identically after migration to 4', () => {
		const radial = {
			index: 2,
			part: partId('test.plate'),
			parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle: 1, y: 0.5 } },
			tilt: { x: 0.1, y: 0.2, z: 0.3 }
		};
		for (const version of [1, 2, 3] as const) {
			const parts =
				version === 1
					? [pod, tank(1, 0)]
					: version === 2
						? [pod, tank(1, 0), { ...radial, tilt: undefined }]
						: [pod, tank(1, 0), radial];
			const old = design(JSON.parse(JSON.stringify(parts)), version);
			const migrated = migrateVesselDesign(old);
			expect(migrated.formatVersion).toBe(DESIGN_FORMAT_VERSION);
			expect(DESIGN_FORMAT_VERSION).toBe(4);
			expect(JSON.stringify(resolveVesselDesign(migrated, lookup))).toBe(
				JSON.stringify(resolveVesselDesign(old, lookup))
			);
			expect(JSON.stringify({ ...migrated, formatVersion: version })).toBe(JSON.stringify(old));
		}
	});

	test('a format 4 design stays as it is', () => {
		const d = design([pod, tank(1, 0)]);
		expect(migrateVesselDesign(d)).toBe(d);
	});
});

describe('tiltOfMatrix', () => {
	test('inverts tiltMatrix for angles past a quarter turn', () => {
		for (const t of [
			{ x: 0.3, y: -0.4, z: 2.5 },
			{ x: -2.9, y: 1.2, z: -0.7 },
			{ x: Math.PI, y: 0, z: 0 },
			{ x: 0, y: 0, z: -Math.PI / 2 }
		]) {
			const back = tiltMatrix(tiltOfMatrix(tiltMatrix(t)));
			const m = tiltMatrix(t);
			for (let i = 0; i < 9; i++) expect(back[i]!).toBeCloseTo(m[i]!, 9);
		}
	});

	test('at gimbal lock the matrix still comes back', () => {
		const m = tiltMatrix({ x: 0.4, y: Math.PI / 2, z: 0.1 });
		const back = tiltMatrix(tiltOfMatrix(m));
		for (let i = 0; i < 9; i++) expect(back[i]!).toBeCloseTo(m[i]!, 9);
	});

	test('a resolved tilted part’s rotation equals its tilt matrix under an upright parent', () => {
		const t = { x: 2.4, y: -0.5, z: 1.9 };
		const parts = ok(design([pod, { ...tank(1, 0), tilt: t }]));
		const m = mat3OfQuat(parts[1]!.rotation);
		const want = tiltMatrix(t);
		for (let i = 0; i < 9; i++) expect(m[i]!).toBeCloseTo(want[i]!, 9);
	});
});
