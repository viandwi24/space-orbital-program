/** Text for the mod manager (kept apart from the component so it is tested). */
import type { ModStatus } from './manager.svelte';
import type { ModSource } from './store';

export function statusLabel(status: ModStatus): string {
	switch (status.kind) {
		case 'running':
			return 'Running';
		case 'starts-after-reload':
			return 'Starts after reload';
		case 'stops-after-reload':
			return 'Stops after reload';
		case 'off':
			return 'Off';
		case 'failed':
			return `Not loaded: ${status.reason}`;
		case 'untrusted':
			return `Not loaded: ${status.reason}`;
	}
}

export function sourceLabel(source: ModSource): string {
	return source.kind === 'file' ? `file ${source.name}` : source.url;
}

export function sizeLabel(chars: number): string {
	return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}

/** First and last 8 hex digits of a fingerprint, easy to compare by eye. */
export function shortHash(sha256: string): string {
	return `${sha256.slice(0, 8)}…${sha256.slice(-8)}`;
}

export function dependencyList(dependencies: Readonly<Record<string, string>>): string {
	const entries = Object.entries(dependencies);
	return entries.length === 0 ? 'none' : entries.map(([id, range]) => `${id} ${range}`).join(', ');
}
