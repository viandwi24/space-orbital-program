/** Plan 332: the Guidance Computer's panel, a tab per program (ADR 0287). */
import { describe, expect, test } from 'bun:test';
import { entityId, type PanelInput, type PanelNode, type VesselSnapshot } from '@orbital/sdk';
import { GuidancePanel } from '../src/index.ts';

type Vec = { x: number; y: number; z: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

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
const BODY = { id: 'stock.home', radius: 600_000, mu: 3.5316e12, atmosphereHeight: 70_000 };
const input = (v: VesselSnapshot, others: VesselSnapshot[] = [], deltaV: number | null = null): PanelInput =>
	({
		snapshot: { t: 10, vessels: [v, ...others], bodies: [] },
		vessel: v,
		altitude: 100_000,
		speed: 2_246,
		time: 10,
		body: BODY,
		deltaV
	}) as unknown as PanelInput;

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
		expect(button('orbit', 'Execute node').command(input(v))).toBeNull();
		expect(statusOf('rendezvous', v).text).toBe('Target a vessel or a docking port first.');
		expect(statusOf('ascent', v).text).toBe('Already in orbit.');
		const ground = vessel({ surface: true, orbit: undefined });
		expect(statusOf('landing', ground).text).toBe('Already on the ground.');
		expect(button('ascent', 'Engage').command(input(ground))).toEqual({
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
		expect(statusOf('orbit', v)).toEqual({ text: 'Execute node: Burning: 6.0 m/s left', tone: 'active' });
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

	describe('Rendezvous says the true reason it cannot start (plan 333)', () => {
		const mu = BODY.mu;
		const circ = (r: number) => ({ position: { x: r, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -Math.sqrt(mu / r) } });
		/** The own vessel at `own`, targeting a vessel whose state is `other` (absolute, body-centred). */
		const scene = (own: { position: Vec; velocity: Vec }, other: { position: Vec; velocity: Vec }, extra: Partial<VesselSnapshot> = {}) => {
			const target = vessel({ id: entityId(2), name: 'Station', ...other, ...extra });
			const me = vessel({
				...own,
				target: {
					kind: 'vessel',
					id: entityId(2),
					name: 'Station',
					position: sub(other.position, own.position),
					velocity: sub(other.velocity, own.velocity),
					distance: 1,
					relativeSpeed: 1,
					approach: null
				}
			} as never);
			return { me, target };
		};
		const rdv = (me: VesselSnapshot, target: VesselSnapshot, dv: number | null = null) => {
			const n = tab('rendezvous').children[0]!;
			if (n.kind !== 'notice') throw new Error('no status line');
			const i = input(me, [target], dv);
			return { text: n.text(i), tone: n.tone?.(i), action: n.action?.(i) ?? null, i };
		};
		const station = circ(750_000);

		test('climbing from the pad: no stable orbit, Fly Ascent, a button to the Ascent tab', () => {
			const { me, target } = scene({ position: { x: 630_000, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -500 } }, station);
			const r = rdv(me, target);
			expect(r.text).toBe('Reach a stable orbit first: periapsis below the surface, needs 70 km+. Fly Ascent.');
			expect(r.tone).toBe('warn');
			expect(r.action).toEqual({ label: 'Open Ascent', tab: 'ascent' });
			expect(button('rendezvous', 'Engage').command(r.i)).toBeNull();
		});

		test('apoapsis up, periapsis in the air: Circularize, a button to the Orbit tab', () => {
			const rp = 612_000;
			const a = (rp + 700_000) / 2;
			const own = { position: { x: rp, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -Math.sqrt(mu * (2 / rp - 1 / a)) } };
			const r = rdv(scene(own, station).me, scene(own, station).target);
			expect(r.text).toBe('Reach a stable orbit first: periapsis 12 km, needs 70 km+. Circularize at the apoapsis.');
			expect(r.action).toEqual({ label: 'Open Orbit', tab: 'orbit' });
		});

		test('the target around another body, on the ground, or not in orbit', () => {
			const own = circ(700_000);
			const away = scene(own, station, { soi: 'stock.cinder' } as never);
			expect(rdv(away.me, away.target).text).toBe(
				'The target orbits Cinder; you orbit Home. A rendezvous needs both around one body.'
			);
			expect(rdv(away.me, away.target).action).toBeNull();
			const landed = scene(own, station, { surface: true } as never);
			expect(rdv(landed.me, landed.target).text).toBe('The target is on the ground.');
			const low = scene(own, { position: { x: 640_000, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -900 } });
			expect(rdv(low.me, low.target).text).toBe('The target is not in a stable orbit: periapsis below the surface, needs 70 km+.');
		});

		test('ready: the idle line, Engage, the HUD delta-v and an estimate while off', () => {
			const { me, target } = scene(circ(700_000), station);
			const r = rdv(me, target, 3_391.94);
			expect(r.tone).toBe('info');
			expect(r.action).toBeNull();
			expect(button('rendezvous', 'Engage').command(r.i)).toMatchObject({ type: 'autopilot-engage', autopilot: 'guidance.rendezvous' });
			const readout = (label: string) => {
				const n = nodesOf('rendezvous').find((x) => x.kind === 'readout' && x.label === label);
				return n?.kind === 'readout' ? n.value(r.i) : undefined;
			};
			expect(readout('Delta-v left')).toBe(3391.9);
			const estimate = Number(readout('Delta-v estimate'));
			expect(estimate).toBeGreaterThan(50);
			expect(estimate).toBeLessThan(300);
		});
	});
});
