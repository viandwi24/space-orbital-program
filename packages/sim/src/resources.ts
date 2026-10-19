/**
 * Generic resource flow (simulation.md "Resources"). The sim knows containers only through
 * `ModuleDefinition.store` and routing only through `ResourceDefinition.flowMode` and
 * `PartDefinition.crossfeed`; it does not know what any resource or container is.
 */
import type { EntityId } from '@orbital/core';
import { moduleDefOf, moduleState, partDefOf, partOf, vesselOf, type SimCore } from './core.ts';
import { infiniteResource } from './cheats.ts';
import type { VesselState } from './state.ts';

/**
 * Fuel lines of the vessel (ADR 0071): for each part a line ends on, the parts the line draws
 * from (the part the line hangs on), ascending by line id. Empty for a vessel without a feeding
 * connector, so the common case costs one pass over the parts.
 */
function feeders(core: SimCore, vessel: VesselState): Map<EntityId, EntityId[]> {
	const out = new Map<EntityId, EntityId[]>();
	for (const id of vessel.parts.slice().sort((a, b) => a - b)) {
		const part = partOf(core, id);
		if (!part.link || !partDefOf(core, part).connector?.feeds) continue;
		const source = part.attachments[0]?.peer;
		if (source === undefined || source === part.link.peer) continue;
		const list = out.get(part.link.peer) ?? [];
		list.push(source);
		out.set(part.link.peer, list);
	}
	return out;
}

/**
 * Parts a request from `from` may draw on, in draw order. `stack`: breadth-first over attachments
 * from `from` (neighbours by ascending id), never entering a part with `crossfeed: false`, so a
 * decoupler or engine is a barrier; the requester itself is always the origin. A fuel line that
 * ends on a visited part adds the part it hangs on (even a `crossfeed: false` one: the line is the
 * explicit connection) and what that part reaches, ahead of the visited part, so the outer tanks
 * of an asparagus build empty first. Lines are one way (ADR 0071).
 */
/**
 * Whether stack flow may pass through the part: not a `crossfeed: false` part, and no module says
 * no right now (`ModuleDefinition.crossfeed`: a docking port with its crossfeed off, plan 222).
 */
function passesFlow(core: SimCore, id: EntityId): boolean {
	const part = partOf(core, id);
	if (partDefOf(core, part).crossfeed === false) return false;
	for (const m of part.modules) {
		const hook = moduleDefOf(core, m.id).crossfeed;
		if (hook && !hook(m.config, moduleState(core, id, m.id))) return false;
	}
	return true;
}

export function reachableParts(core: SimCore, from: EntityId): EntityId[] {
	const feeds = feeders(core, vesselOf(core, partOf(core, from).vessel));
	const seen = new Set<EntityId>([from]);
	const order: EntityId[] = [];
	const walk = (origin: EntityId): void => {
		const queue: EntityId[] = [origin];
		for (let head = 0; head < queue.length; head++) {
			const here = queue[head]!;
			for (const source of feeds.get(here) ?? []) {
				if (seen.has(source)) continue;
				seen.add(source);
				walk(source);
			}
			order.push(here);
			const peers = partOf(core, here)
				.attachments.map((a) => a.peer)
				.sort((a, b) => a - b);
			for (const peer of peers) {
				if (seen.has(peer)) continue;
				seen.add(peer);
				if (!passesFlow(core, peer)) continue;
				queue.push(peer);
			}
		}
	};
	walk(from);
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
	// a cheat (plan 203): the draw is granted and the stores keep their contents
	if (infiniteResource(core, resource)) return amount;
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
