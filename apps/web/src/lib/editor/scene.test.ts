import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import { partFacts } from './part-info';
import { buildScene, looseGroup, looseX, withoutCarried } from './scene';
import { attachNew, attachTargets, createEditor, detach, replaceDesign, singlePart } from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

describe('scene for the 3D view', () => {
	const base = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());

	it('places every part of the design in group main at its resolved position', () => {
		const { scene } = buildScene({
			design: base.design,
			loose: [],
			parts: content.parts,
			held: null,
			targets: [],
			cursor: null
		});
		expect(scene.parts).toHaveLength(7);
		expect(scene.parts.every((p) => p.group === 'main' && p.role === 'solid')).toBe(true);
		expect(scene.parts[0]!.position).toEqual([0, 0, 0]);
		// Stacked end to end: each part is lower than the one above.
		const ys = scene.parts.map((p) => p.position[1]);
		expect([...ys].sort((a, b) => b - a)).toEqual(ys);
		expect(scene.nodes).toEqual([]);
	});

	it('shows the ghost and a marker per target while placing; the cursor target is active', () => {
		const held = singlePart('stock.tank-small', 99);
		const design = detach(base, content, 6).design;
		const targets = attachTargets(design, held, content.parts);
		expect(targets.length).toBeGreaterThan(1);
		const { scene, ghost } = buildScene({
			design,
			loose: [],
			parts: content.parts,
			held,
			targets,
			cursor: 1
		});
		expect(ghost).toBe(targets[1]);
		expect(scene.nodes.map((n) => n.state)).toEqual(
			targets.map((_, i) => (i === 1 ? 'active' : 'target'))
		);
		const g = scene.parts.filter((p) => p.role === 'ghost');
		expect(g.map((p) => p.key)).toEqual(['g99']);
		expect(g[0]!.position[1]).toBeCloseTo(targets[1]!.position.y, 9);
		// Markers sit on the free node of the part they hang on.
		expect(scene.nodes[1]!.position).toEqual([
			targets[1]!.point.x,
			targets[1]!.point.y,
			targets[1]!.point.z
		]);
		expect(Math.hypot(...scene.nodes[1]!.dir)).toBeCloseTo(1, 9);
	});

	it('an empty design offers the platform: marker at the foot of the future root', () => {
		const held = singlePart('stock.command-pod', 0);
		const targets = attachTargets(emptyDesign(), held, content.parts);
		const { scene } = buildScene({
			design: emptyDesign(),
			loose: [],
			parts: content.parts,
			held,
			targets,
			cursor: 0
		});
		expect(scene.nodes).toHaveLength(1);
		expect(scene.nodes[0]!.position).toEqual([0, -0.5, 0]);
		expect(scene.parts).toHaveLength(1);
		expect(scene.parts[0]!.role).toBe('ghost');
	});

	it('loose assemblies stand in their own groups beside the platform', () => {
		const s = detach(detach(base, content, 4), content, 3);
		const { scene } = buildScene({
			design: s.design,
			loose: s.loose,
			parts: content.parts,
			held: null,
			targets: [],
			cursor: null
		});
		const ids = scene.groups.map((g) => g.id);
		expect(ids).toEqual(['main', looseGroup(4), looseGroup(3)]);
		expect(scene.groups[1]!.x).toBe(looseX(0));
		expect(scene.groups[2]!.x).toBe(looseX(1));
		expect(looseX(0)).toBeGreaterThan(0);
		expect(looseX(1)).toBeLessThan(0);
		expect(scene.parts.filter((p) => p.group === looseGroup(4))).toHaveLength(3);
		expect(scene.parts.filter((p) => p.group === 'main')).toHaveLength(3);
	});

	it('carrying a subtree removes it from the floor', () => {
		const w = withoutCarried(base, 4);
		expect(w.design.parts).toHaveLength(4);
		expect(w.assembly!.parts).toHaveLength(3);
		expect(withoutCarried(base, null).assembly).toBeNull();
	});
	it('floats the held part at the cursor as a free ghost, and glows the rings that are near (plan 244)', () => {
		const held = singlePart('stock.tank-small', 99);
		const design = detach(base, content, 6).design;
		const targets = attachTargets(design, held, content.parts);
		const input = { design, loose: [], parts: content.parts, held, targets, cursor: 1 };
		const { scene, ghost } = buildScene({
			...input,
			free: [3, 2, 1],
			near: new Set([0])
		});
		expect(ghost).toBeNull();
		const free = scene.parts.filter((p) => p.role === 'free');
		expect(free).toHaveLength(1);
		expect(free[0]!.position).toEqual([3, 2, 1]);
		expect(scene.parts.some((p) => p.role === 'ghost')).toBe(false);
		expect(scene.nodes.find((n) => n.key === 't0')!.state).toBe('near');
		expect(scene.nodes.some((n) => n.state === 'active')).toBe(false);
		// a pointer site wins over the free spot
		const sited = buildScene({ ...input, free: [3, 2, 1], pointer: targets[0]! });
		expect(sited.scene.parts.some((p) => p.role === 'free')).toBe(false);
		expect(sited.ghost).toBe(targets[0]);
	});
	it('marks a joint whose node sizes differ, and nothing otherwise (plan 244)', () => {
		const marks = (d: typeof base.design) =>
			buildScene({
				design: d,
				loose: [],
				parts: content.parts,
				held: null,
				targets: [],
				cursor: null
			}).scene.nodes.filter((n) => n.state === 'mismatch');
		expect(marks(base.design)).toEqual([]);
		const stack = (top: string) => {
			const s = attachNew(
				createEditor(emptyDesign(), content),
				content,
				'stock.tank-small',
				attachTargets(emptyDesign(), singlePart('stock.tank-small', 0), content.parts)[0]!
			);
			return attachNew(
				s,
				content,
				top,
				attachTargets(s.design, singlePart(top, 1), content.parts).find(
					(x) => x.parent!.parentNode === 'top'
				)!
			);
		};
		expect(marks(stack('stock.nose-cone-medium').design)).toEqual([]);
		const wrong = marks(stack('stock.nose-cone-large').design);
		expect(wrong).toHaveLength(1);
		// the mark sits where the cone meets the tank's top
		expect(wrong[0]!.position[1]).toBeCloseTo(1, 5);
	});
});

describe('part facts', () => {
	it('engine, tank and pod', () => {
		const f = (id: string) =>
			Object.fromEntries(
				partFacts(registries.parts.get(id)!, lookups).map((x) => [x.label, x.value])
			);
		expect(f('stock.engine-lv').Thrust).toBe('215.0 kN');
		expect(f('stock.engine-lv').Isp).toContain('300 s vacuum');
		expect(f('stock.tank-small').Propellant).toBe('4.45 t');
		expect(f('stock.command-pod').Control).toBeDefined();
		expect(f('stock.decoupler').Staging).toBeDefined();
	});
});

import { defaultCursor } from './scene';
import { nudgeStage } from './staging';

describe('placement cursor and stage nudging', () => {
	it('starts at the lower node of the last placed part, else the lowest target', () => {
		const base = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());
		const design = detach(base, content, 6).design;
		const t = attachTargets(design, singlePart('stock.tank-small', 99), content.parts);
		const i = defaultCursor(t, 5);
		expect(t[i!]!.parent).toEqual({ index: 5, parentNode: 'bottom' });
		expect(t[defaultCursor(t, 123)!]).toBe(t.at(-1));
		expect(defaultCursor([], null)).toBeNull();
	});

	it('nudges a part between stages and the tray', () => {
		expect(nudgeStage(null, 2, 1)).toBe(0);
		expect(nudgeStage(null, 2, -1)).toBeNull();
		expect(nudgeStage(0, 2, -1)).toBeNull();
		expect(nudgeStage(0, 2, 1)).toBe(1);
		expect(nudgeStage(1, 2, 1)).toBe(2); // opens a new stage
		expect(nudgeStage(2, 2, 1)).toBe(2);
		expect(nudgeStage(2, 2, -1)).toBe(1);
	});
});
