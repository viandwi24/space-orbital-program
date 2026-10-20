import { describe, expect, test } from 'bun:test';
import { definePlugin, loadPlugins, parseModuleConfig } from '@orbital/sdk';
import { HOME_MU, Stock, containerConfigSchema, engineConfigSchema } from '../src/index.ts';
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
			'stock.antenna',
			'stock.base-kit',
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
			'stock.heat-shield',
			'stock.helmet',
			'stock.jetpack',
			'stock.landing-leg',
			'stock.launch-clamp',
			'stock.parachute',
			'stock.probe-computer',
			'stock.rcs',
			'stock.reaction-wheel',
			'stock.resource-container',
			'stock.rtg',
			'stock.scrubber',
			'stock.solar-panel',
			'stock.wheel',
			'stock.wing'
		]);
		expect(ids('part')).toEqual([
			'stock.adapter-large',
			'stock.adapter-small',
			'stock.atmosphere-sampler',
			'stock.barometer',
			'stock.base-kit',
			'stock.battery-large',
			'stock.battery-medium',
			'stock.battery-small',
			'stock.booster',
			'stock.booster-liquid',
			'stock.command-pod',
			'stock.control-surface',
			'stock.data-drive',
			'stock.decoupler',
			'stock.decoupler-wide',
			'stock.dish-antenna',
			'stock.docking-port',
			'stock.docking-port-large',
			'stock.docking-port-small',
			'stock.drill',
			'stock.drogue-chute',
			'stock.engine-cluster',
			'stock.engine-lv',
			'stock.engine-vacuum',
			'stock.engine-wide',
			'stock.eva-suit',
			'stock.fairing-base',
			'stock.fairing-base-large',
			'stock.fairing-base-small',
			'stock.fairing-panel',
			'stock.fin',
			'stock.flag',
			'stock.flotation-collar',
			'stock.fuel-line',
			'stock.goo-canister',
			'stock.heat-shield',
			'stock.heat-shield-wide',
			'stock.ladder',
			'stock.landing-legs',
			'stock.launch-clamp',
			'stock.life-support-pack',
			'stock.materials-bay',
			'stock.monoprop-radial',
			'stock.monoprop-tank',
			'stock.nose-cone',
			'stock.nose-cone-large',
			'stock.nose-cone-medium',
			'stock.nose-cone-small',
			'stock.parachute',
			'stock.probe-core',
			'stock.radial-decoupler',
			'stock.radial-parachute',
			'stock.rcs-block',
			'stock.rcs-cold-gas',
			'stock.reaction-wheel',
			'stock.rtg',
			'stock.scrubber',
			'stock.seismometer',
			'stock.solar-array-large',
			'stock.solar-panel',
			'stock.solar-panel-fixed',
			'stock.srb-large',
			'stock.srb-small',
			'stock.strut',
			'stock.surface-sampler',
			'stock.tail-cone-large',
			'stock.tail-cone-medium',
			'stock.tail-cone-small',
			'stock.tank-medium',
			'stock.tank-small',
			'stock.tank-wide',
			'stock.tank-wide-short',
			'stock.thermometer',
			'stock.wheel',
			'stock.wheel-steer',
			'stock.whip-antenna',
			'stock.wing'
		]);
		expect(ids('body')).toEqual(['stock.cinder', 'stock.home', 'stock.sun']);
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
			'stock.materials',
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
			// a thrown-off fairing panel has no nodes (plan 219)
			'stock.fairing-panel',
			'stock.rcs-block',
			'stock.rcs-cold-gas',
			'stock.monoprop-radial',
			'stock.nose-cone',
			'stock.nose-cone-small',
			'stock.nose-cone-medium',
			'stock.nose-cone-large',
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
			// a chute's only node is its bottom one, or a radial one (plan 209)
			'stock.parachute',
			'stock.drogue-chute',
			'stock.radial-parachute',
			// a ladder hangs radially (plan 225)
			'stock.ladder'
		]);
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
});
