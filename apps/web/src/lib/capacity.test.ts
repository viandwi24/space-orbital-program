/** Capacity limits on the page (plan 096, ADR 0123 point 4): the Hangar's part limit, the Launch screen. */
import { LEGACY_LAYOUT, LEGACY_WORLD_ID, legacyWorldInfo, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from './design';
import type { ContentLookups } from './delta-v';
import { blocksLaunch, checkDesign, verdictOf } from './editor/checks';
import { attachNew, attachTargets, createEditor, singlePart, type EditorState } from './editor/state';
import { designStats } from './editor/stats';
import { limitsOn, massUpgrade, partsLimit } from './capacity';
import { facilitiesOf } from './launch/launch-model';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);
const site = { buildings: LEGACY_LAYOUT.buildings };

/** A pod with `n - 1` small tanks stacked under it. */
function tower(n: number): EditorState {
	let s = attachNew(
		createEditor(emptyDesign(), content),
		content,
		'stock.command-pod',
		attachTargets(emptyDesign(), singlePart('stock.command-pod', 0), content.parts)[0]!
	);
	for (let k = 1; k < n; k++) {
		const target = attachTargets(s.design, singlePart('stock.tank-small', k), content.parts).find(
			(x) => x.parent?.index === k - 1 && x.parent.parentNode === 'bottom'
		)!;
		s = attachNew(s, content, 'stock.tank-small', target);
	}
	return s;
}

describe("the Hangar's part limit", () => {
	it('a design of 40 parts at a level-1 Hangar (limit 30) is no-go and names "Hangar level 2: 120 parts"', () => {
		const s = tower(40);
		expect(s.design.parts.length).toBe(40);
		const limit = partsLimit(site, registries.buildings, true, 40);
		expect(limit).toEqual({ limit: 30, upgrade: 'Hangar level 2: 120 parts' });
		const checks = checkDesign(s, content, designStats(s.design, content, 'sea-level', g), undefined, limit);
		const over = checks.find((c) => c.id === 'over-capacity')!;
		expect(over).toMatchObject({ level: 'no-go', severity: 'error' });
		expect(over.text).toBe('40 parts: the Hangar takes 30.');
		expect(over.hint).toContain('Hangar level 2: 120 parts');
		expect(verdictOf(checks)).toBe('no-go');
		expect(blocksLaunch(checks)).toBe(true);
	});

	it('30 parts fit; no limit where the economy is off', () => {
		const s = tower(30);
		const limit = partsLimit(site, registries.buildings, true, 30);
		const checks = checkDesign(s, content, designStats(s.design, content, 'sea-level', g), undefined, limit);
		expect(checks.some((c) => c.id === 'over-capacity')).toBe(false);
		expect(partsLimit(site, registries.buildings, false, 40)).toBeNull();
	});

	it('limits apply in Career, not in Sandbox or the Legacy world', () => {
		const info = { ...legacyWorldInfo(1), id: LEGACY_WORLD_ID };
		expect(limitsOn({ ...info, preset: 'stock.career' }, registries)).toBe(true);
		expect(limitsOn({ ...info, preset: 'stock.sandbox' }, registries)).toBe(false);
		expect(limitsOn(undefined, registries)).toBe(false);
	});
});

describe('the Launch screen limits', () => {
	it("a pad's mass limit applies only with limits on; the upgrade for a heavy design is named", () => {
		expect(facilitiesOf(site, registries.buildings, true)[0]!.massLimit).toBe(18);
		expect(facilitiesOf(site, registries.buildings, false)[0]!.massLimit).toBeNull();
		expect(massUpgrade(registries.buildings, 25_000)).toBe('Launchpad S level 2: 30 t');
	});
});
