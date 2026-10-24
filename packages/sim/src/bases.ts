/**
 * Off-world bases in the sim (plan 128, ADR 0125): `deploy-base` founds a site from a landed kit,
 * `join-site` makes a landed vessel an outpost, members leave when they drive off, drills fill site
 * storage, and supply routes move cargo on each transfer window.
 */
import {
	directionLatLon,
	isTraded,
	siteCapacity,
	sitesOf,
	storedUnits,
	type CommandResult,
	type EntityId,
	type Site,
	type SupplyRoute,
	type Vec3
} from '@orbital/core';
import { normalize } from '@orbital/kepler';
import { bodyById, bodyOfVessel, rotationAt, type BodyRuntime } from './bodies.ts';
import { foundSite } from './buildings.ts';
import { partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { costMultiplier, economyOn, record, recoveryBlocker } from './economy.ts';
import { qConj, qRotate } from './math.ts';
import { depositInto, roomIn } from './resources.ts';
import { VESSEL } from './state.ts';
import { destroyVessel } from './vessel.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
export const BASE_KIT = 'stock.base-kit';
export const DRILL = 'stock.drill';
const ICE = 'stock.ice';
const LAUNCH_SERVICE = 'stock.launch-service';
export const ROUTE_CAUSE = 'stock.supply-route';

/** The vessel's position as a unit body-fixed direction on the body it is at. */
function bodyFixed(core: SimCore, id: EntityId): { body: BodyRuntime; dir: Vec3 } {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const dir =
		vessel.rails?.kind === 'surface'
			? normalize(vessel.rails.r)
			: normalize(qRotate(qConj(rotationAt(body, core.t)), vessel.com));
	return { body, dir };
}

const landedAtRest = (core: SimCore, id: EntityId): boolean =>
	recoveryBlocker(core, id) === undefined;

const hasModule = (core: SimCore, id: EntityId, module: string): boolean =>
	vesselOf(core, id).parts.some((p) => partOf(core, p).modules.some((m) => m.id === module));

/** `deploy-base` (ADR 0125 point 2): a landed kit on another body founds a base, and is spent. */
export function deployBase(
	core: SimCore,
	command: { vessel: EntityId; id: string; name: string }
): CommandResult {
	if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
	if (!hasModule(core, command.vessel, BASE_KIT)) return refuse('the vessel carries no base kit');
	if (!landedAtRest(core, command.vessel)) return refuse('a base kit deploys landed and at rest');
	const { body, dir } = bodyFixed(core, command.vessel);
	if (body.def.id === core.root.def.id) {
		return refuse('a base kit is for other bodies; build on the home planet in the Space Center');
	}
	const [latitude, longitude] = directionLatLon(dir);
	const founded = foundSite(
		core,
		{ id: command.id, name: command.name, latitude, longitude, body: body.def.id },
		BASE_LAYOUT
	);
	if (!founded.ok) return founded;
	destroyVessel(core, command.vessel, 'deployed');
	return { ok: true };
}

/** The layout a deployed kit stands up: the hub at the centre (ADR 0125 point 2). */
export const BASE_LAYOUT = {
	buildings: [
		{
			id: 'base-hub',
			kind: 'stock.base-hub',
			cell: { i: -1, j: -1 },
			rotation: 0 as const,
			level: 0,
			state: 'active' as const
		}
	],
	roads: [] as Array<{ i: number; j: number }>
};

const writable = (core: SimCore, id: string): Site | undefined =>
	(core.info.sites as Site[]).find((s) => s.id === id);

/** Metres of arc from a direction to a site's centre. */
function arcToSite(site: Site, dir: Vec3, radius: number): number {
	const c = { lat: site.latitude, lon: site.longitude };
	const centre = {
		x: Math.cos(c.lat) * Math.cos(c.lon),
		y: Math.sin(c.lat),
		z: -Math.cos(c.lat) * Math.sin(c.lon)
	};
	const d = dir.x * centre.x + dir.y * centre.y + dir.z * centre.z;
	return radius * Math.acos(Math.min(1, Math.max(-1, d)));
}

/** `join-site` (ADR 0125 point 4): a landed vessel within the flat zone becomes an outpost. */
export function joinSite(
	core: SimCore,
	command: { vessel: EntityId; site: string }
): CommandResult {
	if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
	const known = sitesOf(core.info).find((s) => s.id === command.site);
	if (!known) return refuse(`unknown site "${command.site}"`);
	if (!landedAtRest(core, command.vessel))
		return refuse('only a landed vessel at rest can join a site');
	const { body, dir } = bodyFixed(core, command.vessel);
	if (body.def.id !== known.body) return refuse(`the vessel is not on ${known.body}`);
	const arc = arcToSite(known, dir, body.def.radius);
	if (arc > known.flatRadius) {
		return refuse(
			`the vessel is ${Math.round(arc / 100) / 10} km from the site; join within ${known.flatRadius / 1000} km`
		);
	}
	const site = writable(core, command.site);
	if (!site) return refuse(`site "${command.site}" cannot take members`);
	const id = Number(command.vessel);
	if (!(site.members ?? []).includes(id)) site.members = [...(site.members ?? []), id];
	core.events.emit('site:joined', { site: site.id, vessel: command.vessel });
	return { ok: true };
}

/**
 * `refuel` (ADR 0352): a member vessel takes, free of charge, the stored commodities that are
 * resources (fuel, oxidizer, …) into every tank that has room. What the tanks cannot hold stays.
 */
export function refuelFromSite(
	core: SimCore,
	command: { vessel: EntityId; site: string }
): CommandResult {
	if (!core.world.has(command.vessel, VESSEL)) return refuse(`no vessel ${command.vessel}`);
	const site = sitesOf(core.info).find((s) => s.id === command.site);
	if (!site) return refuse(`unknown site "${command.site}"`);
	if (!(site.members ?? []).includes(Number(command.vessel)))
		return refuse('only a member of the site can refuel from its storage; join the site first');
	if (!landedAtRest(core, command.vessel))
		return refuse('refuelling needs a landed vessel at rest');
	const held = core.economy.storage?.[command.site] ?? {};
	const parts = vesselOf(core, command.vessel).parts;
	const moved: Record<string, number> = {};
	let stocked = false;
	for (const def of core.registries.commodities.list()) {
		const resource = def.resource;
		const have = held[def.id] ?? 0;
		if (!resource || !(have > 0)) continue;
		stocked = true;
		const take = Math.min(have, roomIn(core, parts, resource));
		if (!(take > 0)) continue;
		const put = depositInto(core, parts, resource, take);
		if (put <= 0) continue;
		held[def.id] = have - put;
		moved[resource] = put;
	}
	if (Object.keys(moved).length === 0)
		return refuse(
			stocked
				? 'the vessel has no room for the propellant in storage'
				: 'the site stores no propellant yet'
		);
	core.events.emit('site:refuelled', { site: site.id, vessel: command.vessel, moved });
	return { ok: true };
}

/** Members that drove off, took off or are gone leave their site (ADR 0125 point 4). */
export function membersTick(core: SimCore): void {
	for (const site of core.info.sites as Site[]) {
		if (!site.members?.length) continue;
		const keep: number[] = [];
		for (const id of site.members) {
			const vessel = id as EntityId;
			let stays = core.world.has(vessel, VESSEL) && landedAtRest(core, vessel);
			if (stays) {
				const { body, dir } = bodyFixed(core, vessel);
				stays =
					body.def.id === site.body &&
					arcToSite(site, dir, body.def.radius) <= site.flatRadius + site.blendWidth;
			}
			if (stays) keep.push(id);
			else core.events.emit('site:left', { site: site.id, vessel });
		}
		site.members = keep;
	}
}

/** Ice the members' drills add on a tick, per site (ADR 0125 point 4). */
export function drillOutput(core: SimCore): Map<string, number> {
	const out = new Map<string, number>();
	const live = new Set(vesselIds(core).map(Number));
	for (const site of sitesOf(core.info)) {
		let perDay = 0;
		for (const id of site.members ?? []) {
			if (!live.has(id)) continue;
			for (const p of vesselOf(core, id as EntityId).parts)
				for (const m of partOf(core, p).modules)
					if (m.id === DRILL) perDay += (m.config as { perDay: number }).perDay;
		}
		if (perDay > 0) out.set(site.id, perDay);
	}
	return out;
}

/** Fill a site's storage with the day's drilling, up to its capacity. */
export function drill(core: SimCore, storage: (site: string) => Record<string, number>): void {
	for (const [siteId, perDay] of drillOutput(core)) {
		const site = sitesOf(core.info).find((s) => s.id === siteId)!;
		const capacity = siteCapacity(site, core.registries.buildings, 'storage') ?? 0;
		const held = storage(siteId);
		const add = Math.min(perDay, Math.max(0, capacity - storedUnits(held)));
		if (add > 0) held[ICE] = (held[ICE] ?? 0) + add;
	}
}

// ---- supply routes (ADR 0125 point 6) ----

/** Orbital period of a body around its parent, s. */
function periodOf(body: BodyRuntime): number {
	const a = body.elements?.a ?? 0;
	return body.parent ? 2 * Math.PI * Math.sqrt((a * a * a) / body.parent.mu) : Infinity;
}

/**
 * Days between transfer windows of two bodies: a moon's period from its parent (or back), else the
 * synodic period of the two bodies' ancestors that share a parent.
 */
export function windowDays(core: SimCore, from: string, to: string): number {
	const day = core.ticks.length;
	if (from === to) return 1;
	const chain = (b: BodyRuntime): BodyRuntime[] => {
		const out: BodyRuntime[] = [];
		for (let x: BodyRuntime | undefined = b; x; x = x.parent) out.push(x);
		return out;
	};
	const a = chain(bodyById(core, from));
	const b = chain(bodyById(core, to));
	const common = a.find((x) => b.includes(x))!;
	const ca = a[a.indexOf(common) - 1];
	const cb = b[b.indexOf(common) - 1];
	let seconds: number;
	if (!ca || !cb)
		seconds = periodOf((ca ?? cb)!); // one is the other's ancestor
	else {
		const ta = periodOf(ca);
		const tb = periodOf(cb);
		seconds = 1 / Math.abs(1 / ta - 1 / tb);
	}
	return Math.max(1, Math.ceil(seconds / day));
}

export function createRoute(
	core: SimCore,
	command: { id: string; from: string; to: string; commodity: string; amount: number }
): CommandResult {
	if (!economyOn(core)) return refuse('supply routes need the economy');
	const sites = sitesOf(core.info);
	const from = sites.find((s) => s.id === command.from);
	const to = sites.find((s) => s.id === command.to);
	if (!from) return refuse(`unknown site "${command.from}"`);
	if (!to) return refuse(`unknown site "${command.to}"`);
	if (from.id === to.id) return refuse('a route needs two sites');
	if (!core.registries.commodities.has(command.commodity))
		return refuse(`unknown commodity "${command.commodity}"`);
	const routes = (core.economy.routes ??= []);
	if (routes.some((r) => r.id === command.id)) return refuse(`route id "${command.id}" is taken`);
	// a proven flight: something has landed on the destination's body (ADR 0125 point 6)
	const proven = core.milestones.records.some((r) => r.kind === 'landing' && r.body === to.body);
	if (!proven) return refuse(`no flight has landed on ${to.body} yet: fly one there first`);
	const route: SupplyRoute = {
		...command,
		nextDay: core.ticks.lastDay + windowDays(core, from.body, to.body)
	};
	routes.push(route);
	return { ok: true };
}

export function deleteRoute(core: SimCore, command: { id: string }): CommandResult {
	const routes = core.economy.routes ?? [];
	if (!routes.some((r) => r.id === command.id)) return refuse(`no route "${command.id}"`);
	core.economy.routes = routes.filter((r) => r.id !== command.id);
	return { ok: true };
}

/** Each route whose window is today moves its cargo and books its cost (ADR 0125 point 6). */
export function routesTick(
	core: SimCore,
	day: number,
	storage: (site: string) => Record<string, number>,
	marketPrice: (commodity: string) => number | undefined,
	buyFromMarket: (commodity: string, amount: number) => void
): void {
	const sites = sitesOf(core.info);
	for (const route of core.economy.routes ?? []) {
		if (route.nextDay > day) continue;
		const from = sites.find((s) => s.id === route.from);
		const to = sites.find((s) => s.id === route.to);
		if (!from || !to) continue;
		route.nextDay = day + windowDays(core, from.body, to.body);
		const src = storage(from.id);
		const dst = storage(to.id);
		const room = Math.max(
			0,
			(siteCapacity(to, core.registries.buildings, 'storage') ?? 0) - storedUnits(dst)
		);
		const wanted = Math.min(route.amount, room);
		const fromStore = Math.min(wanted, src[route.commodity] ?? 0);
		let bought = 0;
		const def = core.registries.commodities.get(route.commodity);
		const price = marketPrice(route.commodity);
		if (from.body === core.root.def.id && def && isTraded(def) && price !== undefined) {
			bought = wanted - fromStore;
			if (bought > 0) buyFromMarket(route.commodity, bought);
		}
		src[route.commodity] = (src[route.commodity] ?? 0) - fromStore;
		const moved = fromStore + bought;
		dst[route.commodity] = (dst[route.commodity] ?? 0) + moved;
		const service =
			(core.registries.commodities.get(LAUNCH_SERVICE)?.basePrice ?? 0) * costMultiplier(core);
		const cost = service + bought * (price ?? 0);
		if (cost > 0) record(core, 'funds', -cost, ROUTE_CAUSE, `${route.id} ×${Math.round(moved)}`);
		core.events.emit('route:delivered', { route: route.id, amount: moved, cost });
	}
}
