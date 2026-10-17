/**
 * Science in the world (plan 103, ADR 0178): the situation cache, subjects, results and credit.
 * Subjects live beside the ECS world (ADR 0110) and save as `SimSave.science`.
 */
import {
	bodyScience,
	GLOBAL_REGION,
	nextValue,
	regionAt,
	regionMultiplier,
	sitesOf,
	terrainSeedOf,
	zonesOf,
	SCIENCE_RULES,
	sortSituations,
	subjectCap,
	subjectId,
	type CommandResult,
	type EntityId,
	type SaveScience,
	type ScienceSubject,
	type SituationDefinition,
	type SituationView,
	type VesselSnapshot
} from '@orbital/core';
import { length, normalize } from '@orbital/kepler';
import { bodyOfVessel } from './bodies.ts';
import { makeContext } from './hooks.ts';
import { moduleDefOf, moduleState, partOf, vesselOf, type SimCore } from './core.ts';
import { deleteData, storagesOf } from './data.ts';
import { record, ruleOf } from './economy.ts';
import { motionOf } from './orbit.ts';
import { terrainUnder, toBodyFixed } from './terrain.ts';

/** Sim time a cached situation stays good for, s (ADR 0178 point 6). */
export const SITUATION_TTL = 1;

interface CachedSituation {
	t: number;
	soi: string;
	landed: boolean;
	id: string | undefined;
}

export interface ScienceRuntime {
	/** Insertion order is the save order. */
	readonly subjects: Map<string, ScienceSubject>;
	readonly cache: Map<EntityId, CachedSituation>;
	/** Situations by order, built on first use (the registries do not change after load). */
	sorted: SituationDefinition[] | null;
}

export function freshScience(saved?: SaveScience): ScienceRuntime {
	const subjects = new Map<string, ScienceSubject>();
	for (const s of saved?.subjects ?? []) subjects.set(s.id, { ...s });
	return { subjects, cache: new Map(), sorted: null };
}

export const saveScience = (core: SimCore): SaveScience | undefined =>
	core.science.subjects.size > 0
		? { subjects: [...core.science.subjects.values()].map((s) => ({ ...s })) }
		: undefined;

const isLanded = (core: SimCore, id: EntityId): boolean => {
	const v = vesselOf(core, id);
	return v.landed || v.rails?.kind === 'surface';
};

/** What the situation is decided from, now. */
export function situationView(core: SimCore, id: EntityId): SituationView {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const { r } = motionOf(core, vessel);
	const atmosphereHeight = body.def.atmosphere?.height ?? 0;
	const landed = isLanded(core, id);
	const { flyingHigh, spaceHigh } = bodyScience(body.def);
	return {
		landed,
		// below sea level on real ground: the reference sphere of a body without terrain is no sea
		splashed:
			landed &&
			atmosphereHeight > 0 &&
			body.terrain !== undefined &&
			terrainUnder(core, body, r) < 0,
		altitude: length(r) - body.def.radius,
		atmosphereHeight,
		flyingHigh,
		spaceHigh
	};
}

function classify(core: SimCore, id: EntityId): string | undefined {
	// sorted once: `situationOf` sorts on every call
	const sorted = (core.science.sorted ??= sortSituations(core.registries.situations.list()));
	const view = situationView(core, id);
	return sorted.find((s) => s.matches(view))?.id;
}

/**
 * The vessel's situation, computed at most once per `SITUATION_TTL` and again at once after an SOI
 * or landed change. `fresh` computes it without reading or writing the cache (the snapshot, so a
 * UI that asks does not change what modules see).
 */
export function vesselSituation(core: SimCore, id: EntityId, fresh = false): string | undefined {
	if (fresh) return classify(core, id);
	const vessel = vesselOf(core, id);
	const landed = isLanded(core, id);
	const hit = core.science.cache.get(id);
	if (hit && core.t - hit.t < SITUATION_TTL && hit.soi === vessel.soi && hit.landed === landed) {
		return hit.id;
	}
	const situation = classify(core, id);
	core.science.cache.set(id, { t: core.t, soi: vessel.soi, landed, id: situation });
	return situation;
}

/** The region under the vessel now (plan 104, ADR 0180 point 3). */
export function regionUnder(core: SimCore, id: EntityId): string {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	if (!body.def.regions) return GLOBAL_REGION;
	const { r } = motionOf(core, vessel);
	return regionAt(body.def, normalize(toBodyFixed(core, body, r)), {
		seed: terrainSeedOf(core.info),
		zones: zonesOf(sitesOf(core.info), body.def.id)
	});
}

/** The region a result in `situation` belongs to: the one under the vessel when it is regional. */
const resultRegion = (core: SimCore, id: EntityId, situation: string): string =>
	core.registries.situations.get(situation)?.regional === true
		? regionUnder(core, id)
		: GLOBAL_REGION;

/**
 * Makes a result of `experiment` on `part` in the vessel's current situation (ADR 0178 point 4):
 * the value is fixed now. Undefined when the experiment may not run in this situation.
 */
export function makeResult(
	core: SimCore,
	part: EntityId,
	experiment: string
): { subject: string; value: number } | undefined {
	const def = core.registries.experiments.get(experiment);
	if (!def) throw new Error(`science.result: unknown experiment "${experiment}"`);
	const vesselId = partOf(core, part).vessel;
	const situation = vesselSituation(core, vesselId);
	if (situation === undefined || !def.situations.includes(situation)) return undefined;
	const vessel = vesselOf(core, vesselId);
	const bodyDef = bodyOfVessel(core, vessel).def;
	const region = resultRegion(core, vesselId, situation);
	const multiplier = bodyScience(bodyDef).multiplier * regionMultiplier(bodyDef, region);
	const id = subjectId(experiment, vessel.soi, situation, region);
	let subject = core.science.subjects.get(id);
	if (!subject) {
		subject = {
			id,
			experiment,
			body: vessel.soi,
			situation,
			region,
			count: 0,
			produced: 0,
			credited: 0,
			cap: subjectCap(def, multiplier)
		};
		core.science.subjects.set(id, subject);
	}
	const value = nextValue(def, multiplier, subject);
	subject.count += 1;
	subject.produced += value;
	core.events.emit('science:result', {
		vessel: vesselId,
		part,
		subject: id,
		value,
		kind: def.kind
	});
	return { subject: id, value };
}

/**
 * Credits `value` to a subject (ADR 0178 point 7); a `science` ledger entry × the multiplier rule
 * when the tech tree is on.
 */
export function creditScience(
	core: SimCore,
	subject: string,
	value: number,
	how: 'transmitted' | 'recovered'
): void {
	const s = core.science.subjects.get(subject);
	if (!s) throw new Error(`science.credit: unknown subject "${subject}"`);
	if (!(Number.isFinite(value) && value >= 0)) {
		throw new RangeError(`science.credit: value must be a finite number >= 0, got ${value}`);
	}
	s.credited += value;
	core.events.emit('science:credited', { subject, value, how });
	if (ruleOf(core, SCIENCE_RULES.techTree) !== true || value === 0) return;
	const factor = ruleOf(core, SCIENCE_RULES.multiplier);
	const points = value * (typeof factor === 'number' ? factor : 1);
	record(core, 'science', points, `science.${s.experiment}`, subject);
}

/** `transmit-data` (ADR 0178 point 7): value × the item's factor, then the item is gone. */
export function transmitData(core: SimCore, vesselId: EntityId, itemId: string): CommandResult {
	for (const storage of storagesOf(core, vesselId)) {
		const item = storage.state.items.find((i) => i.id === itemId);
		if (!item) continue;
		if (item.subject === undefined || !core.science.subjects.has(item.subject)) {
			return { ok: false, reason: `data item "${itemId}" is not a science result` };
		}
		const factor = item.meta?.['transmitFactor'];
		const value = item.value * (typeof factor === 'number' ? factor : 1);
		deleteData(core, vesselId, itemId);
		creditScience(core, item.subject, value, 'transmitted');
		return { ok: true };
	}
	return { ok: false, reason: `vessel ${vesselId} has no data item "${itemId}"` };
}

/**
 * At `recover-vessel`: every science item aboard at full value, then each module's `onRecover`
 * (which credits a held sample).
 */
export function recoverScience(core: SimCore, vesselId: EntityId): void {
	for (const storage of storagesOf(core, vesselId)) {
		for (const item of storage.state.items) {
			if (item.subject !== undefined && core.science.subjects.has(item.subject)) {
				creditScience(core, item.subject, item.value, 'recovered');
			}
		}
	}
	for (const partId of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, partId).modules) {
			const hook = moduleDefOf(core, m.id).onRecover;
			if (hook) hook(makeContext(core, partId, m.id));
		}
	}
	core.science.cache.delete(vesselId);
}

/** `VesselSnapshot.science`: the experiments aboard (from `describe`) and the situation. */
export function vesselScienceSnapshot(
	core: SimCore,
	vesselId: EntityId
): VesselSnapshot['science'] | undefined {
	const experiments: NonNullable<VesselSnapshot['science']>['experiments'] = [];
	for (const partId of vesselOf(core, vesselId).parts) {
		for (const m of partOf(core, partId).modules) {
			const describe = moduleDefOf(core, m.id).describe;
			if (!describe) continue;
			const info = describe(m.config, moduleState(core, partId, m.id))?.experiment;
			if (!info) continue;
			experiments.push({
				part: partId,
				experiment: info.id,
				state: info.state,
				...(info.reason === undefined ? {} : { reason: info.reason }),
				progress: info.progress
			});
		}
	}
	if (experiments.length === 0) return undefined;
	return {
		situation: vesselSituation(core, vesselId, true) ?? null,
		region: regionUnder(core, vesselId),
		experiments
	};
}

export const scienceSnapshot = (core: SimCore) =>
	core.science.subjects.size > 0
		? [...core.science.subjects.values()].map(({ id, count, produced, credited, cap }) => ({
				id,
				count,
				produced,
				credited,
				cap
			}))
		: undefined;
