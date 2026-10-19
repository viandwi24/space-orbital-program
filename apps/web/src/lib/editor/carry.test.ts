/** Plan 217: carrying a subtree, dropping it on the catalogue, Alt-copy, and their undo. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	attachAssembly,
	attachNew,
	attachTargets,
	copyOf,
	createEditor,
	deleteSubtree,
	moveGroup,
	planCarry,
	singlePart,
	undo,
	withRootTilt,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

/** Pod, wheel, two tanks, engine; the lower tank (3) carries the engine (4). */
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

describe('carry (plan 217)', () => {
	it('picking up a tank with an engine below carries both', () => {
		const s = stackOnPad();
		const plan = planCarry(s, 3)!;
		expect(plan.held.parts.map((p) => p.part)).toEqual(['stock.tank-small', 'stock.engine-lv']);
		expect(plan.design.parts.map((p) => p.index)).toEqual([0, 1, 2]);
	});

	it('dropping it on the catalogue deletes both; one undo brings both back', () => {
		const s = stackOnPad();
		const dropped = deleteSubtree(s, content, 3);
		expect(dropped.design.parts.map((p) => p.index)).toEqual([0, 1, 2]);
		const back = undo(dropped);
		expect(back.design).toEqual(s.design);
	});

	it('a carried part placed turned keeps the turn, in one undo step', () => {
		const s = stackOnPad();
		const plan = planCarry(s, 4)!;
		const t = attachTargets(plan.design, plan.held, content.parts).find(
			(x) => x.parent?.index === 3 && x.parent.parentNode === 'bottom'
		)!;
		const moved = moveGroup(s, content, 4, t, { tilt: { x: 0, y: Math.PI / 2, z: 0 } });
		expect(moved.design.parts.find((p) => p.index === 4)!.tilt).toEqual({
			x: 0,
			y: Math.PI / 2,
			z: 0
		});
		expect(undo(moved).design).toEqual(s.design);
	});

	it('Alt-copy takes the subtree on the cursor; placing it is one undo step', () => {
		const s = stackOnPad();
		const copy = copyOf(s, 3)!;
		expect(copy.parts).toHaveLength(2);
		expect(s.design.parts).toHaveLength(5); // the original stays
		// the copy goes under the engine
		const t = attachTargets(s.design, copy, content.parts).find(
			(x) => x.parent?.index === 4 && x.parent.parentNode === 'bottom'
		)!;
		const placed = attachAssembly(s, content, copy, t);
		expect(placed.design.parts).toHaveLength(7);
		expect(undo(placed).design.parts).toHaveLength(5);
	});

	it('a root tilt of zero leaves no tilt field', () => {
		const a = withRootTilt(singlePart('stock.fin', 0), { x: 0, y: 0, z: 0 });
		expect('tilt' in a.parts[0]!).toBe(false);
	});
});
