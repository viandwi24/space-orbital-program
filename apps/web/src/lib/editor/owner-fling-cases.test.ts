/**
 * Plan 390: the two cases the owner reported (2026-10-21 and after): opening the Wayfarer's cargo
 * bay and undocking its module, and Kronos opening its petals and releasing the lander, threw the
 * rocket far and fast. Each runs far from any planet, where gravity is a rounding error, and
 * measures what the ship and what it let go of did: the change of velocity and the spin.
 */
import { loadPlugins, type Quat, type Vec3, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { subtreeOf } from '../design';
import { blueprintDesign } from '../blueprint-registry';

const { registries } = loadPlugins([Stock]);
const blueprint = (id: string) => blueprintDesign(id, registries.blueprints.list());
const newSim = () =>
	createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
const indexOf = (design: VesselDesign, part: string): number =>
	design.parts.find((p) => p.part === part)!.index;
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
const FAR = { x: 0, y: 4e8, z: 0 };
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** The angle of the turn from `a` to `b`, degrees. */
function turn(a: Quat, b: Quat): number {
	const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
	return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

/**
 * What a vessel did while the scene ran: the largest push it got (its change of velocity less the
 * pull of gravity, summed) and the fastest spin over a 0.5 s window.
 */
class Watch {
	readonly dv: number[] = [];
	readonly spin: number[] = [];
	private readonly trail: Quat[] = [];
	private last: { p: Vec3; v: Vec3 } | null = null;
	private push: Vec3 = { x: 0, y: 0, z: 0 };
	private readonly mu = registries.bodies.get('stock.home')!.mass * 6.6743e-11;
	constructor(
		private readonly sim: Sim,
		private readonly id: number
	) {}
	sample(dt: number): void {
		const v = this.sim.snapshot().vessels.find((x) => Number(x.id) === this.id);
		if (!v) return;
		if (this.last) {
			const mid = {
				x: (this.last.p.x + v.position.x) / 2,
				y: (this.last.p.y + v.position.y) / 2,
				z: (this.last.p.z + v.position.z) / 2
			};
			const r = len(mid);
			const k = (-this.mu / r ** 3) * dt;
			this.push = {
				x: this.push.x + v.velocity.x - this.last.v.x - mid.x * k,
				y: this.push.y + v.velocity.y - this.last.v.y - mid.y * k,
				z: this.push.z + v.velocity.z - this.last.v.z - mid.z * k
			};
		}
		this.last = { p: v.position, v: v.velocity };
		this.dv.push(len(this.push));
		this.trail.push(v.orientation);
		const n = this.trail.length;
		if (n > 5) this.spin.push(turn(this.trail[n - 6]!, v.orientation) / (5 * dt));
	}
	get maxDv(): number {
		return Math.max(0, ...this.dv);
	}
	get maxSpin(): number {
		return Math.max(0, ...this.spin);
	}
}

function place(sim: Sim, design: VesselDesign, orbit = false): number {
	const home = registries.bodies.get('stock.home')!;
	const r0 = home.radius + 300_000;
	const vc = Math.sqrt((home.mass * 6.6743e-11) / r0);
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: orbit
			? {
					kind: 'state',
					body: 'stock.home',
					position: { x: r0, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -vc }
				}
			: { kind: 'state', body: 'stock.home', position: FAR, velocity: { x: 0, y: 0, z: 0 } }
	} as never);
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return Number(r.vessel);
}

function stepWatching(sim: Sim, seconds: number, watches: Watch[]): void {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) {
		sim.step(0.02);
		if (i % 5 === 4) for (const w of watches) w.sample(0.1);
	}
}

describe('the owner cases (plan 390)', () => {
	for (const orbit of [false, true]) {
		const where = orbit ? 'in a 300 km orbit' : 'far from any planet';
		it(`Wayfarer ${where} opens its cargo bay and undocks the station module: the orbiter is not thrown`, async () => {
			const full = blueprint('wayfarer-shuttle');
			const tank = indexOf(full, 'stock.external-tank');
			const drop = new Set(subtreeOf(full, tank));
			const rd = full.parts.find(
				(p) =>
					p.part === 'stock.radial-decoupler' &&
					!drop.has(p.index) &&
					full.parts.some((q) => q.parent?.index === p.index && drop.has(q.index))
			);
			if (rd) drop.add(rd.index);
			const keep = new Set(full.parts.filter((p) => !drop.has(p.index)).map((p) => p.index));
			const design = piece(full, keep, []);
			const sim = await newSim();
			try {
				const id = place(sim, design, orbit);
				const orbiter = () => sim.snapshot().vessels.find((v) => Number(v.id) === id)!;
				for (let i = 0; i < 200; i++) sim.step(0.02);
				const ship = new Watch(sim, id);
				const bay = orbiter().parts.find((p) => p.definition === 'stock.orbiter-bay')!;
				stepWatching(sim, 1, [ship]);
				expect(
					sim.dispatch({
						type: 'action',
						vessel: orbiter().id,
						part: bay.id,
						module: 'stock.bay',
						action: 'open'
					}).ok
				).toBe(true);
				stepWatching(sim, 7, [ship]);
				const side = orbiter().parts.find((p) => p.definition === 'stock.docking-port-side')!;
				expect(
					sim.dispatch({
						type: 'action',
						vessel: orbiter().id,
						part: side.id,
						module: 'stock.docking-port',
						action: 'undock'
					}).ok
				).toBe(true);
				const module = () =>
					sim
						.snapshot()
						.vessels.find((v) => v.parts.some((p) => p.definition === 'stock.crew-cabin'))!;
				const cabin = Number(module().id);
				expect(cabin).not.toBe(id);
				const pod = new Watch(sim, cabin);
				stepWatching(sim, 5, [ship, pod]);
				console.log(
					`wayfarer: orbiter dv ${ship.maxDv.toFixed(3)} m/s, spin ${ship.maxSpin.toFixed(2)} °/s; module dv ${pod.maxDv.toFixed(3)} m/s, spin ${pod.maxSpin.toFixed(2)} °/s`
				);
				expect(ship.maxDv).toBeLessThan(0.5);
				expect(ship.maxSpin).toBeLessThan(5);
				expect(pod.maxDv).toBeLessThan(0.5);
				expect(pod.maxSpin).toBeLessThan(5);
			} finally {
				sim.dispose();
			}
		}, 240_000);

		it(`Kronos ${where} opens its petals and lets the lander go: neither the ship nor the lander is thrown`, async () => {
			const full = blueprint('kronos-selene');
			const petals = indexOf(full, 'stock.payload-petals');
			const keep = subtreeOf(full, petals);
			const seat = full.parts.find(
				(p) => p.parent?.index === petals && p.parent.parentNode === 'inner'
			)!;
			const design = piece(full, keep, [[petals], [seat.index]]);
			const sim = await newSim();
			try {
				const id = place(sim, design, orbit);
				const ring = () => sim.snapshot().vessels.find((v) => Number(v.id) === id)!;
				sim.step(0.5);
				const ship = new Watch(sim, id);
				stepWatching(sim, 1, [ship]);
				expect(sim.dispatch({ type: 'stage', vessel: ring().id }).ok).toBe(true);
				stepWatching(sim, 5, [ship]);
				expect(sim.dispatch({ type: 'stage', vessel: ring().id }).ok).toBe(true);
				const holding = (part: string) => () =>
					sim.snapshot().vessels.find((v) => v.parts.some((p) => p.definition === part))!;
				const lander = holding('stock.lander-descent');
				const carrier = holding('stock.payload-petals');
				expect(Number(lander().id)).not.toBe(Number(carrier().id));
				const down = new Watch(sim, Number(lander().id));
				const left = new Watch(sim, Number(carrier().id));
				stepWatching(sim, 5, [down, left]);
				console.log(
					`kronos: before the release dv ${ship.maxDv.toFixed(3)} m/s, spin ${ship.maxSpin.toFixed(2)} °/s; carrier dv ${left.maxDv.toFixed(3)} m/s, spin ${left.maxSpin.toFixed(2)} °/s; lander dv ${down.maxDv.toFixed(3)} m/s, spin ${down.maxSpin.toFixed(2)} °/s`
				);
				expect(Math.max(ship.maxDv, left.maxDv)).toBeLessThan(0.5);
				expect(Math.max(ship.maxSpin, left.maxSpin)).toBeLessThan(5);
				expect(down.maxDv).toBeLessThan(0.5);
				expect(down.maxSpin).toBeLessThan(5);
			} finally {
				sim.dispose();
			}
		}, 240_000);
	}
});
