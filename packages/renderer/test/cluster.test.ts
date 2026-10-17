/** Plan 040 / ADR 0081: engines with more than one nozzle. */
import { describe, expect, test } from 'bun:test';
import { partVisualSchema } from '@orbital/core';
import { Object3D, Vector3 } from 'three';
import { clusterLayout, minSeparation } from '../src/parts/cluster.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { diamondPeriod } from '../src/effects/plume.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = () =>
	new PartModelFactory({
		shapes: maps.shapes,
		visuals: maps.visuals,
		attach: maps.attach,
		detail: detailOf(PRESETS.high)
	});

const cluster = maps.byId.get('stock.engine-cluster')!;

describe('clusterLayout', () => {
	test('n points on the ring, evenly spaced, centred on the axis, at the given height', () => {
		for (const n of [2, 3, 4, 5, 7, 9]) {
			const pts = clusterLayout(n, 0.31, -0.6);
			expect(pts.length).toBe(n);
			let cx = 0;
			let cz = 0;
			const angles: number[] = [];
			for (const [x, y, z] of pts) {
				expect(Math.hypot(x, z)).toBeCloseTo(0.31, 12);
				expect(y).toBe(-0.6);
				cx += x;
				cz += z;
				angles.push(Math.atan2(z, x));
			}
			expect(cx / n).toBeCloseTo(0, 12);
			expect(cz / n).toBeCloseTo(0, 12);
			// equal steps of 2 pi / n
			const sorted = angles.map((a) => (a + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
			for (let i = 1; i < n; i++) {
				expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo((2 * Math.PI) / n, 9);
			}
		}
	});

	test('four bells sit on the diagonals and clamp outside 2 to 9', () => {
		const four = clusterLayout(4, 1, 0);
		for (const [x, , z] of four) {
			expect(Math.abs(x)).toBeCloseTo(Math.SQRT1_2, 12);
			expect(Math.abs(z)).toBeCloseTo(Math.SQRT1_2, 12);
		}
		expect(clusterLayout(1, 1, 0).length).toBe(2);
		expect(clusterLayout(50, 1, 0).length).toBe(9);
		expect(minSeparation(four)).toBeCloseTo(Math.SQRT2, 12);
	});
});

describe('the stock cluster engine', () => {
	test('its descriptor nozzles equal the generator layout within 1e-6', () => {
		const visual = cluster.visual!;
		const bells = Number(visual.params!.bells);
		const ring = Number(visual.params!.ring);
		const expected = clusterLayout(bells, ring, visual.plume!.nozzle[1]);
		expect(visual.plume!.nozzles!.length).toBe(expected.length);
		visual.plume!.nozzles!.forEach((n, i) => {
			for (let k = 0; k < 3; k++) expect(Math.abs(n[k]! - expected[i]![k]!)).toBeLessThan(1e-6);
		});
	});

	test('the bells do not touch each other and fit inside the part', () => {
		const visual = cluster.visual!;
		const exit = Number(visual.params!.bellExit);
		const pts = visual.plume!.nozzles!;
		expect(minSeparation(pts as unknown as [number, number, number][])).toBeGreaterThan(2 * exit);
		const radius = (cluster.shape as { radius: number }).radius;
		for (const [x, , z] of pts) expect(Math.hypot(x, z) + exit).toBeLessThanOrEqual(radius);
		expect(visual.plume!.exitRadius).toBe(exit);
	});

	test('a model has one plume holder per nozzle sharing the plume materials', () => {
		const model = factory().create('stock.engine-cluster');
		const bells: Object3D[] = [];
		model.root.traverse((o) => {
			if (o.name === 'bell') bells.push(o);
		});
		expect(bells.length).toBe(4);
		const centre = cluster.visual!.plume!.nozzle;
		cluster.visual!.plume!.nozzles!.forEach((n, i) => {
			const holder = bells.find(
				(b) =>
					Math.abs(b.position.x - (n[0] - centre[0])) < 1e-9 &&
					Math.abs(b.position.z - (n[2] - centre[2])) < 1e-9
			);
			expect(holder, `bell ${i}`).toBeDefined();
		});
		// one plume effect, three meshes per bell
		expect(bells.every((b) => b.children.length === 3)).toBe(true);
		const materials = new Set(
			bells.flatMap((b) => b.children.map((c) => (c as unknown as { material: unknown }).material))
		);
		expect(materials.size).toBe(3);
		// the bells hang on the pivot and swing with the gimbal (ADR 0045)
		let pivot: Object3D | undefined;
		model.root.traverse((o) => {
			if (o.name === 'pivot') pivot = o;
		});
		expect(pivot).toBeDefined();
		expect(bells.every((b) => b.parent?.parent === pivot)).toBe(true);
		model.dispose();
	});

	test('the model is still a single-engine part without nozzles (one bell holder)', () => {
		const model = factory().create('stock.engine-lv');
		let n = 0;
		model.root.traverse((o) => {
			if (o.name === 'bell') n++;
		});
		expect(n).toBe(1);
		model.dispose();
	});

	test('the retracted model fits inside the part shape', () => {
		const model = factory().create('stock.engine-cluster');
		const size = model.bounds.getSize(new Vector3());
		expect(size.y).toBeLessThanOrEqual(1.2 + 1e-6);
		const radius = (cluster.shape as { radius: number }).radius;
		expect(
			Math.max(-model.bounds.min.x, model.bounds.max.x, -model.bounds.min.z, model.bounds.max.z)
		).toBeLessThanOrEqual(radius + 1e-6);
		model.dispose();
	});
});

describe('the descriptor', () => {
	const base = {
		kind: 'engine-cluster',
		plume: { module: 'stock.engine', nozzle: [0, -0.6, 0], exitRadius: 0.2, length: 5 }
	};
	const withNozzles = (nozzles: unknown) =>
		partVisualSchema.safeParse({ ...base, plume: { ...base.plume, nozzles } });

	test('accepts 2 to 9 nozzles', () => {
		for (const n of [2, 4, 9]) {
			expect(withNozzles(Array.from({ length: n }, (_, i) => [i, 0, 0])).success).toBe(true);
		}
		expect(partVisualSchema.safeParse(base).success).toBe(true);
	});

	test('rejects 1 and 10 nozzles and anything that is not a triple of numbers', () => {
		expect(withNozzles([[0, 0, 0]]).success).toBe(false);
		expect(withNozzles(Array.from({ length: 10 }, () => [0, 0, 0])).success).toBe(false);
		expect(
			withNozzles([
				[0, 0],
				[1, 1]
			]).success
		).toBe(false);
		expect(
			withNozzles([
				['a', 0, 0],
				[1, 1, 1]
			]).success
		).toBe(false);
		expect(withNozzles('four').success).toBe(false);
	});
});

describe('shock diamonds', () => {
	test('their period scales with the exit diameter and keeps the LV-T30 value', () => {
		expect(diamondPeriod(0.46)).toBeCloseTo(2.622, 3);
		expect(diamondPeriod(0.92)).toBeCloseTo(2 * diamondPeriod(0.46), 9);
		expect(diamondPeriod(0.2)).toBeLessThan(diamondPeriod(0.46));
		expect(diamondPeriod(0)).toBe(0.4);
		expect(Number.isFinite(diamondPeriod(Number.NaN))).toBe(true);
	});
});
