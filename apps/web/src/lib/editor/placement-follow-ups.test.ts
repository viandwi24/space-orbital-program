/** Plan 304: the inner offsets of a mirrored sub-assembly copy, and a root that carries no placement of its own. */
import { loadPlugins, partId, resolveVesselDesign, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import {
	attachAssembly,
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	offsetOf,
	radialTarget,
	replaceDesign,
	setPlacement,
	withoutRootPlacement,
	singlePart,
	tiltOf,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;
const POD = 'stock.command-pod';
const TANK = 'stock.tank-small';

function stack(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of [POD, TANK, TANK]) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), lookup);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}
const pos = (s: EditorState, i: number) => layoutOf(s.design, lookup)!.get(i)!.position;

/** A radial decoupler with a fin on its outer face; the fin carries an offset and a tilt of its own. */
const booster = (offset: { x: number; y: number; z: number }): VesselDesign => ({
	...emptyDesign('booster'),
	formatVersion: 4,
	parts: [
		{ index: 100, part: partId('stock.radial-decoupler'), parent: null },
		{
			index: 101,
			part: partId('stock.fin'),
			parent: { index: 100, parentNode: 'outer', node: 'radial' },
			offset,
			tilt: { x: 0.2, y: 0.3, z: 0.1 }
		}
	]
});

describe('a mirrored sub-assembly copy (plan 304)', () => {
	it('has its inner parts as the mirror images of the first copy: x opposite, y and z the same', () => {
		const s0 = stack();
		const target = radialTarget(s0.design, booster({ x: 0, y: 0, z: 0 }), lookup, 2, 0, 0)!;
		const s = attachAssembly(s0, content, booster({ x: 0.1, y: 0.05, z: 0.2 }), target, {
			count: 1,
			mirror: true
		});
		const fins = s.design.parts.filter((p) => p.part === 'stock.fin').map((p) => p.index);
		expect(fins).toHaveLength(2);
		const [a, b] = fins as [number, number];
		expect(pos(s, a).x).toBeCloseTo(-pos(s, b).x, 9);
		expect(pos(s, a).y).toBeCloseTo(pos(s, b).y, 9);
		expect(pos(s, a).z).toBeCloseTo(pos(s, b).z, 9);
		// the offset is reflected like the tilt
		expect(Math.abs(offsetOf(s.design, a).z)).toBeCloseTo(Math.abs(offsetOf(s.design, b).z), 9);
		expect(offsetOf(s.design, a).y).toBeCloseTo(offsetOf(s.design, b).y, 9);
		expect(tiltOf(s.design, b)).toEqual({ x: -0.2, y: -0.3, z: 0.1 });
		expect(resolveVesselDesign(s.design, lookup).ok).toBe(true);
	});
});

describe('the root keeps no placement of its own (plan 304)', () => {
	const withRootPlacement = (): VesselDesign => {
		const d = stack().design;
		return {
			...d,
			formatVersion: 4,
			parts: d.parts.map((p) =>
				p.parent === null
					? { ...p, tilt: { x: 0.3, y: 0, z: 0 }, offset: { x: 0.4, y: 0, z: 0 } }
					: p
			)
		};
	};
	const root = (d: VesselDesign) => d.parts.find((p) => p.parent === null)!;

	it('a design loaded with a root tilt and offset keeps neither, and resolves as it did', () => {
		const loaded = withRootPlacement();
		const before = resolveVesselDesign(loaded, lookup);
		const s = replaceDesign(createEditor(emptyDesign(), content), content, loaded);
		expect(root(s.design).tilt).toBeUndefined();
		expect(root(s.design).offset).toBeUndefined();
		const after = resolveVesselDesign(s.design, lookup);
		expect(before.ok && after.ok).toBe(true);
		if (before.ok && after.ok) {
			// the resolver ignored them: every part stands where it stood
			expect(after.parts.map((p) => p.position)).toEqual(before.parts.map((p) => p.position));
		}
	});

	it('any later edit also drops them, and the Move and Rotate tools refuse the root', () => {
		const s = createEditor(withRootPlacement(), content);
		expect(root(s.design).tilt).toBeDefined();
		const rootIndex = root(s.design).index;
		expect(() => setPlacement(s, content, rootIndex, { offset: { x: 0.1, y: 0, z: 0 } })).toThrow();
		const next = attachNew(
			s,
			content,
			TANK,
			attachTargets(s.design, singlePart(TANK, s.nextIndex), lookup).find(
				(x) => x.parent?.parentNode === 'bottom' && x.parent.index === s.design.parts.at(-1)!.index
			)!
		);
		expect(root(next.design).tilt).toBeUndefined();
		expect(root(next.design).offset).toBeUndefined();
	});

	it('a design without root placement is returned as it is', () => {
		const d = stack().design;
		expect(withoutRootPlacement(d)).toBe(d);
	});
});
