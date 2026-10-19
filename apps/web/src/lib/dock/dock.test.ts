/** Dock panels on the page (plan 112, ADR 0149): the sample mod's panel, errors kept inside, the library. */
import type { PanelDefinition, PanelInput, Snapshot } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { PanelBeacon } from '../../../../../examples/mod-sample/src/index';
import { defaultSettings, parseSettings, serialiseSettings } from '../settings/settings';
import { addPanel, defaultDock, railOf, removePanel, togglePanel } from './dock-model';
import { commandOf, evaluatePanel, type PanelMemory } from './evaluate';
import ModPanel from './ModPanel.svelte';
import { panelInputOf } from './panel-input';

const R = 600_000;
const snapshot = (t: number, y: number): Snapshot =>
	({
		t,
		vessels: [
			{
				id: 7,
				mode: 'flight',
				soi: 'stock.home',
				position: { x: 0, y, z: 0 },
				velocity: { x: 0, y: 30, z: 0 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				parts: []
			}
		],
		bodies: []
	}) as unknown as Snapshot;
const input = (t: number, altitude: number): PanelInput =>
	panelInputOf(snapshot(t, R + altitude), 7 as never, [{ id: 'stock.home' as never, radius: R }]);

describe('the sample mod panel', () => {
	it('a readout bound to altitude updates with the snapshot; the sparkline keeps the values', () => {
		const memory: PanelMemory = new Map();
		const first = evaluatePanel(PanelBeacon, input(1, 120), memory);
		const second = evaluatePanel(PanelBeacon, input(2, 480), memory);
		expect(first.ok && second.ok).toBe(true);
		const altitude = (r: typeof first) =>
			r.ok && r.nodes.kind === 'section' && r.nodes.children[0]!.kind === 'readout'
				? r.nodes.children[0]!.value
				: undefined;
		expect(altitude(first)).toBe('120');
		expect(altitude(second)).toBe('480');
		const spark = second.ok && second.nodes.kind === 'section' ? second.nodes.children[2] : null;
		expect(spark).toMatchObject({ kind: 'sparkline', values: [120, 480], last: 480 });
	});

	it('renders on the page with its title values and canvas', () => {
		const html = render(ModPanel, {
			props: { panel: PanelBeacon, input: input(3, 250), oncommand: () => {} }
		}).body;
		expect(html).toContain('Altitude');
		expect(html).toContain('250');
		expect(html).toContain('<canvas');
	});

	it('its button gives a stage command for the active vessel', () => {
		expect(commandOf(PanelBeacon, 'v.3', input(1, 10))).toEqual({
			command: { type: 'stage', vessel: 7 }
		});
	});
});

describe('errors stay inside the panel', () => {
	const broken: PanelDefinition = {
		...PanelBeacon,
		id: 'bad.panel',
		view: {
			kind: 'readout',
			label: 'Boom',
			value: () => {
				throw new Error('selector failed');
			}
		}
	};
	it('a throwing selector marks only that panel as failed; the next panel still evaluates', () => {
		expect(evaluatePanel(broken, input(1, 10), new Map())).toEqual({
			ok: false,
			error: 'selector failed'
		});
		expect(evaluatePanel(PanelBeacon, input(1, 10), new Map()).ok).toBe(true);
		const html = render(ModPanel, {
			props: { panel: { ...broken, canvas: undefined }, input: input(1, 10), oncommand: () => {} }
		}).body;
		expect(html).toContain('This panel stopped: selector failed');
	});
});

describe('the Panel library', () => {
	const available = [
		{ id: 'host.orbit' },
		{ id: 'host.resources' },
		{ id: 'host.target' },
		{ id: 'host.script' },
		{ id: 'sample.beacon' }
	];
	it('adds and removes a panel, and the choice survives a reload (settings)', () => {
		let dock = addPanel(defaultDock(), 'sample.beacon');
		expect(railOf(available, dock).map((p) => p.id)).toContain('sample.beacon');
		expect(dock.open).toBe('sample.beacon');
		let reloaded = parseSettings(serialiseSettings({ ...defaultSettings(), dock }));
		expect(reloaded.dock).toEqual(dock);
		dock = removePanel(reloaded.dock, 'host.resources');
		reloaded = parseSettings(serialiseSettings({ ...defaultSettings(), dock }));
		expect(railOf(available, reloaded.dock).map((p) => p.id)).toEqual([
			'host.orbit',
			'host.target',
			'host.script',
			'sample.beacon'
		]);
	});
	it('a rail click opens a panel, a second click closes it', () => {
		const open = togglePanel(defaultDock(), 'host.target');
		expect(open.open).toBe('host.target');
		expect(togglePanel(open, 'host.target').open).toBeNull();
	});
});

describe('selector cost', () => {
	it('ten panels evaluate in well under a HUD update (indicative here; 0.3 ms is measured on the M5)', () => {
		const panels = Array.from({ length: 10 }, (_, k) => ({ ...PanelBeacon, id: `p.${k}` }));
		const memories = panels.map(() => new Map() as PanelMemory);
		const runs = 200;
		const t0 = performance.now();
		for (let r = 0; r < runs; r++) {
			const at = input(r * 0.1, 100 + r);
			panels.forEach((p, k) => evaluatePanel(p, at, memories[k]!));
		}
		const perUpdate = (performance.now() - t0) / runs;
		console.log(`10 panels: ${perUpdate.toFixed(3)} ms per update`);
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(perUpdate).toBeLessThan(3);
	});
});
