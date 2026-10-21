/**
 * Stock science (plan 103, ADR 0178): the six situations, five experiments and the
 * `stock.experiment` module that runs one of them on a part.
 */
import {
	defineDossierEntry,
	defineExperiment,
	defineModule,
	defineSituation,
	z,
	type ExperimentDefinition,
	type ExperimentStatus,
	type ModuleContext
} from '@orbital/sdk';
import { DataScience } from './data.ts';
import { ElectricCharge } from './resources.ts';

// ---- situations (ADR 0178 point 1), lowest order first ----

export const SituationLanded = defineSituation({
	id: 'stock.landed',
	label: 'Landed',
	order: 0,
	regional: true,
	matches: (v) => v.landed && !v.splashed
});
export const SituationSplashed = defineSituation({
	id: 'stock.splashed',
	label: 'Splashed down',
	order: 1,
	regional: true,
	matches: (v) => v.splashed
});
export const SituationFlyingLow = defineSituation({
	id: 'stock.flying-low',
	label: 'Flying low',
	order: 2,
	regional: true,
	matches: (v) => v.altitude < v.atmosphereHeight && v.altitude < v.flyingHigh
});
export const SituationFlyingHigh = defineSituation({
	id: 'stock.flying-high',
	label: 'Flying high',
	order: 3,
	regional: true,
	matches: (v) => v.altitude < v.atmosphereHeight
});
export const SituationSpaceLow = defineSituation({
	id: 'stock.space-low',
	label: 'In space near',
	order: 4,
	regional: true,
	matches: (v) => v.altitude < v.spaceHigh
});
export const SituationSpaceHigh = defineSituation({
	id: 'stock.space-high',
	label: 'In space high',
	order: 5,
	matches: () => true
});

export const STOCK_SITUATIONS = [
	SituationLanded,
	SituationSplashed,
	SituationFlyingLow,
	SituationFlyingHigh,
	SituationSpaceLow,
	SituationSpaceHigh
] as const;

// ---- experiments ----

const KBIT = 1024;

export const ExperimentTemperature = defineExperiment({
	id: 'stock.temperature',
	label: 'Temperature scan',
	kind: 'data',
	situations: [
		'stock.landed',
		'stock.splashed',
		'stock.flying-low',
		'stock.flying-high',
		'stock.space-low'
	],
	baseValue: 8,
	repeatFactor: 0.5,
	duration: 5,
	power: 0.05,
	bits: 8 * KBIT,
	transmitFactor: 0.5
});
export const ExperimentPressure = defineExperiment({
	id: 'stock.pressure',
	label: 'Pressure scan',
	kind: 'data',
	situations: ['stock.landed', 'stock.splashed', 'stock.flying-low', 'stock.flying-high'],
	baseValue: 10,
	repeatFactor: 0.5,
	duration: 5,
	power: 0.05,
	bits: 8 * KBIT,
	transmitFactor: 0.5
});
export const ExperimentSeismic = defineExperiment({
	id: 'stock.seismic',
	label: 'Seismic reading',
	kind: 'data',
	situations: ['stock.landed'],
	baseValue: 20,
	repeatFactor: 0.5,
	duration: 20,
	power: 0.2,
	bits: 64 * KBIT,
	transmitFactor: 0.6
});
export const ExperimentSurfaceSample = defineExperiment({
	id: 'stock.surface-sample',
	label: 'Surface sample',
	kind: 'sample',
	situations: ['stock.landed', 'stock.splashed'],
	baseValue: 30,
	repeatFactor: 0.3,
	duration: 10,
	mass: 5,
	transmitFactor: 0
});
export const ExperimentAtmosphereSample = defineExperiment({
	id: 'stock.atmosphere-sample',
	label: 'Atmosphere sample',
	kind: 'sample',
	situations: ['stock.landed', 'stock.splashed', 'stock.flying-low', 'stock.flying-high'],
	baseValue: 15,
	repeatFactor: 0.3,
	duration: 5,
	power: 0.1,
	mass: 2,
	transmitFactor: 0
});

const EVERYWHERE = [
	'stock.landed',
	'stock.splashed',
	'stock.flying-low',
	'stock.flying-high',
	'stock.space-low',
	'stock.space-high'
];
/** A canister of goo to watch (plan 210, KSP's Mystery Goo): held in the part, used once until reset. */
export const ExperimentGoo = defineExperiment({
	id: 'stock.goo',
	label: 'Goo observation',
	kind: 'data',
	situations: EVERYWHERE,
	baseValue: 2,
	repeatFactor: 0.3,
	duration: 3,
	bits: 16 * KBIT,
	transmitFactor: 0.3
});
/** A bay of material samples (plan 210, KSP's Materials Bay): held in the part, used once until reset. */
export const ExperimentMaterials = defineExperiment({
	id: 'stock.materials',
	label: 'Materials study',
	kind: 'data',
	situations: EVERYWHERE,
	baseValue: 4,
	repeatFactor: 0.3,
	duration: 10,
	power: 0.1,
	bits: 32 * KBIT,
	transmitFactor: 0.35
});

/** Plan 298: a space telescope's observation: from orbit only, with its aperture door open. */
export const ExperimentObservation = defineExperiment({
	id: 'stock.observation',
	label: 'Telescope observation',
	kind: 'data',
	// from high orbit only: a telescope pays off beyond the first flights (keeps the tech pacing)
	situations: ['stock.space-high'],
	baseValue: 8,
	repeatFactor: 0.4,
	duration: 30,
	power: 0.5,
	bits: 256 * KBIT,
	transmitFactor: 0.8
});
/** Plan 298: a magnetometer on a boom: the field around a body, from high orbit. */
export const ExperimentMagnetometer = defineExperiment({
	id: 'stock.magnetometer',
	label: 'Magnetic field scan',
	kind: 'data',
	situations: ['stock.space-high'],
	baseValue: 4,
	repeatFactor: 0.5,
	duration: 15,
	power: 0.1,
	bits: 32 * KBIT,
	transmitFactor: 0.7
});

export const STOCK_EXPERIMENTS = [
	ExperimentTemperature,
	ExperimentPressure,
	ExperimentSeismic,
	ExperimentSurfaceSample,
	ExperimentAtmosphereSample,
	ExperimentGoo,
	ExperimentMaterials,
	ExperimentObservation,
	ExperimentMagnetometer
] as const;

// ---- the experiment module (ADR 0178 point 5) ----

export const experimentConfigSchema = z.object({
	/** Experiment id. */
	experiment: z.string().min(1),
	/** Action label (default "Run experiment"). */
	label: z.string().min(1).optional(),
	/**
	 * The result stays in the part (plan 210, KSP's Goo and Materials Bay): View shows it, Transmit
	 * sends it to the vessel's storage for the antennas and leaves the part spent, Reset readies it
	 * again. Recovery credits a held result in full.
	 */
	held: z.boolean().default(false)
});
export type ExperimentConfig = z.output<typeof experimentConfigSchema>;

export interface ExperimentState {
	status: ExperimentStatus;
	reason: string | null;
	/** 0..1 of the run. */
	progress: number;
	/** A sample made and held until recovery. */
	sample: { subject: string; value: number } | null;
	/** A `held` experiment's result (plan 210); absent in states saved before it. */
	result?: { subject: string; value: number; meta?: Record<string, unknown> } | null;
	/** A `held` experiment whose result was transmitted: reset before the next run (plan 210). */
	spent?: boolean;
}

const HOLDS_SAMPLE = 'holds a sample';
const HOLDS_RESULT = 'holds a result: transmit or reset it';
const SPENT = 'spent: reset it first';
const NO_POWER = 'no electric charge';

function experimentOf(ctx: ModuleContext<ExperimentConfig, ExperimentState>): ExperimentDefinition {
	const def = ctx.registries.experiments.get(ctx.config.experiment);
	if (!def) throw new Error(`stock.experiment: unknown experiment "${ctx.config.experiment}"`);
	return def;
}

const wrongSituation = (now: string | undefined, def: ExperimentDefinition): string =>
	`not in an allowed situation: ${now ?? 'none'}; needs ${def.situations.join(', ')}`;

function set(
	state: ExperimentState,
	status: ExperimentStatus,
	reason: string | null,
	progress = state.progress
): void {
	state.status = status;
	state.reason = reason;
	state.progress = progress;
}

/** A run that finishes makes the result now: the value is fixed (ADR 0178 point 4). */
function finish(ctx: ModuleContext<ExperimentConfig, ExperimentState>): void {
	const def = experimentOf(ctx);
	const { state, vessel } = ctx;
	const result = vessel.science.result(def.id);
	if (!result) return set(state, 'INVALID', wrongSituation(vessel.situation(), def), 0);
	if (def.kind === 'sample') {
		state.sample = result;
		return set(state, 'INVALID', HOLDS_SAMPLE, 1);
	}
	if (ctx.config.held) {
		state.result = { subject: result.subject, value: result.value, meta: { ...result.meta } };
		return set(state, 'INVALID', HOLDS_RESULT, 1);
	}
	vessel.data.store({
		kind: DataScience.id,
		bits: def.bits ?? 1,
		value: result.value,
		time: vessel.time,
		subject: result.subject,
		meta: { transmitFactor: def.transmitFactor, ...result.meta }
	});
	set(state, 'READY', null, 0);
}

function advance(ctx: ModuleContext<ExperimentConfig, ExperimentState>, dt: number): void {
	const { state, vessel } = ctx;
	if (state.status !== 'RUNNING' && state.status !== 'PAUSED') return;
	const def = experimentOf(ctx);
	const need = (def.power ?? 0) * dt;
	if (need > 0 && vessel.resources.withdraw(ElectricCharge.id, need) < need * (1 - 1e-9)) {
		return set(state, 'PAUSED', NO_POWER);
	}
	const progress = def.duration > 0 ? Math.min(1, state.progress + dt / def.duration) : 1;
	set(state, 'RUNNING', null, progress);
	if (progress >= 1) finish(ctx);
}

export const ModuleExperiment = defineModule({
	id: 'stock.experiment',
	config: experimentConfigSchema,
	state: (): ExperimentState => ({ status: 'READY', reason: null, progress: 0, sample: null }),
	describe: (config, state) => ({
		experiment: {
			id: config.experiment,
			state: state.status,
			...(state.reason === null ? {} : { reason: state.reason }),
			progress: state.progress
		},
		actions: [
			{
				id: 'run',
				label: config.label ?? 'Run experiment',
				kind: 'trigger',
				enabled:
					state.sample === null && !state.result && !state.spent && state.status !== 'RUNNING',
				...(state.sample !== null
					? { reason: HOLDS_SAMPLE }
					: state.result
						? { reason: HOLDS_RESULT }
						: state.spent
							? { reason: SPENT }
							: {}),
				icon: 'science'
			},
			...(config.held
				? [
						{
							id: 'view',
							label: 'View result',
							kind: 'trigger' as const,
							enabled: !!state.result
						},
						{
							id: 'transmit',
							label: 'Transmit result',
							kind: 'trigger' as const,
							enabled: !!state.result
						},
						{
							id: 'reset',
							label: 'Reset experiment',
							kind: 'trigger' as const,
							enabled: !!state.result || state.spent === true
						}
					]
				: [])
		]
	}),
	update: advance,
	updateOnRails: advance,
	actions: {
		/** Starts a run in an allowed situation; else the module is INVALID with the reason. */
		run: (ctx) => {
			const { state, vessel } = ctx;
			if (state.sample !== null) return set(state, 'INVALID', HOLDS_SAMPLE);
			if (state.result) return set(state, 'INVALID', HOLDS_RESULT);
			if (state.spent) return set(state, 'INVALID', SPENT);
			if (state.status === 'RUNNING' || state.status === 'PAUSED') return;
			const def = experimentOf(ctx);
			const now = vessel.situation();
			if (now === undefined || !def.situations.includes(now)) {
				return set(state, 'INVALID', wrongSituation(now, def), 0);
			}
			set(state, 'RUNNING', null, 0);
		},
		/** A held result is shown by the host from the snapshot (`result`); the sim keeps it as it is. */
		view: () => {},
		/** A held result goes to the vessel's storage at the experiment's transmit factor; the part is spent. */
		transmit: (ctx) => {
			const { state, vessel } = ctx;
			const held = state.result;
			if (!held) return;
			const def = experimentOf(ctx);
			vessel.data.store({
				kind: DataScience.id,
				bits: def.bits ?? 1,
				value: held.value,
				time: vessel.time,
				subject: held.subject,
				meta: { transmitFactor: def.transmitFactor, ...held.meta }
			});
			state.result = null;
			state.spent = true;
			set(state, 'INVALID', SPENT, 0);
		},
		/** Clears a held result or a spent part: ready to run again. */
		reset: (ctx) => {
			ctx.state.result = null;
			ctx.state.spent = false;
			set(ctx.state, 'READY', null, 0);
		}
	},
	/** A crew member takes a held sample (plan 260): the part is ready for a new run. */
	takeSample(ctx) {
		const { state } = ctx;
		if (state.sample === null) return null;
		const sample = state.sample;
		state.sample = null;
		set(state, 'READY', null, 0);
		return sample;
	},
	/** A held sample is credited at recovery, at full value. */
	onRecover(ctx) {
		const { sample, result } = ctx.state;
		if (sample) ctx.vessel.science.credit(sample.subject, sample.value);
		if (result) ctx.vessel.science.credit(result.subject, result.value);
	},
	snapshot: (state) => ({
		status: state.status,
		reason: state.reason,
		progress: state.progress,
		holdsSample: state.sample !== null,
		...(state.result
			? { result: { subject: state.result.subject, value: state.result.value } }
			: {}),
		...(state.spent ? { spent: true } : {})
	})
});

// ---- dossier entries (plan 104, ADR 0180 point 7) ----

export const DossierAtmosphere = defineDossierEntry({
	id: 'stock.atmosphere-profile',
	label: 'Atmosphere profile',
	order: 0,
	fact: 'atmosphere',
	unlock: { situations: [SituationFlyingLow.id, SituationFlyingHigh.id, SituationSpaceLow.id] }
});
export const DossierGravity = defineDossierEntry({
	id: 'stock.gravity',
	label: 'Gravity',
	order: 1,
	fact: 'gravity',
	unlock: { situations: [SituationSpaceLow.id, SituationSpaceHigh.id] }
});
export const DossierSurface = defineDossierEntry({
	id: 'stock.surface',
	label: 'Surface',
	order: 2,
	fact: 'surface',
	unlock: { situations: [SituationLanded.id, SituationSplashed.id] }
});
export const DossierRegions = defineDossierEntry({
	id: 'stock.regions-found',
	label: 'Regions found',
	order: 3,
	fact: 'regions',
	unlock: {}
});
export const DossierResources = defineDossierEntry({
	id: 'stock.resource-hints',
	label: 'Resource hints',
	order: 4,
	fact: 'resources',
	unlock: { experiments: [ExperimentSurfaceSample.id] }
});

export const STOCK_DOSSIER_ENTRIES = [
	DossierAtmosphere,
	DossierGravity,
	DossierSurface,
	DossierRegions,
	DossierResources
] as const;
