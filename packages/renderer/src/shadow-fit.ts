/**
 * Fits the sun's orthographic shadow camera around the casters (the vessel and, near the ground,
 * the launch site). Receivers do not need to be inside the box: a point is shadowed when a caster
 * lies on its ray to the sun, and that caster's light-space x/y equals the receiver's. The box is
 * snapped to whole texels in light space so shadow edges do not crawl when the target moves.
 */
import type { Vec3 } from '@orbital/core';
import { add, cross, dot, normalize, scale, vec } from './vec.ts';

export interface ShadowFit {
	/** Light position and look-at target in render space. */
	position: Vec3;
	target: Vec3;
	/** Light-space orthographic half extent, m (square box). */
	halfExtent: number;
	near: number;
	far: number;
	/** Light-space basis (for tests and debugging). */
	right: Vec3;
	up: Vec3;
}

/**
 * @param sunDirection unit vector toward the sun
 * @param centre centre of the caster bounding sphere, render space
 * @param radius radius of the caster bounding sphere, m
 * @param mapSize shadow map side in texels
 * @param reach extra distance toward the sun the casters may be at (tall structures), m
 * @param receiverReach how far beyond the casters along the light the shadow can fall on ground, m
 */
export function fitShadow(
	sunDirection: Vec3,
	centre: Vec3,
	radius: number,
	mapSize: number,
	reach = 0,
	receiverReach = 400
): ShadowFit {
	const toSun = normalize(sunDirection);
	// Any vector not parallel to the light axis seeds the basis; +Y unless the sun is vertical.
	const seed = Math.abs(toSun.y) > 0.99 ? vec(1, 0, 0) : vec(0, 1, 0);
	const right = normalize(cross(seed, toSun));
	const up = cross(toSun, right);
	const texel = (2 * radius) / mapSize;
	const snap = (v: number): number => Math.round(v / texel) * texel;
	const along = dot(centre, toSun);
	const target = add(
		add(scale(right, snap(dot(centre, right))), scale(up, snap(dot(centre, up)))),
		scale(toSun, along)
	);
	const back = radius + reach + 5;
	return {
		position: add(target, scale(toSun, back)),
		target,
		halfExtent: radius,
		near: 1,
		far: back + radius * 2 + receiverReach,
		right,
		up
	};
}
