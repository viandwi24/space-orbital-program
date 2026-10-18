/**
 * Constellation planner (plan 118, ADR 0163 point 5): N satellites spread evenly on one circular
 * orbit from one carrier. The carrier flies a resonant deploy orbit with an apsis on the target
 * orbit and drops one satellite there each revolution; each satellite circularises at the drop.
 */

export type DeploySide = 'above' | 'below';

export interface DeploymentInput {
	/** Gravitational parameter of the body, m³/s². */
	mu: number;
	/** Surface radius of the body, m. */
	bodyRadius: number;
	/** Radius of the circular target orbit from the body's centre, m. */
	radius: number;
	/** Number of satellites, at least 2. */
	count: number;
	/** A deploy orbit above the target (slower, period (N+1)/N) or below it (faster, (N−1)/N). */
	side?: DeploySide;
	/** Height the deploy orbit's periapsis must keep above the surface, m (default 0). */
	clearance?: number;
}

export interface DeploymentPlan {
	count: number;
	side: DeploySide;
	/** Period of the target orbit, s. */
	targetPeriod: number;
	/** Deploy period over target period, as a fraction. */
	ratio: { numerator: number; denominator: number };
	deploy: { periapsis: number; apoapsis: number; a: number; e: number; period: number };
	/** Where on the deploy orbit the satellites are dropped: the apsis on the target orbit. */
	dropAt: 'periapsis' | 'apoapsis';
	/** Angle between neighbouring satellites, rad. */
	spacing: number;
	/** Burn of the carrier from the circular target orbit onto the deploy orbit, m/s. */
	insertionDv: number;
	/** Burn of each satellite at its drop to circularise, m/s. */
	circularizeDv: number;
	/** Drop times after the first drop, s (k × deploy period). */
	drops: number[];
}

/** Throws `RangeError` for bad input or a deploy orbit that dips below the clearance. */
export function resonantDeployment(input: DeploymentInput): DeploymentPlan {
	const { mu, bodyRadius, radius, count } = input;
	const side = input.side ?? 'above';
	const clearance = input.clearance ?? 0;
	if (!(mu > 0) || !(bodyRadius > 0) || !(radius > bodyRadius)) {
		throw new RangeError('resonantDeployment: needs mu > 0 and a target radius above the surface');
	}
	if (!Number.isInteger(count) || count < 2) {
		throw new RangeError(`resonantDeployment: count must be an integer of at least 2, got ${count}`);
	}
	const targetPeriod = 2 * Math.PI * Math.sqrt(radius ** 3 / mu);
	const numerator = side === 'above' ? count + 1 : count - 1;
	const period = (targetPeriod * numerator) / count;
	const a = Math.cbrt(mu * (period / (2 * Math.PI)) ** 2);
	const other = 2 * a - radius;
	const periapsis = Math.min(radius, other);
	const apoapsis = Math.max(radius, other);
	if (periapsis < bodyRadius + clearance) {
		throw new RangeError(
			`resonantDeployment: the deploy orbit's periapsis ${Math.round(periapsis)} m is below the ` +
				`surface plus clearance (${Math.round(bodyRadius + clearance)} m); deploy from above`
		);
	}
	const vCircular = Math.sqrt(mu / radius);
	const vDeploy = Math.sqrt(mu * (2 / radius - 1 / a));
	const dv = Math.abs(vDeploy - vCircular);
	return {
		count,
		side,
		targetPeriod,
		ratio: { numerator, denominator: count },
		deploy: { periapsis, apoapsis, a, e: (apoapsis - periapsis) / (apoapsis + periapsis), period },
		dropAt: side === 'above' ? 'periapsis' : 'apoapsis',
		spacing: (2 * Math.PI) / count,
		insertionDv: dv,
		circularizeDv: dv,
		drops: Array.from({ length: count }, (_, k) => k * period)
	};
}
