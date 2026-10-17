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
			'stock.electric-charge',
			'stock.liquid-fuel',
			'stock.oxidizer'
		]);
		expect(ids('module')).toEqual([
			'stock.command',
			'stock.control-surface',
			'stock.decoupler',
			'stock.engine',
			'stock.fin',
			'stock.heat-shield',
			'stock.landing-leg',
			'stock.reaction-wheel',
			'stock.resource-container',
			'stock.wing'
		]);
		expect(ids('part')).toEqual([
			'stock.booster',
			'stock.command-pod',
			'stock.control-surface',
			'stock.decoupler',
			'stock.engine-cluster',
			'stock.engine-lv',
			'stock.fin',
			'stock.fuel-line',
			'stock.heat-shield',
			'stock.landing-legs',
			'stock.nose-cone',
			'stock.radial-decoupler',
			'stock.reaction-wheel',
			'stock.strut',
			'stock.tank-medium',
			'stock.tank-small',
			'stock.wing'
		]);
		expect(ids('body')).toEqual(['stock.cinder', 'stock.home']);
		expect(ids('system')).toEqual([]);
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
			'stock.nose-cone',
			'stock.fin',
			'stock.control-surface',
			'stock.wing',
			'stock.strut',
			'stock.fuel-line'
		]);
		for (const part of registries.parts.list()) {
			expect(part.shape, part.id).toBeDefined();
			if (special.has(part.id)) continue;
			expect(Object.keys(part.attach ?? {}).sort(), part.id).toEqual(['bottom', 'top']);
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
			'stock.wing'
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
		expect(home?.atmosphere).toEqual({
			scaleHeight: 5_600,
			surfacePressure: 101_325,
			height: 70_000
		});
		expect(home?.parent).toBeUndefined();
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
