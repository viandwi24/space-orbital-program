/** Plan 230: one backup file of every world and save, and when the export reminder shows. */
import { describe, expect, it } from 'vitest';
import {
	exportBackup,
	exportPromptDue,
	exported,
	importBackup,
	remindLater,
	type BackupReminder
} from './backup';
import { memoryStore } from './store';
import { memoryWorldStore } from './world-store';
import { legacyWorldRecord } from './world-record';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('the export reminder schedule', () => {
	const fresh: BackupReminder = { playedMs: 0, lastExportAt: null, snoozeUntil: null };
	it('is first due after an hour of play, then every 7 days', () => {
		expect(exportPromptDue({ ...fresh, playedMs: HOUR - 1 }, 0)).toBe(false);
		expect(exportPromptDue({ ...fresh, playedMs: HOUR }, 0)).toBe(true);
		const done = exported({ ...fresh, playedMs: HOUR }, 1_000);
		expect(exportPromptDue(done, 1_000 + 7 * DAY - 1)).toBe(false);
		expect(exportPromptDue(done, 1_000 + 7 * DAY)).toBe(true);
	});

	it('"later" snoozes it for a day', () => {
		const due = { ...fresh, playedMs: 2 * HOUR };
		const later = remindLater(due, 5_000);
		expect(exportPromptDue(later, 5_000 + DAY - 1)).toBe(false);
		expect(exportPromptDue(later, 5_000 + DAY)).toBe(true);
	});
});

describe('export all and import', () => {
	it('round-trips every world and save into an empty profile; a second import adds nothing', async () => {
		const world = {
			...legacyWorldRecord(1, [], { saves: 1, vessel: 'Pod', simTime: 5 }),
			id: 'w1',
			name: 'One'
		};
		const save = { meta: { id: 's1', worldId: 'w1', name: 'Quick' }, data: { any: 'thing' } };
		const source = { store: memoryStore([save as never]), worlds: memoryWorldStore([world]) };
		const backup = await exportBackup(source.store, source.worlds, 10);
		expect(backup.worlds.map((w) => w.name)).toEqual(['One']);
		expect(backup.saves).toHaveLength(1);
		const target = { store: memoryStore(), worlds: memoryWorldStore() };
		const text = JSON.stringify(backup);
		expect(await importBackup(text, target.store, target.worlds)).toEqual({ worlds: 1, saves: 1 });
		expect(((await target.worlds.list()) as Array<{ name: string }>).map((w) => w.name)).toEqual([
			'One'
		]);
		expect(await target.store.get('s1')).toEqual(save);
		expect(await importBackup(text, target.store, target.worlds)).toEqual({ worlds: 0, saves: 0 });
		await expect(importBackup('{"x":1}', target.store, target.worlds)).rejects.toThrow(
			'not a Space Orbital Program backup'
		);
	});
});
