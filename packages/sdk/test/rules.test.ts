/** Plan 078 / ADR 0111: a mod defines world rules and presets; the load report lists them. */
import { describe, expect, test } from 'bun:test';
import {
	definePlugin,
	definePreset,
	defineRule,
	loadPlugins,
	PluginError,
	RegistryError
} from '../src/index.ts';

const meta = (id: string) => ({ id, version: '1.0.0', api: '^0.1' });

const pace = defineRule({
	id: 'acme.pace',
	label: 'Mission pace',
	category: 'acme',
	type: 'enum',
	values: ['relaxed', 'normal', 'brutal'],
	default: 'normal',
	presets: { 'acme.easy': 'relaxed' },
	changeable: true
});
const fuel = defineRule({
	id: 'acme.fuel-price',
	label: 'Fuel price',
	category: 'economy',
	type: 'number',
	min: 0,
	max: 10,
	default: 1,
	changeable: true
});
const easy = definePreset({
	id: 'acme.easy',
	label: 'Easy',
	values: { 'acme.fuel-price': 0.5, 'other.not-loaded': true }
});

describe('defineRule and definePreset', () => {
	test('a mod defines a rule and a preset; the load report lists them, by plugin', () => {
		const Acme = definePlugin({
			meta: meta('acme'),
			setup(ctx) {
				ctx.rules.register(pace);
				ctx.rules.register(fuel);
				ctx.presets.register(easy);
			}
		});
		const { report, registries } = loadPlugins([Acme]);
		expect(report.registered.rule).toEqual([
			{ id: 'acme.pace', by: 'acme' },
			{ id: 'acme.fuel-price', by: 'acme' }
		]);
		expect(report.registered.preset).toEqual([{ id: 'acme.easy', by: 'acme' }]);
		expect(registries.rules.get('acme.pace')!.type).toBe('enum');
		expect(registries.presets.get('acme.easy')!.label).toBe('Easy');
	});

	test('a default or preset value that does not fit the type is a registration error', () => {
		const badDefault = definePlugin({
			meta: meta('bad'),
			setup(ctx) {
				ctx.rules.register({ ...fuel, id: 'bad.price', default: 11 });
			}
		});
		expect(() => loadPlugins([badDefault])).toThrow(RegistryError);
		const badEnum = definePlugin({
			meta: meta('bad'),
			setup(ctx) {
				ctx.rules.register({ ...pace, id: 'bad.pace', presets: { 'bad.p': 'insane' } });
			}
		});
		expect(() => loadPlugins([badEnum])).toThrow(/expected one of relaxed, normal, brutal/);
	});

	test("a preset's value for a loaded rule is checked after boot; one for an absent rule is ignored", () => {
		const wrong = definePlugin({
			meta: meta('acme'),
			setup(ctx) {
				ctx.rules.register(fuel);
				ctx.presets.register(
					definePreset({ id: 'acme.wrong', label: 'W', values: { 'acme.fuel-price': 'x' } })
				);
			}
		});
		expect(() => loadPlugins([wrong])).toThrow(PluginError);
		expect(() => loadPlugins([wrong])).toThrow(/preset "acme.wrong".*acme.fuel-price/);
		const ok = definePlugin({
			meta: meta('acme'),
			setup(ctx) {
				ctx.presets.register(easy);
			}
		});
		expect(loadPlugins([ok]).report.registered.preset).toHaveLength(1);
	});
});
