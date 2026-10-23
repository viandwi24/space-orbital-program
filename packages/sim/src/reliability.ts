/**
 * Part reliability in the sim (plan 130, ADR 0156): trials at stage and at load drawn from the
 * `reliability` stream, failed modules (their hooks are skipped elsewhere through `isFailed`),
 * experience, anomaly reports, grades, the test stand, fixes and EVA repair.
 */
import {
	createRng,
	GRADE_FACTORS,
	modelReliability,
	RELIABILITY,
	RELIABILITY_CAUSES,
	RELIABILITY_RULE,
	sitesOf,
	workingLevel,
	streamSeed,
	trialChance,
	type CommandResult,
	type EntityId,
	type FailureModeDefinition,
	type FailureTrigger,
	type Grade,
	type ReliabilitySnapshot,
	type SaveReliability,
	type VesselDesign,
	REPAIR_RANGE
} from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { partDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import { vesselOfMember } from './crew.ts';
import { costMultiplier, economyOn, record, ruleOf } from './economy.ts';
import { motionOf } from './orbit.ts';
import { PART, VESSEL } from './state.ts';

/** EVA boarding limits (ADR 0120), reused for a repair; the range is core's `REPAIR_RANGE`. */
const REPAIR_SPEED = 2;

export interface ReliabilityRuntime extends SaveReliability {
	/** `part:module` of failed modules, rebuilt when `failed` changes. */
	failedKeys: Set<string>;
}

export function freshReliability(
	core: Pick<SimCore, 'info'>,
	saved?: SaveReliability
): ReliabilityRuntime {
	const base: SaveReliability = saved
		? structuredClone(saved)
		: {
				rng: streamSeed(core.info.seed, 'reliability'),
				models: {},
				reports: [],
				failed: [],
				next: 1
			};
	return { ...base, failedKeys: new Set(base.failed.map((f) => `${f.part}:${f.module}`)) };
}

const pristine = (r: ReliabilityRuntime): boolean =>
	Object.keys(r.models).length === 0 && r.reports.length === 0 && r.failed.length === 0;

export function saveReliability(core: SimCore): SaveReliability | undefined {
	const r = core.reliability;
	if (pristine(r)) return undefined;
	return structuredClone({
		rng: r.rng,
		models: r.models,
		reports: r.reports,
		failed: r.failed,
		next: r.next
	});
}

export const reliabilityOn = (core: SimCore): boolean => ruleOf(core, RELIABILITY_RULE) === true;

/** True when `moduleId` on `part` has failed: its hooks are skipped (ADR 0156 point 2). */
export const isFailed = (core: SimCore, part: EntityId, moduleId: string): boolean =>
	core.reliability.failedKeys.size > 0 && core.reliability.failedKeys.has(`${part}:${moduleId}`);

/** The failure that stopped a module, if any. */
export function failureOf(
	core: SimCore,
	part: EntityId,
	moduleId: string
): FailureModeDefinition | undefined {
	if (!isFailed(core, part, moduleId)) return undefined;
	const f = core.reliability.failed.find((x) => x.part === Number(part) && x.module === moduleId);
	return f ? core.registries.failureModes.get(f.mode) : undefined;
}

function rebuildKeys(core: SimCore): void {
	const r = core.reliability;
	r.failedKeys = new Set(r.failed.map((f) => `${f.part}:${f.module}`));
}

const modesOfModule = (core: SimCore, moduleId: string, trigger?: FailureTrigger) =>
	core.registries.failureModes
		.list()
		.filter((m) => m.module === moduleId && (trigger === undefined || m.trigger === trigger));

/** Every failure mode a part model can suffer (its modules' modes). */
function modesOfModel(core: SimCore, partModel: string): FailureModeDefinition[] {
	const def = core.registries.parts.get(partModel);
	if (!def) return [];
	return (def.modules ?? []).flatMap(([moduleId]) => modesOfModule(core, moduleId));
}

function engineerAboard(core: SimCore, vessel: EntityId): boolean {
	return core.crew.members.some(
		(m) => m.profession === 'engineer' && vesselOfMember(core, m) === vessel
	);
}

function model(core: SimCore, partModel: string) {
	const r = core.reliability;
	return (r.models[partModel] ??= { experience: 0 });
}

/**
 * One trial of `modes` on a part model: a draw per mode, experience + 1, a report per failure.
 * Returns the failed modes. `part` and `vessel` are absent on the test stand.
 */
function trial(
	core: SimCore,
	partModel: string,
	modes: readonly FailureModeDefinition[],
	where?: { vessel: EntityId; part: EntityId }
): FailureModeDefinition[] {
	if (modes.length === 0) return [];
	const r = core.reliability;
	const rng = createRng(r.rng);
	const state = model(core, partModel);
	const engineer = where ? engineerAboard(core, where.vessel) : false;
	const failed: FailureModeDefinition[] = [];
	for (const mode of modes) {
		if (rng.next() < trialChance(mode, state, engineer)) failed.push(mode);
	}
	r.rng = rng.state();
	state.experience += 1;
	for (const mode of failed) {
		const id = `anomaly-${r.next++}`;
		r.reports.push({
			id,
			part: partModel,
			mode: mode.id,
			time: core.t,
			...(where ? { vessel: Number(where.vessel) } : {}),
			fixed: false
		});
		if (where && !r.failed.some((f) => f.part === Number(where.part) && f.module === mode.module)) {
			r.failed.push({
				vessel: Number(where.vessel),
				part: Number(where.part),
				module: mode.module,
				mode: mode.id
			});
			core.events.emit('part:failed', {
				vessel: where.vessel,
				part: where.part,
				module: mode.module,
				mode: mode.id,
				time: core.t
			});
		}
	}
	if (failed.length > 0) rebuildKeys(core);
	return failed;
}

/** Trials of the modules of `part` that fail on `trigger` (rule on only). */
export function partTrials(
	core: SimCore,
	vessel: EntityId,
	part: EntityId,
	trigger: FailureTrigger
): void {
	if (!reliabilityOn(core)) return;
	const p = partOf(core, part);
	const modes = p.modules.flatMap((m) =>
		isFailed(core, part, m.id) ? [] : modesOfModule(core, m.id, trigger)
	);
	trial(core, partDefOf(core, p).id, modes, { vessel, part });
}

/** A vessel was loaded: the `launch` trials of all its parts (ADR 0156 point 1). */
export function launchTrials(core: SimCore, vessel: EntityId): void {
	if (!reliabilityOn(core)) return;
	for (const part of vesselOf(core, vessel).parts) partTrials(core, vessel, part, 'launch');
}

/** Extra launch cost of the grades bought (ADR 0156 point 5), before the cost multiplier. */
export function gradeSurcharge(core: SimCore, design: VesselDesign): number {
	if (!reliabilityOn(core)) return 0;
	let extra = 0;
	for (const p of design.parts) {
		const grade = core.reliability.models[p.part]?.grade ?? 'standard';
		const cost = core.registries.parts.get(p.part)?.cost ?? 0;
		extra += cost * (GRADE_FACTORS[grade].cost - 1);
	}
	return extra;
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });
const accept = (): CommandResult => ({ ok: true });
const NO_RULE = 'this world has no part reliability';

function pay(core: SimCore, amount: number, cause: string, ref: string): string | undefined {
	if (!economyOn(core) || amount <= 0) return undefined;
	const funds = amount * costMultiplier(core);
	if (core.economy.balances.funds < funds)
		return `needs ${Math.ceil(funds)} funds, the agency has ${Math.floor(core.economy.balances.funds)}`;
	record(core, 'funds', -funds, cause, ref);
	return undefined;
}

export function setGrade(core: SimCore, part: string, grade: Grade): CommandResult {
	if (!reliabilityOn(core)) return refuse(NO_RULE);
	if (!core.registries.parts.has(part)) return refuse(`unknown part "${part}"`);
	model(core, part).grade = grade;
	return accept();
}

const hasTestStand = (core: SimCore): boolean =>
	sitesOf(core.info).some((s) =>
		(s.buildings ?? []).some(
			(b) =>
				// an upgrading stand keeps working (plan 096, ADR 0123 point 2)
				workingLevel(b) !== null &&
				core.registries.buildings.get(b.kind)?.provides.includes('test-stand') === true
		)
	);

export function staticFire(core: SimCore, part: string): CommandResult {
	if (!reliabilityOn(core)) return refuse(NO_RULE);
	const def = core.registries.parts.get(part);
	if (!def) return refuse(`unknown part "${part}"`);
	const modes = modesOfModel(core, part);
	if (modes.length === 0) return refuse(`"${def.title}" has nothing that can fail`);
	if (!hasTestStand(core)) return refuse('build a test stand first');
	const short = pay(
		core,
		(def.cost ?? 0) * RELIABILITY.staticFire,
		RELIABILITY_CAUSES.staticFire,
		part
	);
	if (short) return refuse(short);
	trial(core, part, modes);
	return accept();
}

export function fixAnomaly(core: SimCore, reportId: string): CommandResult {
	if (!reliabilityOn(core)) return refuse(NO_RULE);
	const report = core.reliability.reports.find((r) => r.id === reportId);
	if (!report) return refuse(`no anomaly report "${reportId}"`);
	if (report.fixed) return refuse(`anomaly report "${reportId}" is already fixed`);
	const cost = (core.registries.parts.get(report.part)?.cost ?? 0) * RELIABILITY.fix;
	const short = pay(core, cost, RELIABILITY_CAUSES.fix, report.id);
	if (short) return refuse(short);
	const state = model(core, report.part);
	state.fixes = { ...state.fixes, [report.mode]: (state.fixes?.[report.mode] ?? 0) + 1 };
	report.fixed = true;
	return accept();
}

export function repair(
	core: SimCore,
	suitId: EntityId,
	vesselId: EntityId,
	partId: EntityId
): CommandResult {
	if (!core.world.has(suitId, VESSEL) || !core.world.has(vesselId, VESSEL))
		return refuse(`unknown vessel ${core.world.has(suitId, VESSEL) ? vesselId : suitId}`);
	const part = core.world.get(partId, PART);
	if (!part || part.vessel !== vesselId)
		return refuse(`part ${partId} is not part of vessel ${vesselId}`);
	const failed = core.reliability.failed.filter((f) => f.part === Number(partId));
	if (failed.length === 0) return refuse(`part ${partId} has not failed`);
	const engineer = core.crew.members.some(
		(m) => m.profession === 'engineer' && vesselOfMember(core, m) === suitId
	);
	if (!engineer) return refuse(`vessel ${suitId} carries no engineer`);
	const suit = vesselOf(core, suitId);
	const target = vesselOf(core, vesselId);
	if (suit.soi !== target.soi) return refuse(`vessel ${vesselId} is not near (another sphere)`);
	const a = motionOf(core, suit);
	const b = motionOf(core, target);
	const distance = length(sub(a.r, b.r));
	if (distance > REPAIR_RANGE)
		return refuse(
			`vessel ${vesselId} is ${Math.round(distance)} m away (at most ${REPAIR_RANGE} m)`
		);
	if (length(sub(a.v, b.v)) > REPAIR_SPEED)
		return refuse(`too fast: more than ${REPAIR_SPEED} m/s relative to vessel ${vesselId}`);
	const fixable = failed.filter(
		(f) => core.registries.failureModes.get(f.mode)?.repairable === true
	);
	if (fixable.length === 0) return refuse('this failure cannot be repaired in the field');
	core.reliability.failed = core.reliability.failed.filter((f) => !fixable.includes(f));
	rebuildKeys(core);
	return accept();
}

/** Drop failures of parts that no longer exist. */
function prune(core: SimCore): void {
	const r = core.reliability;
	const kept = r.failed.filter((f) => core.world.hasEntity(f.part as EntityId));
	if (kept.length !== r.failed.length) {
		r.failed = kept;
		rebuildKeys(core);
	}
}

/** `Snapshot.reliability` (ADR 0156 point 8); absent when the rule is off. */
export function reliabilitySnapshot(core: SimCore): ReliabilitySnapshot | undefined {
	if (!reliabilityOn(core)) return undefined;
	prune(core);
	const r = core.reliability;
	const models: ReliabilitySnapshot['models'] = [];
	for (const def of core.registries.parts.list()) {
		const modes = modesOfModel(core, def.id);
		if (modes.length === 0) continue;
		const state = r.models[def.id];
		models.push({
			part: def.id,
			experience: state?.experience ?? 0,
			grade: state?.grade ?? 'standard',
			reliability: modelReliability(modes, state)
		});
	}
	return {
		models,
		reports: r.reports.map((x) => ({ ...x })),
		failed: r.failed.map((f) => ({
			...f,
			label: core.registries.failureModes.get(f.mode)?.label ?? f.mode
		}))
	};
}
