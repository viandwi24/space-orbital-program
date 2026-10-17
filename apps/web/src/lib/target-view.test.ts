import type { Vec3 } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { distanceToSegment, pickTarget, type PickCandidate } from './map-pick';
import { edgePoint, targetIndicator } from './target-indicator';

describe('map picking', () => {
	const moon: PickCandidate = {
		key: 'body:stock.cinder',
		marks: [{ x: 300, y: 200, radius: 30 }],
		lines: [
			[
				{ x: 0, y: 100 },
				{ x: 500, y: 100 }
			]
		]
	};
	const probe: PickCandidate = {
		key: 'vessel:7',
		marks: [{ x: 310, y: 205, radius: 14 }],
		lines: []
	};
	const home: PickCandidate = {
		key: 'body:stock.home',
		marks: [{ x: 100, y: 300, radius: 80 }],
		lines: []
	};

	it('picks the nearest body disc, vessel dot or orbit line', () => {
		expect(pickTarget([moon, probe, home], 295, 190)).toBe('body:stock.cinder');
		expect(pickTarget([moon, probe, home], 120, 330)).toBe('body:stock.home');
		expect(pickTarget([moon, probe, home], 400, 104)).toBe('body:stock.cinder');
	});

	it('a small dot inside a disc wins when the click is nearer its centre', () => {
		expect(pickTarget([moon, probe], 311, 206)).toBe('vessel:7');
	});

	it('prefers a marker over a line, and nothing is picked far from everything', () => {
		const onLine: PickCandidate = { key: 'body:stock.cinder', marks: [], lines: moon.lines };
		expect(pickTarget([onLine, home], 100, 102)).toBe('body:stock.cinder');
		expect(pickTarget([onLine, home], 100, 300)).toBe('body:stock.home');
		expect(pickTarget([moon, probe, home], 450, 450)).toBeNull();
		expect(pickTarget([], 1, 1)).toBeNull();
	});

	it('segment distance clamps to the ends', () => {
		const a = { x: 0, y: 0 };
		const b = { x: 10, y: 0 };
		expect(distanceToSegment(5, 3, a, b)).toBe(3);
		expect(distanceToSegment(-4, 3, a, b)).toBe(5);
		expect(distanceToSegment(3, 3, a, a)).toBeCloseTo(Math.hypot(3, 3), 12);
	});
});

/** A pinhole camera at the origin looking down -Z, 800x600 box, focal length 600 px. */
const camera =
	(offset: Vec3 = { x: 0, y: 0, z: 0 }) =>
	(p: Vec3) => {
		const x = p.x - offset.x;
		const y = p.y - offset.y;
		const z = p.z - offset.z;
		if (!(-z > 0)) return null;
		return { x: 400 + (600 * x) / -z, y: 300 - (600 * y) / -z, hidden: false };
	};

describe('target indicator', () => {
	const vessel = { x: 0, y: 0, z: -50 };

	it('a label at the projection while the target is inside the box', () => {
		const i = targetIndicator({
			project: camera(),
			vessel,
			target: { x: 10, y: 5, z: -100 },
			width: 800,
			height: 600
		});
		expect(i).toEqual({ kind: 'label', x: 460, y: 270, hidden: false });
	});

	it('an arrow on the edge, pointing the right way, when the target is outside the box', () => {
		const i = targetIndicator({
			project: camera(),
			vessel,
			target: { x: 400, y: 0, z: -100 },
			width: 800,
			height: 600
		});
		expect(i?.kind).toBe('arrow');
		if (i?.kind !== 'arrow') return;
		expect(i.x).toBeCloseTo(800 - 28, 9);
		expect(i.y).toBeCloseTo(300, 9);
		expect(i.angle).toBeCloseTo(0, 9);
		const up = targetIndicator({
			project: camera(),
			vessel,
			target: { x: 0, y: 900, z: -100 },
			width: 800,
			height: 600
		});
		if (up?.kind !== 'arrow') throw new Error('expected an arrow');
		expect(up.y).toBeCloseTo(28, 9);
		expect(up.angle).toBeCloseTo(-Math.PI / 2, 9);
	});

	it('behind the camera the arrow points away from the mirrored projection', () => {
		// The vessel is 50 m in front of the camera; the target is 200 m behind it, 40 m to the right.
		const cam = camera();
		const target = { x: 40, y: 0, z: 150 };
		expect(cam(target)).toBeNull();
		const i = targetIndicator({ project: cam, vessel, target, width: 800, height: 600 });
		expect(i?.kind).toBe('arrow');
		if (i?.kind !== 'arrow') return;
		// Mirror = 2 vessel - target = (-40, 0, -250): left of centre, so the target lies to the right.
		expect(Math.cos(i.angle)).toBeGreaterThan(0.99);
		expect(i.x).toBeCloseTo(800 - 28, 6);
	});

	it('edge points stay on the inset border for any direction', () => {
		for (let a = 0; a < 360; a += 15) {
			const r = (a * Math.PI) / 180;
			const p = edgePoint(800, 600, Math.cos(r), Math.sin(r), 28);
			const onX = Math.abs(Math.abs(p.x - 400) - 372) < 1e-9;
			const onY = Math.abs(Math.abs(p.y - 300) - 272) < 1e-9;
			expect(onX || onY).toBe(true);
			expect(Math.abs(p.x - 400)).toBeLessThanOrEqual(372 + 1e-9);
			expect(Math.abs(p.y - 300)).toBeLessThanOrEqual(272 + 1e-9);
		}
	});

	it('no indicator for an empty box', () => {
		expect(
			targetIndicator({ project: camera(), vessel, target: vessel, width: 0, height: 0 })
		).toBeNull();
	});
});

describe('target indicator with panels in the way', () => {
	it('keeps the arrow and the label inside what the panels leave free', () => {
		const insets = { top: 60, right: 240, bottom: 200, left: 0 };
		const p = camera();
		const i = targetIndicator({
			project: p,
			vessel: { x: 0, y: 0, z: -50 },
			target: { x: 400, y: 0, z: -100 },
			width: 800,
			height: 600,
			insets
		});
		expect(i?.kind).toBe('arrow');
		if (i?.kind !== 'arrow') return;
		expect(i.x).toBeCloseTo(800 - 240 - 28, 9);
		expect(i.y).toBeGreaterThanOrEqual(60 + 28 - 1e-9);
		expect(i.y).toBeLessThanOrEqual(600 - 200 - 28 + 1e-9);
		// A target projected under a panel is not "inside": it gets an arrow.
		const under = targetIndicator({
			project: p,
			vessel: { x: 0, y: 0, z: -50 },
			target: { x: 30, y: 0, z: -100 },
			width: 800,
			height: 600,
			insets: { top: 0, right: 500, bottom: 0, left: 0 }
		});
		expect(under?.kind).toBe('arrow');
	});
});
