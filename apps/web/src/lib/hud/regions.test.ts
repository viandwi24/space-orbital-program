/** The Regions layer of map view (plan 192, ADR 0180): the toggle (in the filter row since plan 292) and the label under the cursor. */
import { loadPlugins, regionAt, regionsOf } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MapFilterBar from '../map/MapFilterBar.svelte';
import RegionsLayer from './RegionsLayer.svelte';
import { regionHoverLabel, regionLayer } from './regions-model';

const bodies = loadPlugins([Stock]).registries.bodies.list();
const terrain = { seed: 4242, zones: [] };

const layer = (on: boolean, hover: { label: string; x: number; y: number } | null) =>
	render(RegionsLayer, { props: { on, hover } }).body;
const bar = (on: boolean) =>
	render(MapFilterBar, { props: { regions: { on, ontoggle: () => {} } } }).body;

describe('the Regions layer', () => {
	it('lists the bodies with regions; the home body carries the world terrain', () => {
		const layer = regionLayer(bodies, terrain, 'stock.home');
		expect(layer.map((l) => l.id).sort()).toEqual(['stock.cinder', 'stock.home']);
		expect(layer.find((l) => l.id === 'stock.home')!.world).toEqual(terrain);
		expect(layer.find((l) => l.id === 'stock.cinder')!.world).toBeUndefined();
	});
	it('the toggle is a chip in the map filter row (plan 292); the hover label shows only with it on', () => {
		const chip = (html: string) =>
			/<button[^>]*data-testid="map-regions"[^>]*>/.exec(html)?.[0] ?? '';
		expect(chip(bar(true))).toContain('aria-pressed="true"');
		expect(chip(bar(true))).toContain('data-tip="Science regions"');
		expect(chip(bar(false))).toContain('aria-pressed="false"');
		expect(render(MapFilterBar, { props: {} }).body).not.toContain('map-regions');
		expect(layer(true, { label: 'Cinder · Maria', x: 10, y: 20 })).toContain('Cinder · Maria');
		expect(layer(false, { label: 'Cinder · Maria', x: 10, y: 20 })).not.toContain(
			'map-region-hover'
		);
	});
	it('the hover label names the region regionAt finds there', () => {
		const moon = bodies.find((b) => b.id === 'stock.cinder')!;
		const direction = { x: 0.6, y: 0.48, z: 0.64 };
		const id = regionAt(moon, direction);
		const label = regionsOf(moon).find((r) => r.id === id)!.label;
		expect(
			regionHoverLabel(bodies, { body: 'stock.cinder', direction }, terrain, 'stock.home')
		).toMatch(new RegExp(`· ${label}$`));
		expect(regionHoverLabel(bodies, null, terrain, 'stock.home')).toBeNull();
		const home = bodies.find((b) => b.id === 'stock.home')!;
		const homeId = regionAt(home, direction, terrain);
		expect(
			regionHoverLabel(bodies, { body: 'stock.home', direction }, terrain, 'stock.home')
		).toContain(regionsOf(home).find((r) => r.id === homeId)!.label);
	});
});
