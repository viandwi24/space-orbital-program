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
