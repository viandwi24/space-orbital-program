/**
 * Generic resource flow (simulation.md "Resources"). The sim knows containers only through
 * `ModuleDefinition.store` and routing only through `ResourceDefinition.flowMode` and
 * `PartDefinition.crossfeed`; it does not know what any resource or container is.
 */
import type { EntityId } from '@orbital/core';
import { moduleDefOf, moduleState, partDefOf, partOf, type SimCore } from './core.ts';
import type { VesselState } from './state.ts';

/**
 * Parts a request from `from` may draw on, in draw order. `stack`: breadth-first over attachments
 * from `from` (neighbours by ascending id), never entering a part with `crossfeed: false`, so a
 * decoupler or engine is a barrier; the requester itself is always the origin.
 */
export function reachableParts(core: SimCore, from: EntityId): EntityId[] {
	const seen = new Set<EntityId>([from]);
	const order: EntityId[] = [from];
	for (let head = 0; head < order.length; head++) {
		const part = partOf(core, order[head]!);
		const peers = part.attachments.map((a) => a.peer).sort((a, b) => a - b);
		for (const peer of peers) {
			if (seen.has(peer)) continue;
			seen.add(peer);
			if (partDefOf(core, partOf(core, peer)).crossfeed === false) continue;
			order.push(peer);
		}
	}
	return order;
}

function sources(core: SimCore, vessel: VesselState, from: EntityId, resource: string): EntityId[] {
	const mode = core.registries.resources.get(resource)?.flowMode ?? 'none';
	if (mode === 'none') return [];
	return mode === 'vessel' ? vessel.parts : reachableParts(core, from);
}

type Visit = (
	store: NonNullable<ReturnType<typeof moduleDefOf>['store']>,
	config: unknown,
	state: unknown
) => number;

/** Run `visit` over every store in `parts` that can hold `resource`, summing the results. */
function eachStore(
	core: SimCore,
	parts: readonly EntityId[],
	resource: string,
	visit: Visit,
	stopAt?: number
): number {
	let total = 0;
	for (const id of parts) {
		for (const m of partOf(core, id).modules) {
			const store = moduleDefOf(core, m.id).store;
			if (!store) continue;
			const state = moduleState(core, id, m.id);
			if (!store.resources(m.config, state).includes(resource)) continue;
			total += visit(store, m.config, state);
			if (stopAt !== undefined && total >= stopAt) return total;
		}
	}
	return total;
}

export function amountAvailable(
	core: SimCore,
	vessel: VesselState,
	from: EntityId,
	resource: string
): number {
	return eachStore(core, sources(core, vessel, from, resource), resource, (store, c, s) =>
		store.amount(c, s, resource)
	);
}

export function withdrawResource(
	core: SimCore,
	vessel: VesselState,
	from: EntityId,
	resource: string,
	amount: number
): number {
	checkAmount(amount);
	let remaining = amount;
	return eachStore(
		core,
		sources(core, vessel, from, resource),
		resource,
		(store, c, s) => {
			const taken = remaining > 0 ? store.withdraw(c, s, resource, remaining) : 0;
			remaining -= taken;
			return taken;
		},
		amount
	);
}

export function depositResource(
	core: SimCore,
	vessel: VesselState,
	from: EntityId,
	resource: string,
	amount: number
): number {
	checkAmount(amount);
	let remaining = amount;
	return eachStore(
		core,
		sources(core, vessel, from, resource),
		resource,
		(store, c, s) => {
			const accepted = remaining > 0 ? store.deposit(c, s, resource, remaining) : 0;
			remaining -= accepted;
			return accepted;
		},
		amount
	);
}

function checkAmount(amount: number): void {
	if (!Number.isFinite(amount) || amount < 0) {
		throw new RangeError(`resource amount must be a finite number >= 0, got ${amount}`);
	}
}
