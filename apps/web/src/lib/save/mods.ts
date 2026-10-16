/** The plugins this page booted, with versions, for comparing against a save (ADR 0050 point 7). */
import Stock from '@orbital/mod-stock';
import { activePlugins, modRuntime } from '../mods/runtime';

/** Stock plus the mods that booted (plan 046). */
export function bootedMods(): ReadonlyMap<string, string> {
	return new Map([Stock, ...activePlugins()].map((p) => [p.meta.id, p.meta.version]));
}

/**
 * What to tell the player about a mod a save needs that did not boot: installed but off, failed,
 * or not installed at all.
 */
export function modHint(id: string): string {
	const entry = modRuntime().entries.find((e) => e.record.id === id);
	if (!entry) return 'not installed';
	switch (entry.state.kind) {
		case 'disabled':
			return 'installed but turned off';
		case 'failed':
			return `installed but failed to load: ${entry.state.reason}`;
		case 'untrusted':
			return `installed but not trusted: ${entry.state.reason}`;
		case 'loaded':
			return 'installed'; // booted under another version; the caller does not ask for this
	}
}
