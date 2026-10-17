/** Milestone wording (plan 102, ADR 0147 point 4): made in the page, never stored. */
import type { MilestoneRecord } from '@orbital/core';

/** `stock.cinder` -> `Cinder`. */
export const bodyName = (id: string): string => {
	const name = id.slice(id.lastIndexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
};

/** "First crewed orbit of Home", "First landing on Cinder", "First return from orbit". */
export function milestoneTitle(
	r: Pick<MilestoneRecord, 'kind' | 'body' | 'crewed'>,
	home: string
): string {
	const first = r.crewed ? 'First crewed' : 'First';
	const body = r.body === undefined ? '' : bodyName(r.body);
	switch (r.kind) {
		case 'launch':
			return `${first} launch`;
		case 'orbit':
			return `${first} orbit of ${body}`;
		case 'flyby':
			return `${first} flyby of ${body}`;
		case 'landing':
			return `${first} landing on ${body}`;
		case 'return':
			return r.body === home ? `${first} return from orbit` : `${first} return from ${body}`;
		case 'eva':
			// the first step outside (plan 109): crewed by nature, so no "crewed" variant in the words
			return `First EVA ${r.body === home ? 'at home' : `on ${body}`}`;
	}
}
