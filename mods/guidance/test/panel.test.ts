/** Plan 332: the Guidance Computer's panel, a tab per program (ADR 0287). */
import { describe, expect, test } from 'bun:test';
import { entityId, type PanelInput, type PanelNode, type VesselSnapshot } from '@orbital/sdk';
import { GuidancePanel } from '../src/index.ts';

const q0 = { x: 0, y: 0, z: 0, w: 1 };
const vessel = (extra: Partial<VesselSnapshot> = {}): VesselSnapshot =>
	({
		id: entityId(1),
		name: 'Ship',
		mode: 'flight',
		soi: 'stock.home',
		position: { x: 700_000, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: -2_246 },
		orientation: q0,
		parts: [],
		nextStage: 0,
		orbit: { a: 700_000, e: 0.001 },
		...extra
	}) as unknown as VesselSnapshot;
const input = (v: VesselSnapshot): PanelInput =>
	({ snapshot: { t: 10, vessels: [v], bodies: [] }, vessel: v, altitude: 100_000, speed: 2_246, time: 10 }) as unknown as PanelInput;

const view = GuidancePanel.view;
if (view.kind !== 'tabs') throw new Error('the panel is not tabbed');
const tab = (id: string) => view.tabs.find((t) => t.id === id)!;
const flat = (n: PanelNode): PanelNode[] => (n.kind === 'section' ? n.children.flatMap(flat) : [n]);
const nodesOf = (id: string) => tab(id).children.flatMap(flat);
const statusOf = (id: string, v: VesselSnapshot) => {
	const n = tab(id).children[0]!;
	if (n.kind !== 'notice') throw new Error('no status line');
	return { text: n.text(input(v)), tone: n.tone?.(input(v)) };
};
const button = (id: string, label: string) => {
	const b = nodesOf(id).find((n) => n.kind === 'button' && n.label === label);
	if (b?.kind !== 'button') throw new Error(`no button ${label}`);
	return b;
};

describe('Guidance Computer panel (plan 332)', () => {
	// the loader validates it (ADR 0287 schema) whenever a sim loads the mod: rendezvous.test.ts does
	test('has a tab per program', () => {
		expect(view.tabs.map((t) => t.label)).toEqual(['Ascent', 'Orbit', 'Rendezvous', 'Landing', 'Log']);
	});

	test('a program that cannot start says why and has no Engage', () => {
		const v = vessel();
		expect(statusOf('orbit', v)).toEqual({ text: 'No maneuver node: add one on the map.', tone: 'warn' });
		expect(button('orbit', 'Execute next node').command(input(v))).toBeNull();
		expect(statusOf('rendezvous', v).text).toBe('Target a vessel or a docking port first.');
		expect(statusOf('ascent', v).text).toBe('Already in orbit.');
		const ground = vessel({ surface: true, orbit: undefined });
		expect(statusOf('landing', ground).text).toBe('Already on the ground.');
		expect(button('ascent', 'Engage ascent').command(input(ground))).toEqual({
			type: 'autopilot-engage',
			vessel: entityId(1),
			autopilot: 'guidance.ascent'
		});
	});

	test('the engaged program opens its tab, is marked and has Abort', () => {
		const v = vessel({
			nodes: [{ id: 1, time: 40, dv: 12, prograde: 12, normal: 0, radial: 0 }],
			autopilot: {
				id: 'guidance.node',
				title: 'Execute node',
				phase: 'burn',
				status: 'Burning: 6.0 m/s left',
				readouts: { 'Delta-v left': 6, 'Burn done': 0.5 },
				log: []
			}
		} as never);
		expect(view.active?.(input(v))).toBe('orbit');
		expect(tab('orbit').badge?.(input(v))).toBe('ON');
		expect(tab('ascent').badge?.(input(v))).toBeNull();
		expect(statusOf('orbit', v)).toEqual({ text: 'Execute node · burn — Burning: 6.0 m/s left', tone: 'active' });
		const progress = nodesOf('orbit').find((n) => n.kind === 'progress');
		if (progress?.kind !== 'progress') throw new Error('no progress');
		expect(progress.value(input(v))).toBe(0.5);
		expect(button('orbit', 'Abort').command(input(v))).toEqual({ type: 'autopilot-disengage', vessel: entityId(1) });
		expect(statusOf('landing', v).text).toBe('Execute node is flying: abort it first.');
	});

	test('settings: the altitude is entered in km and stored in m, the inclination in degrees', () => {
		const v = vessel({ autopilotSettings: { 'guidance.ascent': { altitude: 120_000 } } } as never);
		const fields = nodesOf('ascent').filter((n) => n.kind === 'number');
		const [alt, inc] = fields;
		if (alt?.kind !== 'number' || inc?.kind !== 'number') throw new Error('no fields');
		expect(alt.value(input(v))).toBe(120);
		expect(alt.command(input(v), 90)).toEqual({
			type: 'autopilot-settings',
			vessel: entityId(1),
			autopilot: 'guidance.ascent',
			settings: { altitude: 90_000 }
		});
		expect(inc.command(input(v), 28)).toMatchObject({ settings: { inclination: 28 } });
	});
});
