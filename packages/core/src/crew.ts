/**
 * Crew core (plan 106, ADRs 0100 and 0176): professions, traits as data, abilities as quality
 * factors, names from syllables, places and XP. Plain data and pure functions; environment-neutral.
 */
import * as z from 'zod';
import type { Rng } from './rng.ts';
import { definitionIdSchema } from './schemas.ts';

export const PROFESSIONS = ['pilot', 'engineer', 'scientist', 'tourist'] as const;
export type Profession = (typeof PROFESSIONS)[number];

/**
 * Ability keys (ADR 0176 point 6): every one is a quality factor (1 = no effect). None names a
 * flight tool: abilities change how well something works, never whether it exists (ADR 0098).
 */
export const ABILITY_KEYS = [
	'controlSmoothing',
	'scriptBudget',
	'repairRate',
	'dataQuality',
	'gTolerance',
	'panicResistance'
] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type Abilities = Record<AbilityKey, number>;

/** Flight tools that no ability may gate (asserted by a test). */
export const FLIGHT_TOOLS = [
	'sas',
	'maneuver-nodes',
	'map',
	'target',
	'scripts',
	'staging',
	'time-warp',
	'trajectory'
] as const;

export interface CrewTraitDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Factors multiplied into the member's abilities, on ability keys only. */
	abilities: Partial<Abilities>;
	/** Relative chance of the trait at hiring (default 1). */
	weight?: number;
}

export interface CrewNamesDefinition {
	id: string;
	/** Syllables of a first name (two are drawn) and a last name (two or three). */
	first: string[];
	last: string[];
}

const factor = z.number().positive().max(10);

export const crewTraitDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	abilities: z.partialRecord(z.enum(ABILITY_KEYS), factor),
	weight: z.number().positive().optional()
});

export const crewNamesDefinitionSchema = z.object({
	id: definitionIdSchema,
	first: z.array(z.string().min(1)).min(2),
	last: z.array(z.string().min(1)).min(2)
});

export type CrewStatus = 'available' | 'assigned' | 'missing' | 'lost';

export interface CrewMember {
	/** `c<n>`. */
	id: string;
	name: string;
	profession: Profession;
	traits: string[];
	xp: number;
	level: number;
	status: CrewStatus;
	/** Where the member sits while `assigned`. */
	location?: { vessel: number; part: number };
	/** Sim time a `missing` member comes back. */
	returnsAt?: number;
	/** Places of the current flight (ADR 0176 point 4). */
	places: string[];
	/** Places already booked, ever. */
	visited: string[];
	/** Booked XP, oldest first. */
	log: Array<{ time: number; place: string; xp: number }>;
	/** Crew simulation (plan 107, ADR 0181); absent until the aspect is on and the member flies. */
	morale?: number;
	fatigue?: number;
	/** Radiation dose, mSv. */
	dose?: number;
	/** G-load stress, g·s, and the end of a blackout. */
	gStress?: number;
	glocUntil?: number;
	/** Since when each consumable has been out. */
	shortages?: Array<{ resource: string; since: number }>;
	/** Sim time the member was seated on the current flight. */
	boardedAt?: number;
}

/** `SimSave.crew` (optional in format 5, ADR 0176 point 1). */
export interface SaveCrew {
	next: number;
	/** State of the world's `crew` PRNG stream. */
	rng: number;
	members: CrewMember[];
}

export const saveCrewSchema = z.object({
	next: z.int().min(1),
	rng: z.int().min(0).max(0xffffffff),
	members: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string().min(1),
			profession: z.enum(PROFESSIONS),
			traits: z.array(z.string()),
			xp: z.number().nonnegative(),
			level: z.int().min(0),
			status: z.enum(['available', 'assigned', 'missing', 'lost']),
			location: z.object({ vessel: z.int(), part: z.int() }).optional(),
			returnsAt: z.number().optional(),
			places: z.array(z.string()),
			visited: z.array(z.string()),
			log: z.array(z.object({ time: z.number(), place: z.string(), xp: z.number() })),
			morale: z.number().min(0).max(1).optional(),
			fatigue: z.number().min(0).max(1).optional(),
			dose: z.number().nonnegative().optional(),
			gStress: z.number().nonnegative().optional(),
			glocUntil: z.number().optional(),
			shortages: z.array(z.object({ resource: z.string().min(1), since: z.number() })).optional(),
			boardedAt: z.number().optional()
		})
	)
});

/** Base factors per profession at level 0, and the gain per level (ADR 0176 point 6). */
const PROFESSION_BASE: Record<Profession, Partial<Abilities>> = {
	pilot: { controlSmoothing: 1.1, scriptBudget: 1.1 },
	engineer: { repairRate: 1.1 },
	scientist: { dataQuality: 1.1 },
	tourist: {}
};
const PER_LEVEL = 0.05;

/** The member's ability factors: profession × level, then each trait's factors multiplied in. */
export function abilitiesOf(
	member: Pick<CrewMember, 'profession' | 'level' | 'traits'>,
	traits: { get(id: string): CrewTraitDefinition | undefined }
): Abilities {
	const out = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 1])) as Abilities;
	for (const [k, base] of Object.entries(PROFESSION_BASE[member.profession]) as [
		AbilityKey,
		number
	][]) {
		out[k] = base + PER_LEVEL * member.level;
	}
	for (const id of member.traits) {
		for (const [k, f] of Object.entries(traits.get(id)?.abilities ?? {}) as [AbilityKey, number][])
			out[k] *= f;
	}
	return out;
}

/** XP per place kind and body (ADR 0176 point 5). */
export const PLACE_XP = { flyby: 1, orbit: 1.5, landed: 2.3 } as const;
export const OTHER_BODY_FACTOR = 2;
export const LEVEL_THRESHOLDS = [2, 8, 16, 32, 64] as const;

export function placeXp(place: string, home: string): number {
	const [kind, body] = place.split(':') as [keyof typeof PLACE_XP, string];
	const base = PLACE_XP[kind];
	if (base === undefined || body === undefined) return 0;
	return base * (body === home ? 1 : OTHER_BODY_FACTOR);
}

export const levelOf = (xp: number): number => LEVEL_THRESHOLDS.filter((t) => xp >= t).length;

/** Daily salary in funds (ADR 0176 point 8); recruiting costs `RECRUIT_DAYS` days of the base. */
export const SALARY_BASE: Record<Profession, number> = {
	pilot: 400,
	engineer: 400,
	scientist: 450,
	tourist: 0
};
export const RECRUIT_DAYS = 20;
export const salaryOf = (m: Pick<CrewMember, 'profession' | 'level'>): number =>
	SALARY_BASE[m.profession] * (1 + 0.25 * m.level);

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A name from syllable lists (ADR 0176 point 2): two first syllables, two or three last ones. */
export function generateCrewName(names: CrewNamesDefinition, rng: Rng): string {
	const pick = (list: readonly string[]) => list[rng.int(0, list.length - 1)]!;
	const first = pick(names.first) + pick(names.first);
	const lastCount = rng.int(2, 3);
	let last = '';
	for (let i = 0; i < lastCount; i++) last += pick(names.last);
	return `${capitalize(first)} ${capitalize(last)}`;
}

/** One or two distinct traits by weight, or none when no trait is registered. */
export function drawTraits(traits: readonly CrewTraitDefinition[], rng: Rng): string[] {
	if (traits.length === 0) return [];
	const count = Math.min(traits.length, rng.int(1, 2));
	const pool = [...traits];
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const total = pool.reduce((s, t) => s + (t.weight ?? 1), 0);
		let x = rng.next() * total;
		let idx = 0;
		while (idx < pool.length - 1 && (x -= pool[idx]!.weight ?? 1) >= 0) idx++;
		out.push(pool[idx]!.id);
		pool.splice(idx, 1);
	}
	return out;
}
