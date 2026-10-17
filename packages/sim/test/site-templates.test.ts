/** Stock site templates over 20 seeds (plan 092, ADR 0177). */
import { describe, expect, test } from 'bun:test';
import {
	createTerrainField,
	latLonDirection,
	loadPlugins,
	resolveSiteTemplate,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS
} from '@orbital/core';
import Stock, { STOCK_SITE_TEMPLATES } from '@orbital/mod-stock';

const loaded = loadPlugins([Stock]);
const RADIUS = 600_000;
const SEEDS = Array.from({ length: 20 }, (_, i) => 1_000 + i * 7_919);

/** Height variance (m²) of 64 points inside the flat radius, on the terrain of `seed` with the site's zone. */
function flatVariance(seed: number, latitude: number, longitude: number): number {
	const field = createTerrainField({
		radius: RADIUS,
		seed,
		zones: [{ latitude, longitude, flatRadius: SITE_FLAT_RADIUS, blendWidth: SITE_BLEND_WIDTH }]
	});
	const heights: number[] = [];
	for (let k = 0; k < 64; k++) {
		const r = (SITE_FLAT_RADIUS * 0.95 * ((k % 8) + 1)) / 8;
		const bearing = (Math.floor(k / 8) * Math.PI) / 4;
		const la = latitude + (r * Math.cos(bearing)) / RADIUS;
		const lo = longitude + (r * Math.sin(bearing)) / (RADIUS * Math.cos(latitude));
		heights.push(field.heightAt(latLonDirection(la, lo)));
	}
	const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
	return heights.reduce((a, h) => a + (h - mean) ** 2, 0) / heights.length;
}

describe('stock site templates', () => {
	test('stock registers five templates', () => {
		expect(loaded.report.registered['site-template'].map((e) => e.id)).toEqual(
			STOCK_SITE_TEMPLATES.map((t) => t.id)
		);
	});

	test('20 seeds: every template resolves inside its band, flat to under 1 m, the same each time', () => {
		const times: Record<string, number> = {};
		const relaxed: string[] = [];
		for (const seed of SEEDS) {
			for (const t of STOCK_SITE_TEMPLATES) {
				const t0 = performance.now();
				const r = resolveSiteTemplate(t, { seed, radius: RADIUS });
				times[t.id] = Math.max(times[t.id] ?? 0, performance.now() - t0);
				const [lo, hi] = t.criteria.absLatitude;
				expect(Math.abs(r.latitude)).toBeGreaterThanOrEqual(lo - 1e-12);
				expect(Math.abs(r.latitude)).toBeLessThanOrEqual(hi + 1e-12);
				expect(flatVariance(seed, r.latitude, r.longitude)).toBeLessThan(1);
				if (r.relaxed.length > 0) relaxed.push(`${seed} ${t.id}: ${r.relaxed.join(',')}`);
			}
		}
		const again = resolveSiteTemplate(STOCK_SITE_TEMPLATES[0], { seed: SEEDS[3]!, radius: RADIUS });
		expect(again).toEqual(
			resolveSiteTemplate(STOCK_SITE_TEMPLATES[0], { seed: SEEDS[3]!, radius: RADIUS })
		);
		console.log(
			`slowest resolve per template (ms, map cached after the first): ${JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)])))}`
		);
		console.log(`relaxed: ${relaxed.length === 0 ? 'none' : relaxed.join('; ')}`);
	}, 180_000);
});
