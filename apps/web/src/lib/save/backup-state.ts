/**
 * The backup reminder's state and the one-time storage warning (plan 230), kept in this browser's
 * local storage. Every read and write is guarded: a blocked storage only means no reminder.
 */
import type { BackupReminder } from './backup';

const REMINDER_KEY = 'orbital.backup-reminder';
const WARNED_KEY = 'orbital.persist-warned';

export function loadReminder(): BackupReminder {
	try {
		const raw = JSON.parse(
			localStorage.getItem(REMINDER_KEY) ?? 'null'
		) as Partial<BackupReminder> | null;
		return {
			playedMs: typeof raw?.playedMs === 'number' ? raw.playedMs : 0,
			lastExportAt: typeof raw?.lastExportAt === 'number' ? raw.lastExportAt : null,
			snoozeUntil: typeof raw?.snoozeUntil === 'number' ? raw.snoozeUntil : null
		};
	} catch {
		return { playedMs: 0, lastExportAt: null, snoozeUntil: null };
	}
}

export function saveReminder(r: BackupReminder): void {
	try {
		localStorage.setItem(REMINDER_KEY, JSON.stringify(r));
	} catch {
		// blocked storage: the reminder starts over next time
	}
}

export function persistenceWarned(): boolean {
	try {
		return localStorage.getItem(WARNED_KEY) === '1';
	} catch {
		return true;
	}
}

export function markPersistenceWarned(): void {
	try {
		localStorage.setItem(WARNED_KEY, '1');
	} catch {
		// nothing to remember with
	}
}

/** Whether the browser keeps the saves through storage pressure; null when it cannot tell. */
export async function storagePersisted(): Promise<boolean | null> {
	try {
		return (await navigator.storage?.persisted?.()) ?? null;
	} catch {
		return null;
	}
}
