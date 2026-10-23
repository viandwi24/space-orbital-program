/**
 * A new world's start (player-journey audit Q1): the home Space Center has the buildings its rules
 * need from minute 0, as in KSP, and a Career agency has a crew. Money goes to upgrades, not to the
 * doors the first flight walks through:
 * - the Astronaut Complex (hiring, the roster) and R&D (the tech tree, or its note where it is off)
 *   everywhere, so every mode and the Space Center lesson has the same core;
 * - the Test Stand where parts can fail (Career engineering);
 * - a pilot, an engineer and a scientist where the economy is on (the others hire a pilot at launch).
 * Only a world started fresh, never a save: an older world keeps what it has.
 */
import {
	canPlace,
	RELIABILITY_RULE,
	sitesOf,
	type Cell,
	type Site
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { newMember } from './crew.ts';
import { economyOn, ruleOf } from './economy.ts';

/** The buildings a fresh home Space Center has from minute 0, by the world's rules. */
export function startBuildings(core: SimCore): string[] {
	const kinds = ['stock.astronaut-complex', 'stock.research'];
	if (ruleOf(core, RELIABILITY_RULE) === true) kinds.push('stock.test-stand');
	return kinds.filter((k) => core.registries.buildings.has(k));
}

/** The first free cell for `kind` round the site centre, rings outward (as the Build menu finds one). */
function freeCell(core: SimCore, site: Site, kind: string): { cell: Cell; roads: Cell[] } | null {
	for (let ring = 6; ring <= 30; ring++)
		for (let i = -ring; i <= ring; i++)
			for (let j = -ring; j <= ring; j++) {
				if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
				const check = canPlace(
					{
						body: site.body,
						home: true,
						flatRadius: site.flatRadius,
						buildings: site.buildings ?? [],
						roads: site.roads ?? [],
						branch: false
					},
					core.registries.buildings,
					kind,
					{ i, j },
					0
				);
				if (check.ok) return { cell: { i, j }, roads: check.roads };
			}
	return null;
}

/** Seed a fresh world's start: the buildings its rules need, and a Career crew. */
export function seedStart(core: SimCore): void {
	const primary = sitesOf(core.info)[0];
	if (primary && primary.body === core.root.def.id) {
		// the implicit Legacy site becomes the world's own, as the first building would make it
		if (core.info.sites.length === 0) core.info.sites.push(structuredClone(primary) as never);
		const site = core.info.sites[0] as Site;
		for (const kind of startBuildings(core)) {
			if ((site.buildings ?? []).some((b) => b.kind === kind)) continue;
			const spot = freeCell(core, site, kind);
			if (!spot) continue;
			site.buildings = [
				...(site.buildings ?? []),
				{
					id: `start-${kind.replace(/^stock\./, '')}`,
					kind,
					cell: spot.cell,
					rotation: 0,
					level: 0,
					state: 'active'
				}
			];
			site.roads = [...(site.roads ?? []), ...spot.roads];
		}
	}
	if (economyOn(core) && core.crew.members.length === 0) {
		for (const profession of ['pilot', 'engineer', 'scientist'] as const)
			newMember(core, profession);
	}
}
