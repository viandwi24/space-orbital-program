/** Plan 357 (ADR 0301 points 1 and 2): symmetry copies about the parent's or the vessel's axis. */
import { loadPlugins, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import { mirroredAcrossAxis, poseOf, samePose, turnedAboutAxis, type Pose } from './frames';
import {
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	radialTarget,
	singlePart,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;

function stack(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of ['stock.command-pod', 'stock.tank-small', 'stock.tank-small', 'stock.engine-lv']) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), lookup);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}

const radialAt = (s: EditorState, part: string, parent: number, angle: number, y: number) => {
	const t = radialTarget(s.design, singlePart(part, s.nextIndex), lookup, parent, angle, y);
	if (!t) throw new Error('no radial target');
	return t;
};

const of = (d: VesselDesign, part: string) => d.parts.filter((p) => p.part === part);

/** A booster on a radial decoupler at each of `angles` on the lower tank, each placed alone (no symmetry group). */
function sideBoosters(angles: number[]): EditorState {
	let s = stack();
	const tank = s.design.parts[2]!.index;
	for (const angle of angles) {
		s = attachNew(s, content, 'stock.radial-decoupler', radialAt(s, 'stock.radial-decoupler', tank, angle, 0));
		const dec = of(s.design, 'stock.radial-decoupler').at(-1)!;
		const outer = attachTargets(s.design, singlePart('stock.booster', s.nextIndex), lookup).find(
			(t) => t.parent?.index === dec.index && t.parent.parentNode === 'outer'
		)!;
		s = attachNew(s, content, 'stock.booster', outer);
	}
	return s;
}

const poses = (d: VesselDesign): Map<number, Pose> =>
	new Map([...layoutOf(d, lookup)!].map(([i, l]) => [i, poseOf(l)]));

describe('symmetry pivot (plan 357)', () => {
	it('about a part on the vessel axis both pivots give the same design', () => {
		const s = stack();
		const t = radialAt(s, 'stock.fin', s.design.parts[2]!.index, 0.3, -0.2);
		for (const spec of [{ count: 3 }, { count: 1, mirror: true }]) {
			const parent = attachNew(s, content, 'stock.fin', t, { ...spec, pivot: 'parent' });
			const vessel = attachNew(s, content, 'stock.fin', t, { ...spec, pivot: 'vessel' });
			expect(vessel.design).toEqual(parent.design);
		}
	});

	it('×2 about the vessel puts the copy on the opposite booster, turned half a turn about the axis', () => {
		const s = sideBoosters([0, Math.PI]);
		const [a, b] = of(s.design, 'stock.booster').map((p) => p.index) as [number, number];
		const t = radialAt(s, 'stock.fin', a, 0.4, -0.5);
		const out = attachNew(s, content, 'stock.fin', t, { count: 2, pivot: 'vessel' });
		const fins = of(out.design, 'stock.fin');
		expect(fins).toHaveLength(2);
		expect(fins[0]!.parent!.index).toBe(a);
		expect(fins[1]!.parent!.index).toBe(b);
		expect(fins[1]!.parent!.surface).toBeDefined();
		expect(fins[0]!.symmetry).toBe(fins[1]!.symmetry);
		const at = poses(out.design);
		const want = turnedAboutAxis(at.get(fins[0]!.index)!, Math.PI);
		expect(samePose(at.get(fins[1]!.index)!, want)).toBe(true);
		// and every part of the vessel stays where it was
		const before = poses(s.design);
		for (const [i, p] of before) expect(samePose(at.get(i)!, p)).toBe(true);
	});

	it('×2 about the parent keeps both copies on the one booster', () => {
		const s = sideBoosters([0, Math.PI]);
		const a = of(s.design, 'stock.booster')[0]!.index;
		const t = radialAt(s, 'stock.fin', a, 0.4, -0.5);
		const out = attachNew(s, content, 'stock.fin', t, { count: 2, pivot: 'parent' });
		expect(of(out.design, 'stock.fin').map((f) => f.parent!.index)).toEqual([a, a]);
	});

	it('×4 about the vessel with two boosters: the copies that touch nothing are left out', () => {
		const s = sideBoosters([0, Math.PI]);
		const a = of(s.design, 'stock.booster')[0]!.index;
		const t = radialAt(s, 'stock.fin', a, 0.4, -0.5);
		const out = attachNew(s, content, 'stock.fin', t, { count: 4, pivot: 'vessel' });
		expect(of(out.design, 'stock.fin')).toHaveLength(2);
		const single = sideBoosters([0]);
		const one = of(single.design, 'stock.booster')[0]!.index;
		const lone = attachNew(single, content, 'stock.fin', radialAt(single, 'stock.fin', one, 0.4, -0.5), {
			count: 2,
			pivot: 'vessel'
		});
		const fins = of(lone.design, 'stock.fin');
		expect(fins).toHaveLength(1);
		expect(fins[0]!.symmetry).toBeUndefined();
	});

	it('×3 about the vessel follows three boosters at 120 degrees', () => {
		const s = sideBoosters([0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]);
		const boosters = of(s.design, 'stock.booster').map((p) => p.index);
		const t = radialAt(s, 'stock.fin', boosters[0]!, 1.1, 0.3);
		const out = attachNew(s, content, 'stock.fin', t, { count: 3, pivot: 'vessel' });
		const fins = of(out.design, 'stock.fin');
		expect(fins.map((f) => f.parent!.index).sort()).toEqual([...boosters].sort());
		const at = poses(out.design);
		const first = at.get(fins[0]!.index)!;
		for (const [k, f] of fins.entries()) {
			const want = turnedAboutAxis(first, (2 * Math.PI * k) / 3);
			expect(samePose(at.get(f.index)!, want)).toBe(true);
		}
	});

	it('a mirror about the vessel lands reflected across its YZ plane on the other booster', () => {
		// boosters at +X and -X of the vessel: the YZ plane maps one onto the other
		const s = sideBoosters([0, Math.PI]);
		const [a, b] = of(s.design, 'stock.booster').map((p) => p.index) as [number, number];
		const fin = lookup.get('stock.fin')!;
		const t = radialAt(s, 'stock.fin', a, 0.9, 0.2);
		const out = attachNew(s, content, 'stock.fin', t, { count: 1, mirror: true, pivot: 'vessel' });
		const fins = of(out.design, 'stock.fin');
		expect(fins.map((f) => f.parent!.index)).toEqual([a, b]);
		expect(fins[1]!.mirror).toBe(true);
		const at = poses(out.design);
		const first = at.get(fins[0]!.index)!;
		const second = at.get(fins[1]!.index)!;
		const want = mirroredAcrossAxis(first, fin.attach![t.node]!.dir);
		expect(samePose(second, want)).toBe(true);
		expect(second.position.x).toBeCloseTo(-first.position.x, 9);
		expect(second.position.z).toBeCloseTo(first.position.z, 9);
		// a proper turn, not a reflection
		const m = second.rotation;
		const det =
			m[0] * (m[4] * m[8] - m[5] * m[7]) -
			m[1] * (m[3] * m[8] - m[5] * m[6]) +
			m[2] * (m[3] * m[7] - m[4] * m[6]);
		expect(det).toBeCloseTo(1, 9);
	});
});
