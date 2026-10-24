/**
 * The Flight HUD's offers about off-world bases (plan 386, ADR 0125, ADR 0352): found a base with a
 * kit, join the site the vessel stands in, refuel from the storage of the site it belongs to. The
 * sim says what is on offer (`VesselSnapshot.baseOffer`); this makes the buttons, their reasons and
 * the commands.
 */
import type { Command, EntityId, VesselSnapshot } from '@orbital/core';

export type BaseOffers = NonNullable<VesselSnapshot['baseOffer']>;

export interface BaseButton {
	id: 'found' | 'join' | 'refuel';
	label: string;
	/** Why it cannot be pressed, shown on the disabled button. */
	reason?: string;
	/** A line of facts under it. */
	detail?: string;
}

const degrees = (rad: number): string => `${Math.abs((rad * 180) / Math.PI).toFixed(2)}°`;
const lat = (rad: number): string => `${degrees(rad)} ${rad >= 0 ? 'N' : 'S'}`;
const lon = (rad: number): string => `${degrees(rad)} ${rad >= 0 ? 'E' : 'W'}`;

/** The offered actions, in the order they are shown. `label` names a commodity or a body. */
export function baseButtons(
	offers: BaseOffers | null | undefined,
	label: (id: string) => string = (id) => id
): BaseButton[] {
	if (!offers) return [];
	const out: BaseButton[] = [];
	if (offers.found) {
		out.push({
			id: 'found',
			label: 'Found a base here…',
			detail: `${label(offers.found.body)}, ${lat(offers.found.latitude)}, ${lon(offers.found.longitude)}`,
			...(offers.found.refusal ? { reason: offers.found.refusal } : {})
		});
	}
	if (offers.join) {
		out.push({ id: 'join', label: `Join ${offers.join.name}`, detail: 'Its drills fill the site' });
	}
	if (offers.refuel) {
		const held = Object.entries(offers.refuel.stored)
			.map(([id, n]) => `${Math.round(n).toLocaleString('en-US')} ${label(id)}`)
			.join(', ');
		out.push({
			id: 'refuel',
			label: `Refuel from ${offers.refuel.name}`,
			detail: `Stored: ${held}`
		});
	}
	return out;
}

/** A site id from a name: lower case, words joined by dashes, never one already taken. */
export function siteIdFor(name: string, taken: readonly string[]): string {
	const base =
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'base';
	if (!taken.includes(base)) return base;
	for (let n = 2; ; n++) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

/** The command a button sends, or a reason it cannot: `name` is the base's name for `found`. */
export function baseCommand(
	button: BaseButton['id'],
	vessel: EntityId,
	offers: BaseOffers,
	options: { name?: string; taken?: readonly string[] } = {}
): { command: Command } | { reason: string } {
	if (button === 'found') {
		if (!offers.found) return { reason: 'a base kit here is not on offer' };
		if (offers.found.refusal) return { reason: offers.found.refusal };
		const name = (options.name ?? '').trim();
		if (name.length === 0) return { reason: 'name the base' };
		return {
			command: { type: 'deploy-base', vessel, id: siteIdFor(name, options.taken ?? []), name }
		};
	}
	if (button === 'join') {
		return offers.join
			? { command: { type: 'join-site', vessel, site: offers.join.site } }
			: { reason: 'no site here to join' };
	}
	return offers.refuel
		? { command: { type: 'refuel', vessel, site: offers.refuel.site } }
		: { reason: 'the site stores no propellant yet' };
}
