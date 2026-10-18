/**
 * AI agencies in the sim (plan 126, ADRs 0096 point 4 and 0190): the daily state machine, owned
 * objects on rails, the cap and lifetime that keep the sky bounded, relay rental for the comms
 * network, reactive contracts and news.
 */
import {
	AGENCY_CONTRACT_DAYS,
	AGENCY_COUNT_RULE,
	AGENCY_MAX_OBJECTS,
	AGENCY_NEWS,
	AGENCY_RENT_CAUSE,
	CONTRACT_OFFER_DAYS,
	createRng,
	estimatedLaunchCost,
	partId,
	resolveVesselDesign,
	streamSeed,
	type AgenciesSnapshot,
	type AgencyDefinition,
	type AgencyMission,
	type CommandResult,
	type EntityId,
	type SaveAgencies,
	type SaveAgency,
	type VesselDesign
} from '@orbital/core';
import { vesselOf, type SimCore } from './core.ts';
import { economyOn, record, ruleOf } from './economy.ts';
import { computeRails } from './orbit.ts';
import { VESSEL } from './state.ts';
import { dayLength } from './tick.ts';
import { destroyVessel, placeAtState, spawnVessel } from './vessel.ts';

export const freshAgencies = (): SaveAgencies => ({ agencies: [], rentals: [], news: [] });

export const agenciesTouched = (core: Pick<SimCore, 'agencies'>): boolean =>
	core.agencies.agencies.length > 0 || core.agencies.news.length > 0;

/** The registered agencies the world runs: the first `stock.agency-count` (ADR 0190 point 1). */
function running(core: SimCore): AgencyDefinition[] {
	const n = ruleOf(core, AGENCY_COUNT_RULE);
	const count = typeof n === 'number' ? Math.max(0, Math.floor(n)) : 0;
	return core.registries.agencies.list().slice(0, count);
}

/** The state of agency `def`, created on its first day. */
function stateOf(core: SimCore, def: AgencyDefinition, day: number): SaveAgency {
	let s = core.agencies.agencies.find((a) => a.id === def.id);
	if (!s) {
		s = {
			id: def.id,
			funds: def.budget.start,
			reputation: 0,
			next: 0,
			readyDay: day + Math.round(prep(def, def.programme[0]!)),
			rng: streamSeed(core.info.seed, `agency:${def.id}`),
			objects: []
		};
		core.agencies.agencies.push(s);
	}
	return s;
}

const prep = (def: AgencyDefinition, m: AgencyMission): number =>
	m.prepDays * (1.5 - def.personality.aggressiveness);

function news(core: SimCore, agency: string, text: string): void {
	const n = core.agencies.news;
	n.push({ time: core.t, agency, text });
	if (n.length > AGENCY_NEWS) n.splice(0, n.length - AGENCY_NEWS);
}

/** The one design every agency object uses (ADR 0190 point 3): a probe core and a dish. */
const OBJECT_DESIGN = (name: string): VesselDesign => ({
	formatVersion: 1,
	name,
	parts: ['stock.probe-core', 'stock.dish-antenna'].map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
});

/** An owned object on a circular orbit of home, on rails at once; undefined when it cannot be made. */
function placeObject(
	core: SimCore,
	def: AgencyDefinition,
	mission: AgencyMission,
	phase: number
): EntityId | undefined {
	const design = OBJECT_DESIGN(`${def.name} ${mission.kind}`);
	const resolved = resolveVesselDesign(design, core.registries.parts);
	if (!resolved.ok) return undefined;
	const home = core.root;
	const r = home.def.radius + mission.altitude;
	const v = Math.sqrt(home.mu / r);
	const inc = mission.inclination ?? 0;
	// in the home body's equatorial frame (+Y up), turned up by the inclination about +X
	const position = { x: r * Math.cos(phase), y: 0, z: -r * Math.sin(phase) };
	const along = { x: -v * Math.sin(phase), y: 0, z: -v * Math.cos(phase) };
	const velocity = {
		x: along.x,
		y: along.z * -Math.sin(inc),
		z: along.z * Math.cos(inc)
	};
	const id = spawnVessel(core, design, resolved);
	const vessel = vesselOf(core, id);
	vessel.soi = home.def.id;
	vessel.owner = def.id;
	placeAtState(core, id, position, velocity, { x: 0, y: 0, z: 0, w: 1 });
	vessel.rails = computeRails(home.mu, vessel.com, vessel.velocity, core.t);
	vessel.mode = 'on-rails';
	core.events.emit('vessel:mode-changed', { vessel: id, mode: 'on-rails', reason: 'loaded' });
	return id;
}

/** The end of an object: its vessel goes, its rental ends. */
function retire(core: SimCore, a: SaveAgency, vessel: number, why: string): void {
	a.objects = a.objects.filter((o) => o.vessel !== vessel);
	core.agencies.rentals = core.agencies.rentals.filter((r) => r.vessel !== vessel);
	if (core.world.has(vessel as EntityId, VESSEL)) destroyVessel(core, vessel as EntityId, why);
	core.comms.dirty = true;
}

/** The reactive contract after a failed relay (ADR 0190 point 5), into the contract offers. */
function offerReplacement(core: SimCore, def: AgencyDefinition, mission: AgencyMission): void {
	const s = core.contracts;
	const key = `agency:${def.id}:${mission.altitude}`;
	if (s.offers.some((o) => o.key === key)) return;
	const deltaV = Math.sqrt(core.root.mu / (core.root.def.radius + mission.altitude)) + 1_150;
	const cost = estimatedLaunchCost(deltaV);
	const reward = Math.round((cost * 1.3) / 500) * 500;
	const length = dayLength(core);
	s.offers.push({
		id: `gen.${s.next++}`,
		template: `agency.${def.id.replace(/\./g, '-')}`,
		tier: 2,
		key,
		title: `Restore ${def.name}'s relay orbit`,
		brief: `${def.name} lost a relay. Put any vessel on an orbit at ${Math.round(mission.altitude / 1000)} km within ${AGENCY_CONTRACT_DAYS} days.`,
		objectives: {
			objective: 'stock.reach-orbit',
			params: { minPeriapsis: mission.altitude * 0.95, maxApoapsis: mission.altitude * 1.05 }
		},
		advance: [{ currency: 'funds', amount: Math.round(reward * 0.2) }],
		reward: [{ currency: 'funds', amount: reward }],
		penalty: [{ currency: 'funds', amount: -Math.round(reward * 0.5) }],
		deadline: AGENCY_CONTRACT_DAYS * length,
		estimate: { deltaV, cost },
		offeredAt: core.t,
		expires: core.t + CONTRACT_OFFER_DAYS * length
	});
	news(core, def.id, `${def.name} asks for help to restore its relay orbit.`);
}

/** One world day of every running agency (ADR 0190 points 2 to 5), after the economy. */
export function agenciesTick(core: SimCore, day: number): void {
	const defs = running(core);
	if (defs.length === 0) return;
	const length = dayLength(core);
	for (const def of defs) {
		const a = stateOf(core, def, day);
		const rng = createRng(a.rng);
		a.funds += def.budget.monthly / 30;
		// lifetimes, and failures of relays
		for (const o of [...a.objects]) {
			const mission = def.programme.find((m) => m.id === o.mission);
			if (!core.world.has(o.vessel as EntityId, VESSEL)) {
				a.objects = a.objects.filter((x) => x !== o);
				continue;
			}
			if (core.t >= o.until) {
				retire(core, a, o.vessel, 'end of life');
				news(
					core,
					def.id,
					`${def.name}'s ${mission?.kind ?? 'object'} reached the end of its life.`
				);
				continue;
			}
			if (
				mission?.kind === 'relay' &&
				rng.next() < (0.2 * def.personality.risk) / mission.lifeDays
			) {
				retire(core, a, o.vessel, 'failed');
				news(
					core,
					def.id,
					`${def.name} lost a relay at ${Math.round(mission.altitude / 1000)} km.`
				);
				offerReplacement(core, def, mission);
			}
		}
		// the next mission
		const mission = def.programme[a.next % def.programme.length]!;
		if (day >= a.readyDay && a.funds >= mission.cost) {
			a.funds -= mission.cost;
			const roll = rng.next();
			const phase = rng.next() * 2 * Math.PI;
			if (roll < mission.success * (1 - 0.3 * def.personality.risk)) {
				if (a.objects.length >= AGENCY_MAX_OBJECTS) {
					const oldest = a.objects[0]!;
					retire(core, a, oldest.vessel, 'deorbited');
				}
				const id = placeObject(core, def, mission, phase);
				if (id !== undefined) {
					a.objects.push({
						vessel: Number(id),
						mission: mission.id,
						until: core.t + mission.lifeDays * length
					});
					a.reputation += 5;
					news(
						core,
						def.id,
						`${def.name} placed a ${mission.kind} at ${Math.round(mission.altitude / 1000)} km.`
					);
				}
			} else {
				a.reputation -= 3;
				news(core, def.id, `${def.name}'s ${mission.kind} launch failed.`);
			}
			a.next += 1;
			a.readyDay =
				day + Math.max(1, Math.round(prep(def, def.programme[a.next % def.programme.length]!)));
		}
		a.rng = rng.state();
	}
	// rentals: the player pays each day, the agency earns (ADR 0190 point 4)
	if (economyOn(core)) {
		for (const r of core.agencies.rentals) {
			record(core, 'funds', -r.rent, AGENCY_RENT_CAUSE, r.agency);
			const a = core.agencies.agencies.find((x) => x.id === r.agency);
			if (a) a.funds += r.rent;
		}
	}
}

/** The agency that owns vessel `id`, if any. */
export const ownerOf = (core: SimCore, id: EntityId): string | undefined =>
	core.world.has(id, VESSEL) ? vesselOf(core, id).owner : undefined;

/** Whether the comms network may use vessel `id` (ADR 0190 point 4): the player's, or rented. */
export const routable = (core: SimCore, id: EntityId): boolean => {
	const owner = ownerOf(core, id);
	return owner === undefined || core.agencies.rentals.some((r) => r.vessel === Number(id));
};

/** Why a command for an owned vessel is refused (ADR 0190 point 3), or undefined. */
export function ownedRefusal(core: SimCore, id: EntityId): string | undefined {
	const owner = ownerOf(core, id);
	if (owner === undefined) return undefined;
	const name = core.registries.agencies.get(owner)?.name ?? owner;
	return `owned by ${name}`;
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/** `relay-rent`. */
export function rentRelay(core: SimCore, vessel: EntityId): CommandResult {
	if (!economyOn(core)) return refuse('Renting a relay needs the economy');
	const owner = ownerOf(core, vessel);
	if (owner === undefined) return refuse(`vessel ${vessel} is not an agency's`);
	const a = core.agencies.agencies.find((x) => x.id === owner);
	const object = a?.objects.find((o) => o.vessel === Number(vessel));
	const def = core.registries.agencies.get(owner);
	const mission = def?.programme.find((m) => m.id === object?.mission);
	if (!mission || mission.kind !== 'relay' || mission.rent === undefined)
		return refuse(`${def?.name ?? owner}'s vessel ${vessel} is not a relay for rent`);
	if (core.agencies.rentals.some((r) => r.vessel === Number(vessel)))
		return refuse('this relay is rented already');
	core.agencies.rentals.push({ vessel: Number(vessel), agency: owner, rent: mission.rent });
	news(core, owner, `${def!.name} rents a relay to the player.`);
	core.comms.dirty = true;
	return { ok: true };
}

/** `relay-end-rent`. */
export function endRent(core: SimCore, vessel: EntityId): CommandResult {
	const before = core.agencies.rentals.length;
	core.agencies.rentals = core.agencies.rentals.filter((r) => r.vessel !== Number(vessel));
	if (core.agencies.rentals.length === before) return refuse(`vessel ${vessel} is not rented`);
	core.comms.dirty = true;
	return { ok: true };
}

/** `Snapshot.agencies`, or undefined when none runs and nothing happened. */
export function agenciesSnapshot(core: SimCore): AgenciesSnapshot | undefined {
	const s = core.agencies;
	if (s.agencies.length === 0 && s.news.length === 0) return undefined;
	const name = (id: string) => core.registries.agencies.get(id)?.name ?? id;
	return {
		agencies: s.agencies.map((a) => {
			const def = core.registries.agencies.get(a.id);
			return {
				id: a.id,
				name: name(a.id),
				funds: a.funds,
				reputation: a.reputation,
				objects: a.objects.map((o) => {
					const m = def?.programme.find((x) => x.id === o.mission);
					return {
						vessel: o.vessel,
						kind: m?.kind ?? 'satellite',
						rent: m?.rent ?? null,
						rented: s.rentals.some((r) => r.vessel === o.vessel)
					};
				}),
				nextDay: a.readyDay
			};
		}),
		news: [...s.news].reverse().map((n) => ({ ...n, name: name(n.agency) }))
	};
}
