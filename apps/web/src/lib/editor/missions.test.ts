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
			'wayfarer-shuttle',
			'horizon-station',
			'moonwatch-orbiter',
			'horizon-telescope',
			'aurora-satellite',
			'trailblazer-rover'
		]);
	});

	it('names and texts are English (owner, 2026-10-21)', () => {
		const indonesian =
			/\b(ulang|alik|stasiun|cakrawala|teleskop|satelit|peneliti|pengorbit|penjelajah|roket|misi|bulan|dan|yang|untuk|dengan)\b/i;
		for (const m of MISSION_BLUEPRINTS) {
			for (const text of [m.title, m.inspiredBy, m.summary, m.build(content).name]) {
				expect(indonesian.test(text), text).toBe(false);
			}
		}
	});

	for (const mission of MISSION_BLUEPRINTS) {
		it(`${mission.title}: builds, resolves, lifts off and has no blocking pre-flight check`, () => {
			const design = mission.build(content);
			const resolved = resolveVesselDesign(design, content.parts);
			expect(resolved.ok, JSON.stringify(resolved.ok ? '' : resolved.errors)).toBe(true);
			const stats = designStats(design, content, 'sea-level', g);
			// a rover drives from where it is launched (plan 307): no stages, no liftoff
			const surface = mission.goal === 'surface';
			if (!surface) {
				expect(design.stages.length, mission.id).toBeGreaterThan(1);
				expect(stats.liftoffTwr ?? 0, mission.id).toBeGreaterThan(1);
			}
			const stability = stabilityOf(design, content);
			const checks = checkDesign({ design, loose: [] }, content, stats, stability);
			// the Hangar's verdict: nothing that blocks Launch and nothing no-go
			const errors = checks.filter(
				(c) =>
					(c.severity === 'error' || c.level === 'no-go') &&
					!(surface && ['no-engine', 'no-stages', 'low-twr'].includes(c.id))
			);
			expect(
				errors.map((c) => `${c.id}: ${c.text}`),
				mission.id
			).toEqual([]);
			console.log(
				`${mission.title}: ${design.parts.length} parts, ${design.stages.length} stages, liftoff TWR ${(stats.liftoffTwr ?? 0).toFixed(2)}, warnings: ${checks.map((c) => c.id).join(', ') || 'none'}`
			);
		});
	}

	// owner, 2026-10-21: Horizon Station's RCS said "no propellant"
	it('every blueprint with RCS thrusters carries monopropellant for them', () => {
		for (const mission of MISSION_BLUEPRINTS) {
			const design = mission.build(content);
			let rcs = false;
			let mono = 0;
			for (const p of design.parts) {
				const def = content.parts.get(p.part);
				for (const [id, config] of def?.modules ?? []) {
					if (id === 'stock.rcs') rcs = true;
					const c = (config as { contents?: Record<string, { capacity: number; amount?: number }> })
						.contents?.['stock.monopropellant'];
					if (c) mono += c.amount ?? c.capacity;
				}
			}
			if (rcs) expect(mono, mission.id).toBeGreaterThanOrEqual(30);
		}
	});
});
