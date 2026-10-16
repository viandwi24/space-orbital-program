import { describe, expect, test } from 'bun:test';
import type { RGB } from '../src/atmosphere-model.ts';
import {
	CIRRUS_ALTITUDE,
	CLOUD_ALTITUDE,
	CLOUD_LAYERS,
	compositeLayers,
	emptyLayer,
	sortLayers,
	type LayerSample
} from '../src/cloud-model.ts';

const END = { inscatter: [0.3, 0.4, 0.6] as RGB, transmittance: [0.8, 0.7, 0.5] as RGB };
const BASE: RGB = [0.2, 0.5, 0.1];
const noCloud = (): RGB => [
	END.inscatter[0] + END.transmittance[0] * BASE[0],
	END.inscatter[1] + END.transmittance[1] * BASE[1],
	END.inscatter[2] + END.transmittance[2] * BASE[2]
];
const layer = (over: Partial<LayerSample>): LayerSample => ({
	distance: 5_000,
	alpha: 0,
	radiance: [1, 1, 1],
	inscatter: [0.1, 0.12, 0.2],
	transmittance: [0.9, 0.85, 0.7],
	...over
});

describe('cloud layers', () => {
	test('layers are ordered cumulus below cirrus and both sit inside the atmosphere', () => {
		expect(CLOUD_LAYERS.map((l) => l.name)).toEqual(['cumulus', 'cirrus']);
		expect(CLOUD_ALTITUDE).toBeLessThan(CIRRUS_ALTITUDE);
		for (const l of CLOUD_LAYERS) {
			expect(l.altitude).toBeGreaterThan(0);
			expect(l.altitude).toBeLessThan(70_000);
		}
	});

	test('with alpha 0 the composite equals the cloud-free result', () => {
		const near = layer({
			distance: 4_000,
			inscatter: [0.1, 0.1, 0.1],
			transmittance: [0.95, 0.95, 0.9]
		});
		const far = layer({
			distance: 9_000,
			inscatter: [0.2, 0.25, 0.4],
			transmittance: [0.85, 0.8, 0.6]
		});
		const out = compositeLayers(BASE, END, [near, far]);
		const expected = noCloud();
		for (let c = 0; c < 3; c++) expect(out[c]!).toBeCloseTo(expected[c]!, 12);
	});

	test('a layer the ray misses (snapshotted at the end) changes nothing', () => {
		const out = compositeLayers(BASE, END, [emptyLayer(END), emptyLayer(END)]);
		const expected = noCloud();
		for (let c = 0; c < 3; c++) expect(out[c]!).toBeCloseTo(expected[c]!, 12);
	});

	test('an opaque near layer hides the far layer and the surface', () => {
		const near = layer({ alpha: 1, radiance: [0.9, 0.9, 0.9] });
		const far = layer({
			distance: 20_000,
			alpha: 1,
			radiance: [0, 1, 0],
			inscatter: [0.2, 0.2, 0.3],
			transmittance: [0.7, 0.7, 0.6]
		});
		const out = compositeLayers(BASE, END, [near, far]);
		for (let c = 0; c < 3; c++) {
			expect(out[c]!).toBeCloseTo(
				near.inscatter[c]! + near.transmittance[c]! * near.radiance[c]!,
				12
			);
		}
		// and with a different surface or far layer the result does not move
		const other = compositeLayers([1, 0, 0], END, [near, { ...far, radiance: [5, 5, 5] }]);
		for (let c = 0; c < 3; c++) expect(other[c]!).toBeCloseTo(out[c]!, 12);
	});

	test('a translucent layer blends its own light with what is behind it', () => {
		const half = layer({ alpha: 0.5, radiance: [1, 1, 1] });
		const out = compositeLayers(BASE, END, [half, emptyLayer(END)]);
		const behind = END.inscatter[1]! - half.inscatter[1]! + END.transmittance[1]! * BASE[1]!;
		expect(out[1]!).toBeCloseTo(
			half.inscatter[1]! + 0.5 * half.transmittance[1]! * 1 + 0.5 * behind,
			12
		);
	});

	test('sorting puts the nearest cloud first and misses last, and the composite follows the order', () => {
		const a = layer({ distance: 3_000, alpha: 0.4 });
		const b = layer({ distance: 12_000, alpha: 0.4, radiance: [0.5, 0.5, 1] });
		const miss = layer({ distance: 1_000, alpha: 0 });
		expect(sortLayers([b, miss, a])).toEqual([a, b, miss]);
	});

	test('the order of empty slots does not matter', () => {
		const one = layer({ alpha: 0.6, distance: 6_000 });
		const e = emptyLayer(END);
		const x = compositeLayers(BASE, END, [one, e, e]);
		const y = compositeLayers(BASE, END, [one, e]);
		for (let c = 0; c < 3; c++) expect(x[c]!).toBeCloseTo(y[c]!, 12);
	});
});
