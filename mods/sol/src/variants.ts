/**
 * Sol's scale variants (plan 124, ADR 0184 point 5): `1:1`, and `rescaled` with sizes ×k, masses ×k²
 * and distances ×k^(2/3), k = 1/4, so surface gravity, every period, date and angle stay real.
 * Parts are the same in both (plan 380, ADR 0317): the variant patches bodies only, and the Δv to
 * orbit Create World shows is computed by the host from these bodies.
 */
import {
	defineSystemVariant,
	GRAVITATIONAL_CONSTANT,
	type AnyPatchDefinition,
	type BodyDefinition
} from '@orbital/sdk';
import { SOL_BODIES, SolEarth, SolMoon } from './bodies.ts';

/** Size factor of the rescaled variant: the Earth's radius is 1 593 km, 2.65 times stock's home. */
export const RESCALE = 0.25;
/** Distance factor that keeps every orbital period with masses ×k² (a³/μ unchanged). */
export const RESCALE_DISTANCE = RESCALE ** (2 / 3);
/** The rescaled atmosphere's scale height and height factor. */
export const RESCALE_AIR = 0.5;

/** The body as the rescaled variant sees it (exported for the checks and Create World facts). */
export function rescaledBody(b: BodyDefinition): BodyDefinition {
	const orbit = b.orbit && {
		...b.orbit,
		a: b.orbit.a * RESCALE_DISTANCE,
		...(b.orbit.rates
			? { rates: { ...b.orbit.rates, a: (b.orbit.rates.a ?? 0) * RESCALE_DISTANCE } }
			: {}),
		...(b.orbit.series
			? {
					series: {
						...b.orbit.series,
						parentRadius: b.orbit.series.parentRadius * RESCALE_DISTANCE
					}
				}
			: {})
	};
	return {
		...b,
		radius: b.radius * RESCALE,
		mass: b.mass * RESCALE * RESCALE,
		...(orbit ? { orbit } : {}),
		...(b.atmosphere
			? {
					atmosphere: {
						...b.atmosphere,
						scaleHeight: b.atmosphere.scaleHeight * RESCALE_AIR,
						height: b.atmosphere.height * RESCALE_AIR,
						// the temperature layers shrink with the air (plan 212)
						...(b.atmosphere.temperatureCurve
							? {
									temperatureCurve: b.atmosphere.temperatureCurve.map(
										([h, t]) => [h * RESCALE_AIR, t] as [number, number]
									)
								}
							: {})
					}
				}
			: {})
	};
}

/** The rescaled values as `set` patches on Sol's own bodies (ADR 0184 point 5). */
function scalePatches(): AnyPatchDefinition[] {
	return SOL_BODIES.map((b) => {
		const r = rescaledBody(b);
		const ops: Array<{ op: 'set'; path: string; value: unknown }> = [
			{ op: 'set', path: 'radius', value: r.radius },
			{ op: 'set', path: 'mass', value: r.mass }
		];
		if (r.orbit) ops.push({ op: 'set', path: 'orbit', value: r.orbit });
		if (r.atmosphere) ops.push({ op: 'set', path: 'atmosphere', value: r.atmosphere });
		return {
			id: `sol.rescale-${b.id.slice('sol.'.length)}`,
			target: 'body',
			select: { id: b.id },
			ops
		} as AnyPatchDefinition;
	});
}

/** Half the period of a Hohmann ellipse from a 200 km (scaled) orbit to the Moon, s. */
function moonTransfer(earth: BodyDefinition, moon: BodyDefinition, parking: number): number {
	const mu = GRAVITATIONAL_CONSTANT * earth.mass;
	const a = (earth.radius + parking + moon.orbit!.a) / 2;
	return Math.PI * Math.sqrt((a * a * a) / mu);
}

export const VariantRealScale = defineSystemVariant({
	id: 'sol.real-scale',
	system: 'sol',
	variant: '1:1',
	label: 'Real scale (1:1)',
	description:
		'The real solar system at its real size: rockets that need real staging, and real distances to everything.',
	home: SolEarth.id,
	facts: {
		moonTransfer: moonTransfer(SolEarth, SolMoon, 200_000),
		notes: 'For experienced players: real rockets, real staging.'
	}
});

const rescaledEarth = rescaledBody(SolEarth);
export const VariantRescaled = defineSystemVariant({
	id: 'sol.rescaled',
	system: 'sol',
	variant: 'rescaled',
	label: 'Rescaled (1/4)',
	description:
		'Real dates, tilts and orbits with bodies a quarter of their size: the Earth is 3 186 km across, and the Moon, the planets and every calendar date stay where they really are.',
	home: SolEarth.id,
	facts: {
		moonTransfer: moonTransfer(rescaledEarth, rescaledBody(SolMoon), 80_000),
		notes: 'A step up from the stock system, with the real sky.'
	},
	patches: scalePatches()
});

export const SOL_VARIANTS = [VariantRealScale, VariantRescaled] as const;
