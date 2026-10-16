/** Registers the stock procedural generators (kinds used by `mods/stock`). */
import { registerPartGenerator, type GenContext } from '../registry.ts';
import { capsule } from './capsule.ts';
import { decoupler } from './decoupler.ts';
import { engine } from './engine.ts';
import { heatShield } from './heat-shield.ts';
import { landingLegs } from './legs.ts';
import { tank } from './tank.ts';
import { reactionWheel } from './wheel.ts';

let registered = false;

/** Idempotent; the procedural provider calls it before the first lookup. */
export function registerStockGenerators(): void {
	if (registered) return;
	registered = true;
	registerPartGenerator('capsule', capsule);
	registerPartGenerator('tank', tank);
	registerPartGenerator('engine', engine);
	registerPartGenerator('decoupler', decoupler);
	registerPartGenerator('reaction-wheel', reactionWheel);
	registerPartGenerator('landing-legs', landingLegs);
	registerPartGenerator('heat-shield', heatShield);
	// A plain painted barrel for mods that only give a colour: a tank without stripe and bands.
	registerPartGenerator('plain', (ctx: GenContext) =>
		tank({
			...ctx,
			param: (name, fallback, min, max) =>
				name === 'stripe' || name === 'bands' ? 0 : ctx.param(name, fallback, min, max)
		})
	);
}
