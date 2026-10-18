/**
 * Plan 125 / ADR 0122 points 1 and 7: the DE440 asset against JPL's own test points. The fixture is
 * the 2025–2026 cut of NAIF's de440s.bsp made by `tools/pack-de440.ts`, and the test points are the
 * lines of JPL's testpo.440 for those years (docs/research/ephemerides.md).
 */
import { describe, expect, test } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { barycentricState, DE440_AU, readEphemeris, writeEphemeris } from '../src/index.ts';

const here = new URL('./fixtures/', import.meta.url);
const asset = readEphemeris(
	new Uint8Array(
		gunzipSync(
			new Uint8Array(await Bun.file(new URL('de440-2025-2026.bin.gz', here)).arrayBuffer())
		)
	)
);
/** testpo's body numbers to NAIF ids (3 the Earth, 10 the Moon, 11 the Sun, 12 the barycentre, 13 the Earth–Moon barycentre). */
const NAIF: Record<number, number> = {
	1: 1,
	2: 2,
	3: 399,
	4: 4,
	5: 5,
	6: 6,
	7: 7,
	8: 8,
	9: 9,
	10: 301,
	11: 10,
	12: 0,
	13: 3
};

describe('the DE440 asset', () => {
	test("JPL's test points for 2025 and 2026 within 1e-12 AU (and 1e-14 AU/day)", async () => {
		const lines = (await Bun.file(new URL('testpo-2025-2026.440', here)).text()).trim().split('\n');
		let checked = 0;
		for (const line of lines) {
			const [, , jed, t, c, x, value] = line.trim().split(/\s+/).map(Number) as number[];
			if (t! > 13 || c! > 13) continue; // nutations and librations are not kept
			const sec = (jed! - 2_451_545) * 86_400;
			const a = barycentricState(asset, NAIF[t!]!, sec);
			const b = barycentricState(asset, NAIF[c!]!, sec);
			const k = (['x', 'y', 'z'] as const)[(x! - 1) % 3]!;
			const got = x! <= 3 ? (a.r[k] - b.r[k]) / DE440_AU : ((a.v[k] - b.v[k]) / DE440_AU) * 86_400;
			expect(Math.abs(got - value!)).toBeLessThan(x! <= 3 ? 1e-12 : 1e-14);
			checked++;
		}
		expect(checked).toBeGreaterThan(15);
	});

	test('an asset writes and reads back to the bit', () => {
		const again = readEphemeris(writeEphemeris(asset));
		expect(again.segments).toEqual(asset.segments);
		expect(again.data).toEqual(asset.data);
	});
});
