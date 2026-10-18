/**
 * Body dossiers (plan 104, ADR 0180 points 4 to 7): entries as data, unlocked by science subjects,
 * with facts from the body definition. Derived, never saved.
 */
import * as z from 'zod';
import type { BodyDefinition } from './definitions.ts';
import type { DiscoverySnapshot } from './discovery.ts';
import { regionsOf } from './regions.ts';
import { definitionIdSchema } from './schemas.ts';
import { GLOBAL_REGION, type ScienceSubject } from './science.ts';
import { GRAVITATIONAL_CONSTANT } from './units.ts';

export const DOSSIER_FACTS = ['atmosphere', 'gravity', 'surface', 'regions', 'resources'] as const;
export type DossierFact = (typeof DOSSIER_FACTS)[number];

export interface DossierEntryDefinition {
	/** `<plugin>.<name>`. */
	id: string;
	label: string;
	/** Lower first. */
	order: number;
	fact: DossierFact;
	/** A subject on the body with a result unlocks it when it matches both lists that are given. */
	unlock: { situations?: readonly string[]; experiments?: readonly string[] };
}

export const dossierEntryDefinitionSchema = z.object({
	id: definitionIdSchema,
	label: z.string().min(1),
	order: z.number(),
	fact: z.enum(DOSSIER_FACTS),
	unlock: z.object({
		situations: z.array(z.string().min(1)).min(1).optional(),
		experiments: z.array(z.string().min(1)).min(1).optional()
	})
});

/** One line of an entry: a label and its value as text with units. */
export interface DossierLine {
	label: string;
	value: string;
}

export interface DossierEntry {
	id: string;
	label: string;
	fact: DossierFact;
	unlocked: boolean;
	/** The facts when unlocked, else empty. */
	lines: DossierLine[];
	/** What unlocks it, for a locked entry. */
	needs: string;
}

export interface Dossier {
	body: string;
	entries: DossierEntry[];
	/** Discovery facts, data and claims (plan 129, ADR 0192 point 10); with discovery on. */
	discovery?: DossierDiscovery;
}

/** A fact of the body in the dossier: open or settled, and the best data in hand. */
export interface DossierDiscoveryFact {
	fact: string;
	label: string;
	status: 'open' | 'settled';
	/** The settled value, or "unknown". */
	value: string;
	/** The most precise dataset, "24.1 ± 3 μT · calibrated"; null without data. */
	best: string | null;
	/** Datasets of it in the lab now. */
	processing: number;
	/** The dataset to process next (the most precise one not derived nor in the lab); null = none. */
	next: string | null;
}

export interface DossierClaim {
	id: string;
	label: string;
	value: string;
	confidence: string;
	verdict: 'in review' | 'accepted' | 'rejected';
	priority: boolean;
	/** "+19.2" once reviewed; null in review. */
	reputation: string | null;
}

export interface DossierDiscovery {
	facts: DossierDiscoveryFact[];
	claims: DossierClaim[];
}

const num = (v: number, digits = 3): string =>
	Number(v.toPrecision(digits)).toLocaleString('en-US');

function lines(
	fact: DossierFact,
	body: BodyDefinition,
	subjects: readonly Pick<ScienceSubject, 'region'>[]
): DossierLine[] {
	switch (fact) {
		case 'atmosphere': {
			const a = body.atmosphere;
			if (!a) return [{ label: 'Atmosphere', value: 'none' }];
			return [
				{ label: 'Height', value: `${num(a.height / 1000)} km` },
				{ label: 'Surface pressure', value: `${num(a.surfacePressure / 1000)} kPa` },
				{ label: 'Scale height', value: `${num(a.scaleHeight / 1000)} km` }
			];
		}
		case 'gravity': {
			const mu = GRAVITATIONAL_CONSTANT * body.mass;
			return [
				{ label: 'Surface gravity', value: `${num(mu / body.radius ** 2)} m/s²` },
				{ label: 'Radius', value: `${num(body.radius / 1000)} km` },
				{ label: 'μ', value: `${mu.toExponential(3)} m³/s²` }
			];
		}
		case 'surface':
			return [
				{ label: 'Ground', value: body.terrain?.kind ?? 'smooth' },
				{ label: 'Day', value: `${num(body.rotationPeriod / 3600)} h` }
			];
		case 'regions': {
			const all = regionsOf(body).filter((r) => r.id !== GLOBAL_REGION);
			const found = all.filter((r) => subjects.some((s) => s.region === r.id));
			return [
				{ label: 'Found', value: `${found.length} of ${all.length}` },
				...(found.length > 0
					? [{ label: 'Regions', value: found.map((r) => r.label).join(', ') }]
					: [])
			];
		}
		case 'resources':
			return [{ label: 'Hint', value: 'no resources are known on this body yet' }];
	}
}

const needsText = (e: DossierEntryDefinition, labelOf: (id: string) => string): string => {
	const parts: string[] = [];
	if (e.unlock.experiments) parts.push(e.unlock.experiments.map(labelOf).join(' or '));
	if (e.unlock.situations) parts.push(`while ${e.unlock.situations.map(labelOf).join(' or ')}`);
	return parts.length > 0 ? `a result ${parts.join(' ')}` : 'any result here';
};

/**
 * The dossier of `body` from the world's subjects (ADR 0180 point 4). `labelOf` names situations
 * and experiments for the locked entries (default the id).
 */
export function dossierOf(
	body: BodyDefinition,
	subjects: readonly Pick<
		ScienceSubject,
		'body' | 'situation' | 'experiment' | 'region' | 'count'
	>[],
	entries: readonly DossierEntryDefinition[],
	labelOf: (id: string) => string = (id) => id
): Dossier {
	const here = subjects.filter((s) => s.body === body.id && s.count > 0);
	return {
		body: body.id,
		entries: [...entries]
			.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
			.map((e) => {
				const unlocked = here.some(
					(s) =>
						(!e.unlock.situations || e.unlock.situations.includes(s.situation)) &&
						(!e.unlock.experiments || e.unlock.experiments.includes(s.experiment))
				);
				return {
					id: e.id,
					label: e.label,
					fact: e.fact,
					unlocked,
					lines: unlocked ? lines(e.fact, body, here) : [],
					needs: unlocked ? '' : needsText(e, labelOf)
				};
			})
	};
}

const withUnit = (v: number, unit: string): string => `${num(v)}${unit ? ` ${unit}` : ''}`;

/** The Discovery part of `body`'s dossier from `Snapshot.discovery` (plan 129, ADR 0192 point 10). */
export function discoveryDossier(body: string, snap: DiscoverySnapshot): DossierDiscovery {
	const facts = snap.facts.filter((f) => f.body === body);
	const unitOf = new Map(facts.map((f) => [f.fact, f.unit]));
	const labelOf = new Map(facts.map((f) => [f.fact, f.label]));
	return {
		facts: facts.map((f) => {
			const data = snap.data.filter((d) => d.body === body && d.fact === f.fact);
			const best = [...data].sort((a, b) => a.sigma - b.sigma)[0];
			return {
				fact: f.fact,
				label: f.label,
				status: f.status,
				value:
					f.value === undefined ? 'unknown' : f.value === 0 ? 'none' : withUnit(f.value, f.unit),
				best: best ? `${num(best.value)} ± ${withUnit(best.sigma, f.unit)} · ${best.level}` : null,
				processing: data.filter((d) => d.processing).length,
				next:
					data
						.filter((d) => !d.processing && d.level !== 'derived')
						.sort((a, b) => a.sigma - b.sigma)[0]?.id ?? null
			};
		}),
		claims: snap.claims
			.filter((c) => c.body === body)
			.map((c) => ({
				id: c.id,
				label: labelOf.get(c.fact) ?? c.fact,
				value: c.value === 0 ? 'none' : withUnit(c.value, unitOf.get(c.fact) ?? ''),
				confidence: `${Math.round(c.confidence * 100)}%`,
				verdict: c.verdict ?? 'in review',
				priority: c.priority === true,
				reputation:
					c.reputation === undefined
						? null
						: `${c.reputation >= 0 ? '+' : '−'}${num(Math.abs(c.reputation))}`
			}))
	};
}
