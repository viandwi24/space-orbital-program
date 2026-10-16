/**
 * Sphere-of-influence radius (Laplace): r_SOI = a (m / M)^(2/5).
 * Vallado §12.5 / Curtis eq. 8.21. Inputs: the body's semi-major axis around its parent (m) and the
 * two masses (kg). Patched-conic switching itself is plan 007.
 */
export function soiRadius(aBody: number, mBody: number, mParent: number): number {
	if (!(aBody > 0) || !(mBody > 0) || !(mParent > 0))
		throw new RangeError(
			`soiRadius: need positive inputs (aBody = ${aBody}, mBody = ${mBody}, mParent = ${mParent})`
		);
	return aBody * Math.pow(mBody / mParent, 2 / 5);
}
