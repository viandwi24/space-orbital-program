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
