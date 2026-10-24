/** The bakes of other bodies in flight (plan 403): the baker, the store and the callbacks. */
import { describe, expect, test } from 'bun:test';
import type { BodyAppearance } from '@orbital/core';
import { BodyBakes, type BakeTarget } from '../src/body-bakes.ts';
import type { Baker } from '../src/body-baker.ts';
import { bakeBytes } from '../src/body-bake-model.ts';
import { bakeKey, memoryStore, packBake, unpackBake } from '../src/body-bake-cache.ts';
import { inlineBaker } from '../src/body-baker.ts';
import { bakeMap, bakeField } from '../src/body-bake.ts';
import { lookSeed } from '../src/body-look.ts';
import Stock from '@orbital/mod-stock';
import { loadPlugins } from '@orbital/core';

const SIZE = { width: 16, height: 8 };
const BYTES = SIZE.width * SIZE.height * 4;
const look = { palette: ['#c9c6c0', '#8f8c87'], pattern: 'mottled' } as BodyAppearance;
const body = (id: string) => ({ id, radius: 1000, terrain: { kind: 'craters' as const, seed: 1 } });
const target = (id: string, px: number): BakeTarget => ({ id, body: body(id), look, px });
const settle = () => new Promise((r) => setTimeout(r, 5));

function rig(budgetBytes: number, store = memoryStore()) {
	const baked: string[] = [];
	const ready: Array<[string, string]> = [];
	const evicted: string[] = [];
	const baker: Baker = {
		bake: async (job) => {
			baked.push(job.id);
			return new Uint8Array(BYTES).fill(job.id.charCodeAt(0));
		},
		cancel: () => {},
		dispose: () => {}
	};
	const bakes = new BodyBakes({
		baker,
		store,
		size: SIZE,
		budgetBytes,
		onReady: (id, _bytes, _size, from) => ready.push([id, from]),
		onEvict: (id) => evicted.push(id)
	});
	return { bakes, baked, ready, evicted, store };
}

describe('the bakes in flight', () => {
	test('while the player flies nothing starts and nothing lands; it all comes when the hold ends', async () => {
		const r = rig(10 * bakeBytes(SIZE));
		r.bakes.frame([target('a', 300)], true);
		await settle();
		expect(r.baked).toEqual([]);
		r.bakes.frame([target('a', 300)], false);
		await settle();
		expect(r.baked).toEqual(['a']);
		// a bake that finishes under a hold waits to be taken in
		const q = rig(10 * bakeBytes(SIZE));
		q.bakes.frame([target('b', 300)]);
		q.bakes.frame([target('b', 300)], true);
		await settle();
		expect(q.ready).toEqual([]);
		q.bakes.frame([target('b', 300)], false);
		expect(q.ready).toEqual([['b', 'baked']]);
	});

	test('a body under the near size is not baked; a near one is, once', async () => {
		const r = rig(10 * bakeBytes(SIZE));
		r.bakes.frame([target('a', 10)]);
		await settle();
		expect(r.baked).toEqual([]);
		r.bakes.frame([target('a', 300)]);
		await settle();
		r.bakes.frame([target('a', 300)]);
		await settle();
		expect(r.baked).toEqual(['a']);
		expect(r.ready).toEqual([['a', 'baked']]);
		expect(r.bakes.ready()).toEqual(['a']);
	});

	test('with room for one, the body in view keeps it and the other waits until it is out of view', async () => {
		const r = rig(bakeBytes(SIZE));
		r.bakes.frame([target('a', 100), target('b', 400)]);
		await settle();
		expect(r.baked).toEqual(['b']);
		// a is nearer now, but b is still in view: nothing is dropped, nothing baked
		r.bakes.frame([target('a', 500), target('b', 80)]);
		await settle();
		expect(r.evicted).toEqual([]);
		expect(r.baked).toEqual(['b']);
		// b is under the far size: it goes, and a takes the room
		r.bakes.frame([target('a', 500), target('b', 10)]);
		await settle();
		r.bakes.frame([target('a', 500), target('b', 10)]);
		await settle();
		expect(r.evicted).toEqual(['b']);
		expect(r.baked).toEqual(['b', 'a']);
		expect(r.bakes.ready()).toEqual(['a']);
	});

	test('a map the store already has is used and not baked; what is baked is stored for the next visit', async () => {
		const store = memoryStore();
		const first = rig(10 * bakeBytes(SIZE), store);
		first.bakes.frame([target('a', 300)]);
		await settle();
		await settle();
		expect(store.size).toBe(1);
		const second = rig(10 * bakeBytes(SIZE), store);
		second.bakes.frame([target('a', 300)]);
		await settle();
		await settle();
		expect(second.baked).toEqual([]);
		expect(second.ready).toEqual([['a', 'cache']]);
	});

	test('a change of preset drops what is resident and bakes again at the new size', async () => {
		const r = rig(10 * bakeBytes(SIZE));
		r.bakes.frame([target('a', 300)]);
		await settle();
		r.bakes.setPreset(null, 0);
		expect(r.evicted).toEqual(['a']);
		r.bakes.frame([target('a', 300)]);
		await settle();
		expect(r.baked).toEqual(['a']);
	});
});

describe('the cache', () => {
	test('a map packs and unpacks to the same bytes; a damaged entry is refused', async () => {
		const bytes = new Uint8Array(BYTES).map((_, i) => (i * 7) % 251);
		const packed = await packBake(bytes);
		const back = await unpackBake(packed, BYTES);
		expect(back && back.every((v, i) => v === bytes[i])).toBe(true);
		expect(await unpackBake(packed, BYTES + 4)).toBeUndefined();
		expect(await unpackBake(new Uint8Array([0x1f, 0x8b, 1, 2, 3]), BYTES)).toBeUndefined();
	});

	test('the key changes with anything the map is made from', () => {
		const b = body('x');
		const k = bakeKey(b, look, SIZE);
		expect(bakeKey(b, look, SIZE)).toBe(k);
		expect(bakeKey({ ...b, radius: 2000 }, look, SIZE)).not.toBe(k);
		expect(bakeKey({ ...b, terrain: { kind: 'craters', seed: 2 } }, look, SIZE)).not.toBe(k);
		expect(bakeKey(b, { ...look, palette: ['#000000'] } as BodyAppearance, SIZE)).not.toBe(k);
		expect(bakeKey(b, look, { width: 32, height: 16 })).not.toBe(k);
	});
});

describe('the inline baker', () => {
	test('gives the bytes the bake function gives', async () => {
		const { registries } = loadPlugins([Stock]);
		const cinder = registries.bodies.get('stock.cinder')!;
		const got = await inlineBaker().bake({
			id: cinder.id,
			body: cinder,
			look,
			seed: lookSeed(cinder.id),
			size: SIZE
		});
		const want = bakeMap(look, lookSeed(cinder.id), bakeField(cinder), SIZE);
		expect(got && got.every((v, i) => v === want[i])).toBe(true);
	});

	test('a cancelled bake gives null', async () => {
		const baker = inlineBaker(1);
		const job = {
			id: 'a',
			body: body('a'),
			look,
			seed: 1,
			size: { width: 64, height: 64 }
		};
		const p = baker.bake(job);
		baker.cancel('a');
		expect(await p).toBeNull();
	});
});
