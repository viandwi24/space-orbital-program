import { describe, expect, test } from 'bun:test';
import {
	commandSchema,
	partId,
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
		expect(vesselDesignSchema.safeParse({ ...d, formatVersion: 2 }).success).toBe(false);
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
