/**
 * The planet map sample (plan 406, ADR 0346): a second planet whose continents are an image in the
 * mod's package. The body is a `hills` body with its own `seed` and a `map`; the sim stands vessels
 * on the height the image gives, and the renderer draws the same one, from far in the map's own
 * colours (plan 406 stage 2, ADR 0363) with a normal map, a green sea and a cloud deck. Delete what you do not need.
 */
import { defineBody, definePlugin } from '@orbital/sdk';

/** G, so a mass makes the surface gravity wanted: 4 m/s^2 on a 400 km planet. */
const G = 6.6743e-11;

export const Verdant = defineBody({
	id: 'planet-sample.verdant',
	mass: (4 * 400_000 ** 2) / G,
	radius: 400_000,
	rotationPeriod: 30_000,
	// the planet orbits the home planet's sun-side neighbour: a moon-like orbit keeps the sample small
	parent: 'stock.home',
	orbit: { a: 60_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 },
	// the image is the ground: `seed` binds the map to this body (and moves its fine noise)
	terrain: { kind: 'hills', seed: 31337, map: 'maps/verdant.png' },
	atmosphere: { scaleHeight: 6_000, surfacePressure: 60_000, height: 60_000 },
	// seen from far it wears its map's continents; its normal map lights the relief, its clouds hide the ground from orbit
	appearance: {
		palette: ['#4f7a3a', '#2f5a8a', '#b79b64'],
		sky: '#79aee6',
		haze: 0.2,
		clouds: { color: '#f4f6f8', altitude: 9_000, opacity: 0.4 },
		normal: 'maps/verdant-normal.png'
	},
	// a greener sea than Home's
	ocean: { shallow: '#2fb89a', deep: '#06453f' }
});

export default definePlugin({
	meta: {
		id: 'planet-sample',
		version: '1.0.0',
		api: '^0.1.132',
		title: 'Verdant (planet sample)'
	},
	depends: ['stock'],
	setup(ctx) {
		ctx.bodies.register(Verdant);
	}
});
