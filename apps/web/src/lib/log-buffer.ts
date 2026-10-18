/**
 * The in-memory log (plan 202's API, added by plan 203): the last 2000 entries of what the game
 * reports — sim events, refused commands, warnings and uncaught errors. No Svelte here, so the
 * worker bridge and the error hooks can both write to it. Never persisted.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
	level: LogLevel;
	/** Wall clock, ms since 1970. */
	time: number;
	/** Who wrote it: `sim`, `command`, `graphics`, `page`, ... */
	source: string;
	message: string;
}

export const LOG_CAPACITY = 2000;

export interface LogBuffer {
	add(level: LogLevel, source: string, message: string): void;
	/** Oldest first. */
	entries(): readonly LogEntry[];
	/** Entries at or above `level`, oldest first. */
	atLeast(level: LogLevel): LogEntry[];
	/** Called after every `add` and `clear`; returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
	clear(): void;
}

export function createLogBuffer(capacity = LOG_CAPACITY, now: () => number = Date.now): LogBuffer {
	let list: LogEntry[] = [];
	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const l of listeners) l();
	};
	return {
		add(level, source, message) {
			list.push({ level, time: now(), source, message });
			if (list.length > capacity) list = list.slice(list.length - capacity);
			notify();
		},
		entries: () => list,
		atLeast(level) {
			const min = LOG_LEVELS.indexOf(level);
			return list.filter((e) => LOG_LEVELS.indexOf(e.level) >= min);
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		clear() {
			list = [];
			notify();
		}
	};
}

/** The page's one log. */
export const logBuffer: LogBuffer = createLogBuffer();

/**
 * Write uncaught errors and unhandled rejections of `target` to `log`; returns the remover. Plan
 * 202's global error hook replaces this when it lands.
 */
export function captureErrors(target: Window, log: LogBuffer = logBuffer): () => void {
	const onError = (event: ErrorEvent): void =>
		log.add('error', 'page', event.message || String(event.error));
	const onRejection = (event: PromiseRejectionEvent): void => {
		const r: unknown = event.reason;
		log.add('error', 'page', `unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
	};
	target.addEventListener('error', onError);
	target.addEventListener('unhandledrejection', onRejection);
	return () => {
		target.removeEventListener('error', onError);
		target.removeEventListener('unhandledrejection', onRejection);
	};
}
