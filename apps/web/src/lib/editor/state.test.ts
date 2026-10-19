import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, parseDesign, referenceTwoStage, serialiseDesign } from '../design';
import {
	attachNew,
	attachTargets,
	canRedo,
	canUndo,
	createEditor,
	deleteSubtree,
	detach,
	enableAutoStage,
	insertStage,
	moveSubtree,
	moveToStage,
	previewAttach,
	redo,
	removeEmptyStage,
	rename,
	replaceDesign,
	rootOf,
	setAircraft,
	singlePart,
	stageOf,
	undo,
	type AttachTarget,
	type EditorState
} from './state';
import { autoStages, sameStages } from './staging';
import { categoriesOf, categoryOf, matchesQuery } from './categories';
import { buildRow, setBuildSetting } from './build-settings';
import { moonShot } from './examples';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

/** Attach `part` at the first target that hangs on `parentIndex`'s `parentNode` (or the root slot). */
function place(
	s: EditorState,
	part: string,
	at?: { parentIndex: number; parentNode: string }
): EditorState {
	const targets = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts);
	const t: AttachTarget | undefined = at
		? targets.find(
				(x) => x.parent?.index === at.parentIndex && x.parent.parentNode === at.parentNode
			)
		: targets[0];
	if (!t) throw new Error(`no target for ${part}`);
	return attachNew(s, content, part, t);
}

/** Builds the stock two-stage vessel through the editor, top to bottom, like the player does. */
function buildTwoStage(): EditorState {
	let s = createEditor(emptyDesign(), content);
	s = place(s, 'stock.command-pod');
	for (const part of [
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-small',
		'stock.engine-lv'
	]) {
		const last = s.design.parts.at(-1)!;
		s = place(s, part, { parentIndex: last.index, parentNode: 'bottom' });
	}
	return s;
}

describe('building', () => {
	it('an empty design offers the root slot, then only free stack nodes', () => {
		const s0 = createEditor(emptyDesign(), content);
		const t0 = attachTargets(s0.design, singlePart('stock.command-pod', 0), content.parts);
		expect(t0).toHaveLength(1);
		expect(t0[0]!.parent).toBeNull();
		const s1 = place(s0, 'stock.command-pod');
		const t1 = attachTargets(s1.design, singlePart('stock.tank-small', 9), content.parts);
		expect(t1.map((t) => `${t.parent!.index}:${t.parent!.parentNode}->${t.node}`).sort()).toEqual([
			'0:bottom->top',
			'0:top->bottom'
		]);
		// The target above the pod puts the new part above it (higher y).
		const above = t1.find((t) => t.parent!.parentNode === 'top')!;
		const below = t1.find((t) => t.parent!.parentNode === 'bottom')!;
		expect(above.position.y).toBeGreaterThan(0);
		expect(below.position.y).toBeLessThan(0);
		// Highest node first (Tab order follows the stack).
		expect(t1[0]).toBe(above);
	});

	it('building the stock two-stage vessel by editor operations gives the reference design', () => {
		const s = buildTwoStage();
		const ref = referenceTwoStage();
		expect(s.design.parts.map((p) => [p.index, p.part, p.parent])).toEqual(
			ref.parts.map((p) => [p.index, p.part, p.parent])
		);
		// Auto-staged: engine at the bottom first, then decoupler with the upper engine.
		expect(sameStages(s.design.stages, ref.stages)).toBe(true);
		expect(s.autoStage).toBe(true);
	});

	it('a used node is no longer offered and the edit is validated', () => {
		const s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		const s2 = place(s, 'stock.tank-small', { parentIndex: 0, parentNode: 'bottom' });
		const targets = attachTargets(s2.design, singlePart('stock.engine-lv', 5), content.parts);
		expect(targets.some((t) => t.parent!.index === 0 && t.parent!.parentNode === 'bottom')).toBe(
			false
		);
		expect(() =>
			attachNew(s2, content, 'stock.engine-lv', {
				parent: { index: 0, parentNode: 'bottom' },
				node: 'top',
				position: { x: 0, y: 0, z: 0 },
				point: { x: 0, y: 0, z: 0 }
			})
		).toThrow(/invalid design/);
	});

	it('rejects unknown parts and a second root', () => {
		const s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		expect(() =>
			attachNew(
				s,
				content,
				'nope.part',
				attachTargets(s.design, singlePart('stock.tank-small', 1), content.parts)[0]!
			)
		).toThrow(/unknown part/);
		expect(() =>
			attachNew(s, content, 'stock.tank-small', {
				parent: null,
				node: 'top',
				position: { x: 0, y: 0, z: 0 },
				point: { x: 0, y: 0, z: 0 }
			})
		).toThrow(/parent/);
	});
});

describe('detach, move and delete', () => {
	it('detach keeps the subtree loose with its own root, indices unchanged', () => {
		const s = buildTwoStage();
		const d = detach(s, content, 4); // decoupler and everything below it
		expect(d.design.parts.map((p) => p.index)).toEqual([0, 1, 2, 3]);
		expect(d.loose).toHaveLength(1);
		expect(d.loose[0]!.parts.map((p) => p.index).sort()).toEqual([4, 5, 6]);
		expect(rootOf(d.loose[0]!)).toBe(4);
		expect(d.loose[0]!.parts.find((p) => p.index === 4)!.parent).toBeNull();
		// The staging no longer refers to detached parts.
		expect(d.design.stages.flat().every((i) => i <= 3)).toBe(true);
	});

	it('moveSubtree re-attaches a loose assembly and is one undo step', () => {
		const s = buildTwoStage();
		const d = detach(s, content, 4);
		const asm = d.loose[0]!;
		const target = attachTargets(d.design, asm, content.parts).find(
			(t) => t.parent!.index === 3 && t.parent!.parentNode === 'bottom'
		)!;
		const back = moveSubtree(d, content, 4, target);
		expect(back.loose).toHaveLength(0);
		expect(back.design.parts.map((p) => p.index).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(undo(back).loose).toHaveLength(1);
		expect(sameStages(back.design.stages, referenceTwoStage().stages)).toBe(true);
	});

	it('moves a subtree inside the design in one step (swap the tank order)', () => {
		let s = createEditor(emptyDesign(), content);
		s = place(s, 'stock.command-pod');
		s = place(s, 'stock.tank-small', { parentIndex: 0, parentNode: 'bottom' });
		s = place(s, 'stock.engine-lv', { parentIndex: 1, parentNode: 'bottom' });
		// Pick the engine up and hang it above the pod instead (engines may sit anywhere in the stack).
		const out = detach(s, content, 2);
		const t = attachTargets(out.design, out.loose[0]!, content.parts).find(
			(x) => x.parent!.index === 0 && x.parent!.parentNode === 'top'
		);
		expect(t).toBeDefined();
		const moved = moveSubtree(s, content, 2, t!);
		expect(moved.design.parts.find((p) => p.index === 2)!.parent).toEqual({
			index: 0,
			parentNode: 'top',
			node: 'bottom'
		});
		expect(moved.past.length).toBe(s.past.length + 1);
	});

	it('detaching the root leaves an empty design and one loose assembly', () => {
		const s = buildTwoStage();
		const d = detach(s, content, 0);
		expect(d.design.parts).toHaveLength(0);
		expect(d.design.stages).toEqual([]);
		expect(d.loose[0]!.parts).toHaveLength(7);
		// A loose assembly can become the design again.
		const t = attachTargets(d.design, d.loose[0]!, content.parts)[0]!;
		expect(t.parent).toBeNull();
		const r = moveSubtree(d, content, 0, t);
		expect(r.design.parts).toHaveLength(7);
		expect(r.loose).toHaveLength(0);
	});

	it('delete removes the whole subtree and its stage entries', () => {
		const s = buildTwoStage();
		const d = deleteSubtree(s, content, 4);
		expect(d.design.parts.map((p) => p.index)).toEqual([0, 1, 2, 3]);
		expect(d.loose).toHaveLength(0);
		expect(d.design.stages.flat().sort()).toEqual([3]);
	});

	it('deletes a part of a loose assembly and drops an assembly that becomes empty', () => {
		const s = detach(buildTwoStage(), content, 6);
		expect(s.loose).toHaveLength(1);
		const d = deleteSubtree(s, content, 6);
		expect(d.loose).toHaveLength(0);
	});
});

describe('undo and redo', () => {
	it('walks back and forth through edits; a new edit clears redo', () => {
		const s0 = createEditor(emptyDesign(), content);
		const s1 = place(s0, 'stock.command-pod');
		const s2 = place(s1, 'stock.tank-small', { parentIndex: 0, parentNode: 'bottom' });
		expect(canUndo(s2)).toBe(true);
		expect(canRedo(s2)).toBe(false);
		const u1 = undo(s2);
		expect(u1.design.parts).toHaveLength(1);
		expect(canRedo(u1)).toBe(true);
		const u0 = undo(u1);
		expect(u0.design.parts).toHaveLength(0);
		expect(canUndo(u0)).toBe(false);
		expect(undo(u0)).toBe(u0);
		const r2 = redo(redo(u0));
		expect(r2.design.parts).toHaveLength(2);
		expect(redo(r2)).toBe(r2);
		const branch = place(undo(r2), 'stock.reaction-wheel', {
			parentIndex: 0,
			parentNode: 'bottom'
		});
		expect(canRedo(branch)).toBe(false);
	});

	it('undo restores the stages and the auto-stage flag; indices are not reused', () => {
		const s = buildTwoStage();
		const manual = moveToStage(s, content, 3, 5);
		expect(manual.autoStage).toBe(false);
		const back = undo(manual);
		expect(back.autoStage).toBe(true);
		expect(sameStages(back.design.stages, referenceTwoStage().stages)).toBe(true);
		const more = place(deleteSubtree(s, content, 6), 'stock.engine-lv', {
			parentIndex: 5,
			parentNode: 'bottom'
		});
		expect(more.design.parts.at(-1)!.index).toBe(7);
	});

	it('renaming is not an undo step and falls back to the default name', () => {
		const s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		const r = rename(s, 'Mun shot');
		expect(r.design.name).toBe('Mun shot');
		expect(r.past).toBe(s.past);
		expect(rename(r, '  ').design.name).toBe('Untitled vessel');
	});

	it('keeps at most 100 undo steps', () => {
		let s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		for (let i = 0; i < 120; i++)
			((s = detach(s, content, 0)), (s = undo(s)), (s = redo(s)), (s = undo(s)));
		expect(s.past.length).toBeLessThanOrEqual(100);
		let t = createEditor(emptyDesign(), content);
		t = place(t, 'stock.command-pod');
		for (let i = 0; i < 130; i++)
			t = rename(
				moveToStage(
					place(t, 'stock.decoupler', {
						parentIndex: t.design.parts.at(-1)!.index,
						parentNode: 'bottom'
					}),
					content,
					0,
					0
				),
				'x'
			);
		expect(t.past.length).toBe(100);
	});
});

describe('stage editing', () => {
	it('moves a part between stages and turns auto-staging off', () => {
		const s = buildTwoStage();
		expect(stageOf(s.design, 6)).toBe(0);
		const m = moveToStage(s, content, 6, 1);
		expect(m.autoStage).toBe(false);
		expect(stageOf(m.design, 6)).toBe(1);
		expect(m.design.stages[0]).toEqual([]);
		// A later structural edit keeps the manual stages (and does not re-run auto-staging).
		const more = deleteSubtree(m, content, 5);
		expect(more.autoStage).toBe(false);
		expect(more.design.stages.flat().includes(6)).toBe(false);
	});

	it('opens a new stage past the end, inserts stages and removes empty ones', () => {
		const s = buildTwoStage();
		const n = moveToStage(s, content, 6, s.design.stages.length);
		expect(n.design.stages).toHaveLength(3);
		expect(stageOf(n.design, 6)).toBe(2);
		expect(n.design.stages[0]).toEqual([]);
		const gone = removeEmptyStage(n, content, 0);
		expect(gone.design.stages).toHaveLength(2);
		expect(stageOf(gone.design, 6)).toBe(1);
		expect(removeEmptyStage(gone, content, 0)).toBe(gone); // stage 0 is not empty
		const ins = insertStage(s, content, 1);
		expect(ins.design.stages[1]).toEqual([]);
		expect(ins.design.stages).toHaveLength(3);
		expect(moveToStage(ins, content, 6, null).design.stages.flat()).not.toContain(6);
	});

	it('rejects unknown parts and negative stages', () => {
		const s = buildTwoStage();
		expect(() => moveToStage(s, content, 99, 0)).toThrow(/no part/);
		expect(() => moveToStage(s, content, 3, -1)).toThrow(RangeError);
	});

	it('Auto-stage restores the computed stages', () => {
		const s = moveToStage(buildTwoStage(), content, 6, 3);
		const a = enableAutoStage(s, content);
		expect(a.autoStage).toBe(true);
		expect(sameStages(a.design.stages, referenceTwoStage().stages)).toBe(true);
		expect(enableAutoStage(a, content)).toBe(a);
	});
});

describe('auto-staging', () => {
	it('a new engine joins stage 0 of a one-stage rocket; a new decoupler opens a stage above', () => {
		let s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		s = place(s, 'stock.tank-small', { parentIndex: 0, parentNode: 'bottom' });
		expect(s.design.stages).toEqual([]);
		s = place(s, 'stock.engine-lv', { parentIndex: 1, parentNode: 'bottom' });
		expect(s.design.stages).toEqual([[2]]);
		// A decoupler below the engine, then a second stack: the new engine fires first.
		for (const [part, node] of [
			['stock.decoupler', 2],
			['stock.tank-small', 3],
			['stock.engine-lv', 4]
		] as const) {
			s = place(s, part, { parentIndex: node, parentNode: 'bottom' });
		}
		expect(s.design.stages).toEqual([[5], [2, 3]]);
	});

	it('three stages: depth rule', () => {
		const ids = [
			'stock.command-pod',
			'stock.engine-lv', // upper engine (depth 0)
			'stock.decoupler', // d0
			'stock.tank-small',
			'stock.engine-lv', // depth 1
			'stock.decoupler', // d1 (depth 1)
			'stock.tank-small',
			'stock.engine-lv' // depth 2
		];
		const design = {
			...emptyDesign('t'),
			parts: ids.map((part, index) => ({
				index,
				part: part as never,
				parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
			}))
		};
		const stages = autoStages(design, content);
		expect(stages).toEqual([[7], [4, 5], [1, 2]]);
	});

	it('replaceDesign marks the reference design as auto-staged and a custom staging as manual', () => {
		const s = createEditor(emptyDesign(), content);
		expect(replaceDesign(s, content, referenceTwoStage()).autoStage).toBe(true);
		const custom = { ...referenceTwoStage(), stages: [[4, 3, 6]] };
		const r = replaceDesign(s, content, custom);
		expect(r.autoStage).toBe(false);
		expect(r.design.stages).toEqual([[4, 3, 6]]);
		expect(r.nextIndex).toBe(7);
	});
});

describe('preview and categories', () => {
	it('previewAttach returns the design after the attach without touching state', () => {
		const s = place(createEditor(emptyDesign(), content), 'stock.command-pod');
		const asm = singlePart('stock.tank-small', 7);
		const t = attachTargets(s.design, asm, content.parts)[0]!;
		expect(previewAttach(s.design, asm, t).parts).toHaveLength(2);
		expect(s.design.parts).toHaveLength(1);
	});

	it('categories cover all stock parts and search matches title and id', () => {
		const ids = Object.fromEntries(
			registries.parts.list().map((p) => [p.id, categoryOf(p, registries.modules)])
		);
		expect(ids).toMatchObject({
			'stock.command-pod': 'stock.command',
			'stock.tank-small': 'stock.tanks',
			'stock.tank-medium': 'stock.tanks',
			'stock.engine-lv': 'stock.propulsion',
			'stock.decoupler': 'stock.structural',
			'stock.reaction-wheel': 'stock.control',
			'stock.landing-legs': 'stock.landing',
			'stock.heat-shield': 'stock.thermal',
			'stock.radial-decoupler': 'stock.structural',
			'stock.booster': 'stock.propulsion',
			'stock.fin': 'stock.aero',
			'stock.nose-cone': 'stock.aero'
		});
		expect(
			Object.values(ids).every((c) =>
				categoriesOf(registries.categories.list()).some((x) => x.id === c)
			)
		).toBe(true);
		const tank = registries.parts.get('stock.tank-small')!;
		expect(matchesQuery(tank, 'small tank')).toBe(true);
		expect(matchesQuery(tank, 'ENGINE')).toBe(false);
		expect(matchesQuery(tank, '')).toBe(true);
		expect(categoryOf({ modules: [] }, registries.modules)).toBe('stock.other');
	});
});

describe('save and load', () => {
	it('JSON round trip of a built vessel gives the same design, stages and auto-staging', () => {
		const built = buildTwoStage();
		const text = serialiseDesign({ ...built.design, name: 'Round trip' });
		const parsed = parseDesign(text, content.parts);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const loaded = replaceDesign(createEditor(emptyDesign(), content), content, parsed.design);
		expect(loaded.design).toEqual({ ...built.design, name: 'Round trip' });
		expect(loaded.autoStage).toBe(true);
		// A hand-edited staging survives as manual staging.
		const manual = moveToStage(built, content, 6, 3);
		const again = parseDesign(serialiseDesign(manual.design), content.parts);
		expect(again.ok && replaceDesign(built, content, again.design).autoStage).toBe(false);
		expect(again.ok && again.design.stages).toEqual(manual.design.stages);
	});

	it('refuses a design the editor could not have produced', () => {
		const bad = JSON.stringify({
			...referenceTwoStage(),
			parts: referenceTwoStage().parts.slice(1)
		});
		expect(parseDesign(bad, content.parts).ok).toBe(false);
	});
});

describe('aircraft flag (plan 063)', () => {
	it('marks a design an aircraft and back, keeps it through a file, adds no undo step', () => {
		const s = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());
		const plane = setAircraft(s, true);
		expect(plane.design.aircraft).toBe(true);
		expect(plane.past.length).toBe(s.past.length);
		const again = parseDesign(serialiseDesign(plane.design), content.parts);
		expect(again.ok && again.design.aircraft).toBe(true);
		expect('aircraft' in setAircraft(plane, false).design).toBe(false);
	});
});

describe('build-time settings (plan 218)', () => {
	const ENGINE = 'stock.engine';
	const limiterOf = (s: EditorState, i: number): number | undefined =>
		s.design.parts.find((p) => p.index === i)?.settings?.[ENGINE]?.limiter as number | undefined;

	it('a 60 % limiter on one of four symmetric boosters sets all four; one undo resets them', () => {
		// the example's boosters come at half thrust: start from them without it
		const shot = moonShot();
		const bare = { ...shot, parts: shot.parts.map(({ settings: _s, ...p }) => p) };
		const s0 = createEditor(bare, content);
		const boosters = [21, 24, 27, 30];
		const row = buildRow(s0.design, content, 21)!;
		const limiter = row.controls.find((c) => c.id === 'setLimiter')!;
		expect(limiter.value).toBe(1);
		const s1 = setBuildSetting(s0, content, 21, limiter, 0.6);
		for (const b of boosters) expect(limiterOf(s1, b)).toBe(0.6);
		expect(
			buildRow(s1.design, content, 27)!.controls.find((c) => c.id === 'setLimiter')!.value
		).toBe(0.6);
		const back = undo(s1);
		for (const b of boosters) expect(limiterOf(back, b)).toBeUndefined();
		// "Only this part" sets one
		const one = setBuildSetting(s0, content, 21, limiter, 0.6, { single: true });
		expect(boosters.map((b) => limiterOf(one, b))).toEqual([0.6, undefined, undefined, undefined]);
	});

	it('a tank fill keeps the other resources and is refused above capacity', () => {
		const s0 = createEditor(moonShot(), content);
		const fill = buildRow(s0.design, content, 3)!.controls.find((c) =>
			c.id.startsWith('fill:stock.liquid-fuel')
		)!;
		expect(fill.buildOnly).toBe(true);
		const half = (fill.max as number) / 2;
		const s1 = setBuildSetting(s0, content, 3, fill, half);
		const row = buildRow(s1.design, content, 3)!;
		expect(row.controls.find((c) => c.id === fill.id)!.value).toBe(half);
		expect(row.controls.find((c) => c.id === 'fill:stock.oxidizer')!.value).toBeGreaterThan(half);
		expect(() => setBuildSetting(s0, content, 3, fill, (fill.max as number) * 2)).toThrow();
	});
});
