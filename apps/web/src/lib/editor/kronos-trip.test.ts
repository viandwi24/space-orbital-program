/**
 * Plan 286: Kronos V + Selene flies the whole mission in one run, headless: launch, the trans-lunar
 * burn, the transposition and docking with the lander, the burns that aim it, lunar orbit, the
 * landing, the ascent, rendezvous and docking, the burn home, the entry corridor, and the descent
 * under the parachutes. Burns are maneuver nodes flown as a player would (SAS on the node, the
 * throttle to the Δv left); the plans are searched with the patched-conic predictor of
 * `@orbital/kepler`.
 */
import { GRAVITATIONAL_CONSTANT, loadPlugins } from '@orbital/core';
import {
	patchedStateAt,
	predictPatchedConics,
	propagateUniversal,
	soiRadius,
	type PatchedBody
} from '@orbital/kepler';
import AutoDock from '@orbital/mod-autodock';
import Guidance from '@orbital/mod-guidance';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';

const { registries } = loadPlugins([Stock]);
const MOON = 'stock.cinder';
const HOME = 'stock.home';
const bodies: PatchedBody[] = registries.bodies.list().map((b) => {
	const parent = b.parent ? registries.bodies.get(b.parent) : undefined;
	return {
		id: b.id,
		mu: b.mass * GRAVITATIONAL_CONSTANT,
		soi: parent && b.orbit ? soiRadius(b.orbit.a, b.mass, parent.mass) : Infinity,
		radius: b.radius,
		...(b.parent ? { parent: b.parent } : {}),
		...(b.orbit ? { orbit: b.orbit } : {})
	} as PatchedBody;
});
const mu = (id: string) => bodies.find((b) => b.id === id)!.mu;

type Vessel = ReturnType<Sim['snapshot']>['vessels'][number];
const at = (sim: Sim, id: unknown): Vessel => sim.snapshot().vessels.find((x) => x.id === id)!;
const withPart = (sim: Sim, definition: string): Vessel =>
	sim.snapshot().vessels.find((x) => x.parts.some((p) => p.definition === definition))!;
const partOf = (v: Vessel, definition: string) => v.parts.find((p) => p.definition === definition)!;
const speedOf = (v: { velocity: { x: number; y: number; z: number } }) =>
	Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z);
const start = (v: Vessel, t: number) => ({ body: String(v.soi), r: v.position, v: v.velocity, t });
const scaled = (v: { x: number; y: number; z: number }, f: number) => ({
	x: v.x * f,
	y: v.y * f,
	z: v.z * f
});

const act = (
	sim: Sim,
	vessel: unknown,
	part: unknown,
	module: string,
	action: string,
	args: unknown[] = []
) => sim.dispatch({ type: 'action', vessel, part, module, action, args } as never);

/** Warp on rails to `time`. */
function warpTo(sim: Sim, time: number): void {
	for (let g = 0; g < 4_000 && sim.time < time - 1; g++) {
		if (sim.warp === 1) sim.dispatch({ type: 'warp-to', time, factor: 1e4 });
		sim.step(10);
	}
}

/** Periapsis radius of the first path segment in `body` that starts within `within` s, or NaN. */
function periapsisIn(
	segments: ReturnType<typeof predictPatchedConics>,
	body: string,
	opts: { within?: number; from?: number; inbound?: boolean } = {}
): number {
	const g = segments.find((s) => s.body === body && (opts.from === undefined || s.t0 > opts.from));
	if (!g?.elements || (opts.within !== undefined && g.t0 > opts.within)) return NaN;
	if (opts.inbound) {
		const e = g.entry;
		if (e.r.x * e.v.x + e.r.y * e.v.y + e.r.z * e.v.z >= 0) return NaN;
	}
	return g.elements.a * (1 - g.elements.e);
}
const path = (body: string, r: unknown, v: unknown, t: number, days: number) =>
	predictPatchedConics(bodies, { body, r, v, t } as never, days * 86_400, {
		maxSegments: 8,
		maxStep: 600
	});

/**
 * Burn a node as a player would: SAS on the node, the engine from `lead` s before it (half its
 * length) at full throttle down to the last few m/s. Returns the Δv left.
 */
function burn(
	sim: Sim,
	id: unknown,
	tNode: number,
	dv: { prograde: number; normal?: number; radial?: number },
	lead = 0
): number {
	warpTo(sim, tNode - lead - 400);
	expect(
		sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: tNode,
			normal: 0,
			radial: 0,
			...dv
		} as never).ok
	).toBe(true);
	sim.dispatch({ type: 'set-rcs', vessel: id, on: true } as never);
	sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' } as never);
	warpTo(sim, tNode - lead - 200);
	sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 } as never);
	sim.step(0.02);
	sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 } as never);
	while (sim.time < tNode - lead) sim.step(0.05);
	let best = Infinity;
	let rest = Infinity;
	for (let i = 0; i < 60 * 50 * 10; i++) {
		rest = at(sim, id).nodes?.[0]?.dv ?? 0;
		if (rest < 0.05 || rest > best + 0.5) break;
		best = Math.min(best, rest);
		sim.dispatch({ type: 'throttle', vessel: id, value: rest > 8 ? 1 : Math.max(rest / 8, 0.02) });
		sim.step(0.02);
	}
	sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
	sim.dispatch({ type: 'node-remove', vessel: id } as never);
	return rest;
}

/** Put the periapsis of the next path segment in `body` at `target` with a prograde burn `dt` ahead. */
function aimedBurn(
	sim: Sim,
	id: unknown,
	dt: number,
	body: string,
	target: number,
	opts: { within?: number; range?: number } = {}
): number {
	const v = at(sim, id);
	const st = patchedStateAt(bodies, start(v, sim.time), sim.time + dt)!;
	const sp = Math.hypot(st.v.x, st.v.y, st.v.z);
	let best = { dv: 0, cost: Infinity };
	const range = opts.range ?? 60;
	for (let dv = -range; dv <= range; dv += 0.1) {
		const segs = path(st.body, st.r, scaled(st.v, 1 + dv / sp), sim.time + dt, 4);
		const pe = periapsisIn(segs, body, opts.within ? { within: sim.time + opts.within } : {});
		if (Number.isFinite(pe) && Math.abs(pe - target) < best.cost)
			best = { dv, cost: Math.abs(pe - target) };
	}
	burn(sim, id, sim.time + dt, { prograde: best.dv });
	return best.dv;
}

describe('Kronos V + Selene, the whole mission (plan 286)', () => {
	it('flies to the moon, lands, comes back and lands under its parachutes', async () => {
		const sim = await createSim({
			plugins: [Stock, Guidance, AutoDock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1,
			seed: 7
		});
		try {
			const home = registries.bodies.get(HOME)!;
			const events: Record<string, string> = {};
			sim.events.on(
				'autopilot:ended',
				(e) => (events[String(e.vessel)] = `${e.outcome}: ${e.reason}`)
			);

			// ---- 1. the ascent to an 80 km orbit
			for (let k = 0; k < 3; k++) sim.dispatch({ type: 'crew-hire', profession: 'pilot' });
			const design = structuredClone(registries.blueprints.get('stock.kronos-selene')!.design);
			const loaded = sim.dispatch({
				type: 'load-vessel',
				design,
				crew: ['c1', 'c2', 'c3'].map((member) => ({ member, part: 0 }))
			} as never);
			if (!loaded.ok) throw new Error(loaded.reason);
			let id = loaded.vessel!;
			expect(
				sim.dispatch({
					type: 'autopilot-engage',
					vessel: id,
					autopilot: 'guidance.ascent',
					params: { altitude: 80_000 }
				}).ok
			).toBe(true);
			for (let t = 0; !events[String(id)] && t < 1500; t += 0.1) sim.step(0.1);
			expect(events[String(id)]).toBe('done: In orbit');

			// ---- 2. the trans-lunar burn: the departure time and Δv by search
			let v = at(sim, id);
			let plan = { cost: Infinity, dt: 0, dv: 0 };
			for (let dt = 0; dt < 5400; dt += 60) {
				const s = propagateUniversal(v.position, v.velocity, mu(HOME), dt);
				const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
				for (let dv = 700; dv <= 1000; dv += 5) {
					const segs = path(HOME, s.r, scaled(s.v, 1 + dv / sp), sim.time + dt, 7);
					const pe = periapsisIn(segs, MOON);
					if (Number.isFinite(pe) && Math.abs(pe - 273_000) < plan.cost)
						plan = { cost: Math.abs(pe - 273_000), dt, dv };
				}
			}
			expect(plan.cost).toBeLessThan(20_000);
			const tTli = sim.time + plan.dt;
			warpTo(sim, tTli - 600);
			sim.dispatch({
				type: 'node-set',
				vessel: id,
				time: tTli,
				prograde: plan.dv,
				normal: 0,
				radial: 0
			});
			delete events[String(id)];
			sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.node' });
			for (let k = 0; !events[String(id)] && k < 20_000; k++) {
				if (sim.time < tTli - 120 && sim.warp === 1)
					sim.dispatch({ type: 'warp-to', time: tTli - 100, factor: 100 });
				sim.step(sim.warp > 1 ? 1 : 0.05);
			}
			expect(events[String(id)]).toBe('done: Node executed');

			// ---- 3. the spent stage goes; the command ship leaves the S-IVB, turns round and docks with the lander
			sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
			for (let i = 0; i < 100; i++) sim.step(0.05);
			for (let k = 0; k < 2; k++) {
				expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
				for (let i = 0; i < 100; i++) sim.step(0.05);
			}
			for (let i = 0; i < 200; i++) sim.step(0.05);
			id = withPart(sim, 'stock.pod-3').id;
			const lander = sim
				.snapshot()
				.vessels.find(
					(x) => x.id !== id && x.parts.some((p) => p.definition === 'stock.lander-ascent')
				)!;
			expect(at(sim, id).parts).toHaveLength(19);
			sim.dispatch({ type: 'set-control-part', vessel: id, part: at(sim, id).ports![0]!.part });
			sim.dispatch({
				type: 'target-set',
				vessel: id,
				target: { kind: 'vessel', id: lander.id, part: lander.ports![0]!.part }
			});
			sim.dispatch({ type: 'sas', vessel: lander.id, mode: 'hold' });
			let docked = false;
			const offDock = sim.events.on('vessel:docked', () => (docked = true));
			expect(
				sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'autodock.dock' }).ok
			).toBe(true);
			for (let k = 0; !docked && k < 30_000; k++) sim.step(0.02);
			offDock?.();
			expect(docked).toBe(true);

			// the lander leaves the S-IVB's adapter, and the service engine pushes the stack clear of it
			id = withPart(sim, 'stock.pod-3').id;
			const docks = at(sim, id).parts.filter((p) => p.definition === 'stock.decoupler');
			expect(act(sim, id, docks[0]!.id, 'stock.decoupler', 'decouple').ok).toBe(true);
			for (let i = 0; i < 100; i++) sim.step(0.05);
			expect(
				act(sim, id, partOf(at(sim, id), 'stock.engine-wide').id, 'stock.engine', 'setActive', [
					true
				]).ok
			).toBe(true);
			sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
			sim.dispatch({ type: 'throttle', vessel: id, value: 0.3 });
			for (let i = 0; i < 100; i++) sim.step(0.05);
			sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
			for (let i = 0; i < 100; i++) sim.step(0.05);
			id = withPart(sim, 'stock.pod-3').id;
			const command = () =>
				sim.dispatch({
					type: 'set-control-part',
					vessel: id,
					part: partOf(at(sim, id), 'stock.pod-3').id
				});
			command();

			// ---- 4. the burns that put the periapsis at the moon about 75 km up
			for (let round = 0; round < 4; round++) {
				const segs = path(
					String(at(sim, id).soi),
					at(sim, id).position,
					at(sim, id).velocity,
					sim.time,
					7
				);
				const pe = periapsisIn(segs, MOON, { within: sim.time + 3 * 86_400 });
				if (Math.abs(pe - 275_000) < 15_000) break;
				aimedBurn(sim, id, round === 0 ? 1800 : 12 * 3600, MOON, 275_000, {
					within: 3 * 86_400,
					range: 40
				});
			}
			const toMoon = path(
				String(at(sim, id).soi),
				at(sim, id).position,
				at(sim, id).velocity,
				sim.time,
				7
			);
			const encounter = toMoon.find((g) => g.body === MOON)!;
			const approach = encounter.elements!.a * (1 - encounter.elements!.e);
			expect(approach).toBeGreaterThan(220_000);
			expect(approach).toBeLessThan(330_000);
			warpTo(sim, encounter.t0 + 60);
			expect(at(sim, id).soi).toBe(MOON);

			// ---- 5. lunar orbit insertion at the periapsis
			let o = at(sim, id).orbit!;
			const moonMu = mu(MOON);
			const n = Math.sqrt(moonMu / Math.abs(o.a) ** 3);
			const tPe = (o.epoch ?? sim.time) - o.m0 / n;
			const rPe = Math.abs(o.a) * (o.e - 1);
			const loi = Math.sqrt(moonMu * (2 / rPe + 1 / Math.abs(o.a))) - Math.sqrt(moonMu / rPe);
			burn(sim, id, tPe, { prograde: -loi }, 40);
			o = at(sim, id).orbit!;
			expect(o.e).toBeLessThan(0.1);
			expect(o.a).toBeGreaterThan(240_000);
			expect(o.a).toBeLessThan(300_000);

			// ---- 6. two crew into the lander, which undocks and lands
			const cab = partOf(at(sim, id), 'stock.lander-ascent');
			for (const member of ['c2', 'c3'])
				expect(
					sim.dispatch({ type: 'crew-transfer', vessel: id, member, to: cab.id } as never).ok
				).toBe(true);
			const lmPort = at(sim, id)
				.parts.filter((p) => p.definition === 'stock.docking-port-small')
				.at(-1)!;
			expect(act(sim, id, lmPort.id, 'stock.docking-port', 'undock').ok).toBe(true);
			for (let i = 0; i < 200; i++) sim.step(0.05);
			let lm = withPart(sim, 'stock.lander-ascent').id;
			id = withPart(sim, 'stock.pod-3').id;
			const lmv = at(sim, lm);
			sim.dispatch({
				type: 'set-control-part',
				vessel: lm,
				part: partOf(lmv, 'stock.lander-ascent').id
			});
			expect(
				act(sim, lm, partOf(lmv, 'stock.lander-descent').id, 'stock.engine', 'setActive', [true]).ok
			).toBe(true);
			sim.dispatch({ type: 'set-rcs', vessel: lm, on: true } as never);
			expect(
				sim.dispatch({ type: 'autopilot-engage', vessel: lm, autopilot: 'guidance.land' }).ok
			).toBe(true);
			for (let k = 0; !events[String(lm)] && k < 200_000; k++) sim.step(0.05);
			expect(events[String(lm)]).toBe('done: Landed');
			expect(at(sim, lm).parts).toHaveLength(17);

			// ---- 7. the ascent stage lifts off to a 20 km orbit
			const down = at(sim, lm);
			expect(
				act(sim, lm, partOf(down, 'stock.lander-ascent').id, 'stock.engine', 'setActive', [true]).ok
			).toBe(true);
			act(sim, lm, partOf(down, 'stock.lander-descent').id, 'stock.engine', 'setActive', [false]);
			expect(
				act(sim, lm, partOf(down, 'stock.decoupler').id, 'stock.decoupler', 'decouple').ok
			).toBe(true);
			for (let i = 0; i < 100; i++) sim.step(0.02);
			lm = withPart(sim, 'stock.lander-ascent').id;
			sim.dispatch({
				type: 'set-control-part',
				vessel: lm,
				part: partOf(at(sim, lm), 'stock.lander-ascent').id
			});
			sim.dispatch({ type: 'set-rcs', vessel: lm, on: true } as never);
			delete events[String(lm)];
			expect(
				sim.dispatch({
					type: 'autopilot-engage',
					vessel: lm,
					autopilot: 'guidance.ascent',
					params: { altitude: 20_000 }
				}).ok
			).toBe(true);
			for (let k = 0; !events[String(lm)] && k < 200_000; k++) sim.step(0.05);
			expect(events[String(lm)]).toBe('done: In orbit');

			// ---- 8. rendezvous and docking with the command ship
			const mine = at(sim, lm);
			const theirs = at(sim, id);
			sim.dispatch({ type: 'set-control-part', vessel: lm, part: mine.ports![0]!.part });
			sim.dispatch({
				type: 'target-set',
				vessel: lm,
				target: { kind: 'vessel', id, part: theirs.ports![0]!.part }
			});
			docked = false;
			const offDock2 = sim.events.on('vessel:docked', () => (docked = true));
			delete events[String(lm)];
			expect(
				sim.dispatch({
					type: 'autopilot-engage',
					vessel: lm,
					autopilot: 'guidance.rendezvous',
					params: { dock: true, standoff: 100 }
				}).ok
			).toBe(true);
			for (let k = 0; !docked && k < 400_000; k++) {
				sim.step(sim.warp > 1 ? 1 : 0.05);
				if (
					!at(sim, lm)?.autopilot &&
					events[String(lm)] &&
					!events[String(lm)]!.includes('replaced')
				)
					break;
			}
			offDock2?.();
			expect(docked).toBe(true);

			// ---- 9. the crew back into the capsule, the ascent stage cast off, the burn home
			id = withPart(sim, 'stock.pod-3').id;
			for (const member of ['c2', 'c3'])
				expect(
					sim.dispatch({
						type: 'crew-transfer',
						vessel: id,
						member,
						to: partOf(at(sim, id), 'stock.pod-3').id
					} as never).ok
				).toBe(true);
			expect(
				act(
					sim,
					id,
					at(sim, id).parts.filter((p) => p.definition === 'stock.docking-port-small')[0]!.id,
					'stock.docking-port',
					'undock'
				).ok
			).toBe(true);
			for (let i = 0; i < 100; i++) sim.step(0.05);
			id = withPart(sim, 'stock.pod-3').id;
			command();
			const vm = at(sim, id);
			let tei = { cost: Infinity, dt: 0, dv: 0 };
			for (let dt = 0; dt < 3600; dt += 30) {
				const s = propagateUniversal(vm.position, vm.velocity, moonMu, dt);
				const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
				for (let dv = 500; dv <= 1200; dv += 10) {
					const segs = path(MOON, s.r, scaled(s.v, 1 + dv / sp), sim.time + dt, 8);
					const pe = periapsisIn(segs, HOME, { inbound: true, from: sim.time });
					if (Number.isFinite(pe) && Math.abs(pe - 636_000) < tei.cost)
						tei = { cost: Math.abs(pe - 636_000), dt, dv };
				}
			}
			expect(tei.cost).toBeLessThan(30_000);
			burn(sim, id, sim.time + tei.dt, { prograde: tei.dv }, 60);

			// ---- 10. the entry corridor
			for (let round = 0; round < 3; round++) {
				const w = at(sim, id);
				const segs = path(String(w.soi), w.position, w.velocity, sim.time, 4);
				const pe = periapsisIn(segs, HOME, { inbound: true, from: sim.time });
				if (Math.abs(pe - 636_000) < 15_000) break;
				aimedBurn(sim, id, round === 0 ? 900 : 1500, HOME, 636_000);
			}

			// ---- 11. the service module goes, the capsule enters and comes down under its chutes
			for (let g = 0; g < 400 && String(at(sim, id).soi) !== HOME; g++) {
				if (sim.warp === 1) sim.dispatch({ type: 'warp', factor: 100 });
				sim.step(5);
			}
			sim.dispatch({ type: 'warp', factor: 1 });
			o = at(sim, id).orbit!;
			const nh = Math.sqrt(mu(HOME) / Math.abs(o.a) ** 3);
			const tEntry =
				(o.epoch ?? sim.time) +
				(o.e < 1 ? ((2 * Math.PI - o.m0) % (2 * Math.PI)) / nh : -o.m0 / nh);
			warpTo(sim, tEntry - 900);
			const sep = at(sim, id).parts.filter((p) => p.definition === 'stock.decoupler-wide')[0]!;
			expect(act(sim, id, sep.id, 'stock.decoupler', 'decouple').ok).toBe(true);
			for (let i = 0; i < 100; i++) sim.step(0.05);
			id = withPart(sim, 'stock.pod-3').id;
			const pod = partOf(at(sim, id), 'stock.pod-3');
			sim.dispatch({ type: 'set-control-part', vessel: id, part: pod.id });
			sim.dispatch({ type: 'set-rcs', vessel: id, on: true } as never);
			sim.dispatch({ type: 'sas', vessel: id, mode: 'reentry' } as never);
			expect(act(sim, id, pod.id, 'stock.parachute', 'deploy').ok).toBe(true);
			const capsuleParts = at(sim, id).parts.length;
			let touchdown = Infinity;
			let landed = false;
			for (let k = 0; k < 400_000 && !landed; k++) {
				const before = at(sim, id);
				sim.step(0.05);
				const w = at(sim, id);
				if (!w || !before) break;
				const alt = Math.hypot(w.position.x, w.position.y, w.position.z) - home.radius;
				if (alt > 200_000 && sim.warp === 1 && k % 200 === 0)
					sim.dispatch({ type: 'warp', factor: 10 });
				if (alt < 150_000 && sim.warp > 1) sim.dispatch({ type: 'warp', factor: 1 });
				if (alt > 3_000_000 && sim.time > tEntry + 600) break;
				if (w.surface === true || w.splashed === true) {
					landed = true;
					// the vertical speed: the ground under it turns at up to 174 m/s
					const r = Math.hypot(before.position.x, before.position.y, before.position.z);
					touchdown =
						-(
							before.velocity.x * before.position.x +
							before.velocity.y * before.position.y +
							before.velocity.z * before.position.z
						) / r;
				}
			}
			expect(landed).toBe(true);
			expect(Math.abs(touchdown)).toBeLessThan(10);
			expect(at(sim, id).parts).toHaveLength(capsuleParts);
			expect(at(sim, id).parts.some((p) => p.definition === 'stock.pod-3')).toBe(true);
		} finally {
			sim.dispose();
		}
	}, 1_800_000);
});
