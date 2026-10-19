/**
 * Resource transfers and flow rates (plan 213). A transfer is a job on the vessel
 * (`VesselState.transfers`), so a save keeps it; every step moves `rate × dt` from the sources to
 * the targets and ends the job when the sources are empty or the targets full. Rates are measured,
 * not modelled: the change of each part's stores over a step, smoothed over about a second, so
 * engines, RCS, producers, consumers and transfers all show.
 */
import type { EntityId, ResourceSnapshot } from '@orbital/core';
import { partOf, vesselIds, vesselOf, type SimCore } from './core.ts';
import { amountIn, depositInto, partStores, roomIn, withdrawFrom } from './resources.ts';

/** Default transfer rate, units/s, for a resource without `transferRate`. */
export const DEFAULT_TRANSFER_RATE = 20;
/** Smoothing time of the rates, s. */
export const RATE_SMOOTHING = 1;
/** Less than this moved in a step ends a transfer (empty source or full target). */
const DONE = 1e-9;

/** "stock.solid-fuel" → "Solid fuel": a resource id read as words for a refusal. */
export function resourceWords(id: string): string {
	const tail = id.slice(id.indexOf('.') + 1).replace(/-/g, ' ');
	return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/** Why a transfer of `resource` cannot start, or undefined. */
export function transferRefusal(
	core: SimCore,
	vesselId: EntityId,
	resource: string,
	from: readonly EntityId[],
	to: readonly EntityId[]
): string | undefined {
	const def = core.registries.resources.get(resource);
	if (!def) return `unknown resource "${resource}"`;
	if (def.flowMode === 'none') return `${resourceWords(resource)} cannot be transferred`;
	const vessel = vesselOf(core, vesselId);
	for (const id of [...from, ...to]) {
		if (!vessel.parts.includes(id)) return `part ${id} is not part of vessel ${vesselId}`;
		if (!partStores(core, id).has(resource)) {
			return `part ${id} holds no ${resourceWords(resource).toLowerCase()}`;
		}
	}
	if (from.some((id) => to.includes(id))) return 'a part cannot be both source and target';
	if (amountIn(core, from, resource) <= DONE) return 'the source is empty or locked';
	if (roomIn(core, to, resource) <= DONE) return 'the target is full or locked';
	return undefined;
}

/** Move every running transfer on by `dt` seconds. */
export function runTransfers(core: SimCore, dt: number): void {
	if (dt <= 0) return;
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		if (!vessel.transfers?.length) continue;
		vessel.transfers = vessel.transfers.filter((job) => {
			// parts that left the vessel (a split) no longer take part
			const from = job.from.filter((p) => vessel.parts.includes(p));
			const to = job.to.filter((p) => vessel.parts.includes(p));
			if (from.length === 0 || to.length === 0) return false;
			const want = Math.min(
				job.rate * dt,
				amountIn(core, from, job.resource),
				roomIn(core, to, job.resource)
			);
			if (want <= DONE) return false;
			const taken = withdrawFrom(core, from, job.resource, want);
			const put = depositInto(core, to, job.resource, taken);
			// what did not fit goes back where it came from
			if (put < taken) depositInto(core, from, job.resource, taken - put);
			return put > DONE;
		});
		if (vessel.transfers.length === 0) delete vessel.transfers;
	}
}

/**
 * The vessels whose rates are measured: those in flight and those running a transfer. A vessel on
 * rails without one keeps no rates (its stores change only in background chunks), which keeps a
 * world of many parked vessels cheap.
 */
function measured(core: SimCore): EntityId[] {
	const out: EntityId[] = [];
	for (const frame of core.frames) if (frame.inUse) out.push(...frame.vessels);
	for (const id of vesselIds(core)) {
		const v = vesselOf(core, id);
		if (v.mode !== 'flight' && v.transfers?.length) out.push(id);
	}
	return out;
}

/** Rates are sampled this often, s: a part's amounts are compared with its last sample. */
export const RATE_SAMPLE = 0.1;

function amounts(core: SimCore, partId: EntityId): Record<string, number> | undefined {
	const stores = partStores(core, partId);
	if (stores.size === 0) return undefined;
	const out: Record<string, number> = {};
	for (const [r, s] of stores) out[r] = s.amount;
	return out;
}

/**
 * After a step: every `RATE_SAMPLE` seconds each measured part (vessels in flight or running a
 * transfer) compares its amounts with its last sample and folds the net flow into its smoothed
 * rates (`PartState.rates`). The sample and its time live on the part, so a save resumes them.
 */
export function updateRates(core: SimCore): void {
	for (const id of measured(core)) {
		for (const p of vesselOf(core, id).parts) {
			const part = partOf(core, p);
			if (part.rateAt !== undefined && core.t - part.rateAt < RATE_SAMPLE - 1e-9) continue;
			const now = amounts(core, p);
			if (!now) continue;
			const span = part.rateAt === undefined ? 0 : core.t - part.rateAt;
			if (span > 0 && part.rateBase) {
				const k = 1 - Math.exp(-span / RATE_SMOOTHING);
				const rates = part.rates ?? {};
				for (const [r, amount] of Object.entries(now)) {
					const instant = (amount - (part.rateBase[r] ?? amount)) / span;
					const next = (rates[r] ?? 0) + (instant - (rates[r] ?? 0)) * k;
					rates[r] = Math.abs(next) < 1e-12 ? 0 : next;
				}
				part.rates = rates;
			}
			part.rateBase = now;
			part.rateAt = core.t;
		}
	}
}

const timeToEmpty = (amount: number, rate: number): number | null =>
	rate < -1e-9 ? amount / -rate : null;

/** `PartSnapshot.resources` (plan 213), or undefined for a part without stores. */
export function partResourceSnapshot(
	core: SimCore,
	partId: EntityId
): ResourceSnapshot[] | undefined {
	const stores = partStores(core, partId);
	if (stores.size === 0) return undefined;
	const part = partOf(core, partId);
	const vessel = vesselOf(core, part.vessel);
	// a vessel on rails without a transfer is not measured: no flow to show (its old rates are stale)
	const live = vessel.mode === 'flight' || (vessel.transfers?.length ?? 0) > 0;
	const rates = live ? (part.rates ?? {}) : {};
	return [...stores]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([resource, s]) => ({
			resource,
			amount: s.amount,
			capacity: s.capacity,
			rate: rates[resource] ?? 0,
			timeToEmpty: timeToEmpty(s.amount, rates[resource] ?? 0),
			locked: s.locked
		}));
}

/** `VesselSnapshot.resources`: the parts' rows summed by resource. */
export function vesselResourceSnapshot(
	parts: ReadonlyArray<ResourceSnapshot[] | undefined>
): ResourceSnapshot[] | undefined {
	const sum = new Map<string, ResourceSnapshot>();
	for (const rows of parts) {
		for (const r of rows ?? []) {
			const t = sum.get(r.resource);
			if (!t) sum.set(r.resource, { ...r });
			else {
				t.amount += r.amount;
				t.capacity += r.capacity;
				t.rate += r.rate;
				t.locked = t.locked && r.locked;
			}
		}
	}
	if (sum.size === 0) return undefined;
	return [...sum.values()]
		.sort((a, b) => (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0))
		.map((t) => ({ ...t, timeToEmpty: timeToEmpty(t.amount, t.rate) }));
}
