/** Hand-off of the current design from /vab to /flight. localStorage can throw or be absent. */
const KEY = 'orbital.design';

export function saveDraft(json: string): void {
	try {
		localStorage.setItem(KEY, json);
	} catch {
		// private mode or quota: the VAB shows the design anyway; /flight will report "no design"
	}
}

export function loadDraft(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

/** The player's script for one design (plan 017). Keyed by design name; same failure policy as the draft. */
const scriptKey = (designName: string): string => `orbital.script.${designName}`;

export function saveScript(designName: string, source: string): void {
	try {
		localStorage.setItem(scriptKey(designName), source);
	} catch {
		// private mode or quota: the text stays in the panel for this session
	}
}

export function loadScript(designName: string): string | null {
	try {
		return localStorage.getItem(scriptKey(designName));
	} catch {
		return null;
	}
}

/** Id of the library record the working design autosaves into (plan 029, ADR 0041). */
const LIBRARY_ID_KEY = 'orbital.library.current';

export function saveLibraryId(id: string | null): void {
	try {
		if (id === null) localStorage.removeItem(LIBRARY_ID_KEY);
		else localStorage.setItem(LIBRARY_ID_KEY, id);
	} catch {
		// private mode or quota: the next load starts without a linked record
	}
}

export function loadLibraryId(): string | null {
	try {
		return localStorage.getItem(LIBRARY_ID_KEY);
	} catch {
		return null;
	}
}

/** A per-viewer VAB preference (high-contrast markers). */
export function loadFlag(key: string): boolean {
	try {
		return localStorage.getItem(`orbital.vab.${key}`) === '1';
	} catch {
		return false;
	}
}

export function saveFlag(key: string, on: boolean): void {
	try {
		localStorage.setItem(`orbital.vab.${key}`, on ? '1' : '0');
	} catch {
		// the choice applies for this session only
	}
}
