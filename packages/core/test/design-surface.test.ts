/** Surface links (plan 244, ADR 0235): a part attached to a point and normal of its parent's surface. */
import { describe, expect, test } from 'bun:test';
import {
	mat3Apply,
	mat3OfQuat,
	partId,
	placeSurface,
	resolveVesselDesign,
	rotationBetween,
	vesselDesignSchema,
	type Mat3,
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
	],
	[
		'test.box',
		{
			id: 'test.box',
			title: 'box',
			mass: 1,
			shape: { kind: 'box', size: [1, 1, 1] },
			attach: stackNodes(1)
		}
	]
]);
const lookup = { get: (id: string) => defs.get(id) };
const pod = { index: 0, part: partId('test.pod'), parent: null };
type Surface = { point: [number, number, number]; normal: [number, number, number] };
const onSurface = (index: number, part: string, node: string, surface: Surface, parent = 0) => ({
	index,
	part: partId(part),
	parent: { index: parent, parentNode: 'surface', node, surface }
});
const design = (parts: VesselDesign['parts'], formatVersion: 1 | 2 | 3 = 3): VesselDesign => ({
	formatVersion,
	name: 'surface',
	parts,
	stages: []
});
const ok = (d: VesselDesign) => {
	const r = resolveVesselDesign(d, lookup);
	if (!r.ok) throw new Error(r.errors.join('; '));
	return r.parts;
};
const err = (d: VesselDesign): string => {
	const r = resolveVesselDesign(d, lookup);
	if (r.ok) throw new Error('expected a refusal');
	return r.errors.join('; ');
};
const near = (a: { x: number; y: number; z: number }, b: readonly [number, number, number]) => {
	expect(a.x).toBeCloseTo(b[0], 9);
	expect(a.y).toBeCloseTo(b[1], 9);
	expect(a.z).toBeCloseTo(b[2], 9);
};

describe('rotationBetween', () => {
	const turns = (m: Mat3, a: [number, number, number], b: [number, number, number]) =>
		near(mat3Apply(m, a), b);
	test('takes one unit vector to another, and keeps the ones about its axis', () => {
		turns(rotationBetween([1, 0, 0], [0, 1, 0]), [1, 0, 0], [0, 1, 0]);
		const s = Math.SQRT1_2;
		turns(rotationBetween([-1, 0, 0], [-s, -s, 0]), [-1, 0, 0], [-s, -s, 0]);
		turns(rotationBetween([1, 0, 0], [1, 0, 0]), [0, 1, 0], [0, 1, 0]);
	});
	test('opposite vectors: a half turn about the vertical, about X for a vertical vector', () => {
		turns(rotationBetween([1, 0, 0], [-1, 0, 0]), [1, 0, 0], [-1, 0, 0]);
		turns(rotationBetween([1, 0, 0], [-1, 0, 0]), [0, 1, 0], [0, 1, 0]);
		turns(rotationBetween([0, 1, 0], [0, -1, 0]), [0, 1, 0], [0, -1, 0]);
	});
});

describe('a surface link on a top face', () => {
	test('a tank stands upright on the pod, off the axis, its bottom node on the point', () => {
		const parts = ok(
			design([
				pod,
				onSurface(1, 'test.tank', 'bottom', { point: [0.2, 0.5, 0], normal: [0, 1, 0] })
			])
		);
		// origin = point - R * (0, -1, 0) = (0.2, 1.5, 0), no turn
		near(parts[1]!.position, [0.2, 1.5, 0]);
		expect(parts[1]!.tilted).toBe(false);
		expect(parts[1]!.yaw).toBeCloseTo(0, 12);
		// children follow: a pod on the tank's top node
		const more = ok(
			design([
				pod,
				onSurface(1, 'test.tank', 'bottom', { point: [0.2, 0.5, 0], normal: [0, 1, 0] }),
				{
					index: 2,
					part: partId('test.pod'),
					parent: { index: 1, parentNode: 'top', node: 'bottom' }
				}
			])
		);
		near(more[2]!.position, [0.2, 3.0, 0]);
	});

	test('the bottom face takes the part hanging down: a normal of -Y turns a node facing up to face it', () => {
		const parts = ok(
			design([pod, onSurface(1, 'test.tank', 'top', { point: [0, -0.5, 0.1], normal: [0, -1, 0] })])
		);
		near(parts[1]!.position, [0, -1.5, 0.1]);
		expect(parts[1]!.tilted).toBe(false);
	});

	test('a box parent takes a part on its top face', () => {
		const d = design([
			{ index: 0, part: partId('test.box'), parent: null },
			onSurface(1, 'test.pod', 'bottom', { point: [0.3, 0.5, -0.2], normal: [0, 1, 0] })
		]);
		near(ok(d)[1]!.position, [0.3, 1, -0.2]);
	});
});

describe('a surface link on a slope', () => {
	test('a plate on a slanted face: its node on the point, its direction against the normal, tilted', () => {
		const s = Math.SQRT1_2;
		const point: [number, number, number] = [0.3, 0.1, 0];
		const normal: [number, number, number] = [s, s, 0];
		const parts = ok(design([pod, onSurface(1, 'test.plate', 'radial', { point, normal })]));
		const p = parts[1]!;
		expect(p.tilted).toBe(true);
		const m = mat3OfQuat(p.rotation) as unknown as Mat3;
		// the node's world position is the point; its world direction is against the normal
		const nodeAt = mat3Apply(m, [-0.1, 0, 0]);
		near(
			{ x: p.position.x + nodeAt.x, y: p.position.y + nodeAt.y, z: p.position.z + nodeAt.z },
			point
		);
		near(mat3Apply(m, [-1, 0, 0]), [-s, -s, 0]);
	});

	test('a horizontal normal is a radial link: the same place, yaw and rotation as the radial form', () => {
		const side = ok(
			design([
				pod,
				onSurface(1, 'test.plate', 'radial', { point: [0.5, 0.2, 0], normal: [1, 0, 0] })
			])
		)[1]!;
		const radial = ok(
			design([
				pod,
				{
					index: 1,
					part: partId('test.plate'),
					parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0.2 } }
				}
			])
		)[1]!;
		near(side.position, [radial.position.x, radial.position.y, radial.position.z]);
		expect(side.yaw).toBeCloseTo(radial.yaw, 12);
		expect(side.tilted).toBe(false);
	});

	test('placeSurface refuses a zero normal', () => {
		const parent = {
			position: { x: 0, y: 0, z: 0 },
			yaw: 0,
			rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Mat3,
			tilted: false
		};
		expect(
			placeSurface(
				parent,
				{ point: [0, 0, 0], normal: [0, 0, 0] },
				{ pos: [0, 0, 0], dir: [0, 1, 0] }
			)
		).toBeUndefined();
	});
});

describe('validation and the schema', () => {
	const top: Surface = { point: [0.2, 0.5, 0], normal: [0, 1, 0] };
	test('a surface link needs parentNode "surface", no radial, version 3, a normal and a point on the parent', () => {
		expect(
			err(
				design([
					pod,
					{
						index: 1,
						part: partId('test.tank'),
						parent: { index: 0, parentNode: 'top', node: 'bottom', surface: top }
					}
				])
			)
		).toContain('needs parentNode "surface"');
		expect(
			err(
				design([
					pod,
					{
						index: 1,
						part: partId('test.plate'),
						parent: {
							index: 0,
							parentNode: 'surface',
							node: 'radial',
							surface: top,
							radial: { angle: 0, y: 0 }
						}
					}
				])
			)
		).toContain('no radial position');
		expect(err(design([pod, onSurface(1, 'test.tank', 'bottom', top)], 2))).toContain(
			'needs formatVersion 3'
		);
		expect(
			err(
				design([
					pod,
					onSurface(1, 'test.tank', 'bottom', { point: [0, 0.5, 0], normal: [0, 0, 0] })
				])
			)
		).toContain('finite point and a normal');
		expect(
			err(
				design([
					pod,
					onSurface(1, 'test.tank', 'bottom', { point: [2, 0.5, 0], normal: [0, 1, 0] })
				])
			)
		).toContain('is not on parent #0');
		expect(err(design([pod, onSurface(1, 'test.tank', 'nope', top)]))).toContain('no node "nope"');
	});

	test('two parts at one surface point are refused', () => {
		expect(
			err(
				design([
					pod,
					onSurface(1, 'test.tank', 'bottom', top),
					onSurface(2, 'test.tank', 'bottom', top)
				])
			)
		).toContain('already at that surface point');
	});

	test('the schema keeps the link and refuses a non-finite one', () => {
		const d = design([pod, onSurface(1, 'test.tank', 'bottom', top)]);
		const parsed = vesselDesignSchema.safeParse(JSON.parse(JSON.stringify(d)));
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.parts[1]!.parent?.surface).toEqual(top);
		const bad = JSON.parse(JSON.stringify(d));
		bad.parts[1].parent.surface.point = [0, 'x', 0];
		expect(vesselDesignSchema.safeParse(bad).success).toBe(false);
	});
});
