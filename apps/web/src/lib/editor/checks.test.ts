/** The pre-flight verdict (plan 093, ADR 0148): levels beside severity, the part at fault. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage, starterRocket } from '../design';
import type { ContentLookups } from '../delta-v';
import { blocksLaunch, checkDesign, MARGINAL_TWR, sizeMismatches, verdictOf } from './checks';
import { asparagusRocket, boosterRocket, glider, moonShot } from './examples';
import { attachNew, attachTargets, createEditor, replaceDesign, singlePart } from './state';
import { designStats } from './stats';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);

describe('pre-flight verdict', () => {
	it('no control source: no-go, naming the root part, and Launch is still allowed', () => {
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
		const checks = checkDesign(t, content, designStats(t.design, content, 'sea-level', g));
		const root = t.design.parts.find((p) => p.parent === null)!;
		const noControl = checks.find((c) => c.id === 'no-control')!;
		expect(noControl.level).toBe('no-go');
		expect(noControl.parts).toEqual([root.index]);
		expect(t.design.parts.find((p) => p.index === root.index)!.part).toBe('stock.tank-small');
		expect(verdictOf(checks)).toBe('no-go');
		expect(blocksLaunch(checks)).toBe(false);
	});

	it('liftoff TWR under 1.2 on the first stage: caution, naming its engines', () => {
		const s = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());
		const stats = { ...designStats(s.design, content, 'sea-level', g), liftoffTwr: 1.1 };
		const checks = checkDesign(s, content, stats);
		const marginal = checks.find((c) => c.id === 'marginal-twr')!;
		expect(marginal.level).toBe('caution');
		const firstStage = new Set(s.design.stages[0]);
		expect(marginal.parts.length).toBeGreaterThan(0);
		expect(marginal.parts.every((i) => firstStage.has(i))).toBe(true);
		expect(verdictOf(checks)).toBe('caution');
		// at the threshold and above there is no TWR check
		const ok = checkDesign(s, content, { ...stats, liftoffTwr: MARGINAL_TWR });
		expect(ok.some((c) => c.id === 'marginal-twr' || c.id === 'low-twr')).toBe(false);
	});

	it('the reference two-stage rocket is go; TWR under 1 is no-go', () => {
		const s = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());
		const stats = designStats(s.design, content, 'sea-level', g);
		expect(verdictOf(checkDesign(s, content, stats))).toBe('go');
		expect(verdictOf(checkDesign(s, content, { ...stats, liftoffTwr: 0.8 }))).toBe('no-go');
	});
});

describe('size mismatch (plan 207, ADR 0212)', () => {
	const stack = (top: string) => {
		const s = createEditor(emptyDesign(), content);
		const t = attachNew(
			s,
			content,
			'stock.tank-small',
			attachTargets(s.design, singlePart('stock.tank-small', 0), content.parts)[0]!
		);
		return attachNew(
			t,
			content,
			top,
			attachTargets(t.design, singlePart(top, 1), content.parts).find(
				(x) => x.parent!.parentNode === 'top'
			)!
		);
	};

	it('a 2.5 m part on a 1.25 m node gives a "size mismatch" check with text', () => {
		const t = stack('stock.nose-cone-large');
		const checks = checkDesign(t, content, designStats(t.design, content, 'sea-level', g));
		const mismatch = checks.find((c) => c.id === 'size-mismatch')!;
		expect(mismatch.level).toBe('caution');
		expect(mismatch.text).toBe('Size mismatch: a 2.5 m part sits on a 1.25 m joint.');
		expect(mismatch.hint).toContain('adapter');
		expect(mismatch.parts.sort()).toEqual(t.design.parts.map((p) => p.index).sort());
	});

	it('a part of the same size fits, and the reference rockets have no mismatch', () => {
		const t = stack('stock.nose-cone-medium');
		const ok = checkDesign(t, content, designStats(t.design, content, 'sea-level', g));
		expect(ok.some((c) => c.id === 'size-mismatch')).toBe(false);
		const ref = replaceDesign(createEditor(emptyDesign(), content), content, referenceTwoStage());
		const refChecks = checkDesign(ref, content, designStats(ref.design, content, 'sea-level', g));
		expect(refChecks.some((c) => c.id === 'size-mismatch')).toBe(false);
		for (const design of [
			boosterRocket(content),
			asparagusRocket(content),
			glider(content),
			moonShot()
		]) {
			expect(sizeMismatches(design, content.parts), design.name).toEqual([]);
		}
	});
});

describe('the pre-flight report (plan 218)', () => {
	const textOf = (checks: ReturnType<typeof checkDesign>) => checks.map((c) => c.text).join('\n');
	const run = (
		design: ReturnType<typeof moonShot>,
		crew: { member: string; part: number }[] | null,
		c = content
	) => {
		const s = createEditor(design, c);
		return checkDesign(s, c, { liftoffTwr: 2 }, undefined, [], null, crew);
	};

	it('a pod with no crew and no probe core gives "No control source" and "Pod without crew"', () => {
		const checks = run(moonShot(), []);
		expect(textOf(checks)).toContain('No control source');
		expect(checks.find((c) => c.id === 'no-crew')?.parts).toEqual([0]);
		// unknown seating: the launch seats a free astronaut, so the pod steers
		expect(run(moonShot(), null).some((c) => c.id === 'no-control' || c.id === 'no-crew')).toBe(
			false
		);
	});

	it('a crewed pod without a parachute gives "Crewed vessel without a parachute"', () => {
		const checks = run(moonShot(), [{ member: 'jeb', part: 0 }]);
		expect(textOf(checks)).toContain('Crewed vessel without a parachute');
		expect(checks.some((c) => c.id === 'no-control')).toBe(false);
		// the starter rocket carries one; unknown seating does not ask for one
		expect(
			run(starterRocket(), [{ member: 'jeb', part: 0 }]).some((c) => c.id === 'no-parachute')
		).toBe(false);
		expect(run(moonShot(), null).some((c) => c.id === 'no-parachute')).toBe(false);
	});

	it('a probe without an antenna gives "Probe without antenna"', () => {
		const probe: ReturnType<typeof moonShot> = {
			formatVersion: 3,
			name: 'Probe',
			parts: [
				{ index: 0, part: 'stock.probe-core' as never, parent: null },
				{
					index: 1,
					part: 'stock.tank-small' as never,
					parent: { index: 0, parentNode: 'bottom', node: 'top' }
				}
			],
			stages: []
		};
		// the stock probe core has its own whip: take it off for the case
		const bare: ContentLookups = {
			...content,
			parts: {
				get: (id: string) => {
					const def = registries.parts.get(id);
					return def && id === 'stock.probe-core'
						? {
								...def,
								modules: def.modules?.filter(
									([m]) => registries.modules.get(m)?.antenna === undefined
								)
							}
						: def;
				}
			} as ContentLookups['parts']
		};
		expect(textOf(run(probe, null, bare))).toContain('Probe without antenna');
		expect(run(probe, null).some((c) => c.id === 'no-antenna')).toBe(false);
	});
});
