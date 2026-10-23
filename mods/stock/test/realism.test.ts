/**
 * Realistic part stats (plan 380, ADR 0317): every stock engine, tank and solid motor within the
 * reference bands of `parts/realism.ts` (docs/research/realistic-part-stats.md).
 */
import { describe, expect, it } from 'bun:test';
import {
	ENGINE_KINDS,
	engineCost,
	engineMass,
	realismIssues,
	STOCK_ENGINE_REALISM,
	STOCK_TANK_ERA,
	tankDryMass,
	type RealismPart
} from '../src/parts/realism.ts';
import { loaded } from './helpers.ts';

const { parts, resources } = loaded.registries;
const density = (id: string): number => resources.get(id)?.density ?? 0;
const issuesOf = (p: RealismPart): string[] =>
	realismIssues(p, STOCK_ENGINE_REALISM, density, STOCK_TANK_ERA);
const asPart = (id: string) => parts.get(id) as unknown as RealismPart;

describe('stock part realism', () => {
	it('every stock part is within the reference bands', () => {
		const issues = parts.list().flatMap((p) => issuesOf(p as unknown as RealismPart));
		expect(issues).toEqual([]);
	});

	it('every engine in the kind table is a registered part with an engine', () => {
		for (const id of Object.keys(STOCK_ENGINE_REALISM)) {
			const p = parts.get(id);
			expect(p, id).toBeDefined();
			expect((p!.modules ?? []).some(([m]) => m === 'stock.engine'), id).toBe(true);
		}
	});

	it('a new engine with no kind fails with a clear message', () => {
		const p = { ...asPart('stock.engine-lv'), id: 'mod.new-engine' };
		expect(issuesOf(p)).toEqual([
			'mod.new-engine has an engine but no realism kind: give it one (parts/realism.ts, STOCK_ENGINE_REALISM)'
		]);
	});

	it('an engine outside its bands names the part, the value and the band', () => {
		const lv = asPart('stock.engine-lv');
		const heavy: RealismPart = {
			...lv,
			mass: 1_250,
			modules: lv.modules!.map(([id, c]) =>
				id === 'stock.engine' ? [id, { ...(c as object), ispVacuum: 450 }] : [id, c]
			)
		};
		const issues = issuesOf(heavy);
		expect(issues).toHaveLength(2);
		expect(issues[0]).toContain('stock.engine-lv (kerolox-early');
		expect(issues[0]).toContain('vacuum Isp 450 s is outside 230–310 s');
		expect(issues[1]).toContain('thrust-to-weight 17.5 is outside 20–100');
	});

	it('a tank outside its size class names the dry fraction and the band', () => {
		const t = { ...asPart('stock.tank-3750'), mass: 4_500 };
		const [issue] = issuesOf(t);
		expect(issue).toContain('stock.tank-3750 (modern tank, 3.750 m): dry fraction 11.1 % is outside');
	});

	it('the rules are monotone: bigger tanks are leaner, engines follow their target', () => {
		expect(tankDryMass(36_000, 3.75) / 36_000).toBeLessThan(tankDryMass(36_000, 1.25) / 36_000);
		const twr = ENGINE_KINDS['kerolox-sl'].twr!.target;
		expect(215_000 / (engineMass('kerolox-sl', 215_000) * 9.80665)).toBeCloseTo(twr, -1);
		expect(engineCost('kerolox-sl', 215_000)).toBe(7_500);
	});
});
