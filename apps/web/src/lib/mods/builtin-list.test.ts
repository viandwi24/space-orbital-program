import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import { builtinModRows } from './builtin-list';

describe('builtinModRows', () => {
	it('lists every built-in plugin with its title and version', () => {
		const rows = builtinModRows(BUILTIN_PLUGINS);
		expect(rows.map((r) => r.id)).toEqual(BUILTIN_PLUGINS.map((p) => p.meta.id));
		const stock = rows.find((r) => r.id === 'stock');
		expect(stock?.title).toBe('Orbital stock content');
		expect(stock?.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(stock?.description).toBeTruthy();
	});

	it('falls back to the id when a plugin has no title', () => {
		const rows = builtinModRows([
			{ meta: { id: 'acme.x', version: '1.0.0', api: '^0.1' }, setup: () => {} } as never
		]);
		expect(rows[0]).toEqual({ id: 'acme.x', title: 'acme.x', version: '1.0.0', api: '^0.1' });
	});
});
