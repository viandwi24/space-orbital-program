/**
 * Typed event bus. `EventMap` is an open interface: plugins add events by module augmentation of
 * the declaring module (`interface EventMap { 'reactor:meltdown': { part: PartId } }`), after which
 * `on('reactor:meltdown', e => e.part)` is typed and unknown names are type errors. Plan 005
 * settles which module specifier SDK users augment (the SDK re-exports this interface).
 */
import type { EntityId } from './ids.ts';

export interface EventMap {
	'world:entity-added': { id: EntityId };
	'world:entity-removed': { id: EntityId };
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
