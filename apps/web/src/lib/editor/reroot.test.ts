import { loadPlugins, resolveVesselDesign, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import { boosterRocket } from './examples';
import { reroot } from './reroot';
import { poseOf, relativePose, samePose } from './frames';
import {
	attachConnector,
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	radialTarget,
	singlePart,
	surfaceTarget,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const lookup = registries.parts;

function stack(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of ['stock.command-pod', 'stock.tank-small', 'stock.tank-small']) {
		const last = s.design.parts.at(-1);
		const targets = attachTargets(s.design, singlePart(part, s.nextIndex), lookup);
		const t = last
			? targets.find((x) => x.parent?.index === last.index && x.parent.parentNode === 'bottom')
			: targets[0];
		s = attachNew(s, content, part, t!);
	}
	return s;
}

/** Every part's position relative to part `ref`. */
const relative = (d: EditorState['design'], ref: number) => {
	const at = layoutOf(d, lookup)!;
	const o = at.get(ref)!.position;
	return new Map(
		[...at].map(([i, l]) => [
			i,
			[l.position.x - o.x, l.position.y - o.y, l.position.z - o.z].map((v) => +v.toFixed(6))
		])
	);
};

describe('reroot (plan 348, ADR 0297)', () => {
	it('turns over every stack link between the new and the old root', () => {
		const s = stack();
		const [pod, tank1, tank2] = s.design.parts.map((p) => p.index) as [number, number, number];
		const r = reroot(s.design, tank2, content);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const parentOf = (i: number) => r.design.parts.find((p) => p.index === i)!.parent;
		expect(parentOf(tank2)).toBeNull();
		expect(parentOf(tank1)).toEqual({ index: tank2, parentNode: 'top', node: 'bottom' });
		expect(parentOf(pod)).toEqual({ index: tank1, parentNode: 'top', node: 'bottom' });
	});

	it('keeps every part where it was relative to the others', () => {
		const s = stack();
		const tank2 = s.design.parts[2]!.index;
		const r = reroot(s.design, tank2, content);
		if (!r.ok) throw new Error('refused');
		expect(relative(r.design, tank2)).toEqual(relative(s.design, tank2));
	});

	it('refuses the root itself and a missing part', () => {
		const d = boosterRocket(content);
		const root = d.parts.find((p) => p.parent === null)!.index;
		expect(reroot(d, root, content)).toEqual({ ok: false, reason: 'already' });
		expect(reroot(d, 999, content)).toEqual({ ok: false, reason: 'missing' });
	});
});

/** Every part keeps its pose seen from the new root (plan 357, ADR 0301 point 5). */
function expectSamePoses(before: VesselDesign, after: VesselDesign, root: number): void {
	expect(resolveVesselDesign(after, lookup).ok).toBe(true);
	const old = layoutOf(before, lookup)!;
	const now = layoutOf(after, lookup)!;
	const top = poseOf(old.get(root)!);
	expect(now.size).toBe(old.size);
	for (const [i, l] of old) {
		const want = relativePose(poseOf(l), top);
		expect(samePose(poseOf(now.get(i)!), want), `part ${i}`).toBe(true);
	}
	expect(after.parts.find((p) => p.parent === null)!.index).toBe(root);
}

describe('reroot through side links (plan 357, ADR 0301)', () => {
	it('a fin on the side of the bottom tank becomes the root: the tank hangs on its side by its free node', () => {
		let s = stack();
		const [, , tank2] = s.design.parts.map((p) => p.index) as [number, number, number];
		const t = radialTarget(
			s.design,
			singlePart('stock.fin', s.nextIndex),
			lookup,
			tank2,
			0.8,
			-0.3
		)!;
		s = attachNew(s, content, 'stock.fin', t);
		const fin = s.design.parts.at(-1)!.index;
		const r = reroot(s.design, fin, content);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expectSamePoses(s.design, r.design, fin);
		// the tank's top node holds the tank above it, so it takes its bottom node
		expect(r.design.parts.find((p) => p.index === tank2)!.parent).toMatchObject({
			index: fin,
			parentNode: 'surface',
			node: 'bottom'
		});
	});

	it('a booster on a radial decoupler becomes the root: the core hangs on the decoupler by an inverse link (plan 358, ADR 0333)', () => {
		const d = boosterRocket(content);
		const booster = d.parts.find((p) => p.part === 'stock.booster')!.index;
		const r = reroot(d, booster, content);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expectSamePoses(d, r.design, booster);
		expect(r.design.formatVersion).toBe(5);
		const decoupler = d.parts.find((p) => p.part === 'stock.radial-decoupler')!;
		const inverse = r.design.parts.find(
			(p) => p.parent?.index === decoupler.index && p.parent.node === 'surface'
		);
		expect(inverse?.parent).toMatchObject({ parentNode: decoupler.parent!.node, node: 'surface' });
		expect(inverse?.parent?.surface).toBeDefined();
		// and the whole reversal round-trips through the stack of the original again
		const back = reroot(r.design, d.parts.find((p) => p.parent === null)!.index, content);
		expect(back.ok).toBe(true);
		if (back.ok)
			expectSamePoses(r.design, back.design, d.parts.find((p) => p.parent === null)!.index);
	});

	it('a nose cone above the booster becomes the root the same way', () => {
		const d = boosterRocket(content);
		const cone = d.parts.find((p) => p.part === 'stock.nose-cone')!.index;
		const r = reroot(d, cone, content);
		expect(r.ok).toBe(true);
		if (r.ok) expectSamePoses(d, r.design, cone);
	});

	it('refuses a side link when the old parent has no node left to hang by', () => {
		// fins on the middle tank: its top and bottom nodes both hold a stack neighbour
		let s = stack();
		const tank1 = s.design.parts[1]!.index;
		const t = radialTarget(s.design, singlePart('stock.fin', s.nextIndex), lookup, tank1, 0, 0)!;
		s = attachNew(s, content, 'stock.fin', t);
		expect(reroot(s.design, s.design.parts.at(-1)!.index, content)).toEqual({
			ok: false,
			reason: 'path'
		});
	});

	it('through a surface link: a tank standing off the axis on the pod’s top face', () => {
		let s = stack();
		const pod = s.design.parts[0]!.index;
		const podShape = lookup.get('stock.command-pod')!.shape!;
		const top = podShape.kind === 'cylinder' ? podShape.height / 2 : 0;
		const podAt = layoutOf(s.design, lookup)!.get(pod)!.position;
		const t = surfaceTarget(s.design, singlePart('stock.tank-small', s.nextIndex), lookup, pod, {
			point: { x: podAt.x + 0.2, y: podAt.y + top, z: podAt.z + 0.1 },
			normal: [0, 1, 0]
		})!;
		s = attachNew(s, content, 'stock.tank-small', t);
		const tank = s.design.parts.at(-1)!.index;
		expect(s.design.parts.at(-1)!.parent!.surface).toBeDefined();
		const r = reroot(s.design, tank, content);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expectSamePoses(s.design, r.design, tank);
		expect(r.design.parts.find((p) => p.index === pod)!.parent).toMatchObject({
			index: tank,
			parentNode: 'surface'
		});
	});

	it('through stack parts with a tilt and an offset', () => {
		const s = stack();
		const [, tank1, tank2] = s.design.parts.map((p) => p.index) as [number, number, number];
		// the first tank pitched and shifted, the second pitched back: the bottom tank stays upright
		const d: VesselDesign = {
			...s.design,
			parts: s.design.parts.map((p) =>
				p.index === tank1
					? { ...p, tilt: { x: 0.3, y: 0.2, z: 0 }, offset: { x: 0.1, y: 0, z: -0.05 } }
					: p.index === tank2
						? { ...p, tilt: { x: -0.3, y: 0, z: 0 }, offset: { x: 0, y: 0.02, z: 0 } }
						: p
			)
		};
		expect(resolveVesselDesign(d, lookup).ok).toBe(true);
		// tank 2's turn is Rx(0.3) Ry(0.2) Rx(-0.3): not upright, so it is refused as a root
		expect(reroot(d, tank2, content)).toEqual({ ok: false, reason: 'tipped' });
		// a yaw-only tilt keeps it upright: allowed, the vessel turns about its axis with it
		const yawed: VesselDesign = {
			...d,
			parts: d.parts.map((p) =>
				p.index === tank1
					? { ...p, tilt: { x: 0, y: 0.7, z: 0 } }
					: p.index === tank2
						? { ...p, tilt: undefined }
						: p
			)
		};
		const r = reroot(yawed, tank2, content);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expectSamePoses(yawed, r.design, tank2);
		// tank 1 kept its turn about the pod, so the pod now carries the opposite turn and the shift
		const pod = r.design.parts.find((p) => p.parent?.index === tank1)!;
		expect(pod.tilt?.y).toBeCloseTo(-0.7, 9);
		expect(pod.offset).toBeDefined();
	});

	it('refuses a strut or fuel line on the path', () => {
		const d = boosterRocket(content);
		const s = createEditor(d, content);
		const booster = d.parts.find((p) => p.part === 'stock.booster')!.index;
		const core = d.parts.find((p) => p.part === 'stock.radial-decoupler')!.parent!.index;
		const placed = attachConnector(
			s,
			content,
			'stock.strut',
			{ index: booster, angle: Math.PI, y: 0.5 },
			{ index: core, angle: 0, y: 0.5 }
		);
		const strut = placed.design.parts.at(-1)!.index;
		expect(reroot(placed.design, strut, content)).toEqual({ ok: false, reason: 'connector' });
	});
});
