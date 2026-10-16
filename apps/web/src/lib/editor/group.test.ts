/** Plan 029: sub-assemblies, symmetric group move, angle control, and their undo. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import { assemblyFromSubtree, isAssembly } from './assembly';
import { buildScene, withoutCarried } from './scene';
import {
	attachAssembly,
	attachNew,
	attachTargets,
	createEditor,
	groupOf,
	layoutOf,
	moveGroup,
	planCarry,
	radialOf,
	radialTarget,
	setRadial,
	singlePart,
	undo,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

function stackOnPad(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.tank-small',
		'stock.engine-lv'
	]) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}

const radialAt = (s: EditorState, part: string, parent: number, angle: number, y: number) => {
	const t = radialTarget(s.design, singlePart(part, s.nextIndex), content.parts, parent, angle, y);
	if (!t) throw new Error('no radial target');
	return t;
};

/** Pod, wheel, two tanks, engine; `n` radial decouplers on tank 3 each carrying a booster. */
function boosted(n = 4): EditorState {
	let s = stackOnPad();
	s = attachNew(
		s,
		content,
		'stock.radial-decoupler',
		radialAt(s, 'stock.radial-decoupler', 3, 0, 0),
		n
	);
	const first = s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!;
	const outer = attachTargets(
		s.design,
		singlePart('stock.booster', s.nextIndex),
		content.parts
	).find((t) => t.parent?.index === first.index && t.parent.parentNode === 'outer')!;
	return attachNew(s, content, 'stock.booster', outer);
}

const decouplers = (s: EditorState) =>
	s.design.parts.filter((p) => p.part === 'stock.radial-decoupler').map((p) => p.index);

describe('sub-assemblies', () => {
	it('saves a subtree with indices from 0, no root link, inner links kept', () => {
		const s = boosted(1);
		const d = decouplers(s)[0]!;
		const a = assemblyFromSubtree(s, d, 'Booster pack')!;
		expect(a.name).toBe('Booster pack');
		expect(a.parts.map((p) => p.index)).toEqual([0, 1]);
		expect(a.parts[0]!.parent).toBeNull();
		expect(a.parts[1]!.parent).toMatchObject({ index: 0, parentNode: 'outer' });
		expect(a.stages).toEqual([]);
		expect(isAssembly(a)).toBe(true);
		expect(s.design.parts).toHaveLength(s.design.parts.length); // source untouched
	});

	it('drops a group tag whose partners are not inside the assembly', () => {
		const s = boosted(4);
		const d = decouplers(s)[0]!;
		expect(groupOf(s.design, d)).toHaveLength(4);
		const a = assemblyFromSubtree(s, d, 'One')!;
		expect(a.parts.every((p) => p.symmetry === undefined)).toBe(true);
	});

	it('keeps an inner symmetry group and its radial angles', () => {
		const s = boosted(4);
		// Save the whole lower tank: it carries the four decouplers and boosters.
		const a = assemblyFromSubtree(s, 3, 'Stage')!;
		const rads = a.parts.filter((p) => p.parent?.radial);
		expect(rads).toHaveLength(4);
		expect(new Set(rads.map((p) => p.symmetry)).size).toBe(1);
		const angles = rads.map((p) => p.parent!.radial!.angle).sort((x, y) => x - y);
		expect(angles[1]! - angles[0]!).toBeCloseTo(Math.PI / 2, 6);
	});

	it('inserts at an axial target and at a radial target with symmetry 3, one undo step', () => {
		const s0 = boosted(1);
		const pack = assemblyFromSubtree(s0, decouplers(s0)[0]!, 'Pack')!;
		let s = stackOnPad();
		const t = radialTarget(s.design, pack, content.parts, 3, 0, 0)!;
		const before = s.design.parts.length;
		const after = attachAssembly(s, content, pack, t, 3);
		expect(after.design.parts.length).toBe(before + 6);
		const idx = after.design.parts.map((p) => p.index);
		expect(new Set(idx).size).toBe(idx.length);
		// Three groups, one per corresponding part (decoupler and booster), each of 3 members.
		const groups = new Map<number, number>();
		for (const p of after.design.parts) {
			if (p.symmetry !== undefined) groups.set(p.symmetry, (groups.get(p.symmetry) ?? 0) + 1);
		}
		expect([...groups.values()].sort()).toEqual([3, 3]);
		expect(undo(after).design).toBe(s.design);
		// Axial insertion: a tank with its engine under a pod and a wheel.
		const lower = assemblyFromSubtree(stackOnPad(), 3, 'Lower')!;
		let top = createEditor(emptyDesign(), content);
		for (const part of ['stock.command-pod', 'stock.reaction-wheel']) {
			const last = top.design.parts.at(-1);
			const ts = attachTargets(top.design, singlePart(part, top.nextIndex), content.parts);
			top = attachNew(
				top,
				content,
				part,
				last
					? ts.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')!
					: ts[0]!
			);
		}
		const below = attachTargets(top.design, lower, content.parts).find(
			(x) => x.parent?.index === 1 && x.parent.parentNode === 'bottom'
		)!;
		const joined = attachAssembly(top, content, lower, below);
		expect(joined.design.parts).toHaveLength(4);
		expect(layoutOf(joined.design, content.parts)).not.toBeNull();
	});
});

describe('group move and angle', () => {
	it('moving one member moves the group to the same relative angles, one undo step', () => {
		const s = boosted(4);
		const ds = decouplers(s);
		const t = radialTarget(
			planCarry(s, ds[0]!)!.design,
			planCarry(s, ds[0]!)!.held,
			content.parts,
			3,
			Math.PI / 4,
			0.2
		)!;
		const moved = moveGroup(s, content, ds[0]!, t);
		const links = ds.map((i) => radialOf(moved.design, i)!);
		expect(links.map((l) => l.y)).toEqual([0.2, 0.2, 0.2, 0.2]);
		const a0 = links[0]!.angle;
		expect(a0).toBeCloseTo(Math.PI / 4, 6);
		const spread = links.map(
			(l) => (((l.angle - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
		);
		expect(spread.map((x) => Math.round((x / (Math.PI / 2)) * 1000) / 1000).sort()).toEqual([
			0, 1, 2, 3
		]);
		expect(groupOf(moved.design, ds[0]!)).toHaveLength(4);
		expect(moved.design.parts).toHaveLength(s.design.parts.length);
		expect(undo(moved).design).toBe(s.design);
	});

	it('"only this part" leaves the group', () => {
		const s = boosted(4);
		const ds = decouplers(s);
		const plan = planCarry(s, ds[0]!, { single: true })!;
		const t = radialTarget(plan.design, plan.held, content.parts, 3, 1, 0)!;
		const moved = moveGroup(s, content, ds[0]!, t, { single: true });
		expect(groupOf(moved.design, ds[0]!)).toEqual([ds[0]]);
		expect(groupOf(moved.design, ds[1]!)).toHaveLength(3);
	});

	it('turns the group by an angle step and undoes in one step; single turns one part and leaves the group', () => {
		const s = boosted(4);
		const ds = decouplers(s);
		const a0 = radialOf(s.design, ds[0]!)!.angle;
		const turned = setRadial(s, content, ds[0]!, { angle: a0 + 0.3 });
		for (const i of ds) {
			const d = radialOf(turned.design, i)!.angle - radialOf(s.design, i)!.angle;
			expect(Math.sin(d)).toBeCloseTo(Math.sin(0.3), 6);
			expect(Math.cos(d)).toBeCloseTo(Math.cos(0.3), 6);
		}
		expect(undo(turned).design).toBe(s.design);
		const one = setRadial(s, content, ds[1]!, { angle: 0.5 }, { single: true });
		expect(groupOf(one.design, ds[1]!)).toEqual([ds[1]]);
		expect(radialOf(one.design, ds[0]!)!.angle).toBe(radialOf(s.design, ds[0]!)!.angle);
	});

	it('refuses a spot outside the parent and an overlap, leaving the design unchanged', () => {
		const s = boosted(4);
		const ds = decouplers(s);
		expect(() => setRadial(s, content, ds[0]!, { y: 5 })).toThrow();
		// Two decouplers on the same spot would overlap: turn one onto the neighbour's angle (single).
		const next = radialOf(s.design, ds[1]!)!.angle;
		expect(() => setRadial(s, content, ds[0]!, { angle: next }, { single: true })).toThrow();
		expect(() => setRadial(s, content, 0, { angle: 0 })).toThrow(/not attached to the side/);
	});
});

describe('carry preview', () => {
	it('shows a ghost of every member of the group and its attached parts at the target', () => {
		const s = boosted(4);
		const ds = decouplers(s);
		const carried = withoutCarried(s, ds[0]!);
		expect(carried.followers).toHaveLength(3);
		const target = radialTarget(carried.design, carried.assembly!, content.parts, 3, 1, 0.1)!;
		const built = buildScene({
			design: carried.design,
			loose: carried.loose,
			parts: content.parts,
			held: carried.assembly,
			targets: [target],
			cursor: 0,
			followers: carried.followers,
			kind: 'carry'
		});
		const ghosts = built.scene.parts.filter((p) => p.role === 'ghost');
		// 4 decouplers and the 4 boosters on them.
		expect(ghosts).toHaveLength(8);
		expect(carried.design.parts.some((p) => ds.includes(p.index))).toBe(false);
		// Alone, only the picked subtree is carried.
		const alone = withoutCarried(s, ds[0]!, true);
		expect(alone.followers).toHaveLength(0);
	});
});
