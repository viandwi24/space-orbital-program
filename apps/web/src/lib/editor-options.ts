/**
 * Options of the script editor that the player sets (plan 058): kept in the browser's own storage
 * under one key, parsed and never trusted, and the editor works the same without it (storage can
 * be unavailable or full). The one option so far is closing brackets and quotes for you.
 */
import { z } from 'zod';

export const EDITOR_OPTIONS_KEY = 'orbital.editor';

const schema = z.object({ autoClose: z.boolean().catch(false) });

export interface EditorOptions {
	/** Typing `(`, `[`, `{` or a quote inserts the closing one too. Off unless the player turns it on. */
	autoClose: boolean;
}

export const defaultEditorOptions = (): EditorOptions => ({ autoClose: false });

/** Options from stored text; anything that is not a valid options object gives the defaults. */
export function parseEditorOptions(text: string | null): EditorOptions {
	if (text === null) return defaultEditorOptions();
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return defaultEditorOptions();
	}
	const parsed = schema.safeParse(raw);
	return parsed.success ? parsed.data : defaultEditorOptions();
}

export function loadEditorOptions(): EditorOptions {
	try {
		return parseEditorOptions(localStorage.getItem(EDITOR_OPTIONS_KEY));
	} catch {
		return defaultEditorOptions();
	}
}

export function saveEditorOptions(options: EditorOptions): void {
	try {
		localStorage.setItem(EDITOR_OPTIONS_KEY, JSON.stringify(options));
	} catch {
		// storage unavailable or full: the choice holds until the page is closed
	}
}
