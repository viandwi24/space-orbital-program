/**
 * The mission blueprints in a headless sim (plans 307, 309): what each is for, it does. Short runs
 * only; the full flights are the players'.
 */
import { loadPlugins, type Quat, type Vec3, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { subtreeOf } from '../design';
import type { ContentLookups } from '../delta-v';
import { MISSION_BLUEPRINTS } from './missions';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const blueprint = (id: string) => MISSION_BLUEPRINTS.find((m) => m.id === id)!.build(content);

const newSim = () =>
	createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});

async function launch(id: string): Promise<{ sim: Sim; vessel: number }> {
	const sim = await newSim();
	const r = sim.dispatch({ type: 'load-vessel', design: blueprint(id) });
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return { sim, vessel: Number(r.vessel) };
}

/** The parts `keep` of `design` as a vessel of their own: the one whose parent is gone is the root. */
function piece(design: VesselDesign, keep: ReadonlySet<number>, stages: number[][]): VesselDesign {
	return {
		formatVersion: design.formatVersion,
		name: design.name,
		parts: design.parts
			.filter((p) => keep.has(p.index))
			.map((p) => (p.parent && keep.has(p.parent.index) ? p : { ...p, parent: null })),
		stages
	};
}
const indexOf = (design: VesselDesign, part: string): number =>
	design.parts.find((p) => p.part === part)!.index;

/** Load `design` in `sim` at a state over a body's +Y pole. */
function place(
	sim: Sim,
	design: VesselDesign,
	body: string,
	position: Vec3,
	velocity: Vec3,
	orientation?: Quat
): number {
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', body, position, velocity, ...(orientation ? { orientation } : {}) }
	} as never);
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return Number(r.vessel);
}
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/** Home's day, s (the aeroplane test's figure). */
const DAY = 21_600;

const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};

describe('mission flights (plans 307, 309)', () => {
	it('Trailblazer Rover drives off the pad on its wheel throttle', async () => {
		const { sim, vessel } = await launch('trailblazer-rover');
		try {
			const at = () => sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!;
			run(sim, 3);
			const start = at();
			const parts = start.parts.length;
			expect(sim.dispatch({ type: 'wheel-throttle', vessel: start.id, value: 1 }).ok).toBe(true);
			run(sim, 8);
			const end = at();
			// against the ground under the start, which turned with the planet meanwhile (about +Y)
			const a = (2 * Math.PI * 8) / DAY;
			const p = start.position;
			const ground = {
				x: p.x * Math.cos(a) + p.z * Math.sin(a),
				y: p.y,
				z: -p.x * Math.sin(a) + p.z * Math.cos(a)
			};
			const moved = Math.hypot(
				end.position.x - ground.x,
				end.position.y - ground.y,
				end.position.z - ground.z
			);
			expect(moved).toBeGreaterThan(10);
			expect(moved).toBeLessThan(12 * 8); // the wheels' top speed: so the planet's turn is out
			expect(end.parts.length).toBe(parts);
		} finally {
			sim.dispose();
		}
	}, 120_000);

	it('Wayfarer Shuttle lifts off on its boosters and main engines, in one piece', async () => {
		const { sim, vessel } = await launch('wayfarer-shuttle');
		try {
			const at = () => sim.snapshot().vessels.find((v) => Number(v.id) === vessel)!;
			const parts = at().parts.length;
			const r0 = len(at().position);
			sim.dispatch({ type: 'sas', vessel: at().id, mode: 'hold' });
			sim.dispatch({ type: 'throttle', vessel: at().id, value: 1 });
			expect(sim.dispatch({ type: 'stage', vessel: at().id }).ok).toBe(true);
			run(sim, 25);
			const v = at();
			// straight up under SAS: about 3.5 km in 25 s
			expect(len(v.position) - r0).toBeGreaterThan(2_500);
			expect(v.parts.length).toBe(parts);
		} finally {
			sim.dispose();
		}
	}, 180_000);

	it('the Kronos capsule comes home: a shallow entry at 2 km/s, down under its chutes', async () => {
		const design = blueprint('kronos-selene');
		const pod = indexOf(design, 'stock.pod-3');
		const shield = indexOf(design, 'stock.heat-shield-wide');
		const sim = await newSim();
		try {
			const R = registries.bodies.get('stock.home')!.radius;
			const id = place(
				sim,
				piece(design, new Set([pod, shield]), [[pod]]),
				'stock.home',
				{ x: 0, y: R + 60_000, z: 0 },
				{ x: 2_000, y: -150, z: 0 },
				// nose up, a little back: the shield faces the flow coming from +X and below
				{ x: 0, y: 0, z: 0.38268343236, w: 0.92387953251 }
			);
			const at = () => sim.snapshot().vessels.find((v) => Number(v.id) === id);
			expect(sim.dispatch({ type: 'stage', vessel: at()!.id }).ok).toBe(true);
			let touchdown: number | null = null;
			for (let i = 0; i < 900 / 0.02 && touchdown === null; i++) {
				const before = at();
				sim.step(0.02);
				const v = at();
				if (!v || !before) break;
				// the vertical speed: the ground under it turns at up to 174 m/s
				const r = len(before.position);
				const down =
					-(
						before.velocity.x * before.position.x +
						before.velocity.y * before.position.y +
						before.velocity.z * before.position.z
					) / r;
				if (len(v.position) - R - (v.terrainHeight ?? 0) < 3) touchdown = down;
			}
			expect(touchdown).not.toBeNull();
			expect(touchdown!).toBeLessThan(10);
			expect(at()!.parts.some((p) => p.definition === 'stock.pod-3')).toBe(true);
		} finally {
			sim.dispose();
		}
	}, 240_000);

	it('the Selene lander sets down on the moon on its descent engine', async () => {
		const design = blueprint('kronos-selene');
		const descent = indexOf(design, 'stock.lander-descent');
		const sim = await newSim();
		try {
			const moon = registries.bodies.get('stock.cinder')!;
			const R = moon.radius;
			const id = place(
				sim,
				piece(design, subtreeOf(design, descent), [[descent]]),
				'stock.cinder',
				{ x: 0, y: R + 1_500, z: 0 },
				{ x: 0, y: -30, z: 0 }
			);
			const at = () => sim.snapshot().vessels.find((v) => Number(v.id) === id)!;
			const vid = at().id;
			const parts = at().parts.length;
			sim.dispatch({ type: 'sas', vessel: vid, mode: 'hold' });
			sim.dispatch({ type: 'action-group', vessel: vid, group: 'stock.landing-gear', value: true });
			expect(sim.dispatch({ type: 'stage', vessel: vid }).ok).toBe(true);
			const g = (6.6743e-11 * moon.mass) / (R * R);
			let landed = false;
			for (let i = 0; i < 300 / 0.02 && !landed; i++) {
				const v = at();
				const up = {
					x: v.position.x / len(v.position),
					y: v.position.y / len(v.position),
					z: v.position.z / len(v.position)
				};
				const vs = v.velocity.x * up.x + v.velocity.y * up.y + v.velocity.z * up.z;
				const h = len(v.position) - R - (v.terrainHeight ?? 0);
				const want = -Math.min(25, Math.max(1.5, h * 0.08));
				// thrust to weight that holds the wanted descent rate, with the engine's own TWR unknown:
				// a proportional term on a hover guess, corrected as it learns from the speed error
				const throttle = Math.max(0, Math.min(1, 0.35 + 0.12 * (want - vs)));
				if (i % 5 === 0) sim.dispatch({ type: 'throttle', vessel: vid, value: throttle });
				sim.step(0.02);
				if (h < 2.5 && Math.abs(vs) < 0.5) landed = true;
			}
			sim.dispatch({ type: 'throttle', vessel: vid, value: 0 });
			run(sim, 3);
			expect(landed).toBe(true);
			expect(at().parts.length).toBe(parts);
			void g;
		} finally {
			sim.dispose();
		}
	}, 240_000);

	it('a capsule docks with Horizon Station on the hub top port', async () => {
		const station = blueprint('horizon-station');
		const R = registries.bodies.get('stock.home')!.radius;
		const far = { x: 0, y: R + 600_000, z: 0 };
		const still = { x: 0, y: 0, z: 0 };
		const chaser: VesselDesign = {
			formatVersion: 4,
			name: 'Ferry',
			parts: [
				{ index: 0, part: 'stock.docking-port' as never, parent: null },
				{
					index: 1,
					part: 'stock.probe-core' as never,
					parent: { index: 0, parentNode: 'bottom', node: 'top' }
				}
			],
			stages: []
		};
		// upside down: its port faces -Y, down at the station's top port
		const flipped = { x: 1, y: 0, z: 0, w: 0 };
		// where the chaser's port sits from its centre of mass, measured in a scratch sim
		const scratch = await newSim();
		const c0 = place(scratch, chaser, 'stock.home', far, still, flipped);
		const s0 = scratch.snapshot().vessels.find((v) => Number(v.id) === c0)!;
		const comToRoot = {
			x: s0.position.x - far.x,
			y: s0.position.y - far.y,
			z: s0.position.z - far.z
		};
		scratch.dispose();
		const sim = await newSim();
		try {
			const st = place(sim, station, 'stock.home', far, still);
			const sv = sim.snapshot().vessels.find((v) => Number(v.id) === st)!;
			const port = sv.parts.find((p) => p.definition === 'stock.docking-port')!;
			// the two port faces 0.6 m apart (each port's origin 0.15 m behind its face)
			const target = {
				x: sv.position.x + port.position.x,
				y: sv.position.y + port.position.y + 0.9,
				z: sv.position.z + port.position.z
			};
			const c = place(
				sim,
				chaser,
				'stock.home',
				{ x: target.x - comToRoot.x, y: target.y - comToRoot.y, z: target.z - comToRoot.z },
				{ x: 0, y: -0.25, z: 0 },
				flipped
			);
			const count = () => sim.snapshot().vessels.length;
			const before = count();
			for (let i = 0; i < 20 / 0.02 && count() === before; i++) sim.step(0.02);
			expect(count()).toBe(before - 1);
			void c;
		} finally {
			sim.dispose();
		}
	}, 180_000);
});
