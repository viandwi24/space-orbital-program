/**
 * Minimal semver for `meta.api` range checks (no dependency; see ADR 0013). Supports versions
 * `x.y.z` and ranges `*`, `x[.y[.z]]` (exact or partial), `^x[.y[.z]]`, `~x[.y[.z]]` with npm
 * semantics. Pre-release/build tags and comparator ranges (`>=`, `||`) are rejected, not ignored.
 */
export type Version = readonly [major: number, minor: number, patch: number];

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RANGE = /^([\^~]?)(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/;

/** Parses `x.y.z`. Returns undefined when `text` is not a plain three-part version. */
export function parseVersion(text: string): Version | undefined {
	const m = VERSION.exec(text);
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

type Bounds = { min: Version; maxExclusive: Version | undefined };

function parseRange(range: string): Bounds | undefined {
	if (range === '*') return { min: [0, 0, 0], maxExclusive: undefined };
	const m = RANGE.exec(range);
	if (!m) return undefined;
	const op = m[1];
	const major = Number(m[2]);
	const minorGiven = m[3] !== undefined;
	const patchGiven = m[4] !== undefined;
	const minor = Number(m[3] ?? 0);
	const patch = Number(m[4] ?? 0);
	const min: Version = [major, minor, patch];
	if (op === '~') {
		// ~1.2.3 and ~1.2 -> <1.3.0 ; ~1 -> <2.0.0
		return { min, maxExclusive: minorGiven ? [major, minor + 1, 0] : [major + 1, 0, 0] };
	}
	if (op === '^') {
		// Leftmost non-zero component is fixed; omitted components count as wildcards.
		if (major > 0) return { min, maxExclusive: [major + 1, 0, 0] };
		if (!minorGiven) return { min, maxExclusive: [1, 0, 0] };
		if (minor > 0 || !patchGiven) return { min, maxExclusive: [0, minor + 1, 0] };
		return { min, maxExclusive: [0, 0, patch + 1] };
	}
	// Bare: exact, with omitted components acting as wildcards (1.2 = >=1.2.0 <1.3.0).
	if (patchGiven) return { min, maxExclusive: [major, minor, patch + 1] };
	if (minorGiven) return { min, maxExclusive: [major, minor + 1, 0] };
	return { min, maxExclusive: [major + 1, 0, 0] };
}

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** True if `range` is one of the supported forms. */
export const isValidRange = (range: string): boolean => parseRange(range) !== undefined;

/**
 * Does `version` (`x.y.z`) satisfy `range`? Throws `Error` naming the input when either is not
 * in the supported syntax, so a typo in a plugin's `meta.api` is never silently accepted.
 */
export function satisfies(version: string, range: string): boolean {
	const v = parseVersion(version);
	if (!v) throw new Error(`Invalid version "${version}": expected "x.y.z"`);
	const bounds = parseRange(range);
	if (!bounds) {
		throw new Error(
			`Unsupported version range "${range}": use "*", "x.y.z", "^x.y" or "~x.y" forms`
		);
	}
	return (
		compare(v, bounds.min) >= 0 && (!bounds.maxExclusive || compare(v, bounds.maxExclusive) < 0)
	);
}
