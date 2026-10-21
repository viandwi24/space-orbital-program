/** Famous-mission blueprints (plan 286): they build, resolve, lift off and pass the pre-flight checks. */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { checkDesign } from './checks';
import { MISSION_BLUEPRINTS } from './missions';
import { stabilityOf } from './stability';
import { designStats } from './stats';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);

describe('mission blueprints (plan 286)', () => {
	it('has the owner’s mission set', () => {
		expect(MISSION_BLUEPRINTS.map((m) => m.id)).toEqual([
			'kronos-selene',
			'ulang-alik',
			'stasiun-cakrawala',
			'pengorbit',
			'teleskop-cakrawala',
			'satelit-peneliti'
		]);
	});

	for (const mission of MISSION_BLUEPRINTS) {
		it(`${mission.title}: builds, resolves, lifts off and has no blocking pre-flight check`, () => {
			const design = mission.build(content);
			const resolved = resolveVesselDesign(design, content.parts);
			expect(resolved.ok, JSON.stringify(resolved.ok ? '' : resolved.errors)).toBe(true);
			expect(design.stages.length, mission.id).toBeGreaterThan(1);
			const stats = designStats(design, content, 'sea-level', g);
			expect(stats.liftoffTwr ?? 0, mission.id).toBeGreaterThan(1);
			const stability = stabilityOf(design, content);
			const checks = checkDesign({ design, loose: [] }, content, stats, stability);
			// the Hangar's verdict: nothing that blocks Launch and nothing no-go
			const errors = checks.filter((c) => c.severity === 'error' || c.level === 'no-go');
			expect(
				errors.map((c) => `${c.id}: ${c.text}`),
				mission.id
			).toEqual([]);
			console.log(
				`${mission.title}: ${design.parts.length} parts, ${design.stages.length} stages, liftoff TWR ${(stats.liftoffTwr ?? 0).toFixed(2)}, warnings: ${checks.map((c) => c.id).join(', ') || 'none'}`
			);
		});
	}
});
