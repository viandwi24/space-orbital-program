/**
 * Discovery science in the sim (plan 129, ADR 0192): measurements on science results, datasets
 * from credited data, lab processing and the review of claims on the world tick, the snapshot and
 * the save. Nothing here runs with `stock.science-depth` `classic`.
 */
import {
	DISCOVERY_CAUSE,
	DISCOVERY_MIN_CONFIDENCE,
	DISCOVERY_ON,
	DISCOVERY_PROCESS_DAYS,
	DISCOVERY_REVIEW_DAYS,
	DISCOVERY_RULE,
	LEVEL_ERROR,
	capacityUpgrade,
	createRng,
	factValue,
	measurementKey,
	nextLevel,
	normal,
	reviewScore,
	siteCapacity,
	sitesOf,
	streamSeed,
	type CommandResult,
	type DataItem,
	type DiscoveryFactDefinition,
	type DiscoveryFactView,
	type DiscoverySnapshot,
	type SaveDiscovery
} from '@orbital/core';
import type { SimCore } from './core.ts';
import { economyOn, record, ruleOf } from './economy.ts';
import { dayLength } from './tick.ts';

export const freshDiscovery = (core: Pick<SimCore, 'info'>): SaveDiscovery => ({
	rng: streamSeed(core.info.seed, 'discovery'),
	next: 1,
	data: [],
	claims: []
});

/** Whether there is anything to save. */
export const discoveryTouched = (core: Pick<SimCore, 'discovery' | 'info'>): boolean =>
	core.discovery.next > 1 || core.discovery.rng !== streamSeed(core.info.seed, 'discovery');

export const discoveryOn = (core: SimCore): boolean =>
	ruleOf(core, DISCOVERY_RULE) === DISCOVERY_ON;

/** Bodies that carry facts: every body but a star, by id. */
const factBodies = (core: SimCore): string[] =>
	[...core.bodies.values()]
		.filter((b) => b.def.star !== true)
		.map((b) => String(b.def.id))
		.sort();

/** The hidden value of a fact (ADR 0192 point 2); never in the snapshot while it is open. */
export const truthOf = (core: SimCore, body: string, fact: DiscoveryFactDefinition): number =>
	factValue(core.info.seed, body, fact);

/**
 * The measurements a result of `experiment` on `body` carries (ADR 0192 point 3): one per kind it
 * is an instrument of, truth + resolution × N(0, 1) from the `discovery` stream, floored at 0.
 */
export function measure(
	core: SimCore,
	experiment: string,
	body: string
): Record<string, number> | undefined {
	if (!discoveryOn(core) || core.registries.bodies.get(body)?.star === true) return undefined;
	const kinds = core.registries.discoveryFacts
		.list()
		.filter((k) => k.instruments.includes(experiment));
	if (kinds.length === 0) return undefined;
	const rng = createRng(core.discovery.rng);
	const meta: Record<string, number> = {};
	for (const k of kinds) {
		meta[measurementKey(k.id)] = Math.max(0, truthOf(core, body, k) + k.resolution * normal(rng));
	}
	core.discovery.rng = rng.state();
	return meta;
}

/** A credited item's measurements become raw datasets (ADR 0192 point 4). */
export function intakeData(core: SimCore, item: Pick<DataItem, 'subject' | 'meta'>): void {
	if (!discoveryOn(core) || item.subject === undefined || !item.meta) return;
	const body = core.science.subjects.get(item.subject)?.body;
	if (body === undefined) return;
	for (const k of core.registries.discoveryFacts.list()) {
		const value = item.meta[measurementKey(k.id)];
		if (typeof value !== 'number') continue;
		const d = core.discovery;
		d.data.push({
			id: `d${d.next++}`,
			body,
			fact: k.id,
			level: 'raw',
			value,
			sigma: k.resolution
		});
	}
}

/** Datasets the lab may process at once: the primary site's `lab` capacity; null = no limit. */
export function labSlots(core: SimCore): number | null {
	const site = sitesOf(core.info)[0];
	return site ? siteCapacity(site, core.registries.buildings, 'lab') : null;
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const OFF = 'Discovery science is off (stock.science-depth is classic)';

/** `discovery-process` (ADR 0192 point 5). */
export function processDataset(core: SimCore, id: string): CommandResult {
	if (!discoveryOn(core)) return refuse(OFF);
	const d = core.discovery;
	const set = d.data.find((x) => x.id === id);
	if (!set) return refuse(`no dataset "${id}"`);
	if (set.processing) return refuse(`dataset "${id}" is already in the lab`);
	const to = nextLevel(set.level);
	if (!to) return refuse(`dataset "${id}" is already derived`);
	const slots = labSlots(core);
	const busy = d.data.filter((x) => x.processing).length;
	if (slots !== null && busy >= slots) {
		const lift = capacityUpgrade(core.registries.buildings, 'lab', busy + 1);
		return refuse(
			slots === 0
				? `There is no lab${lift ? `; ${lift.text}` : ''}`
				: `All ${slots} lab slots are in use${lift ? `; ${lift.text}` : ''}`
		);
	}
	set.processing = { to, until: core.t + DISCOVERY_PROCESS_DAYS[to] * dayLength(core) };
	return { ok: true };
}

/** `discovery-claim` (ADR 0192 point 6). */
export function claimFact(
	core: SimCore,
	body: string,
	fact: string,
	value: number,
	confidence: number
): CommandResult {
	if (!discoveryOn(core)) return refuse(OFF);
	const kind = core.registries.discoveryFacts.get(fact);
	if (!kind) return refuse(`no fact kind "${fact}"`);
	if (!factBodies(core).includes(body)) return refuse(`no body "${body}" with facts`);
	if (!(confidence >= DISCOVERY_MIN_CONFIDENCE && confidence <= 1)) {
		return refuse(`confidence must be in [${DISCOVERY_MIN_CONFIDENCE}, 1], got ${confidence}`);
	}
	if (!(Number.isFinite(value) && value >= 0)) return refuse(`value must be >= 0, got ${value}`);
	const d = core.discovery;
	if (d.claims.some((c) => c.body === body && c.fact === fact && c.verdict === undefined)) {
		return refuse(`a claim of ${kind.label} on this body is already in review`);
	}
	d.claims.push({
		id: `c${d.next++}`,
		body,
		fact,
		value,
		confidence,
		made: core.t,
		due: core.t + DISCOVERY_REVIEW_DAYS * dayLength(core)
	});
	return { ok: true };
}

/** Lab work done and claims judged on the tick at `time` (ADR 0192 points 5 and 6). */
export function discoveryTick(core: SimCore, time: number): void {
	if (!discoveryOn(core)) return;
	const d = core.discovery;
	for (const set of d.data) {
		if (!set.processing || set.processing.until > time) continue;
		const kind = core.registries.discoveryFacts.get(set.fact);
		const to = set.processing.to;
		delete set.processing;
		if (!kind) continue;
		const truth = truthOf(core, set.body, kind);
		const sigma = kind.resolution * LEVEL_ERROR[to];
		set.value = truth + (set.value - truth) * (sigma / set.sigma);
		set.sigma = sigma;
		set.level = to;
	}
	for (const claim of d.claims) {
		if (claim.verdict !== undefined || claim.due > time) continue;
		const kind = core.registries.discoveryFacts.get(claim.fact);
		if (!kind) continue;
		const correct = Math.abs(claim.value - truthOf(core, claim.body, kind)) <= kind.tolerance;
		const first =
			correct &&
			!d.claims.some((c) => c.body === claim.body && c.fact === claim.fact && c.priority);
		const change = reviewScore(correct, claim.confidence, first);
		claim.verdict = correct ? 'accepted' : 'rejected';
		if (first) claim.priority = true;
		claim.reputation = change;
		if (economyOn(core) && change !== 0)
			record(core, 'reputation', change, DISCOVERY_CAUSE, claim.id);
		core.events.emit('discovery:reviewed', {
			claim: claim.id,
			body: claim.body,
			fact: claim.fact,
			verdict: claim.verdict,
			reputation: change
		});
	}
}

/** `Snapshot.discovery`, with discovery on (ADR 0192 point 8). */
export function discoverySnapshot(core: SimCore): DiscoverySnapshot | undefined {
	if (!discoveryOn(core)) return undefined;
	const d = core.discovery;
	const kinds = core.registries.discoveryFacts.list();
	const facts: DiscoveryFactView[] = [];
	for (const body of factBodies(core)) {
		for (const k of kinds) {
			const won = d.claims.find((c) => c.body === body && c.fact === k.id && c.priority);
			facts.push({
				body,
				fact: k.id,
				label: k.label,
				unit: k.unit,
				tolerance: k.tolerance,
				status: won ? 'settled' : 'open',
				...(won ? { value: won.value } : {})
			});
		}
	}
	return {
		facts,
		data: d.data.map((x) => ({
			...x,
			...(x.processing ? { processing: { ...x.processing } } : {})
		})),
		claims: d.claims.map((c) => ({ ...c })),
		labSlots: labSlots(core),
		processing: d.data.filter((x) => x.processing).length
	};
}
