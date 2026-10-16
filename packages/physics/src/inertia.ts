import type { BodyShape, PrimitiveShape, Vec3 } from '@orbital/core';

/**
 * Principal moments of inertia (kg·m²) of a homogeneous solid of the given shape and mass about
 * its centre of mass, in body axes. Used when `BodyDesc.inertia` is omitted.
 */
export function deriveInertia(shape: BodyShape, mass: number): Vec3 {
	switch (shape.type) {
		case 'box': {
			const { x, y, z } = shape.halfExtents;
			// I = m/12 (w² + h²) with full extents w = 2x, ... → m/3 (x² + y²).
			return {
				x: (mass / 3) * (y * y + z * z),
				y: (mass / 3) * (x * x + z * z),
				z: (mass / 3) * (x * x + y * y)
			};
		}
		case 'sphere': {
			const i = 0.4 * mass * shape.radius * shape.radius;
			return { x: i, y: i, z: i };
		}
		case 'compound':
			throw new Error(
				'physics: a compound shape has no derivable inertia; pass `inertia` (and `centerOfMass`)'
			);
		case 'capsule': {
			const { halfHeight: h, radius: r } = shape;
			const vCyl = Math.PI * r * r * 2 * h;
			const vSph = (4 / 3) * Math.PI * r * r * r;
			const mCyl = (mass * vCyl) / (vCyl + vSph);
			const mSph = mass - mCyl;
			const iAxis = 0.5 * mCyl * r * r + 0.4 * mSph * r * r;
			// Hemisphere about its own centre of mass: 83/320 m r²; centre sits h + 3r/8 from the middle.
			const off = h + (3 * r) / 8;
			const iTrans =
				mCyl * ((r * r) / 4 + (4 * h * h) / 12) + mSph * ((83 / 320) * r * r + off * off);
			return { x: iTrans, y: iAxis, z: iTrans };
		}
	}
}

function assertPrimitive(shape: PrimitiveShape): void {
	const positive: number[] =
		shape.type === 'box'
			? [shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z]
			: [shape.radius];
	const nonNegative = shape.type === 'capsule' ? [shape.halfHeight] : [];
	if (
		positive.some((d) => !Number.isFinite(d) || d <= 0) ||
		nonNegative.some((d) => !Number.isFinite(d) || d < 0)
	) {
		throw new Error(`physics: invalid ${shape.type} shape dimensions ${JSON.stringify(shape)}`);
	}
}

/** Throws a descriptive error when a body description cannot produce a valid rigid body. */
export function assertBodyParams(mass: number, shape: BodyShape, inertia?: Vec3): void {
	if (!Number.isFinite(mass) || mass <= 0) {
		throw new Error(`physics: body mass must be a positive finite number, got ${mass}`);
	}
	if (shape.type === 'compound') {
		if (shape.shapes.length === 0)
			throw new Error('physics: a compound shape needs at least one shape');
		for (const placed of shape.shapes) assertPrimitive(placed.shape);
		if (!inertia) throw new Error('physics: a compound body needs an explicit `inertia`');
	} else {
		assertPrimitive(shape);
	}
	if (inertia && [inertia.x, inertia.y, inertia.z].some((i) => !Number.isFinite(i) || i <= 0)) {
		throw new Error(`physics: inertia must be positive finite, got ${JSON.stringify(inertia)}`);
	}
}
