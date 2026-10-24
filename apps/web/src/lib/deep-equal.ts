/**
 * Structural equality of plain JSON-like data (plan 409): the change check for snapshot pieces and
 * per-frame results, in place of comparing two `JSON.stringify` strings. Allocation-free; two
 * references to one object are equal at once, which is the common case now that snapshots reuse
 * the objects that did not change (ADR 0358).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
		return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
	}
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
		return true;
	}
	if (Array.isArray(b)) return false;
	const x = a as Record<string, unknown>;
	const y = b as Record<string, unknown>;
	let count = 0;
	for (const k in x) {
		if (x[k] === undefined) continue;
		count++;
		if (!deepEqual(x[k], y[k])) return false;
	}
	for (const k in y) if (y[k] !== undefined) count--;
	return count === 0;
}
