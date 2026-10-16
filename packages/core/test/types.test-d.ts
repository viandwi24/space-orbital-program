/**
 * Compile-time tests: checked by `tsc` (bun run typecheck), never executed (the name does not match
 * bun's test discovery). `@ts-expect-error` fails the build if the line below it stops being an error.
 */
import {
	createEventBus,
	createWorld,
	defineComponent,
	type EntityId,
	type EventMap,
	type PartId
} from '../src/index.ts';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <_T extends true>(): void => {};

// A plugin augments the open EventMap (what a mod does via module augmentation).
declare module '../src/events.ts' {
	interface EventMap {
		'test:meltdown': { part: PartId; temperature: number };
	}
}

const events = createEventBus();

// Core events are typed: payload of world:entity-added has `id: EntityId`.
events.on('world:entity-added', (e) => {
	assertType<Equal<typeof e.id, EntityId>>();
	// @ts-expect-error -- no such field on the payload
	e.nope;
});

// Augmented events are typed too.
events.on('test:meltdown', (e) => {
	assertType<Equal<typeof e.part, PartId>>();
	assertType<Equal<typeof e.temperature, number>>();
});

// Unknown event names are a type error.
// @ts-expect-error -- "nope" is not a key of EventMap
events.on('nope', () => {});
// @ts-expect-error -- unknown name for once
events.once('nope', () => {});
// @ts-expect-error -- unknown name for emit
events.emit('nope', {});

// Payloads are checked on emit.
// @ts-expect-error -- wrong payload shape
events.emit('world:entity-added', { id: 'not-a-number' });

// Keys of EventMap include the core events.
assertType<Equal<'world:entity-added' extends keyof EventMap ? true : false, true>>();

// Typed component tokens flow into get/add.
const Hp = defineComponent<{ hp: number }>('test.hp');
const w = createWorld();
const id = w.createEntity();
w.add(id, Hp, { hp: 3 });
const hp = w.get(id, Hp);
assertType<Equal<typeof hp, { hp: number } | undefined>>();
// @ts-expect-error -- wrong component value type
w.add(id, Hp, { hp: 'x' });
// @ts-expect-error -- a plain number is not an EntityId
w.get(5, Hp);
