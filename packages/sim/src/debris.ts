/**
 * Thrown-off pieces and closed shells (plan 219, ADR 0224). `VesselApi.spawnDebris` queues a
 * piece; after the step's splits each becomes a one-part vessel in the source part's frame, at the
 * source part's pose plus its offset and its velocity plus the push. Its mass must already have
 * left the source (a `mass` hook that drops), so pushes that cancel conserve momentum. A shell
 * (`ModuleDefinition.shell`) shields every part of the vessel inside its profile from drag and
 * convective heat.
 */
import {
	debrisName,
	partId,
	resolveVesselDesign,
	uniqueVesselName,
	type EntityId,
	type Vec3
} from '@orbital/core';
import { add, sub } from '@orbital/kepler';
import {
	frameOfPart,
	moduleDefOf,
	moduleState,
	partDefOf,
	partOf,
	vesselNames,
	vesselOf,
	type SimCore
} from './core.ts';
import { enterFlight, graceBetween, partTransform, partVelocity } from './frames.ts';
import { qRotate } from './math.ts';
import { halfExtentsOf, isTurned, partRotation } from './parts.ts';
import { placeAtState, spawnVessel } from './vessel.ts';

export interface DebrisRequest {
	from: EntityId;
	part: string;
	settings?: Record<string, Record<string, unknown>>;
	offset: Vec3;
	velocity: Vec3;
	name?: string;
}

const queues = new WeakMap<SimCore, DebrisRequest[]>();

export function queueDebris(core: SimCore, request: DebrisRequest): void {
	const q = queues.get(core) ?? [];
	q.push(request);
	queues.set(core, q);
}

/** Turns the queued pieces into vessels (after the step's splits). */
export function spawnQueuedDebris(core: SimCore): void {
	const q = queues.get(core);
	if (!q?.length) return;
	queues.delete(core);
	const spawned: EntityId[] = [];
	for (const r of q) {
		if (!core.world.hasEntity(r.from)) continue;
		const frame = frameOfPart(core, r.from);
		if (!frame) continue;
		const source = vesselOf(core, partOf(core, r.from).vessel);
		const design = {
			formatVersion: 3 as const,
			name: r.name
				? uniqueVesselName(r.name, vesselNames(core))
				: debrisName(source.name, vesselNames(core)),
			parts: [
				{
					index: 0,
					part: partId(r.part),
					parent: null,
					...(r.settings ? { settings: r.settings } : {})
				}
			],
			stages: []
		};
		const resolved = resolveVesselDesign(design, core.registries.parts);
		if (!resolved.ok) throw new Error(`debris "${r.part}": ${resolved.errors.join('; ')}`);
		const t = partTransform(core, frame, r.from);
		const position = add(frame.origin, add(t.position, qRotate(t.rotation, r.offset)));
		const velocity = add(
			add(frame.velocity, partVelocity(core, frame, r.from)),
			qRotate(t.rotation, r.velocity)
		);
		const id = spawnVessel(core, design, resolved);
		const vessel = vesselOf(core, id);
		vessel.soi = source.soi;
		if (source.owner) vessel.owner = source.owner;
		if (source.launchedAt !== undefined) vessel.launchedAt = source.launchedAt;
		if (source.launchLatitude !== undefined) vessel.launchLatitude = source.launchLatitude;
		placeAtState(core, id, position, velocity, t.rotation);
		enterFlight(core, id, frame);
		// a thrown-off piece starts beside, or inside, what it left, and beside its fellows (plan 390)
		graceBetween(frame, id, partOf(core, r.from).vessel);
		for (const other of spawned) graceBetween(frame, id, other);
		spawned.push(id);
		// `spawnVessel` announces it (`vessel:created`)
	}
}

/** Radius of a profile at height `y`, or -1 outside its span. */
function radiusAt(profile: ReadonlyArray<{ y: number; r: number }>, y: number): number {
	if (profile.length < 2 || y < profile[0]!.y - 1e-9 || y > profile.at(-1)!.y + 1e-9) return -1;
	for (let i = 1; i < profile.length; i++) {
		const a = profile[i - 1]!;
		const b = profile[i]!;
		if (y <= b.y + 1e-9) {
			const f = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
			return a.r + (b.r - a.r) * Math.min(1, Math.max(0, f));
		}
	}
	return -1;
}

/** The vessel's parts inside a closed shell of one of its parts (the shell's part itself is not). */
export function shieldedParts(core: SimCore, vesselId: EntityId): Set<EntityId> {
	const vessel = vesselOf(core, vesselId);
	const shells: Array<{
		part: EntityId;
		at: Vec3;
		profile: ReadonlyArray<{ y: number; r: number }>;
	}> = [];
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		for (const m of part.modules) {
			const profile = moduleDefOf(core, m.id).shell?.(m.config, moduleState(core, id, m.id));
			if (profile && profile.length >= 2) shells.push({ part: id, at: part.designPos, profile });
		}
	}
	const out = new Set<EntityId>();
	if (shells.length === 0) return out;
	for (const id of vessel.parts) {
		const part = partOf(core, id);
		const def = partDefOf(core, part);
		const h = halfExtentsOf(def);
		const q = isTurned(part) ? partRotation(part) : { x: 0, y: 0, z: 0, w: 1 };
		// the collider's outline: a box's corners, or points on a cylinder's two rims
		const local: Vec3[] = [];
		if (def.shape?.kind === 'cylinder') {
			for (let k = 0; k < 8; k++) {
				const a = (k * Math.PI) / 4;
				for (const sy of [-1, 1]) {
					local.push({ x: Math.cos(a) * h.x, y: sy * h.y, z: Math.sin(a) * h.z });
				}
			}
		} else {
			for (const sx of [-1, 1])
				for (const sy of [-1, 1])
					for (const sz of [-1, 1]) local.push({ x: sx * h.x, y: sy * h.y, z: sz * h.z });
		}
		const corners = local.map((c) => add(part.designPos, qRotate(q, c)));
		for (const s of shells) {
			if (s.part === id) continue;
			const inside = corners.every((c) => {
				const d = sub(c, s.at);
				const r = radiusAt(s.profile, d.y);
				return r >= 0 && Math.hypot(d.x, d.z) <= r + 1e-6;
			});
			if (inside) {
				out.add(id);
				break;
			}
		}
	}
	return out;
}

/** Drag coefficient of a closed shell: a nose cone's (plan 219). */
export const SHELL_DRAG_COEFFICIENT = 0.12;

/**
 * The shape a part with a closed shell meets the air with (plan 219): a cylinder as wide as the
 * shell's widest point and as tall as base and shell together; null without a shell.
 */
export function shellShape(
	core: SimCore,
	partId: EntityId
): { kind: 'cylinder'; radius: number; height: number } | null {
	const part = partOf(core, partId);
	for (const m of part.modules) {
		const profile = moduleDefOf(core, m.id).shell?.(m.config, moduleState(core, partId, m.id));
		if (!profile || profile.length < 2) continue;
		const radius = Math.max(...profile.map((p) => p.r));
		const height =
			profile.at(-1)!.y - Math.min(0, profile[0]!.y) + halfExtentsOf(partDefOf(core, part)).y;
		return { kind: 'cylinder', radius, height };
	}
	return null;
}

/** The vessel has a part with a closed shell now. */
export function hasShell(core: SimCore, vesselId: EntityId): boolean {
	return vesselOf(core, vesselId).parts.some((id) => shellShape(core, id) !== null);
}
