/** Free placement (plan 279, ADR 0258): offset and free tilt, symmetry as mirror images, the touch bound, free mode. */
import { loadPlugins, mat3OfQuat, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, parseDesign, serialiseDesign } from '../design';
import { obbsTouch, partsOffParent } from './bounds';
import { checkDesign } from './checks';
import {
	attachNew,
	attachTargets,
	createEditor,
	layoutOf,
	moveSubtree,
	onShapeSide,
	nudgedOffset,
	offsetOf,
	radialTarget,
	setFreePlacement,
	setPlacement,
	setTilt,
	singlePart,
	surfaceTarget,
	tiltOf,
	turnedTilt,
	undo,
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
const finsOn = (s: EditorState, symmetry: number | { count: number; mirror: boolean }) => {
	const t = radialTarget(s.design, singlePart('stock.fin', s.nextIndex), lookup, 2, 0, 0)!;
	return attachNew(s, content, 'stock.fin', t, symmetry);
};
const pos = (s: EditorState, i: number) => layoutOf(s.design, lookup)!.get(i)!.position;
const ofPart = (s: EditorState, part: string) =>
	s.design.parts.filter((p) => p.part === part).map((p) => p.index);

describe('offset of a part (format 4)', () => {
	it('moves the part and what hangs on it by the offset; one undo step; saved and loaded the same', () => {
		const s = stack();
		const before1 = pos(s, 1);
		const before2 = pos(s, 2);
		const moved = setPlacement(s, content, 1, { offset: { x: 0.3, y: 0, z: -0.2 } });
		expect(offsetOf(moved.design, 1)).toEqual({ x: 0.3, y: 0, z: -0.2 });
		expect(moved.design.formatVersion).toBe(4);
		expect(pos(moved, 1).x - before1.x).toBeCloseTo(0.3, 9);
		expect(pos(moved, 1).z - before1.z).toBeCloseTo(-0.2, 9);
		expect(pos(moved, 2).x - before2.x).toBeCloseTo(0.3, 9);
		expect(undo(moved).design.parts.find((p) => p.index === 1)!.offset).toBeUndefined();
		const back = parseDesign(serialiseDesign(moved.design), lookup);
		expect(back.ok && back.design.parts.find((p) => p.index === 1)!.offset).toEqual({
			x: 0.3,
			y: 0,
			z: -0.2
		});
		// a zero offset removes the field
		const zero = setPlacement(moved, content, 1, { offset: { x: 0, y: 0, z: 0 } });
		expect(zero.design.parts.find((p) => p.index === 1)!.offset).toBeUndefined();
	});

	it('the root does not move', () => {
		expect(() => setPlacement(stack(), content, 0, { offset: { x: 1, y: 0, z: 0 } })).toThrow(
			'root'
		);
	});

	it('normal mode keeps a moved part touching its parent; free mode lifts the bound and the launch check warns', () => {
		const s = stack();
		expect(() => setPlacement(s, content, 2, { offset: { x: 3, y: 0, z: 0 } })).toThrow(
			'Free mode'
		);
		// 0.2 m off the side still touches the parent enlarged by 0.25 m
		const near = setPlacement(s, content, 2, { offset: { x: 0.9, y: 0, z: 0 } });
		expect(partsOffParent(near.design, lookup)).toEqual([]);
		const free = setFreePlacement(s, true);
		expect(free.design.freePlacement).toBe(true);
		const far = setPlacement(free, content, 2, { offset: { x: 3, y: 0, z: 0 } });
		expect(partsOffParent(far.design, lookup)).toEqual([2]);
		const checks = checkDesign(
			far,
			{ ...content, resources: registries.resources },
			{ liftoffTwr: 2 }
		);
		const off = checks.find((c) => c.id === 'off-parent');
		expect(off?.severity).toBe('warning');
		expect(off?.parts).toContain(2);
		// free placement is saved with the design and cleared again
		const back = parseDesign(serialiseDesign(far.design), lookup);
		expect(back.ok && back.design.freePlacement).toBe(true);
		expect(setFreePlacement(far, false).design.freePlacement).toBeUndefined();
	});

	it('a part carried to a new place leaves its old offset behind', () => {
		const s = setPlacement(stack(), content, 2, { offset: { x: 0.2, y: 0, z: 0 } });
		const t = attachTargets(
			{ ...s.design, parts: s.design.parts.filter((p) => p.index !== 2) },
			singlePart(TANK, 2),
			lookup
		).find((x) => x.parent?.index === 1 && x.parent.parentNode === 'bottom')!;
		const moved = moveSubtree(s, content, 2, t);
		expect(offsetOf(moved.design, 2)).toEqual({ x: 0, y: 0, z: 0 });
	});
});

describe('free tilt', () => {
	it('takes any angle on every axis, past a quarter turn', () => {
		const s = stack();
		const t = { x: 2.5, y: -3, z: 1.8 };
		const tilted = setTilt(s, content, 1, t);
		expect(tiltOf(tilted.design, 1)).toEqual(t);
		expect(resolveVesselDesign(tilted.design, lookup).ok).toBe(true);
	});
});

describe('symmetry copies follow as mirror images', () => {
	it('an offset turns with each copy of a radial group around the parent', () => {
		const s = finsOn(stack(), 4);
		const fins = ofPart(s, 'stock.fin');
		expect(fins).toHaveLength(4);
		const before = fins.map((i) => pos(s, i));
		const moved = setPlacement(s, content, fins[0]!, { offset: { x: 0, y: 0.2, z: 0.1 } });
		for (const [k, i] of fins.entries()) {
			const now = pos(moved, i);
			// the same height change for all, and the sideways shift turns with the copy
			expect(now.y - before[k]!.y).toBeCloseTo(0.2, 9);
			expect(Math.hypot(now.x - before[k]!.x, now.z - before[k]!.z)).toBeCloseTo(0.1, 9);
		}
		// copies on opposite sides shift opposite ways
		const d0 = pos(moved, fins[0]!).z - before[0]!.z;
		const d2 = pos(moved, fins[2]!).z - before[2]!.z;
		expect(d0 + d2).toBeCloseTo(0, 9);
	});

	it('a mirror pair reflects the offset across the vessel’s YZ plane and the tilt by mirrorTilt', () => {
		const s = finsOn(stack(), { count: 1, mirror: true });
		const [a, b] = ofPart(s, 'stock.fin');
		const before = [pos(s, a!), pos(s, b!)];
		const moved = setPlacement(s, content, a!, { offset: { x: 0.1, y: 0.05, z: 0.2 } });
		expect(offsetOf(moved.design, b!)).toEqual({ x: -0.1, y: 0.05, z: 0.2 });
		expect(pos(moved, a!).x - before[0]!.x).toBeCloseTo(0.1, 9);
		expect(pos(moved, b!).x - before[1]!.x).toBeCloseTo(-0.1, 9);
		// mirror images: x opposite, y and z the same
		expect(pos(moved, a!).x).toBeCloseTo(-pos(moved, b!).x, 9);
		expect(pos(moved, a!).y).toBeCloseTo(pos(moved, b!).y, 9);
		expect(pos(moved, a!).z).toBeCloseTo(pos(moved, b!).z, 9);
		const tilted = setPlacement(moved, content, a!, { tilt: { x: 0.2, y: 0.3, z: 0.4 } });
		expect(tiltOf(tilted.design, b!)).toEqual({ x: -0.2, y: -0.3, z: 0.4 });
		expect(offsetOf(tilted.design, b!)).toEqual({ x: -0.1, y: 0.05, z: 0.2 });
	});

	it('with single only the picked part moves and it leaves the group', () => {
		const s = finsOn(stack(), 2);
		const [a, b] = ofPart(s, 'stock.fin');
		const moved = setPlacement(
			s,
			content,
			a!,
			{ offset: { x: 0, y: 0.1, z: 0 } },
			{ single: true }
		);
		expect(offsetOf(moved.design, b!)).toEqual({ x: 0, y: 0, z: 0 });
		expect(moved.design.parts.find((p) => p.index === a)!.symmetry).toBeUndefined();
	});
});

describe('keyboard nudges and turns (local and absolute frames)', () => {
	it('an absolute nudge moves along the vessel axes even under a tilted parent', () => {
		let s = stack();
		s = setTilt(s, content, 1, { x: 0, y: 0, z: Math.PI / 2 });
		const before = pos(s, 2);
		const o = nudgedOffset(s.design, lookup, 2, [0, 0.1, 0], 'absolute')!;
		const moved = setPlacement(s, content, 2, { offset: o });
		expect(pos(moved, 2).y - before.y).toBeCloseTo(0.1, 9);
		expect(pos(moved, 2).x - before.x).toBeCloseTo(0, 9);
	});

	it('a local nudge moves along the part’s own axes', () => {
		let s = stack();
		s = setTilt(s, content, 2, { x: 0, y: 0, z: Math.PI / 2 });
		const before = pos(s, 2);
		// the tank's +Y points along the vessel's -X now
		const o = nudgedOffset(s.design, lookup, 2, [0, 0.1, 0], 'local')!;
		const moved = setPlacement(s, content, 2, { offset: o });
		expect(pos(moved, 2).x - before.x).toBeCloseTo(-0.1, 9);
		expect(pos(moved, 2).y - before.y).toBeCloseTo(0, 9);
	});

	it('turns add up past a quarter turn in both frames', () => {
		const s = stack();
		let t = tiltOf(s.design, 2);
		let cur = s;
		for (let k = 0; k < 8; k++) {
			t = turnedTilt(cur.design, lookup, 2, 'x', (15 * Math.PI) / 180, 'absolute')!;
			cur = setPlacement(cur, content, 2, { tilt: t });
		}
		expect(t.x).toBeCloseTo((120 * Math.PI) / 180, 7);
		// local: a turn about the part's own Y after a quarter turn about X is about the vessel's Z
		let l = setTilt(s, content, 2, { x: Math.PI / 2, y: 0, z: 0 });
		const turned = turnedTilt(l.design, lookup, 2, 'y', Math.PI / 2, 'local')!;
		l = setPlacement(l, content, 2, { tilt: turned });
		const m = mat3OfQuat(layoutOf(l.design, lookup)!.get(2)!.rotation);
		// the part's Y axis is unchanged by a turn about itself: still the vessel's +Z
		expect(m[1]).toBeCloseTo(0, 9);
		expect(m[4]).toBeCloseTo(0, 9);
		expect(m[7]).toBeCloseTo(1, 9);
		// and its X axis went from +X to +Y (Ry sends X to -Z, Rx(90) sends -Z to +Y)
		expect(m[0]).toBeCloseTo(0, 9);
		expect(m[3]).toBeCloseTo(1, 9);
	});

	it('the root has no nudge or turn', () => {
		const s = stack();
		expect(nudgedOffset(s.design, lookup, 0, [0.1, 0, 0], 'absolute')).toBeNull();
		expect(turnedTilt(s.design, lookup, 0, 'x', 0.1, 'local')).toBeNull();
	});
});

describe('surface attach anywhere (plan 279)', () => {
	it('a docking port (stack nodes only) goes on the side of a tank, facing out', () => {
		const s = stack();
		const tank = pos(s, 1);
		const r = (lookup.get(TANK)!.shape as { radius: number }).radius;
		const t = surfaceTarget(s.design, singlePart('stock.docking-port', s.nextIndex), lookup, 1, {
			point: { x: tank.x + r, y: tank.y + 0.2, z: tank.z },
			normal: [1, 0, 0]
		})!;
		expect(t.node).toBe('bottom');
		const next = attachNew(s, content, 'stock.docking-port', t);
		const port = next.nextIndex - 1;
		const m = mat3OfQuat(layoutOf(next.design, lookup)!.get(port)!.rotation);
		// the port's +Y (its docking face) points along the tank's outward normal, +X
		expect(m[0 * 3 + 1]).toBeCloseTo(1, 9);
		expect(resolveVesselDesign(next.design, lookup).ok).toBe(true);
	});

	it('a radial site is used only on the collider’s side, not on a pod’s slope inside it', () => {
		const s = stack();
		const pod = pos(s, 0);
		const r = (lookup.get(POD)!.shape as { radius: number }).radius;
		expect(onShapeSide(s.design, lookup, 0, { x: pod.x + r, y: pod.y - 0.3, z: pod.z })).toBe(true);
		// the cone's face, well inside the collider's radius
		expect(onShapeSide(s.design, lookup, 0, { x: pod.x + r * 0.6, y: pod.y + 0.3, z: pod.z })).toBe(
			false
		);
	});
});

describe('oriented box touch test', () => {
	const box = (c: [number, number, number], half: [number, number, number], turn = 0) => ({
		centre: c,
		axes: [
			[Math.cos(turn), Math.sin(turn), 0],
			[-Math.sin(turn), Math.cos(turn), 0],
			[0, 0, 1]
		] as [number, number, number][],
		half
	});
	it('separates boxes apart and finds touching and turned ones', () => {
		expect(obbsTouch(box([0, 0, 0], [1, 1, 1]), box([2.5, 0, 0], [1, 1, 1]))).toBe(false);
		expect(obbsTouch(box([0, 0, 0], [1, 1, 1]), box([2, 0, 0], [1, 1, 1]))).toBe(true);
		// a box turned 45 degrees reaches sqrt 2 along X
		expect(obbsTouch(box([0, 0, 0], [1, 1, 1]), box([2.3, 0, 0], [1, 1, 1], Math.PI / 4))).toBe(
			true
		);
		expect(obbsTouch(box([0, 0, 0], [1, 1, 1]), box([2.5, 0, 0], [1, 1, 1], Math.PI / 4))).toBe(
			false
		);
	});
});
