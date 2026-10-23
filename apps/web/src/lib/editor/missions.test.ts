/**
 * Famous-mission blueprints (plan 286), as stock registers them (ADR 0316): they resolve, lift off
 * and pass the pre-flight checks.
 */
import { loadPlugins, resolveVesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { checkDesign, sizeMismatches } from './checks';
import { stabilityOf } from './stability';
import { designStats } from './stats';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const MISSION_BLUEPRINTS = registries.blueprints.list().filter((b) => b.collection === 'missions');
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);

describe('mission blueprints (plan 286)', () => {
	it('has the owner’s mission set', () => {
		expect(MISSION_BLUEPRINTS.map((m) => m.id)).toEqual([
			'stock.kronos-selene',
			'stock.wayfarer-shuttle',
			'stock.horizon-station',
			'stock.moonwatch-orbiter',
			'stock.horizon-telescope',
			'stock.aurora-satellite',
			'stock.trailblazer-rover'
		]);
	});

	it('names and texts are English (owner, 2026-10-21)', () => {
		const indonesian =
			/\b(ulang|alik|stasiun|cakrawala|teleskop|satelit|peneliti|pengorbit|penjelajah|roket|misi|bulan|dan|yang|untuk|dengan)\b/i;
		for (const m of MISSION_BLUEPRINTS) {
			for (const text of [m.title, m.inspiredBy ?? '', m.summary, m.design.name]) {
				expect(indonesian.test(text), text).toBe(false);
			}
		}
	});

	for (const mission of MISSION_BLUEPRINTS) {
		it(`${mission.title}: builds, resolves, lifts off and has no blocking pre-flight check`, () => {
			const design = mission.design;
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
			const design = mission.design;
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

	// owner, 2026-10-22: "make every blueprint really work: the bays, the docking..."
	const modulesOf = (part: string): string[] =>
		(content.parts.get(part as never)?.modules ?? []).map((m) => String(m[0]));
	const separates = (part: string): boolean =>
		modulesOf(part).some((m) => m === 'stock.decoupler' || m === 'stock.docking-port');

	it('a payload in a bay or the petals sits on a decoupler or a port, so it can leave', () => {
		for (const mission of MISSION_BLUEPRINTS) {
			const design = mission.design;
			for (const p of design.parts) {
				if (p.parent?.parentNode !== 'inner') continue;
				expect(separates(p.part), `${mission.id}: ${p.part} in a bay`).toBe(true);
			}
		}
	});

	it('every engine fires in some stage', () => {
		for (const mission of MISSION_BLUEPRINTS) {
			const design = mission.design;
			const staged = new Set(design.stages.flat());
			for (const p of design.parts) {
				if (!modulesOf(p.part).includes('stock.engine')) continue;
				expect(staged.has(p.index), `${mission.id}: engine ${p.part} #${p.index}`).toBe(true);
			}
		}
	});

	it('Kronos V: the capsule and the lander carry ports of one size; the capsule can leave its service module', () => {
		const design = MISSION_BLUEPRINTS.find((m) => m.id === 'stock.kronos-selene')!.design;
		const ports = design.parts.filter((p) => modulesOf(p.part).includes('stock.docking-port'));
		expect(ports.map((p) => p.part)).toEqual(['stock.docking-port-small', 'stock.docking-port-small']);
		const pod = design.parts[0]!;
		const shield = design.parts.find((p) => p.parent?.index === pod.index && p.parent.parentNode === 'bottom')!;
		const below = design.parts.find((p) => p.parent?.index === shield.index)!;
		expect(separates(below.part)).toBe(true);
		// the lander's engines do not light on the pad (they did, 2026-10-22)
		const lander = design.parts.filter((p) => p.part === 'stock.lander-descent' || p.part === 'stock.lander-ascent');
		for (const l of lander) expect(design.stages[0]!.includes(l.index)).toBe(false);
	});

	it('Horizon Station has five berths, two free 1.25 m ones after staging, and no size mismatch', () => {
		const design = MISSION_BLUEPRINTS.find((m) => m.id === 'stock.horizon-station')!.design;
		const ports = design.parts.filter((p) => modulesOf(p.part).includes('stock.docking-port'));
		expect(ports).toHaveLength(5);
		expect(sizeMismatches(design, content.parts as never)).toEqual([]);
	});

	it('Wayfarer: the orbiter has propellant of its own once the tank drops', () => {
		const design = MISSION_BLUEPRINTS.find((m) => m.id === 'stock.wayfarer-shuttle')!.design;
		const stats = designStats(design, content, 'vacuum', g);
		const orbiterBurn = stats.report!.stages.find((s) =>
			s.parts.some((i) => design.parts.find((p) => p.index === i)?.part === 'stock.orbiter-aft')
		)!;
		expect(orbiterBurn.dvVacuum).toBeGreaterThan(300);
	});

	it('only Kronos V keeps a size mismatch (its escape tower over the small port, jettisoned)', () => {
		for (const mission of MISSION_BLUEPRINTS) {
			const n = sizeMismatches(mission.design, content.parts as never).length;
			expect(n, mission.id).toBe(mission.id === 'stock.kronos-selene' ? 1 : 0);
		}
	});
});
