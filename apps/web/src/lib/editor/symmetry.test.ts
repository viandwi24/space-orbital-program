/** Plan 217: symmetry 1 to 8, mirror pairs and symmetry inherited from the parent, each one undo step. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	SYMMETRY_COUNTS,
	attachNew,
	attachTargets,
	createEditor,
	groupOf,
	radialOf,
	radialTarget,
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

const of = (s: EditorState, part: string) => s.design.parts.filter((p) => p.part === part);

/** Four boosters at symmetry 4: radial decouplers on tank 3, a booster on each. */
function boosted(): EditorState {
	let s = stackOnPad();
	s = attachNew(
		s,
		content,
		'stock.radial-decoupler',
		radialAt(s, 'stock.radial-decoupler', 3, 0, 0),
		4
	);
	const first = of(s, 'stock.radial-decoupler')[0]!;
	const outer = attachTargets(
		s.design,
		singlePart('stock.booster', s.nextIndex),
		content.parts
	).find((t) => t.parent?.index === first.index && t.parent.parentNode === 'outer')!;
	return attachNew(s, content, 'stock.booster', outer);
}

describe('symmetry (plan 217)', () => {
	it('the counts are 1 to 8', () => {
		expect([...SYMMETRY_COUNTS]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('a fin placed on one of four symmetric boosters gives four fins, in one undo step', () => {
		const s = boosted();
		const boosters = of(s, 'stock.booster');
		expect(boosters).toHaveLength(4);
		// the symmetry setting is 1: the parent's group of four is inherited
		const fins = attachNew(
			s,
			content,
			'stock.fin',
			radialAt(s, 'stock.fin', boosters[0]!.index, Math.PI / 2, 0),
			1
		);
		const placed = of(fins, 'stock.fin');
		expect(placed).toHaveLength(4);
		expect(new Set(placed.map((p) => p.parent!.index))).toEqual(
			new Set(boosters.map((b) => b.index))
		);
		expect(groupOf(fins.design, placed[0]!.index)).toHaveLength(4);
		expect(of(undo(fins), 'stock.fin')).toHaveLength(0);
	});

	it('mirror symmetry places two wings reflected across the vessel plane', () => {
		const s = stackOnPad();
		const a = 0.4;
		const w = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', 3, a, 0), {
			count: 1,
			mirror: true
		});
		const wings = of(w, 'stock.wing');
		expect(wings).toHaveLength(2);
		const angles = wings.map((p) => radialOf(w.design, p.index)!.angle);
		expect(angles[0]).toBeCloseTo(a, 9);
		expect(angles[1]).toBeCloseTo(Math.PI - a, 9);
		expect(wings[0]!.mirror).toBeUndefined();
		expect(wings[1]!.mirror).toBe(true);
		expect(wings[0]!.symmetry).toBe(wings[1]!.symmetry);
		expect(of(undo(w), 'stock.wing')).toHaveLength(0);
	});

	it('a part on a mirrored wing is mirrored too', () => {
		const s = stackOnPad();
		const w = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', 3, 0.4, 0), {
			count: 1,
			mirror: true
		});
		const [left] = of(w, 'stock.wing');
		const site = radialAt(w, 'stock.fin', left!.index, 0.3, 0);
		const fins = of(attachNew(w, content, 'stock.fin', site), 'stock.fin');
		expect(fins).toHaveLength(2);
		const [a, b] = fins.map((p) => p.parent!.radial!.angle);
		expect(b).toBeCloseTo(-a!, 9);
		expect(fins[1]!.mirror).toBe(true);
	});

	for (const n of [5, 7, 8]) {
		it(`${n}-way symmetry places ${n} fins evenly`, () => {
			const s = stackOnPad();
			const f = attachNew(s, content, 'stock.fin', radialAt(s, 'stock.fin', 3, 0, 0), n);
			const fins = of(f, 'stock.fin');
			expect(fins).toHaveLength(n);
			const angles = fins.map((p) => radialOf(f.design, p.index)!.angle).sort((x, y) => x - y);
			for (let k = 1; k < n; k++) {
				expect(angles[k]! - angles[k - 1]!).toBeCloseTo((2 * Math.PI) / n, 9);
			}
			expect(of(undo(f), 'stock.fin')).toHaveLength(0);
		});
	}
});
