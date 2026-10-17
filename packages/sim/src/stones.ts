/**
 * Stones as colliders (plan 060, ADR 0092). The stones of an airless body are a pure function of a
 * lattice (`@orbital/core` `stonesAround`), the same list the renderer draws. A flight vessel near
 * the ground gets, next to its ground tile, one kinematic body that carries a sphere per stone
 * within `STONE_WINDOW` of where the field was built (the nearest `STONE_MAX`): the sphere is the
 * drawn dome's cap (`stoneCollider`), standing on the terrain height under the stone. The body is
 * fixed to the rotating ground (body-fixed axes, anchored at the terrain point under the centre of
 * mass when it was built), so the stones move with the planet like the tile. It is rebuilt when the
 * centre of mass has moved `STONE_REFRESH` from the anchor. Stones are derived data: nothing of
 * them is saved, and a resumed or woken vessel builds the same field from the same function.
 */
import {
	bodyHasStones,
	stoneCollider,
	stonesAround,
	type BodyHandle,
	type PhysicsBackend,
	type ShapePlacement,
	type Vec3
} from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { rotationAt, spinAt, type BodyRuntime } from './bodies.ts';
import { GROUND_FRICTION, STONE_MAX, STONE_REFRESH, STONE_WINDOW } from './constants.ts';
import type { SimCore } from './core.ts';
import { qRotate } from './math.ts';
import { toBodyFixed } from './terrain.ts';

/** The stone body of one vessel. */
export interface StoneField {
	handle: BodyHandle;
	/** Unit body-fixed direction of the anchor (the centre of mass when built). */
	anchorDir: Vec3;
	/** Body-fixed position of the anchor on the terrain, m from the body's centre. */
	anchorPoint: Vec3;
	/** Body-fixed offsets of the stone spheres' centres from the anchor point, m. */
	offsets: Vec3[];
	radii: number[];
	/** Local-frame centres as of the last placement (to find which stone a contact belongs to). */
	centres: Vec3[];
}

/** Whether this body's ground has stone colliders: stones and a terrain field to stand them on. */
export const bodyHasStoneColliders = (planet: BodyRuntime): boolean =>
	planet.terrain !== undefined && bodyHasStones(planet.def);

const seedOf = (planet: BodyRuntime): number =>
	planet.def.terrain?.kind === 'craters' ? (planet.def.terrain.seed ?? 0) : 0;

/** Distance along the ground between two unit body-fixed directions, m. */
const arc = (a: Vec3, b: Vec3, radius: number): number =>
	radius * Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

/** The stones round `centreDir` (unit, body-fixed) as sphere data, nearest first. */
export function stoneSpheres(
	planet: BodyRuntime,
	centreDir: Vec3
): { centre: Vec3; radius: number }[] {
	const terrain = planet.terrain!;
	const radius = planet.def.radius;
	return stonesAround(centreDir, radius, STONE_WINDOW, STONE_MAX, seedOf(planet)).map((stone) => {
		const sphere = stoneCollider(stone);
		const h = terrain.heightAt(stone.direction);
		return {
			centre: scale(stone.direction, radius + h + sphere.centreHeight),
			radius: sphere.radius
		};
	});
}

/** Whether the field (if any) must be (re)built for a centre of mass in direction `centreDir`. */
export const needsStones = (
	field: StoneField | undefined,
	centreDir: Vec3,
	radius: number
): boolean => !field || arc(field.anchorDir, centreDir, radius) > STONE_REFRESH;

/** Create the stone body for `centreDir`; undefined when no stone is within the window. */
export function createStoneField(
	backend: PhysicsBackend,
	planet: BodyRuntime,
	centreDir: Vec3,
	anchorHeight: number
): StoneField | undefined {
	const spheres = stoneSpheres(planet, centreDir);
	if (spheres.length === 0) return undefined;
	const anchorPoint = scale(centreDir, planet.def.radius + anchorHeight);
	const offsets = spheres.map((s) => sub(s.centre, anchorPoint));
	const radii = spheres.map((s) => s.radius);
	const shapes: ShapePlacement[] = spheres.map((s, i) => ({
		shape: { type: 'sphere', radius: s.radius },
		position: offsets[i]!
	}));
	const handle = backend.createBody({
		kind: 'kinematic',
		shape: { type: 'compound', shapes },
		mass: 1,
		inertia: { x: 1, y: 1, z: 1 },
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0, w: 1 },
		friction: GROUND_FRICTION,
		restitution: 0
	});
	return { handle, anchorDir: centreDir, anchorPoint, offsets, radii, centres: [] };
}

/**
 * Move the stone body with the rotating ground: its pose is the anchor turned by the planet's spin,
 * its velocity the ground's at the anchor, relative to the frame. Fills `centres`.
 */
export function placeStones(
	core: SimCore,
	frame: { backend: PhysicsBackend; origin: Vec3; velocity: Vec3 },
	planet: BodyRuntime,
	field: StoneField
): void {
	const turn = rotationAt(planet, core.t);
	const surface = qRotate(turn, field.anchorPoint);
	const omega = spinAt(planet, core.t);
	const position = sub(surface, frame.origin);
	frame.backend.setTransform(field.handle, { position, rotation: turn });
	frame.backend.setVelocity(field.handle, {
		linear: sub(cross(omega, surface), frame.velocity),
		angular: omega
	});
	field.centres = field.offsets.map((o) => add(position, qRotate(turn, o)));
}

/**
 * The unit normal of the stone a contact point lies on, or undefined when it is on none (within a
 * few centimetres of a sphere's surface counts): from the stone's centre through the point.
 */
export function stoneNormalAt(field: StoneField, point: Vec3): Vec3 | undefined {
	let best: Vec3 | undefined;
	let bestGap = 0.05;
	for (let i = 0; i < field.centres.length; i++) {
		const d = sub(point, field.centres[i]!);
		const gap = Math.abs(length(d) - field.radii[i]!);
		if (gap < bestGap) {
			bestGap = gap;
			best = normalize(d);
		}
	}
	return best;
}

/** The body-fixed unit direction of a BCI position. */
export const bodyFixedDirection = (core: SimCore, planet: BodyRuntime, r: Vec3): Vec3 =>
	normalize(toBodyFixed(core, planet, r));
