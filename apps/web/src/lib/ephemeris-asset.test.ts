/** The DE440 asset on the page (plan 125, ADR 0122 point 7): fetched once, checked, cached. */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadEphemeris, needsEphemeris, type EphemerisDeps } from './ephemeris-asset';

const raw = new TextEncoder().encode('ORBEPH01 pretend asset');
const gz = gzipSync(raw);
const asset = {
	path: '/ephemeris/test.bin.gz',
	bytes: gz.length,
	sha256: createHash('sha256').update(gz).digest('hex')
};
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function deps(body: Uint8Array = gz) {
	const stored = new Map<string, ArrayBuffer>();
	let fetches = 0;
	const d: EphemerisDeps = {
		fetch: async () => (fetches++, { ok: true, status: 200, arrayBuffer: async () => buf(body) }),
		cache: { get: async (k) => stored.get(k), put: async (k, v) => void stored.set(k, v) },
		digest: async (data) => createHash('sha256').update(new Uint8Array(data)).digest('hex'),
		gunzip: async (data) => buf(gunzipSync(new Uint8Array(data)))
	};
	return { d, fetches: () => fetches };
}

describe('the DE440 asset', () => {
	it('is fetched once, then read from the cache', async () => {
		const { d, fetches } = deps();
		expect(new Uint8Array(await loadEphemeris(d, asset))).toEqual(raw);
		expect(new Uint8Array(await loadEphemeris(d, asset))).toEqual(raw);
		expect(fetches()).toBe(1);
	});
	it('a wrong file is refused by its size, then by its checksum', async () => {
		await expect(loadEphemeris(deps(gzipSync(new TextEncoder().encode('x'))).d, asset)).rejects.toThrow(/bytes, expected/);
		const same = new Uint8Array(gz);
		same[same.length - 1] ^= 1;
		await expect(loadEphemeris(deps(same).d, asset)).rejects.toThrow('the ephemeris failed its checksum');
	});
	it('only an n-body world of the 1:1 Sol system needs it', () => {
		expect(needsEphemeris({ gravityModel: 'n-body', systemId: 'sol', variant: '1:1' })).toBe(true);
		expect(needsEphemeris({ gravityModel: 'n-body', systemId: 'sol', variant: 'rescaled' })).toBe(false);
		expect(needsEphemeris({ gravityModel: 'patched', systemId: 'sol', variant: '1:1' })).toBe(false);
		expect(needsEphemeris({ gravityModel: 'n-body', systemId: 'stock', variant: 'default' })).toBe(false);
	});
});
