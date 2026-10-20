/** Surface links in the editor (plan 244, ADR 0235): targets on top and bottom faces and slopes, symmetry, save. */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { parseDesign, serialiseDesign } from '../design';
import {
	attachNew,
	createEditor,
	radialTarget,
	replaceDesign,
	singlePart,
	surfaceTarget,
	undo,
	type EditorState
} from './state';
import { emptyDesign } from '../design';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;

const start = (part: string): EditorState =>
	replaceDesign(createEditor(emptyDesign(), content), content, singlePart(part, 0));
const heightOf = (part: string): number => {
	const shape = lookup.get(part)!.shape!;
	return shape.kind === 'cylinder' ? shape.height : shape.size[1];
};
const resolves = (s: EditorState): void => {
	const r = resolveVesselDesign(s.design, lookup);
	if (!r.ok) throw new Error(r.errors.join('; '));
};
const POD = 'stock.command-pod';
const TANK = 'stock.tank-small';

describe('a surface target on a face', () => {
	it('a tank on the pod’s top face, off the axis: node bottom, the link saved, the design resolves', () => {
		const s = start(POD);
		const top = heightOf(POD) / 2;
		const t = surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
			point: { x: 0.2, y: top, z: 0 },
			normal: [0, 1, 0]
		})!;
		expect(t.node).toBe('bottom');
		expect(t.surface).toEqual({ point: [0.2, top, 0], normal: [0, 1, 0] });
		expect(t.parent).toEqual({ index: 0, parentNode: 'surface' });
		const next = attachNew(s, content, TANK, t);
		resolves(next);
		const child = next.design.parts.find((p) => p.index === 1)!;
		expect(child.parent?.surface?.point).toEqual([0.2, top, 0]);
		const placed = resolveVesselDesign(next.design, lookup);
		expect(placed.ok && placed.parts.find((p) => p.index === 1)!.tilted).toBe(false);
		// one undo takes it back
		expect(undo(next).design.parts).toHaveLength(1);
	});

	it('a tank under the pod’s bottom face takes its top node', () => {
		const s = start(POD);
		const bottom = -heightOf(POD) / 2;
		const t = surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
			point: { x: 0, y: bottom, z: 0.1 },
			normal: [0, -1, 0]
		})!;
		expect(t.node).toBe('top');
		resolves(attachNew(s, content, TANK, t));
	});

	it('a fin on a slope lies against it: its radial node, tilted', () => {
		const s = start(TANK);
		const half = heightOf(TANK) / 2;
		const r = (lookup.get(TANK)!.shape as { radius: number }).radius;
		const n = Math.hypot(0.8, 0.6);
		const t = surfaceTarget(s.design, singlePart('stock.fin', 1), lookup, 0, {
			point: { x: r * 0.6, y: half - 0.1, z: 0 },
			normal: [0.8 / n, 0.6 / n, 0]
		})!;
		expect(t.node).toBe('radial');
		const next = attachNew(s, content, 'stock.fin', t);
		const placed = resolveVesselDesign(next.design, lookup);
		expect(placed.ok && placed.parts.find((p) => p.index === 1)!.tilted).toBe(true);
	});

	it('refuses a point off the part, a zero normal, and a connector', () => {
		const s = start(POD);
		const top = heightOf(POD) / 2;
		const hit = { point: { x: 0, y: top, z: 0 }, normal: [0, 1, 0] as [number, number, number] };
		expect(
			surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
				...hit,
				point: { x: 3, y: top, z: 0 }
			})
		).toBeNull();
		expect(
			surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, { ...hit, normal: [0, 0, 0] })
		).toBeNull();
		expect(surfaceTarget(s.design, singlePart('stock.strut', 1), lookup, 0, hit)).toBeNull();
		expect(surfaceTarget(s.design, singlePart(TANK, 1), lookup, 9, hit)).toBeNull();
	});
});

describe('symmetry on a surface link', () => {
	const off = (r: number) => ({ x: r, y: heightOf('stock.tank-medium') / 2, z: 0 });
	const mediumStart = () => start('stock.tank-medium');

	it('×4 turns the site about the parent’s axis: four parts a quarter turn apart', () => {
		const s = mediumStart();
		const t = surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
			point: off(0.3),
			normal: [0, 1, 0]
		})!;
		const next = attachNew(s, content, TANK, t, 4);
		resolves(next);
		const kids = next.design.parts.filter((p) => p.parent);
		expect(kids).toHaveLength(4);
		const rounded = (v: number): number => Math.round(v * 1e3) / 1e3 + 0; // + 0: no negative zero
		const at = kids
			.map((p) => p.parent!.surface!.point)
			.map(([x, , z]) => [rounded(x), rounded(z)]);
		expect(at).toEqual([
			[0.3, 0],
			[0, -0.3],
			[-0.3, 0],
			[0, 0.3]
		]);
		expect(new Set(kids.map((p) => p.symmetry)).size).toBe(1);
	});

	it('mirror makes a pair across the YZ plane', () => {
		const s = mediumStart();
		const t = surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
			point: off(0.3),
			normal: [0, 1, 0]
		})!;
		const next = attachNew(s, content, TANK, t, { count: 2, mirror: true });
		resolves(next);
		const xs = next.design.parts
			.filter((p) => p.parent)
			.map((p) => p.parent!.surface!.point[0])
			.sort((a, b) => a - b);
		expect(xs).toEqual([-0.3, 0.3]);
	});

	it('a part on one member of a symmetric group gets a copy on every member', () => {
		let s = mediumStart();
		const r = radialTarget(s.design, singlePart('stock.radial-decoupler', 1), lookup, 0, 0, 0)!;
		s = attachNew(s, content, 'stock.radial-decoupler', r, 4);
		const decouplers = s.design.parts.filter((p) => p.parent).map((p) => p.index);
		expect(decouplers).toHaveLength(4);
		const first = decouplers[0]!;
		const top = heightOf('stock.radial-decoupler') / 2;
		const t = surfaceTarget(s.design, singlePart(TANK, s.nextIndex), lookup, first, {
			// the decoupler's top face in the design frame
			point: (() => {
				const placed = resolveVesselDesign(s.design, lookup);
				if (!placed.ok) throw new Error('unresolved');
				const p = placed.parts.find((q) => q.index === first)!.position;
				return { x: p.x, y: p.y + top, z: p.z };
			})(),
			normal: [0, 1, 0]
		})!;
		expect(t.node).toBe('bottom');
		const next = attachNew(s, content, TANK, t);
		resolves(next);
		const onTop = next.design.parts.filter((p) => p.parent?.surface);
		expect(onTop).toHaveLength(4);
		expect(new Set(onTop.map((p) => p.parent!.index))).toEqual(new Set(decouplers));
	});
});

describe('saving', () => {
	it('a design with a surface link survives a save and a load', () => {
		const s = start(POD);
		const top = heightOf(POD) / 2;
		const t = surfaceTarget(s.design, singlePart(TANK, 1), lookup, 0, {
			point: { x: 0.15, y: top, z: -0.1 },
			normal: [0, 1, 0]
		})!;
		const next = attachNew(s, content, TANK, t);
		const back = parseDesign(serialiseDesign(next.design), lookup);
		expect(back.ok).toBe(true);
		expect(back.ok && back.design.parts.find((p) => p.index === 1)!.parent?.surface).toEqual({
			point: [0.15, top, -0.1],
			normal: [0, 1, 0]
		});
	});
});
