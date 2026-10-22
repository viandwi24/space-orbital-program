/**
 * Toasts: short notices for events the player should not miss (plan 021, ADR 0026). The mapping
 * from sim events and HUD transitions is pure; the store keeps at most `MAX_TOASTS`.
 */
import { DEFAULT_MAX_TEMPERATURE } from '@orbital/core';
import { bodyName, milestoneTitle } from './achievements/milestone-text';
import type { SimEvent } from './messages';
import type { FlightPhase } from './telemetry';
import { formatDistance, formatSpeed } from './format';

export type ToastKind = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
	kind: ToastKind;
	title: string;
	detail?: string;
	/** A toast with the same key replaces the earlier one instead of stacking. */
	key?: string;
}

export interface ToastContext {
	/** Is this part entity on the vessel the player flies? */
	isActivePart(entity: number): boolean;
	isActiveVessel(vessel: number): boolean;
	/** Display title of a part definition id. */
	partTitle(definition: string): string;
	/** Definition id of a part entity (from the latest snapshot), if known. */
	definitionOf(entity: number): string | undefined;
	/** The world's home body id (milestone wording). */
	home?: string;
}

/** Milliseconds a toast stays, by kind (danger stays longest). */
export const TOAST_MS: Record<ToastKind, number> = {
	info: 4_000,
	success: 4_000,
	warning: 6_000,
	danger: 8_000
};
/** Toasts on screen at once (V3 §2.2: two; repeats merge into a ×n badge). */
export const MAX_TOASTS = 2;

/** `null` when the event is not worth a toast (another vessel, debris, bookkeeping). */
export function toastForSimEvent(event: SimEvent, ctx: ToastContext): Toast | null {
	switch (event.type) {
		case 'stage':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'info', title: `Stage ${event.stage + 1} fired`, key: 'stage' }
				: null;
		case 'docked':
			return ctx.isActiveVessel(event.vessel) || ctx.isActiveVessel(event.absorbed)
				? { kind: 'success', title: 'Docked', key: 'dock' }
				: null;
		case 'undocked':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'info', title: `Undocked ${event.name}`, key: 'dock' }
				: null;
		case 'power-depleted':
			return ctx.isActiveVessel(event.vessel)
				? {
						kind: 'danger',
						title: 'Out of power',
						detail: 'No electric charge for the probe core: the vessel is uncontrolled',
						key: 'power'
					}
				: null;
		case 'flameout': {
			if (!ctx.isActivePart(event.part)) return null;
			const def = ctx.definitionOf(event.part);
			return {
				kind: 'warning',
				title: 'Engine flameout',
				detail: def
					? `${ctx.partTitle(def)} ran out of propellant`
					: 'An engine ran out of propellant',
				key: 'flameout'
			};
		}
		case 'parachute-deployed':
			if (!ctx.isActivePart(event.part)) return null;
			return event.stage === 'semi'
				? { kind: 'info', title: 'Parachute semi-deployed', key: `chute-${event.part}` }
				: { kind: 'success', title: 'Parachute deployed', key: `chute-${event.part}` };
		case 'parachute-torn':
			return ctx.isActivePart(event.part)
				? {
						kind: 'danger',
						title: 'Parachute torn',
						detail: `Opened at ${formatSpeed(event.speed)}: too fast for the canopy`,
						key: `chute-${event.part}`
					}
				: null;
		case 'alarm':
			return { kind: 'warning', title: `Alarm: ${event.name}`, key: `alarm-${event.id}` };
		case 'warp-stopped':
		case 'building-ready':
		case 'vessel-frozen':
			return null; // the world layout's bell shows them (plan 205)
		case 'part-failed': {
			if (!ctx.isActiveVessel(event.vessel)) return null;
			const def = ctx.definitionOf(event.part);
			return {
				kind: 'warning',
				title: event.label,
				detail: `${def ? ctx.partTitle(def) : 'A part'} failed: see the anomaly report`
			};
		}
		case 'part-damaged': {
			if (!ctx.isActiveVessel(event.vessel)) return null;
			const title = ctx.partTitle(event.definition);
			if (event.cause === 'overheat') {
				return {
					kind: 'danger',
					title: `${title} burned up`,
					detail:
						event.temperature === undefined
							? 'Overheated'
							: `Skin reached ${Math.round(event.temperature)} K`
				};
			}
			const detail = `Hit the ground at ${formatSpeed(event.speed)}`;
			return event.outcome === 'destroyed'
				? { kind: 'danger', title: `${title} destroyed`, detail }
				: { kind: 'warning', title: `${title} broke off`, detail };
		}
		case 'mode-changed':
			// Waking is "Liftoff"/thrust; going to rails is what makes time warp possible.
			// Resting on the ground goes on rails too; "Landed" already says that.
			return event.mode === 'on-rails' &&
				ctx.isActiveVessel(event.vessel) &&
				!event.reason.includes('ground')
				? { kind: 'info', title: 'On rails', detail: 'Time warp is available', key: 'rails' }
				: null;
		case 'milestone':
			// a first of the world, whichever vessel made it (plan 102, ADR 0147): the ceremony
			return {
				kind: 'success',
				title: milestoneTitle(event, ctx.home ?? ''),
				detail: 'A first for this world',
				key: `milestone:${event.id}`
			};
		case 'soi-changed':
			return ctx.isActiveVessel(event.vessel)
				? {
						kind: 'info',
						title: `Entering the sphere of ${bodyName(event.to)}`,
						detail: `Time warp returned to 1x`,
						key: 'soi'
					}
				: null;
		case 'maneuver-complete':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'success', title: 'Maneuver complete', key: 'maneuver' }
				: null;
		case 'vessel-destroyed':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'danger', title: 'Vessel lost', detail: event.reason }
				: null;
		// who flies is never silent (plan 320, ADR 0276 point 4)
		case 'program-override':
			return ctx.isActiveVessel(event.vessel)
				? {
						kind: 'warning',
						title: 'Manual override',
						detail: `You hold ${event.channels.join(', ')}; the program resumes 1 s after you let go`,
						key: 'program'
					}
				: null;
		case 'program-resumed':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'info', title: 'Program resumed', key: 'program' }
				: null;
		case 'program-stopped':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'warning', title: 'Programs stopped', detail: event.reason, key: 'program' }
				: null;
		// a mod's notice (plan 343, ADR 0292 point 6); one at a time per mod
		case 'mod-notice':
			return event.vessel === null || ctx.isActiveVessel(event.vessel)
				? {
						kind: event.tone,
						title: event.text,
						...(event.detail !== undefined ? { detail: event.detail } : {}),
						key: `mod:${event.plugin}`
					}
				: null;
		case 'mod-focus':
			return null; // the flight loop switches vessels
	}
}

/** Toast for a change of the flight situation (`prev` null on the first reading: nothing). */
export function toastForPhase(
	prev: FlightPhase | null,
	next: FlightPhase,
	orbit?: { apoapsis?: number; periapsis?: number }
): Toast | null {
	if (prev === null || prev === next) return null;
	if (next === 'landed') return { kind: 'success', title: 'Landed', key: 'phase' };
	if (prev === 'landed' && next === 'flight')
		return { kind: 'info', title: 'Liftoff', key: 'phase' };
	if (next === 'orbit') {
		const parts: string[] = [];
		if (orbit?.periapsis !== undefined) parts.push(`Pe ${formatDistance(orbit.periapsis)}`);
		if (orbit?.apoapsis !== undefined) parts.push(`Ap ${formatDistance(orbit.apoapsis)}`);
		return {
			kind: 'success',
			title: 'Stable orbit',
			...(parts.length > 0 ? { detail: parts.join(', ') } : {}),
			key: 'phase'
		};
	}
	return null;
}

/** A command the sim refused, as the player should read it. */
export const toastForRefusal = (command: string, reason: string): Toast => ({
	kind: 'warning',
	title: `Cannot ${command}`,
	detail: reason,
	key: `refused-${command}`
});

/**
 * The hottest part's temperature over its limit (plan 237): the part's `maxTemperature`, else the
 * sim's default of 2000 K, so the HUD warns where the sim will fail the part.
 */
export function heatRatio(
	parts: ReadonlyArray<{ definition: string; temperature?: number }>,
	limitOf: (definition: string) => number | undefined
): number {
	let heat = 0;
	for (const p of parts) {
		const limit = limitOf(p.definition) ?? DEFAULT_MAX_TEMPERATURE;
		if (p.temperature !== undefined) heat = Math.max(heat, p.temperature / limit);
	}
	return heat;
}

/** Warn at 85 % of a part's maximum temperature; re-arm below 70 %. */
export const HEAT_WARN = 0.85;
export const HEAT_REARM = 0.7;

export function toastForHeat(
	ratio: number,
	armed: boolean
): { toast: Toast | null; armed: boolean } {
	if (armed && ratio >= HEAT_WARN) {
		return {
			toast: {
				kind: 'danger',
				title: 'Overheating',
				detail: `A part is at ${Math.round(ratio * 100)}% of its limit`,
				key: 'heat'
			},
			armed: false
		};
	}
	return { toast: null, armed: armed || ratio < HEAT_REARM };
}

export interface LiveToast extends Toast {
	id: number;
	until: number;
	/** How many times it came (V3 §2.2: the same event merges into one toast with a ×n badge). */
	count: number;
}

/** The same event again: the same key, or with no key the same kind, title and detail. */
const sameEvent = (a: Toast, b: Toast): boolean =>
	a.key !== undefined || b.key !== undefined
		? a.key === b.key
		: a.kind === b.kind && a.title === b.title && a.detail === b.detail;

/**
 * Adds `toast` and keeps at most `MAX_TOASTS`: past the cap the oldest that is not a danger leaves
 * first, so an error stays on screen (plan 215, ADR 0205 point 5). The same event again (V3 §2.2)
 * takes the new words and time and counts up; a toast with a key replaces the earlier one.
 */
export function addToast(
	list: readonly LiveToast[],
	toast: Toast,
	now: number,
	id: number
): LiveToast[] {
	const before = list.find((t) => sameEvent(t, toast));
	const rest = before ? list.filter((t) => t !== before) : list;
	const count = before && before.title === toast.title ? before.count + 1 : 1;
	const out = [...rest, { ...toast, id, until: now + TOAST_MS[toast.kind], count }];
	while (out.length > MAX_TOASTS) {
		const calm = out.findIndex((t) => t.kind !== 'danger');
		out.splice(calm >= 0 ? calm : 0, 1);
	}
	return out;
}

export const pruneToasts = (list: readonly LiveToast[], now: number): LiveToast[] =>
	list.some((t) => t.until <= now) ? list.filter((t) => t.until > now) : (list as LiveToast[]);
