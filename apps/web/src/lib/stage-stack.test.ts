import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import { stageDeltaV, stagingModelFromDesign, type ContentLookups } from './delta-v';
import { stageStackModel } from './stage-stack';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const build = (design = referenceTwoStage(), fired = 0, env: 'vacuum' | 'sea-level' = 'vacuum') =>
	stageStackModel({
		report: stageDeltaV(stagingModelFromDesign(design, content), fired),
		design,
		content,
		environment: env,
		stagesFired: fired,
		gravity: 9.81
	});

describe('stage stack model', () => {
	it('lists the stages of the two-stage vessel with icons, delta-v, fuel and the next stage', () => {
		const m = build();
		expect(m.empty).toBeNull();
		expect(m.rows.map((r) => r.label)).toEqual(['1', '2']);
		expect(m.rows[0]!.icons).toEqual(['engine']);
		expect(m.rows[1]!.icons).toEqual(['decoupler', 'engine']);
		expect(m.rows.map((r) => r.next)).toEqual([true, false]);
		expect(m.rows[0]!.fuel).toBeCloseTo(1, 9);
		expect(m.total).toBeCloseTo(m.rows[0]!.dv + m.rows[1]!.dv, 6);
	});
	it('sea level shows less delta-v and thrust than vacuum', () => {
		expect(build(undefined, 0, 'sea-level').total).toBeLessThan(build().total);
	});
	it('says there is no staging instead of "0 / 0 fired"', () => {
		const m = build({ ...referenceTwoStage(), stages: [] });
		expect(m.empty).toBe('no-staging');
		expect(m.rows).toEqual([]);
	});
	it('reports spent when every stage has burnt and nothing remains', () => {
		const design = referenceTwoStage();
		const m = stageStackModel({
			report: { stages: [], totalVacuum: 0, totalSeaLevel: 0 },
			design,
			content,
			environment: 'vacuum',
			stagesFired: 2,
			gravity: 9.81
		});
		expect(m.empty).toBe('spent');
	});
});
