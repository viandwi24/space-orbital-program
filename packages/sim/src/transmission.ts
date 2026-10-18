/**
 * Comms tier 4 (plan 119, ADR 0189): data items in the radios' queues, sent at the route's shared
 * rate in kind priority order, handed to a relay with storage when the onward route is down
 * (store-and-forward), delivered with `comms:data-delivered` (science credited then), and the
 * next contact of a holder without a route. The queues are `SimCore.commsState.transmissions`.
 */
import {
	COMMAND_RATE,
	MAX_CUSTODY_HOPS,
	dataValueAt,
	type CommandResult,
	type DataItem,
	type EntityId,
	type SaveTransmission,
	type Snapshot
} from '@orbital/core';
import { commsOn, hasAntenna, nextDirectContact, type Routed } from './comms.ts';
import { vesselIds, type SimCore } from './core.ts';
import { dataUse, deleteData, restoreData, storagesOf } from './data.ts';
import { creditScience } from './science.ts';
import { VESSEL } from './state.ts';

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

const priorityOf = (core: SimCore, item: DataItem): number =>
	core.registries.dataKinds.get(item.kind)?.priority ?? 0;

/** A holder's queue in send order: kind priority (lower first), then `seq`. */
function queueOf(core: SimCore, holder: number): SaveTransmission[] {
	return core.commsState.transmissions
		.filter((t) => t.holder === holder)
		.sort((a, b) => priorityOf(core, a.item) - priorityOf(core, b.item) || a.seq - b.seq);
}

/** Bits a holder carries for others (custody), counted against its free storage. */
const heldFor = (core: SimCore, holder: number): number =>
	core.commsState.transmissions
		.filter((t) => t.holder === holder && t.origin !== holder)
		.reduce((sum, t) => sum + t.item.bits - t.sent, 0);

/**
 * `transmit-data` with comms on (ADR 0189 point 1): the item leaves its storage for the vessel's
 * transmission queue.
 */
export function enqueueTransmission(
	core: SimCore,
	vessel: EntityId,
	itemId: string
): CommandResult {
	const item = storagesOf(core, vessel)
		.flatMap((s) => s.state.items)
		.find((i) => i.id === itemId);
	if (!item) return refuse(`vessel ${vessel} has no data item "${itemId}"`);
	if (!hasAntenna(core, vessel)) return refuse('no antenna: this vessel cannot transmit');
	const removed = deleteData(core, vessel, itemId);
	if (!removed.ok) return removed;
	const s = core.commsState;
	s.transmissions.push({
		seq: s.seq++,
		holder: Number(vessel),
		origin: Number(vessel),
		item: { ...item },
		sent: 0,
		hops: 0
	});
	return { ok: true };
}

/** `transmission-cancel`: back into storage if there is room; the sent bits are lost. */
export function cancelTransmission(core: SimCore, vessel: EntityId, itemId: string): CommandResult {
	const s = core.commsState;
	const t = s.transmissions.find((x) => x.holder === Number(vessel) && x.item.id === itemId);
	if (!t) return refuse(`vessel ${vessel} is not sending "${itemId}"`);
	if (!restoreData(core, vessel, t.item))
		return refuse('no room in the data storage to take it back');
	s.transmissions = s.transmissions.filter((x) => x !== t);
	return { ok: true };
}

/** At recovery: science items still in the vessel's radio count at full value, as aboard. */
export function recoverQueued(core: SimCore, vessel: EntityId): void {
	const s = core.commsState;
	for (const t of s.transmissions.filter((x) => x.holder === Number(vessel))) {
		const subject = t.item.subject;
		if (subject !== undefined && core.science.subjects.has(subject))
			creditScience(core, subject, t.item.value, 'recovered');
	}
	s.transmissions = s.transmissions.filter((x) => x.holder !== Number(vessel));
}

/** Delivery (ADR 0189 point 5): the event, and science credited at its value now. */
function deliver(core: SimCore, t: SaveTransmission, time: number): void {
	core.events.emit('comms:data-delivered', {
		vessel: t.origin as EntityId,
		item: t.item.id,
		kind: t.item.kind,
		bits: t.item.bits,
		time
	});
	const subject = t.item.subject;
	if (subject === undefined || !core.science.subjects.has(subject)) return;
	const kind = core.registries.dataKinds.get(t.item.kind);
	const factor = t.item.meta?.['transmitFactor'];
	const worth = kind ? dataValueAt(kind, t.item, core.t) : t.item.value;
	creditScience(core, subject, worth * (typeof factor === 'number' ? factor : 1), 'transmitted');
}

/**
 * A relay that may take custody (ADR 0189 point 4): a neighbour with free storage for the item
 * whose next direct contact comes before the holder's own (or the holder has none).
 */
function custodian(
	core: SimCore,
	holder: number,
	link: Routed,
	bits: number
): { vessel: EntityId; rate: number } | undefined {
	const own = contactOf(core, holder);
	const options = link.neighbors
		.filter((n) => {
			const use = dataUse(core, n.vessel);
			return use.capacity - use.used - heldFor(core, Number(n.vessel)) >= bits;
		})
		.map((n) => ({ ...n, contact: contactOf(core, Number(n.vessel)) }))
		.filter((n) => n.contact !== null && (own === null || n.contact < own))
		.sort(
			(a, b) => a.contact! - b.contact! || b.rate - a.rate || Number(a.vessel) - Number(b.vessel)
		);
	return options[0];
}

/**
 * Spends `dt` seconds of every queue at sample time `t` (ADR 0189 points 2 to 5): a holder with a
 * route sends at its shared rate and delivers; one without hands its head item to a custodian.
 * Items of vessels that no longer exist are lost.
 */
export function stepTransmissions(
	core: SimCore,
	routed: ReadonlyMap<EntityId, Routed>,
	dt: number,
	t: number
): void {
	const s = core.commsState;
	const alive = new Set(vesselIds(core).map(Number));
	s.transmissions = s.transmissions.filter((x) => alive.has(x.holder));
	if (dt <= 0) return;
	const holders = [...new Set(s.transmissions.map((x) => x.holder))].sort((a, b) => a - b);
	for (const holder of holders) {
		const link = routed.get(holder as EntityId);
		if (!link) continue;
		const queue = queueOf(core, holder);
		if (link.route.length > 0) {
			// at the route's shared rate; "commands only" still moves command items
			let left = (link.rate ?? 0) * dt;
			let commands = COMMAND_RATE * dt;
			for (const item of queue) {
				const command = priorityOf(core, item.item) < 0;
				const budget = command ? Math.max(left, commands) : left;
				if (budget <= 0) break;
				const need = item.item.bits - item.sent;
				const sent = Math.min(need, budget);
				item.sent += sent;
				if (command) commands -= sent;
				left = Math.max(0, left - sent);
				if (item.sent >= item.item.bits - 1e-9) {
					s.transmissions = s.transmissions.filter((x) => x !== item);
					deliver(core, item, t);
				} else break; // one item at a time, in order
			}
			continue;
		}
		// store-and-forward: hand the head item to a relay that has a route (ADR 0189 point 4)
		const head = queue[0];
		if (!head || head.hops >= MAX_CUSTODY_HOPS) continue;
		const to = custodian(core, holder, link, head.item.bits);
		if (!to || to.rate <= 0) continue;
		head.sent = Math.min(head.item.bits, head.sent + to.rate * dt);
		if (head.sent >= head.item.bits - 1e-9) {
			head.holder = Number(to.vessel);
			head.sent = 0;
			head.hops += 1;
		}
	}
}

/** Cached next contacts of holders without a route (ADR 0189 point 6). */
const contacts = new WeakMap<SimCore, Map<number, { at: number | null; until: number }>>();

function contactOf(core: SimCore, holder: number): number | null {
	let cache = contacts.get(core);
	if (!cache) contacts.set(core, (cache = new Map()));
	const hit = cache.get(holder);
	if (hit && core.t < hit.until && (hit.at === null || hit.at > core.t)) return hit.at;
	const at = nextDirectContact(core, holder as EntityId);
	cache.set(holder, { at, until: core.t + 60 });
	return at;
}

/** `Snapshot.network.queues`, or undefined with nothing queued. */
export function queuesSnapshot(core: SimCore): NonNullable<Snapshot['network']>['queues'] {
	if (!commsOn(core) || core.commsState.transmissions.length === 0) return undefined;
	const holders = [...new Set(core.commsState.transmissions.map((x) => x.holder))].sort(
		(a, b) => a - b
	);
	return holders
		.filter((h) => core.world.has(h as EntityId, VESSEL))
		.map((holder) => {
			const link = core.comms.links.get(holder as EntityId);
			const routed = !!link && link.route.length > 0;
			const nextContact = routed ? core.t : contactOf(core, holder);
			const rate = link?.rate ?? 0;
			let clock = nextContact;
			const queue = queueOf(core, holder);
			const custody = queue.some((q) => q.origin !== holder) ? `vessel:${holder}` : null;
			return {
				vessel: holder as EntityId,
				custody,
				nextContact: routed ? null : nextContact,
				items: queue.map((q) => {
					let eta: number | null = null;
					if (clock !== null && rate > 0) {
						clock += (q.item.bits - q.sent) / rate;
						eta = clock;
					}
					return {
						id: q.item.id,
						kind: q.item.kind,
						bits: q.item.bits,
						sent: q.sent,
						origin: q.origin as EntityId,
						eta
					};
				})
			};
		});
}
