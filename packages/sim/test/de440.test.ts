/** Plan 125 / ADR 0122 point 7: Sol's bodies on JPL's DE440 within the asset's span, their own paths outside it. */
import { describe, expect, test } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import { readEphemeris } from '@orbital/kepler';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const fixture = new URL('../../kepler/test/fixtures/de440-2025-2026.bin.gz', import.meta.url);
const ephemeris = readEphemeris(new Uint8Array(gunzipSync(new Uint8Array(await Bun.file(fixture).arrayBuffer()))));
// 2025-07-01, inside the fixture's span
const world = (gravityModel: 'patched' | 'n-body'): WorldInfo => ({
	...legacyWorldInfo(7),
	id: '5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c',
	systemId: 'sol',
	systemVersion: '0.1.0',
	variant: '1:1',
	gravityModel,
	epoch: { day: 9_313, fraction: 0 }
});
const bodyAt = (snap: { bodies: { id: string; position: { x: number; y: number; z: number } }[] }, id: string) =>
	snap.bodies.find((b) => b.id === id)!.position;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rel = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({
	x: a.x - b.x,
	y: a.y - b.y,
	z: a.z - b.z
});

describe('DE440 in a Sol world', () => {
	test('with the asset the Moon and the Earth follow JPL, close to their own series and Level A paths', async () => {
		const own = await createSim({ plugins: [Stock, Sol], backendFactory: rapier(8), world: world('patched') });
		const jpl = await createSim({ plugins: [Stock, Sol], backendFactory: rapier(8), world: world('n-body'), ephemeris });
		const a = own.snapshot();
		const b = jpl.snapshot();
		const moonOwn = rel(bodyAt(a, 'sol.moon'), bodyAt(a, 'sol.earth'));
		const moonJpl = rel(bodyAt(b, 'sol.moon'), bodyAt(b, 'sol.earth'));
		// the Almanac series is good to 0.3° (about 2 000 km; measured 1 114 km); a frame mistake (the
		// equator for the ecliptic) would be 10⁵ km off
		expect(dist(moonOwn, moonJpl)).toBeLessThan(2_100_000);
		// Level A is good to tens of arcseconds about the Sun: measured 6 352 km
		expect(dist(bodyAt(a, 'sol.earth'), bodyAt(b, 'sol.earth'))).toBeLessThan(50_000_000);
		expect(dist(bodyAt(a, 'sol.earth'), bodyAt(b, 'sol.earth'))).toBeGreaterThan(0);
		own.dispose();
		jpl.dispose();
	});
});
