/** Hand-off of the current design from /vab to /flight. localStorage can throw or be absent. */
const KEY = 'orbital.design';

export function saveDraft(json: string, key = KEY): void {
	try {
		localStorage.setItem(key, json);
	} catch {
		// private mode or quota: the VAB shows the design anyway; /flight will report "no design"
	}
}

export function loadDraft(key = KEY): string | null {
	try {
		return localStorage.getItem(key);
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

export function saveLibraryId(id: string | null, key = LIBRARY_ID_KEY): void {
	try {
		if (id === null) localStorage.removeItem(key);
		else localStorage.setItem(key, id);
	} catch {
		// private mode or quota: the next load starts without a linked record
	}
}

export function loadLibraryId(key = LIBRARY_ID_KEY): string | null {
	try {
		return localStorage.getItem(key);
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
