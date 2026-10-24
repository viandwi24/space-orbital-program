/** Plan 406 (ADR 0363): a hills body is seen from far in the colours its ground has. */
import { describe, expect, test } from 'bun:test';
import { SEA_LEVEL, generatePlanetMap, terrainShift, type PlanetMap } from '@orbital/core';
import { hillsColour, hillsRows, type HillsLook } from '../src/hills-look.ts';
import { MOON_SEA } from '../src/moon.ts';

const flat = (e: number, moist = 0.5, temp = 0.5, rock = 0): PlanetMap => ({
	width: 128,
	height: 64,
	data: Uint8Array.from({ length: 128 * 64 * 4 }, (_, k) =>
		Math.round(255 * [e, moist, temp, rock][k % 4]!)
	)
});
const look = (
	map: PlanetMap,
	sea: {
		deep: readonly [number, number, number];
		shallow: readonly [number, number, number];
	} = MOON_SEA
): HillsLook => ({
	map,
	shift: terrainShift(77),
	radius: 600_000,
	deep: sea.deep,
	shallow: sea.shallow
});
const size = { width: 64, height: 32 };
const meanOf = (out: Uint8Array): [number, number, number] => {
	const m: [number, number, number] = [0, 0, 0];
	for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) m[c]! += out[i + c]!;
	return m.map((x) => x / (out.length / 4)) as [number, number, number];
};
const render = (l: HillsLook): Uint8Array => {
	const out = new Uint8Array(size.width * size.height * 4);
	hillsRows(l, size, out, 0, size.height);
	return out;
};

describe('hillsColour', () => {
	test('is sea under the sea level, land over it, and snow on the cold', () => {
		const [dr, dg, db] = hillsColour(0.2, 0.5, 0.5, 0, MOON_SEA.deep, MOON_SEA.shallow);
		expect(db).toBeGreaterThan(dr);
		expect(dg + db).toBeLessThan(0.2);
		const grass = hillsColour(0.6, 0.5, 0.6, 0, MOON_SEA.deep, MOON_SEA.shallow);
		expect(grass[1]).toBeGreaterThan(grass[0]);
		const snow = hillsColour(0.6, 0.5, 0.05, 0, MOON_SEA.deep, MOON_SEA.shallow);
		expect(snow[0]).toBeGreaterThan(0.5);
		expect(hillsColour(SEA_LEVEL - 0.3, 0.5, 0.5, 0, [1, 0, 0], [1, 0, 0])).toEqual([1, 0, 0]);
	});
});

describe('the far map of a hills body', () => {
	test('is the same bytes every time, and follows the biome map', () => {
		const sea = render(look(flat(0.2)));
		const land = render(look(flat(0.6)));
		expect(render(look(flat(0.2)))).toEqual(sea);
		expect(meanOf(sea)[2]).toBeGreaterThan(meanOf(sea)[0]);
		expect(meanOf(land)[1]).toBeGreaterThan(meanOf(land)[2]);
	});
	test("takes a mod's sea colours", () => {
		const teal = { deep: [0.0, 0.2, 0.15] as const, shallow: [0.1, 0.5, 0.4] as const };
		const out = render(look(flat(0.2), teal));
		const [r, g, b] = meanOf(out);
		expect(g).toBeGreaterThan(b);
		expect(g).toBeGreaterThan(r);
	});
	test('a generated map has both sea and land', () => {
		const out = render(look(generatePlanetMap(256, { seed: 77 })));
		let blue = 0;
		let green = 0;
		for (let i = 0; i < out.length; i += 4) {
			if (out[i + 2]! > out[i + 1]! && out[i + 2]! > out[i]!) blue++;
			else green++;
		}
		expect(blue).toBeGreaterThan(50);
		expect(green).toBeGreaterThan(50);
	});
});
