import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import { stageDeltaV, stagingModelFromDesign, twr, type ContentLookups } from '../delta-v';
import { blocksLaunch, checkDesign, type CheckId } from './checks';
import {
	attachNew,
	attachTargets,
	createEditor,
	detach,
	insertStage,
	moveToStage,
	replaceDesign,
	singlePart,
	type EditorState
} from './state';
import { designStats, heightOfDesign, situationAt } from './stats';
import { planTrip } from './trip';
import { budgetsOf } from './trip-view';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const MU = 6.6743e-11 * home.mass;
const g = MU / (home.radius * home.radius);

const reference = (): EditorState =>
	replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());

const ids = (s: EditorState, stats = designStats(s.design, content, 'sea-level', g)): CheckId[] =>
	checkDesign(s, content, stats).map((c) => c.id);

describe('readouts equal the shared delta-v function (the flight HUD uses the same one)', () => {
	const design = referenceTwoStage();
	const report = stageDeltaV(stagingModelFromDesign(design, content));
	for (const env of ['sea-level', 'vacuum'] as const) {
		it(`per stage and total, ${env}`, () => {
			const stats = designStats(design, content, env, g);
			expect(stats.rows.map((r) => r.stage)).toEqual([0, 1]);
			report.stages.forEach((s, k) => {
				const row = stats.rows[k]!;
				expect(row.dv).toBe(env === 'vacuum' ? s.dvVacuum : s.dvSeaLevel);
				expect(row.burnTime).toBe(s.burnTime);
				const thrust = env === 'vacuum' ? s.thrustVacuum : s.thrustSeaLevel;
				expect(row.twr).toBe(twr(thrust, s.massStart, g));
			});
			expect(stats.totalDv).toBe(env === 'vacuum' ? report.totalVacuum : report.totalSeaLevel);
		});
	}

	it('liftoff TWR is stage 0 at sea level; mass and height are the parts', () => {
		const stats = designStats(design, content, 'vacuum', g);
		const first = report.stages[0]!;
		expect(stats.liftoffTwr).toBe(twr(first.thrustSeaLevel, first.massStart, g));
		expect(stats.liftoffTwr).toBeGreaterThan(1);
		// Pod 840 + wheel 100 + 2 tanks (250 + 890 * 5 kg propellant each) + 2 engines 1250 + decoupler 50 + 50 EC * 1e-6.
		const tank = 250 + (400 + 490) * 5;
		expect(stats.wetMass).toBeCloseTo(840 + 100 + 2 * tank + 2 * 1250 + 50 + 50e-6 * 1, 3);
		expect(stats.dryMass).toBe(840 + 100 + 2 * 250 + 2 * 1250 + 50);
		expect(stats.height).toBeCloseTo(1 + 0.4 + 2 + 1.2 + 0.2 + 2 + 1.2, 9);
		expect(stats.partCount).toBe(7);
		expect(first.massStart).toBeCloseTo(stats.wetMass, 3);
	});

	it('the stock vessel has the Δv of journal 021 (about 3.4 km/s in vacuum, less at sea level)', () => {
		const vac = designStats(design, content, 'vacuum', g).totalDv;
		const asl = designStats(design, content, 'sea-level', g).totalDv;
		expect(vac).toBeGreaterThan(3000);
		expect(asl).toBeLessThan(vac);
	});

	it('the planner takes the first stage at sea level on the climb and the rest in vacuum', () => {
		const stats = designStats(design, content, 'vacuum', g);
		const [a, b] = report.stages;
		const climb = a!.dvSeaLevel + b!.dvVacuum;
		const plan = planTrip(
			{
				id: 't',
				label: 't',
				body: 'b',
				kind: 'low-orbit',
				total: climb,
				legs: [{ id: 'ascent', label: 'Launch', dv: climb, atmospheric: true }]
			},
			budgetsOf(stats.report)
		);
		expect(plan.enough).toBe(true);
		expect(plan.legs[0]!.covers).toHaveLength(2);
		expect(plan.legs[0]!.covers[0]).toMatchObject({ stage: 0, seaLevel: true });
		expect(plan.spare).toBeCloseTo(0, 6);
	});

	it('an empty design has no readouts', () => {
		const s = designStats(emptyDesign(), content, 'vacuum', g);
		expect(s.report).toBeNull();
		expect(s.partCount).toBe(0);
		expect(s.liftoffTwr).toBeNull();
		expect(heightOfDesign(emptyDesign(), content.parts)).toBe(0);
	});
});

describe('checks', () => {
	it('the reference vessel has no warnings', () => {
		expect(ids(reference())).toEqual([]);
	});

	it('an empty design is an error that blocks launch', () => {
		const s = createEditor(emptyDesign(), content);
		const checks = checkDesign(s, content, designStats(s.design, content, 'vacuum', g));
		expect(checks.map((c) => c.id)).toEqual(['empty']);
		expect(blocksLaunch(checks)).toBe(true);
	});

	it('no control source', () => {
		const s = createEditor(emptyDesign(), content);
		let t = attachNew(
			s,
			content,
			'stock.tank-small',
			attachTargets(s.design, singlePart('stock.tank-small', 0), content.parts)[0]!
		);
		t = attachNew(
			t,
			content,
			'stock.engine-lv',
			attachTargets(t.design, singlePart('stock.engine-lv', 1), content.parts).find(
				(x) => x.parent!.parentNode === 'bottom'
			)!
		);
		expect(ids(t)).toContain('no-control');
		expect(blocksLaunch(checkDesign(t, content, designStats(t.design, content, 'vacuum', g)))).toBe(
			false
		);
	});

	it('no stages and unstaged engines', () => {
		const ref = reference();
		const none = replaceDesign(ref, content, { ...referenceTwoStage(), stages: [] });
		expect(none.autoStage).toBe(false);
		expect(ids(none)).toContain('no-stages');
		const partial = replaceDesign(ref, content, { ...referenceTwoStage(), stages: [[6]] });
		expect(ids(partial)).toContain('unstaged');
		expect(ids(partial)).not.toContain('no-stages');
	});

	it('no engine', () => {
		const s = createEditor(emptyDesign(), content);
		const t = attachNew(
			s,
			content,
			'stock.command-pod',
			attachTargets(s.design, singlePart('stock.command-pod', 0), content.parts)[0]!
		);
		expect(ids(t)).toEqual(['no-engine']);
	});

	it('an empty stage in the middle', () => {
		const ref = reference();
		const s = insertStage(ref, content, 1);
		expect(s.design.stages.map((x) => x.length)).toEqual([1, 0, 2]);
		expect(ids(s)).toContain('empty-stage');
	});

	it('TWR below 1 at liftoff', () => {
		// A pod on a medium tank with the single small-thrust engine is fine; stack more mass until TWR < 1.
		let s = reference();
		const heavy = [
			'stock.tank-medium',
			'stock.tank-medium',
			'stock.tank-medium',
			'stock.tank-medium'
		];
		// Insert heavy tanks between the pod and the wheel: pod(0)->wheel(1) is linked at bottom/top, so hang tanks above the pod.
		let top = 0;
		for (const part of heavy) {
			const t = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts).find(
				(x) => x.parent!.index === top && x.parent!.parentNode === 'top'
			)!;
			s = attachNew(s, content, part, t);
			top = s.design.parts.at(-1)!.index;
		}
		const stats = designStats(s.design, content, 'sea-level', g);
		expect(stats.liftoffTwr).not.toBeNull();
		expect(stats.liftoffTwr!).toBeLessThan(1);
		expect(ids(s, stats)).toContain('low-twr');
	});

	it('loose parts are a warning, not an error', () => {
		const s = detach(reference(), content, 4);
		const checks = checkDesign(s, content, designStats(s.design, content, 'vacuum', g));
		const loose = checks.find((c) => c.id === 'loose')!;
		expect(loose.severity).toBe('warning');
		expect(loose.parts.sort()).toEqual([4, 5, 6]);
		expect(blocksLaunch(checks)).toBe(false);
	});

	it('moving the engine to an upper stage does not hide the readout', () => {
		const s = moveToStage(reference(), content, 6, 1);
		const stats = designStats(s.design, content, 'vacuum', g);
		expect(stats.rows).toHaveLength(2);
		expect(stats.rows[0]!.empty).toBe(true);
	});
});

describe('Δv and TWR by body and situation (plan 218)', () => {
	const design = referenceTwoStage();
	const moon = registries.bodies.get('stock.cinder')!;
	const at = (body: typeof home, kind: 'sea-level' | 'vacuum' | 'altitude', altitude?: number) => {
		const s = situationAt(body, { kind, altitude });
		return designStats(design, content, s.environment, s.gravity, s.pressure);
	};

	it('the same stage has more Δv in vacuum than at home sea level', () => {
		const sea = at(home, 'sea-level').rows[0]!;
		const vac = at(home, 'vacuum').rows[0]!;
		expect(vac.dv).toBeGreaterThan(sea.dv);
		// 10 km up lies between the two
		const up = at(home, 'altitude', 10_000).rows[0]!;
		expect(up.dv).toBeGreaterThan(sea.dv);
		expect(up.dv).toBeLessThan(vac.dv);
	});

	it('its TWR on the moon at sea level is higher than at home', () => {
		expect(at(moon, 'sea-level').rows[0]!.twr).toBeGreaterThan(at(home, 'sea-level').rows[0]!.twr);
	});
});
