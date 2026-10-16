/**
 * Stage delta-v for a third-party mod (plan 024, ADR 0033): its own resource, engine module,
 * separator module and parts, no stock engine or decoupler anywhere. Only the command pod and the
 * generic resource container come from stock. Numbers are written out by hand.
 */
import { loadPlugins, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import {
	SEA_LEVEL_PRESSURE,
	defineModule,
	definePart,
	definePlugin,
	defineResource,
	z
} from '@orbital/sdk';
import { describe, expect, it } from 'vitest';
import {
	entityIndexMap,
	stageDeltaV,
	stagingModelFromDesign,
	stagingModelFromSnapshot,
	type ContentLookups
} from './delta-v';
import { autoStages } from './editor/staging';

const Xenon = defineResource({ id: 'acme.xenon', density: 2, flowMode: 'stack', unit: 'u' });

/** An engine with its own config: thrust in vacuum and in air, flow in kg/s. No `update`: tools only. */
const IonDrive = defineModule({
	id: 'acme.ion-drive',
	config: z.object({
		vacuumThrust: z.number().positive(),
		seaLevelThrust: z.number().positive(),
		flow: z.number().positive()
	}),
	state: () => ({ ignited: false, flameout: false }),
	describe: (config, state) => ({
		engine: {
			massFlow: config.flow,
			thrust: [
				{ pressure: 0, thrust: config.vacuumThrust },
				{ pressure: SEA_LEVEL_PRESSURE, thrust: config.seaLevelThrust }
			],
			propellants: [{ resource: Xenon.id, ratio: 1 }],
			ignited: state.ignited,
			flameout: state.flameout
		}
	}),
	onStage: (ctx) => {
		ctx.state.ignited = true;
	},
	snapshot: (state) => ({ ...state })
});

/** A separator that severs whichever node the part says. */
const Clamp = defineModule({
	id: 'acme.clamp',
	config: z.object({ cuts: z.enum(['top', 'bottom']).default('bottom') }),
	state: () => ({ open: false }),
	describe: (config, state) => ({ separator: { node: config.cuts, done: state.open } }),
	onStage: (ctx) => {
		ctx.state.open = true;
		ctx.vessel.detach(ctx.config.cuts, 100);
	},
	snapshot: (state) => ({ ...state })
});

const nodes = (height: number) => ({
	top: {
		pos: [0, height / 2, 0] as [number, number, number],
		dir: [0, 1, 0] as [number, number, number]
	},
	bottom: {
		pos: [0, -height / 2, 0] as [number, number, number],
		dir: [0, -1, 0] as [number, number, number]
	}
});
const shape = { kind: 'cylinder', radius: 0.5, height: 1 } as const;

const Acme = definePlugin({
	meta: { id: 'acme.ion', name: 'Acme ion drives', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.resources.register(Xenon);
		ctx.modules.register(IonDrive);
		ctx.modules.register(Clamp);
		ctx.parts.register(
			definePart({
				id: 'acme.drive',
				title: 'Ion drive',
				mass: 100,
				crossfeed: false,
				shape,
				attach: nodes(1),
				// Per-part config: the same module, two different engines below.
				modules: [[IonDrive, { vacuumThrust: 20_000, seaLevelThrust: 12_000, flow: 8 }]]
			})
		);
		ctx.parts.register(
			definePart({
				id: 'acme.drive-small',
				title: 'Small ion drive',
				mass: 100,
				crossfeed: false,
				shape,
				attach: nodes(1),
				modules: [[IonDrive, { vacuumThrust: 10_000, seaLevelThrust: 9_000, flow: 4 }]]
			})
		);
		ctx.parts.register(
			definePart({
				id: 'acme.clamp',
				title: 'Release clamp',
				mass: 20,
				crossfeed: false,
				shape,
				attach: nodes(1),
				modules: [[Clamp, { cuts: 'bottom' }]]
			})
		);
		ctx.parts.register({
			id: 'acme.tank',
			title: 'Xenon tank',
			mass: 50,
			shape,
			attach: nodes(1),
			modules: [['stock.resource-container', { contents: { [Xenon.id]: { capacity: 100 } } }]]
		});
	}
});

const { registries } = loadPlugins([Stock, Acme]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

/** pod - tank - small drive - clamp - tank - drive: the clamp drops the lower tank and drive. */
const design: VesselDesign = {
	formatVersion: 1,
	name: 'ion',
	parts: [
		{ index: 0, part: partId('stock.command-pod'), parent: null },
		...(
			[
				[1, 'acme.tank'],
				[2, 'acme.drive-small'],
				[3, 'acme.clamp'],
				[4, 'acme.tank'],
				[5, 'acme.drive']
			] as const
		).map(([index, part]) => ({
			index,
			part: partId(part),
			parent: { index: index - 1, parentNode: 'bottom', node: 'top' }
		}))
	],
	stages: [[5], [2, 3]]
};

// By hand: xenon is 2 kg per unit, a tank holds 100 u = 200 kg, dry masses from the parts, the pod
// carries 50 EC at 1e-6 kg each.
const POD = 840 + 50e-6;
const lower = 50 + 200 + 100; // tank + drive
const upper = 50 + 200 + 100 + 20; // tank + small drive + clamp
const m0a = POD + upper + lower;
const m1a = m0a - 200; // 8 kg/s for 25 s
const m0b = POD + upper;
const m1b = m0b - 200; // 4 kg/s for 50 s
const dv = (thrust: number, flow: number, m0: number, m1: number): number =>
	(thrust / flow) * Math.log(m0 / m1);
const close = (got: number, want: number): void =>
	expect(Math.abs(got / want - 1)).toBeLessThan(1e-9);

describe('a mod with its own engine and separator (ADR 0033)', () => {
	it('stages them automatically: the engine below the clamp first, then the clamp with the upper engine', () => {
		expect(autoStages({ ...design, stages: [] }, content)).toEqual([[5], [2, 3]]);
	});

	it('gets per-stage vacuum and sea-level delta-v equal to Tsiolkovsky by hand', () => {
		const report = stageDeltaV(stagingModelFromDesign(design, content));
		expect(report.stages.map((s) => s.stage)).toEqual([0, 1]);
		const [a, b] = report.stages;
		close(a!.dvVacuum, dv(20_000, 8, m0a, m1a));
		close(a!.dvSeaLevel, dv(12_000, 8, m0a, m1a));
		close(b!.dvVacuum, dv(10_000, 4, m0b, m1b));
		close(b!.dvSeaLevel, dv(9_000, 4, m0b, m1b));
		expect(a!.burnTime).toBeCloseTo(25, 9);
		expect(b!.burnTime).toBeCloseTo(50, 9);
		expect(a!.thrustVacuum).toBe(20_000);
		expect(b!.thrustSeaLevel).toBe(9_000);
		expect(a!.massStart).toBeCloseTo(m0a, 9);
		expect(b!.massStart).toBeCloseTo(m0b, 9);
		close(report.totalVacuum, dv(20_000, 8, m0a, m1a) + dv(10_000, 4, m0b, m1b));
	});

	it('follows a live snapshot: the lit drive, half its xenon gone', () => {
		const ids = [10, 11, 12, 13, 14, 15];
		const vessel = {
			parts: ids.map((id, i) => ({
				id,
				definition: design.parts[i]!.part,
				position: { x: 0, y: 0, z: 0 },
				modules:
					i === 4
						? { 'stock.resource-container': { amounts: { [Xenon.id]: 50 } } }
						: i === 5
							? { 'acme.ion-drive': { ignited: true, flameout: false } }
							: {}
			}))
		};
		const map = entityIndexMap(design, vessel as never);
		const live = stageDeltaV(stagingModelFromSnapshot(design, content, vessel as never, map), 1);
		expect(live.stages[0]).toMatchObject({ stage: 0, current: true });
		const half = POD + upper + (50 + 100 + 100);
		close(live.stages[0]!.dvVacuum, dv(20_000, 8, half, half - 100));
		expect(live.stages[1]!.stage).toBe(1);
	});
});
