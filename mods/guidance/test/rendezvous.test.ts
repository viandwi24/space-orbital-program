/**
 * The rendezvous autopilot in the headless sim (plan 331): from 20 km behind in one orbit, and
 * from an orbit 50 km lower and 2° inclined, the chaser ends within 200 m of the station at under
 * 0.5 m/s; short of fuel it aborts; "Dock when close" hands over to Auto Dock.
 */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type PanelInput,
	type PanelNode,
	type Vec3,
	type VesselDesign
} from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import AutoDockMod from '@orbital/mod-autodock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import GuidanceMod, {
	HOLD_DISTANCE,
	GuidancePanel,
	MAX_PHASING_WAIT,
	aimBurn,
	phasingBurn,
	tooLowToPhase
} from '../src/index.ts';

type Part = VesselDesign['parts'][number];
const link = (index: number, part: string, parent: number, parentNode = 'bottom'): Part => ({
	index,
	part: partId(part),
	parent: { index: parent, parentNode, node: parentNode === 'top' ? 'bottom' : 'top' }
});
const rcs = (first: number, on: number): Part[] =>
	[0, 1, 2, 3].map((k) => ({
		index: first + k,
		part: partId('stock.rcs-block'),
		parent: { index: on, parentNode: 'surface', node: 'radial', radial: { angle: (k * Math.PI) / 2, y: 0 } }
	}));

/** Probe core, a port on top, wheel, battery and RTG, monopropellant with four RCS blocks, a small tank and an engine. */
const chaser = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Chaser',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			link(1, 'stock.docking-port', 0, 'top'),
			link(2, 'stock.reaction-wheel', 0),
			link(3, 'stock.battery-large', 2),
			link(4, 'stock.monoprop-tank', 3),
			...rcs(5, 4),
			link(9, 'stock.tank-small', 4),
			link(10, 'stock.engine-lv', 9),
			{
				index: 11,
				part: partId('stock.rtg-radial'),
				parent: { index: 3, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } }
			}
		],
		stages: [[10]]
	}) as VesselDesign;

const station = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Station',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			link(1, 'stock.docking-port', 0, 'top'),
			link(2, 'stock.reaction-wheel', 0),
			link(3, 'stock.tank-medium', 2)
		],
		stages: []
	}) as VesselDesign;

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};

/** A state at `angle` along a circular orbit of radius `r` (equatorial, prograde about +Y), tilted by `tilt` about +X. */
function onOrbit(mu: number, r: number, angle: number, tilt = 0): { position: Vec3; velocity: Vec3 } {
	const v = Math.sqrt(mu / r);
	const p = { x: r * Math.cos(angle), y: 0, z: -r * Math.sin(angle) };
	const u = { x: -v * Math.sin(angle), y: 0, z: -v * Math.cos(angle) };
	const c = Math.cos(tilt);
	const s = Math.sin(tilt);
	const rx = (w: Vec3): Vec3 => ({ x: w.x, y: w.y * c - w.z * s, z: w.y * s + w.z * c });
	return { position: rx(p), velocity: rx(u) };
}

async function scene(
	stationAlt: number,
	stationAngle: number,
	tilt: number,
	chaserAlt = 100_000
): Promise<{ sim: Sim; a: EntityId; b: EntityId; mu: number }> {
	const sim = await createSim({
		plugins: [Stock, GuidanceMod, AutoDockMod],
		backendFactory: () => createRapierBackend({ solverIterations: 8 }),
		seed: 7
	});
	const home = sim.registries.bodies.get(sim.home)!;
	const mu = 6.6743e-11 * home.mass;
	const b = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: station(),
			placement: { kind: 'state', ...onOrbit(mu, home.radius + stationAlt, stationAngle, tilt) }
		})
	);
	const a = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: chaser(),
			placement: { kind: 'state', ...onOrbit(mu, home.radius + chaserAlt, 0) }
		})
	);
	expect(sim.dispatch({ type: 'stage', vessel: a }).ok).toBe(true);
	expect(sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } }).ok).toBe(true);
	return { sim, a, b, mu };
}

const TRACE = Boolean(process.env.RDV_TRACE);
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;

/**
 * Step until the autopilot holds, ends, or `limit` sim seconds pass. Returns how it went and the
 * distance and relative speed then.
 */
function run(sim: Sim, id: EntityId, limit: number): { result: string; distance: number; speed: number; log: string[] } {
	let ended = '';
	const off = sim.events.on('autopilot:ended', (e) => {
		if (e.vessel === id) ended = `${e.outcome}: ${e.reason}`;
	});
	const start = sim.time;
	let log: string[] = [];
	let held = 0;
	let lastStatus = '';
	let lastAt = -1e9;
	while (!ended && sim.time - start < limit) {
		sim.step(0.1);
		const v = vesselOf(sim, id);
		if (v.autopilot) log = v.autopilot.log;
		held = v.autopilot?.phase === 'hold' ? held + 1 : 0;
		if (TRACE && v.autopilot && (v.autopilot.status.slice(0, 18) !== lastStatus || sim.time - lastAt > 20)) {
			lastStatus = v.autopilot.status.slice(0, 18);
			lastAt = sim.time;
			console.log(
				Math.round(sim.time - start),
				v.mode,
				v.autopilot.status,
				Math.round(v.target?.distance ?? -1),
				(v.target?.relativeSpeed ?? -1).toFixed(2),
				JSON.stringify(v.autopilot.readouts)
			);
		}
		if (held > 100) break; // ten seconds holding
	}
	off();
	const v = vesselOf(sim, id);
	if (ended) log = v.autopilotLast?.log ?? log;
	return {
		result: ended || (held > 0 ? 'holding' : 'still running'),
		distance: v.target?.distance ?? Infinity,
		speed: v.target?.relativeSpeed ?? Infinity,
		log
	};
}

describe('rendezvous helpers', () => {
	const mu = 3.5316e12;
	test('a phasing orbit catches a target 20 km ahead in one turn', () => {
		const r = 700_000;
		const own = { r: { x: r, y: 0, z: 0 }, v: { x: 0, y: 0, z: -Math.sqrt(mu / r) } };
		const ahead = onOrbit(mu, r, 20_000 / r);
		const p = phasingBurn(own, { r: ahead.position, v: ahead.velocity }, mu, r, 670_000)!;
		expect(p.turns).toBe(1);
		expect(p.dv).toBeLessThan(0); // lower and faster
		expect(Math.abs(p.dv)).toBeLessThan(10);
	});
	describe('phasing low over the air (plan 333)', () => {
		const floor = 680_000; // 600 km radius, air to 70 km, 10 km margin
		const at = (r: number, angle: number) => {
			const o = onOrbit(mu, r, angle);
			return { r: o.position, v: o.velocity };
		};
		/** Both apsides of the phasing orbit after the burn, m from the centre. */
		const apsides = (r: number, dv: number) => {
			const v = Math.sqrt(mu / r) + dv;
			const a = 1 / (2 / r - (v * v) / mu);
			return [r, 2 * a - r];
		};
		test('1 km above the floor, the target 30° ahead: it raises and lets the target come round', () => {
			const r = floor + 1_000;
			const p = phasingBurn(at(r, 0), at(r, Math.PI / 6), mu, r, floor)!;
			expect(p).toBeDefined();
			expect(p.dv).toBeGreaterThan(0);
			expect(Math.min(...apsides(r, p.dv))).toBeGreaterThanOrEqual(floor);
			expect(p.flight).toBeLessThanOrEqual(MAX_PHASING_WAIT);
		});
		test('5 km above the floor, 30° ahead: a phasing orbit that stays above the floor', () => {
			const r = floor + 5_000;
			const p = phasingBurn(at(r, 0), at(r, Math.PI / 6), mu, r, floor)!;
			expect(p).toBeDefined();
			expect(Math.min(...apsides(r, p.dv))).toBeGreaterThanOrEqual(floor - 1);
		});
		test('the target 30° behind: it raises', () => {
			const r = floor + 5_000;
			const p = phasingBurn(at(r, 0), at(r, -Math.PI / 6), mu, r, floor)!;
			expect(p.dv).toBeGreaterThan(0);
		});
		test('below the floor nothing fits, and the words say how high to go', () => {
			expect(phasingBurn(at(670_000, 0), at(670_000, 0.5), mu, 670_000, floor)).toBeUndefined();
			expect(tooLowToPhase(80_000)).toBe('Too low to phase: raise your orbit above 100 km first (Orbit tab).');
		});
	});

	test('the aimed burn reaches a point a quarter turn on', () => {
		const r = 700_000;
		const own = { r: { x: r, y: 0, z: 0 }, v: { x: 0, y: 0, z: -Math.sqrt(mu / r) } };
		const goal = onOrbit(mu, r + 2_000, Math.PI / 2 + 0.01).position;
		const T = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
		const fix = aimBurn(own, goal, mu, T / 4);
		expect(fix.miss).toBeLessThan(1);
	});
});

describe('Rendezvous autopilot (plan 331)', () => {
	test('same orbit, 20 km apart: ends within 200 m at under 0.5 m/s', async () => {
		const { sim, a, mu } = await scene(100_000, 20_000 / 700_000, 0);
		void mu;
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok).toBe(true);
		const r = run(sim, a, 6 * 3_600);
		if (r.result !== 'holding') console.log(r);
		expect(r.result).toBe('holding');
		expect(r.distance).toBeLessThan(HOLD_DISTANCE);
		expect(r.speed).toBeLessThan(0.5);
		sim.dispose();
	}, 240_000);

	test('the warp to a burn ends about 5 s before it, once the vessel points along it', async () => {
		const { sim, a } = await scene(100_000, 20_000 / 700_000, 0);
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok).toBe(true);
		const stops: number[] = [];
		const off = sim.events.on('warp:stopped', () => stops.push(sim.time));
		const start = sim.time;
		let burnAt = -1;
		while (sim.time - start < 3_000) {
			sim.step(0.1);
			const ap = vesselOf(sim, a).autopilot;
			if (ap?.phase === 'correct' && ap.status.includes('Burning')) {
				burnAt = sim.time;
				break;
			}
		}
		off();
		expect(burnAt).toBeGreaterThan(0);
		const last = stops.filter((t) => t <= burnAt).at(-1)!;
		expect(burnAt - last).toBeLessThan(8);
		sim.dispose();
	}, 240_000);

	test('50 km higher and 2° inclined: ends within 200 m at under 0.5 m/s', async () => {
		const { sim, a } = await scene(150_000, 1.2, (2 * Math.PI) / 180);
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok).toBe(true);
		const r = run(sim, a, 24 * 3_600);
		if (r.result !== 'holding') console.log(r);
		expect(r.result).toBe('holding');
		expect(r.distance).toBeLessThan(HOLD_DISTANCE);
		expect(r.speed).toBeLessThan(0.5);
		expect(r.log.some((l) => l.includes('node'))).toBe(true); // the plane change
		sim.dispose();
	}, 300_000);

	test('short of fuel it aborts with the delta-v it lacks', async () => {
		const { sim, a } = await scene(150_000, 1.2, (2 * Math.PI) / 180);
		const tank = vesselOf(sim, a).parts[9]!.id;
		expect(sim.dispatch({ type: 'debug-set-resource', vessel: a, part: tank, fraction: 0.01 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok).toBe(true);
		const r = run(sim, a, 60);
		expect(r.result).toStartWith('aborted: Not enough delta-v');
		sim.dispose();
	}, 60_000);

	test('"Dock when close" with a targeted port hands over to Auto Dock', async () => {
		const { sim, a, b } = await scene(100_000, 1_500 / 700_000, 0);
		const port = vesselOf(sim, b).ports![0]!.part;
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b, part: port } });
		sim.dispatch({ type: 'autopilot-settings', vessel: a, autopilot: 'guidance.rendezvous', settings: { dock: 'on' } });
		expect(sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok).toBe(true);
		const start = sim.time;
		while (sim.time - start < 1_800 && vesselOf(sim, a).autopilot?.id !== 'autodock.dock') sim.step(0.1);
		const v = vesselOf(sim, a);
		expect(v.autopilot?.id).toBe('autodock.dock');
		expect(v.autopilotLast?.id).toBe('guidance.rendezvous');
		expect(v.autopilotLast?.reason).toContain('replaced by Auto Dock');
		expect(v.controlPart).toBe(v.ports![0]!.part);
		expect(v.target?.distance).toBeLessThan(HOLD_DISTANCE);
		sim.dispose();
	}, 120_000);

	test('the panel shows the target before it engages, and engages and stores its settings', async () => {
		const { sim, a } = await scene(100_000, 5_000 / 700_000, 0);
		const nodes = (n: PanelNode): PanelNode[] => (n.kind === 'section' ? n.children.flatMap(nodes) : [n]);
		const view = GuidancePanel.view;
		if (view.kind !== 'tabs') throw new Error('not tabs');
		const all = view.tabs.find((t) => t.id === 'rendezvous')!.children.flatMap(nodes);
		const input = (): PanelInput =>
			({ snapshot: sim.snapshot(), vessel: vesselOf(sim, a), altitude: 0, speed: 0, time: sim.time }) as unknown as PanelInput;
		const readout = (label: string) => {
			const n = all.find((x) => x.kind === 'readout' && x.label === label);
			return n?.kind === 'readout' ? n.value(input()) : undefined;
		};
		const notice = all.find((x) => x.kind === 'notice');
		if (notice?.kind !== 'notice') throw new Error('no status line');
		expect(notice.text(input())).toContain('Target a vessel or a docking port');
		expect(view.active?.(input())).toBeNull();
		expect(Number(readout('Distance'))).toBeGreaterThan(4_900);
		const dock = all.find((x) => x.kind === 'switch' && x.label === 'Dock when close');
		if (dock?.kind !== 'switch') throw new Error('no dock switch');
		expect(dock.value(input())).toBe(false);
		const set = dock.command(input(), true)!;
		expect(sim.dispatch(set).ok).toBe(true);
		expect(dock.value(input())).toBe(true);
		const engage = all.find((x) => x.kind === 'button' && x.label === 'Engage');
		if (engage?.kind !== 'button') throw new Error('no engage');
		expect(sim.dispatch(engage.command(input())!).ok).toBe(true);
		for (let k = 0; k < 5; k++) sim.step(0.1);
		expect(readout('Phase')).not.toBe('off');
		expect(typeof readout('Delta-v estimate')).toBe('number');
		expect(view.active?.(input())).toBe('rendezvous');
		expect(view.tabs.find((t) => t.id === 'rendezvous')!.badge?.(input())).toBe('ON');
		expect(notice.text(input())).toStartWith('Rendezvous');
		expect(notice.tone?.(input())).toBe('active');
		// the other programs say why they are off
		const ascent = view.tabs.find((t) => t.id === 'ascent')!.children[0]!;
		if (ascent.kind !== 'notice') throw new Error('no ascent status');
		expect(ascent.text(input())).toBe('Rendezvous is flying: abort it first.');
		const abort = all.find((x) => x.kind === 'button' && x.label === 'Abort');
		if (abort?.kind === 'button') expect(abort.tone).toBe('danger');
		if (abort?.kind !== 'button') throw new Error('no abort');
		expect(sim.dispatch(abort.command(input())!).ok).toBe(true);
		expect(vesselOf(sim, a).autopilot).toBeUndefined();
		sim.dispose();
	});

	test('in the air below a stable orbit it refuses with the periapsis and what it needs (plan 333)', async () => {
		const { sim, a } = await scene(100_000, 0.5, 0, 40_000);
		const r = sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' });
		expect(r).toEqual({ ok: false, reason: 'Reach a stable orbit first: periapsis 40 km, needs 70 km+. Fly Ascent.' });
		sim.dispose();
	});

	test('refuses without a target', async () => {
		const { sim, a } = await scene(100_000, 0.01, 0);
		sim.dispatch({ type: 'target-set', vessel: a, target: null });
		const r = sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' });
		expect(r.ok).toBe(false);
		sim.dispose();
	});
});
