/** Plan 026 / ADR 0034: radial placement, symmetry, group operations, auto-staging with boosters. */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import {
	attachNew,
	attachTargets,
	createEditor,
	deleteSubtree,
	detach,
	groupOf,
	layoutOf,
	moveSubtree,
	planAttach,
	radialTarget,
	redo,
	siteOfPoint,
	singlePart,
	snapRadial,
	undo,
	type EditorState
} from './state';
import { autoStages } from './staging';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };

function stackOnPad(): EditorState {
	let s = createEditor(emptyDesign(), content);
	const parts = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.tank-small',
		'stock.engine-lv'
	];
	for (const part of parts) {
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

/** Four boosters on the lower tank (index 3): decoupler, booster on its outer node, cone on top. */
function saturn(n = 4): EditorState {
	let s = stackOnPad();
	s = attachNew(
		s,
		content,
		'stock.radial-decoupler',
		radialAt(s, 'stock.radial-decoupler', 3, 0, 0),
		n
	);
	const decouplers = s.design.parts.filter((p) => p.part === 'stock.radial-decoupler');
	expect(decouplers).toHaveLength(n);
	const outer = attachTargets(
		s.design,
		singlePart('stock.booster', s.nextIndex),
		content.parts
	).find((t) => t.parent?.index === decouplers[0]!.index && t.parent.parentNode === 'outer')!;
	s = attachNew(s, content, 'stock.booster', outer);
	const boosters = s.design.parts.filter((p) => p.part === 'stock.booster');
	const top = attachTargets(
		s.design,
		singlePart('stock.nose-cone', s.nextIndex),
		content.parts
	).find((t) => t.parent?.index === boosters[0]!.index && t.parent.parentNode === 'top')!;
	return attachNew(s, content, 'stock.nose-cone', top);
}

describe('radial placement', () => {
	it('a pointer hit becomes the azimuth and height on the parent; snapping rounds both', () => {
		const s = stackOnPad();
		// Tank 3 (stack index 3) is at y = -3.9 from the pod; a point on its +Z side, 0.3 m above its middle.
		const at = layoutOf(s.design, content.parts)!.get(3)!;
		const site = siteOfPoint(s.design, content.parts, 3, {
			x: at.position.x,
			y: at.position.y + 0.3,
			z: at.position.z - 0.625
		})!;
		// +X maps to azimuth 0, a quarter turn about +Y sends +X to -Z: -Z is azimuth pi/2.
		expect(site.angle).toBeCloseTo(Math.PI / 2, 9);
		expect(site.y).toBeCloseTo(0.3, 9);
		const snapped = snapRadial({ angle: site.angle + 0.05, y: 0.3 }, 2, 3.2);
		expect(snapped.angle).toBeCloseTo(Math.PI / 2, 9);
		expect(snapped.y).toBeCloseTo(0.25, 9);
		// The child's end next to the parent's end pulls the height to the aligned position.
		expect(snapRadial({ angle: 0, y: -0.8 }, 2, 0.6).y).toBeCloseTo(-0.7, 9);
	});

	it('a radial target resolves to the position the design format gives', () => {
		const s = stackOnPad();
		const t = radialAt(s, 'stock.fin', 3, Math.PI / 2, -0.5);
		expect(t.parent).toEqual({ index: 3, parentNode: 'surface' });
		const placed = attachNew(s, content, 'stock.fin', t);
		const layout = layoutOf(placed.design, content.parts)!.get(placed.nextIndex - 1)!;
		expect(layout.position.x).toBeCloseTo(t.position.x, 9);
		expect(layout.position.y).toBeCloseTo(t.position.y, 9);
		expect(layout.position.z).toBeCloseTo(t.position.z, 9);
		expect(layout.yaw).toBeCloseTo(Math.PI / 2, 9);
		expect(placed.design.formatVersion).toBe(2);
	});

	it('refuses spots outside the parent and parts without a cylinder', () => {
		const s = stackOnPad();
		expect(radialTarget(s.design, singlePart('stock.fin', 9), content.parts, 3, 0, 1.5)).toBeNull();
		// A part without a horizontal node cannot go on a side.
		expect(
			radialTarget(s.design, singlePart('stock.tank-small', 9), content.parts, 3, 0, 0)
		).toBeNull();
	});

	it('keyboard targets include radial sites for a radial part and none for a stack part', () => {
		const s = stackOnPad();
		const fin = attachTargets(s.design, singlePart('stock.fin', 9), content.parts, 0.5);
		expect(fin.filter((t) => t.radial)).not.toHaveLength(0);
		expect(fin.every((t) => !t.radial || t.radial.angle === 0.5)).toBe(true);
		const tank = attachTargets(s.design, singlePart('stock.tank-small', 9), content.parts);
		expect(tank.some((t) => t.radial)).toBe(false);
	});
});

describe('symmetry', () => {
	for (const n of [2, 3, 4, 6]) {
		it(`${n}-fold placement makes ${n} parts ${360 / n} degrees apart in one group`, () => {
			const s = stackOnPad();
			const next = attachNew(s, content, 'stock.fin', radialAt(s, 'stock.fin', 3, 0.3, -0.5), n);
			const fins = next.design.parts.filter((p) => p.part === 'stock.fin');
			expect(fins).toHaveLength(n);
			expect(new Set(fins.map((p) => p.symmetry)).size).toBe(1);
			fins.forEach((p, k) => {
				expect(p.parent!.radial!.angle).toBeCloseTo(0.3 + (2 * Math.PI * k) / n, 9);
				expect(p.parent!.radial!.y).toBe(-0.5);
			});
			expect(groupOf(next.design, fins[0]!.index)).toEqual(fins.map((p) => p.index));
			expect(resolveVesselDesign(next.design, content.parts).ok).toBe(true);
			// One undo step removes the whole set; redo brings it back.
			expect(undo(next).design.parts.filter((p) => p.part === 'stock.fin')).toHaveLength(0);
			expect(redo(undo(next)).design.parts.filter((p) => p.part === 'stock.fin')).toHaveLength(n);
		});
	}

	it('a part attached to a member of a group is copied onto every member', () => {
		const s = saturn(4);
		expect(s.design.parts.filter((p) => p.part === 'stock.booster')).toHaveLength(4);
		expect(s.design.parts.filter((p) => p.part === 'stock.nose-cone')).toHaveLength(4);
		// Each booster hangs on a different decoupler.
		const parents = s.design.parts
			.filter((p) => p.part === 'stock.booster')
			.map((p) => p.parent!.index);
		expect(new Set(parents).size).toBe(4);
	});

	it('the preview of a symmetric placement lists every copy', () => {
		const s = stackOnPad();
		const { design, added } = planAttach(s, 'stock.fin', radialAt(s, 'stock.fin', 3, 0, 0), 3);
		expect(added).toHaveLength(3);
		expect(design.parts.filter((p) => p.part === 'stock.fin')).toHaveLength(3);
		// The editor's own state is untouched.
		expect(s.design.parts.some((p) => p.part === 'stock.fin')).toBe(false);
	});

	it('duplicate sites are refused, atomically', () => {
		const s = stackOnPad();
		const once = attachNew(s, content, 'stock.fin', radialAt(s, 'stock.fin', 3, 0, 0));
		expect(() =>
			attachNew(once, content, 'stock.fin', radialAt(once, 'stock.fin', 3, 0, 0))
		).toThrow(/already at that radial site/);
	});
});

describe('group operations and undo', () => {
	it('deleting one booster of a group removes all of them with their subtrees; single removes one', () => {
		const s = saturn(4);
		const decouplers = s.design.parts.filter((p) => p.part === 'stock.radial-decoupler');
		const all = deleteSubtree(s, content, decouplers[1]!.index);
		expect(all.design.parts.map((p) => p.part)).not.toContain('stock.booster');
		expect(all.design.parts).toHaveLength(5);
		const one = deleteSubtree(s, content, decouplers[1]!.index, { single: true });
		expect(one.design.parts.filter((p) => p.part === 'stock.booster')).toHaveLength(3);
		expect(undo(all).design.parts).toHaveLength(s.design.parts.length);
	});

	it('detaching a group leaves each booster set loose', () => {
		const s = saturn(2);
		const dec = s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!;
		const loose = detach(s, content, dec.index);
		expect(loose.loose).toHaveLength(2);
		expect(loose.loose.every((a) => a.parts.length === 3)).toBe(true);
		expect(loose.design.parts).toHaveLength(5);
	});

	it('a moved booster set leaves its group; the others keep theirs', () => {
		const s = saturn(3);
		const decs = s.design.parts.filter((p) => p.part === 'stock.radial-decoupler');
		const moved = moveSubtree(
			s,
			content,
			decs[0]!.index,
			radialAt(s, 'stock.radial-decoupler', 2, 1, 0.2)
		);
		const m = moved.design.parts.find((p) => p.index === decs[0]!.index)!;
		expect(m.symmetry).toBeUndefined();
		expect(m.parent!.index).toBe(2);
		expect(groupOf(moved.design, decs[1]!.index)).toEqual([decs[1]!.index, decs[2]!.index]);
	});
});

describe('auto-staging with boosters', () => {
	it('ignites core and boosters together, then the radial decouplers', () => {
		const s = saturn(4);
		const engines = s.design.parts
			.filter((p) => p.part === 'stock.engine-lv' || p.part === 'stock.booster')
			.map((p) => p.index);
		const decouplers = s.design.parts
			.filter((p) => p.part === 'stock.radial-decoupler')
			.map((p) => p.index);
		expect(s.design.stages).toEqual([
			engines.sort((a, b) => a - b),
			decouplers.sort((a, b) => a - b)
		]);
		expect(autoStages(s.design, content)).toEqual(s.design.stages);
	});

	it('boosters on a two-stage core burn with the lower stage; the stack decoupler fires last', () => {
		let s = createEditor(referenceTwoStage(), content);
		// Index 5 is the lower tank of the reference vessel, 6 the lower engine, 3 and 4 the upper engine and decoupler.
		s = attachNew(
			s,
			content,
			'stock.radial-decoupler',
			radialAt(s, 'stock.radial-decoupler', 5, 0, 0),
			2
		);
		const decs = s.design.parts
			.filter((p) => p.part === 'stock.radial-decoupler')
			.map((p) => p.index);
		const outer = attachTargets(
			s.design,
			singlePart('stock.booster', s.nextIndex),
			content.parts
		).find((t) => t.parent?.index === decs[0] && t.parent.parentNode === 'outer')!;
		s = attachNew(s, content, 'stock.booster', outer);
		const boosters = s.design.parts.filter((p) => p.part === 'stock.booster').map((p) => p.index);
		expect(s.design.stages).toEqual([[6, ...boosters], decs, [3, 4]]);
	});
});
