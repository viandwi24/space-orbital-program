import { describe, expect, test } from 'bun:test';
import {
	commandSchema,
	partId,
	migrateVesselDesign,
	partDefinitionSchema,
	resolveVesselDesign,
	vesselDesignSchema,
	type PartDefinition,
	type VesselDesign
} from '../src/index.ts';

const stack = (id: string, height: number): PartDefinition => ({
	id,
	title: id,
	mass: 1,
	attach: {
		top: { pos: [0, height / 2, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -height / 2, 0], dir: [0, -1, 0] },
		side: { pos: [1, 0, 0], dir: [1, 0, 0] }
	}
});
const defs = new Map([
	['test.pod', stack('test.pod', 1)],
	['test.tank', stack('test.tank', 2)]
]);
const lookup = { get: (id: string) => defs.get(id) };

const link = (index: number, parent: number, parentNode = 'bottom', node = 'top') => ({
	index,
	part: partId('test.tank'),
	parent: { index: parent, parentNode, node }
});
const design = (overrides: Partial<VesselDesign> = {}): VesselDesign => ({
	formatVersion: 1,
	name: 'test',
	parts: [{ index: 0, part: partId('test.pod'), parent: null }, link(1, 0), link(2, 1)],
	stages: [[2]],
	...overrides
});

const errorsOf = (d: VesselDesign): string[] => {
	const r = resolveVesselDesign(d, lookup);
	if (r.ok) throw new Error('expected the design to be rejected');
	return r.errors;
};

describe('resolveVesselDesign', () => {
	test('a stack resolves with positions from node positions, in index order', () => {
		const r = resolveVesselDesign(design(), lookup);
		if (!r.ok) throw new Error(r.errors.join('; '));
		expect(r.root).toBe(0);
		expect(r.parts.map((p) => p.index)).toEqual([0, 1, 2]);
		// pod (h 1) bottom at -0.5; tank (h 2) top at +1 => origin at -0.5 - 1 = -1.5; next -1.5 - 2 = -3.5
		expect(r.parts.map((p) => p.position.y)).toEqual([0, -1.5, -3.5]);
	});

	test('indices need not be contiguous or ordered', () => {
		const d = design({
			parts: [link(9, 4), { index: 4, part: partId('test.pod'), parent: null }],
			stages: []
		});
		const r = resolveVesselDesign(d, lookup);
		expect(r.ok && r.parts.map((p) => p.index)).toEqual([4, 9]);
	});

	test('rejects duplicate indices, zero or two roots, unknown parts and parents', () => {
		expect(errorsOf(design({ parts: [...design().parts, link(1, 0)] }))[0]).toContain('duplicate');
		expect(errorsOf(design({ parts: design().parts.slice(1) })).join()).toContain(
			'exactly one root'
		);
		const two = [...design().parts, { index: 3, part: partId('test.pod'), parent: null }];
		expect(errorsOf(design({ parts: two })).join()).toContain('exactly one root');
		const unknown = design().parts.map((p) =>
			p.index === 1 ? { ...p, part: partId('test.nope') } : p
		);
		expect(errorsOf(design({ parts: unknown })).join()).toContain('unknown part "test.nope"');
		expect(errorsOf(design({ parts: [...design().parts, link(5, 77)] })).join()).toContain(
			'parent #77 does not exist'
		);
	});

	test('rejects a cycle, a self parent and an island', () => {
		const cyc = [
			{ index: 0, part: partId('test.pod'), parent: null },
			link(1, 2),
			link(2, 1, 'bottom', 'top')
		];
		expect(errorsOf(design({ parts: cyc })).join()).toContain('not connected to the root');
		expect(errorsOf(design({ parts: [...design().parts, link(3, 3)] })).join()).toContain(
			'own parent'
		);
	});

	test('rejects missing nodes, a node used twice and non anti-parallel nodes', () => {
		const badNode = design().parts.map((p) => (p.index === 1 ? link(1, 0, 'bottom', 'nope') : p));
		expect(errorsOf(design({ parts: badNode })).join()).toContain('has no node "nope"');
		const twice = [...design().parts, link(3, 0)];
		expect(errorsOf(design({ parts: twice })).join()).toContain('more than one attachment');
		const parallel = design().parts.map((p) =>
			p.index === 1 ? link(1, 0, 'bottom', 'bottom') : p
		);
		expect(errorsOf(design({ parts: parallel })).join()).toContain('face opposite');
		const radial = design().parts.map((p) => (p.index === 1 ? link(1, 0, 'side', 'top') : p));
		expect(errorsOf(design({ parts: radial })).join()).toContain('face opposite');
	});

	test('rejects stages that name unknown parts', () => {
		expect(errorsOf(design({ stages: [[0], [42]] })).join()).toContain('stage 1');
	});
});

describe('protocol schemas', () => {
	test('a design survives a JSON round trip through the schema', () => {
		const d = design();
		expect(vesselDesignSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
		expect(vesselDesignSchema.safeParse({ ...d, formatVersion: 3 }).success).toBe(false);
		expect(vesselDesignSchema.safeParse({ ...d, stages: undefined }).success).toBe(false);
		expect(vesselDesignSchema.safeParse({ ...d, parts: [] }).success).toBe(false);
	});

	test('commands: valid ones parse, malformed ones are rejected', () => {
		const ok = [
			{ type: 'throttle', vessel: 3, value: 0.5 },
			{ type: 'attitude', vessel: 3, pitch: 0, yaw: -1, roll: 1 },
			{ type: 'stage', vessel: 3 },
			{ type: 'action', vessel: 3, part: 4, module: 'stock.engine', action: 'shutdown' },
			{ type: 'warp', factor: 100 },
			{ type: 'load-vessel', design: design(), placement: { kind: 'surface', latitude: 0.1 } }
		];
		for (const c of ok) expect(commandSchema.safeParse(c).success).toBe(true);
		const bad = [
			{ type: 'throttle', vessel: 3, value: 1.5 },
			{ type: 'throttle', vessel: -1, value: 0.5 },
			{ type: 'throttle', vessel: 3, value: Number.NaN },
			{ type: 'attitude', vessel: 3, pitch: 2, yaw: 0, roll: 0 },
			{ type: 'warp', factor: 0.5 },
			{ type: 'warp', factor: Number.POSITIVE_INFINITY },
			{ type: 'explode', vessel: 1 },
			{ type: 'action', vessel: 1, part: 1, module: 'Engine', action: 'x' },
			{ type: 'load-vessel', design: { ...design(), formatVersion: 9 } },
			{ type: 'load-vessel', design: design(), placement: { kind: 'state', position: { x: 1 } } },
			null,
			'throttle'
		];
		for (const c of bad) expect(commandSchema.safeParse(c).success).toBe(false);
	});
});

describe('radial attachment (ADR 0034)', () => {
	const radialDefs = new Map<string, PartDefinition>([
		[
			'test.core',
			{
				id: 'test.core',
				title: 'core',
				mass: 1,
				shape: { kind: 'cylinder', radius: 0.5, height: 2 },
				attach: {
					top: { pos: [0, 1, 0], dir: [0, 1, 0] },
					bottom: { pos: [0, -1, 0], dir: [0, -1, 0] }
				}
			}
		],
		[
			'test.plate',
			{
				id: 'test.plate',
				title: 'plate',
				mass: 1,
				shape: { kind: 'box', size: [0.2, 0.4, 0.4] },
				attach: {
					radial: { pos: [-0.1, 0, 0], dir: [-1, 0, 0] },
					outer: { pos: [0.1, 0, 0], dir: [1, 0, 0] }
				}
			}
		],
		[
			'test.booster',
			{
				id: 'test.booster',
				title: 'booster',
				mass: 1,
				shape: { kind: 'cylinder', radius: 0.3, height: 3 },
				attach: {
					radial: { pos: [-0.3, 0, 0], dir: [-1, 0, 0] },
					top: { pos: [0, 1.5, 0], dir: [0, 1, 0] }
				}
			}
		]
	]);
	const radialLookup = { get: (id: string) => radialDefs.get(id) };
	const radialLink = (index: number, angle: number, y = 0.5) => ({
		index,
		part: partId('test.plate'),
		parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle, y } }
	});
	const rd = (parts: VesselDesign['parts'], formatVersion: 1 | 2 = 2): VesselDesign => ({
		formatVersion,
		name: 'r',
		parts: [{ index: 0, part: partId('test.core'), parent: null }, ...parts],
		stages: []
	});
	const ok = (d: VesselDesign) => {
		const r = resolveVesselDesign(d, radialLookup);
		if (!r.ok) throw new Error(r.errors.join('; '));
		return r.parts;
	};
	const err = (d: VesselDesign): string => {
		const r = resolveVesselDesign(d, radialLookup);
		if (r.ok) throw new Error('expected a refusal');
		return r.errors.join('; ');
	};

	test('a radial child sits on the surface at the azimuth, facing the axis (hand values)', () => {
		const [, a, b] = ok(rd([radialLink(1, 0), radialLink(2, Math.PI / 2)]));
		expect(a!.position.x).toBeCloseTo(0.6, 12);
		expect(a!.position.y).toBeCloseTo(0.5, 12);
		expect(a!.position.z).toBeCloseTo(0, 12);
		expect(a!.yaw).toBeCloseTo(0, 12);
		// A quarter turn about +Y sends +X to -Z: outward 0.6 m along -Z.
		expect(b!.position.x).toBeCloseTo(0, 12);
		expect(b!.position.z).toBeCloseTo(-0.6, 12);
		expect(b!.yaw).toBeCloseTo(Math.PI / 2, 12);
	});

	test('a stack child of a radial part inherits its yaw and offset along the turned node', () => {
		const d = rd([
			radialLink(1, Math.PI / 2),
			{
				index: 2,
				part: partId('test.booster'),
				parent: { index: 1, parentNode: 'outer', node: 'radial' }
			}
		]);
		const booster = ok(d)[2]!;
		// plate at (0, .5, -.6); outer node 0.1 + booster node 0.3 = 0.4 m further along -Z.
		expect(booster.position.z).toBeCloseTo(-1.0, 12);
		expect(booster.position.x).toBeCloseTo(0, 12);
		expect(booster.yaw).toBeCloseTo(Math.PI / 2, 12);
	});

	test('refusals: version 1, box parent, duplicate site, vertical node, out of range', () => {
		expect(err(rd([radialLink(1, 0)], 1))).toContain('formatVersion 2');
		expect(err(rd([radialLink(1, 0), radialLink(2, 0)]))).toContain('already at that radial site');
		expect(err(rd([radialLink(1, 0, 1.5)]))).toContain('outside parent');
		const onBox: VesselDesign = {
			...rd([]),
			parts: [
				{ index: 0, part: partId('test.plate'), parent: null },
				{
					index: 1,
					part: partId('test.plate'),
					parent: { index: 0, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } }
				}
			]
		};
		expect(err(onBox)).toContain('cylindrical parent');
		const vertical = rd([
			{
				index: 1,
				part: partId('test.booster'),
				parent: { index: 0, parentNode: 'surface', node: 'top', radial: { angle: 0, y: 0 } }
			}
		]);
		expect(err(vertical)).toContain('horizontal');
	});

	test('a version 1 design migrates unchanged and resolves identically', () => {
		const v1 = design();
		const v2 = migrateVesselDesign(v1);
		expect(v2.formatVersion).toBe(2);
		expect({ ...v2, formatVersion: 1 }).toEqual(v1);
		const a = resolveVesselDesign(v1, lookup);
		const b = resolveVesselDesign(v2, lookup);
		expect(JSON.stringify(b)).toBe(JSON.stringify(a));
		if (a.ok) expect(a.parts.every((p) => p.yaw === 0)).toBe(true);
	});

	test('the schema carries radial links and symmetry; "surface" cannot be a node name', () => {
		const d = rd([{ ...radialLink(1, 0.5), symmetry: 3 }]);
		expect(vesselDesignSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
		expect(
			partDefinitionSchema.safeParse({
				id: 'a.b',
				title: 't',
				mass: 1,
				attach: { surface: { pos: [0, 0, 0], dir: [1, 0, 0] } }
			}).success
		).toBe(false);
	});
});
