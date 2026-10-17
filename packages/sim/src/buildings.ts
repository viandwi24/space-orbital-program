/**
 * Buildings on sites in the sim (plan 090, ADR 0115): `place-building` and `remove-building`,
 * validated by core's `canPlace`, and the snapshot view. The site list lives in the world info.
 */
import {
	canPlace,
	cloneData,
	LEGACY_SITE,
	sitesOf,
	type CommandResult,
	type Rotation,
	type Site
} from '@orbital/core';
import type { SimCore } from './core.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** The site to change, written into `WorldInfo.sites` if it was the implicit Legacy site. */
function writableSite(core: SimCore, id: string): Site | undefined {
	if (core.info.sites.length === 0 && id === LEGACY_SITE.id) {
		core.info.sites.push(cloneData(LEGACY_SITE) as never);
	}
	return (core.info.sites as Site[]).find((s) => s.id === id);
}

export function placeBuilding(
	core: SimCore,
	command: {
		site: string;
		kind: string;
		cell: { i: number; j: number };
		rotation: Rotation;
		id: string;
	}
): CommandResult {
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	const buildings = known.buildings ?? [];
	if (buildings.some((b) => b.id === command.id))
		return refuse(`building id "${command.id}" is taken`);
	const check = canPlace(
		{ body: known.body, flatRadius: known.flatRadius, buildings, roads: known.roads ?? [] },
		core.registries.buildings,
		command.kind,
		command.cell,
		command.rotation
	);
	if (!check.ok) return refuse(check.reasons.map((r) => r.message).join('; '));
	const site = writableSite(core, command.site)!;
	site.buildings = [
		...(site.buildings ?? []),
		{
			id: command.id,
			kind: command.kind,
			cell: { ...command.cell },
			rotation: command.rotation,
			level: 0,
			state: 'active'
		}
	];
	site.roads = [...(site.roads ?? []), ...check.roads];
	return { ok: true };
}

export function removeBuilding(
	core: SimCore,
	command: { site: string; id: string }
): CommandResult {
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	if (!(known.buildings ?? []).some((b) => b.id === command.id)) {
		return refuse(`no building "${command.id}" on site "${command.site}"`);
	}
	const site = writableSite(core, command.site)!;
	site.buildings = (site.buildings ?? []).filter((b) => b.id !== command.id);
	return { ok: true };
}

export const sitesSnapshot = (core: SimCore) =>
	sitesOf(core.info).map((s) => ({
		id: s.id,
		buildings: cloneData(s.buildings ?? []),
		roads: cloneData(s.roads ?? [])
	}));
