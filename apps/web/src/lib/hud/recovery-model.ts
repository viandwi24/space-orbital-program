/** The Recover dialog's lines (plan 132, ADR 0113 point 6): the quote the sim computed, as text. */
import { formatDistance, formatFunds } from '../format';

export interface RecoveryQuoteView {
	value: number;
	factor: number;
	distance: number | null;
	credit: number;
}

export function recoveryLines(q: RecoveryQuoteView): Array<{ label: string; value: string }> {
	return [
		{ label: 'Value of parts and contents', value: formatFunds(q.value) },
		{
			label: 'Distance to the recovery site',
			value: q.distance === null ? 'Not on the home planet' : formatDistance(q.distance)
		},
		{ label: 'Recovery factor', value: `${Math.round(q.factor * 1000) / 10} %` },
		{ label: 'Credit', value: formatFunds(q.credit) }
	];
}
