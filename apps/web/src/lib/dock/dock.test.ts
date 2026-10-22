/** Dock panels on the page (plan 112, ADR 0149): the sample mod's panel, errors kept inside, the library. */
import type { PanelDefinition, PanelInput, Snapshot } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { PanelBeacon } from '../../../../../examples/mod-sample/src/index';
import { defaultSettings, parseSettings, serialiseSettings } from '../settings/settings';
import {
	addPanel,
	defaultDock,
	groupOf,
	migrateDock,
	railGroups,
	railOf,
	removePanel,
	togglePanel
} from './dock-model';
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
		expect(Number.isFinite(perUpdate)).toBe(true); // vitest wants an assertion on CI too
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(perUpdate).toBeLessThan(3);
	});
});

describe('the v3 dock (plan 272, ADR 0253)', () => {
	it('a pre-v3 choice gets the Vessel group once, in front, and keeps its open panel', () => {
		const old = { panels: ['host.orbit', 'sample.beacon'], open: 'host.orbit' };
		const raw = serialiseSettings({ ...defaultSettings(), dock: old as never });
		const parsed = parseSettings(raw).dock;
		expect(parsed.panels).toEqual([
			'host.vessel',
			'host.parts',
			'host.comms',
			'host.crew',
			'host.orbit',
			'sample.beacon'
		]);
		expect(parsed.open).toBe('host.orbit');
		// removing a Vessel entry later sticks: the choice is v3 now
		const removed = removePanel(parsed, 'host.crew');
		expect(
			parseSettings(serialiseSettings({ ...defaultSettings(), dock: removed })).dock.panels
		).not.toContain('host.crew');
		expect(migrateDock(removed)).toBe(removed);
	});
	it('groups the rail as Vessel, Flight, Plugins, leaving empty groups out', () => {
		const rail = [
			{ id: 'host.script' },
			{ id: 'host.orbit' },
			{ id: 'host.vessel' },
			{ id: 'sample.beacon' },
			{ id: 'host.parts' }
		];
		expect(railGroups(rail).map((g) => [g.group, g.entries.map((e) => e.id)])).toEqual([
			['vessel', ['host.vessel', 'host.parts']],
			['flight', ['host.orbit']],
			['plugins', ['host.script', 'sample.beacon']]
		]);
		expect(railGroups([{ id: 'host.orbit' }]).map((g) => g.group)).toEqual(['flight']);
		expect(groupOf('host.crew')).toBe('vessel');
	});
});

describe('tabs, progress, number fields and notices (plan 332, ADR 0287)', () => {
	const tabbed: PanelDefinition = {
		...PanelBeacon,
		id: 'mod.tabbed',
		canvas: undefined,
		view: {
			kind: 'tabs',
			label: 'Programs',
			active: (i) => (i.altitude !== null && i.altitude > 100 ? 'b' : null),
			tabs: [
				{
					id: 'a',
					label: 'First',
					children: [
						{ kind: 'notice', text: () => 'Target a vessel first.', tone: () => 'warn' },
						{ kind: 'notice', text: () => null }
					]
				},
				{
					id: 'b',
					label: 'Second',
					badge: () => 'ON',
					children: [
						{ kind: 'progress', label: 'Climb', value: (i) => (i.altitude ?? 0) / 1000, text: () => 'half' },
						{
							kind: 'number',
							label: 'Altitude',
							unit: 'km',
							min: 70,
							max: 500,
							step: 5,
							value: () => 80,
							command: (i, v) => ({ type: 'warp', factor: v, vessel: i.vessel!.id })
						},
						{ kind: 'button', label: 'Go', tone: 'primary', command: (i) => ({ type: 'stage', vessel: i.vessel!.id }) }
					]
				}
			]
		}
	};

	it('every tab is evaluated with its badge, and the active tab is named', () => {
		const r = evaluatePanel(tabbed, input(1, 500), new Map());
		expect(r.ok).toBe(true);
		if (!r.ok || r.nodes.kind !== 'tabs') throw new Error('not tabs');
		expect(r.nodes.active).toBe('b');
		expect(r.nodes.tabs.map((t) => t.badge)).toEqual([null, 'ON']);
		expect(r.nodes.tabs[1]!.children[0]).toEqual({ kind: 'progress', label: 'Climb', value: 0.5, text: 'half' });
		expect(r.nodes.tabs[1]!.children[1]).toMatchObject({ kind: 'number', value: 80, min: 70, max: 500, step: 5, path: 'v.1.1' });
		expect(r.nodes.tabs[1]!.children[2]).toMatchObject({ kind: 'button', tone: 'primary', enabled: true });
		expect(r.nodes.tabs[0]!.children).toEqual([
			{ kind: 'notice', text: 'Target a vessel first.', tone: 'warn', action: null },
			{ kind: 'notice', text: null, tone: 'info', action: null }
		]);
		const low = evaluatePanel(tabbed, input(1, 10), new Map());
		expect(low.ok && low.nodes.kind === 'tabs' && low.nodes.active).toBe(null);
	});

	it('a tab child and a number field route their commands; the number is clamped to its step and range', () => {
		expect(commandOf(tabbed, 'v.1.2', input(1, 10))).toEqual({ command: { type: 'stage', vessel: 7 } });
		expect(commandOf(tabbed, 'v.1.1', input(1, 10), 123)).toEqual({
			command: { type: 'warp', factor: 125, vessel: 7 }
		});
		expect(commandOf(tabbed, 'v.1.1', input(1, 10), 9_000)).toEqual({
			command: { type: 'warp', factor: 500, vessel: 7 }
		});
		expect(commandOf(tabbed, 'v.1.1', input(1, 10), 'x')).toEqual({ command: null });
	});

	it('renders the open tab, the active tab first, the notice and the field', () => {
		const html = render(ModPanel, { props: { panel: tabbed, input: input(1, 10), oncommand: () => {} } }).body;
		expect(html).toContain('role="tablist"');
		expect(html).toContain('Target a vessel first.');
		expect(html).not.toContain('panel-number-v.1.1');
		const high = render(ModPanel, { props: { panel: tabbed, input: input(1, 500), oncommand: () => {} } }).body;
		expect(high).toContain('data-testid="panel-number-v.1.1"');
		expect(high).toContain('role="progressbar"');
		expect(high).toContain('>ON<');
	});
});

describe('a notice offers the next step as a button to a tab (plan 333, ADR 0288)', () => {
	const hinted: PanelDefinition = {
		...PanelBeacon,
		id: 'mod.hinted',
		canvas: undefined,
		view: {
			kind: 'tabs',
			label: 'Programs',
			tabs: [
				{
					id: 'a',
					label: 'First',
					children: [
						{
							kind: 'notice',
							text: (i) => `Reach orbit first (Δv ${i.deltaV ?? 'none'}, ${i.body?.id ?? 'no body'})`,
							tone: () => 'warn',
							action: () => ({ label: 'Open Second', tab: 'b' })
						}
					]
				},
				{ id: 'b', label: 'Second', children: [] }
			]
		}
	};

	it('the panel input carries the body and the HUD delta-v; the notice its action', () => {
		const i = panelInputOf(snapshot(1, R + 10), 7 as never, [
			{ id: 'stock.home' as never, radius: R, mass: 5.29e22, atmosphere: { height: 70_000 } as never }
		], 1234.5);
		expect(i.deltaV).toBe(1234.5);
		expect(i.body).toMatchObject({ id: 'stock.home', radius: R, atmosphereHeight: 70_000 });
		expect(i.body!.mu).toBeCloseTo(6.6743e-11 * 5.29e22, -3);
		const r = evaluatePanel(hinted, i, new Map());
		if (!r.ok || r.nodes.kind !== 'tabs') throw new Error('not tabs');
		expect(r.nodes.tabs[0]!.children[0]).toEqual({
			kind: 'notice',
			text: 'Reach orbit first (Δv 1234.5, stock.home)',
			tone: 'warn',
			action: { label: 'Open Second', tab: 'b' }
		});
		const html = render(ModPanel, { props: { panel: hinted, input: i, oncommand: () => {} } }).body;
		expect(html).toContain('data-testid="panel-notice-action-b"');
		expect(html).toContain('Open Second');
	});
});
