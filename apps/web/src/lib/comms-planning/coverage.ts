/**
 * Coverage over a body (plan 118, ADR 0163 point 4): an equirectangular grid whose cells hold the
 * fraction of sample times at which a receiver on the ground there links to some node.
 */
import { STATION_MAST, linkRange } from '@orbital/core';
import { add, dot, length, scale, sub, type Vec3 } from '@orbital/kepler';
import { bodyCentre, positionOf, toInertial, type PlanNode, type PlanWorld } from './geometry';

export interface CoverageGrid {
	body: string;
	/** Cells along longitude (−π..π, west to east) and latitude (north to south). */
	width: number;
	height: number;
	/** Row-major, north row first: 0..1 per cell. */
	values: Float32Array;
	/** Mean over the cells weighted by area. */
	mean: number;
}

export interface CoverageInput {
	body: string;
	/** Nodes that may serve the receiver (stations and vessels). */
	nodes: readonly PlanNode[];
	/** The receiver's range rating, m. */
	range: number;
	from: number;
	horizon: number;
	samples?: number;
	width?: number;
	height?: number;
}

/** The sim's `bodyFixedDir`: latitude from the equator, longitude right-handed about +Y. */
export const groundDir = (latitude: number, longitude: number): Vec3 => ({
	x: Math.cos(latitude) * Math.cos(longitude),
	y: Math.sin(latitude),
	z: -Math.cos(latitude) * Math.sin(longitude)
});

export function coverageGrid(world: PlanWorld, input: CoverageInput): CoverageGrid {
	const width = input.width ?? 72;
	const height = input.height ?? 36;
	const samples = Math.max(1, input.samples ?? 24);
	const body = world.bodies.find((b) => b.id === input.body);
	if (!body) throw new RangeError(`unknown body "${input.body}"`);
	const values = new Float32Array(width * height);
	const servers = input.nodes.filter((n) => n.range > 0);
	const ground = body.radius + STATION_MAST;
	for (let s = 0; s < samples; s++) {
		const t = input.from + (samples === 1 ? 0 : (input.horizon * s) / (samples - 1));
		const centres = world.bodies.map((b) => ({ r: b.radius, c: bodyCentre(world, b.id, t) }));
		const centre = bodyCentre(world, body.id, t);
		const at = servers.map((n) => ({
			p: positionOf(world, n, t),
			reach: linkRange(input.range, n.range, world.scale)
		}));
		for (let row = 0; row < height; row++) {
			const latitude = Math.PI / 2 - ((row + 0.5) * Math.PI) / height;
			for (let col = 0; col < width; col++) {
				const longitude = -Math.PI + ((col + 0.5) * 2 * Math.PI) / width;
				const here = add(
					centre,
					toInertial(body, scale(groundDir(latitude, longitude), ground), t)
				);
				let linked = false;
				for (const { p, reach } of at) {
					const ab = sub(p, here);
					if (length(ab) > reach) continue;
					const len2 = dot(ab, ab);
					let blocked = false;
					for (const { r, c } of centres) {
						const u = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(c, here), ab) / len2)) : 0;
						if (length(sub(add(here, scale(ab, u)), c)) < r - 1) {
							blocked = true;
							break;
						}
					}
					if (!blocked) {
						linked = true;
						break;
					}
				}
				if (linked) values[row * width + col]! += 1 / samples;
			}
		}
	}
	let sum = 0;
	let weight = 0;
	for (let row = 0; row < height; row++) {
		const w = Math.cos(Math.PI / 2 - ((row + 0.5) * Math.PI) / height);
		for (let col = 0; col < width; col++) {
			sum += values[row * width + col]! * w;
			weight += w;
		}
	}
	return { body: body.id, width, height, values, mean: weight > 0 ? sum / weight : 0 };
}
