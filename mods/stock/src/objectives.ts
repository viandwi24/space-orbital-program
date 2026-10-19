/**
 * Stock objective primitives for the flight state that exists today (plan 098, ADR 0175):
 * orbit, landing, altitude, spheres of influence, flybys, returning home and a date limit.
 * Each is pure over the view and its own prior result.
 */
import { defineObjective, z, type ObjectiveVesselView, type ObjectiveView } from '@orbital/sdk';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const bodyOf = (view: ObjectiveView, body: string | undefined): string => body ?? view.home;

/** Best progress over the vessels, or done when any vessel satisfies `test`. */
function overVessels(
	view: ObjectiveView,
	test: (v: ObjectiveVesselView) => boolean,
	progress: (v: ObjectiveVesselView) => number = () => 0
) {
	let best = 0;
	for (const v of view.vessels) {
		if (test(v)) return { status: 'done' as const, progress: 1 };
		best = Math.max(best, clamp01(progress(v)));
	}
	return { status: 'active' as const, progress: best };
}

export const ObjectiveReachOrbit = defineObjective({
	id: 'stock.reach-orbit',
	label: 'Reach orbit',
	params: z.object({
		body: z.string().optional(),
		/** Periapsis altitude at least, m. */
		minPeriapsis: z.number().nonnegative(),
		/** Apoapsis altitude at most, m. */
		maxApoapsis: z.number().positive().optional()
	}),
	evaluate: (p, view) => {
		const body = bodyOf(view, p.body);
		return overVessels(
			view,
			(v) =>
				v.body === body &&
				!v.landed &&
				v.periapsis !== null &&
				v.periapsis >= p.minPeriapsis &&
				(p.maxApoapsis === undefined || (v.apoapsis !== null && v.apoapsis <= p.maxApoapsis)),
			(v) =>
				v.body === body && v.periapsis !== null ? v.periapsis / Math.max(p.minPeriapsis, 1) : 0
		);
	}
});

export const ObjectiveLand = defineObjective({
	id: 'stock.land',
	label: 'Land',
	params: z.object({ body: z.string().optional() }),
	evaluate: (p, view) => overVessels(view, (v) => v.landed && v.body === bodyOf(view, p.body))
});

export const ObjectiveReachAltitude = defineObjective({
	id: 'stock.reach-altitude',
	label: 'Reach an altitude',
	params: z.object({ body: z.string().optional(), min: z.number().positive() }),
	evaluate: (p, view) => {
		const body = bodyOf(view, p.body);
		return overVessels(
			view,
			(v) => v.body === body && v.altitude >= p.min,
			(v) => (v.body === body ? v.altitude / p.min : 0)
		);
	}
});

export const ObjectiveEnterSoi = defineObjective({
	id: 'stock.enter-soi',
	label: 'Enter the sphere of influence',
	params: z.object({ body: z.string() }),
	on: ['step', 'vessel:soi-changed'],
	evaluate: (p, view) => overVessels(view, (v) => v.body === p.body)
});

/** Entered the body's sphere, then left it (`data.entered` remembers the first half). */
export const ObjectiveFlyby = defineObjective({
	id: 'stock.flyby',
	label: 'Fly by',
	params: z.object({ body: z.string() }),
	on: ['step', 'vessel:soi-changed'],
	evaluate: (p, view, prior) => {
		const inside = view.vessels.some((v) => v.body === p.body);
		const entered = prior?.data?.entered === true || inside;
		if (entered && !inside) return { status: 'done', progress: 1, data: { entered: true } };
		return { status: 'active', progress: entered ? 0.5 : 0, data: { entered } };
	}
});

export const ObjectiveReturnHome = defineObjective({
	id: 'stock.return-home',
	label: 'Return home',
	params: z.object({}),
	evaluate: (_p, view) => overVessels(view, (v) => v.landed && v.body === view.home)
});

/** A date limit: satisfied until `time` (sim seconds), failed after (a constraint, ADR 0175 point 2). */
export const ObjectiveBefore = defineObjective({
	id: 'stock.before',
	label: 'Before a date',
	params: z.object({ time: z.number() }),
	constraint: true,
	on: ['step', 'tick'],
	evaluate: (p, view) =>
		view.time <= p.time ? { status: 'done', progress: 1 } : { status: 'failed', progress: 0 }
});

/** In a closed orbit of `body`, off the ground. */
const orbiting = (v: ObjectiveVesselView, body: string): boolean =>
	v.body === body && !v.landed && v.periapsis !== null && v.apoapsis !== null;

/**
 * Every crew member the contract stranded is home again (plan 231, ADR 0231 point 5): boarded,
 * flown back and recovered, so the roster has them available.
 */
export const ObjectiveRescue = defineObjective({
	id: 'stock.rescue',
	label: 'Rescue the crew',
	params: z.object({}),
	on: ['step', 'tick'],
	evaluate: (_p, view) => {
		const rescues = view.rescues ?? [];
		if (rescues.length === 0) return { status: 'active', progress: 0 };
		const home = rescues.filter((r) => r.status === 'available').length;
		if (rescues.some((r) => r.status === 'lost')) {
			return { status: 'failed', progress: home / rescues.length };
		}
		return home === rescues.length
			? { status: 'done', progress: 1 }
			: { status: 'active', progress: home / rescues.length };
	}
});

/** A satellite: in the given orbit (±`tolerance` on Ap and Pe, ±`inclinationTolerance`) with an antenna and power. */
export const ObjectiveSatellite = defineObjective({
	id: 'stock.satellite',
	label: 'Place a satellite',
	params: z.object({
		body: z.string().optional(),
		periapsis: z.number().positive(),
		apoapsis: z.number().positive(),
		/** rad. */
		inclination: z.number().min(0).max(Math.PI),
		/** Fraction of each altitude (default 0.1). */
		tolerance: z.number().positive().max(1).optional(),
		/** rad (default 2°). */
		inclinationTolerance: z.number().positive().optional()
	}),
	evaluate: (p, view) => {
		const body = bodyOf(view, p.body);
		const tol = p.tolerance ?? 0.1;
		const di = p.inclinationTolerance ?? (2 * Math.PI) / 180;
		const near = (x: number | null, want: number) => x !== null && Math.abs(x - want) <= want * tol;
		return overVessels(
			view,
			(v) =>
				orbiting(v, body) &&
				near(v.periapsis, p.periapsis) &&
				near(v.apoapsis, p.apoapsis) &&
				v.inclination !== undefined &&
				v.inclination !== null &&
				Math.abs(v.inclination - p.inclination) <= di &&
				v.antenna === true &&
				v.power === true,
			(v) => (orbiting(v, body) ? 0.5 : 0)
		);
	}
});

/** A station: in orbit with a docking port, `seats` crew seats or more, and power. */
export const ObjectiveStation = defineObjective({
	id: 'stock.station',
	label: 'Build a station',
	params: z.object({
		body: z.string().optional(),
		minPeriapsis: z.number().nonnegative(),
		seats: z.int().min(1)
	}),
	evaluate: (p, view) => {
		const body = bodyOf(view, p.body);
		return overVessels(
			view,
			(v) =>
				orbiting(v, body) &&
				(v.periapsis ?? -1) >= p.minPeriapsis &&
				(v.ports ?? 0) >= 1 &&
				(v.seats ?? 0) >= p.seats &&
				v.power === true,
			(v) => (orbiting(v, body) ? Math.min(1, (v.seats ?? 0) / p.seats) * 0.9 : 0)
		);
	}
});

/** Two vessels docked in orbit of `body` (a vessel that took another in by docking). */
export const ObjectiveDock = defineObjective({
	id: 'stock.dock',
	label: 'Dock two vessels',
	params: z.object({ body: z.string().optional() }),
	on: ['step', 'vessel:docked'],
	evaluate: (p, view) =>
		overVessels(view, (v) => orbiting(v, bodyOf(view, p.body)) && v.docked === true)
});

export const STOCK_OBJECTIVES = [
	ObjectiveReachOrbit,
	ObjectiveLand,
	ObjectiveReachAltitude,
	ObjectiveEnterSoi,
	ObjectiveFlyby,
	ObjectiveReturnHome,
	ObjectiveBefore,
	ObjectiveRescue,
	ObjectiveSatellite,
	ObjectiveStation,
	ObjectiveDock
] as const;
