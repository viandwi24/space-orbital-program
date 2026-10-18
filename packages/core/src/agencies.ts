/**
 * AI agencies (plan 126, ADRs 0096 point 4 and 0190): their definitions and missions, the saved
 * state of each running agency, rentals and news, and the snapshot. Plain data; environment-neutral.
 */
import * as z from 'zod';
import { definitionIdSchema } from './schemas.ts';

/** Objects an agency keeps at once; the oldest deorbits for a new one (ADR 0190 point 3). */
export const AGENCY_MAX_OBJECTS = 2;
/** News items kept. */
export const AGENCY_NEWS = 50;
/** Days a reactive contract gives (ADR 0190 point 5). */
export const AGENCY_CONTRACT_DAYS = 30;
/** Ledger cause of a relay's daily rent. */
export const AGENCY_RENT_CAUSE = 'agency.rent';
/** The rule that sets how many agencies run. */
export const AGENCY_COUNT_RULE = 'stock.agency-count';

export interface AgencyMission {
	/** Unique within the agency. */
	id: string;
	kind: 'satellite' | 'relay';
	/** Circular orbit altitude over the home body, m. */
	altitude: number;
	/** rad (default 0). */
	inclination?: number;
	/** Funds. */
	cost: number;
	/** 0..1 before the agency's risk. */
	success: number;
	/** Days to prepare the next one at aggressiveness 0.5. */
	prepDays: number;
	/** Days the object works. */
	lifeDays: number;
	/** A relay's rent to the player, funds per day. */
	rent?: number;
}

export interface AgencyDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	name: string;
	personality: { aggressiveness: number; risk: number };
	budget: { start: number; monthly: number };
	/** Flown in order, then again from the start. */
	programme: AgencyMission[];
}

const unit = z.number().min(0).max(1);
const finite = z.number().refine(Number.isFinite, 'must be finite');

export const agencyMissionSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(['satellite', 'relay']),
	altitude: z.number().positive(),
	inclination: finite.optional(),
	cost: z.number().nonnegative(),
	success: unit,
	prepDays: z.number().positive(),
	lifeDays: z.number().positive(),
	rent: z.number().nonnegative().optional()
});

export const agencyDefinitionSchema = z.object({
	id: definitionIdSchema,
	name: z.string().min(1),
	personality: z.object({ aggressiveness: unit, risk: unit }),
	budget: z.object({ start: z.number().nonnegative(), monthly: z.number().nonnegative() }),
	programme: z.array(agencyMissionSchema).min(1)
});

/** One running agency (ADR 0190 point 7). */
export interface SaveAgency {
	id: string;
	funds: number;
	reputation: number;
	/** Index of the next mission in the programme. */
	next: number;
	/** World-tick day it may launch. */
	readyDay: number;
	/** 32-bit stream state. */
	rng: number;
	objects: Array<{ vessel: number; mission: string; until: number }>;
}

export interface SaveAgencies {
	agencies: SaveAgency[];
	rentals: Array<{ vessel: number; agency: string; rent: number }>;
	news: Array<{ time: number; agency: string; text: string }>;
}

export const saveAgenciesSchema = z.object({
	agencies: z.array(
		z.object({
			id: definitionIdSchema,
			funds: finite,
			reputation: finite,
			next: z.int().min(0),
			readyDay: z.int(),
			rng: z.int().min(0).max(0xffffffff),
			objects: z.array(z.object({ vessel: z.int(), mission: z.string(), until: finite }))
		})
	),
	rentals: z.array(z.object({ vessel: z.int(), agency: definitionIdSchema, rent: finite })),
	news: z.array(z.object({ time: finite, agency: definitionIdSchema, text: z.string() }))
});

/** `Snapshot.agencies` (ADR 0190 point 6). */
export interface AgenciesSnapshot {
	agencies: Array<{
		id: string;
		name: string;
		funds: number;
		reputation: number;
		/** Owned vessels and what each is for, with its rent when it is a relay. */
		objects: Array<{
			vessel: number;
			kind: 'satellite' | 'relay';
			rent: number | null;
			rented: boolean;
		}>;
		/** The day its next mission may fly. */
		nextDay: number;
	}>;
	/** Newest first. */
	news: Array<{ time: number; agency: string; name: string; text: string }>;
}
