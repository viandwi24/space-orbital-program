/**
 * State and behaviour of the mod manager page (plan 046, ADR 0057): the installed list, the
 * install flow with its trust prompt, enable, disable and remove. Nothing a package carries runs
 * here: the code is only stored; it runs on the next page load, in `runtime.ts`.
 */
import { decodeAssets, parseModPackage, type ModPackage, type PatchReport } from '@orbital/core';
import { modRuntime, type ModState } from './runtime';
import { ModStoreError, type ModRecord, type ModSource, type ModStore } from './store';

export interface PendingAsset {
	path: string;
	/** Bytes. */
	size: number;
	sha256: string;
	triangles: number;
}

/** A package that was read and checked and waits for the player's decision. */
export interface PendingInstall {
	package: ModPackage;
	source: ModSource;
	/** Characters of code. */
	size: number;
	/** What the package ships besides code, for the trust prompt (ADR 0076). */
	assets: PendingAsset[];
	/** The installed mod this would replace, if any. */
	replaces: ModRecord | null;
}

export type ModStatus =
	| { kind: 'running' }
	| { kind: 'starts-after-reload' }
	| { kind: 'stops-after-reload' }
	| { kind: 'off' }
	| { kind: 'failed'; reason: string }
	| { kind: 'untrusted'; reason: string };

export interface ModManagerOptions {
	open(): Promise<{ store: ModStore; volatile: boolean }>;
	/** Fetches package text for a URL install; throws with a readable message. */
	fetchText?(url: string): Promise<string>;
	/** Boot state of the running page; defaults to the live runtime. */
	booted?(): ReadonlyMap<string, { state: ModState; sha256: string }>;
	/** Data patches of the running page; defaults to the live runtime. */
	patches?(): readonly PatchReport[];
	now?(): number;
	reload(): void;
}

function bootedFromRuntime(): ReadonlyMap<string, { state: ModState; sha256: string }> {
	return new Map(
		modRuntime().entries.map((e) => [e.record.id, { state: e.state, sha256: e.record.sha256 }])
	);
}

export async function fetchPackageText(url: string): Promise<string> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error('That is not a web address.');
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
	if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
		throw new Error('Mods can only be downloaded from https:// addresses.');
	}
	let response: Response;
	try {
		response = await fetch(parsed);
	} catch {
		throw new Error(
			'The download failed. The server may be offline, or it does not allow other sites to read the file (CORS). Download the file and install it from disk instead.'
		);
	}
	if (!response.ok) throw new Error(`The server answered ${response.status}.`);
	return response.text();
}

export class ModManager {
	records = $state.raw<ModRecord[]>([]);
	loading = $state(true);
	busy = $state(false);
	/** Storage is memory only: mods vanish with the tab. */
	volatile = $state(false);
	pending = $state.raw<PendingInstall | null>(null);
	/** What went wrong with the last action, for the player. */
	error = $state<string | null>(null);
	/** A change was made that only a reload applies. */
	changed = $state(false);

	private store: ModStore | null = null;

	constructor(private readonly options: ModManagerOptions) {}

	async load(): Promise<void> {
		this.loading = true;
		try {
			const { store, volatile } = await this.options.open();
			this.store = store;
			this.volatile = volatile;
			this.records = await store.list();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	}

	/** Patches `id` registered on the running page, in apply order (plan 079). */
	patchesOf(id: string): PatchReport[] {
		return (this.options.patches ?? (() => modRuntime().patches))().filter((p) => p.by === id);
	}

	/** What the running page does with `record`, and what a reload would change. */
	statusOf(record: ModRecord): ModStatus {
		const boot = (this.options.booted ?? bootedFromRuntime)().get(record.id);
		const same = boot !== undefined && boot.sha256 === record.sha256;
		const running = same && boot.state.kind === 'loaded';
		if (!record.enabled) return running ? { kind: 'stops-after-reload' } : { kind: 'off' };
		if (running) return { kind: 'running' };
		if (same && boot.state.kind === 'failed') return { kind: 'failed', reason: boot.state.reason };
		if (same && boot.state.kind === 'untrusted') {
			return { kind: 'untrusted', reason: boot.state.reason };
		}
		return { kind: 'starts-after-reload' };
	}

	// --- install flow -----------------------------------------------------------------------------
	async inspectFile(file: { name: string; text(): Promise<string> }): Promise<void> {
		this.error = null;
		this.busy = true;
		try {
			await this.inspect(await file.text(), { kind: 'file', name: file.name });
		} catch {
			this.error = 'That file could not be read.';
		} finally {
			this.busy = false;
		}
	}

	async inspectUrl(url: string): Promise<void> {
		this.error = null;
		this.busy = true;
		try {
			const text = await (this.options.fetchText ?? fetchPackageText)(url.trim());
			await this.inspect(text, { kind: 'url', url: url.trim() });
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.busy = false;
		}
	}

	private async inspect(text: string, source: ModSource): Promise<void> {
		const parsed = await parseModPackage(text);
		if (!parsed.ok) {
			this.pending = null;
			this.error = parsed.errors.join(' ');
			return;
		}
		// `parseModPackage` already checked the assets; this reads their facts for the prompt.
		const decoded = parsed.package.assets
			? await decodeAssets(parsed.package.assets)
			: { ok: true as const, assets: new Map() };
		const assets: PendingAsset[] = decoded.ok
			? [...decoded.assets].map(([path, a]) => ({
					path,
					size: a.bytes.byteLength,
					sha256: a.sha256,
					triangles: a.info.triangles
				}))
			: [];
		this.pending = {
			package: parsed.package,
			source,
			size: parsed.package.code.length,
			assets,
			replaces: this.records.find((r) => r.id === parsed.package.manifest.id) ?? null
		};
	}

	cancel(): void {
		this.pending = null;
	}

	/** The player confirmed the trust prompt: store the package, enabled. */
	async confirm(): Promise<void> {
		const pending = this.pending;
		if (!pending || !this.store) return;
		const { manifest, code, sha256, assets } = pending.package;
		const record: ModRecord = {
			id: manifest.id,
			manifest,
			code,
			...(assets ? { assets } : {}),
			sha256,
			trusted: sha256,
			source: pending.source,
			installedAt: (this.options.now ?? Date.now)(),
			enabled: true,
			order: pending.replaces?.order ?? Math.max(-1, ...this.records.map((r) => r.order)) + 1
		};
		await this.write(
			async (store) => store.put(record),
			() => (this.pending = null)
		);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		const record = this.records.find((r) => r.id === id);
		if (!record) return;
		await this.write((store) => store.put({ ...record, enabled }));
	}

	async remove(id: string): Promise<void> {
		await this.write((store) => store.delete(id));
	}

	private async write(
		action: (store: ModStore) => Promise<void>,
		after: () => void = () => {}
	): Promise<void> {
		if (!this.store) return;
		this.error = null;
		this.busy = true;
		try {
			await action(this.store);
			this.records = await this.store.list();
			this.changed = true;
			after();
		} catch (e) {
			this.error =
				e instanceof ModStoreError ? e.message : `Could not save the change: ${String(e)}`;
		} finally {
			this.busy = false;
		}
	}

	reload(): void {
		this.options.reload();
	}
}
