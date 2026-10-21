/**
 * The status strip under the navball module (V3 §2.2, plan 272, ADR 0253 point 7): the vessel's
 * lasting conditions as chips, each with a cause and, where there is one, a fix. Events stay toasts.
 * Pure: the HUD model's fields in, the chips out.
 */
import { blackoutShown } from '../blackout';
import type { LinkBadge } from '../comms/network-model';

export type ChipTone = 'danger' | 'warning' | 'info';
/** What a chip's fix button does: open a dock panel. */
export type ChipFix = { label: string; panel: 'host.parts' | 'host.comms' | 'host.crew' };

export interface StatusChip {
	id: 'control' | 'power' | 'signal' | 'plasma' | 'range' | 'drive';
	/** The chip's words (drawn in capitals). */
	label: string;
	tone: ChipTone;
	/** The popover's title and the cause in a sentence. */
	title: string;
	body: string;
	/** Read with the label by assistive technology (the old badges' wording, kept for the tests). */
	reason: string;
	fix: ChipFix | null;
	/** The old badge's test id. */
	testid: string;
}

export interface ChipInput {
	uncontrolled: 'no-source' | 'no-crew' | 'no-power' | null;
	link: LinkBadge | null;
	blackout: number;
	range: string | null;
	/** Rover drive mode is on (plan 307). */
	drive?: boolean;
}

/** Order: what takes control away first, then warnings (V3 §2.2: red is lost control, amber warns). */
export function statusChips(input: ChipInput): StatusChip[] {
	const chips: StatusChip[] = [];
	const u = input.uncontrolled;
	if (u) {
		const why = u === 'no-power' ? 'no power' : 'no crew or probe core';
		chips.push({
			id: 'control',
			label: 'Uncontrolled',
			tone: 'danger',
			title: 'Uncontrolled',
			body:
				u === 'no-power'
					? 'No working command source: the command part needs electric charge to fly the vessel.'
					: 'Nothing aboard can command the vessel: it needs crew or a probe core.',
			reason: why,
			fix: u === 'no-power' ? { label: 'Open Parts', panel: 'host.parts' } : null,
			testid: 'hud-uncontrolled'
		});
	}
	if (u === 'no-power')
		chips.push({
			id: 'power',
			label: 'No power',
			tone: 'warning',
			title: 'No electric charge',
			body: 'Electric charge is at 0. Extend solar panels or switch on a generator in Parts to recharge.',
			reason: 'electric charge is at 0',
			fix: { label: 'Open Parts', panel: 'host.parts' },
			testid: 'hud-power'
		});
	const link = input.link;
	if (link?.state === 'lost') {
		const plasma = link.blackout > 0 && blackoutShown(link.blackout);
		chips.push({
			id: plasma ? 'plasma' : 'signal',
			label: plasma ? 'Plasma blackout' : 'No signal',
			tone: 'warning',
			title: plasma ? 'Plasma blackout' : 'No signal',
			body: plasma
				? 'The shock layer swallows the radio. The link returns when the vessel slows down.'
				: link.text === 'No antenna'
					? 'No antenna: this vessel has nothing to talk to the ground with. Add an antenna in the Hangar; the Space Center is a ground station already, and a dish only adds range.'
					: `${link.text}.`,
			reason: link.text,
			fix: plasma ? null : { label: 'Open Comms', panel: 'host.comms' },
			testid: 'hud-link'
		});
	} else if (!link && blackoutShown(input.blackout)) {
		chips.push({
			id: 'plasma',
			label: 'Plasma blackout',
			tone: 'warning',
			title: 'Signal lost',
			body: 'The shock layer swallows the radio. Nothing is lost yet; the signal returns when the vessel slows down.',
			reason: 'plasma blackout',
			fix: null,
			testid: 'hud-blackout'
		});
	}
	if (input.range)
		chips.push({
			id: 'range',
			label: 'Range',
			tone: 'warning',
			title: 'Range',
			body: `${input.range} (predicted): the next spent stage, dropped now, would break the range.`,
			reason: `${input.range} (predicted)`,
			fix: null,
			testid: 'hud-range'
		});
	if (input.drive)
		chips.push({
			id: 'drive',
			label: 'Drive',
			tone: 'info',
			title: 'Drive mode',
			body: 'W and S drive the wheel motors forward and back, A and D steer. It turns on near the ground with wheel motors on; Alt+G switches it.',
			reason: 'rover drive mode',
			fix: null,
			testid: 'hud-drive'
		});
	return chips;
}
