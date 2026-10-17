/**
 * State and behaviour of the save and load dialogs (plan 043), shared by the home page and the
 * flight page. The pages give it a way to collect a `SaveRequest` (flight only) and to start a
 * load (navigate to `/flight?load=<id>` or restart the sim Worker); everything else is here.
 */
import { SaveError, type WorldInfo } from '@orbital/core';
import { compareMods, type GameSave, type ModReport } from './game-save';
import { browserWorldsEnv, createWorlds, type Worlds } from '../worlds/worlds';
import { openSaveStore, requestSavePersistence } from './open-store';
import {
	browserSaveEnv,
	QUICK_ID,
	createSaveManager,
	slotId,
	type SaveListEntry,
	type SaveManager,
	type SaveRequest
} from './saves';
import { SaveWriteError } from './store';

export interface SaveControllerOptions {
	/** Plugin ids and versions the game booted; saves are compared against them. */
	loadedMods(): ReadonlyMap<string, string>;
	/** Why a mod the save needs is not running: "not installed", "installed but turned off", ... (plan 046). */
	modHint?(id: string): string;
	/** Collect the running sim's data; absent on the home page (no flight, no saving). */
	collect?: () => Promise<SaveRequest>;
	/** Start the flight stored under `id`. Called after the checks; may navigate away. */
	startLoad(id: string): void | Promise<void>;
	/**
	 * The world the Load dialog lists and F9 loads from (plan 087, ADR 0143); absent: every save.
	 * Every save written also updates its world's record (`Worlds.touch`).
	 */
	world?: () => string;
}

export class SaveController {
	entries = $state<SaveListEntry[]>([]);
	loadOpen = $state(false);
	saveOpen = $state(false);
	/** The last result worth telling the player (saved, loaded, refused). */
	note = $state<string | null>(null);
	/** True when the last note is an error (shown in the danger colour). */
	noteIsError = $state(false);
	busy = $state(false);
	/** Storage is memory only: saves vanish with the tab. */
	volatile = $state(false);
	/** Mods the chosen save needs, shown before loading. */
	modWarning = $state<{ id: string; report: ModReport } | null>(null);
	now = $state(Date.now());

	private manager: SaveManager | null = null;
	private ready: Promise<SaveManager> | null = null;
	private worlds: Worlds | null = null;

	constructor(private readonly options: SaveControllerOptions) {}

	get canSave(): boolean {
		return this.options.collect !== undefined;
	}

	private open(): Promise<SaveManager> {
		this.ready ??= openSaveStore().then(({ store, worlds, volatile }) => {
			this.volatile = volatile;
			this.worlds = createWorlds(worlds, store, browserWorldsEnv());
			this.manager = createSaveManager(store, browserSaveEnv());
			return this.manager;
		});
		return this.ready;
	}

	private tell(text: string, error = false): void {
		this.note = text;
		this.noteIsError = error;
	}

	private explain(e: unknown): string {
		return e instanceof SaveError || e instanceof SaveWriteError || e instanceof Error
			? e.message
			: String(e);
	}

	async refresh(): Promise<void> {
		this.now = Date.now();
		const all = await (await this.open()).list();
		const world = this.options.world?.();
		this.entries =
			world === undefined
				? all
				: all.filter((e) => !e.ok || (e.meta.worldId ?? 'legacy') === world);
	}

	/** The world of a written save was played: its record moves to the top of the Worlds list. */
	private async touched(worldId: string | null): Promise<void> {
		await this.worlds?.touch(worldId ?? 'legacy').catch(() => undefined);
	}

	async showLoad(): Promise<void> {
		this.note = null;
		this.modWarning = null;
		this.loadOpen = true;
		await this.refresh().catch((e) => this.tell(this.explain(e), true));
	}

	showSave(): void {
		this.note = null;
		this.saveOpen = true;
	}

	/** Run a save operation; a failure becomes a note and the sim keeps running. */
	private async guard<T>(work: () => Promise<T>): Promise<T | undefined> {
		if (this.busy) return undefined;
		this.busy = true;
		try {
			return await work();
		} catch (e) {
			this.tell(this.explain(e), true);
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	private collect(): Promise<SaveRequest> {
		const collect = this.options.collect;
		if (!collect) throw new Error('There is no flight to save.');
		return collect();
	}

	async quicksave(): Promise<boolean> {
		const meta = await this.guard(async () => (await this.open()).quicksave(await this.collect()));
		if (meta) {
			await this.touched(meta.worldId);
			this.tell('Quicksaved.');
			void requestSavePersistence();
		}
		return meta !== undefined;
	}

	async autosave(): Promise<boolean> {
		const meta = await this.guard(async () => (await this.open()).autosave(await this.collect()));
		if (meta) await this.touched(meta.worldId);
		return meta !== undefined;
	}

	async saveAs(name: string): Promise<boolean> {
		const meta = await this.guard(async () =>
			(await this.open()).saveAs(name, await this.collect())
		);
		if (meta) {
			await this.touched(meta.worldId);
			this.saveOpen = false;
			this.tell(`Saved as "${meta.name}".`);
			void requestSavePersistence();
		}
		return meta !== undefined;
	}

	/** Validate the save, check its mods, and start it (or ask first when mods differ). */
	async load(id: string, confirmed = false): Promise<void> {
		await this.guard(async () => {
			const save = await (await this.open()).load(id);
			const report = compareMods(save.mods, this.options.loadedMods());
			if (report.missing.length > 0) {
				throw new SaveError(
					'missing-mod',
					`This save needs mods that are not running: ${report.missing
						.map((m) => {
							const hint = this.options.modHint?.(m.id);
							return `${m.id} ${m.version}${hint ? ` (${hint})` : ''}`;
						})
						.join(', ')}. Open the mod manager to install or turn them on.`
				);
			}
			if (report.changed.length > 0 && !confirmed) {
				this.modWarning = { id, report };
				return;
			}
			this.modWarning = null;
			this.loadOpen = false;
			await this.options.startLoad(id);
		});
	}

	/** F9: load the quicksave, or say there is none. */
	async quickload(): Promise<void> {
		const list = await (await this.open()).list();
		const quick = slotId(this.options.world?.() ?? 'legacy', QUICK_ID);
		if (!list.some((e) => (e.ok ? e.meta.id : e.id) === quick)) {
			this.tell('There is no quicksave yet. Press F5 to make one.', true);
			return;
		}
		await this.load(quick);
	}

	/** The worlds over the same stores (plan 087): the Worlds screen and the menu use it. */
	async worldsService(): Promise<Worlds> {
		await this.open();
		return this.worlds!;
	}

	/** The info a new flight in `worldId` starts with (plan 087): the record's, or none for the Legacy world. */
	async worldStartInfo(worldId: string): Promise<WorldInfo | undefined> {
		await this.open();
		return this.worlds?.startInfo(worldId);
	}

	/** Read and validate one save for the page to resume (throws `SaveError`). */
	async read(id: string): Promise<GameSave> {
		return (await this.open()).load(id);
	}

	async rename(id: string, name: string): Promise<void> {
		await this.guard(async () => {
			await (await this.open()).rename(id, name);
			await this.refresh();
		});
	}

	async remove(id: string): Promise<void> {
		await this.guard(async () => {
			await (await this.open()).remove(id);
			await this.refresh();
			this.tell('Deleted.');
		});
	}

	/** Download the save as a file. */
	async exportFile(id: string): Promise<void> {
		await this.guard(async () => {
			const { fileName, text } = await (await this.open()).exportText(id);
			const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		});
	}

	async importFile(file: File): Promise<void> {
		await this.guard(async () => {
			const meta = await (await this.open()).importText(await file.text());
			await this.refresh();
			this.tell(`Imported "${meta.name}".`);
		});
	}
}
