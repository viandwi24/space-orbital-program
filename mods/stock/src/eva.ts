/**
 * EVA (plan 109, ADR 0120): the suit a crew member steps out in, its jetpack propellant, and the
 * flag a suit plants. The suit is a vessel of one part: a seat, a command module, a small
 * life-support pack, a jetpack (the stock engine on its own propellant), a reaction wheel and a
 * surface sampler.
 */
import {
	defineModule,
	definePart,
	defineResource,
	kg,
	STANDARD_GRAVITY,
	z,
	type Ambient,
	type PartShape
} from '@orbital/sdk';
import { AntennaSuitRadio, ModuleAntenna } from './comms.ts';
import { partCost } from './costs.ts';
import { ModuleParachute } from './parachute.ts';
import { ModuleCommand, ModuleReactionWheel, ModuleResourceContainer } from './modules.ts';
import { ElectricCharge, Food, Oxygen, Supplies, Water } from './resources.ts';
import { ExperimentSurfaceSample, ModuleExperiment } from './science.ts';

/**
 * Cold gas for the suit's jetpack and cold-gas RCS: 1 u is 1 kg. It was `stock.eva-propellant`
 * before plan 208; save format 9 renames it (ADR 0203 point 2).
 */
export const ColdGas = defineResource({
	id: 'stock.cold-gas',
	density: 1,
	flowMode: 'vessel',
	unit: 'u',
	price: 0.5
});
/** The old name of `ColdGas`, kept for mods written against it. */
export const EvaPropellant = ColdGas;

/**
 * Jetpack figures (plan 225, ADR 0209 point 3): KSP's 270 N; Isp and load set so the suit has
 * about 390 m/s (inside 300–600, default per owner review, rancangan §15 #12).
 */
export const JETPACK = { thrust: 270, isp: 200, propellant: 20 } as const;

export const jetpackConfigSchema = z.object({
	thrust: z.number().positive(),
	isp: z.number().positive(),
	propellant: z.string().min(1)
});
export interface JetpackState {
	on: boolean;
	/** 0..1 of full thrust last step (for the HUD and effects). */
	firing: number;
}

/**
 * The suit's jetpack (plan 225, ADR 0209 point 3): while on, it pushes along the translation demand
 * (`attitude.translate`, the same input as RCS) at up to `thrust`, burning `propellant` at `isp`.
 */
export const ModuleJetpack = defineModule({
	id: 'stock.jetpack',
	config: jetpackConfigSchema,
	state: (): JetpackState => ({ on: false, firing: 0 }),
	describe: (_config, state) => ({
		category: 'command',
		actions: [{ id: 'setOn', label: 'Jetpack', kind: 'toggle', value: state.on, enabled: true }]
	}),
	update: (ctx, dt) => {
		const s = ctx.state;
		s.firing = 0;
		if (!s.on || dt <= 0) return;
		const d = ctx.vessel.translateDemand;
		const mag = Math.hypot(d.x, d.y, d.z);
		if (mag <= 1e-6) return;
		const k = Math.min(1, mag) / mag;
		const density = ctx.registries.resources.get(ctx.config.propellant)?.density ?? 1;
		const force = ctx.config.thrust * Math.min(1, mag);
		const need = (force * dt) / (ctx.config.isp * STANDARD_GRAVITY) / density;
		const got = ctx.vessel.resources.withdraw(ctx.config.propellant, need);
		const scale = need > 0 ? got / need : 0;
		if (scale <= 0) return;
		s.firing = Math.min(1, mag) * scale;
		const f = ctx.config.thrust * k * scale;
		ctx.vessel.applyForce({ x: d.x * f, y: d.y * f, z: d.z * f });
	},
	actions: {
		/** `(on)`. */
		setOn: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.on = on;
		}
	},
	snapshot: (state) => ({ on: state.on, firing: state.firing })
});

/**
 * The helmet (plan 249, ADR 0237): on, a suit is sealed; off, its wearer breathes the air, which
 * only breathable air allows: the body says so (`atmosphere.breathable`), with pressure and
 * temperature a person can stand (the pressure of about 4 km up on Home, -30 to 45 °C).
 */
export const HELMET_AIR = {
	minPressure: 60_000,
	minTemperature: 243,
	maxTemperature: 318
} as const;

/** Whether a helmet may come off in `air`. */
export function helmetMayComeOff(
	air: Pick<Ambient, 'breathable' | 'pressure' | 'temperature'>
): boolean {
	return (
		air.breathable === true &&
		air.pressure >= HELMET_AIR.minPressure &&
		(air.temperature ?? 288) >= HELMET_AIR.minTemperature &&
		(air.temperature ?? 288) <= HELMET_AIR.maxTemperature
	);
}

export interface HelmetState {
	on: boolean;
	/** Whether the air around the suit allows the helmet off, as of the last step. */
	breathable: boolean;
}

export const ModuleHelmet = defineModule({
	id: 'stock.helmet',
	state: (): HelmetState => ({ on: true, breathable: false }),
	describe: (_config, state) => ({
		category: 'command',
		readouts: [{ id: 'helmet', label: 'Helmet', value: state.on ? 'On' : 'Off' }],
		actions: [
			{
				id: 'setOn',
				label: 'Helmet',
				kind: 'toggle',
				value: state.on,
				enabled: !state.on || state.breathable,
				...(!state.on || state.breathable ? {} : { reason: 'The air here is not breathable' })
			}
		]
	}),
	// a helmet off in air that stops being breathable (climbing, a thin or cold layer) goes back on
	update: (ctx) => {
		const s = ctx.state;
		s.breathable = helmetMayComeOff(ctx.vessel.ambient);
		if (!s.on && !s.breathable) s.on = true;
	},
	actions: {
		/** `(on)`; taking it off is refused in air that is not breathable. */
		setOn: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			if (!on && !helmetMayComeOff(ctx.vessel.ambient)) return;
			ctx.state.on = on;
		}
	},
	snapshot: (state) => ({ on: state.on, breathable: state.breathable })
});

/**
 * The personal parachute (plan 249, ADR 0237): the stock parachute module at a suit's scale. KSP's
 * main brings 1 t down at about 6 m/s on 480 m² of drag area; a suit (about 110 kg with its
 * loads) gets 55 m², about 5.5 m/s at sea level, under the suit's 8 m/s impact tolerance. It opens
 * lower than a capsule's (300 m).
 */
export const PERSONAL_CHUTE = {
	semiDragArea: 1.2,
	fullDragArea: 55,
	deployHeight: 300,
	anchor: [0, 0.9, 0] as [number, number, number]
} as const;

const SUIT: PartShape = { kind: 'box', size: [0.7, 1.8, 0.5] };

export const PartEvaSuit = definePart({
	id: 'stock.eva-suit',
	title: 'EVA Suit',
	mass: kg(85),
	crewCapacity: 1,
	cost: partCost(85, 'command'),
	impactTolerance: 8,
	maxTemperature: 800,
	shape: SUIT,
	// the astronaut's own gear, not a catalogue part (plan 255; KSP keeps it in the kerbal's inventory)
	catalog: { hidden: true },
	walk: { speed: 1.5, run: 3, propellant: ColdGas.id },
	visual: {
		kind: 'suit',
		palette: { primary: '#f1f2f4', secondary: '#2a2e35', accent: '#e0572b' },
		// the helmet is the moving piece, hidden while it is off; the canopy follows the chute
		articulation: { module: ModuleHelmet.id, field: 'on', mode: 'visible' },
		deploy: { module: ModuleParachute.id, flag: 'canopy', seconds: 1 }
	},
	attach: {
		top: { pos: [0, 0.9, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -0.9, 0], dir: [0, -1, 0] }
	},
	modules: [
		[ModuleCommand, {}],
		[
			ModuleResourceContainer,
			{
				contents: {
					[ElectricCharge.id]: { capacity: 20 },
					[ColdGas.id]: { capacity: JETPACK.propellant },
					// half a day of everything a crew member needs (ADR 0181)
					[Supplies.id]: { capacity: 0.5 },
					[Oxygen.id]: { capacity: 0.5 },
					[Water.id]: { capacity: 0.5 },
					[Food.id]: { capacity: 0.5 }
				}
			}
		],
		[ModuleJetpack, { thrust: JETPACK.thrust, isp: JETPACK.isp, propellant: ColdGas.id }],
		[ModuleReactionWheel, { torque: 20, chargeRate: 0.01 }],
		[ModuleHelmet],
		[ModuleParachute, { ...PERSONAL_CHUTE }],
		[ModuleExperiment, { experiment: ExperimentSurfaceSample.id, label: 'Take surface sample' }],
		// relayed by a crewed vessel in sight (plan 121, ADR 0193 point 1)
		[ModuleAntenna, { antenna: AntennaSuitRadio.id }]
	]
});

/** A planted flag never goes away as debris (ADR 0120 point 5). */
export const ModuleFlag = defineModule({ id: 'stock.flag', keep: true });

export const PartFlag = definePart({
	id: 'stock.flag',
	title: 'Flag',
	mass: kg(10),
	cost: partCost(10, 'structure'),
	impactTolerance: 20,
	maxTemperature: 1200,
	// a wide footprint so the pole stands; the figure is drawn thin
	shape: { kind: 'box', size: [0.8, 2, 0.8] },
	// planted by an EVA crew member, not built (plan 255)
	catalog: { hidden: true },
	visual: {
		kind: 'flag',
		palette: { primary: '#d5d8dc', secondary: '#2a2e35', accent: '#3e6ae1' }
	},
	attach: {
		top: { pos: [0, 1, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -1, 0], dir: [0, -1, 0] }
	},
	modules: [[ModuleFlag]]
});

/**
 * A ladder for the side of a stack (plan 225, ADR 0209 point 4): 2 m of rungs a suit grabs with F
 * and climbs.
 */
export const PartLadder = definePart({
	id: 'stock.ladder',
	title: 'Ladder',
	mass: kg(10),
	cost: partCost(10, 'structure'),
	impactTolerance: 10,
	maxTemperature: 1200,
	shape: { kind: 'box', size: [0.1, 2, 0.4] },
	visual: {
		kind: 'ladder',
		palette: { primary: '#c9ccd1', secondary: '#2a2e35', accent: '#e0572b' }
	},
	attach: { radial: { pos: [-0.05, 0, 0], dir: [-1, 0, 0] } },
	ladder: { from: [0.05, -0.95, 0], to: [0.05, 0.95, 0], out: [1, 0, 0] }
});

export const STOCK_EVA_PARTS = [PartEvaSuit, PartFlag, PartLadder] as const;
