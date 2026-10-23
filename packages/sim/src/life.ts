/**
 * Crew simulation (plan 107, ADR 0181): life support integrated exactly over each step or rails
 * chunk, shortages with a grace and the death rule, morale, fatigue, g-load and radiation dose.
 */
import { cheatOn } from './cheats.ts';
import {
	abilitiesOf,
	CHARGE_RESOURCE,
	CO2,
	CREW_SIM_RULES,
	DOSE_RATE_DEEP,
	DOSE_RATE_HOME,
	fatigueAfter,
	G_LIMIT,
	G_LOC_SECONDS,
	G_LOC_STRESS,
	G_STRESS_DRAIN,
	graceSeconds,
	LIFE_SUPPORT_RATES,
	moraleAfter,
	moraleTarget,
	performanceOf,
	STANDARD_GRAVITY,
	type CrewMember,
	type EntityId,
	type LifeSupportMode,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { length, scale, sub } from '@orbital/kepler';
import { bodyOfVessel } from './bodies.ts';
import { moduleDefOf, partDefOf, partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { crewDay, deathRule, loseMember, vesselOfMember } from './crew.ts';
import { ruleOf } from './economy.ts';
import { motionOf } from './orbit.ts';
import { stopWarp } from './warp-stop.ts';
import { amountAvailable, withdrawResource } from './resources.ts';

/** Run-time state that is not saved: each flight vessel's last velocity, for g-load. */
export interface LifeRuntime {
	velocity: Map<EntityId, { soi: string; v: Vec3; t: number }>;
}

export const freshLife = (): LifeRuntime => ({ velocity: new Map() });

const EMPTY = 1e-9;

export function lifeSupportMode(core: SimCore): LifeSupportMode {
	const rule = ruleOf(core, CREW_SIM_RULES.lifeSupport);
	return rule === 'simple' || rule === 'full' ? rule : 'off';
}

const aboard = (core: SimCore, vesselId: EntityId): CrewMember[] =>
	core.crew.members.filter((m) => vesselOfMember(core, m) === vesselId);

function seatsOf(core: SimCore, vesselId: EntityId): number {
	let seats = 0;
	for (const id of vesselOf(core, vesselId).parts) {
		seats += partDefOf(core, partOf(core, id)).crewCapacity ?? 0;
	}
	return seats;
}

/** People the vessel's scrubbers serve, and EC per served person per day (the dearest one's). */
function scrubbersOf(core: SimCore, vesselId: EntityId): { crew: number; charge: number } {
	let crew = 0;
	let charge = 0;
	for (const id of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, id).modules) {
			const hook = moduleDefOf(core, m.id).scrubber;
			if (!hook) continue;
			const s = hook(m.config);
			crew += s.crew;
			charge = Math.max(charge, s.charge);
		}
	}
	return { crew, charge };
}

/** Consumption rates per second for `n` people, and the scrubbing they need (ADR 0181 point 1). */
interface Rates {
	consumables: Array<{ resource: string; rate: number }>;
	/** `full` only: people served, EC per second while serving, and whether some go unserved. */
	scrub?: { served: number; charge: number; short: boolean };
}

function ratesOf(
	core: SimCore,
	vesselId: EntityId,
	mode: Exclude<LifeSupportMode, 'off'>,
	n: number
): Rates {
	const day = crewDay(core);
	const consumables = Object.entries(LIFE_SUPPORT_RATES[mode]).map(([resource, perDay]) => ({
		resource,
		rate: (n * perDay) / day
	}));
	if (mode !== 'full') return { consumables };
	const s = scrubbersOf(core, vesselId);
	const served = Math.min(n, s.crew);
	return { consumables, scrub: { served, charge: (served * s.charge) / day, short: s.crew < n } };
}

function startShortage(
	core: SimCore,
	vesselId: EntityId,
	members: CrewMember[],
	resource: string,
	time: number
): void {
	for (const m of members) {
		const list = (m.shortages ??= []);
		if (list.some((x) => x.resource === resource)) continue;
		list.push({ resource, since: time });
		core.events.emit('crew:shortage', { vessel: vesselId, member: m.id, resource, time });
		stopWarp(core, `the crew is short of ${resource}`);
	}
}

function endShortage(
	core: SimCore,
	vesselId: EntityId,
	members: CrewMember[],
	resource: string
): void {
	for (const m of members) {
		const i = m.shortages?.findIndex((x) => x.resource === resource) ?? -1;
		if (i < 0) continue;
		m.shortages!.splice(i, 1);
		if (m.shortages!.length === 0) delete m.shortages;
		core.events.emit('crew:resupplied', { vessel: vesselId, member: m.id, resource });
	}
}

/**
 * When the vessel's own rations run out (ADR 0323): from launch, each crewed part's seats times its
 * modules' `rations` crew-days (a stock pod: `POD_RATION_DAYS`), shared by the crew aboard. Infinite before launch (on the pad);
 * null without a command seat.
 */
export function rationsEnd(core: SimCore, vesselId: EntityId, crew: number): number | null {
	if (crew <= 0) return null;
	const vessel = vesselOf(core, vesselId);
	let crewDays = 0;
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		const seats = partDefOf(core, part).crewCapacity ?? 0;
		if (seats <= 0) continue;
		let perSeat = 0;
		for (const m of part.modules) {
			const def = moduleDefOf(core, m.id);
			if (def.rations) perSeat = Math.max(perSeat, def.rations(m.config));
		}
		crewDays += seats * perSeat;
	}
	if (crewDays <= 0) return null;
	if (vessel.launchedAt === undefined) return Number.POSITIVE_INFINITY;
	return vessel.launchedAt + (crewDays / crew) * crewDay(core);
}

/**
 * Life support of one vessel over [t0, t1] (ADR 0181 point 2): piecewise linear, cut at each
 * run-out, so a run-out is dated exactly whatever the step.
 */
function lifeSupport(
	core: SimCore,
	vesselId: EntityId,
	members: CrewMember[],
	mode: Exclude<LifeSupportMode, 'off'>,
	t0: number,
	t1: number
): void {
	if (cheatOn(core, 'infinite-life-support')) {
		// a cheat (plan 203): nothing is used up and no shortage runs
		for (const m of members) delete m.shortages;
		return;
	}
	// the pod's own rations come first (ADR 0323): nothing is drawn, nothing runs short
	const rations = rationsEnd(core, vesselId, members.length);
	if (rations !== null && rations >= t1) {
		for (const m of members) delete m.shortages;
		return;
	}
	if (rations !== null && rations > t0) t0 = rations;
	const vessel = vesselOf(core, vesselId);
	const root = vessel.root;
	const rates = ratesOf(core, vesselId, mode, members.length);
	const amount = new Map<string, number>();
	for (const c of rates.consumables)
		amount.set(c.resource, amountAvailable(core, vessel, root, c.resource));
	let charge = rates.scrub ? amountAvailable(core, vessel, root, CHARGE_RESOURCE) : 0;
	// Out from the start: the shortage began at t0 at the latest.
	for (const c of rates.consumables) {
		if (amount.get(c.resource)! <= EMPTY) startShortage(core, vesselId, members, c.resource, t0);
		else endShortage(core, vesselId, members, c.resource);
	}
	const scrubbing = () =>
		!rates.scrub || (!rates.scrub.short && (rates.scrub.charge === 0 || charge > EMPTY));
	if (rates.scrub) {
		if (scrubbing()) endShortage(core, vesselId, members, CO2);
		else startShortage(core, vesselId, members, CO2, t0);
	}
	let t = t0;
	while (t < t1) {
		let next = t1;
		for (const c of rates.consumables) {
			const a = amount.get(c.resource)!;
			if (a > EMPTY && c.rate > 0) next = Math.min(next, t + a / c.rate);
		}
		const draw = rates.scrub && rates.scrub.charge > 0 && charge > EMPTY ? rates.scrub.charge : 0;
		if (draw > 0) next = Math.min(next, t + charge / draw);
		const dt = next - t;
		for (const c of rates.consumables) {
			const a = amount.get(c.resource)!;
			if (a <= EMPTY || c.rate <= 0) continue;
			const take = Math.min(a, c.rate * dt);
			withdrawResource(core, vessel, root, c.resource, take);
			const left = next >= t + a / c.rate ? 0 : a - take;
			amount.set(c.resource, left);
			if (left <= EMPTY) startShortage(core, vesselId, members, c.resource, t + a / c.rate);
		}
		if (draw > 0) {
			const runOut = t + charge / draw;
			withdrawResource(core, vessel, root, CHARGE_RESOURCE, Math.min(charge, draw * dt));
			charge = next >= runOut ? 0 : charge - draw * dt;
			if (charge <= EMPTY) startShortage(core, vesselId, members, CO2, runOut);
		}
		if (dt <= 0) break;
		t = next;
	}
	// Past the grace, the death rule (ADR 0181 point 3).
	const day = crewDay(core);
	const death = deathRule(core);
	if (death === 'off') return;
	for (const m of members) {
		const fatal = m.shortages?.some((s) => s.since + graceSeconds(s.resource, day) <= t1);
		if (fatal) loseMember(core, m, vesselId, death);
	}
}

/** Morale, fatigue and dose of the members aboard over [t0, t1] (ADR 0181 points 4 to 7). */
function condition(
	core: SimCore,
	vesselId: EntityId,
	members: CrewMember[],
	t0: number,
	t1: number
): void {
	const dt = t1 - t0;
	const day = crewDay(core);
	const vessel = vesselOf(core, vesselId);
	if (ruleOf(core, CREW_SIM_RULES.morale) === true) {
		const crowding = members.length / Math.max(1, seatsOf(core, vesselId));
		for (const m of members) {
			const days = ((t0 + t1) / 2 - (m.boardedAt ?? t0)) / day;
			const target = moraleTarget(Math.max(0, days), crowding, (m.shortages?.length ?? 0) > 0);
			m.morale = moraleAfter(m.morale ?? 1, target, dt, day);
		}
	}
	if (ruleOf(core, CREW_SIM_RULES.rest) === true) {
		const working = vessel.mode === 'flight';
		for (const m of members) m.fatigue = fatigueAfter(m.fatigue ?? 0, working, dt, day);
	}
	if (ruleOf(core, CREW_SIM_RULES.exposure) === true) {
		const rate = doseRate(core, vesselId);
		for (const m of members) m.dose = (m.dose ?? 0) + rate * dt;
	}
}

function doseRate(core: SimCore, vesselId: EntityId): number {
	const vessel = vesselOf(core, vesselId);
	const body = bodyOfVessel(core, vessel);
	const home = body.def.id === core.root.def.id;
	const landed = vessel.landed || vessel.rails?.kind === 'surface';
	if (home && landed) return 0;
	const altitude = length(motionOf(core, vessel).r) - body.def.radius;
	if (body.def.atmosphere && altitude < body.def.atmosphere.height) return 0;
	return home ? DOSE_RATE_HOME : DOSE_RATE_DEEP;
}

/** G-load of a flight vessel's crew over the step that ended at `t1` (ADR 0181 point 7). */
function gLoad(core: SimCore, vesselId: EntityId, members: CrewMember[], t1: number): void {
	const vessel = vesselOf(core, vesselId);
	const last = core.life.velocity.get(vesselId);
	core.life.velocity.set(vesselId, { soi: vessel.soi, v: vessel.velocity, t: t1 });
	if (!last || last.soi !== vessel.soi || t1 <= last.t) return;
	const dt = t1 - last.t;
	const body = bodyOfVessel(core, vessel);
	const r = vessel.com;
	const d = length(r);
	const gravity = scale(r, -body.mu / (d * d * d));
	const proper =
		length(sub(scale(sub(vessel.velocity, last.v), 1 / dt), gravity)) / STANDARD_GRAVITY;
	for (const m of members) {
		const tolerance = abilitiesOf(m, core.registries.crewTraits).gTolerance ?? 1;
		const limit = G_LIMIT * tolerance;
		let s = m.gStress ?? 0;
		s = proper > limit ? s + (proper - limit) * dt : Math.max(0, s - G_STRESS_DRAIN * dt);
		if (s >= G_LOC_STRESS && !(m.glocUntil !== undefined && m.glocUntil > t1)) {
			m.glocUntil = t1 + G_LOC_SECONDS;
			s = 0;
			core.events.emit('crew:g-loc', { vessel: vesselId, member: m.id, until: m.glocUntil });
		}
		if (s > 0) m.gStress = s;
		else delete m.gStress;
	}
}

/**
 * The crew simulation over [t0, core.t]: after every flight step (`flight`) and rails chunk. A
 * no-op without crew aboard.
 */
export function updateCrewLife(core: SimCore, t0: number, flight: boolean): void {
	const t1 = core.t;
	if (t1 <= t0 || core.crew.members.length === 0) return;
	const mode = lifeSupportMode(core);
	const exposure = ruleOf(core, CREW_SIM_RULES.exposure) === true;
	for (const id of vesselIds(core)) {
		const members = aboard(core, id);
		if (members.length === 0) {
			core.life.velocity.delete(id);
			continue;
		}
		if (mode !== 'off') lifeSupport(core, id, members, mode, t0, t1);
		const still = aboard(core, id);
		if (still.length === 0) continue;
		condition(core, id, still, t0, t1);
		if (flight && exposure && vesselOf(core, id).mode === 'flight') gLoad(core, id, still, t1);
		else core.life.velocity.delete(id);
	}
}

/** `VesselSnapshot.lifeSupport` (ADR 0181 point 8), or undefined with it off or nobody aboard. */
export function lifeSupportSnapshot(
	core: SimCore,
	vesselId: EntityId
): VesselSnapshot['lifeSupport'] {
	const mode = lifeSupportMode(core);
	if (mode === 'off') return undefined;
	const n = aboard(core, vesselId).length;
	if (n === 0) return undefined;
	const vessel = vesselOf(core, vesselId);
	const rates = ratesOf(core, vesselId, mode, n);
	const end = rationsEnd(core, vesselId, n);
	const rationsLeft = end === null ? 0 : Math.max(0, end - core.t);
	const consumables = rates.consumables.map(({ resource, rate }) => {
		const amount = amountAvailable(core, vessel, vessel.root, resource);
		return {
			resource,
			amount,
			rate,
			timeLeft: rationsLeft + (rate > 0 ? amount / rate : Infinity)
		};
	});
	if (rates.scrub) {
		const amount = amountAvailable(core, vessel, vessel.root, CHARGE_RESOURCE);
		const rate = rates.scrub.charge;
		const timeLeft = rationsLeft + (rates.scrub.short ? 0 : rate > 0 ? amount / rate : Infinity);
		consumables.push({ resource: CO2, amount, rate, timeLeft });
	}
	return { mode, crew: n, consumables, ...(end === null ? {} : { rationsLeft }) };
}

/** The condition fields of a member for `VesselSnapshot.crew`, and the performance factor. */
export function conditionSnapshot(m: CrewMember): {
	performance: number;
	fields: Partial<NonNullable<VesselSnapshot['crew']>[number]>;
} {
	const performance = performanceOf(m.morale ?? 1, m.fatigue ?? 0);
	return {
		performance,
		fields: {
			...(m.morale === undefined ? {} : { morale: m.morale }),
			...(m.fatigue === undefined ? {} : { fatigue: m.fatigue }),
			...(m.dose === undefined ? {} : { dose: m.dose }),
			...(m.shortages ? { shortages: m.shortages.map((s) => ({ ...s })) } : {}),
			...(m.glocUntil === undefined ? {} : { glocUntil: m.glocUntil }),
			performance
		}
	};
}
