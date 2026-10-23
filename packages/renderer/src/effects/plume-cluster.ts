/**
 * Cluster lights for engine plumes (plan 400, ADR 0335): the engines of one vessel whose nozzles lie
 * within a few bell radii of one another make one point light at their centroid, not one each,
 * whose strength follows their summed thrust. Two stages a tank's length apart make two. Pure.
 */
import type { Vec3 } from '@orbital/core';
import type { Rgb } from './look.ts';

/** A lit engine, as the effects see it. */
export interface ClusterEngine {
	vessel: number;
	/** The nozzle in render space. */
	position: Vec3;
	/** Exit radius of the bell, m. */
	radius: number;
	/** A stand-in for thrust: throttle × bell area × bells, m². */
	thrust: number;
	colour: Rgb;
}

export interface ClusterLight {
	position: Vec3;
	/** Light intensity, linear in the summed thrust and capped. */
	intensity: number;
	colour: Rgb;
	engines: number;
}

/** Nozzles within this many bell radii (the larger of the two) share a light. */
export const CLUSTER_REACH = 6;
/** Candela per m² of summed thrust stand-in, and the cap. */
export const LIGHT_PER_THRUST = 4_000;
export const LIGHT_MAX = 60_000;

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The clusters of `engines` as lights, strongest first. */
export function clusterLights(engines: readonly ClusterEngine[]): ClusterLight[] {
	const n = engines.length;
	const parent = Array.from({ length: n }, (_, i) => i);
	const find = (i: number): number => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]!]!;
			i = parent[i]!;
		}
		return i;
	};
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const a = engines[i]!;
			const b = engines[j]!;
			if (a.vessel !== b.vessel) continue;
			if (dist(a.position, b.position) <= CLUSTER_REACH * Math.max(a.radius, b.radius)) {
				parent[find(i)] = find(j);
			}
		}
	}
	const groups = new Map<number, ClusterEngine[]>();
	for (let i = 0; i < n; i++) {
		const root = find(i);
		const g = groups.get(root);
		if (g) g.push(engines[i]!);
		else groups.set(root, [engines[i]!]);
	}
	const lights: ClusterLight[] = [];
	for (const g of groups.values()) {
		let sum = 0;
		const at = { x: 0, y: 0, z: 0 };
		const colour: [number, number, number] = [0, 0, 0];
		for (const e of g) {
			sum += e.thrust;
			at.x += e.position.x * e.thrust;
			at.y += e.position.y * e.thrust;
			at.z += e.position.z * e.thrust;
			colour[0] += e.colour[0] * e.thrust;
			colour[1] += e.colour[1] * e.thrust;
			colour[2] += e.colour[2] * e.thrust;
		}
		if (!(sum > 0)) continue;
		lights.push({
			position: { x: at.x / sum, y: at.y / sum, z: at.z / sum },
			intensity: Math.min(LIGHT_MAX, LIGHT_PER_THRUST * sum),
			colour: [colour[0] / sum, colour[1] / sum, colour[2] / sum],
			engines: g.length
		});
	}
	return lights.sort((a, b) => b.intensity - a.intensity);
}
