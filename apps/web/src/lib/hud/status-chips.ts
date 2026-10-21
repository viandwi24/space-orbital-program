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
	id: 'control' | 'power' | 'signal' | 'plasma' | 'range' | 'torque' | 'drive';
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
	/** SAS mode and the nose's angular acceleration, rad/s² (plan 310); absent before a flight step. */
	sas?: { mode: string; accel?: number } | null;
	/** Rover drive mode is on (plan 307). */
	drive?: boolean;
}

/** Below this (rad/s²) a half turn takes over about 80 s: the chip says the vessel is slow to turn. */
export const LOW_TORQUE = 0.002;

/** Seconds a 180° turn takes at angular acceleration `accel` (speed up half way, brake the rest). */
export const halfTurnSeconds = (accel: number): number => 2 * Math.sqrt(Math.PI / accel);

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
	const sas = input.sas;
	if (!u && sas && sas.mode !== 'off' && sas.accel !== undefined && sas.accel < LOW_TORQUE) {
		const none = sas.accel <= 0;
		chips.push({
			id: 'torque',
			label: none ? 'No torque' : 'Low torque',
			tone: 'warning',
			title: none ? 'SAS cannot turn the vessel' : 'Slow to turn',
			body: none
				? 'No reaction wheel works and RCS is off or dry, so SAS cannot turn the vessel. Switch RCS on (R) or add a reaction wheel.'
				: `This vessel is heavy for its torque: a half turn takes about ${Math.round(halfTurnSeconds(sas.accel))} s. RCS (R) adds torque.`,
			reason: none ? 'no torque to turn' : 'low torque',
			fix: none ? { label: 'Open Parts', panel: 'host.parts' } : null,
			testid: 'hud-torque'
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
