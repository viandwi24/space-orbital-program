/**
 * Whether a key event came from somewhere the player is typing text (plan 257): a text area, a
 * content-editable, a select, or a text-like input. A range slider, a checkbox, a radio or a button
 * that kept the focus after a click is not typing: the flight keys still work.
 */
const TEXT_INPUTS = new Set([
	'text',
	'search',
	'url',
	'tel',
	'email',
	'password',
	'number',
	'date',
	'datetime-local',
	'month',
	'time',
	'week',
	''
]);

export interface TypingTarget {
	tagName?: string;
	type?: string;
	isContentEditable?: boolean;
}

export function isTypingTarget(target: TypingTarget | null | undefined): boolean {
	if (!target) return false;
	if (target.isContentEditable) return true;
	switch (target.tagName?.toUpperCase()) {
		case 'TEXTAREA':
		case 'SELECT':
			return true;
		case 'INPUT':
			return TEXT_INPUTS.has((target.type ?? '').toLowerCase());
		default:
			return false;
	}
}
