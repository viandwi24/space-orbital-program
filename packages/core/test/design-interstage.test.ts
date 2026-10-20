/** Interstage nodes (plan 243, ADR 0238): a node at the top of a module's shell, there only while it is on. */
import { describe, expect, test } from 'bun:test';
import {
	effectiveDef,
	partId,
	resolveVesselDesign,
	type PartDefinition,
	type VesselDesign
} from '../src/index.ts';

const base: PartDefinition = {
	id: 'test.base',
	title: 'base',
	mass: 1,
	shape: { kind: 'cylinder', radius: 0.625, height: 0.2 },
	attach: {
		top: { pos: [0, 0.1, 0], dir: [0, 1, 0], size: 1.25 },
		bottom: { pos: [0, -0.1, 0], dir: [0, -1, 0], size: 1.25 },
		interstage: { pos: [0, 0.1, 0], dir: [0, 1, 0], size: 1.25, shellTop: 'test.shell' }
	},
	modules: [['test.shell', { baseTop: 0.1 }]]
} as unknown as PartDefinition;
const tank: PartDefinition = {
	id: 'test.tank',
	title: 'tank',
	mass: 1,
	shape: { kind: 'cylinder', radius: 0.625, height: 2 },
	attach: {
		top: { pos: [0, 1, 0], dir: [0, 1, 0], size: 1.25 },
		bottom: { pos: [0, -1, 0], dir: [0, -1, 0], size: 1.25 }
	}
};
const lookup = { get: (id: string) => [base, tank].find((d) => d.id === id) };
const on = {
	'test.shell': {
		interstage: true,
		sections: [
			{ height: 1, radius: 0.7 },
			{ height: 0.5, radius: 0.8 }
		]
	}
};

describe('effectiveDef (plan 243)', () => {
	test('a definition without shell nodes is returned as it is', () => {
		expect(effectiveDef(tank)).toBe(tank);
	});
	test('the node is absent while the interstage is off or has no section', () => {
		expect(effectiveDef(base).attach!.interstage).toBeUndefined();
		expect(
			effectiveDef(base, { 'test.shell': { interstage: true } }).attach!.interstage
		).toBeUndefined();
		expect(
			effectiveDef(base, { 'test.shell': { sections: on['test.shell'].sections } }).attach!
				.interstage
		).toBeUndefined();
		expect(effectiveDef(base).attach!.top).toBeDefined();
	});
	test('on, it sits at the shell top and is as wide as the last section', () => {
		const n = effectiveDef(base, on).attach!.interstage!;
		expect(n.pos[1]).toBeCloseTo(0.1 + 1.5, 9);
		expect(n.size).toBeCloseTo(1.6, 9);
		expect(n.shellTop).toBeUndefined();
	});
});

describe('a stage hung on the interstage node', () => {
	const design = (settings?: Record<string, Record<string, unknown>>): VesselDesign => ({
		formatVersion: 3,
		name: 'interstage',
		parts: [
			{ index: 0, part: partId('test.base'), parent: null, ...(settings ? { settings } : {}) },
			{
				index: 1,
				part: partId('test.tank'),
				parent: { index: 0, parentNode: 'interstage', node: 'bottom' }
			}
		],
		stages: []
	});
	test('is placed at the top of the shell and moves with its height', () => {
		const r = resolveVesselDesign(design(on), lookup);
		if (!r.ok) throw new Error(r.errors.join('; '));
		expect(r.parts.find((p) => p.index === 1)!.position.y).toBeCloseTo(1.6 + 1, 9);
		const taller = resolveVesselDesign(
			design({ 'test.shell': { ...on['test.shell'], sections: [{ height: 3, radius: 0.7 }] } }),
			lookup
		);
		if (!taller.ok) throw new Error('taller');
		expect(taller.parts.find((p) => p.index === 1)!.position.y).toBeCloseTo(3.1 + 1, 9);
	});
	test('is refused when the interstage is off', () => {
		const r = resolveVesselDesign(design(), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.join(';')).toContain('no node "interstage"');
	});
});
