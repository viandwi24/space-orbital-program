/** Text for the mod manager (kept apart from the component so it is tested). */
import type { PatchChange } from '@orbital/core';
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

/** One shipped model for the trust prompt: size, triangles and a short fingerprint. */
export function assetLabel(asset: { size: number; triangles: number; sha256: string }): string {
	return `3D model, ${sizeLabel(asset.size)}, ${asset.triangles.toLocaleString('en-US')} triangles, ${shortHash(asset.sha256)}`;
}

export function dependencyList(dependencies: Readonly<Record<string, string>>): string {
	const entries = Object.entries(dependencies);
	return entries.length === 0 ? 'none' : entries.map(([id, range]) => `${id} ${range}`).join(', ');
}

/** A patched value, short: numbers as written, text quoted, data as compact JSON (plan 079). */
export function patchValueLabel(value: unknown): string {
	if (value === undefined) return 'none';
	if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
	if (typeof value === 'string') return `"${value}"`;
	const json = JSON.stringify(value) ?? String(value);
	return json.length > 60 ? `${json.slice(0, 59)}…` : json;
}

/** `215,000 → 230,000` for one change of a patch. */
export function patchChangeLabel(change: PatchChange): string {
	return `${patchValueLabel(change.from)} → ${patchValueLabel(change.to)}`;
}

/** The licence a mod states in its manifest (plan 075), or "not stated". */
export function licenceLabel(manifest: { licence?: string }): string {
	return manifest.licence ?? 'not stated';
}
