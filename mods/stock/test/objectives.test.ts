/** Stock objective primitives (plan 098, ADR 0175) over synthetic views. */
import { describe, expect, test } from 'bun:test';
import type { ObjectiveResult, ObjectiveVesselView, ObjectiveView } from '@orbital/sdk';
import {
	ObjectiveBefore,
	ObjectiveEnterSoi,
	ObjectiveFlyby,
	ObjectiveLand,
	ObjectiveReachAltitude,
	ObjectiveReachOrbit,
	ObjectiveReturnHome
} from '../src/index.ts';
import { loaded } from './helpers.ts';

const vessel = (over: Partial<ObjectiveVesselView> = {}): ObjectiveVesselView => ({
	id: 1,
	body: 'stock.home',
	mode: 'on-rails',
	landed: false,
	altitude: 100_000,
	periapsis: 85_000,
	apoapsis: 120_000,
	...over
});
const view = (vessels: ObjectiveVesselView[], time = 0): ObjectiveView => ({
	time,
	home: 'stock.home',
	vessels
});
const run = (
	o: {
		evaluate: (p: never, v: ObjectiveView, prior: ObjectiveResult | undefined) => ObjectiveResult;
	},
	p: unknown,
	v: ObjectiveView,
	prior?: ObjectiveResult
) => o.evaluate(p as never, v, prior);

describe('stock objectives', () => {
	test('stock registers the seven primitives', () => {
		expect(loaded.report.registered.objective.map((e) => e.id).sort()).toEqual([
			'stock.before',
			'stock.enter-soi',
			'stock.flyby',
			'stock.land',
			'stock.reach-altitude',
			'stock.reach-orbit',
			'stock.return-home'
		]);
	});

	test('reach orbit: periapsis bound, apoapsis bound, body, not landed; progress toward the periapsis', () => {
		expect(run(ObjectiveReachOrbit, { minPeriapsis: 80_000 }, view([vessel()])).status).toBe(
			'done'
		);
		expect(
			run(ObjectiveReachOrbit, { minPeriapsis: 80_000, maxApoapsis: 100_000 }, view([vessel()]))
				.status
		).toBe('active');
		expect(
			run(ObjectiveReachOrbit, { minPeriapsis: 80_000 }, view([vessel({ periapsis: 40_000 })]))
				.progress
		).toBeCloseTo(0.5, 12);
		expect(
			run(ObjectiveReachOrbit, { minPeriapsis: 80_000, body: 'stock.cinder' }, view([vessel()]))
				.status
		).toBe('active');
		expect(
			run(ObjectiveReachOrbit, { minPeriapsis: 80_000 }, view([vessel({ periapsis: null })])).status
		).toBe('active');
	});

	test('land, altitude, enter SOI, return home', () => {
		expect(
			run(
				ObjectiveLand,
				{ body: 'stock.cinder' },
				view([vessel({ body: 'stock.cinder', landed: true })])
			).status
		).toBe('done');
		expect(run(ObjectiveLand, {}, view([vessel()])).status).toBe('active');
		expect(run(ObjectiveReachAltitude, { min: 50_000 }, view([vessel()])).status).toBe('done');
		expect(
			run(ObjectiveEnterSoi, { body: 'stock.cinder' }, view([vessel({ body: 'stock.cinder' })]))
				.status
		).toBe('done');
		expect(run(ObjectiveReturnHome, {}, view([vessel({ landed: true })])).status).toBe('done');
		expect(
			run(ObjectiveReturnHome, {}, view([vessel({ landed: true, body: 'stock.cinder' })])).status
		).toBe('active');
	});

	test('flyby: entered, then left; the memory travels in data', () => {
		const p = { body: 'stock.cinder' };
		const inside = run(ObjectiveFlyby, p, view([vessel({ body: 'stock.cinder' })]));
		expect(inside).toEqual({ status: 'active', progress: 0.5, data: { entered: true } });
		expect(run(ObjectiveFlyby, p, view([vessel()]), inside).status).toBe('done');
		expect(run(ObjectiveFlyby, p, view([vessel()])).status).toBe('active'); // never entered
	});

	test('before: done until the date, failed after', () => {
		expect(run(ObjectiveBefore, { time: 100 }, view([], 100)).status).toBe('done');
		expect(run(ObjectiveBefore, { time: 100 }, view([], 101)).status).toBe('failed');
		expect(ObjectiveBefore.constraint).toBe(true);
	});
});
