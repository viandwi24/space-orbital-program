/**
 * Toasts: short notices for events the player should not miss (plan 021, ADR 0026). The mapping
 * from sim events and HUD transitions is pure; the store keeps at most `MAX_TOASTS`.
 */
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
}

/** Milliseconds a toast stays, by kind (danger stays longest). */
export const TOAST_MS: Record<ToastKind, number> = {
	info: 4_000,
	success: 4_000,
	warning: 6_000,
	danger: 8_000
};
export const MAX_TOASTS = 4;

/** `stock.cinder` -> `Cinder`. */
const bodyName = (id: string): string => {
	const name = id.slice(id.lastIndexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
};

/** `null` when the event is not worth a toast (another vessel, debris, bookkeeping). */
export function toastForSimEvent(event: SimEvent, ctx: ToastContext): Toast | null {
	switch (event.type) {
		case 'stage':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'info', title: `Stage ${event.stage + 1} fired`, key: 'stage' }
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
		case 'soi-changed':
			return ctx.isActiveVessel(event.vessel)
				? {
						kind: 'info',
						title: `Entering the sphere of ${bodyName(event.to)}`,
						detail: `Time warp returned to 1x`,
						key: 'soi'
					}
				: null;
		case 'vessel-destroyed':
			return ctx.isActiveVessel(event.vessel)
				? { kind: 'danger', title: 'Vessel lost', detail: event.reason }
				: null;
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
}

/** Adds `toast` (replacing one with the same key) and keeps the newest `MAX_TOASTS`. */
export function addToast(
	list: readonly LiveToast[],
	toast: Toast,
	now: number,
	id: number
): LiveToast[] {
	const rest = toast.key === undefined ? list : list.filter((t) => t.key !== toast.key);
	return [...rest, { ...toast, id, until: now + TOAST_MS[toast.kind] }].slice(-MAX_TOASTS);
}

export const pruneToasts = (list: readonly LiveToast[], now: number): LiveToast[] =>
	list.some((t) => t.until <= now) ? list.filter((t) => t.until > now) : (list as LiveToast[]);
