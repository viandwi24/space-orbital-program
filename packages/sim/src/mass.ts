/**
 * Mass properties of a vessel treated as one rigid body (ADR 0018): total mass, centre of mass,
 * and the full inertia tensor reduced to principal moments plus the rotation to their axes.
 */
import type { EntityId, Quat, Vec3 } from '@orbital/core';
import { partDefOf, partMass, partOf, type SimCore } from './core.ts';
import { IDENTITY, qFromBasis } from './math.ts';
import { inertiaOf } from './parts.ts';

export interface MassProperties {
	mass: number;
	/** Relative to the body origin, body axes. */
	centerOfMass: Vec3;
	/** Principal moments about the centre of mass. */
	inertia: Vec3;
	/** Rotation from the principal axes to the body axes. */
	inertiaFrame: Quat;
}

type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Eigen-decomposition of a symmetric 3x3 matrix by cyclic Jacobi rotations. Fixed sweep count and
 * order, so it is deterministic; an already diagonal matrix (the symmetric stacks of today) comes
 * back unchanged with identity axes. `vectors` columns are the principal axes.
 */
export function diagonalise(a: Mat3): { values: Vec3; vectors: Mat3 } {
	const m: Mat3 = [...a];
	const v: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	const scale = Math.max(Math.abs(m[0]), Math.abs(m[4]), Math.abs(m[8]), 1e-300);
	for (let sweep = 0; sweep < 32; sweep++) {
		const off = Math.abs(m[1]) + Math.abs(m[2]) + Math.abs(m[5]);
		if (off <= 1e-14 * scale) break;
		for (const [p, q] of [
			[0, 1],
			[0, 2],
			[1, 2]
		] as const) {
			const apq = m[p * 3 + q]!;
			if (apq === 0) continue;
			const theta = (m[q * 3 + q]! - m[p * 3 + p]!) / (2 * apq);
			const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
			const c = 1 / Math.sqrt(t * t + 1);
			const s = t * c;
			for (let k = 0; k < 3; k++) {
				const akp = m[k * 3 + p]!;
				const akq = m[k * 3 + q]!;
				m[k * 3 + p] = c * akp - s * akq;
				m[k * 3 + q] = s * akp + c * akq;
			}
			for (let k = 0; k < 3; k++) {
				const apk = m[p * 3 + k]!;
				const aqk = m[q * 3 + k]!;
				m[p * 3 + k] = c * apk - s * aqk;
				m[q * 3 + k] = s * apk + c * aqk;
			}
			for (let k = 0; k < 3; k++) {
				const vkp = v[k * 3 + p]!;
				const vkq = v[k * 3 + q]!;
				v[k * 3 + p] = c * vkp - s * vkq;
				v[k * 3 + q] = s * vkp + c * vkq;
			}
		}
	}
	return { values: { x: m[0], y: m[4], z: m[8] }, vectors: v };
}

/** Rotation whose columns are the principal axes (made right-handed). */
function frameOf(vectors: Mat3): Quat {
	const x = { x: vectors[0], y: vectors[3], z: vectors[6] };
	const y = { x: vectors[1], y: vectors[4], z: vectors[7] };
	let z = { x: vectors[2], y: vectors[5], z: vectors[8] };
	const det =
		x.x * (y.y * z.z - y.z * z.y) - x.y * (y.x * z.z - y.z * z.x) + x.z * (y.x * z.y - y.y * z.x);
	if (det < 0) z = { x: -z.x, y: -z.y, z: -z.z };
	return qFromBasis(x, y, z);
}

/**
 * Mass properties of `parts` (design-frame origins `designPos`) about the body origin `origin`
 * (a design-frame point; the root part's origin), with every part's current mass.
 */
export function massProperties(
	core: SimCore,
	parts: readonly EntityId[],
	origin: Vec3
): MassProperties {
	let mass = 0;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	const rows: Array<{ m: number; d: Vec3; id: EntityId }> = [];
	for (const id of parts) {
		const m = partMass(core, id);
		const p = partOf(core, id).designPos;
		const d = { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z };
		mass += m;
		cx += m * d.x;
		cy += m * d.y;
		cz += m * d.z;
		rows.push({ m, d, id });
	}
	const com = { x: cx / mass, y: cy / mass, z: cz / mass };
	// Inertia tensor about the COM: each part's own (axes shared by all parts) + parallel axis.
	const t: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	for (const { m, d, id } of rows) {
		const own = inertiaOf(partDefOf(core, partOf(core, id)), m);
		const r = { x: d.x - com.x, y: d.y - com.y, z: d.z - com.z };
		const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
		t[0] += own.x + m * (r2 - r.x * r.x);
		t[4] += own.y + m * (r2 - r.y * r.y);
		t[8] += own.z + m * (r2 - r.z * r.z);
		t[1] -= m * r.x * r.y;
		t[2] -= m * r.x * r.z;
		t[5] -= m * r.y * r.z;
	}
	t[3] = t[1];
	t[6] = t[2];
	t[7] = t[5];
	const { values, vectors } = diagonalise(t);
	const identity = vectors[0] === 1 && vectors[4] === 1 && vectors[8] === 1;
	return {
		mass,
		centerOfMass: com,
		inertia: values,
		inertiaFrame: identity ? IDENTITY : frameOf(vectors)
	};
}
