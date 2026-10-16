/** The plugins this build boots, with versions, for comparing against a save (ADR 0050 point 7). */
import Stock from '@orbital/mod-stock';

/** Plan 046 (runtime mod loading) replaces this with the mod manager's list. */
export function bootedMods(): ReadonlyMap<string, string> {
	return new Map([[Stock.meta.id, Stock.meta.version]]);
}
