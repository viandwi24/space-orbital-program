/**
 * The guide card's look (plan 344, owner 2026-10-22): minimised to a pill or open. One choice for
 * the first-flight guide and the lessons, kept across pages and reloads.
 */
const KEY = 'orbital.guide-minimised';

function load(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

class GuideUi {
	minimised = $state(typeof localStorage === 'undefined' ? false : load());

	setMinimised(on: boolean): void {
		this.minimised = on;
		try {
			if (on) localStorage.setItem(KEY, '1');
			else localStorage.removeItem(KEY);
		} catch {
			// private mode: the choice lasts for this page
		}
	}
}

export const guideUi = new GuideUi();
