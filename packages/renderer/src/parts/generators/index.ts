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
import { fairing, fairingPanel } from './fairing.ts';
import { noseCone } from './nose-cone.ts';
import { parachute } from './parachute.ts';
import { probe } from './probe.ts';
import { antennaDish, antennaRelay, antennaWhip, container, instrument } from './comms.ts';
import { coupler, hub, lattice, petals, serviceBay, truss } from './bays.ts';
import { battery, fuelCell, rtg, solarArray, solarFlat, solarFold, solarWings } from './power.ts';
import { deltaWing, escapeTower, externalTank, orbiterAft, orbiterNose } from './shuttle.ts';
import { hingeJoint, pistonJoint, rotaryJoint } from './robotic.ts';
import { roverChassis, roverWheel } from './rover-wheel.ts';
import {
	ascentCabin,
	boom,
	coneCapsule,
	crewCan,
	cupola,
	descentStage,
	headlight,
	radiator,
	satelliteBus,
	singleLeg,
	sphereCapsule,
	telescope
} from './spacecraft.ts';
import { radialDecoupler } from './radial-decoupler.ts';
import { ladder } from './ladder.ts';
import { light } from './light.ts';
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
	registerPartGenerator('light', light);
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
	registerPartGenerator('fairing', fairing);
	registerPartGenerator('fairing-panel', fairingPanel);
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
	registerPartGenerator('probe', probe);
	// plan 280: power, comms, science, containers
	registerPartGenerator('solar-flat', solarFlat);
	registerPartGenerator('solar-fold', solarFold);
	registerPartGenerator('solar-array', solarArray);
	registerPartGenerator('solar-wings', solarWings);
	registerPartGenerator('battery', battery);
	registerPartGenerator('rtg', rtg);
	registerPartGenerator('fuel-cell', fuelCell);
	registerPartGenerator('antenna-whip', antennaWhip);
	registerPartGenerator('antenna-dish', antennaDish);
	registerPartGenerator('antenna-relay', antennaRelay);
	registerPartGenerator('instrument', instrument);
	registerPartGenerator('container', container);
	// plan 281: payload and structure
	registerPartGenerator('service-bay', serviceBay);
	registerPartGenerator('petals', petals);
	registerPartGenerator('coupler', coupler);
	registerPartGenerator('truss', truss);
	registerPartGenerator('hub', hub);
	registerPartGenerator('lattice', lattice);
	// plans 296–300: spacecraft
	registerPartGenerator('headlight', headlight);
	registerPartGenerator('sphere-capsule', sphereCapsule);
	registerPartGenerator('cone-capsule', coneCapsule);
	registerPartGenerator('crew-can', crewCan);
	registerPartGenerator('cupola', cupola);
	registerPartGenerator('radiator', radiator);
	registerPartGenerator('satellite-bus', satelliteBus);
	registerPartGenerator('telescope', telescope);
	registerPartGenerator('boom', boom);
	registerPartGenerator('descent-stage', descentStage);
	registerPartGenerator('ascent-cabin', ascentCabin);
	registerPartGenerator('single-leg', singleLeg);
	// plan 295 and the escape tower (276)
	registerPartGenerator('orbiter-nose', orbiterNose);
	registerPartGenerator('orbiter-aft', orbiterAft);
	registerPartGenerator('delta-wing', deltaWing);
	registerPartGenerator('external-tank', externalTank);
	registerPartGenerator('escape-tower', escapeTower);
	// plan 306: robotics
	registerPartGenerator('hinge-joint', hingeJoint);
	registerPartGenerator('rotary-joint', rotaryJoint);
	registerPartGenerator('piston-joint', pistonJoint);
	// plan 307: rover
	registerPartGenerator('rover-wheel', roverWheel);
	registerPartGenerator('rover-chassis', roverChassis);
	// A plain painted barrel for mods that only give a colour: a tank without stripe and bands.
	registerPartGenerator('plain', (ctx: GenContext) =>
		tank({
			...ctx,
			param: (name, fallback, min, max) =>
				name === 'stripe' || name === 'bands' ? 0 : ctx.param(name, fallback, min, max)
		})
	);
}
