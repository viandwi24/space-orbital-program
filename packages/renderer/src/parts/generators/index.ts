/** Registers the stock procedural generators (kinds used by `mods/stock`). */
import { registerPartGenerator, type GenContext } from '../registry.ts';
import { capsule } from './capsule.ts';
import { booster } from './booster.ts';
import { controlSurface } from './control-surface.ts';
import { fuelLine, strut } from './connector.ts';
import { decoupler } from './decoupler.ts';
import { engine } from './engine.ts';
import { engineCluster } from './engine-cluster.ts';
import { fin } from './fin.ts';
import { heatShield } from './heat-shield.ts';
import { landingLegs } from './legs.ts';
import { noseCone } from './nose-cone.ts';
import { radialDecoupler } from './radial-decoupler.ts';
import { tank } from './tank.ts';
import { reactionWheel } from './wheel.ts';
import { wing } from './wing.ts';

let registered = false;

/** Idempotent; the procedural provider calls it before the first lookup. */
export function registerStockGenerators(): void {
	if (registered) return;
	registered = true;
	registerPartGenerator('capsule', capsule);
	registerPartGenerator('tank', tank);
	registerPartGenerator('engine', engine);
	registerPartGenerator('engine-cluster', engineCluster);
	registerPartGenerator('decoupler', decoupler);
	registerPartGenerator('reaction-wheel', reactionWheel);
	registerPartGenerator('landing-legs', landingLegs);
	registerPartGenerator('heat-shield', heatShield);
	registerPartGenerator('radial-decoupler', radialDecoupler);
	registerPartGenerator('booster', booster);
	registerPartGenerator('nose-cone', noseCone);
	registerPartGenerator('fin', fin);
	registerPartGenerator('control-surface', controlSurface);
	registerPartGenerator('wing', wing);
	registerPartGenerator('strut', strut);
	registerPartGenerator('fuel-line', fuelLine);
	// A plain painted barrel for mods that only give a colour: a tank without stripe and bands.
	registerPartGenerator('plain', (ctx: GenContext) =>
		tank({
			...ctx,
			param: (name, fallback, min, max) =>
				name === 'stripe' || name === 'bands' ? 0 : ctx.param(name, fallback, min, max)
		})
	);
}
