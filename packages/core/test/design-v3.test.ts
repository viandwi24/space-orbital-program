import { describe, expect, test } from 'bun:test';
import {
	mat3OfQuat,
	migrateVesselDesign,
	partDefinitionSchema,
	partId,
	resolveVesselDesign,
	surfaceSite,
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
		'test.wing',
		{
			id: 'test.wing',
			title: 'wing',
			mass: 1,
			shape: { kind: 'box', size: [2, 0.1, 1] },
			attach: { radial: { pos: [-1, 0, 0], dir: [-1, 0, 0] } }
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
		'test.strut',
		{
			id: 'test.strut',
			title: 'strut',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.05, height: 0.1 },
			connector: {},
			attach: { end: { pos: [-0.05, 0, 0], dir: [-1, 0, 0] } }
		}
	]
]);
const lookup = { get: (id: string) => defs.get(id) };
const pod = { index: 0, part: partId('test.pod'), parent: null };
const stackLink = (index: number, parent: number, part = 'test.tank') => ({
	index,
	part: partId(part),
	parent: { index: parent, parentNode: 'bottom', node: 'top' }
});
const radialLink = (index: number, parent: number, part: string, angle: number, y = 0) => ({
	index,
	part: partId(part),
	parent: {
		index: parent,
		parentNode: 'surface',
		node: part === 'test.strut' ? 'end' : 'radial',
		radial: { angle, y }
	}
});
const v3 = (parts: VesselDesign['parts'], formatVersion: 1 | 2 | 3 = 3): VesselDesign => ({
	formatVersion,
	name: 'v3',
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

describe('tilted parts (ADR 0071)', () => {
	test('a tank tilted a quarter turn about Z pivots on the attach point; its child follows (hand values)', () => {
		// Rz(pi/2) sends +Y to -X. Child node (0, 1, 0) lands on the pod's bottom node (0, -0.5, 0):
		// origin = (0, -0.5, 0) - R (0, 1, 0) = (1, -0.5, 0). The next tank hangs from its bottom node
		// (0, -1, 0) -> (1, 0, 0) in the world, so its origin is (2, -0.5, 0) + (1, 0, 0) = (3, -0.5, 0).
		const parts = ok(
			v3([pod, { ...stackLink(1, 0), tilt: { x: 0, y: 0, z: Math.PI / 2 } }, stackLink(2, 1)])
		);
		expect(parts[1]!.position.x).toBeCloseTo(1, 12);
		expect(parts[1]!.position.y).toBeCloseTo(-0.5, 12);
		expect(parts[2]!.position.x).toBeCloseTo(3, 12);
		expect(parts[2]!.position.y).toBeCloseTo(-0.5, 12);
		expect(parts[1]!.tilted && parts[2]!.tilted).toBe(true);
		expect(parts[0]!.tilted).toBe(false);
		// The child's +Y axis points along -X, and so does its child's.
		for (const p of [parts[1]!, parts[2]!]) {
			const m = mat3OfQuat(p.rotation);
			expect([m[1], m[4], m[7]].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([-1, 0, 0]);
		}
	});

	test('the tilt order is Rx Ry Rz: Z first, then Y, then X', () => {
		const parts = ok(
			v3([pod, { ...stackLink(1, 0), tilt: { x: Math.PI / 2, y: 0, z: Math.PI / 2 } }])
		);
		// +Y -(Rz)-> -X -(Rx)-> -X (X is the axis).
		const m = mat3OfQuat(parts[1]!.rotation);
		expect([m[1], m[4], m[7]].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([-1, 0, 0]);
		// +X -(Rz)-> +Y -(Rx)-> +Z.
		expect([m[0], m[3], m[6]].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([0, 0, 1]);
	});

	test('a tilt of zero changes nothing', () => {
		const flat = ok(v3([pod, stackLink(1, 0)]));
		const zero = ok(v3([pod, { ...stackLink(1, 0), tilt: { x: 0, y: 0, z: 0 } }]));
		expect(zero[1]!.position).toEqual(flat[1]!.position);
		expect(zero[1]!.tilted).toBe(false);
	});
});

describe('radial attachment to a box (ADR 0071)', () => {
	test('the ray from the axis picks the face: its distance and normal (hand values)', () => {
		expect(surfaceSite({ kind: 'box', size: [2, 0.1, 1] }, 0)).toEqual({ radius: 1, normal: 0 });
		const s = surfaceSite({ kind: 'box', size: [2, 0.1, 1] }, Math.PI / 2)!;
		expect(s.radius).toBeCloseTo(0.5, 12);
		expect(s.normal).toBeCloseTo(Math.PI / 2, 12);
		const diagonal = surfaceSite({ kind: 'box', size: [2, 0.1, 1] }, Math.PI / 4)!;
		// z face reached first: 0.5 / sin 45 deg.
		expect(diagonal.radius).toBeCloseTo(0.5 / Math.sin(Math.PI / 4), 12);
		expect(surfaceSite(undefined, 0)).toBeUndefined();
	});

	test('a plate on the end face and on the leading edge of a wing box (hand values)', () => {
		const parts = ok(
			v3([
				{ index: 0, part: partId('test.wing'), parent: null },
				radialLink(1, 0, 'test.plate', 0),
				radialLink(2, 0, 'test.plate', Math.PI / 2)
			])
		);
		// +X face at x = 1: plate node (-0.1, 0, 0) on it, no turn: origin (1.1, 0, 0).
		expect(parts[1]!.position.x).toBeCloseTo(1.1, 12);
		expect(parts[1]!.yaw).toBeCloseTo(0, 12);
		// -Z face at z = -0.5 (angle pi/2 sends +X to -Z), facing outward: origin (0, 0, -0.6).
		expect(parts[2]!.position.x).toBeCloseTo(0, 12);
		expect(parts[2]!.position.z).toBeCloseTo(-0.6, 12);
		expect(parts[2]!.yaw).toBeCloseTo(Math.PI / 2, 12);
	});

	test('needs version 3 and a height inside the box', () => {
		const onBox = [
			{ index: 0, part: partId('test.wing'), parent: null },
			radialLink(1, 0, 'test.plate', 0)
		];
		expect(err(v3(onBox, 2))).toContain('box parent needs formatVersion 3');
		expect(err(v3([onBox[0]!, radialLink(1, 0, 'test.plate', 0, 0.2)]))).toContain(
			'outside parent'
		);
	});
});

describe('connector links (ADR 0071)', () => {
	const base = [pod, stackLink(1, 0), radialLink(2, 1, 'test.plate', Math.PI / 2, 0)];

	test('a link resolves to the surface point of its target (hand values)', () => {
		// The plate sits on the tank (r 0.5) at angle pi/2, y 0: origin (0, -1.5, -0.6), turned pi/2.
		// The strut ends on the plate's own surface at angle 0, y 0.1: the plate's +X face at
		// 0.1 m, which the turn sends to -Z: (0, -1.5 + 0.1, -0.7).
		const d = v3([
			...base.slice(0, 3),
			{ ...radialLink(3, 0, 'test.strut', 0), link: { index: 2, angle: 0, y: 0.1 } }
		]);
		const resolved = ok(d);
		const strut = resolved.find((p) => p.index === 3)!;
		expect(strut.link?.index).toBe(2);
		expect(strut.link!.point.x).toBeCloseTo(0, 12);
		expect(strut.link!.point.y).toBeCloseTo(-1.5 + 0.1, 12);
		expect(strut.link!.point.z).toBeCloseTo(-0.7, 12);
	});

	test('refusals', () => {
		const strut = (link?: { index: number; angle: number; y: number }) =>
			v3([
				...base.slice(0, 3),
				{ ...radialLink(3, 0, 'test.strut', 0), ...(link ? { link } : {}) }
			]);
		expect(err(strut())).toContain('needs a link');
		expect(err(strut({ index: 3, angle: 0, y: 0 }))).toContain('own part');
		expect(err(strut({ index: 9, angle: 0, y: 0 }))).toContain('does not exist');
		expect(err(strut({ index: 2, angle: 0, y: 5 }))).toContain('outside target');
		const onPlain = v3([pod, { ...stackLink(1, 0), link: { index: 0, angle: 0, y: 0 } }]);
		expect(err(onPlain)).toContain('not a connector part');
		const old = v3(
			[
				...base.slice(0, 3),
				{ ...radialLink(3, 0, 'test.strut', 0), link: { index: 2, angle: 0, y: 0 } }
			],
			2
		);
		expect(err(old)).toContain('formatVersion 3');
		const twoStruts = v3([
			...base.slice(0, 3),
			{ ...radialLink(3, 0, 'test.strut', 0), link: { index: 2, angle: 0, y: 0 } },
			{ ...radialLink(4, 3, 'test.strut', 0), link: { index: 3, angle: 0, y: 0 } }
		]);
		expect(err(twoStruts)).toContain('another connector');
	});
});

describe('format 3 and older designs', () => {
	test('the schema carries tilt and link', () => {
		const d = v3([
			pod,
			{ ...stackLink(1, 0), tilt: { x: 0.1, y: 0, z: -0.2 } },
			{ ...radialLink(2, 0, 'test.strut', 0), link: { index: 1, angle: 0.5, y: 0.25 } }
		]);
		expect(vesselDesignSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
		expect(
			partDefinitionSchema.safeParse({ id: 'a.b', title: 't', mass: 1, connector: { feeds: true } })
				.success
		).toBe(true);
	});

	test('version 1 and 2 designs resolve identically after migration', () => {
		for (const version of [1, 2] as const) {
			const old = v3([pod, stackLink(1, 0), stackLink(2, 1)], version);
			const a = resolveVesselDesign(old, lookup);
			const migrated = migrateVesselDesign(old);
			expect(migrated.formatVersion).toBe(4);
			expect(JSON.stringify(resolveVesselDesign(migrated, lookup))).toBe(JSON.stringify(a));
			expect(JSON.stringify({ ...migrated, formatVersion: version })).toBe(JSON.stringify(old));
		}
	});

	test('a frozen version 2 booster design keeps its resolved positions', () => {
		const fixture = JSON.parse(
			'{"formatVersion":2,"name":"frozen","parts":[{"index":0,"part":"test.pod","parent":null},{"index":1,"part":"test.tank","parent":{"index":0,"parentNode":"bottom","node":"top"}},{"index":2,"part":"test.plate","symmetry":1,"parent":{"index":1,"parentNode":"surface","node":"radial","radial":{"angle":1.5707963267948966,"y":0.5}}}],"stages":[[2]]}'
		) as VesselDesign;
		const parts = ok(fixture);
		expect(parts.map((p) => [p.position.x, p.position.y, p.position.z])).toEqual([
			[0, 0, 0],
			[0, -1.5, 0],
			[expect.closeTo(0, 12), -1, expect.closeTo(-0.6, 12)]
		]);
		expect(parts.every((p) => !p.tilted)).toBe(true);
	});
});

describe('tilt of a radial part turns about the parent axes (ADR 0071)', () => {
	test('two wings on opposite sides with the same tilt are mirror images (hand values)', () => {
		const wing = (index: number, angle: number) => ({
			...radialLink(index, 0, 'test.wing', angle),
			tilt: { x: 0.1, y: 0, z: 0 }
		});
		const parts = ok(
			v3([{ index: 0, part: partId('test.tank'), parent: null }, wing(1, 0), wing(2, Math.PI)])
		);
		// The wing's chord (its local +Y) is turned towards +Z of the parent by 0.1 rad on both sides.
		for (const p of [parts[1]!, parts[2]!]) {
			const m = mat3OfQuat(p.rotation);
			expect(m[1]).toBeCloseTo(0, 12);
			expect(m[4]).toBeCloseTo(Math.cos(0.1), 12);
			expect(m[7]).toBeCloseTo(Math.sin(0.1), 12);
		}
		// Their span axes point outward, opposite each other.
		expect(mat3OfQuat(parts[1]!.rotation)[0]).toBeCloseTo(1, 12);
		expect(mat3OfQuat(parts[2]!.rotation)[0]).toBeCloseTo(-1, 12);
	});
});
