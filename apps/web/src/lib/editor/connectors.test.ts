/** Plan 041 / ADR 0071 and 0075: struts and fuel lines, tilt and radial attachment to boxes in the editor. */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import { stagingModelFromDesign } from '../delta-v';
import { stabilityOf } from './stability';
import { buildScene } from './scene';
import {
	attachConnector,
	attachNew,
	attachTargets,
	connectorPairs,
	createEditor,
	deleteSubtree,
	detach,
	groupOf,
	layoutOf,
	moveGroup,
	radialTarget,
	setTilt,
	singlePart,
	siteOfPoint,
	tiltOf,
	undo,
	type EditorState
} from './state';

const { registries } = loadPlugins([Stock]);
const content = { parts: registries.parts, modules: registries.modules };
const full = { ...content, resources: registries.resources };

function stackOnPad(): EditorState {
	let s = createEditor(emptyDesign(), content);
	for (const part of [
		'stock.command-pod',
		'stock.reaction-wheel',
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
const TANK = 2;

const radialAt = (s: EditorState, part: string, parent: number, angle: number, y: number) => {
	const t = radialTarget(s.design, singlePart(part, s.nextIndex), content.parts, parent, angle, y);
	if (!t) throw new Error('no radial target');
	return t;
};

/** The pad stack with `n` radial decouplers (symmetry group) each carrying a booster. */
function boosted(n: number): EditorState {
	let s = stackOnPad();
	s = attachNew(
		s,
		content,
		'stock.radial-decoupler',
		radialAt(s, 'stock.radial-decoupler', TANK, 0, 0),
		n
	);
	for (const d of groupOf(
		s.design,
		s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!.index
	)) {
		const t = attachTargets(s.design, singlePart('stock.booster', s.nextIndex), content.parts).find(
			(x) => x.parent?.index === d && x.parent.parentNode === 'outer'
		);
		s = attachNew(s, content, 'stock.booster', t!);
		if (n > 1) break; // the first booster is placed on every decoupler of the group
	}
	return s;
}
const indicesOf = (s: EditorState, part: string): number[] =>
	s.design.parts.filter((p) => p.part === part).map((p) => p.index);

describe('radial attachment to a box (ADR 0071)', () => {
	it('a control surface sits on the trailing face of a wing: the hand position and turn', () => {
		let s = stackOnPad();
		s = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', TANK, 0, 0));
		const wing = indicesOf(s, 'stock.wing')[0]!;
		// The wing is 3 m x 1 m x 0.08 m on a 0.625 m tank: its centre is 0.625 + 1.5 out. A control
		// surface on its -Z face (angle pi/2) sits 0.04 + 0.5 m beyond the wing's centre line.
		const t = radialTarget(
			s.design,
			singlePart('stock.control-surface', s.nextIndex),
			content.parts,
			wing,
			Math.PI / 2,
			0
		)!;
		expect(t).not.toBeNull();
		s = attachNew(s, content, 'stock.control-surface', t);
		const layout = layoutOf(s.design, content.parts)!;
		const wingAt = layout.get(wing)!;
		const cs = layout.get(s.nextIndex - 1)!;
		expect(wingAt.position.x).toBeCloseTo(2.125, 9);
		expect(cs.position.x).toBeCloseTo(wingAt.position.x, 9);
		expect(cs.position.z).toBeCloseTo(-0.54, 9);
		expect(cs.yaw).toBeCloseTo(Math.PI / 2, 9);
		expect(resolveVesselDesign(s.design, content.parts).ok).toBe(true);
		// The height must lie within the box.
		expect(
			radialTarget(s.design, singlePart('stock.control-surface', 99), content.parts, wing, 0, 0.6)
		).toBeNull();
	});

	it('a pointer hit on a box maps to the azimuth of the ray from its axis', () => {
		let s = stackOnPad();
		s = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', TANK, 0, 0));
		const wing = indicesOf(s, 'stock.wing')[0]!;
		const at = layoutOf(s.design, content.parts)!.get(wing)!;
		const site = siteOfPoint(s.design, content.parts, wing, {
			x: at.position.x,
			y: at.position.y + 0.2,
			z: at.position.z - 0.04
		})!;
		expect(site.angle).toBeCloseTo(Math.PI / 2, 9);
		expect(site.y).toBeCloseTo(0.2, 9);
	});

	it('keyboard targets offer radial sites on boxes for a radial part', () => {
		let s = stackOnPad();
		s = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', TANK, 0, 0));
		const wing = indicesOf(s, 'stock.wing')[0]!;
		const targets = attachTargets(s.design, singlePart('stock.control-surface', 99), content.parts);
		expect(targets.some((t) => t.parent?.index === wing && t.radial)).toBe(true);
	});
});

describe('tilt (ADR 0071)', () => {
	function wings(): EditorState {
		let s = stackOnPad();
		s = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', TANK, 0, 0), 2);
		return s;
	}

	it('the whole symmetric pair takes the tilt, mirrored by the geometry; undo restores it', () => {
		const s = wings();
		const [a, b] = indicesOf(s, 'stock.wing') as [number, number];
		const tilted = setTilt(s, content, a, { x: 0.12, y: 0, z: 0 });
		expect(tiltOf(tilted.design, a)).toEqual({ x: 0.12, y: 0, z: 0 });
		expect(tiltOf(tilted.design, b)).toEqual({ x: 0.12, y: 0, z: 0 });
		const layout = layoutOf(tilted.design, content.parts)!;
		// Both chords turn towards +Z of the vessel by the same angle: mirror images.
		const axisY = (i: number) => {
			const q = layout.get(i)!.rotation;
			return 2 * (q.y * q.z + q.w * q.x);
		};
		expect(axisY(a)).toBeCloseTo(Math.sin(0.12), 9);
		expect(axisY(b)).toBeCloseTo(Math.sin(0.12), 9);
		expect(layout.get(a)!.tilted && layout.get(b)!.tilted).toBe(true);
		expect(tilted.design.formatVersion).toBe(3);
		const back = undo(tilted);
		expect(tiltOf(back.design, a)).toEqual({ x: 0, y: 0, z: 0 });
		expect(back.design.parts.some((p) => p.tilt)).toBe(false);
	});

	it('single changes one part and leaves its group; a zero tilt removes the field; the root cannot be tilted', () => {
		const s = wings();
		const [a, b] = indicesOf(s, 'stock.wing') as [number, number];
		const one = setTilt(s, content, a, { x: 0, y: 0, z: 0.3 }, { single: true });
		expect(tiltOf(one.design, a).z).toBe(0.3);
		expect(tiltOf(one.design, b).z).toBe(0);
		expect(groupOf(one.design, a)).toEqual([a]);
		const cleared = setTilt(one, content, a, { x: 0, y: 0, z: 0 });
		expect(cleared.design.parts.find((p) => p.index === a)!.tilt).toBeUndefined();
		expect(() => setTilt(s, content, 0, { x: 0.1, y: 0, z: 0 })).toThrow('root');
		expect(() => setTilt(s, content, 99, { x: 0.1, y: 0, z: 0 })).toThrow('no part');
	});

	it('the scene carries the full rotation of a tilted part and only the yaw of the others', () => {
		let w = stackOnPad();
		w = attachNew(w, content, 'stock.wing', radialAt(w, 'stock.wing', TANK, 0, 0));
		const s = setTilt(w, content, indicesOf(w, 'stock.wing')[0]!, { x: 0.2, y: 0, z: 0 });
		const { scene } = buildScene({
			design: s.design,
			loose: [],
			parts: content.parts,
			held: null,
			targets: [],
			cursor: null
		});
		const wing = scene.parts.find((p) => p.definition === 'stock.wing')!;
		const tank = scene.parts.find((p) => p.definition === 'stock.tank-small')!;
		expect(wing.rotation).toBeDefined();
		expect(tank.rotation).toBeUndefined();
	});
});

describe('struts and fuel lines (ADR 0071)', () => {
	it('a fuel line from a booster to the tank: the design links, resolves and the model feeds the tank', () => {
		const s = boosted(1);
		const booster = indicesOf(s, 'stock.booster')[0]!;
		const placed = attachConnector(
			s,
			content,
			'stock.fuel-line',
			{ index: booster, angle: Math.PI, y: 0.5 },
			{ index: TANK, angle: 0, y: 0.5 }
		);
		const line = placed.design.parts.at(-1)!;
		expect(line.part).toBe('stock.fuel-line');
		expect(line.parent).toMatchObject({ index: booster, parentNode: 'surface', node: 'end' });
		expect(line.link).toEqual({ index: TANK, angle: 0, y: 0.5 });
		expect(placed.design.formatVersion).toBe(3);
		const resolved = resolveVesselDesign(placed.design, content.parts);
		expect(resolved.ok).toBe(true);
		if (resolved.ok) {
			const r = resolved.parts.find((p) => p.index === line.index)!;
			// The far end is on the tank's surface at that angle and height: 0.625 m from its axis.
			const tank = resolved.parts.find((p) => p.index === TANK)!;
			expect(r.link!.point.x - tank.position.x).toBeCloseTo(0.625, 9);
			expect(r.link!.point.y - tank.position.y).toBeCloseTo(0.5, 9);
		}
		expect(stagingModelFromDesign(placed.design, full).parts.get(TANK)!.feeders).toEqual([
			{ source: booster, line: line.index }
		]);
		// One undo step.
		expect(undo(placed).design.parts.some((p) => p.part === 'stock.fuel-line')).toBe(false);
	});

	it('a symmetric group of boosters gets a line each, turned by their own angle, as one undo step', () => {
		const s = boosted(4);
		const boosters = indicesOf(s, 'stock.booster');
		expect(boosters).toHaveLength(4);
		const pairs = connectorPairs(
			s.design,
			{ index: boosters[0]!, angle: Math.PI, y: 0.5 },
			{ index: TANK, angle: 0, y: 0.5 }
		);
		expect(pairs.map((p) => p.from.index)).toEqual(boosters);
		expect(pairs.every((p) => p.to.index === TANK)).toBe(true);
		// The decouplers sit at 0, 90, 180 and 270 degrees on the tank: the line ends turn the same way.
		const angles = pairs.map((p) => Math.round(((p.to.angle * 180) / Math.PI + 360) % 360));
		expect(new Set(angles).size).toBe(4);
		expect(angles[0]).toBe(0);
		const placed = attachConnector(
			s,
			content,
			'stock.fuel-line',
			{ index: boosters[0]!, angle: Math.PI, y: 0.5 },
			{ index: TANK, angle: 0, y: 0.5 }
		);
		const lines = indicesOf(placed, 'stock.fuel-line');
		expect(lines).toHaveLength(4);
		expect(
			new Set(lines.map((i) => placed.design.parts.find((p) => p.index === i)!.symmetry)).size
		).toBe(1);
		expect(groupOf(placed.design, lines[0]!)).toEqual(lines);
		expect(resolveVesselDesign(placed.design, content.parts).ok).toBe(true);
		expect(indicesOf(undo(placed), 'stock.fuel-line')).toHaveLength(0);
		// Deleting one line takes the group; the boosters stay.
		const gone = deleteSubtree(placed, content, lines[0]!);
		expect(indicesOf(gone, 'stock.fuel-line')).toHaveLength(0);
		expect(indicesOf(gone, 'stock.booster')).toHaveLength(4);
	});

	it('refuses a connector on a connector, on the same part twice and for a part that is not a connector', () => {
		const s = boosted(1);
		const booster = indicesOf(s, 'stock.booster')[0]!;
		const placed = attachConnector(
			s,
			content,
			'stock.strut',
			{ index: booster, angle: Math.PI, y: -0.5 },
			{ index: TANK, angle: 0, y: -0.5 }
		);
		const strut = placed.design.parts.at(-1)!.index;
		const to = { index: TANK, angle: 0, y: 0 };
		expect(() =>
			attachConnector(placed, content, 'stock.strut', { index: strut, angle: 0, y: 0 }, to)
		).toThrow('ordinary parts');
		expect(() =>
			attachConnector(
				placed,
				content,
				'stock.strut',
				{ index: booster, angle: 0, y: 0 },
				{ index: booster, angle: 1, y: 0 }
			)
		).toThrow('different parts');
		expect(() =>
			attachConnector(placed, content, 'stock.fin', { index: booster, angle: 0, y: 0 }, to)
		).toThrow('not a connector');
		// Two lines on the same spot of the same part are refused by the design's own rules.
		expect(() =>
			attachConnector(
				placed,
				content,
				'stock.strut',
				{ index: booster, angle: Math.PI, y: -0.5 },
				to
			)
		).toThrow('invalid design');
	});

	it('deleting the part a line ends on removes the line; detaching a booster cuts its line', () => {
		const s = boosted(1);
		const booster = indicesOf(s, 'stock.booster')[0]!;
		const withLine = attachConnector(
			s,
			content,
			'stock.fuel-line',
			{ index: booster, angle: Math.PI, y: 0.5 },
			{ index: TANK, angle: 0, y: 0.5 }
		);
		const line = indicesOf(withLine, 'stock.fuel-line')[0]!;
		// Detach: the line hangs on the booster and ends on the tank: one end outside, so it is cut.
		const loose = detach(withLine, content, booster);
		expect(indicesOf(loose, 'stock.fuel-line')).toHaveLength(0);
		expect(loose.loose.flatMap((a) => a.parts).some((p) => p.part === 'stock.fuel-line')).toBe(
			false
		);
		expect(resolveVesselDesign(loose.design, content.parts).ok).toBe(true);
		loose.loose.forEach((a) => expect(resolveVesselDesign(a, content.parts).ok).toBe(true));
		// Delete the tank's subtree below the pod: the line ends on a part that goes.
		const wheel = indicesOf(withLine, 'stock.reaction-wheel')[0]!;
		const cut = deleteSubtree(withLine, content, wheel);
		expect(cut.design.parts.some((p) => p.index === line)).toBe(false);
		expect(resolveVesselDesign(cut.design, content.parts).ok).toBe(true);
	});

	it('moving a booster with its line keeps the line when both ends travel with the subtree', () => {
		let s = stackOnPad();
		// A tank on a radial decoupler... simplest: a booster pair of parts with a strut between them.
		s = attachNew(
			s,
			content,
			'stock.radial-decoupler',
			radialAt(s, 'stock.radial-decoupler', TANK, 0, 0)
		);
		const dec = s.design.parts.at(-1)!.index;
		const t = attachTargets(s.design, singlePart('stock.booster', s.nextIndex), content.parts).find(
			(x) => x.parent?.index === dec && x.parent.parentNode === 'outer'
		)!;
		s = attachNew(s, content, 'stock.booster', t);
		const booster = s.design.parts.at(-1)!.index;
		s = attachConnector(
			s,
			content,
			'stock.strut',
			{ index: booster, angle: Math.PI / 2, y: 0 },
			{ index: dec, angle: Math.PI / 2, y: 0 }
		);
		const strut = s.design.parts.at(-1)!.index;
		const taken = detach(s, content, dec);
		const assembly = taken.loose.find((a) => a.parts.some((p) => p.index === dec))!;
		expect(assembly.parts.some((p) => p.index === strut)).toBe(true);
		expect(resolveVesselDesign(assembly, content.parts).ok).toBe(true);
		const back = moveGroup(
			taken,
			content,
			dec,
			radialAt({ ...taken, design: taken.design }, 'stock.radial-decoupler', TANK, 1, 0),
			{ single: true }
		);
		expect(back.design.parts.some((p) => p.index === strut)).toBe(true);
		expect(resolveVesselDesign(back.design, content.parts).ok).toBe(true);
	});
});

describe('stability counts wings (ADR 0075)', () => {
	it('a pair of wings behind the centre of mass is a lifting surface and a wide wing does not become the calibre', () => {
		let s = stackOnPad();
		s = attachNew(s, content, 'stock.wing', radialAt(s, 'stock.wing', TANK, 0, -0.8), 2);
		const st = stabilityOf(s.design, full);
		expect(st.fins).toBe(2);
		// The widest cylinder is 1.25 m, not the 3 m wing.
		expect(st.calibre).toBeCloseTo(1.25, 9);
		expect(st.state).not.toBe('unfinned');
	});
});
