/**
 * Buildings on sites in the sim (plan 090, ADR 0115): `place-building` and `remove-building`,
 * validated by core's `canPlace`, and the snapshot view. The site list lives in the world info.
 */
import { cheatOn } from './cheats.ts';
import { stopWarp } from './warp-stop.ts';
import {
	canPlace,
	cloneData,
	branchHqOf,
	ECONOMY_CAUSES,
	UPKEEP_EVERY_DAYS,
	upkeepOf,
	LEGACY_LAYOUT,
	LEGACY_SITE,
	MAX_TERRAIN_ZONES,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	siteDistance,
	sitesOf,
	type CommandResult,
	type EntityId,
	type PlacedBuilding,
	type Rotation,
	type Site
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { costMultiplier, economyOn, record } from './economy.ts';

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
		tour?: boolean;
	}
): CommandResult {
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	const buildings = known.buildings ?? [];
	if (buildings.some((b) => b.id === command.id))
		return refuse(`building id "${command.id}" is taken`);
	const check = canPlace(
		{
			body: known.body,
			home: known.body === core.root.def.id,
			flatRadius: known.flatRadius,
			buildings,
			roads: known.roads ?? [],
			branch: known.kind === 'branch'
		},
		core.registries.buildings,
		command.kind,
		command.cell,
		command.rotation
	);
	if (!check.ok) return refuse(check.reasons.map((r) => r.message).join('; '));
	const level = core.registries.buildings.get(command.kind)!.levels[0]!;
	const paid = pay(core, level.cost, command.id);
	if (paid) return refuse(paid);
	const site = writableSite(core, command.site)!;
	site.buildings = [
		...(site.buildings ?? []),
		{
			id: command.id,
			kind: command.kind,
			cell: { ...command.cell },
			rotation: command.rotation,
			level: 0,
			...construction(core, level.buildDays),
			// the tour's building keeps what it cost, for its removal (ADR 0314 point 4)
			...(command.tour ? { refund: charged(core, level.cost) } : {})
		}
	];
	site.roads = [...(site.roads ?? []), ...check.roads];
	return { ok: true };
}

/** What `pay` debits for `cost`: nothing with the economy off. */
const charged = (core: SimCore, cost: number): number =>
	economyOn(core) && cost > 0 ? cost * costMultiplier(core) : 0;

/** Debit a construction cost (economy on); the refusal text when funds do not cover it. */
function pay(core: SimCore, cost: number, ref: string): string | undefined {
	if (!economyOn(core) || cost <= 0) return undefined;
	const amount = cost * costMultiplier(core);
	const funds = core.economy.balances.funds;
	if (amount > funds) {
		return `Not enough funds: needs ${Math.ceil(amount)}, has ${Math.floor(funds)}`;
	}
	record(core, 'funds', -amount, ECONOMY_CAUSES.construction, ref);
	return undefined;
}

/** The state of new work: done at once with the economy off or no build time (ADR 0123 point 1). */
function construction(
	core: SimCore,
	buildDays: number,
	working: 'building' | 'upgrading' = 'building'
): Pick<PlacedBuilding, 'state' | 'readyDay'> {
	if (!economyOn(core) || buildDays <= 0 || cheatOn(core, 'instant-construction'))
		return { state: 'active' };
	return { state: working, readyDay: core.ticks.lastDay + Math.ceil(buildDays) };
}

/** `upgrade-building` (ADR 0123 point 1): one level up, paid now, done on its ready day. */
export function upgradeBuilding(
	core: SimCore,
	command: { site: string; id: string }
): CommandResult {
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	const placed = (known.buildings ?? []).find((b) => b.id === command.id);
	if (!placed) return refuse(`no building "${command.id}" on site "${command.site}"`);
	const def = core.registries.buildings.get(placed.kind);
	if (!def) return refuse(`unknown building "${placed.kind}"`);
	if (placed.state !== 'active') return refuse(`${def.label} is ${placed.state}`);
	const next = def.levels[placed.level + 1];
	if (!next) return refuse(`${def.label} is at its top level`);
	const paid = pay(core, next.cost, command.id);
	if (paid) return refuse(paid);
	const site = writableSite(core, command.site)!;
	const work = construction(core, next.buildDays, 'upgrading');
	const refund =
		placed.refund === undefined ? {} : { refund: placed.refund + charged(core, next.cost) };
	site.buildings = (site.buildings ?? []).map((b) =>
		b.id !== command.id
			? b
			: work.state === 'active'
				? { ...b, ...refund, level: b.level + 1, state: 'active' as const }
				: { ...b, ...refund, ...work }
	);
	if (work.state === 'active') {
		core.events.emit('building:ready', {
			site: command.site,
			id: command.id,
			kind: placed.kind,
			level: placed.level + 1
		});
	}
	return { ok: true };
}

/** Finish every building and upgrade in progress at once (the debug cheat); whether any was. */
export function finishConstruction(core: SimCore): boolean {
	let any = false;
	for (const known of sitesOf(core.info)) {
		const due = (known.buildings ?? []).filter(
			(b) => b.state === 'building' || b.state === 'upgrading'
		);
		if (due.length === 0) continue;
		any = true;
		const site = writableSite(core, known.id)!;
		site.buildings = (site.buildings ?? []).map((b) => {
			if (!due.some((d) => d.id === b.id)) return b;
			const { readyDay: _, ...rest } = b;
			return { ...rest, level: b.state === 'upgrading' ? b.level + 1 : b.level, state: 'active' };
		});
		for (const b of due)
			core.events.emit('building:ready', {
				site: known.id,
				id: b.id,
				kind: b.kind,
				level: b.state === 'upgrading' ? b.level + 1 : b.level
			});
	}
	return any;
}

/**
 * The world tick's building work (ADR 0123 points 1 and 5): construction whose ready day has come
 * is done, then upkeep on every 30th day. Sites are only written when something changed.
 */
export function buildingsTick(core: SimCore, day: number): boolean {
	let changed = false;
	for (const known of sitesOf(core.info)) {
		const due = (known.buildings ?? []).filter(
			(b) => (b.state === 'building' || b.state === 'upgrading') && (b.readyDay ?? 0) <= day
		);
		if (due.length === 0) continue;
		const site = writableSite(core, known.id)!;
		site.buildings = (site.buildings ?? []).map((b) => {
			if (!due.some((d) => d.id === b.id)) return b;
			const { readyDay: _, ...rest } = b;
			return { ...rest, level: b.state === 'upgrading' ? b.level + 1 : b.level, state: 'active' };
		});
		changed = true;
		for (const b of due) {
			core.events.emit('building:ready', {
				site: known.id,
				id: b.id,
				kind: b.kind,
				level: b.state === 'upgrading' ? b.level + 1 : b.level
			});
		}
		stopWarp(core, due.length === 1 ? 'construction is done' : 'constructions are done');
	}
	if (economyOn(core) && day > 0 && day % UPKEEP_EVERY_DAYS === 0) {
		const k = costMultiplier(core);
		for (const u of upkeepOf(sitesOf(core.info), core.registries.buildings)) {
			record(core, 'funds', -u.amount * k, ECONOMY_CAUSES.upkeep, u.id);
		}
	}
	return changed;
}

export function removeBuilding(
	core: SimCore,
	command: { site: string; id: string }
): CommandResult {
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	const placed = (known.buildings ?? []).find((b) => b.id === command.id);
	if (!placed) {
		return refuse(`no building "${command.id}" on site "${command.site}"`);
	}
	const site = writableSite(core, command.site)!;
	site.buildings = (site.buildings ?? []).filter((b) => b.id !== command.id);
	// the tour's building gives back what it cost (ADR 0314 point 4)
	if (placed.refund !== undefined && placed.refund > 0 && economyOn(core))
		record(core, 'funds', placed.refund, ECONOMY_CAUSES.refund, command.id);
	return { ok: true };
}

/** Sites founded during this run: their flat zone shapes the terrain only from the next load (ADR 0177 point 6). */
const foundedThisRun = new WeakMap<SimCore, Set<string>>();

export const foundedInThisRun = (core: SimCore, site: string): boolean =>
	foundedThisRun.get(core)?.has(site) ?? false;

/** Why a new site cannot go at this spot on `body`, or undefined (ADR 0177 point 6). */
export function siteRefusal(
	core: SimCore,
	command: { id: string; latitude: number; longitude: number },
	body: string
): string | undefined {
	const runtime = core.bodies.get(body);
	if (!runtime) return `unknown body "${body}"`;
	const sites = sitesOf(core.info);
	if (sites.some((s) => s.id === command.id)) return `site id "${command.id}" is taken`;
	const onBody = sites.filter((s) => s.body === body);
	if (onBody.length >= MAX_TERRAIN_ZONES)
		return `body ${body} already has ${onBody.length} sites; at most ${MAX_TERRAIN_ZONES}`;
	const reach = SITE_FLAT_RADIUS + SITE_BLEND_WIDTH;
	for (const s of onBody) {
		const d = siteDistance(s, command, runtime.def.radius);
		if (d < reach + s.flatRadius + s.blendWidth)
			return `too close to site "${s.id}" (${Math.round(d / 1000)} km): flat zones would overlap`;
	}
	return undefined;
}

/** Write a new site after the checks; the Legacy site stays first. */
function addSite(
	core: SimCore,
	command: { id: string; name: string; latitude: number; longitude: number },
	body: string,
	kind: Site['kind'],
	layout: { buildings: PlacedBuilding[]; roads: Array<{ i: number; j: number }> }
): void {
	// The implicit Legacy site is written first, so it stays the primary site.
	if (core.info.sites.length === 0) writableSite(core, LEGACY_SITE.id);
	(core.info.sites as Site[]).push({
		id: command.id,
		name: command.name,
		body,
		kind,
		latitude: command.latitude,
		longitude: command.longitude,
		flatRadius: SITE_FLAT_RADIUS,
		blendWidth: SITE_BLEND_WIDTH,
		pads: [{ east: 0, north: 0 }],
		buildings: cloneData(layout.buildings),
		roads: cloneData(layout.roads)
	});
	let set = foundedThisRun.get(core);
	if (!set) foundedThisRun.set(core, (set = new Set()));
	set.add(command.id);
	core.events.emit('site:founded', {
		site: command.id,
		body,
		latitude: command.latitude,
		longitude: command.longitude
	});
}

/** `found-site` (ADR 0177 point 6): a base with the starter pad, refused when its zone would overlap. */
export function foundSite(
	core: SimCore,
	command: { id: string; name: string; latitude: number; longitude: number; body?: string },
	/** What the new site starts with: the starter pad, or a base's hub (plan 128, ADR 0125 point 2). */
	layout: { buildings: PlacedBuilding[]; roads: Array<{ i: number; j: number }> } = STARTER_LAYOUT
): CommandResult {
	const body = command.body ?? core.root.def.id;
	const why = siteRefusal(core, command, body);
	if (why) return refuse(why);
	addSite(core, command, body, 'base', layout);
	return { ok: true };
}

/** Where a branch's HQ stands: north of the centre, the pads' ground left free. */
export const BRANCH_HQ_CELL = { i: -2, j: 6 };

/**
 * `found-branch` (plan 236, ADR 0229 point 2): another space center on the home planet. The spot
 * passes the site rules, the HQ's level-1 cost is paid (economy on), and the HQ is built over its
 * build days on the world tick; the branch builds nothing else until then.
 */
export function foundBranch(
	core: SimCore,
	command: { id: string; name: string; latitude: number; longitude: number }
): CommandResult {
	const hq = branchHqOf(core.registries.buildings);
	if (!hq) return refuse('no branch HQ building is loaded');
	const body = core.root.def.id;
	const why = siteRefusal(core, command, body);
	if (why) return refuse(why);
	const level = hq.levels[0]!;
	const paid = pay(core, level.cost, `branch:${command.id}`);
	if (paid) return refuse(paid);
	addSite(core, command, body, 'branch', {
		buildings: [
			{
				id: `${command.id}-hq`,
				kind: hq.id,
				cell: BRANCH_HQ_CELL,
				rotation: 0,
				level: 0,
				...construction(core, level.buildDays)
			}
		],
		roads: []
	});
	return { ok: true };
}

/** The starter layout of a founded site: the Legacy pad and its roads, nothing else. */
const STARTER_LAYOUT = {
	buildings: LEGACY_LAYOUT.buildings.filter((b) => b.id === 'legacy-pad'),
	roads: [] as typeof LEGACY_LAYOUT.roads
};

export const sitesSnapshot = (core: SimCore) =>
	sitesOf(core.info).map((s) => ({
		id: s.id,
		body: s.body,
		...(s.members?.length ? { members: s.members.map((m) => m as EntityId) } : {}),
		buildings: cloneData(s.buildings ?? []) as PlacedBuilding[],
		roads: cloneData(s.roads ?? [])
	}));
