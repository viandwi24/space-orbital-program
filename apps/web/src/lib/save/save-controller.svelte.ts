/**
 * State and behaviour of the save and load dialogs (plan 043), shared by the home page and the
 * flight page. The pages give it a way to collect a `SaveRequest` (flight only) and to start a
 * load (navigate to `/flight?load=<id>` or restart the sim Worker); everything else is here.
 */
import { SaveError } from '@orbital/core';
import { compareMods, type GameSave, type ModReport } from './game-save';
import { openSaveStore, requestSavePersistence } from './open-store';
import {
	browserSaveEnv,
	QUICK_ID,
	createSaveManager,
	type SaveListEntry,
	type SaveManager,
	type SaveRequest
} from './saves';
import { SaveWriteError } from './store';

export interface SaveControllerOptions {
	/** Plugin ids and versions the game booted; saves are compared against them. */
	loadedMods(): ReadonlyMap<string, string>;
	/** Collect the running sim's data; absent on the home page (no flight, no saving). */
	collect?: () => Promise<SaveRequest>;
	/** Start the flight stored under `id`. Called after the checks; may navigate away. */
	startLoad(id: string): void | Promise<void>;
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

	constructor(private readonly options: SaveControllerOptions) {}

	get canSave(): boolean {
		return this.options.collect !== undefined;
	}

	private open(): Promise<SaveManager> {
		this.ready ??= openSaveStore().then(({ store, volatile }) => {
			this.volatile = volatile;
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
		this.entries = await (await this.open()).list();
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
			this.tell('Quicksaved.');
			void requestSavePersistence();
		}
		return meta !== undefined;
	}

	async autosave(): Promise<boolean> {
		const meta = await this.guard(async () => (await this.open()).autosave(await this.collect()));
		return meta !== undefined;
	}

	async saveAs(name: string): Promise<boolean> {
		const meta = await this.guard(async () =>
			(await this.open()).saveAs(name, await this.collect())
		);
		if (meta) {
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
					`This save needs mods that are not installed: ${report.missing.map((m) => `${m.id} ${m.version}`).join(', ')}.`
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
		if (!list.some((e) => (e.ok ? e.meta.id : e.id) === QUICK_ID)) {
			this.tell('There is no quicksave yet. Press F5 to make one.', true);
			return;
		}
		await this.load(QUICK_ID);
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
