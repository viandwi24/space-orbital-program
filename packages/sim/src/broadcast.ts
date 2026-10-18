/**
 * Live broadcasts of world firsts (plan 121, ADR 0193 point 5): within an hour of a milestone,
 * once, when its vessel's route has the rate; reputation through the ledger.
 */
import {
	BROADCAST_CAUSE,
	BROADCAST_FACTOR,
	BROADCAST_RATE,
	BROADCAST_WINDOW,
	milestoneReputation,
	type CommandResult,
	type EntityId,
	type MilestoneRecord,
	type Snapshot
} from '@orbital/core';
import { commsOn, type VesselLink } from './comms.ts';
import type { SimCore } from './core.ts';
import { economyOn, record } from './economy.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

/**
 * The rate from `vessel` to the ground: its route's, and on through the crewed vessels it ends at
 * (a suit's lander) until a station; null when the chain ends without one.
 */
function groundRate(links: ReadonlyMap<EntityId, VesselLink>, vessel: EntityId): number | null {
	let rate = Infinity;
	let at: EntityId = vessel;
	for (let guard = 0; guard < links.size + 1; guard++) {
		const link = links.get(at);
		if (!link || link.to === null || link.route.length === 0) return null;
		rate = Math.min(rate, link.rate ?? 0);
		const last = link.route.at(-1)!;
		if (!last.startsWith('vessel:')) return rate;
		at = Number(last.slice('vessel:'.length)) as EntityId;
	}
	return null;
}

/** "First crewed landing at stock.moon". */
const labelOf = (r: MilestoneRecord): string =>
	`First ${r.crewed ? 'crewed ' : ''}${r.kind}${r.body === undefined ? '' : ` at ${r.body}`}`;

const done = (core: SimCore, id: string): boolean =>
	(core.commsState.broadcasts ?? []).includes(id);

const open = (core: SimCore, r: MilestoneRecord): boolean =>
	core.t - r.time <= BROADCAST_WINDOW &&
	!done(core, r.id) &&
	core.world.hasEntity(r.vessel as EntityId);

/** `comms-broadcast` (ADR 0193 point 5). */
export function broadcastMilestone(core: SimCore, id: string): CommandResult {
	if (!commsOn(core)) return refuse('Comms are off: there is no link to broadcast over');
	const rec = core.milestones.records.find((r) => r.id === id);
	if (!rec) return refuse(`no milestone "${id}" in this world`);
	if (done(core, id)) return refuse(`${labelOf(rec)} was broadcast already`);
	if (core.t - rec.time > BROADCAST_WINDOW) {
		return refuse(`${labelOf(rec)} is no longer live (broadcasts are within an hour)`);
	}
	const vessel = rec.vessel as EntityId;
	if (!core.world.hasEntity(vessel)) return refuse(`vessel ${vessel} of ${labelOf(rec)} is gone`);
	const link = core.comms.links.get(vessel);
	const rate = groundRate(core.comms.links, vessel);
	if (rate === null) {
		const why = link?.reason ?? (link?.to ? 'its relay has no link to the ground' : null);
		return refuse(`vessel ${vessel} has no link to the ground${why ? ` (${why})` : ''}`);
	}
	if (rate < BROADCAST_RATE) {
		return refuse(
			`a live broadcast needs ${BROADCAST_RATE / 1000} kbit/s; the route has ${rate / 1000} kbit/s`
		);
	}
	(core.commsState.broadcasts ??= []).push(id);
	if (economyOn(core)) {
		const amount = BROADCAST_FACTOR * milestoneReputation(rec, core.root.def.id);
		if (amount !== 0) record(core, 'reputation', amount, BROADCAST_CAUSE, id);
	}
	return { ok: true };
}

/** `Snapshot.network.broadcasts`: the firsts still open for a broadcast, oldest first. */
export function broadcastOffers(
	core: SimCore,
	links: ReadonlyMap<EntityId, VesselLink>
): NonNullable<Snapshot['network']>['broadcasts'] {
	return core.milestones.records
		.filter((r) => open(core, r))
		.map((r) => ({
			milestone: r.id,
			label: labelOf(r),
			vessel: r.vessel as EntityId,
			until: r.time + BROADCAST_WINDOW,
			rate: groundRate(links, r.vessel as EntityId),
			needs: BROADCAST_RATE
		}));
}
