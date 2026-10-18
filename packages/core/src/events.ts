/**
 * Typed event bus. `EventMap` is an open interface: plugins add events by module augmentation of
 * the declaring module (`interface EventMap { 'reactor:meltdown': { part: PartId } }`), after which
 * `on('reactor:meltdown', e => e.part)` is typed and unknown names are type errors. Plan 005
 * settles which module specifier SDK users augment (the SDK re-exports this interface).
 */
import type { MilestoneKind } from './milestones.ts';
import type { NewDataItem } from './data.ts';
import type { EntityId } from './ids.ts';
import type { VesselMode } from './protocol.ts';

export interface EventMap {
	'world:entity-added': { id: EntityId };
	'world:entity-removed': { id: EntityId };
	/** A vessel switched between physics (`flight`) and Kepler propagation (`on-rails`). */
	'vessel:mode-changed': { vessel: EntityId; mode: VesselMode; reason: string };
	/** A vessel was loaded, or split off `from` another one. */
	'vessel:created': { vessel: EntityId; from?: EntityId };
	'vessel:destroyed': { vessel: EntityId; reason: string };
	/**
	 * A vessel crossed a sphere of influence boundary (plan 044, ADR 0051): `from` and `to` are body
	 * ids. Its state is now relative to `to`.
	 */
	'vessel:soi-changed': { vessel: EntityId; from: string; to: string };
	/** A maneuver node was burned off (its time has passed and under 0.5 m/s remained; plan 045). */
	'vessel:maneuver-complete': { vessel: EntityId; node: number };
	/** The vessel's target no longer exists (it was destroyed or removed); the target is cleared (plan 035). */
	'vessel:target-lost': { vessel: EntityId; target: number };
	/** A world rule changed by `set-rule` (plan 078); `time` is the sim time of the change. */
	'world:rule-changed': {
		rule: string;
		from: boolean | number | string;
		to: boolean | number | string;
		time: number;
	};
	/** A started contract or mission finished its objectives (plan 098, ADR 0175). */
	'objective:completed': {
		id: string;
		source: { kind: 'contract' | 'mission'; id: string };
		time: number;
	};
	/** A started contract or mission failed (a failed leaf or a passed deadline). */
	'objective:failed': {
		id: string;
		source: { kind: 'contract' | 'mission'; id: string };
		time: number;
		reason: string;
	};
	/** Crew (plan 106, ADR 0176): hired, XP booked at a recovery, lost with a vessel, back from missing. */
	'crew:hired': { member: string; name: string; profession: string };
	'crew:xp': { member: string; place: string; xp: number; level: number };
	'crew:lost': { member: string; vessel: EntityId; status: 'lost' | 'missing' | 'available' };
	'crew:returned': { member: string };
	/** Crew simulation (plan 107, ADR 0181): a consumable ran out at `time` (exact under warp). */
	'crew:shortage': { vessel: EntityId; member: string; resource: string; time: number };
	'crew:resupplied': { vessel: EntityId; member: string; resource: string };
	'crew:g-loc': { vessel: EntityId; member: string; until: number };
	/** A site was founded (plan 092, ADR 0177); its flat zone applies from the next load. */
	'site:founded': { site: string; body: string; latitude: number; longitude: number };
	/** Science (plan 103, ADR 0178): a result was made, and science was credited. */
	'science:result': {
		vessel: EntityId;
		part: EntityId;
		subject: string;
		value: number;
		kind: 'data' | 'sample';
	};
	/** A world's first (plan 102, ADR 0147 point 2). */
	'milestone:reached': {
		id: string;
		kind: MilestoneKind;
		body?: string;
		vessel: EntityId;
		crewed: boolean;
		time: number;
	};
	/** Range safety (plan 127, ADR 0155 point 5): a drop or an ascent azimuth broke the range. */
	'range:violation': {
		vessel: EntityId;
		kind: 'site' | 'land' | 'azimuth';
		site?: string;
		latitude?: number;
		longitude?: number;
		azimuth?: number;
		penalised: boolean;
	};
	'science:credited': { subject: string; value: number; how: 'transmitted' | 'recovered' };
	/** Comms (plan 114, ADR 0179 point 4): `time` is when the link changed (bisected on rails). */
	'comms:link-up': { vessel: EntityId; to: string; time: number };
	'comms:link-down': { vessel: EntityId; reason: string; time: number };
	'comms:control-changed': { vessel: EntityId; control: 'full' | 'partial' | 'none' };
	/** A data item was stored on `part` of `vessel` (plan 083, ADR 0172). */
	'data:stored': { vessel: EntityId; part: EntityId; item: string };
	/** A data item could not be stored and is lost (`reason: 'full'`: no storage had room). */
	'data:dropped': {
		vessel: EntityId;
		item: NewDataItem;
		kind: string;
		bits: number;
		reason: 'full';
	};
	/** A game day began (plan 082, ADR 0171): emitted after the `world-tick` systems ran. */
	'world:tick': { day: number; time: number };
	/** A ledger entry was written (plan 095, ADR 0113). */
	'economy:entry': {
		time: number;
		currency: 'funds' | 'science' | 'reputation';
		amount: number;
		cause: string;
		ref?: string;
	};
	/** A stage fired (`stage` is the index into the design's `stages`). */
	'stage:activated': { vessel: EntityId; stage: number };
	/**
	 * A part was lost. `cause: 'impact'` (plan 012, ADR 0019): it hit the ground faster than its
	 * `impactTolerance`; `speed` is the closing speed in m/s and `broken` = cut off and flying on as
	 * debris, `destroyed` = removed from the world. `cause: 'overheat'` (plan 014, ADR 0023): its
	 * skin went above `maxTemperature` (`temperature`, K); `speed` is its airspeed and the outcome is
	 * always `destroyed`. `vessel` is the vessel the part belonged to at the time. Absent `cause`
	 * means `impact` (events from before API 0.1.4).
	 */
	'part:damaged': {
		vessel: EntityId;
		part: EntityId;
		definition: string;
		speed: number;
		outcome: 'broken' | 'destroyed';
		cause?: 'impact' | 'overheat';
		temperature?: number;
	};
}

export type EventHandler<P> = (payload: P) => void;

export interface EventBus<M extends object = EventMap> {
	/** Subscribe. Returns an unsubscribe function. The same handler is subscribed at most once. */
	on<K extends keyof M>(type: K, handler: EventHandler<M[K]>): () => void;
	/** Subscribe for exactly one delivery. Returns an unsubscribe function. */
	once<K extends keyof M>(type: K, handler: EventHandler<M[K]>): () => void;
	/** Unsubscribe a handler registered with `on` or `once`. No-op if not subscribed. */
	off<K extends keyof M>(type: K, handler: EventHandler<M[K]>): void;
	/**
	 * Deliver to the handlers subscribed at call time, in subscription order. Handlers added or
	 * removed during delivery affect only later emits. A throwing handler propagates to the emitter
	 * (errors are never swallowed) and later handlers for that emit are skipped.
	 */
	emit<K extends keyof M>(type: K, payload: M[K]): void;
}

export function createEventBus<M extends object = EventMap>(): EventBus<M> {
	// Storage is type-erased because one map holds handlers for different event types; `emit`
	// re-establishes the pairing (type -> payload) and is the only place that needs the cast.
	type Entry = { handler: EventHandler<never>; call: (payload: never) => void };
	const entries = new Map<keyof M, Entry[]>();

	function add<K extends keyof M>(type: K, handler: EventHandler<M[K]>, once: boolean): () => void {
		const list = entries.get(type) ?? [];
		const existing = list.find((e) => e.handler === handler);
		if (existing) return () => off(type, handler);
		const entry: Entry = {
			handler,
			call: (payload: M[K]) => {
				if (once) off(type, handler);
				handler(payload);
			}
		};
		entries.set(type, [...list, entry]);
		return () => off(type, handler);
	}

	function off<K extends keyof M>(type: K, handler: EventHandler<M[K]>): void {
		const list = entries.get(type);
		if (!list) return;
		const next = list.filter((e) => e.handler !== handler);
		if (next.length === 0) entries.delete(type);
		else entries.set(type, next);
	}

	return {
		on: (type, handler) => add(type, handler, false),
		once: (type, handler) => add(type, handler, true),
		off,
		emit(type, payload) {
			const list = entries.get(type);
			if (!list) return;
			for (const entry of list) {
				// Skip handlers removed by an earlier handler of this same emit.
				if (entries.get(type)?.includes(entry)) entry.call(payload as never);
			}
		}
	};
}
