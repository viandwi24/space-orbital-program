import { describe, expect, test } from 'bun:test';
import { createEventBus, createWorld, defineComponent, deserializeWorld } from '../src/index.ts';

const Position = defineComponent<{ x: number; y: number }>('test.position');
const Name = defineComponent<string>('test.name');
const Samples = defineComponent<{ data: Float64Array }>('test.samples');

describe('world', () => {
	test('add / get / has / remove', () => {
		const w = createWorld();
		const e = w.createEntity();
		expect(w.hasEntity(e)).toBe(true);
		expect(w.get(e, Position)).toBeUndefined();
		w.add(e, Position, { x: 1, y: 2 });
		expect(w.has(e, Position)).toBe(true);
		expect(w.get(e, Position)).toEqual({ x: 1, y: 2 });
		expect(w.remove(e, Position)).toBe(true);
		expect(w.remove(e, Position)).toBe(false);
		expect(w.has(e, Position)).toBe(false);
	});

	test('entity ids are monotonic and never reused', () => {
		const w = createWorld();
		const a = w.createEntity();
		w.destroyEntity(a);
		const b = w.createEntity();
		expect(b).toBeGreaterThan(a);
	});

	test('add on a missing entity throws', () => {
		const w = createWorld();
		const e = w.createEntity();
		w.destroyEntity(e);
		expect(() => w.add(e, Name, 'x')).toThrow(/does not exist/);
	});

	test('destroyEntity removes components and reports absence', () => {
		const w = createWorld();
		const e = w.createEntity();
		w.add(e, Name, 'a');
		expect(w.destroyEntity(e)).toBe(true);
		expect(w.destroyEntity(e)).toBe(false);
		expect(w.get(e, Name)).toBeUndefined();
		expect(w.query([Name])).toEqual([]);
	});

	test('query returns entities with all components, ascending', () => {
		const w = createWorld();
		const a = w.createEntity();
		const b = w.createEntity();
		const c = w.createEntity();
		w.add(c, Position, { x: 0, y: 0 });
		w.add(a, Position, { x: 0, y: 0 });
		w.add(a, Name, 'a');
		w.add(b, Name, 'b');
		w.add(c, Name, 'c');
		expect(w.query([Position])).toEqual([a, c]);
		expect(w.query([Position, Name])).toEqual([a, c]);
		expect(w.query([Name])).toEqual([a, b, c]);
		expect(w.query([defineComponent('test.unused')])).toEqual([]);
	});

	test('emits world:entity-added / removed on the given bus', () => {
		const events = createEventBus();
		const log: string[] = [];
		events.on('world:entity-added', (e) => log.push(`+${e.id}`));
		events.on('world:entity-removed', (e) => log.push(`-${e.id}`));
		const w = createWorld({ events });
		const e = w.createEntity();
		w.destroyEntity(e);
		expect(log).toEqual([`+${e}`, `-${e}`]);
	});

	test('serialize -> deserialize round-trips deep-equal, through JSON too', () => {
		const w = createWorld();
		const a = w.createEntity();
		const b = w.createEntity();
		const gone = w.createEntity();
		w.add(a, Position, { x: 1.5, y: -2 });
		w.add(a, Name, 'alpha');
		w.add(b, Name, 'beta');
		w.add(gone, Name, 'gone');
		w.destroyEntity(gone);

		const data = w.serialize();
		const copy = deserializeWorld(data);
		expect(copy.serialize()).toEqual(data);
		expect(copy.query([Name])).toEqual([a, b]);
		expect(copy.get(a, Position)).toEqual({ x: 1.5, y: -2 });

		const viaJson = deserializeWorld(JSON.parse(JSON.stringify(data)));
		expect(viaJson.serialize()).toEqual(data);

		// ids are never reused after a round-trip
		expect(copy.createEntity()).toBeGreaterThan(gone);
	});

	test('serialize deep-copies: later mutation does not leak either way', () => {
		const w = createWorld();
		const e = w.createEntity();
		const pos = { x: 1, y: 1 };
		w.add(e, Position, pos);
		const data = w.serialize();
		pos.x = 99;
		expect(data.components['test.position']?.[String(e)]).toEqual({ x: 1, y: 1 });
		const copy = deserializeWorld(data);
		expect(copy.get(e, Position)).not.toBe(data.components['test.position']?.[String(e)]);
	});

	test('typed arrays survive serialize and are copied', () => {
		const w = createWorld();
		const e = w.createEntity();
		const data = new Float64Array([1, 2, 3]);
		w.add(e, Samples, { data });
		const s = w.serialize();
		data[0] = 42;
		const copy = deserializeWorld(s);
		expect(copy.get(e, Samples)?.data).toEqual(new Float64Array([1, 2, 3]));
	});

	test('deserialize rejects malformed data with a readable message', () => {
		expect(() => deserializeWorld({ formatVersion: 2 })).toThrow(/invalid world data/);
		expect(() => deserializeWorld(null)).toThrow(/invalid world data/);
		expect(() =>
			deserializeWorld({ formatVersion: 1, nextEntity: 1, entities: [5], components: {} })
		).toThrow(/nextEntity/);
		expect(() =>
			deserializeWorld({
				formatVersion: 1,
				nextEntity: 2,
				entities: [0],
				components: { 'test.name': { '1': 'x' } }
			})
		).toThrow(/unknown entity 1/);
	});
});
