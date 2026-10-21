/**
 * People walking and standing about (plan 341, ADR 0291): the Hangar's crew and the Space Center's
 * staff. A spec gives an outfit, an id for the look, and a path (a spot, a circle, or a line paced
 * back and forth); poses are pure functions of time.
 */
import type { Material, SkinnedMesh } from 'three';
import { appearanceOf, type OutfitId } from './outfits.ts';
import { createCrewMaterial, createPerson } from './person.ts';
import { personPose, type Action } from './poses.ts';

export interface CrewSpec {
	/** The character's outfit (plan 341, ADR 0291) and the id its look comes from. */
	outfit: OutfitId;
	id: string;
	/** What a standing figure does; walkers walk. */
	action?: Exclude<Action, 'walk'>;
	/** Path: a point, a circle around the platform, or a line paced back and forth. */
	path:
		| { kind: 'stand'; x: number; z: number; facing: number }
		| { kind: 'circle'; radius: number; start: number; direction: 1 | -1 }
		| {
				kind: 'line';
				from: readonly [number, number];
				to: readonly [number, number];
				pause: number;
		  };
}

export const WALK_SPEED = 1.15;

export interface CrewPose {
	x: number;
	z: number;
	/** Yaw about y so the figure faces its walking direction (its front is +x at yaw 0, like the tug). */
	yaw: number;
	/** Distance walked, m; 0 for a standing figure. The legs swing with it. */
	walked: number;
	moving: boolean;
}

export function crewPose(spec: CrewSpec, t: number): CrewPose {
	const p = spec.path;
	if (p.kind === 'stand') return { x: p.x, z: p.z, yaw: p.facing, walked: 0, moving: false };
	if (p.kind === 'circle') {
		const a = p.start + (p.direction * WALK_SPEED * t) / p.radius;
		const tangent = a + (p.direction * Math.PI) / 2;
		return {
			x: Math.cos(a) * p.radius,
			z: Math.sin(a) * p.radius,
			// +x rotated by yaw must point along (cos tangent, sin tangent) in xz: yaw = -tangent.
			yaw: -tangent,
			walked: WALK_SPEED * t,
			moving: true
		};
	}
	const dx = p.to[0] - p.from[0];
	const dz = p.to[1] - p.from[1];
	const len = Math.hypot(dx, dz);
	const leg = len / WALK_SPEED;
	const cycle = 2 * (leg + p.pause);
	const c = ((t % cycle) + cycle) % cycle;
	let u: number;
	let forward = true;
	let moving = true;
	if (c < leg) u = c / leg;
	else if (c < leg + p.pause) {
		u = 1;
		moving = false;
	} else if (c < 2 * leg + p.pause) {
		u = 1 - (c - leg - p.pause) / leg;
		forward = false;
	} else {
		u = 0;
		moving = false;
	}
	const heading = Math.atan2(forward ? dz : -dz, forward ? dx : -dx);
	return {
		x: p.from[0] + dx * u,
		z: p.from[1] + dz * u,
		yaw: -heading,
		walked: moving ? WALK_SPEED * t : 0,
		moving
	};
}

export interface Walkers {
	meshes: SkinnedMesh[];
	/** Materials created for the crew (the shared mover materials are the caller's). */
	materials: Material[];
	/** Geometries and skeletons to free with the hangar. */
	geometries: { dispose(): void }[];
	/** Writes the pose of every figure for time `t`. */
	pose(t: number): void;
}

/**
 * Every figure is the crew character (plan 341, ADR 0291): one skinned mesh each, all on one
 * vertex-coloured material. A figure's front is +z; the paths' yaw has the front at +x, hence the
 * quarter turn.
 */
export function createWalkers(specs: readonly CrewSpec[]): Walkers {
	const material = createCrewMaterial();
	const people = specs.map((spec) =>
		createPerson({ outfit: spec.outfit, appearance: appearanceOf(spec.id) }, material)
	);
	return {
		meshes: people.map((p) => p.mesh),
		materials: [material],
		geometries: people,
		pose(t) {
			specs.forEach((spec, i) => {
				const p = crewPose(spec, t);
				const person = people[i]!;
				person.mesh.position.set(p.x, 0, p.z);
				person.mesh.rotation.set(0, p.yaw + Math.PI / 2, 0);
				const action: Action = p.moving ? 'walk' : (spec.action ?? 'idle');
				person.pose(personPose(action, t, p.walked, i * 1.7));
			});
		}
	};
}
