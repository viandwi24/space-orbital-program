/**
 * The error card's state (plan 202): an uncaught error or unhandled rejection anywhere in the page
 * shows a card over it with "Save and reload" instead of leaving a dead page. Every one goes to the
 * log buffer; the card shows the first until the player dismisses it.
 */
import { logBuffer, type LogBuffer } from './log-buffer';

export interface FatalError {
	message: string;
	/** Where it came from: an uncaught error, a rejection, or SvelteKit's `handleError`. */
	kind: 'error' | 'rejection' | 'navigation';
}

/** Browser noise that is not a fault of the game (it fires as a window `error` event). */
const BENIGN = [/ResizeObserver loop/i];

export const fatal = $state<{ current: FatalError | null }>({ current: null });

/**
 * Writes the open world's autosave now, past the gap between autosaves; set by the world layout,
 * null outside a world (the card then offers a plain reload). Resolves whether a save was written.
 */
export const fatalSave: { current: (() => Promise<boolean>) | null } = { current: null };

/**
 * Saves the open world (when there is one), then reloads the page: the error card's "Save and
 * reload", and the settings that only take effect on a fresh page (the renderer). A failed save
 * still reloads.
 */
export async function saveAndReload(log: LogBuffer = logBuffer): Promise<void> {
	try {
		await fatalSave.current?.();
	} catch (error) {
		log.add('error', 'save', `save before reload failed: ${describeError(error)}`);
	}
	location.reload();
}

/** Describes any thrown value in one line. */
export function describeError(value: unknown): string {
	if (value instanceof Error) return value.message || value.name;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** Logs `error` and, unless it is browser noise, raises the card (the first stays until dismissed). */
export function reportFatal(error: FatalError, log: LogBuffer = logBuffer): void {
	if (BENIGN.some((re) => re.test(error.message))) {
		log.add('warn', 'page', error.message);
		return;
	}
	log.add(
		'error',
		'page',
		`${error.kind === 'rejection' ? 'unhandled rejection: ' : ''}${error.message}`
	);
	if (fatal.current === null) fatal.current = error;
}

export function dismissFatal(): void {
	fatal.current = null;
}

/** Listens for uncaught errors and unhandled rejections on `target`; returns the remover. */
export function listenForFatal(target: Window, log: LogBuffer = logBuffer): () => void {
	const onError = (event: ErrorEvent): void =>
		reportFatal({ kind: 'error', message: event.message || describeError(event.error) }, log);
	const onRejection = (event: PromiseRejectionEvent): void =>
		reportFatal({ kind: 'rejection', message: describeError(event.reason) }, log);
	target.addEventListener('error', onError);
	target.addEventListener('unhandledrejection', onRejection);
	return () => {
		target.removeEventListener('error', onError);
		target.removeEventListener('unhandledrejection', onRejection);
	};
}
