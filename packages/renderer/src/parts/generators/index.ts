/** Registers the stock procedural generators (kinds used by `mods/stock`). */
import { adapter } from './adapter.ts';
import { gear } from './gear.ts';
import { registerPartGenerator, type GenContext } from '../registry.ts';
import { capsule } from './capsule.ts';
import { booster } from './booster.ts';
import { controlSurface } from './control-surface.ts';
import { fuelLine, strut } from './connector.ts';
import { decoupler } from './decoupler.ts';
import { dockingPort } from './docking-port.ts';
import { engine } from './engine.ts';
import { engineCluster } from './engine-cluster.ts';
import { flag, suit } from './eva.ts';
import { fin } from './fin.ts';
import { heatShield } from './heat-shield.ts';
import { landingLegs } from './legs.ts';
import { launchClamp } from './launch-clamp.ts';
import { noseCone } from './nose-cone.ts';
import { parachute } from './parachute.ts';
import { radialDecoupler } from './radial-decoupler.ts';
import { ladder } from './ladder.ts';
import { rcsBlock } from './rcs-block.ts';
import { tailCone } from './tail-cone.ts';
import { tank } from './tank.ts';
import { reactionWheel } from './wheel.ts';
import { wing } from './wing.ts';

let registered = false;

/** Idempotent; the procedural provider calls it before the first lookup. */
export function registerStockGenerators(): void {
	if (registered) return;
	registered = true;
	registerPartGenerator('capsule', capsule);
	registerPartGenerator('ladder', ladder);
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
	registerPartGenerator('tail-cone', tailCone);
	registerPartGenerator('adapter', adapter);
	registerPartGenerator('rcs-block', rcsBlock);
	registerPartGenerator('launch-clamp', launchClamp);
	registerPartGenerator('docking-port', dockingPort);
	registerPartGenerator('fin', fin);
	registerPartGenerator('control-surface', controlSurface);
	registerPartGenerator('wing', wing);
	registerPartGenerator('gear', gear);
	registerPartGenerator('strut', strut);
	registerPartGenerator('fuel-line', fuelLine);
	registerPartGenerator('suit', suit);
	registerPartGenerator('flag', flag);
	registerPartGenerator('parachute', parachute);
	// A plain painted barrel for mods that only give a colour: a tank without stripe and bands.
	registerPartGenerator('plain', (ctx: GenContext) =>
		tank({
			...ctx,
			param: (name, fallback, min, max) =>
				name === 'stripe' || name === 'bands' ? 0 : ctx.param(name, fallback, min, max)
		})
	);
}
