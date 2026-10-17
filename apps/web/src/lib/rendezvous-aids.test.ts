import {
	bodyId,
	partId,
	type EntityId,
	type Snapshot,
	type Vec3,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import { bodyStateAt, predictWithManeuvers, propagateUniversal } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { bodyNodes } from './map-path';
import { aidCommand, patchedApproach, rendezvousAids, targetMotion } from './rendezvous-aids';

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'].map((p, index) => ({
		index,
		part: partId(p),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
};

const R = 600_000;
const MU = 3.5316e12;
/** A circular prograde orbit at radius `r`, `phase` rad ahead of +X (the sim's convention: velocity along -Z at phase 0). */
function circular(r: number, phase: number): { position: Vec3; velocity: Vec3 } {
	const v = Math.sqrt(MU / r);
	const c = Math.cos(phase);
	const s = Math.sin(phase);
	return {
		position: { x: r * c, y: 0, z: -r * s },
		velocity: { x: -v * s, y: 0, z: -v * c }
	};
}

let sim: Sim | null = null;
afterEach(() => {
	sim?.dispose();
	sim = null;
});

async function world(): Promise<Sim> {
	sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	return sim;
}
function load(s: Sim, state: { position: Vec3; velocity: Vec3 }, body?: string): EntityId {
	const res = s.dispatch({
		type: 'load-vessel',
		design: probe,
		placement: { kind: 'state', ...(body ? { body: bodyId(body) } : {}), ...state }
	});
	if (!res.ok) throw new Error(res.reason);
	return res.vessel as EntityId;
}
const vesselOf = (snap: Snapshot, id: EntityId): VesselSnapshot =>
	snap.vessels.find((v) => v.id === id)!;

describe('closest approach across spheres (page) against the sim', () => {
	it('agrees with the sim in one sphere: two probes on neighbouring circles', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		const b = load(s, circular(R + 160_000, 0.4));
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const snap = s.snapshot();
		const v = vesselOf(snap, a);
		const simApproach = v.target!.approach!;
		// The sim looks one revolution ahead with 240 samples; use the same window to compare like with like.
		const period = 2 * Math.PI * Math.sqrt(v.orbit!.a ** 3 / MU);
		const mine = patchedApproach(snap, v, bodyNodes(s.registries.bodies.list()), {
			window: period,
			samples: 240
		})!;
		expect(simApproach).not.toBeNull();
		expect(Math.abs(mine.distance - simApproach.distance)).toBeLessThan(1_000);
		expect(Math.abs(mine.time - simApproach.time)).toBeLessThan(1);
		expect(Math.abs(mine.relativeSpeed - simApproach.relativeSpeed)).toBeLessThan(0.5);
	});

	it('agrees with the sim for a body target in the same sphere (the moon)', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		s.dispatch({
			type: 'target-set',
			vessel: a,
			target: { kind: 'body', id: bodyId('stock.cinder') }
		});
		const snap = s.snapshot();
		const v = vesselOf(snap, a);
		const simApproach = v.target!.approach!;
		const mine = patchedApproach(snap, v, bodyNodes(s.registries.bodies.list()))!;
		expect(Math.abs(mine.distance - simApproach.distance)).toBeLessThan(1_000);
	});

	it('gives a result where the sim gives none: a vessel in the moon sphere, a target in the planet sphere', async () => {
		const s = await world();
		const moon = 'stock.cinder';
		const lander = load(
			s,
			{
				position: { x: 290_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -Math.sqrt(5.776e10 / 290_000) }
			},
			moon
		);
		const other = load(s, circular(R + 5_000_000, 1));
		s.dispatch({ type: 'target-set', vessel: lander, target: { kind: 'vessel', id: other } });
		const snap = s.snapshot();
		const v = vesselOf(snap, lander);
		expect(String(v.soi)).toBe(moon);
		expect(v.target!.approach).toBeNull();
		const bodies = bodyNodes(s.registries.bodies.list());
		const mine = patchedApproach(snap, v, bodies)!;
		expect(mine).not.toBeNull();
		expect(mine.distance).toBeGreaterThan(0);
		// Brute force on the same two motions: the vessel stays in the moon sphere over this look-ahead.
		const motion = targetMotion(snap, v, bodies)!;
		const moonMu = bodies.find((b) => b.id === moon)!.mu;
		let best = Infinity;
		for (let k = 0; k <= 12_000; k++) {
			const t = snap.t + (k / 12_000) * 6_000;
			const rel = propagateUniversal(v.position, v.velocity, moonMu, t - snap.t);
			const m = bodyStateAt(bodies, moon, t, 'system');
			const o = motion.at(t);
			best = Math.min(
				best,
				Math.hypot(m.r.x + rel.r.x - o.r.x, m.r.y + rel.r.y - o.r.y, m.r.z + rel.r.z - o.r.z)
			);
		}
		expect(mine.distance).toBeLessThanOrEqual(best + 1);
		expect(mine.distance).toBeGreaterThan(best - 500);
	});
});

describe('rendezvous aids', () => {
	it('match velocity: the node, replayed on the path, leaves zero relative speed at the approach', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		const b = load(s, circular(R + 160_000, 0.4));
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const snap = s.snapshot();
		const v = vesselOf(snap, a);
		const bodies = bodyNodes(s.registries.bodies.list());
		const approach = patchedApproach(snap, v, bodies)!;
		const aids = rendezvousAids(snap, v, bodies, approach);
		expect(aids.map((x) => x.id)).toEqual([
			'approach',
			'match',
			'hohmann',
			'node-ascending',
			'node-descending'
		]);
		const match = aids.find((x) => x.id === 'match')!;
		const cmd = aidCommand(Number(a), match)!;
		expect(cmd).toMatchObject({ type: 'node-set', vessel: a, time: approach.time });
		const node = match.node!;
		const path = predictWithManeuvers(
			bodies,
			{ body: String(v.soi), r: v.position, v: v.velocity, t: snap.t },
			[{ id: 1, ...node }],
			node.time - snap.t + 10
		);
		const post = path.nodes[0]!.post;
		// After the burn the vessel moves with the target there.
		const want = {
			x: approach.relative.v.x + approach.relativeVelocity.x,
			y: approach.relative.v.y + approach.relativeVelocity.y,
			z: approach.relative.v.z + approach.relativeVelocity.z
		};
		expect(Math.hypot(post.v.x - want.x, post.v.y - want.y, post.v.z - want.z)).toBeLessThan(1e-6);
		expect(Math.hypot(...Object.values(node))).toBeGreaterThan(0);
	});

	it('Hohmann: the node puts the vessel within 1 % of the target orbit radius of the target', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		const b = load(s, circular(R + 300_000, 1));
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const snap = s.snapshot();
		const v = vesselOf(snap, a);
		const bodies = bodyNodes(s.registries.bodies.list());
		const aids = rendezvousAids(snap, v, bodies, patchedApproach(snap, v, bodies));
		const h = aids.find((x) => x.id === 'hohmann')!;
		expect(h.node).toBeDefined();
		// Hand value: vis-viva at 750 km towards 900 km.
		const r1 = R + 150_000;
		const r2 = R + 300_000;
		const dv = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
		expect(Math.abs(h.node!.prograde / dv - 1)).toBeLessThan(0.01);
		const withNode: VesselSnapshot = { ...v, nodes: [{ id: 1, ...h.node!, dv: Math.abs(dv) }] };
		const after = patchedApproach(
			{ ...snap, vessels: snap.vessels.map((x) => (x.id === a ? withNode : x)) },
			withNode,
			bodies,
			{ samples: 1_200 }
		)!;
		expect(after.withNodes).toBe(true);
		expect(after.distance).toBeLessThan(0.01 * r2);
		expect(after.time).toBeGreaterThan(h.node!.time);
	});

	it('plane change: aids exist for inclined orbits and say why when the planes are parallel', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		const incl = circular(R + 200_000, 0.3);
		const tilt = 0.2;
		const tilted = {
			position: {
				x: incl.position.x,
				y: incl.position.z * Math.sin(tilt),
				z: incl.position.z * Math.cos(tilt)
			},
			velocity: {
				x: incl.velocity.x,
				y: incl.velocity.z * Math.sin(tilt),
				z: incl.velocity.z * Math.cos(tilt)
			}
		};
		const b = load(s, tilted);
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		const snap = s.snapshot();
		const v = vesselOf(snap, a);
		const bodies = bodyNodes(s.registries.bodies.list());
		const aids = rendezvousAids(snap, v, bodies, patchedApproach(snap, v, bodies));
		const an = aids.find((x) => x.id === 'node-ascending')!;
		const dn = aids.find((x) => x.id === 'node-descending')!;
		expect(an.node).toBeDefined();
		expect(dn.node).toBeDefined();
		// 2 v sin(i / 2) for a circular orbit, i = 0.2 rad.
		const dvPlane = 2 * Math.sqrt(MU / (R + 150_000)) * Math.sin(0.1);
		for (const n of [an.node!, dn.node!]) {
			expect(Math.abs(Math.hypot(n.prograde, n.normal, n.radial) / dvPlane - 1)).toBeLessThan(0.02);
		}
		expect(Math.abs(an.node!.time - dn.node!.time)).toBeGreaterThan(1_000);
		const flat = load(s, circular(R + 200_000, 0.3));
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: flat } });
		const snap2 = s.snapshot();
		const v2 = vesselOf(snap2, a);
		const aids2 = rendezvousAids(snap2, v2, bodies, patchedApproach(snap2, v2, bodies));
		expect(aids2.find((x) => x.id === 'node-ascending')!.node).toBeUndefined();
		expect(aids2.find((x) => x.id === 'node-ascending')!.detail).toContain('aligned');
	});

	it('says why when the target is in another sphere, or there is none', async () => {
		const s = await world();
		const a = load(s, circular(R + 150_000, 0));
		const bodies = bodyNodes(s.registries.bodies.list());
		let snap = s.snapshot();
		let v = vesselOf(snap, a);
		expect(rendezvousAids(snap, v, bodies, null).every((x) => !x.node)).toBe(true);
		const lander = load(
			s,
			{ position: { x: 290_000, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -446 } },
			'stock.cinder'
		);
		s.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: lander } });
		snap = s.snapshot();
		v = vesselOf(snap, a);
		const aids = rendezvousAids(snap, v, bodies, patchedApproach(snap, v, bodies));
		expect(aids.find((x) => x.id === 'hohmann')!.node).toBeUndefined();
		expect(aids.find((x) => x.id === 'hohmann')!.detail).toContain('stock.cinder');
		expect(aids.find((x) => x.id === 'approach')!.node).toBeDefined();
	});
});
