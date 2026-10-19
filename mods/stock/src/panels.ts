/**
 * The stock science panel (plan 191, ADR 0194): the vessel's experiments with their state, the
 * science stored aboard with its transmit value, and two buttons over the dock's fixed view: run the
 * next experiment that may run, transmit the stored result worth the most. Since plan 231 (ADR 0231
 * point 7) each experiment has its own Run and each stored result its own Transmit and Discard; the
 * two buttons stay as shortcuts.
 */
import { definePanel, type PanelInput } from '@orbital/sdk';

type Science = NonNullable<NonNullable<PanelInput['vessel']>['science']>;

const scienceOf = (i: PanelInput): Science | undefined => i.vessel?.science;
const pct = (f: number): string => `${Math.round(f * 100)} %`;
const points = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** The experiment Run starts: the first READY one, else the first INVALID one (a new situation may allow it). */
export function nextExperiment(
	science: Science | undefined
): Science['experiments'][number] | null {
	const list = science?.experiments ?? [];
	return list.find((e) => e.state === 'READY') ?? list.find((e) => e.state === 'INVALID') ?? null;
}

/** The stored result Transmit sends: the one that credits the most. */
export function bestStored(
	science: Science | undefined
): NonNullable<Science['stored']>[number] | null {
	let best: NonNullable<Science['stored']>[number] | null = null;
	for (const s of science?.stored ?? [])
		if (!best || s.value * s.factor > best.value * best.factor) best = s;
	return best;
}

export const PanelScience = definePanel({
	id: 'stock.science',
	title: 'Science',
	icon: 'science',
	order: 300,
	contexts: ['flight', 'map'],
	view: {
		kind: 'section',
		children: [
			{
				kind: 'readout',
				label: 'Situation',
				value: (i) => {
					const s = scienceOf(i);
					return s ? [s.situation ?? 'none', s.region].filter(Boolean).join(' · ') : null;
				}
			},
			{
				kind: 'list',
				label: 'Experiments',
				items: (i) =>
					(scienceOf(i)?.experiments ?? []).map((e) => ({
						name: e.experiment,
						value:
							e.state === 'RUNNING'
								? `RUNNING ${pct(e.progress)}`
								: e.state === 'INVALID' && e.reason
									? `INVALID: ${e.reason}`
									: e.state,
						actions: [
							{
								label: 'Run',
								command:
									i.vessel && e.state !== 'RUNNING'
										? {
												type: 'action' as const,
												vessel: i.vessel.id,
												part: e.part,
												module: 'stock.experiment',
												action: 'run'
											}
										: null
							}
						]
					}))
			},
			{
				kind: 'button',
				label: 'Run the next experiment',
				command: (i) => {
					const e = nextExperiment(scienceOf(i));
					return i.vessel && e
						? {
								type: 'action',
								vessel: i.vessel.id,
								part: e.part,
								module: 'stock.experiment',
								action: 'run'
							}
						: null;
				}
			},
			{
				kind: 'list',
				label: 'Stored results',
				items: (i) =>
					(scienceOf(i)?.stored ?? []).map((s) => ({
						name: s.subject,
						value: `${points(s.value)} · transmit ${pct(s.factor)} = ${points(s.value * s.factor)}`,
						actions: i.vessel
							? [
									{
										label: 'Transmit',
										command: { type: 'transmit-data' as const, vessel: i.vessel.id, item: s.item }
									},
									{
										label: 'Discard',
										command: { type: 'delete-data' as const, vessel: i.vessel.id, item: s.item }
									}
								]
							: []
					}))
			},
			{
				kind: 'button',
				label: 'Transmit the best result',
				command: (i) => {
					const s = bestStored(scienceOf(i));
					return i.vessel && s
						? { type: 'transmit-data', vessel: i.vessel.id, item: s.item }
						: null;
				}
			}
		]
	}
});
