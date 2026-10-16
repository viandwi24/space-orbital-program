import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { RegistryError, createRegistries, createRegistry } from '../src/index.ts';

describe('registry', () => {
	test('register / get / has / list / owner', () => {
		const r = createRegistry<{ id: string; n: number }>('thing');
		r.register({ id: 'a.one', n: 1 }, 'a');
		r.register({ id: 'b.two', n: 2 }, 'b');
		expect(r.get('a.one')).toEqual({ id: 'a.one', n: 1 });
		expect(r.has('b.two')).toBe(true);
		expect(r.has('nope.x')).toBe(false);
		expect(r.get('nope.x')).toBeUndefined();
		expect(r.list().map((d) => d.id)).toEqual(['a.one', 'b.two']);
		expect(r.owner('b.two')).toBe('b');
		expect(r.entries().map((e) => e.by)).toEqual(['a', 'b']);
	});

	test('duplicate id throws naming both plugins', () => {
		const r = createRegistry<{ id: string }>('part');
		r.register({ id: 'stock.tank' }, 'stock');
		let err: unknown;
		try {
			r.register({ id: 'stock.tank' }, 'acme.rival');
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(RegistryError);
		const message = (err as RegistryError).message;
		expect(message).toContain('"stock"');
		expect(message).toContain('"acme.rival"');
		expect(message).toContain('stock.tank');
		expect((err as RegistryError).existingBy).toBe('stock');
		expect((err as RegistryError).attemptedBy).toBe('acme.rival');
	});

	test('definitions are frozen deeply on register', () => {
		const r = createRegistry<{ id: string; tags: string[]; nested: { v: number } }>('thing');
		const def = r.register({ id: 'a.x', tags: ['t'], nested: { v: 1 } }, 'a');
		expect(Object.isFrozen(def)).toBe(true);
		expect(Object.isFrozen(def.tags)).toBe(true);
		expect(Object.isFrozen(def.nested)).toBe(true);
		expect(() => {
			def.nested.v = 2;
		}).toThrow();
		expect(() => def.tags.push('u')).toThrow();
	});

	test('class instances (zod schemas) inside a definition are not frozen', () => {
		const r = createRegistries();
		const schema = z.object({ thrust: z.number() });
		const def = r.modules.register({ id: 'stock.engine', config: schema }, 'stock');
		expect(Object.isFrozen(def)).toBe(true);
		expect(Object.isFrozen(schema)).toBe(false);
		expect(schema.safeParse({ thrust: 1 }).success).toBe(true);
	});

	test('rejects malformed ids and names the plugin', () => {
		const r = createRegistry<{ id: string }>('part');
		expect(() => r.register({ id: 'Bad_Id' }, 'acme')).toThrow(/"acme"/);
		expect(() => r.register({ id: 'noprefix' }, 'acme')).toThrow(/Invalid|expected/);
	});

	test('schema-backed registries validate data definitions', () => {
		const r = createRegistries();
		r.resources.register(
			{ id: 'stock.liquid-fuel', density: 5, flowMode: 'stack', unit: 'L' },
			'stock'
		);
		expect(() =>
			r.resources.register({ id: 'stock.bad', density: -1, flowMode: 'stack', unit: 'L' }, 'acme')
		).toThrow(/density/);
		r.bodies.register(
			{ id: 'stock.home', mass: 5.97e24, radius: 6.371e6, rotationPeriod: 86164 },
			'stock'
		);
		r.parts.register({ id: 'stock.pod', title: 'Pod', mass: 800 }, 'stock');
		expect(() => r.parts.register({ id: 'stock.neg', title: 'x', mass: -1 }, 'stock')).toThrow(
			/mass/
		);
	});
});
