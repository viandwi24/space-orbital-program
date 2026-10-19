/** Plan 236 / ADR 0229: the branch picker's map, spot rules and the sites list. */
import { LEGACY_SITE, loadPlugins, branchHqOf, type Site } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import {
	branchId,
	branchMapPixels,
	branchSpot,
	keepOut,
	latLonText,
	latLonToMap,
	mapToLatLon,
	siteRows,
	type BranchContext
} from './branch-model';
import { buildReason } from './build-menu';

const { registries } = loadPlugins([Stock]);
const home = registries.bodies.get('stock.home')!;
const ctx = (over: Partial<BranchContext> = {}): BranchContext => ({
	sites: [LEGACY_SITE],
	home: { id: 'stock.home', radius: home.radius, rotationPeriod: home.rotationPeriod },
	terrain: { seed: 20261016, radius: home.radius },
	hq: branchHqOf(registries.buildings),
	...over
});

/** The first land spot on the equator east of the Legacy site past its keep-out ring. */
function landSpot(): { latitude: number; longitude: number } {
	for (let lon = 0.2; lon < Math.PI; lon += 0.01) {
		const s = branchSpot(0, lon, ctx());
		if (s.terrain.ground === 'land') return { latitude: 0, longitude: lon };
	}
	throw new Error('no land');
}

describe('the branch picker', () => {
	it('maps pixels to latitude and longitude and back, longitude 0 in the middle', () => {
		expect(mapToLatLon(179.5, 89.5)).toEqual({ latitude: 0, longitude: 0 });
		const p = latLonToMap(Math.PI / 4, -Math.PI / 2);
		expect(p.x).toBeCloseTo(90, 6);
		expect(p.y).toBeCloseTo(45, 6);
		expect(latLonToMap(0, 3 * Math.PI).x).toBeCloseTo(0, 6); // wraps to −π, the left edge
		expect(latLonText(0.2, -0.5)).toBe('11.5° N, 28.6° W');
	});

	it('draws the map: sea, coast and land all appear', () => {
		const px = branchMapPixels(ctx().terrain, 72, 36);
		expect(px.length).toBe(72 * 36 * 4);
		const colours = new Set<string>();
		for (let k = 0; k < px.length; k += 4) colours.add(`${px[k]},${px[k + 1]},${px[k + 2]}`);
		expect(colours.has('32,58,92')).toBe(true); // sea
		expect(colours.size).toBeGreaterThan(3);
		// a site's zone is drawn as the land it is shaped to
		const zoned = branchMapPixels(ctx().terrain, 360, 180, [LEGACY_SITE]);
		const mid = (90 * 360 + 180) * 4; // 0.5° from the Legacy site's centre
		expect([zoned[mid], zoned[mid + 1], zoned[mid + 2]]).toEqual([74, 112, 64]);
	});

	it('refuses the sea, a spot too close to a site, a full planet, and short funds', () => {
		let sea = null;
		for (let lon = -3; lon < 3 && !sea; lon += 0.05) {
			const s = branchSpot(0.3, lon, ctx());
			if (s.terrain.ground === 'sea') sea = s;
		}
		expect(sea!.problem).toBe('On the sea: a branch needs land');
		const near = branchSpot(0, 0.001, ctx());
		expect(near.problem).toMatch(/^Too close to Space Center \(1 km; at least 32 km\)$/);
		expect(keepOut(LEGACY_SITE)).toBe(32_000);
		const ok = landSpot();
		expect(branchSpot(ok.latitude, ok.longitude, ctx()).problem).toBeNull();
		expect(branchSpot(ok.latitude, ok.longitude, ctx({ funds: 1_000 })).problem).toBe(
			'Needs 250,000 funds, 1,000 available'
		);
		const full = Array.from({ length: 8 }, (_, k) => ({
			...LEGACY_SITE,
			id: `s${k}`,
			latitude: -1.2 + k * 0.3,
			longitude: -2
		}));
		expect(branchSpot(ok.latitude, ok.longitude, ctx({ sites: full })).problem).toMatch(
			/has 8 sites/
		);
		const s = branchSpot(ok.latitude, ok.longitude, ctx());
		expect(s.consequences.rotationBoost).toBeGreaterThan(100);
		expect(s.consequences.nearestSite).toBeGreaterThan(32_000);
	});

	it('names new branches and lists the sites with their ground stations', () => {
		expect(branchId([{ id: 'legacy' }])).toBe('branch-1');
		expect(branchId([{ id: 'legacy' }, { id: 'branch-1' }])).toBe('branch-2');
		const branch: Site = { ...LEGACY_SITE, id: 'b', name: 'East', kind: 'branch', longitude: 1 };
		const rows = siteRows(
			[LEGACY_SITE, branch],
			[{ id: 'site:legacy', range: 2_000_000 }],
			() => 'Home'
		);
		expect(rows.map((r) => [r.name, r.kind, r.station])).toEqual([
			['Space Center', 'Headquarters', 'Ground station · 2,000 km'],
			['East', 'Branch', 'No ground station']
		]);
		expect(rows[1]!.place).toBe('Home · 0.0° N, 57.3° E');
		expect(siteRows([LEGACY_SITE], undefined, () => 'Home')[0]!.station).toBe('Comms off');
	});

	it('the build menu: the HQ comes with a branch; a branch waits for its HQ', () => {
		const hq = registries.buildings.get('stock.branch-hq')!;
		const pad = registries.buildings.get('stock.launchpad-s')!;
		const home = { home: true, body: 'stock.home' };
		expect(buildReason(hq, home)).toBe('Comes with a new branch');
		expect(buildReason(pad, { ...home, hqPending: true })).toBe(
			'The branch HQ is still under construction'
		);
	});
});
