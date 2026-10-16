/**
 * Float64 preparation of everything the planet shader needs about the camera: altitude, radial,
 * and a body-fixed position relative to a 1024 m anchor so the GPU never sees 600 km numbers where
 * centimetres matter (ADR 0027, "Precision").
 */
import type { Quat, Vec3 } from '@orbital/core';
import { ORIGIN_GRID } from './origin.ts';
import { surfaceUp } from './sun.ts';
import { length, normalize, rotateInverse, scale, sub, vec } from './vec.ts';

export interface PlanetFrameInput {
	/** Body centre and camera in render space (floating origin applied), m. */
	bodyRender: Vec3;
	cameraRender: Vec3;
	bodyRotation: Quat;
	radius: number;
	/** Launch site latitude/longitude, rad. */
	siteLatitude: number;
	siteLongitude: number;
}

export interface PlanetFrame {
	/** Camera above the sphere, m, floored at `MIN_ALTITUDE`. */
	altitude: number;
	/** Unit radial of the camera, inertial. */
	up: Vec3;
	/** Camera minus anchor, body-fixed, m. */
	camLocal: Vec3;
	/** Anchor / 1024 (whole numbers), body-fixed. */
	anchorCell: Vec3;
	/** Camera minus launch site, body-fixed, m. */
	camToSite: Vec3;
}

/** The planet pass never lets the camera sink below the ground (the surface is the sphere). */
export const MIN_ALTITUDE = 0.25;

export function planetFrame(i: PlanetFrameInput): PlanetFrame {
	const rel = sub(i.cameraRender, i.bodyRender);
	const dist = length(rel);
	const camB = rotateInverse(i.bodyRotation, rel);
	const snap = (v: number): number => Math.round(v / ORIGIN_GRID);
	const cell = vec(snap(camB.x), snap(camB.y), snap(camB.z));
	const site = scale(surfaceUp(i.siteLatitude, i.siteLongitude), i.radius);
	return {
		altitude: Math.max(dist - i.radius, MIN_ALTITUDE),
		up: normalize(rel),
		camLocal: sub(camB, scale(cell, ORIGIN_GRID)),
		anchorCell: cell,
		camToSite: sub(camB, site)
	};
}
