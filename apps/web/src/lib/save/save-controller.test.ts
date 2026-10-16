/** Plan 043: the controller behind the save and load dialogs (memory store in node). */
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import type { SaveRequest } from './saves';
import { SaveController } from './save-controller.svelte';

let request: SaveRequest;
beforeAll(async () => {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
	const loaded = sim.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
	sim.step(0.1);
	request = {
		sim: sim.save(),
		focus: loaded.ok ? Number(loaded.vessel) : null,
		design: referenceTwoStage(),
		thumbnail: null,
		bodyRadius: 600_000
	};
	sim.dispose();
});

function make(mods: Map<string, string> = new Map([['stock', '0.1.0']])) {
	const started: string[] = [];
	const controller = new SaveController({
		loadedMods: () => mods,
		collect: async () => request,
		startLoad: (id) => void started.push(id)
	});
	return { controller, started };
}

describe('SaveController', () => {
	it('quicksave then quickload starts the load of the quick slot', async () => {
		const { controller, started } = make();
		expect(await controller.quicksave()).toBe(true);
		expect(controller.note).toBe('Quicksaved.');
		await controller.quickload();
		expect(started).toEqual(['quick']);
	});

	it('F9 without a quicksave says so and loads nothing', async () => {
		const { controller, started } = make();
		await controller.quickload();
		expect(started).toEqual([]);
		expect(controller.note).toMatch(/no quicksave yet/);
		expect(controller.noteIsError).toBe(true);
	});

	it('named save lists, closes the dialog and can be loaded from the list', async () => {
		const { controller, started } = make();
		controller.showSave();
		expect(await controller.saveAs('My flight')).toBe(true);
		expect(controller.saveOpen).toBe(false);
		await controller.showLoad();
		expect(controller.entries).toHaveLength(1);
		const entry = controller.entries[0]!;
		expect(entry.ok && entry.meta.name).toBe('My flight');
		await controller.load(entry.ok ? entry.meta.id : '');
		expect(started).toHaveLength(1);
		expect(controller.loadOpen).toBe(false);
	});

	it('refuses a save that needs a mod that is not loaded, naming it', async () => {
		const maker = make();
		await maker.controller.saveAs('x');
		const other = make(new Map([['other', '1.0.0']]));
		// Same memory store is per controller, so re-save into the second one.
		await other.controller.saveAs('x');
		await other.controller.refresh();
		const id = other.controller.entries[0]!;
		await other.controller.load(id.ok ? id.meta.id : '');
		expect(other.started).toEqual([]);
		expect(other.controller.note).toMatch(/needs mods that are not running: stock 0\.1\.0/);
	});

	it('says whether the missing mod is turned off, failed or not installed, and points to the manager (plan 046)', async () => {
		const maker = make();
		await maker.controller.saveAs('x');
		const started: string[] = [];
		const hints: Record<string, string> = { stock: 'installed but turned off' };
		const controller = new SaveController({
			loadedMods: () => new Map(),
			modHint: (id) => hints[id] ?? 'not installed',
			collect: async () => request,
			startLoad: (id) => void started.push(id)
		});
		await controller.saveAs('x');
		await controller.refresh();
		const entry = controller.entries[0]!;
		await controller.load(entry.ok ? entry.meta.id : '');
		expect(started).toEqual([]);
		expect(controller.note).toBe(
			'This save needs mods that are not running: stock 0.1.0 (installed but turned off). Open the mod manager to install or turn them on.'
		);
	});

	it('asks before loading a save made with another version of a mod', async () => {
		const { controller, started } = make(new Map([['stock', '0.2.0']]));
		await controller.saveAs('x'); // the save records the sim's own stock version (0.1.0)
		await controller.refresh();
		const e = controller.entries[0]!;
		const id = e.ok ? e.meta.id : '';
		await controller.load(id);
		expect(started).toEqual([]);
		expect(controller.modWarning?.report.changed[0]?.id).toBe('stock');
		await controller.load(id, true);
		expect(started).toEqual([id]);
	});

	it('a collect failure becomes a note, not an exception', async () => {
		const controller = new SaveController({
			loadedMods: () => new Map(),
			collect: async () => {
				throw new Error('There is no flight to save yet.');
			},
			startLoad: () => {}
		});
		expect(await controller.quicksave()).toBe(false);
		expect(controller.note).toBe('There is no flight to save yet.');
		expect(controller.busy).toBe(false);
	});

	it('delete removes the entry; importing junk is reported', async () => {
		const { controller } = make();
		await controller.saveAs('gone');
		await controller.refresh();
		const e = controller.entries[0]!;
		await controller.remove(e.ok ? e.meta.id : '');
		expect(controller.entries).toHaveLength(0);
		await controller.importFile(new File(['not json'], 'x.json'));
		expect(controller.note).toMatch(/not valid JSON/);
		expect(controller.noteIsError).toBe(true);
	});
});
