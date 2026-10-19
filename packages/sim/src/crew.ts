/**
 * Crew in the sim (plan 106, ADR 0176): the roster, hiring, seats and transfer, places and XP at
 * recovery, the death rule and salaries on the world tick.
 */
import {
	abilitiesOf,
	capacityUpgrade,
	createRng,
	drawTraits,
	generateCrewName,
	levelOf,
	placeXp,
	RECRUIT_DAYS,
	SALARY_BASE,
	salaryOf,
	siteCapacity,
	sitesOf,
	streamSeed,
	type CommandResult,
	type CrewMember,
	type EntityId,
	type Profession,
	type SaveCrew,
	type Snapshot,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import { bodyOfVessel } from './bodies.ts';
import { controlProblem, moduleDefOf, partDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import { economyOn, record, ruleOf } from './economy.ts';
import { elementsOf, motionOf } from './orbit.ts';
import { PART } from './state.ts';
import { conditionSnapshot } from './life.ts';

export { DAY as crewDay };

export const freshCrew = (core: Pick<SimCore, 'info'>): SaveCrew => ({
	next: 1,
	rng: streamSeed(core.info.seed, 'crew'),
	members: []
});

const RULES = {
	experience: 'stock.crew-experience',
	salaries: 'stock.crew-salaries',
	death: 'stock.crew-death',
	returnDays: 'stock.crew-return-days'
} as const;

const DAY = (core: SimCore): number => core.root.def.rotationPeriod;
const salariesOn = (core: SimCore): boolean =>
	economyOn(core) && ruleOf(core, RULES.salaries) !== false;

export const memberOf = (core: SimCore, id: string): CrewMember | undefined =>
	core.crew.members.find((m) => m.id === id);

/** The vessel a seated member is in now (the part keeps its entity through staging). */
export function vesselOfMember(core: SimCore, m: CrewMember): EntityId | undefined {
	if (m.status !== 'assigned' || !m.location) return undefined;
	const part = core.world.get(m.location.part as EntityId, PART);
	return part ? part.vessel : undefined;
}

const seatedIn = (core: SimCore, part: EntityId): CrewMember[] =>
	core.crew.members.filter((m) => m.status === 'assigned' && m.location?.part === Number(part));

/**
 * The roster limit of the primary site's crew capacity with the economy on (plan 096, ADR 0123
 * point 4): the refusal text, or undefined. Missing and lost members do not count.
 */
export function rosterFull(core: SimCore): string | undefined {
	if (!economyOn(core)) return undefined;
	const site = sitesOf(core.info)[0];
	const limit = site ? siteCapacity(site, core.registries.buildings, 'crew') : null;
	if (limit === null) return undefined;
	const roster = core.crew.members.filter(
		(m) => m.status === 'available' || m.status === 'assigned'
	).length;
	if (roster < limit) return undefined;
	const lift = capacityUpgrade(core.registries.buildings, 'crew', roster + 1);
	return `The roster is full (${limit} crew)${lift ? `; ${lift.text}` : ''}`;
}

/** `crew-hire` (ADR 0176 point 2). */
export function hireCrew(core: SimCore, profession: Profession): CommandResult {
	const full = rosterFull(core);
	if (full) return { ok: false, reason: full };
	const member = newMember(core, profession);
	if (salariesOn(core) && SALARY_BASE[profession] > 0) {
		record(core, 'funds', -SALARY_BASE[profession] * RECRUIT_DAYS, 'crew.recruit', member.id);
	}
	core.events.emit('crew:hired', { member: member.id, name: member.name, profession });
	return { ok: true };
}

/**
 * A member stranded in `vesselId`'s first seat (a rescue contract; plan 231, ADR 0231 point 3): a
 * new member like a hire, free and past the roster's cap, who joins the roster once recovered.
 * Undefined when the vessel has no seat.
 */
export function strandMember(core: SimCore, vesselId: EntityId): string | undefined {
	const vessel = vesselOf(core, vesselId);
	const seat = vessel.parts.find((id) => (partDefOf(core, partOf(core, id)).crewCapacity ?? 0) > 0);
	if (seat === undefined) return undefined;
	const member = newMember(core, 'pilot');
	seatCrew(core, vesselId, [{ member: member.id, part: partOf(core, seat).index }], () => seat);
	return member.id;
}

/** A new available member on the roster: a name, traits and nothing flown yet. */
function newMember(core: SimCore, profession: Profession): CrewMember {
	const rng = createRng(core.crew.rng);
	const names = core.registries.crewNames.list();
	const name =
		names.length > 0
			? generateCrewName(names[rng.int(0, names.length - 1)]!, rng)
			: `Crew ${core.crew.next}`;
	const traits = drawTraits(core.registries.crewTraits.list(), rng);
	core.crew.rng = rng.state();
	const member: CrewMember = {
		id: `c${core.crew.next++}`,
		name,
		profession,
		traits,
		xp: 0,
		level: 0,
		status: 'available',
		// the key in its saved place (after `status`), so a seated member saves byte for byte
		...({ location: undefined } as Pick<CrewMember, 'location'>),
		places: [],
		visited: [],
		log: []
	};
	core.crew.members.push(member);
	return member;
}

/**
 * `crew-dismiss` (contract request of plan 108, ADR 0152 point 4): an available member leaves the
 * roster; one seated in a vessel, missing or lost cannot be let go. Nothing is refunded.
 */
export function dismissCrew(core: SimCore, id: string): CommandResult {
	const member = core.crew.members.find((m) => m.id === id);
	if (!member) return { ok: false, reason: `no crew member "${id}"` };
	if (member.status !== 'available') {
		return { ok: false, reason: `${member.name} is ${member.status} and cannot be dismissed` };
	}
	core.crew.members = core.crew.members.filter((m) => m.id !== id);
	core.events.emit('crew:dismissed', { member: id, name: member.name });
	return { ok: true };
}

/** Why `crew` cannot sit in `design`, or undefined (ADR 0176 point 3). */
export function seatProblem(
	core: SimCore,
	design: VesselDesign,
	crew: ReadonlyArray<{ member: string; part: number }>
): string | undefined {
	const used = new Map<number, number>();
	const seen = new Set<string>();
	for (const { member, part } of crew) {
		const m = memberOf(core, member);
		if (!m) return `unknown crew member "${member}"`;
		if (m.status !== 'available') return `crew member "${member}" is ${m.status}`;
		if (seen.has(member)) return `crew member "${member}" is listed twice`;
		seen.add(member);
		const p = design.parts.find((x) => x.index === part);
		if (!p) return `crew seat: unknown part index ${part}`;
		const capacity = core.registries.parts.get(p.part)?.crewCapacity ?? 0;
		const n = (used.get(part) ?? 0) + 1;
		if (n > capacity) return `part #${part} (${p.part}) has ${capacity} seat(s)`;
		used.set(part, n);
	}
	return undefined;
}

/** Seats `crew` on the new vessel; `partOfIndex` maps design indices to part entities. */
export function seatCrew(
	core: SimCore,
	vessel: EntityId,
	crew: ReadonlyArray<{ member: string; part: number }>,
	partOfIndex: (index: number) => EntityId
): void {
	for (const { member, part } of crew) {
		const m = memberOf(core, member)!;
		m.status = 'assigned';
		m.location = { vessel: Number(vessel), part: Number(partOfIndex(part)) };
		m.places = [];
		m.boardedAt = core.t;
	}
	collectCrewPlaces(core);
}

/**
 * A vessel launched without a crew list whose only control is an empty crewed part (plan 200,
 * ADR 0216): an available member takes its first seat, and in a world without an economy a pilot
 * is hired for it (KSP's Hangar fills the seats). With the economy on and nobody available it
 * stays uncontrolled, and the HUD says so.
 */
export function autoCrew(core: SimCore, vesselId: EntityId): void {
	const vessel = vesselOf(core, vesselId);
	if (controlProblem(core, vessel) !== 'no-crew') return;
	const seat = vessel.parts.find((id) => {
		const part = partOf(core, id);
		return (
			(partDefOf(core, part).crewCapacity ?? 0) > 0 &&
			part.modules.some((m) => moduleDefOf(core, m.id).controlSource === true)
		);
	});
	if (seat === undefined) return;
	let member = core.crew.members.find((m) => m.status === 'available');
	if (!member && !economyOn(core) && hireCrew(core, 'pilot').ok) {
		member = core.crew.members[core.crew.members.length - 1];
	}
	if (!member) return;
	seatCrew(core, vesselId, [{ member: member.id, part: partOf(core, seat).index }], () => seat);
}

/** `crew-transfer` within one vessel. */
export function transferCrew(
	core: SimCore,
	vessel: EntityId,
	member: string,
	to: EntityId
): CommandResult {
	const m = memberOf(core, member);
	if (!m || vesselOfMember(core, m) !== vessel)
		return { ok: false, reason: `crew member "${member}" is not aboard vessel ${vessel}` };
	const part = core.world.get(to, PART);
	if (!part || part.vessel !== vessel)
		return { ok: false, reason: `part ${to} is not part of vessel ${vessel}` };
	const capacity = partDefOf(core, part).crewCapacity ?? 0;
	if (seatedIn(core, to).length >= capacity)
		return { ok: false, reason: `part ${to} has no free seat` };
	m.location = { vessel: Number(vessel), part: Number(to) };
	return { ok: true };
}

/** Places of everyone aboard (ADR 0176 point 4); called after each step and at load. */
export function collectCrewPlaces(core: SimCore): void {
	const home = core.root.def.id;
	for (const m of core.crew.members) {
		const vesselId = vesselOfMember(core, m);
		if (vesselId === undefined) continue;
		const vessel = vesselOf(core, vesselId);
		const body = bodyOfVessel(core, vessel);
		const id = body.def.id;
		const surface = vessel.rails?.kind === 'surface';
		const landed = surface || vessel.landed;
		const add = (place: string) => {
			if (!m.places.includes(place)) m.places.push(place);
		};
		if (id !== home) add(`flyby:${id}`);
		if (landed && id !== home) add(`landed:${id}`);
		if (!landed) {
			const motion = motionOf(core, vessel);
			const el =
				vessel.rails?.kind === 'elements'
					? vessel.rails.elements
					: elementsOf(body.mu, motion.r, motion.v, core.t);
			const clear = body.def.radius + (body.def.atmosphere?.height ?? 0);
			if (el && el.e < 1 && el.a * (1 - el.e) > clear) add(`orbit:${id}`);
		}
	}
}

/** At `recover-vessel` (ADR 0176 point 5): XP for new places, then back to the roster. */
export function recoverCrew(core: SimCore, vesselId: EntityId): void {
	collectCrewPlaces(core);
	const experience = ruleOf(core, RULES.experience) !== false;
	for (const m of core.crew.members) {
		if (vesselOfMember(core, m) !== vesselId) continue;
		if (experience) {
			for (const place of m.places) {
				if (m.visited.includes(place)) continue;
				const xp = placeXp(place, core.root.def.id);
				m.visited.push(place);
				if (xp <= 0) continue;
				m.xp += xp;
				m.level = levelOf(m.xp);
				m.log.push({ time: core.t, place, xp });
				core.events.emit('crew:xp', { member: m.id, place, xp, level: m.level });
			}
		}
		m.places = [];
		m.status = 'available';
		delete m.location;
		endFlight(m);
	}
}

/** A vessel destroyed for any reason but recovery (ADR 0176 point 7). Called before its parts go. */
export function loseCrew(core: SimCore, vesselId: EntityId): void {
	const rule = ruleOf(core, RULES.death);
	const death = rule === 'return' || rule === 'off' ? rule : 'permanent';
	const days = ruleOf(core, RULES.returnDays);
	for (const m of core.crew.members) {
		if (vesselOfMember(core, m) !== vesselId) continue;
		loseMember(core, m, vesselId, death, typeof days === 'number' ? days : 14);
	}
}

/** The death rule for one member (a vessel lost, or a shortage past its grace, plan 107). */
export function loseMember(
	core: SimCore,
	m: CrewMember,
	vesselId: EntityId,
	death: 'permanent' | 'return' | 'off' = deathRule(core),
	days = returnDays(core)
): void {
	m.places = [];
	delete m.location;
	endFlight(m);
	if (death === 'permanent') m.status = 'lost';
	else if (death === 'off') m.status = 'available';
	else {
		m.status = 'missing';
		m.returnsAt = core.t + days * DAY(core);
	}
	core.events.emit('crew:lost', {
		member: m.id,
		vessel: vesselId,
		status: m.status as 'lost' | 'missing' | 'available'
	});
}

export function deathRule(core: SimCore): 'permanent' | 'return' | 'off' {
	const rule = ruleOf(core, RULES.death);
	return rule === 'return' || rule === 'off' ? rule : 'permanent';
}

const returnDays = (core: SimCore): number => {
	const days = ruleOf(core, RULES.returnDays);
	return typeof days === 'number' ? days : 14;
};

/** A flight ends (recovery or loss): the condition of the flight goes, the dose stays (plan 107). */
function endFlight(m: CrewMember): void {
	delete m.morale;
	delete m.fatigue;
	delete m.gStress;
	delete m.glocUntil;
	delete m.shortages;
	delete m.boardedAt;
}

/** World tick (ADR 0176 points 7 and 8): missing members come back; salaries are one entry. */
export function crewTick(core: SimCore): void {
	for (const m of core.crew.members) {
		if (m.status === 'missing' && m.returnsAt !== undefined && core.t >= m.returnsAt) {
			m.status = 'available';
			delete m.returnsAt;
			core.events.emit('crew:returned', { member: m.id });
		}
	}
	if (!salariesOn(core)) return;
	const total = core.crew.members
		.filter((m) => m.status !== 'lost')
		.reduce((s, m) => s + salaryOf(m), 0);
	if (total > 0) record(core, 'funds', -total, 'crew.salaries');
}

/** `Snapshot.crew`, or undefined before anyone is hired. */
export function rosterSnapshot(core: SimCore): Snapshot['crew'] {
	if (core.crew.members.length === 0) return undefined;
	return core.crew.members.map((m) => {
		const vessel = vesselOfMember(core, m);
		return {
			id: m.id,
			name: m.name,
			profession: m.profession,
			traits: [...m.traits],
			xp: m.xp,
			level: m.level,
			status: m.status,
			...(vessel === undefined ? {} : { vessel }),
			places: [...m.places]
		};
	});
}

/** `VesselSnapshot.crew` for one vessel, or undefined without crew aboard. */
export function vesselCrewSnapshot(core: SimCore, vesselId: EntityId): VesselSnapshot['crew'] {
	const aboard = core.crew.members.filter((m) => vesselOfMember(core, m) === vesselId);
	if (aboard.length === 0) return undefined;
	return aboard.map((m) => {
		const { performance, fields } = conditionSnapshot(m);
		const abilities = abilitiesOf(m, core.registries.crewTraits);
		return {
			member: m.id,
			part: m.location!.part as EntityId,
			// quality factors scaled by morale and fatigue (plan 107, ADR 0181 point 6)
			abilities: Object.fromEntries(
				Object.entries(abilities).map(([k, v]) => [k, v * performance])
			),
			...(performance === 1 && Object.keys(fields).length === 1 ? {} : fields)
		};
	});
}
