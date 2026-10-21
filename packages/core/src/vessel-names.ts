/**
 * Distinct vessel names (plan 270, ADR 0252). Pure: the sim names launches, splits and debris with
 * these, and a host may preview a name with them. Names compare trimmed and case-insensitively.
 */

/** The legacy tail a split appended before ADR 0252, once per split: `" (debris) (debris)"`. */
const LEGACY_DEBRIS = /(?:\s*\(debris\))+\s*$/i;
/** The tail this rule gives debris: `" debris"`, `" debris 2"`. */
const DEBRIS_TAIL = /\s+debris(?:\s+\d+)?\s*$/i;

const fold = (name: string): string => name.trim().toLocaleLowerCase();

/** `wanted` when no name in `taken` is the same, else `"<wanted> 2"`, `"<wanted> 3"`, … the first free one. */
export function uniqueVesselName(wanted: string, taken: Iterable<string>): string {
	const base = wanted.trim() || 'Vessel';
	const used = new Set<string>();
	for (const t of taken) used.add(fold(t));
	if (!used.has(fold(base))) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base} ${n}`;
		if (!used.has(fold(candidate))) return candidate;
	}
}

/** The name without its debris tails (`" debris 3"`, legacy `" (debris)"` chains); never empty. */
export function vesselBaseName(name: string): string {
	let base = name.trim();
	for (;;) {
		const next = base.replace(LEGACY_DEBRIS, '').replace(DEBRIS_TAIL, '').trim();
		if (next === base || next === '') return base;
		base = next;
	}
}

/** A piece of `source` that has no control source: `"<base> debris"`, numbered when taken. */
export const debrisName = (source: string, taken: Iterable<string>): string =>
	uniqueVesselName(`${vesselBaseName(source)} debris`, taken);

/** A controllable side split off `source` (decoupled, undocked without a record): `"<base> 2"`. */
export const splitName = (source: string, taken: Iterable<string>): string =>
	uniqueVesselName(vesselBaseName(source), taken);

/**
 * Names from before ADR 0252: each name with a `" (debris)"` tail becomes its `debrisName` against
 * the other names (the ones already tidied included); every other name is returned as it is.
 */
export function tidyLegacyNames(names: readonly string[]): string[] {
	const out = [...names];
	for (let i = 0; i < out.length; i++) {
		if (!LEGACY_DEBRIS.test(out[i]!)) continue;
		out[i] = debrisName(
			out[i]!,
			out.filter((_, k) => k !== i)
		);
	}
	return out;
}
