import { describe, expect, test } from 'bun:test';
import { definePlugin, loadPlugins, parseModuleConfig } from '@orbital/sdk';
import {
	HOME_MU,
	STOCK_MISSION_PARTS,
	Stock,
	containerConfigSchema,
	engineConfigSchema
} from '../src/index.ts';
import { loaded } from './helpers.ts';

const { registries, report } = loaded;

describe('stock boots through the loader', () => {
	test('registers exactly the expected ids, all attributed to "stock"', () => {
		const ids = (kind: keyof typeof report.registered) =>
			report.registered[kind].map((e) => e.id).sort();
		expect(ids('resource')).toEqual([
			'stock.ablator',
			'stock.cold-gas',
			'stock.electric-charge',
			'stock.food',
			'stock.liquid-fuel',
			'stock.monopropellant',
			'stock.oxidizer',
			'stock.oxygen',
			'stock.solid-fuel',
			'stock.supplies',
			'stock.water'
		]);
		expect(ids('module')).toEqual([
			'stock.animate',
			'stock.antenna',
			'stock.base-kit',
			'stock.bay',
			'stock.command',
			'stock.control-surface',
			'stock.data-storage',
			'stock.decoupler',
			'stock.docking-port',
			'stock.drill',
			'stock.engine',
			'stock.experiment',
			'stock.fairing',
			'stock.fairing-panel',
			'stock.fin',
			'stock.flag',
			'stock.fuel-cell',
			'stock.heat-shield',
			'stock.helmet',
			'stock.jetpack',
			'stock.landing-leg',
			'stock.launch-clamp',
			'stock.light',
			'stock.paint',
			'stock.parachute',
			'stock.probe-computer',
			'stock.rcs',
			'stock.reaction-wheel',
			'stock.resource-container',
			'stock.robotic',
			'stock.rtg',
			'stock.scrubber',
			'stock.solar-panel',
			'stock.strut',
			'stock.tether-socket',
			'stock.wheel',
			'stock.winch',
			'stock.wing'
		]);
		expect(ids('part')).toEqual([
			'stock.adapter-1250-1875',
			'stock.adapter-1875-2500',
			'stock.adapter-2500-3750',
			'stock.adapter-3750-5000',
			'stock.adapter-5000-7500',
			'stock.adapter-large',
			'stock.adapter-small',
			'stock.airlock',
			'stock.antenna-dish-fold',
			'stock.antenna-relay',
			'stock.antenna-whip-radial',
			'stock.atmosphere-radial',
			'stock.atmosphere-sampler',
			'stock.barometer',
			'stock.barometer-radial',
			'stock.base-kit',
			'stock.battery-large',
			'stock.battery-medium',
			'stock.battery-radial',
			'stock.battery-small',
			'stock.booster',
			'stock.booster-liquid',
			'stock.capsule-cone',
			'stock.capsule-sphere',
			'stock.cargo-bay',
			'stock.command-pod',
			'stock.control-surface',
			'stock.coupler-2',
			'stock.coupler-3',
			'stock.coupler-4',
			'stock.crew-cabin',
			'stock.cupola',
			'stock.data-drive',
			'stock.data-drive-radial',
			'stock.decoupler',
			'stock.decoupler-1875',
			'stock.decoupler-3750',
			'stock.decoupler-5000',
			'stock.decoupler-7500',
			'stock.decoupler-wide',
			'stock.descent-module',
			'stock.dish-antenna',
			'stock.docking-port',
			'stock.docking-port-3750',
			'stock.docking-port-large',
			'stock.docking-port-side',
			'stock.docking-port-small',
			'stock.drag-chute',
			'stock.drill',
			'stock.drogue-chute',
			'stock.engine-cluster',
			'stock.engine-lv',
			'stock.engine-plate-5',
			'stock.engine-plate-8',
			'stock.engine-plate-9',
			'stock.engine-plate-f1',
			'stock.engine-plate-j2',
			'stock.engine-vacuum',
			'stock.engine-vacuum-xl',
			'stock.engine-wide',
			'stock.escape-tower',
			'stock.eva-suit',
			'stock.external-tank',
			'stock.fairing-base',
			'stock.fairing-base-1875',
			'stock.fairing-base-3750',
			'stock.fairing-base-5000',
			'stock.fairing-base-7500',
			'stock.fairing-base-large',
			'stock.fairing-base-small',
			'stock.fairing-panel',
			'stock.fin',
			'stock.flag',
			'stock.flotation-collar',
			'stock.fuel-cell',
			'stock.fuel-line',
			'stock.goo-canister',
			'stock.goo-radial',
			'stock.hab-module',
			'stock.heat-shield',
			'stock.heat-shield-1875',
			'stock.heat-shield-3750',
			'stock.heat-shield-5000',
			'stock.heat-shield-wide',
			'stock.hinge-m',
			'stock.hinge-s',
			'stock.hub',
			'stock.lab-module',
			'stock.ladder',
			'stock.lander-ascent',
			'stock.lander-can',
			'stock.lander-descent',
			'stock.landing-leg-single',
			'stock.landing-legs',
			'stock.lattice-interstage',
			'stock.launch-clamp',
			'stock.life-support-pack',
			'stock.life-support-radial',
			'stock.light-angled',
			'stock.light-flood',
			'stock.light-nav-green',
			'stock.light-nav-red',
			'stock.light-nav-white',
			'stock.light-panel',
			'stock.light-spot',
			'stock.magnetometer-boom',
			'stock.materials-bay',
			'stock.materials-radial',
			'stock.monoprop-radial',
			'stock.monoprop-tank',
			'stock.nose-cone',
			'stock.nose-cone-1875',
			'stock.nose-cone-3750',
			'stock.nose-cone-5000',
			'stock.nose-cone-7500',
			'stock.nose-cone-large',
			'stock.nose-cone-medium',
			'stock.nose-cone-small',
			'stock.orbital-module',
			'stock.orbiter-aft',
			'stock.orbiter-bay',
			'stock.orbiter-gear',
			'stock.orbiter-gear-nose',
			'stock.orbiter-nose',
			'stock.parachute',
			'stock.parachute-ring',
			'stock.payload-petals',
			'stock.petal-panel-0',
			'stock.petal-panel-1',
			'stock.petal-panel-2',
			'stock.petal-panel-3',
			'stock.piston-m',
			'stock.piston-s',
			'stock.pod-3',
			'stock.probe-core',
			'stock.radial-decoupler',
			'stock.radial-parachute',
			'stock.radiator',
			'stock.rcs-block',
			'stock.rcs-block-5',
			'stock.rcs-cold-gas',
			'stock.rcs-linear',
			'stock.rcs-pair',
			'stock.reaction-wheel',
			'stock.rotor-s',
			'stock.rover-cab',
			'stock.rover-chassis',
			'stock.rover-wheel-l',
			'stock.rover-wheel-m',
			'stock.rover-wheel-m-steer',
			'stock.rover-wheel-s',
			'stock.rover-wheel-s-steer',
			'stock.rtg',
			'stock.rtg-radial',
			'stock.satellite-bus',
			'stock.scrubber',
			'stock.scrubber-radial',
			'stock.seismometer',
			'stock.seismometer-radial',
			'stock.service-bay',
			'stock.service-bay-wide',
			'stock.servo-m',
			'stock.servo-s',
			'stock.solar-array-large',
			'stock.solar-array-xl',
			'stock.solar-flat',
			'stock.solar-fold',
			'stock.solar-panel',
			'stock.solar-panel-fixed',
			'stock.solar-wings',
			'stock.srb-large',
			'stock.srb-small',
			'stock.srb-xl',
			'stock.strut',
			'stock.surface-sampler',
			'stock.surface-sampler-radial',
			'stock.tail-cone-large',
			'stock.tail-cone-medium',
			'stock.tail-cone-small',
			'stock.tank-0625',
			'stock.tank-1875',
			'stock.tank-1875-short',
			'stock.tank-3750',
			'stock.tank-3750-long',
			'stock.tank-3750-short',
			'stock.tank-5000',
			'stock.tank-5000-long',
			'stock.tank-5000-short',
			'stock.tank-7500',
			'stock.tank-7500-long',
			'stock.tank-medium',
			'stock.tank-small',
			'stock.tank-wide',
			'stock.tank-wide-short',
			'stock.telescope',
			'stock.tether-socket',
			'stock.thermometer',
			'stock.thermometer-radial',
			'stock.truss',
			'stock.wheel',
			'stock.wheel-steer',
			'stock.whip-antenna',
			'stock.winch',
			'stock.wing',
			'stock.wing-delta'
		]);
		expect(ids('body')).toEqual([
			'stock.bastion',
			'stock.cinder',
			'stock.flick',
			'stock.forge',
			'stock.glim',
			'stock.home',
			'stock.husk',
			'stock.kiln',
			'stock.mote',
			'stock.ochre',
			'stock.rime',
			'stock.sun',
			'stock.tempest',
			'stock.vagrant',
			'stock.vesper'
		]);
		expect(ids('system')).toEqual([]);
		expect(ids('situation')).toEqual([
			'stock.flying-high',
			'stock.flying-low',
			'stock.landed',
			'stock.space-high',
			'stock.space-low',
			'stock.splashed'
		]);
		expect(ids('dossier-entry')).toEqual([
			'stock.atmosphere-profile',
			'stock.gravity',
			'stock.regions-found',
			'stock.resource-hints',
			'stock.surface'
		]);
		expect(ids('experiment')).toEqual([
			'stock.atmosphere-sample',
			'stock.goo',
			'stock.magnetometer',
			'stock.materials',
			'stock.observation',
			'stock.pressure',
			'stock.seismic',
			'stock.surface-sample',
			'stock.temperature'
		]);
		expect(ids('antenna')).toEqual(['stock.dish', 'stock.suit-radio', 'stock.whip']);
		expect(ids('data-kind')).toEqual([
			'stock.bulk',
			'stock.command',
			'stock.image',
			'stock.science',
			'stock.telemetry',
			'stock.voice'
		]);
		for (const kind of Object.keys(report.registered) as (keyof typeof report.registered)[]) {
			expect(report.registered[kind].every((e) => e.by === 'stock')).toBe(true);
		}
		expect(report.order).toEqual(['stock']);
		expect(report.disabled).toEqual([]);
	});

	test('every module config in every part validates against its module schema', () => {
		for (const part of registries.parts.list()) {
			for (const [moduleId, config] of part.modules ?? []) {
				const module = registries.modules.get(moduleId);
				expect(module, `${part.id} uses unknown module ${moduleId}`).toBeDefined();
				if (!module) continue;
				const parsed = parseModuleConfig(module, config);
				expect(parsed.ok, `${part.id}/${moduleId}`).toBe(true);
			}
		}
	});

	test('every resource a container or engine refers to is registered', () => {
		const used = new Set<string>();
		for (const part of registries.parts.list()) {
			for (const [moduleId, config] of part.modules ?? []) {
				if (moduleId === 'stock.resource-container') {
					for (const r of Object.keys(containerConfigSchema.parse(config).contents)) used.add(r);
				}
				if (moduleId === 'stock.heat-shield') used.add('stock.ablator');
				if (moduleId === 'stock.engine') {
					for (const p of engineConfigSchema.parse(config).propellants) used.add(p.resource);
				}
			}
		}
		expect([...used].sort()).toEqual(
			registries.resources
				.list()
				.map((r) => r.id)
				.sort()
		);
	});

	test('every part has a shape; stack parts have top and bottom nodes along local Y', () => {
		// Radial hardware (ADR 0034) and the cone have their own node sets, checked below.
		const special = new Set([
			'stock.radial-decoupler',
			'stock.booster',
			'stock.booster-liquid',
			// solid motors: top and radial, the nozzle at the bottom (plan 210)
			'stock.srb-small',
			'stock.srb-large',
			// the launch clamp: one radial node (plan 210)
			'stock.launch-clamp',
			// a thrown-off fairing panel has no nodes (plan 219), nor a thrown-off petal (plan 345)
			'stock.fairing-panel',
			'stock.petal-panel-0',
			'stock.petal-panel-1',
			'stock.petal-panel-2',
			'stock.petal-panel-3',
			'stock.rcs-block',
			'stock.rcs-cold-gas',
			// the RCS thrusters of plan 277
			'stock.rcs-block-5',
			'stock.rcs-pair',
			'stock.rcs-linear',
			'stock.monoprop-radial',
			'stock.nose-cone',
			'stock.nose-cone-small',
			'stock.nose-cone-medium',
			'stock.nose-cone-large',
			// the nose cones of plan 289
			'stock.nose-cone-1875',
			'stock.nose-cone-3750',
			'stock.nose-cone-5000',
			'stock.nose-cone-7500',
			'stock.tail-cone-small',
			'stock.tail-cone-medium',
			'stock.tail-cone-large',
			'stock.fin',
			'stock.control-surface',
			'stock.wing',
			'stock.strut',
			'stock.fuel-line',
			'stock.wheel',
			'stock.wheel-steer',
			// rover wheels hang radially; the deck has a third node on its top face (plan 307)
			'stock.rover-wheel-s',
			'stock.rover-wheel-s-steer',
			'stock.rover-wheel-m',
			'stock.rover-wheel-m-steer',
			'stock.rover-wheel-l',
			'stock.rover-chassis',
			// a chute's only node is its bottom one, or a radial one (plan 209)
			'stock.parachute',
			'stock.drogue-chute',
			'stock.radial-parachute',
			// a ladder hangs radially (plan 225)
			'stock.ladder',
			// lights hang radially (plans 242, 311)
			'stock.light-spot',
			'stock.light-flood',
			'stock.light-panel',
			'stock.light-angled',
			'stock.light-nav-red',
			'stock.light-nav-green',
			'stock.light-nav-white',
			// a side port: a docking face on its side (plan 356)
			'stock.docking-port-side',
			// tether parts hang radially (plan 313)
			'stock.winch',
			'stock.tether-socket',
			// the orbiter's gear and brake chute hang radially (plan 361)
			'stock.orbiter-gear',
			'stock.orbiter-gear-nose',
			'stock.drag-chute'
		]);
		// the mission parts of plans 276–300 with other node sets: radial-only, bottom-only, a
		// hub's side ports, a coupler's several bottoms
		for (const p of STOCK_MISSION_PARTS) {
			const keys = Object.keys(p.attach ?? {})
				.sort()
				.join(',');
			if (keys !== 'bottom,top') special.add(p.id);
		}
		for (const part of registries.parts.list()) {
			expect(part.shape, part.id).toBeDefined();
			if (special.has(part.id)) continue;
			// a fairing base also has the interstage node at its shell top (plan 243)
			const nodes = Object.keys(part.attach ?? {})
				.filter((n) => part.attach![n]!.shellTop === undefined)
				.sort();
			expect(nodes, part.id).toEqual(['bottom', 'top']);
			const { top, bottom } = part.attach ?? {};
			expect(top?.dir).toEqual([0, 1, 0]);
			expect(bottom?.dir).toEqual([0, -1, 0]);
			if (part.shape?.kind === 'cylinder') {
				expect(top?.pos[1], part.id).toBeCloseTo(part.shape.height / 2, 12);
				expect(bottom?.pos[1], part.id).toBeCloseTo(-part.shape.height / 2, 12);
			}
		}
	});

	test('radial hardware: horizontal radial nodes on the shape face, booster top node, cone bottom', () => {
		const get = (id: string) => registries.parts.get(id)!;
		for (const id of [
			'stock.radial-decoupler',
			'stock.booster',
			'stock.fin',
			'stock.control-surface',
			'stock.wing',
			'stock.wheel',
			'stock.wheel-steer'
		]) {
			const radial = get(id).attach!.radial!;
			expect(radial.dir, id).toEqual([-1, 0, 0]);
			expect(radial.pos[1]).toBe(0);
			const shape = get(id).shape!;
			const half = shape.kind === 'box' ? shape.size[0] / 2 : shape.radius;
			expect(radial.pos[0], id).toBeCloseTo(-half, 12);
		}
		expect(get('stock.radial-decoupler').attach!.outer!.dir).toEqual([1, 0, 0]);
		expect(get('stock.booster').attach!.top!.pos[1]).toBeCloseTo(1.6, 12);
		expect(Object.keys(get('stock.nose-cone').attach!)).toEqual(['bottom']);
		expect(get('stock.nose-cone').dragCoefficient).toBeLessThan(0.3);
	});

	test('home body matches the plan numbers', () => {
		const home = registries.bodies.get('stock.home');
		expect(home?.radius).toBe(600_000);
		expect(home?.rotationPeriod).toBe(21_600);
		expect(home?.atmosphere).toMatchObject({
			scaleHeight: 5_600,
			surfacePressure: 101_325,
			height: 70_000
		});
		// the 1976 standard atmosphere's layers to the top of the air (plan 212)
		expect(home?.atmosphere?.temperatureCurve?.[0]).toEqual([0, 288.15]);
		expect(home?.atmosphere?.temperatureCurve?.at(-1)).toEqual([71_000, 214.65]);
		// the home planet orbits the Sun since plan 122 (ADR 0119)
		expect(home?.parent).toBe('stock.sun');
		expect(6.6743e-11 * (home?.mass ?? 0)).toBeCloseTo(HOME_MU, -3);
		expect(HOME_MU).toBe(3.5316e12);
		const g = HOME_MU / 600_000 ** 2;
		expect(g).toBeGreaterThan(9.8);
		expect(g).toBeLessThan(9.82);
	});

	test('a plugin depending on stock gets its typed API in ctx; others do not', () => {
		let thrust = 0;
		const Consumer = definePlugin({
			meta: { id: 'test.consumer', version: '1.0.0', api: '^0.1' },
			depends: [Stock],
			setup(ctx) {
				const engine = ctx.stock.engineOutput(
					{
						thrust: 100,
						ispVacuum: 300,
						ispSeaLevel: 300,
						propellants: [{ resource: 'stock.liquid-fuel', ratio: 1 }]
					},
					{ ignited: true, throttle: 1, flameout: false },
					0
				);
				thrust = engine.thrust;
			}
		});
		const Unrelated = definePlugin({
			meta: { id: 'test.unrelated', version: '1.0.0', api: '^0.1' },
			setup(ctx) {
				// @ts-expect-error -- not a dependency, so not on ctx
				void ctx.stock;
			}
		});
		loadPlugins([Stock, Consumer, Unrelated]);
		expect(thrust).toBeCloseTo(100, 9);
	});

	test('a host speaking a newer minor API disables stock with a reason', () => {
		const result = loadPlugins([Stock], { apiVersion: '0.2.0' });
		expect(result.report.disabled.map((d) => d.id)).toEqual(['stock']);
	});
});

describe('stock bodies name their terrain (plan 052, ADR 0067)', () => {
	test('the home planet has hills and the moon craters', () => {
		expect(registries.bodies.get('stock.home' as never)?.terrain).toEqual({ kind: 'hills' });
		expect(registries.bodies.get('stock.cinder' as never)?.terrain).toEqual({ kind: 'craters' });
	});
});

describe('stock data kinds (plan 083)', () => {
	test('six kinds in ADR 0101 priority order: command first (plan 119)', () => {
		const kinds = registries.dataKinds.list().sort((a, b) => a.priority - b.priority);
		expect(kinds.map((k) => k.id)).toEqual([
			'stock.command',
			'stock.telemetry',
			'stock.voice',
			'stock.science',
			'stock.image',
			'stock.bulk'
		]);
	});

	test('the EVA suit and the flag are not catalogue parts; the ladder is (plan 255)', () => {
		const hidden = (id: string) => loaded.registries.parts.get(id)!.catalog?.hidden === true;
		expect(hidden('stock.eva-suit')).toBe(true);
		expect(hidden('stock.flag')).toBe(true);
		expect(hidden('stock.ladder')).toBe(false);
	});
});
