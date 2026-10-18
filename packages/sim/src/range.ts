/**
 * Range safety in the sim (plan 127, ADR 0155): the drop of a separating stage judged at the
 * `stage` command from the vessel's own state on the debris conic, the ascent azimuth measured at
 * 2 km against the site's fan, penalties through the ledger once, and the snapshot.
 */
import {
	conicImpact,
	dropProblem,
	dropReason,
	headingOf,
	inFan,
	latLonOf,
	RANGE,
	RANGE_CAUSE,
	RANGE_PENALTIES,
	RANGE_RULE,
	safeFan,
	sitesOf,
	type EntityId,
	type FanArc,
	type RangeMode,
	type RangeSnapshot,
	type RangeViolationKind,
	type SaveRange,
	type Site
} from '@orbital/core';
import { cross, length, sub } from '@orbital/kepler';
import { bodyOfVessel, rotationAt, spinAt, type BodyRuntime } from './bodies.ts';
import {
	isControlled,
	moduleDefOf,
	moduleState,
	partOf,
	vesselIds,
	vesselOf,
	type SimCore
} from './core.ts';
import { costMultiplier, economyOn, record, ruleOf } from './economy.ts';
import { qConj, qRotate } from './math.ts';
import { motionOf } from './orbit.ts';
import { VESSEL } from './state.ts';
import { terrainUnder, toBodyFixed } from './terrain.ts';

/** Saved pending ascents and the fans worked out so far (fans are derived, never saved). */
export interface RangeRuntime {
	pending: SaveRange['pending'];
	fans: Map<string, FanArc[] | null>;
}

export const freshRange = (saved?: SaveRange): RangeRuntime => ({
	pending: saved ? saved.pending.map((p) => ({ ...p })) : [],
	fans: new Map()
});

export const saveRange = (core: SimCore): SaveRange | undefined =>
	core.range.pending.length === 0
		? undefined
		: { pending: core.range.pending.map((p) => ({ ...p })) };

/** The world's rule; `off` when no plugin defines it. */
export function rangeMode(core: SimCore): RangeMode {
	const v = ruleOf(core, RANGE_RULE);
	return v === 'cost' || v === 'hard' ? v : 'off';
}

const waterOf = (
	body: BodyRuntime
): ((d: { x: number; y: number; z: number }) => boolean) | undefined => {
	const w = body.terrain?.waterAt;
	return w ? (d) => w.call(body.terrain, d) : undefined;
};

const bodyOfSite = (core: SimCore, site: Site): BodyRuntime | undefined =>
	[...core.bodies.values()].find((b) => b.def.id === site.body);

const sitesOn = (core: SimCore, body: BodyRuntime): Site[] =>
	sitesOf(core.info).filter((s) => s.body === body.def.id);

/** A site's fan (null: its body has no water map), computed once per run. */
export function fanOf(core: SimCore, site: Site): FanArc[] | null {
	const known = core.range.fans.get(site.id);
	if (known !== undefined) return known;
	const body = bodyOfSite(core, site);
	const water = body && waterOf(body);
	const fan =
		body && water
			? safeFan(
					site,
					body.def.radius,
					water,
					sitesOn(core, body).filter((s) => s.id !== site.id)
				)
			: null;
	core.range.fans.set(site.id, fan);
	return fan;
}

/** Height of the vessel above the ground under it, m. */
function heightOf(
	core: SimCore,
	body: BodyRuntime,
	r: { x: number; y: number; z: number }
): number {
	return length(r) - body.def.radius - terrainUnder(core, body, r);
}

/** True when firing the vessel's next stage separates parts (a module describing a separator). */
export function stageSeparates(core: SimCore, id: EntityId): boolean {
	const vessel = vesselOf(core, id);
	for (const partId of vessel.stages[vessel.nextStage] ?? []) {
		if (!core.world.hasEntity(partId) || partOf(core, partId).vessel !== id) continue;
		for (const m of partOf(core, partId).modules) {
			const def = moduleDefOf(core, m.id);
			const sep = def.describe?.(
				m.config as never,
				moduleState(core, partId, m.id) as never
			).separator;
			if (sep && !sep.done) return true;
		}
	}
	return false;
}

type Drop =
	| { kind: 'site'; site: string; latitude: number; longitude: number }
	| { kind: 'land'; latitude: number; longitude: number };

/**
 * Where a stage dropped now would fall and what is wrong there (ADR 0155 points 2 and 3);
 * undefined when it is fine, the vessel is on the ground, or the body has no water map.
 */
export function judgeDrop(core: SimCore, id: EntityId): Drop | undefined {
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const water = waterOf(body);
	if (!water) return undefined;
	const { r, v } = motionOf(core, vessel);
	if (heightOf(core, body, r) < 100) return undefined;
	const hit = conicImpact(body.mu, r, v, body.def.radius);
	if (!hit) return undefined;
	const t = core.t + (Number.isFinite(hit.time) ? hit.time : 0);
	const at = latLonOf(qRotate(qConj(rotationAt(body, t)), hit.position));
	const problem = dropProblem(at, body.def.radius, water, sitesOn(core, body));
	if (!problem) return undefined;
	return problem.kind === 'site'
		? { kind: 'site', site: problem.site, ...at }
		: { kind: 'land', ...at };
}

/** The `hard` refusal of a `stage` command, or undefined (ADR 0155 point 3). */
export function stageRefusal(core: SimCore, id: EntityId): { drop?: Drop; refusal?: string } {
	const mode = rangeMode(core);
	if (mode === 'off' || !stageSeparates(core, id)) return {};
	const drop = judgeDrop(core, id);
	if (!drop) return {};
	if (mode === 'hard')
		return { refusal: `${dropReason(drop)}; stage over the sea or change the ascent` };
	return { drop };
}

/** Book one violation: the ledger when the economy is on, and the event (ADR 0155 point 5). */
export function violation(
	core: SimCore,
	vessel: EntityId,
	kind: RangeViolationKind,
	where: { site?: string; latitude?: number; longitude?: number; azimuth?: number }
): void {
	const penalised = economyOn(core);
	if (penalised) {
		const p = RANGE_PENALTIES[kind];
		const ref = `${kind}:${vessel}`;
		record(core, 'funds', -p.funds * costMultiplier(core), RANGE_CAUSE, ref);
		record(core, 'reputation', -p.reputation, RANGE_CAUSE, ref);
	}
	core.events.emit('range:violation', { vessel, kind, ...where, penalised });
}

/** A vessel just loaded at `site`: its ascent azimuth is judged at 2 km (ADR 0155 point 4). */
export function watchAscent(core: SimCore, vessel: EntityId, site: Site): void {
	if (rangeMode(core) === 'off' || !fanOf(core, site)) return;
	core.range.pending.push({ vessel: Number(vessel), site: site.id });
}

/** After each step: measure the azimuth of the ascents that passed 2 km. */
export function collectRange(core: SimCore): void {
	if (core.range.pending.length === 0) return;
	const keep: SaveRange['pending'] = [];
	for (const p of core.range.pending) {
		const id = p.vessel as EntityId;
		if (!core.world.has(id, VESSEL)) continue;
		const site = sitesOf(core.info).find((s) => s.id === p.site);
		const fan = site && fanOf(core, site);
		if (!site || !fan) continue;
		const vessel = vesselOf(core, id);
		const body = bodyOfVessel(core, vessel);
		const { r, v } = motionOf(core, vessel);
		if (heightOf(core, body, r) < RANGE.azimuthAltitude) {
			keep.push(p);
			continue;
		}
		// the velocity over the turning ground, in the body-fixed frame
		const ground = sub(v, cross(spinAt(body, core.t), r));
		const azimuth = headingOf(toBodyFixed(core, body, r), toBodyFixed(core, body, ground));
		if (!inFan(fan, azimuth)) violation(core, id, 'azimuth', { site: site.id, azimuth });
	}
	core.range.pending = keep;
}

/** `Snapshot.range` (ADR 0155 point 6); absent when the rule is off. */
export function rangeSnapshot(core: SimCore): RangeSnapshot | undefined {
	const mode = rangeMode(core);
	if (mode === 'off') return undefined;
	// the site of the latest ascent still climbing, else the primary site
	const pendingSite = core.range.pending.at(-1)?.site;
	const site =
		sitesOf(core.info).find((s) => s.id === pendingSite) ?? sitesOf(core.info)[0] ?? undefined;
	const fan = site ? fanOf(core, site) : null;
	const warnings: RangeSnapshot['warnings'] = [];
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (!isControlled(core, vessel) || vessel.rails) continue;
		if (vessel.nextStage >= vessel.stages.length || !stageSeparates(core, id)) continue;
		const drop = judgeDrop(core, id);
		if (drop)
			warnings.push({
				vessel: Number(id),
				kind: drop.kind,
				...(drop.kind === 'site' ? { site: drop.site } : {}),
				latitude: drop.latitude,
				longitude: drop.longitude
			});
	}
	return { mode, ...(site && fan ? { site: { id: site.id, fan } } : {}), warnings };
}
