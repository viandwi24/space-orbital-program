/** The Recover dialog's lines (plan 132, ADR 0113 point 6): the quote the sim computed, as text. */
import { formatDistance, formatFunds } from '../format';

export interface RecoveryQuoteView {
	value: number;
	factor: number;
	distance: number | null;
	credit: number;
	/** Traded contents going to the site's storage instead of funds (system audit D2). */
	stored?: ReadonlyArray<{ commodity: string; amount: number }>;
}

/** `stock.liquid-fuel` → `liquid fuel`. */
const commodityName = (id: string): string => (id.split('.').pop() ?? id).replace(/-/g, ' ');

export function recoveryLines(q: RecoveryQuoteView): Array<{ label: string; value: string }> {
	return [
		{ label: 'Value of parts and contents', value: formatFunds(q.value) },
		{
			label: 'Distance to the recovery site',
			value: q.distance === null ? 'Not on the home planet' : formatDistance(q.distance)
		},
		{ label: 'Recovery factor', value: `${Math.round(q.factor * 1000) / 10} %` },
		...(q.stored?.length
			? [
					{
						label: "To the site's storage",
						value: q.stored
							.map((s) => `${Math.round(s.amount)} u ${commodityName(s.commodity)}`)
							.join(', ')
					}
				]
			: []),
		{ label: 'Credit', value: formatFunds(q.credit) }
	];
}
